"use server";

import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { billingEventos, pagosSuscripcion, planes, suscripciones } from "@/db/schema/billing";
import { sucursales } from "@/db/schema/core";
import { auditEvent } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { cotizarSuscripcion, planPreciosDesdeFila } from "@/modules/billing/precios";
import { invalidarSuscripcionCache } from "@/modules/billing/queries";
import { revalidatePath } from "next/cache";

const pagoManualSchema = z.object({
  organizacionId: z.string().uuid(),
  planClave: z.string().trim().min(1).max(40),
  periodicidad: z.enum(["mensual", "anual"]),
  sucursalesFacturadas: z.coerce.number().int().min(1).max(50),
  meses: z.coerce.number().int().min(1).max(24),
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

      // El monto se cotiza en servidor desde el catálogo — nunca se confía
      // en un importe enviado por el cliente. El resultado queda como
      // snapshot del contrato en la suscripción y en el pago.
      const cotizacion = cotizarSuscripcion(planPreciosDesdeFila(plan), {
        periodicidad: input.data.periodicidad,
        sucursalesFacturadas: input.data.sucursalesFacturadas,
        meses: input.data.meses,
      });
      if (!cotizacion.ok) throw new Error(`cotizacion-${cotizacion.error}`);

      // La cobertura aplicada no puede quedar por debajo del uso real:
      // primero se desactivan las sucursales excedentes.
      const [{ activas }] = await tx
        .select({ activas: count() })
        .from(sucursales)
        .where(
          and(
            eq(sucursales.organizacionId, input.data.organizacionId),
            eq(sucursales.activo, true),
          ),
        );
      if (input.data.sucursalesFacturadas < activas) {
        throw new Error("cobertura-insuficiente");
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
        sucursalesIncluidas: cotizacion.sucursalesIncluidas,
        precioUnitario: cotizacion.precioUnitario.toFixed(2),
        precioSucursalExtra: cotizacion.extras > 0 ? cotizacion.precioExtraUnitario.toFixed(2) : null,
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
      await tx.insert(pagosSuscripcion).values({
        suscripcionId,
        organizacionId: input.data.organizacionId,
        monto: cotizacion.monto.toFixed(2),
        moneda: "MXN",
        proveedor: "manual",
        referencia: input.data.referencia ?? null,
        periodoDesde: ahora.toISOString().slice(0, 10),
        periodoHasta: termina.toISOString().slice(0, 10),
        planClave: plan.clave,
        periodicidad: input.data.periodicidad,
        sucursalesFacturadas: input.data.sucursalesFacturadas,
        precioUnitario: cotizacion.precioUnitario.toFixed(2),
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
          sucursalesIncluidas: cotizacion.sucursalesIncluidas,
          extras: cotizacion.extras,
          precioUnitario: cotizacion.precioUnitario,
          precioExtraUnitario: cotizacion.precioExtraUnitario,
          monto: cotizacion.monto,
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
          monto: cotizacion.monto,
          extras: cotizacion.extras,
          referencia: input.data.referencia,
          plan: plan.clave,
          periodicidad: input.data.periodicidad,
          sucursales: input.data.sucursalesFacturadas,
        },
      });
    });

    // El estado de suscripción está cacheado en KV para navegación: hay que
    // invalidarlo al activar/cambiar el plan.
    await invalidarSuscripcionCache(input.data.organizacionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "plan-invalido") {
      return { error: "El plan elegido no existe." };
    }
    if (message === "cotizacion-sin-precio-anual") {
      return { error: "Ese plan no tiene precio anual configurado." };
    }
    if (message === "cotizacion-extras-no-permitidos") {
      return { error: "Ese plan no permite más sucursales que las incluidas. Elige un plan con mayor cobertura." };
    }
    if (message === "cotizacion-anual-requiere-12") {
      return { error: "Los pagos anuales se registran en periodos de 12 meses." };
    }
    if (message.startsWith("cotizacion-")) {
      return { error: "No se pudo calcular el monto con esos datos." };
    }
    if (message === "cobertura-insuficiente") {
      return { error: "La organización tiene más sucursales activas que la cobertura elegida. Desactiva las excedentes primero." };
    }
    return { error: "No se pudo registrar el pago. Inténtalo de nuevo." };
  }

  revalidatePath("/admin");
  return { ok: true };
}
