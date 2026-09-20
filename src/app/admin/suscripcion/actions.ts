"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { billingEventos, planes, suscripciones } from "@/db/schema/billing";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { checkPermission } from "@/lib/auth/authorization";
import { getSuscripcionActual } from "@/modules/billing/queries";

const cambioPlanSchema = z.object({
  organizacionId: z.string().uuid(),
  planClave: z.string().trim().min(1).max(40),
  periodicidad: z.enum(["mensual", "anual"]),
  sucursalesFacturadas: z.coerce.number().int().min(1).max(50),
});

/**
 * Solicitud de cambio de plan del propietario. No cobra ni muta la
 * suscripción: registra la intención en `billing_eventos` para que la
 * activación manual (transferencia) la aplique el equipo de plataforma.
 * Mensajes honestos — no prometemos cargos automáticos que aún no existen.
 */
export async function solicitarCambioPlan(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(cambioPlanSchema, Object.fromEntries(formData.entries()), "Revisa el plan elegido.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "organizaciones.editar");
  if (!access) return actionError("No tienes permiso para cambiar el plan.");
  const { user } = access;
  const db = getDatabase();

  const [plan, actual] = await Promise.all([
    db
      .select({ id: planes.id, clave: planes.clave, nombre: planes.nombre, precioMensual: planes.precioMensual, precioAnual: planes.precioAnual, maxSucursales: planes.maxSucursales })
      .from(planes)
      .where(eq(planes.clave, input.planClave))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getSuscripcionActual(input.organizacionId),
  ]);
  if (!plan) return actionError("El plan elegido no existe.");
  if (actual?.planClave === plan.clave && actual.periodicidad === input.periodicidad) {
    return actionError("Ya tienes ese plan con esa periodicidad.");
  }
  if (input.periodicidad === "anual" && !plan.precioAnual) {
    return actionError("Ese plan solo está disponible en modalidad mensual.");
  }
  if (plan.maxSucursales != null && input.sucursalesFacturadas > plan.maxSucursales) {
    return actionError(`${plan.nombre} permite hasta ${plan.maxSucursales} sucursal(es). Elige un plan con más cobertura.`);
  }

  await db.transaction(async (tx) => {
    await tx.insert(billingEventos).values({
      organizacionId: input.organizacionId,
      suscripcionId: actual?.id ?? null,
      tipo: "plan.cambio_solicitado",
      payload: {
        planClave: plan.clave,
        planNombre: plan.nombre,
        periodicidad: input.periodicidad,
        sucursales: input.sucursalesFacturadas,
        planAnterior: actual?.planClave ?? null,
        solicitadoPor: user.id,
      },
    });
    await auditEvent(tx, {
      organizacionId: input.organizacionId,
      usuarioId: user.id,
      accion: "suscripcion.cambio_solicitado",
      entidad: "suscripcion",
      entidadId: actual?.id ?? null,
      detalle: { plan: plan.clave, periodicidad: input.periodicidad, sucursales: input.sucursalesFacturadas },
    });
  });

  revalidatePath("/admin/suscripcion");
  return actionSuccess(`Solicitud enviada: ${plan.nombre} (${input.periodicidad}). Te contactamos para confirmar el pago y aplicar el cambio.`);
}

const cancelacionSchema = z.object({
  organizacionId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Cuéntanos brevemente el motivo.").max(500),
});

/**
 * Solicitud de cancelación: conserva el acceso hasta el fin del periodo ya
 * pagado (el estado efectivo vence solo por fecha), deja el motivo en la
 * suscripción y un evento para seguimiento de plataforma.
 */
export async function solicitarCancelacion(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(cancelacionSchema, Object.fromEntries(formData.entries()), "Revisa la cancelación.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "organizaciones.editar");
  if (!access) return actionError("No tienes permiso para cancelar la suscripción.");
  const { user } = access;
  const db = getDatabase();

  const actual = await getSuscripcionActual(input.organizacionId);
  if (!actual) return actionError("No hay una suscripción registrada.");
  if (actual.estado === "cancelada" || actual.estado === "vencida") {
    return actionError("La suscripción ya no está activa.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(suscripciones)
      .set({ motivoCancelacion: input.motivo, canceladaAt: new Date(), updatedBy: user.id })
      .where(eq(suscripciones.id, actual.id));
    await tx.insert(billingEventos).values({
      organizacionId: input.organizacionId,
      suscripcionId: actual.id,
      tipo: "cancelacion.solicitada",
      payload: { motivo: input.motivo, planClave: actual.planClave, solicitadoPor: user.id },
    });
    await auditEvent(tx, {
      organizacionId: input.organizacionId,
      usuarioId: user.id,
      accion: "suscripcion.cancelacion_solicitada",
      entidad: "suscripcion",
      entidadId: actual.id,
      detalle: { motivo: input.motivo },
    });
  });

  revalidatePath("/admin/suscripcion");
  return actionSuccess("Cancelación registrada. Conservas el acceso hasta el fin del periodo ya cubierto; no habrá más cobros.");
}
