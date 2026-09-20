"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { catCategoriasGastos, gastos } from "@/db/schema/finance";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { canAccessBranch, checkPermission } from "@/lib/auth/authorization";
import { withDbRetry } from "@/db/retry";
import { requiereCapacidad } from "@/modules/billing/queries";
import { afectaCaja, puedeRevertir, validarGastoInput } from "@/modules/gastos/rules";
import { registrarGasto, revertirGasto } from "@/modules/gastos/service";

const gastoSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  concepto: z.string().trim().min(2, "Indica el concepto del gasto.").max(200),
  fechaGasto: z.string().trim().min(1, "Indica la fecha del gasto."),
  importe: z.coerce.number().positive("El importe debe ser mayor a cero.").max(9_999_999),
  medioPagoId: z.string().uuid("Selecciona el medio de pago."),
  categoriaId: z.string().uuid().optional().or(z.literal("")),
  proveedor: z.string().trim().max(160).optional().or(z.literal("")),
  referencia: z.string().trim().max(120).optional().or(z.literal("")),
  notas: z.string().trim().max(500).optional().or(z.literal("")),
});

/** Registra un gasto; en efectivo descuenta del corte abierto una sola vez. */
export async function registrarGastoAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(gastoSchema, Object.fromEntries(formData.entries()), "Revisa el gasto.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const invalido = validarGastoInput(input);
  if (invalido) return actionError(invalido);

  const access = await checkPermission(input.organizacionId, "gastos.editar");
  if (!access) return actionError("No tienes permiso para registrar gastos.");
  const negado = await requiereCapacidad(input.organizacionId, "gastos");
  if (negado) return actionError(negado);
  if (!canAccessBranch(access, input.sucursalId)) return actionError("La sucursal no está dentro de tu alcance.");
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<ActionState> => {
        const [medio] = await tx
          .select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria })
          .from(catMediosPago)
          .where(and(eq(catMediosPago.id, input.medioPagoId), eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.activo, true)))
          .limit(1);
        if (!medio) return actionError("El medio de pago no es válido.");

        if (input.categoriaId) {
          const [categoria] = await tx
            .select({ id: catCategoriasGastos.id })
            .from(catCategoriasGastos)
            .where(and(eq(catCategoriasGastos.id, input.categoriaId), eq(catCategoriasGastos.organizacionId, input.organizacionId), eq(catCategoriasGastos.activo, true)))
            .limit(1);
          if (!categoria) return actionError("La categoría no es válida.");
        }

        const esEfectivo = afectaCaja(medio.categoria);
        const { gastoId, movimientoCajaId } = await registrarGasto(tx, {
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          categoriaId: input.categoriaId || null,
          concepto: input.concepto,
          fechaGasto: input.fechaGasto,
          importe: input.importe.toFixed(2),
          medioPagoId: medio.id,
          medioEsEfectivo: esEfectivo,
          proveedor: input.proveedor?.trim() || null,
          referencia: input.referencia?.trim() || null,
          notas: input.notas?.trim() || null,
          usuarioId: user.id,
        });

        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: user.id,
          accion: "gasto.registrado",
          entidad: "gasto",
          entidadId: gastoId,
          detalle: {
            concepto: input.concepto,
            importe: input.importe,
            medioPagoId: medio.id,
            medioNombre: medio.nombre,
            esEfectivo: esEfectivo,
            movimientoCajaId,
          },
        });

        return actionSuccess(
          esEfectivo
            ? movimientoCajaId
              ? "Gasto registrado y descontado del corte abierto."
              : "Gasto registrado. No hay corte abierto: no se descontó de caja."
            : "Gasto registrado.",
        );
      }),
    );
  } catch (error) {
    console.error("registrarGastoAction", error);
    return actionError("No se pudo registrar el gasto. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/gastos");
    revalidatePath("/admin/caja");
    revalidatePath("/admin/reportes");
  }
  return outcome;
}

const reversionSchema = z.object({
  organizacionId: z.string().uuid(),
  gastoId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Indica el motivo de la reversión.").max(500),
});

/**
 * Reversa un gasto confirmado. El documento no se borra: queda revertido con
 * motivo y autor. Si el gasto salió del cajón, la entrada compensatoria cae
 * en el corte abierto actual; los cortes cerrados no se tocan.
 */
export async function revertirGastoAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(reversionSchema, Object.fromEntries(formData.entries()), "Revisa la reversión.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "gastos.editar");
  if (!access) return actionError("No tienes permiso para revertir gastos.");
  const negado = await requiereCapacidad(input.organizacionId, "gastos");
  if (negado) return actionError(negado);
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<ActionState> => {
        const [gasto] = await tx
          .select({
            id: gastos.id,
            organizacionId: gastos.organizacionId,
            sucursalId: gastos.sucursalId,
            concepto: gastos.concepto,
            importe: gastos.importe,
            medioPagoId: gastos.medioPagoId,
            movimientoCajaId: gastos.movimientoCajaId,
            estado: gastos.estado,
          })
          .from(gastos)
          .where(and(eq(gastos.id, input.gastoId), eq(gastos.organizacionId, input.organizacionId)))
          .limit(1)
          .for("update");
        if (!gasto) return actionError("El gasto no existe.");
        if (!canAccessBranch(access, gasto.sucursalId)) return actionError("El gasto pertenece a otra sucursal.");
        if (!puedeRevertir(gasto.estado)) return actionError("Este gasto ya fue revertido.");

        const { entradaCajaId } = await revertirGasto(tx, { gasto, motivo: input.motivo, usuarioId: user.id });
        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: gasto.sucursalId,
          usuarioId: user.id,
          accion: "gasto.revertido",
          entidad: "gasto",
          entidadId: gasto.id,
          detalle: { importe: gasto.importe, motivo: input.motivo, entradaCajaId },
        });
        return actionSuccess(
          gasto.movimientoCajaId
            ? entradaCajaId
              ? "Gasto revertido; el efectivo regresó al corte abierto."
              : "Gasto revertido. Sin corte abierto, la entrada no se registró en caja."
            : "Gasto revertido.",
        );
      }),
    );
  } catch (error) {
    console.error("revertirGastoAction", error);
    return actionError("No se pudo revertir el gasto. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/gastos");
    revalidatePath("/admin/caja");
    revalidatePath("/admin/reportes");
  }
  return outcome;
}

const categoriaSchema = z.object({
  organizacionId: z.string().uuid(),
  nombre: z.string().trim().min(2, "Indica el nombre de la categoría.").max(120),
});

function claveDeCategoria(nombre: string): string {
  const clave = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return clave || "GENERAL";
}

/** Crea una categoría de gasto; la clave se deriva del nombre. */
export async function crearCategoriaGastoAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(categoriaSchema, Object.fromEntries(formData.entries()), "Revisa la categoría.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "gastos.editar");
  if (!access) return actionError("No tienes permiso para gestionar categorías.");
  const negado = await requiereCapacidad(input.organizacionId, "gastos");
  if (negado) return actionError(negado);
  const { user } = access;
  const db = getDatabase();

  const clave = claveDeCategoria(input.nombre);
  const [duplicada] = await db
    .select({ id: catCategoriasGastos.id, activo: catCategoriasGastos.activo })
    .from(catCategoriasGastos)
    .where(and(eq(catCategoriasGastos.organizacionId, input.organizacionId), eq(catCategoriasGastos.clave, clave)))
    .limit(1);
  if (duplicada) return actionError("Ya existe una categoría con ese nombre.");

  try {
    await db.insert(catCategoriasGastos).values({
      organizacionId: input.organizacionId,
      clave,
      nombre: input.nombre,
      createdBy: user.id,
    });
  } catch (error) {
    console.error("crearCategoriaGastoAction", error);
    return actionError("No se pudo crear la categoría. Intenta de nuevo.");
  }

  revalidatePath("/admin/gastos");
  return actionSuccess("Categoría creada.");
}
