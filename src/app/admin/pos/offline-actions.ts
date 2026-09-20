"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { withDbRetry } from "@/db/retry";
import { catMediosPago, comisiones, productos, relServiciosInsumos, servicios } from "@/db/schema/catalogs";
import { sucursales } from "@/db/schema/core";
import {
  clavesIdempotencia,
  cortesCaja,
  detalleVentasComisiones,
  detalleVentasMediosPagos,
  detalleVentasProductos,
  detalleVentasServicios,
  inventarioStock,
  movimientosInventario,
  ventas,
} from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { canAccessBranch, checkPermission } from "@/lib/auth/authorization";
import type { InventoryDb } from "@/modules/inventory";
import { totalVentaOffline, validarPagosOffline } from "@/modules/offline/venta-offline";
import { calcularComisiones } from "@/modules/pos/comisiones";
import { getRolesPorUsuario } from "@/modules/pos/ticket";

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

type PosDb = InventoryDb;

/**
 * Descuento de inventario tolerante a stock negativo: la venta física ya
 * ocurrió mientras el equipo estaba offline, así que el déficit queda
 * registrado (stock resultante < 0) en vez de bloquear la sincronización.
 * Mismo patrón FOR UPDATE que `applyInventoryMovement`.
 */
async function movimientoInventarioOffline(
  db: PosDb,
  input: {
    organizacionId: string;
    sucursalId: string;
    ventaId: string;
    productoId: string;
    tipo: "venta" | "consumo";
    cantidad: number;
    notas?: string;
    userId: string | null;
  },
) {
  await db
    .insert(inventarioStock)
    .values({
      organizacionId: input.organizacionId,
      sucursalId: input.sucursalId,
      productoId: input.productoId,
      stockActual: "0",
      createdBy: input.userId,
    })
    .onConflictDoNothing({ target: [inventarioStock.sucursalId, inventarioStock.productoId] });
  const [stock] = await db
    .select({ id: inventarioStock.id, stockActual: inventarioStock.stockActual })
    .from(inventarioStock)
    .where(
      and(
        eq(inventarioStock.organizacionId, input.organizacionId),
        eq(inventarioStock.sucursalId, input.sucursalId),
        eq(inventarioStock.productoId, input.productoId),
      ),
    )
    .limit(1)
    .for("update");
  if (!stock) throw new Error("No se pudo inicializar el stock del producto.");
  const stockResultante = Number(stock.stockActual) - input.cantidad;
  await db.update(inventarioStock).set({ stockActual: stockResultante.toFixed(3), updatedBy: input.userId }).where(eq(inventarioStock.id, stock.id));
  await db.insert(movimientosInventario).values({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    productoId: input.productoId,
    ventaId: input.ventaId,
    tipo: input.tipo,
    cantidad: input.cantidad.toFixed(3),
    stockResultante: stockResultante.toFixed(3),
    notas: input.notas ?? null,
    createdBy: input.userId,
  });
}

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

        const [venta] = await tx
          .insert(ventas)
          .values({
            organizacionId: input.organizacionId,
            sucursalId: input.sucursalId,
            usuarioId: user.id,
            corteId: corteAbierto?.id ?? null,
            estado: "completada",
            cobradaAt: new Date(),
            subtotal: subtotal.toFixed(2),
            descuento: "0",
            descuentoPromocion: "0",
            descuentoMembresia: "0",
            total: subtotal.toFixed(2),
            propina: "0",
            notas: `Venta registrada offline${input.notas ? ` — ${input.notas}` : ""}`,
            createdBy: user.id,
          })
          .returning({ id: ventas.id });
        if (!venta) return actionError("No se pudo registrar la venta.");

        for (const linea of input.servicios) {
          await tx.insert(detalleVentasServicios).values({
            ventaId: venta.id,
            servicioId: linea.id,
            usuarioId: linea.usuarioId ?? null,
            nombre: linea.nombre,
            precio: Number(linea.precio).toFixed(2),
            cantidad: linea.cantidad,
            createdBy: user.id,
          });
        }
        for (const linea of input.productos) {
          await tx.insert(detalleVentasProductos).values({
            ventaId: venta.id,
            productoId: linea.id,
            nombre: linea.nombre,
            precio: Number(linea.precio).toFixed(2),
            cantidad: linea.cantidad,
            createdBy: user.id,
          });
        }

        // Cambio imputado a pagos en efectivo (misma regla que cobrarVenta).
        const recibido = input.pagos.reduce((s, p) => s + Number(p.monto), 0);
        let cambioPendiente = Math.max(Math.round((recibido - subtotal) * 100) / 100, 0);
        for (const pago of input.pagos) {
          const esEfectivo = mediosPorId.get(pago.medioPagoId)?.categoria === "efectivo";
          const cambioPago = esEfectivo ? Math.min(Number(pago.monto), cambioPendiente) : 0;
          cambioPendiente = Math.round((cambioPendiente - cambioPago) * 100) / 100;
          await tx.insert(detalleVentasMediosPagos).values({
            ventaId: venta.id,
            medioPagoId: pago.medioPagoId,
            monto: (Number(pago.monto) - cambioPago).toFixed(2),
            recibido: Number(pago.monto).toFixed(2),
            cambio: cambioPago.toFixed(2),
            referencia: pago.referencia || null,
            createdBy: user.id,
          });
        }

        // Comisiones por profesional (las reglas vigentes al sincronizar).
        if (input.servicios.length > 0) {
          const reglas =
            servicioIds.length > 0
              ? await tx
                  .select({ id: comisiones.id, servicioId: comisiones.servicioId, rolId: comisiones.rolId, tipo: comisiones.tipo, valor: comisiones.valor })
                  .from(comisiones)
                  .where(and(inArray(comisiones.servicioId, servicioIds), eq(comisiones.organizacionId, input.organizacionId), eq(comisiones.activo, true)))
              : [];
          const usuarioIds = [...new Set(input.servicios.map((l) => l.usuarioId).filter((u): u is string => Boolean(u)))];
          const rolesPorUsuario = await getRolesPorUsuario(input.organizacionId, usuarioIds);
          const lineasPersistidas = await tx
            .select({ detalleId: detalleVentasServicios.id, servicioId: detalleVentasServicios.servicioId, usuarioId: detalleVentasServicios.usuarioId, precio: detalleVentasServicios.precio, cantidad: detalleVentasServicios.cantidad })
            .from(detalleVentasServicios)
            .where(and(eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.activo, true)));
          const comisionesCalc = calcularComisiones(
            lineasPersistidas.map((l) => ({ ...l, precio: Number(l.precio) })),
            reglas.map((r) => ({ ...r, tipo: r.tipo as "porcentaje" | "monto_fijo", valor: Number(r.valor) })),
            rolesPorUsuario,
          );
          for (const c of comisionesCalc) {
            await tx.insert(detalleVentasComisiones).values({
              ventaId: venta.id,
              detalleVentaServicioId: c.detalleVentaServicioId,
              usuarioId: c.usuarioId,
              comisionId: c.comisionId,
              tipo: c.tipo,
              valor: String(c.valor),
              base: c.base.toFixed(2),
              monto: c.monto.toFixed(2),
              createdBy: user.id,
            });
          }
        }

        // Inventario: venta de productos + consumo de insumos por servicio,
        // tolerante a stock negativo (la venta física ya ocurrió).
        for (const linea of input.productos) {
          await movimientoInventarioOffline(tx, {
            organizacionId: input.organizacionId,
            sucursalId: input.sucursalId,
            ventaId: venta.id,
            productoId: linea.id,
            tipo: "venta",
            cantidad: linea.cantidad,
            userId: user.id,
          });
        }
        const insumos =
          servicioIds.length > 0
            ? await tx
                .select({ servicioId: relServiciosInsumos.servicioId, productoId: relServiciosInsumos.productoId, cantidad: relServiciosInsumos.cantidad })
                .from(relServiciosInsumos)
                .where(and(inArray(relServiciosInsumos.servicioId, servicioIds), eq(relServiciosInsumos.activo, true)))
            : [];
        const porServicio = new Map<string, number>();
        for (const linea of input.servicios) porServicio.set(linea.id, (porServicio.get(linea.id) ?? 0) + linea.cantidad);
        const consumo = new Map<string, number>();
        for (const insumo of insumos) {
          const veces = porServicio.get(insumo.servicioId) ?? 0;
          consumo.set(insumo.productoId, (consumo.get(insumo.productoId) ?? 0) + Number(insumo.cantidad) * veces);
        }
        for (const [productoId, cantidad] of consumo) {
          await movimientoInventarioOffline(tx, {
            organizacionId: input.organizacionId,
            sucursalId: input.sucursalId,
            ventaId: venta.id,
            productoId,
            tipo: "consumo",
            cantidad,
            notas: "Consumo por servicio vendido offline",
            userId: user.id,
          });
        }

        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: user.id,
          accion: "venta.cobrada_offline",
          entidad: "venta",
          entidadId: venta.id,
          detalle: { clave: input.clave, cobradaAt: input.cobradaAt ?? null, total: subtotal, medios: input.pagos.length },
        });
        await tx
          .update(clavesIdempotencia)
          .set({ resultado: { ventaId: venta.id } })
          .where(eq(clavesIdempotencia.id, inserted.id));
        return actionSuccess("Venta sincronizada.", { ventaId: venta.id });
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
