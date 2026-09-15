"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { withDbRetry } from "@/db/retry";
import { catMediosPago } from "@/db/schema/catalogs";
import { sucursales } from "@/db/schema/core";
import {
  cortesCaja,
  detalleCortes,
  detalleVentasMediosPagos,
  MOVIMIENTO_CAJA_TIPOS,
  movimientosCaja,
  ventas,
} from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { assertBranchScope, canAccessBranch, checkPermission } from "@/lib/auth/authorization";
import { calcularEsperadoMedio, medioDelFondo } from "@/modules/caja";

const abrirSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  fondoInicial: z.coerce.number().min(0).max(999999).default(0),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CajaActionState = ActionState<{ corteId: string }>;

/** Abre un corte de caja para la sucursal. Rechaza si ya hay uno abierto. */
export async function abrirCaja(_previousState: CajaActionState, formData: FormData): Promise<CajaActionState> {
  const parsed = parseWithSchema(abrirSchema, Object.fromEntries(formData.entries()), "Revisa los datos de apertura.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "caja.abrir");
  if (!access) return actionError("No tienes permiso para abrir caja.");
  const { user } = access;
  const sucursalValida = await assertBranchScope(access, input.sucursalId);
  if (!sucursalValida) return actionError("La sucursal no existe, está inactiva o no tienes acceso a ella.");
  const db = getDatabase();

  const [abierto] = await db
    .select({ id: cortesCaja.id })
    .from(cortesCaja)
    .where(and(eq(cortesCaja.sucursalId, input.sucursalId), eq(cortesCaja.estado, "abierto"), eq(cortesCaja.activo, true)))
    .limit(1);
  if (abierto) return actionError("Ya hay un corte abierto en esta sucursal.");

  let corte: { id: string };
  try {
    [corte] = await withDbRetry(() =>
      db
        .insert(cortesCaja)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: user.id,
          fondoInicial: input.fondoInicial.toFixed(2),
          notas: input.notas || null,
          createdBy: user.id,
        })
        .returning({ id: cortesCaja.id }),
    );
  } catch (error) {
    // Índice único parcial: dos aperturas concurrentes en la misma sucursal.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") {
      return actionError("Ya hay un corte abierto en esta sucursal.");
    }
    throw error;
  }

  await auditEvent(db, {
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: user.id,
    accion: "caja.abierta",
    entidad: "corte",
    entidadId: corte.id,
    detalle: { fondoInicial: input.fondoInicial },
  });
  revalidatePath("/admin/caja");
  return actionSuccess("Caja abierta.", { corteId: corte.id });
}

const cerrarSchema = z.object({
  organizacionId: z.string().uuid(),
  corteId: z.string().uuid(),
  /** JSON { medioPagoId: montoContado } declarado por el cajero (ciego). */
  conteos: z.string().min(2),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * Cierre ciego: el cajero declara cuánto hay por medio de pago sin ver el
 * esperado. Al confirmar se calcula esperado (ventas del corte por medio +
 * fondo inicial en efectivo), se persisten las diferencias y se cierra.
 */
export async function cerrarCaja(_previousState: CajaActionState, formData: FormData): Promise<CajaActionState> {
  const parsed = parseWithSchema(cerrarSchema, Object.fromEntries(formData.entries()), "Revisa los datos del cierre.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const conteosRaw = z.record(z.string().uuid(), z.coerce.number().min(0).max(999999)).safeParse(JSON.parse(input.conteos));
  if (!conteosRaw.success) return actionError("Conteo inválido.");
  const conteos = conteosRaw.data;

  const access = await checkPermission(input.organizacionId, "caja.cerrar");
  if (!access) return actionError("No tienes permiso para cerrar caja.");
  const { user } = access;
  const db = getDatabase();

  const corte = await withDbRetry(() =>
    db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(cortesCaja)
      .where(and(eq(cortesCaja.id, input.corteId), eq(cortesCaja.organizacionId, input.organizacionId), eq(cortesCaja.activo, true)))
      .limit(1)
      .for("update");
    if (!row || row.estado !== "abierto") return null;
    if (!canAccessBranch(access, row.sucursalId)) return "sin-acceso" as const;

    const medios = await tx
      .select({ id: catMediosPago.id, categoria: catMediosPago.categoria })
      .from(catMediosPago)
      .where(and(eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.activo, true)));

    // `monto` = lo aplicado a la venta (en efectivo excluye el cambio dado).
    const cobradoPorMedio = await tx
      .select({
        medioPagoId: detalleVentasMediosPagos.medioPagoId,
        total: sql<string>`coalesce(sum(${detalleVentasMediosPagos.monto}), 0)`,
      })
      .from(detalleVentasMediosPagos)
      .innerJoin(ventas, eq(detalleVentasMediosPagos.ventaId, ventas.id))
      .where(
        and(
          eq(ventas.corteId, row.id),
          eq(detalleVentasMediosPagos.activo, true),
          eq(ventas.estado, "completada"),
        ),
      )
      .groupBy(detalleVentasMediosPagos.medioPagoId);
    const cobrado = new Map(cobradoPorMedio.map((item) => [item.medioPagoId, Number(item.total)]));

    const movimientos = await tx
      .select({
        medioPagoId: movimientosCaja.medioPagoId,
        tipo: movimientosCaja.tipo,
        monto: movimientosCaja.monto,
      })
      .from(movimientosCaja)
      .where(eq(movimientosCaja.corteId, row.id));
    const movimientosPorMedio = new Map<string, Array<{ tipo: "entrada" | "retiro" | "gasto" | "deposito" | "ajuste"; monto: number }>>();
    for (const mov of movimientos) {
      const list = movimientosPorMedio.get(mov.medioPagoId) ?? [];
      list.push({ tipo: mov.tipo as "entrada" | "retiro" | "gasto" | "deposito" | "ajuste", monto: Number(mov.monto) });
      movimientosPorMedio.set(mov.medioPagoId, list);
    }

    const fondo = Number(row.fondoInicial);
    const medioFondo = medioDelFondo(medios, cobrado);
    for (const medio of medios) {
      const esperado = calcularEsperadoMedio({
        cobrado: cobrado.get(medio.id) ?? 0,
        fondo: medio.id === medioFondo ? fondo : 0,
        movimientos: movimientosPorMedio.get(medio.id) ?? [],
      });
      const contado = conteos[medio.id] ?? 0;
      await tx.insert(detalleCortes).values({
        corteId: row.id,
        medioPagoId: medio.id,
        esperado: esperado.toFixed(2),
        contado: contado.toFixed(2),
        diferencia: (contado - esperado).toFixed(2),
        createdBy: user.id,
      });
    }

    await tx
      .update(cortesCaja)
      .set({ estado: "cerrado", cerradoAt: new Date(), cerradoPor: user.id, notas: input.notas || row.notas, updatedBy: user.id })
      .where(eq(cortesCaja.id, row.id));
    await auditEvent(tx, {
      organizacionId: input.organizacionId,
      sucursalId: row.sucursalId,
      usuarioId: user.id,
      accion: "caja.cerrada",
      entidad: "corte",
      entidadId: row.id,
      detalle: { fondoInicial: Number(row.fondoInicial), medios: medios.length, movimientos: movimientos.length },
    });
    return row;
    }),
  );

  if (corte === "sin-acceso") return actionError("El corte pertenece a una sucursal sin acceso.");
  if (!corte) return actionError("El corte no existe o ya está cerrado.");
  revalidatePath("/admin/caja");
  return actionSuccess("Caja cerrada. Revisa las diferencias.", { corteId: corte.id });
}

const movimientoSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  tipo: z.enum(MOVIMIENTO_CAJA_TIPOS),
  medioPagoId: z.string().uuid(),
  monto: z.coerce.number().min(-999999).max(999999).refine((v) => v !== 0, "El monto no puede ser cero."),
  notas: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * Registra un movimiento manual sobre el corte abierto de la sucursal:
 * entrada (dinero que entra sin venta), retiro, gasto, depósito o ajuste
 * (el ajuste admite monto negativo). Retiros/gastos/depósitos/ajustes
 * requieren nota; entradas también la aceptan. Son inmutables: una corrección
 * se hace con otro movimiento compensatorio.
 */
export async function registrarMovimientoCaja(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(movimientoSchema, Object.fromEntries(formData.entries()), "Revisa el movimiento.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  if (input.tipo !== "ajuste" && input.monto <= 0) {
    return actionError("El monto debe ser mayor a cero.", { fieldErrors: { monto: ["Monto inválido."] } });
  }
  if (input.tipo === "ajuste" && !input.notas?.trim()) {
    return actionError("Indica el motivo del ajuste.", { fieldErrors: { notas: ["Nota requerida."] } });
  }
  if ((input.tipo === "retiro" || input.tipo === "gasto" || input.tipo === "deposito") && !input.notas?.trim()) {
    return actionError("Indica el motivo del movimiento.", { fieldErrors: { notas: ["Nota requerida."] } });
  }

  const access = await checkPermission(input.organizacionId, "caja.movimientos");
  if (!access) return actionError("No tienes permiso para registrar movimientos de caja.");
  const { user } = access;
  if (!canAccessBranch(access, input.sucursalId)) return actionError("La sucursal no está dentro de tu alcance.");
  const db = getDatabase();

  const outcome = await withDbRetry(() =>
    db.transaction(async (tx) => {
      const [corte] = await tx
        .select({ id: cortesCaja.id })
        .from(cortesCaja)
        .where(
          and(
            eq(cortesCaja.sucursalId, input.sucursalId),
            eq(cortesCaja.organizacionId, input.organizacionId),
            eq(cortesCaja.estado, "abierto"),
            eq(cortesCaja.activo, true),
          ),
        )
        .limit(1)
        .for("update");
      if (!corte) return actionError("No hay un corte abierto en esta sucursal.");

      const [medio] = await tx
        .select({ id: catMediosPago.id, categoria: catMediosPago.categoria })
        .from(catMediosPago)
        .where(and(eq(catMediosPago.id, input.medioPagoId), eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.activo, true)))
        .limit(1);
      if (!medio) return actionError("Medio de pago inválido.");
      if (medio.categoria !== "efectivo") {
        return actionError("Los movimientos manuales solo aplican a medios en efectivo.", {
          fieldErrors: { medioPagoId: ["Selecciona un medio en efectivo."] },
        });
      }

      await tx.insert(movimientosCaja).values({
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        corteId: corte.id,
        medioPagoId: input.medioPagoId,
        tipo: input.tipo,
        monto: input.monto.toFixed(2),
        notas: input.notas?.trim() || null,
        usuarioId: user.id,
        createdBy: user.id,
      });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: user.id,
        accion: "caja.movimiento",
        entidad: "corte",
        entidadId: corte.id,
        detalle: { tipo: input.tipo, monto: input.monto, medioPagoId: input.medioPagoId },
      });
      return actionSuccess("Movimiento registrado.");
    }),
  );

  if (outcome.success) revalidatePath("/admin/caja");
  return outcome;
}

const politicaSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  exigirCorteParaCobrar: z.coerce.boolean(),
});

/**
 * Política de la sucursal: cuando está activa, el POS rechaza cobros si no hay
 * un corte de caja abierto. Solo usuarios con `caja.configurar`.
 */
export async function updatePoliticaCaja(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(politicaSchema, Object.fromEntries(formData.entries()), "Datos inválidos.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "caja.configurar");
  if (!access) return actionError("No tienes permiso para configurar caja.");
  const sucursalValida = await assertBranchScope(access, input.sucursalId);
  if (!sucursalValida) return actionError("La sucursal no existe, está inactiva o no tienes acceso a ella.");

  const db = getDatabase();
  await db
    .update(sucursales)
    .set({ exigirCorteParaCobrar: input.exigirCorteParaCobrar, updatedBy: access.user.id })
    .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)));
  await auditEvent(db, {
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: access.user.id,
    accion: "caja.politica_corte",
    entidad: "sucursal",
    entidadId: input.sucursalId,
    detalle: { exigirCorteParaCobrar: input.exigirCorteParaCobrar },
  });
  revalidatePath("/admin/caja");
  revalidatePath("/admin/pos");
  return actionSuccess(
    input.exigirCorteParaCobrar
      ? "Cobro exige corte abierto."
      : "Cobro permitido sin corte abierto.",
  );
}
