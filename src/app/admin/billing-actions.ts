"use server";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { billingEventos, pagosSuscripcion, planes, suscripciones } from "@/db/schema/billing";
import { auditEvent } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { revalidatePath } from "next/cache";

const pagoManualSchema = z.object({
  organizacionId: z.string().uuid(),
  planClave: z.string().trim().min(1).max(40),
  periodicidad: z.enum(["mensual", "anual"]),
  sucursalesFacturadas: z.coerce.number().int().min(1).max(50),
  meses: z.coerce.number().int().min(1).max(24),
  monto: z.coerce.number().min(0),
  referencia: z.string().trim().max(160).optional(),
});

export type PagoManualState = { error?: string; ok?: boolean };

/**
 * Activación manual de una suscripción (cobro por transferencia). Aplica el
 * plan/periodicidad/sucursales elegidos — normalmente lo que la organización
 * solicitó —, marca la suscripción como `activa` por `meses` periodos de 30
 * días y deja el pago con snapshot comercial, evento de billing y auditoría.
 * No borra ni recrea datos del negocio.
 */
export async function registrarPagoSuscripcion(
  _previousState: PagoManualState,
  formData: FormData,
): Promise<PagoManualState> {
  const { user } = await requirePlatformAdmin();
  const input = pagoManualSchema.safeParse({
    organizacionId: formData.get("organizacionId"),
    planClave: formData.get("planClave"),
    periodicidad: formData.get("periodicidad"),
    sucursalesFacturadas: formData.get("sucursalesFacturadas"),
    meses: formData.get("meses"),
    monto: formData.get("monto"),
    referencia: formData.get("referencia") || undefined,
  });
  if (!input.success) {
    return { error: "Revisa los datos del pago." };
  }

  const db = getDatabase();
  try {
    await db.transaction(async (tx) => {
      const [plan] = await tx
        .select()
        .from(planes)
        .where(eq(planes.clave, input.data.planClave))
        .limit(1);
      if (!plan) throw new Error("plan-invalido");
      if (input.data.periodicidad === "anual" && !plan.precioAnual) {
        throw new Error("plan-sin-anual");
      }

      const [suscripcion] = await tx
        .select({ id: suscripciones.id })
        .from(suscripciones)
        .where(eq(suscripciones.organizacionId, input.data.organizacionId))
        .orderBy(desc(suscripciones.createdAt))
        .limit(1);

      const ahora = new Date();
      const termina = new Date(ahora.getTime() + input.data.meses * 30 * 24 * 60 * 60 * 1000);

      const valores = {
        planId: plan.id,
        estado: "activa" as const,
        periodicidad: input.data.periodicidad,
        sucursalesFacturadas: input.data.sucursalesFacturadas,
        periodoIniciaAt: ahora,
        periodoTerminaAt: termina,
        canceladaAt: null,
        motivoCancelacion: null,
        updatedBy: user.id,
      };

      let suscripcionId: string;
      if (suscripcion) {
        suscripcionId = suscripcion.id;
        await tx.update(suscripciones).set(valores).where(eq(suscripciones.id, suscripcion.id));
      } else {
        const [creada] = await tx
          .insert(suscripciones)
          .values({ ...valores, organizacionId: input.data.organizacionId, createdBy: user.id })
          .returning({ id: suscripciones.id });
        suscripcionId = creada.id;
      }

      // Snapshot del precio contratado: el plan puede cambiar después sin
      // reescribir el historial.
      const precioUnitario =
        input.data.periodicidad === "anual"
          ? (plan.precioAnual ?? plan.precioMensual)
          : plan.precioMensual;

      await tx.insert(pagosSuscripcion).values({
        suscripcionId,
        organizacionId: input.data.organizacionId,
        monto: input.data.monto.toFixed(2),
        moneda: "MXN",
        proveedor: "manual",
        referencia: input.data.referencia ?? null,
        periodoDesde: ahora.toISOString().slice(0, 10),
        periodoHasta: termina.toISOString().slice(0, 10),
        planClave: plan.clave,
        periodicidad: input.data.periodicidad,
        sucursalesFacturadas: input.data.sucursalesFacturadas,
        precioUnitario,
        estado: "confirmado",
        createdBy: user.id,
        updatedBy: user.id,
      });

      await tx.insert(billingEventos).values({
        organizacionId: input.data.organizacionId,
        suscripcionId,
        tipo: "pago.confirmado",
        payload: {
          proveedor: "manual",
          meses: input.data.meses,
          referencia: input.data.referencia,
          planClave: plan.clave,
          periodicidad: input.data.periodicidad,
          sucursalesFacturadas: input.data.sucursalesFacturadas,
        },
      });

      await auditEvent(tx, {
        organizacionId: input.data.organizacionId,
        usuarioId: user.id,
        accion: "suscripcion.activada",
        entidad: "suscripcion",
        entidadId: suscripcionId,
        detalle: {
          meses: input.data.meses,
          monto: input.data.monto,
          referencia: input.data.referencia,
          plan: plan.clave,
          periodicidad: input.data.periodicidad,
          sucursales: input.data.sucursalesFacturadas,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "plan-invalido") {
      return { error: "El plan elegido no existe." };
    }
    if (message === "plan-sin-anual") {
      return { error: "Ese plan no tiene precio anual configurado." };
    }
    return { error: "No se pudo registrar el pago. Inténtalo de nuevo." };
  }

  revalidatePath("/admin");
  return { ok: true };
}
