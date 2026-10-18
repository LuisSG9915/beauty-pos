"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { withDbRetry } from "@/db/retry";
import { catMediosPago, comisiones, productos, relServiciosInsumos, servicios } from "@/db/schema/catalogs";
import { sucursales } from "@/db/schema/core";
import { clavesIdempotencia, cortesCaja } from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { canAccessBranch, checkPermission } from "@/lib/auth/authorization";
import { totalVentaOffline, validarPagosOffline } from "@/modules/offline/venta-offline";
import { ejecutarInsercionVentaLote, serviciosInsumos } from "@/modules/pos/service";

/**
 * Sincroniza una venta cobrada sin conexión. El dispositivo guardó el ticket
 * en IndexedDB y al recuperar red lo reenvía aquí: el servidor revalida
 * catálogo, medios de pago y cobertura de pagos de forma autoritativa, crea
 * la venta ya `completada` con todos sus efectos (comisiones, inventario,
 * corte abierto si lo hay) y responde idempotente por `clave` — reintentos y
 * doble envío no duplican la venta.
 *
 * Limitaciones del modo offline (por diseño): sin cliente, paquetes,
 * membresías, promociones, anticipos ni propina — el ticket offline solo
 * admite servicios + productos + pagos.
 */

const lineaOfflineSchema = z.object({
  id: z.string().uuid(),
  usuarioId: z.string().uuid().nullable().optional(),
  nombre: z.string().trim().min(1).max(160),
  precio: z.coerce.number().finite().min(0).max(9_999_999),
  cantidad: z.coerce.number().int().min(1).max(999),
});

const pagoOfflineSchema = z.object({
  medioPagoId: z.string().uuid(),
  monto: z.coerce.number().finite().positive().max(9_999_999),
  referencia: z.string().trim().max(160).optional().nullable(),
});

const ventaOfflineSchema = z
  .object({
    clave: z.string().uuid(),
    organizacionId: z.string().uuid(),
    sucursalId: z.string().uuid(),
    cobradaAt: z.string().max(40).optional().nullable(),
    notas: z.string().trim().max(500).optional().nullable(),
    servicios: z.array(lineaOfflineSchema).max(50),
    productos: z.array(lineaOfflineSchema).max(50),
    pagos: z.array(pagoOfflineSchema).max(8),
  })
  .refine((v) => v.servicios.length + v.productos.length > 0, {
    message: "Agrega al menos un servicio o producto.",
  });


export async function sincronizarVentaOffline(raw: unknown): Promise<ActionState<{ ventaId: string }>> {
  const parsed = parseWithSchema(ventaOfflineSchema, raw);
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "ventas.cobrar");
  if (!access) return actionError("No tienes permiso para registrar ventas.");
  if (!canAccessBranch(access, input.sucursalId)) {
    return actionError("La venta pertenece a una sucursal fuera de tu alcance.");
  }
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState<{ ventaId: string }>;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx) => {
        const claveIdempotencia = `offline:${input.clave}`;
        const [inserted] = await tx
          .insert(clavesIdempotencia)
          .values({ organizacionId: input.organizacionId, clave: claveIdempotencia, accion: "venta.cobrar_offline" })
          .onConflictDoNothing({ target: [clavesIdempotencia.organizacionId, clavesIdempotencia.clave] })
          .returning({ id: clavesIdempotencia.id });
        if (!inserted) {
          const [prev] = await tx
            .select({ resultado: clavesIdempotencia.resultado })
            .from(clavesIdempotencia)
            .where(and(eq(clavesIdempotencia.organizacionId, input.organizacionId), eq(clavesIdempotencia.clave, claveIdempotencia)))
            .limit(1);
          const ventaId = (prev?.resultado as { ventaId?: string } | null)?.ventaId;
          if (!ventaId) return actionError("La venta ya fue enviada y sigue en proceso.");
          return actionSuccess("La venta ya estaba sincronizada.", { ventaId });
        }

        // La sucursal debe existir activa en la org (el alcance ya se validó).
        const [sucursal] = await tx
          .select({ id: sucursales.id })
          .from(sucursales)
          .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId), eq(sucursales.activo, true)))
          .limit(1);
        if (!sucursal) return actionError("La sucursal no existe o está inactiva.");

        // Catálogo referenciado: debe existir en la org (puede haberse
        // desactivado después del cobro offline — la venta física ya ocurrió).
        const servicioIds = [...new Set(input.servicios.map((l) => l.id))];
        const productoIds = [...new Set(input.productos.map((l) => l.id))];
        const [servRows, prodRows, medioRows] = await Promise.all([
          servicioIds.length > 0
            ? tx.select({ id: servicios.id }).from(servicios).where(and(inArray(servicios.id, servicioIds), eq(servicios.organizacionId, input.organizacionId)))
            : [],
          productoIds.length > 0
            ? tx.select({ id: productos.id }).from(productos).where(and(inArray(productos.id, productoIds), eq(productos.organizacionId, input.organizacionId)))
            : [],
          tx
            .select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria })
            .from(catMediosPago)
            .where(eq(catMediosPago.organizacionId, input.organizacionId)),
        ]);
        if (servRows.length !== servicioIds.length) return actionError("Un servicio del ticket ya no existe en el catálogo.");
        if (prodRows.length !== productoIds.length) return actionError("Un producto del ticket ya no existe en el catálogo.");
        const mediosPorId = new Map(medioRows.map((m) => [m.id, m]));
        for (const pago of input.pagos) {
          const medio = mediosPorId.get(pago.medioPagoId);
          if (!medio) return actionError("Uno de los medios de pago no es válido.");
          if (medio.categoria !== "efectivo" && !pago.referencia) {
            return actionError(`El medio "${medio.nombre}" requiere referencia.`);
          }
        }

        const subtotal = totalVentaOffline([...input.servicios, ...input.productos]);
        const pagosCalc = input.pagos.map((p) => ({ monto: p.monto, esEfectivo: mediosPorId.get(p.medioPagoId)?.categoria === "efectivo" }));
        const errorPagos = validarPagosOffline(pagosCalc, subtotal);
        if (errorPagos) return actionError(errorPagos);

        const [corteAbierto] = await tx
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
          .limit(1);

        const recibido = input.pagos.reduce((s, p) => s + Number(p.monto), 0);
        let cambioPendiente = Math.max(Math.round((recibido - subtotal) * 100) / 100, 0);
        const pagosAjustados = input.pagos.map((pago) => {
          const esEfectivo = mediosPorId.get(pago.medioPagoId)?.categoria === "efectivo";
          const cambioPago = esEfectivo ? Math.min(Number(pago.monto), cambioPendiente) : 0;
          cambioPendiente = Math.round((cambioPendiente - cambioPago) * 100) / 100;
          return {
            medioPagoId: pago.medioPagoId,
            monto: Number(pago.monto) - cambioPago,
            recibido: Number(pago.monto),
            cambio: cambioPago,
            referencia: pago.referencia || null,
          };
        });

        const tieneServicios = input.servicios.length > 0;
        const tieneEstilista = input.servicios.some((s) => s.usuarioId);

        // Cuando la venta offline incluye ítems de tipo servicio o tiene estilista asignado,
        // consulta insumos de receta (serviciosInsumos) y reglas de comisión para pasarlos a ejecutarInsercionVentaLote.
        let insumosReceta: Array<{ servicioId: string; productoId: string; cantidad: string }> = [];
        let reglasComision: Array<{ id: string; servicioId: string | null; rolId: string | null; tipo: string; valor: string }> = [];

        if (tieneServicios || tieneEstilista) {
          const [insumosRows, comisionesRows] = await Promise.all([
            servicioIds.length > 0
              ? tx
                  .select({
                    servicioId: relServiciosInsumos.servicioId,
                    productoId: relServiciosInsumos.productoId,
                    cantidad: relServiciosInsumos.cantidad,
                  })
                  .from(serviciosInsumos)
                  .where(
                    and(
                      inArray(relServiciosInsumos.servicioId, servicioIds),
                      eq(relServiciosInsumos.activo, true),
                    ),
                  )
              : Promise.resolve([]),
            servicioIds.length > 0
              ? tx
                  .select({
                    id: comisiones.id,
                    servicioId: comisiones.servicioId,
                    rolId: comisiones.rolId,
                    tipo: comisiones.tipo,
                    valor: comisiones.valor,
                  })
                  .from(comisiones)
                  .where(
                    and(
                      inArray(comisiones.servicioId, servicioIds),
                      eq(comisiones.organizacionId, input.organizacionId),
                      eq(comisiones.activo, true),
                    ),
                  )
              : Promise.resolve([]),
          ]);
          insumosReceta = insumosRows;
          reglasComision = comisionesRows;
        }

        const resultadoVenta = await ejecutarInsercionVentaLote(tx, {
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          idempotencyKey: input.clave,
          corteId: corteAbierto?.id ?? null,
          subtotal,
          total: subtotal,
          propina: 0,
          servicios: input.servicios.map((s) => ({
            servicioId: s.id,
            usuarioId: s.usuarioId ?? null,
            nombre: s.nombre,
            precio: Number(s.precio),
            cantidad: s.cantidad,
          })),
          productos: input.productos.map((p) => ({
            productoId: p.id,
            nombre: p.nombre,
            precio: Number(p.precio),
            cantidad: p.cantidad,
          })),
          pagos: pagosAjustados,
          serviciosInsumos: insumosReceta,
          reglasComision,
          notas: `Venta registrada offline${input.notas ? ` — ${input.notas}` : ""}`,
          userId: user.id,
        });

        if (resultadoVenta.yaProcesada) {
          return actionSuccess("La venta ya estaba sincronizada.", { ventaId: resultadoVenta.ventaId });
        }

        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: user.id,
          accion: "venta.cobrada_offline",
          entidad: "venta",
          entidadId: resultadoVenta.ventaId,
          detalle: { clave: input.clave, cobradaAt: input.cobradaAt ?? null, total: subtotal, medios: input.pagos.length },
        });
        if (inserted) {
          await tx
            .update(clavesIdempotencia)
            .set({ resultado: { ventaId: resultadoVenta.ventaId } })
            .where(eq(clavesIdempotencia.id, inserted.id));
        }
        return actionSuccess("Venta sincronizada.", { ventaId: resultadoVenta.ventaId });
      }),
    );
  } catch (error) {
    console.error("sincronizarVentaOffline", error);
    return actionError("No se pudo sincronizar la venta. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/pos");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/caja");
  }
  return outcome;
}

export const sincronizarVentaOfflineAction = sincronizarVentaOffline;
