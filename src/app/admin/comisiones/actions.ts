"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { organizaciones, usuarios } from "@/db/schema/core";
import { liquidacionesComisiones } from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { canAccessBranch, checkPermission } from "@/lib/auth/authorization";
import { withDbRetry } from "@/db/retry";
import { requiereCapacidad } from "@/modules/billing/queries";
import { dayBoundsUtc } from "@/modules/agenda";
import { afectaCaja } from "@/modules/gastos/rules";
import { puedeRevertir, validarPeriodoLiquidacion } from "@/modules/comisiones/rules";
import { liquidarComisiones, revertirLiquidacion } from "@/modules/comisiones/service";

const liquidacionSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  usuarioId: z.string().uuid("Selecciona al profesional."),
  periodoDesde: z.string().trim().min(1, "Indica el inicio del periodo."),
  periodoHasta: z.string().trim().min(1, "Indica el fin del periodo."),
  medioPagoId: z.string().uuid("Selecciona el medio de pago."),
  notas: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * Liquida todas las comisiones pendientes del profesional en el periodo. En
 * efectivo genera un retiro del corte abierto; otros medios no tocan caja.
 */
export async function liquidarComisionesAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(liquidacionSchema, Object.fromEntries(formData.entries()), "Revisa la liquidación.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const invalido = validarPeriodoLiquidacion(input.periodoDesde, input.periodoHasta);
  if (invalido) return actionError(invalido);

  const access = await checkPermission(input.organizacionId, "comisiones.editar");
  if (!access) return actionError("No tienes permiso para liquidar comisiones.");
  const negado = await requiereCapacidad(input.organizacionId, "comisiones");
  if (negado) return actionError(negado);
  if (!canAccessBranch(access, input.sucursalId)) return actionError("La sucursal no está dentro de tu alcance.");
  const { user } = access;
  const db = getDatabase();

  const [org] = await db
    .select({ zonaHoraria: organizaciones.zonaHoraria })
    .from(organizaciones)
    .where(eq(organizaciones.id, input.organizacionId))
    .limit(1);
  const desde = dayBoundsUtc(input.periodoDesde, org?.zonaHoraria ?? "America/Mexico_City");
  const hasta = dayBoundsUtc(input.periodoHasta, org?.zonaHoraria ?? "America/Mexico_City");
  if (!desde || !hasta) return actionError("El periodo no es válido.");

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

        const [profesional] = await tx
          .select({ id: usuarios.id, nombre: usuarios.nombre })
          .from(usuarios)
          .where(and(eq(usuarios.id, input.usuarioId), eq(usuarios.activo, true)))
          .limit(1);
        if (!profesional) return actionError("El profesional no es válido.");

        const esEfectivo = afectaCaja(medio.categoria);
        const resultado = await liquidarComisiones(tx, {
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: profesional.id,
          iniciaAt: desde.iniciaAt,
          terminaAt: hasta.terminaAt,
          periodoDesde: input.periodoDesde,
          periodoHasta: input.periodoHasta,
          medioPagoId: medio.id,
          medioEsEfectivo: esEfectivo,
          notas: input.notas?.trim() || null,
          actorId: user.id,
        });

        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: user.id,
          accion: "comisiones.liquidacion_creada",
          entidad: "liquidacion_comisiones",
          entidadId: resultado.liquidacionId,
          detalle: {
            profesionalId: profesional.id,
            profesional: profesional.nombre,
            periodo: `${input.periodoDesde} → ${input.periodoHasta}`,
            total: resultado.total,
            lineas: resultado.cantidad,
            medioNombre: medio.nombre,
            esEfectivo,
            movimientoCajaId: resultado.movimientoCajaId,
          },
        });

        return actionSuccess(
          esEfectivo && !resultado.movimientoCajaId
            ? `Comisiones de ${profesional.nombre} liquidadas (${resultado.cantidad} líneas). Sin corte abierto: no se descontó de caja.`
            : `Comisiones de ${profesional.nombre} liquidadas (${resultado.cantidad} líneas).`,
        );
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "sin_pendientes") {
      return actionError("No hay comisiones pendientes para ese profesional en el periodo.");
    }
    console.error("liquidarComisionesAction", error);
    return actionError("No se pudo liquidar. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/comisiones");
    revalidatePath("/admin/caja");
    revalidatePath("/admin/reportes");
  }
  return outcome;
}

const reversionSchema = z.object({
  organizacionId: z.string().uuid(),
  liquidacionId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Indica el motivo de la reversión.").max(500),
});

/**
 * Reversa una liquidación confirmada: el documento queda revertido, las
 * líneas vuelven a pendientes y el efectivo regresa al corte abierto actual.
 */
export async function revertirLiquidacionAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(reversionSchema, Object.fromEntries(formData.entries()), "Revisa la reversión.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "comisiones.editar");
  if (!access) return actionError("No tienes permiso para revertir liquidaciones.");
  const negado = await requiereCapacidad(input.organizacionId, "comisiones");
  if (negado) return actionError(negado);
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<ActionState> => {
        const [liquidacion] = await tx
          .select({
            id: liquidacionesComisiones.id,
            organizacionId: liquidacionesComisiones.organizacionId,
            sucursalId: liquidacionesComisiones.sucursalId,
            total: liquidacionesComisiones.total,
            medioPagoId: liquidacionesComisiones.medioPagoId,
            movimientoCajaId: liquidacionesComisiones.movimientoCajaId,
            estado: liquidacionesComisiones.estado,
          })
          .from(liquidacionesComisiones)
          .where(and(eq(liquidacionesComisiones.id, input.liquidacionId), eq(liquidacionesComisiones.organizacionId, input.organizacionId)))
          .limit(1)
          .for("update");
        if (!liquidacion) return actionError("La liquidación no existe.");
        if (!canAccessBranch(access, liquidacion.sucursalId)) return actionError("La liquidación pertenece a otra sucursal.");
        if (!puedeRevertir(liquidacion.estado)) return actionError("Esta liquidación ya fue revertida.");

        const { entradaCajaId } = await revertirLiquidacion(tx, {
          liquidacion,
          motivo: input.motivo,
          usuarioId: user.id,
        });
        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: liquidacion.sucursalId,
          usuarioId: user.id,
          accion: "comisiones.liquidacion_revertida",
          entidad: "liquidacion_comisiones",
          entidadId: liquidacion.id,
          detalle: { total: liquidacion.total, motivo: input.motivo, entradaCajaId },
        });
        return actionSuccess("Liquidación revertida; las comisiones vuelven a pendientes.");
      }),
    );
  } catch (error) {
    console.error("revertirLiquidacionAction", error);
    return actionError("No se pudo revertir la liquidación. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/comisiones");
    revalidatePath("/admin/caja");
    revalidatePath("/admin/reportes");
  }
  return outcome;
}
