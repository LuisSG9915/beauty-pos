"use server";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { withDbRetry } from "@/db/retry";
import { catMediosPago, comisiones, membresias, paquetes, productos, promociones, relServiciosInsumos, servicios } from "@/db/schema/catalogs";
import { clientes, miembrosOrganizaciones, sucursales, usuarios } from "@/db/schema/core";
import {
  ajustesPagosVenta,
  anticipos,
  citas,
  citasHistorial,
  clavesIdempotencia,
  clienteMembresias,
  clientePaquetes,
  cortesCaja,
  detalleCitasServicios,
  detalleDevoluciones,
  detalleVentasComisiones,
  detalleVentasMediosPagos,
  detalleVentasMembresias,
  detalleVentasPaquetes,
  detalleVentasProductos,
  detalleVentasPropinas,
  detalleVentasServicios,
  devoluciones,
  movimientosCaja,
  paqueteUsos,
  ventas,
} from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { todayDateInput } from "@/lib/format";
import {
  assertBranchScope,
  canAccessBranch,
  checkPermission,
  hasPermission,
} from "@/lib/auth/authorization";
import { canTransitionEstado } from "@/modules/agenda";
import { contextoSuscripcion, requiereCapacidad, tieneCapacidad } from "@/modules/billing/queries";
import { applyInventoryMovement, type InventoryDb } from "@/modules/inventory";
import { motivoBloqueoCancelacion } from "@/modules/pos/cancelacion";
import { anticiposAplicables } from "@/modules/pos/anticipos";
import { calcularDescuentoMembresia, membresiaVigente, sumarDias } from "@/modules/pos/membresias";
import { resolverLineasDevolucion } from "@/modules/pos/devoluciones";
import { resolverCobroPagos } from "@/modules/pos/pagos";
import { elegirPaqueteParaServicio, estadoTrasUso, restarSesiones } from "@/modules/pos/paquetes";
import { calcularComisiones, repartirPropina } from "@/modules/pos/comisiones";
import { calcularDescuentoPromocion, promocionVigente } from "@/modules/pos/promociones";
import { getRolesPorUsuario, getTicketData, type TicketData } from "@/modules/pos/ticket";

type PosDb = InventoryDb;

class PosOperationError extends Error {}

/**
 * Idempotencia dentro de la transacción: inserta la clave; si ya existía,
 * devuelve el resultado persistido del primer intento. Si la transacción hace
 * rollback, la fila desaparece y un reintento vuelve a ejecutar el trabajo.
 */
async function registrarClaveIdempotencia(
  db: PosDb,
  input: { organizacionId: string; clave?: string; accion: string },
): Promise<{ repetida: boolean; resultado: Record<string, unknown> | null; claveId: string | null }> {
  if (!input.clave) return { repetida: false, resultado: null, claveId: null };
  const [inserted] = await db
    .insert(clavesIdempotencia)
    .values({ organizacionId: input.organizacionId, clave: input.clave, accion: input.accion })
    .onConflictDoNothing({ target: [clavesIdempotencia.organizacionId, clavesIdempotencia.clave] })
    .returning({ id: clavesIdempotencia.id });
  if (inserted) return { repetida: false, resultado: null, claveId: inserted.id };
  const [prev] = await db
    .select({ resultado: clavesIdempotencia.resultado })
    .from(clavesIdempotencia)
    .where(and(eq(clavesIdempotencia.organizacionId, input.organizacionId), eq(clavesIdempotencia.clave, input.clave)))
    .limit(1);
  return { repetida: true, resultado: prev?.resultado ?? null, claveId: null };
}

async function recalcularVenta(db: PosDb, ventaId: string, userId: string | null) {
  const [servs, prods, packs, membs] = await Promise.all([
    db
      .select({ id: detalleVentasServicios.id, precio: detalleVentasServicios.precio, cantidad: detalleVentasServicios.cantidad })
      .from(detalleVentasServicios)
      .where(and(eq(detalleVentasServicios.ventaId, ventaId), eq(detalleVentasServicios.activo, true))),
    db
      .select({ precio: detalleVentasProductos.precio, cantidad: detalleVentasProductos.cantidad })
      .from(detalleVentasProductos)
      .where(and(eq(detalleVentasProductos.ventaId, ventaId), eq(detalleVentasProductos.activo, true))),
    db
      .select({ precio: detalleVentasPaquetes.precio, cantidad: detalleVentasPaquetes.cantidad })
      .from(detalleVentasPaquetes)
      .where(and(eq(detalleVentasPaquetes.ventaId, ventaId), eq(detalleVentasPaquetes.activo, true))),
    db
      .select({ precio: detalleVentasMembresias.precio, cantidad: detalleVentasMembresias.cantidad })
      .from(detalleVentasMembresias)
      .where(and(eq(detalleVentasMembresias.ventaId, ventaId), eq(detalleVentasMembresias.activo, true))),
  ]);
  // Líneas de servicio cubiertas por una sesión de paquete: no suman al
  // subtotal (ya se pagaron por adelantado) pero siguen generando comisión.
  const servIds = servs.map((s) => s.id);
  const usos = servIds.length
    ? await db
        .select({ detalleVentaServicioId: paqueteUsos.detalleVentaServicioId })
        .from(paqueteUsos)
        .where(and(inArray(paqueteUsos.detalleVentaServicioId, servIds), eq(paqueteUsos.activo, true)))
    : [];
  const cubiertas = new Set(usos.map((u) => u.detalleVentaServicioId));
  const subtotalServicios = servs
    .filter((line) => !cubiertas.has(line.id))
    .reduce((sum, line) => sum + Number(line.precio) * line.cantidad, 0);
  const subtotalProductos = prods.reduce((sum, line) => sum + Number(line.precio) * line.cantidad, 0);
  const subtotalPaquetes = packs.reduce((sum, line) => sum + Number(line.precio) * line.cantidad, 0);
  const subtotalMembresias = membs.reduce((sum, line) => sum + Number(line.precio) * line.cantidad, 0);
  const subtotal = subtotalServicios + subtotalProductos + subtotalPaquetes + subtotalMembresias;
  const [venta] = await db
    .select({ descuento: ventas.descuento, promocionId: ventas.promocionId, membresiaId: ventas.membresiaId, organizacionId: ventas.organizacionId })
    .from(ventas)
    .where(eq(ventas.id, ventaId))
    .limit(1);
  const descuento = venta ? Number(venta.descuento) : 0;
  // La promoción aplicada se reevalúa contra las líneas actuales: si el ticket
  // cambia, el descuento promocional se ajusta solo.
  let descuentoPromocion = 0;
  if (venta?.promocionId) {
    const [promo] = await db
      .select({ tipo: promociones.tipo, valor: promociones.valor, aplica: promociones.aplica })
      .from(promociones)
      .where(and(eq(promociones.id, venta.promocionId), eq(promociones.organizacionId, venta.organizacionId)))
      .limit(1);
    if (promo) {
      descuentoPromocion = calcularDescuentoPromocion(
        { tipo: promo.tipo, valor: Number(promo.valor), aplica: promo.aplica },
        subtotalServicios,
        subtotalProductos,
      );
    }
  }
  // Ídem la membresía aplicada: porcentaje sobre el subtotal elegible
  // (servicios/productos según `aplica`; paquetes/membresías no descuentan).
  let descuentoMembresia = 0;
  if (venta?.membresiaId) {
    const [membresia] = await db
      .select({ descuentoPorcentaje: membresias.descuentoPorcentaje, aplica: membresias.aplica })
      .from(membresias)
      .where(and(eq(membresias.id, venta.membresiaId), eq(membresias.organizacionId, venta.organizacionId)))
      .limit(1);
    if (membresia) {
      descuentoMembresia = calcularDescuentoMembresia(
        { descuentoPorcentaje: Number(membresia.descuentoPorcentaje), aplica: membresia.aplica },
        subtotalServicios,
        subtotalProductos,
      );
    }
  }
  const total = Math.max(subtotal - descuento - descuentoPromocion - descuentoMembresia, 0);
  await db
    .update(ventas)
    .set({
      subtotal: subtotal.toFixed(2),
      descuentoPromocion: descuentoPromocion.toFixed(2),
      descuentoMembresia: descuentoMembresia.toFixed(2),
      total: total.toFixed(2),
      updatedBy: userId,
    })
    .where(eq(ventas.id, ventaId));
  return { subtotal, total, lineasActivas: servs.length + prods.length + packs.length + membs.length };
}

async function lockVentaEditable(db: PosDb, organizacionId: string, ventaId: string) {
  const [venta] = await db
    .select()
    .from(ventas)
    .where(and(eq(ventas.id, ventaId), eq(ventas.organizacionId, organizacionId), eq(ventas.activo, true)))
    .limit(1)
    .for("update");
  if (!venta || venta.estado !== "en_proceso") return null;
  return venta;
}

/**
 * Devolución con corte abierto: el dinero sale físicamente del cajón, así que
 * se registra un retiro en efectivo sobre el corte abierto de la sucursal para
 * que el esperado del cierre cuadre. Medio: el efectivo usado en la venta; si
 * no hubo, el primer medio en efectivo activo. Sin medio en efectivo no se
 * registra movimiento (la devolución documenta la salida igualmente).
 */
async function registrarRetiroDevolucion(
  tx: PosDb,
  input: {
    organizacionId: string;
    sucursalId: string;
    ventaId: string;
    monto: number;
    notas: string;
    userId: string;
  },
) {
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
  if (!corteAbierto || input.monto <= 0) return;

  const [medioDeVenta] = await tx
    .select({ medioPagoId: detalleVentasMediosPagos.medioPagoId })
    .from(detalleVentasMediosPagos)
    .innerJoin(catMediosPago, eq(detalleVentasMediosPagos.medioPagoId, catMediosPago.id))
    .where(
      and(
        eq(detalleVentasMediosPagos.ventaId, input.ventaId),
        eq(detalleVentasMediosPagos.activo, true),
        eq(catMediosPago.categoria, "efectivo"),
      ),
    )
    .limit(1);
  const medioId =
    medioDeVenta?.medioPagoId ??
    (
      await tx
        .select({ id: catMediosPago.id })
        .from(catMediosPago)
        .where(
          and(
            eq(catMediosPago.organizacionId, input.organizacionId),
            eq(catMediosPago.categoria, "efectivo"),
            eq(catMediosPago.activo, true),
          ),
        )
        .limit(1)
    )[0]?.id;
  if (!medioId) return;

  await tx.insert(movimientosCaja).values({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    corteId: corteAbierto.id,
    medioPagoId: medioId,
    tipo: "retiro",
    monto: input.monto.toFixed(2),
    notas: input.notas,
    usuarioId: input.userId,
    createdBy: input.userId,
  });
}

async function descontarInventarioVenta(db: PosDb, venta: typeof ventas.$inferSelect, userId: string | null) {
  const lineasProductos = await db
    .select({ productoId: detalleVentasProductos.productoId, cantidad: detalleVentasProductos.cantidad })
    .from(detalleVentasProductos)
    .where(and(eq(detalleVentasProductos.ventaId, venta.id), eq(detalleVentasProductos.activo, true)));
  const lineasServicios = await db
    .select({ servicioId: detalleVentasServicios.servicioId, cantidad: detalleVentasServicios.cantidad })
    .from(detalleVentasServicios)
    .where(and(eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.activo, true)));

  for (const linea of lineasProductos) {
    const outcome = await applyInventoryMovement(db, {
      organizacionId: venta.organizacionId,
      sucursalId: venta.sucursalId,
      productoId: linea.productoId,
      ventaId: venta.id,
      tipo: "venta",
      cantidad: linea.cantidad,
      userId,
    });
    if (!outcome.success) throw new PosOperationError(outcome.error ?? "No se pudo descontar el producto.");
  }

  const servicioIds = lineasServicios.map((linea) => linea.servicioId);
  const insumos = servicioIds.length > 0
    ? await db
        .select({ servicioId: relServiciosInsumos.servicioId, productoId: relServiciosInsumos.productoId, cantidad: relServiciosInsumos.cantidad })
        .from(relServiciosInsumos)
        .where(and(inArray(relServiciosInsumos.servicioId, servicioIds), eq(relServiciosInsumos.activo, true)))
    : [];
  const porServicio = new Map<string, number>();
  for (const linea of lineasServicios) porServicio.set(linea.servicioId, (porServicio.get(linea.servicioId) ?? 0) + linea.cantidad);
  const consumo = new Map<string, number>();
  for (const insumo of insumos) {
    const veces = porServicio.get(insumo.servicioId) ?? 0;
    consumo.set(insumo.productoId, (consumo.get(insumo.productoId) ?? 0) + Number(insumo.cantidad) * veces);
  }
  for (const [productoId, cantidad] of consumo) {
    const outcome = await applyInventoryMovement(db, {
      organizacionId: venta.organizacionId,
      sucursalId: venta.sucursalId,
      productoId,
      ventaId: venta.id,
      tipo: "consumo",
      cantidad,
      notas: "Consumo por servicio vendido",
      userId,
    });
    if (!outcome.success) throw new PosOperationError(outcome.error ?? "No se pudo descontar el insumo.");
  }
}

export async function getOrCreateVentaDeCita(organizacionId: string, citaId: string): Promise<string | null> {
  const access = await checkPermission(organizacionId, "ventas.crear");
  if (!access) return null;
  const { user } = access;
  const db = getDatabase();

  return db.transaction(async (tx) => {
    const [cita] = await tx
      .select()
      .from(citas)
      .where(and(eq(citas.id, citaId), eq(citas.organizacionId, organizacionId), eq(citas.activo, true)))
      .limit(1)
      .for("update");
    if (!cita || !canAccessBranch(access, cita.sucursalId)) return null;

    const [existente] = await tx
      .select({ id: ventas.id })
      .from(ventas)
      .where(
        and(
          eq(ventas.citaId, cita.id),
          eq(ventas.organizacionId, organizacionId),
          eq(ventas.activo, true),
          // Una venta cancelada no bloquea reabrir el cobro de la cita.
          inArray(ventas.estado, ["en_proceso", "completada"]),
        ),
      )
      .limit(1);
    if (existente) return existente.id;

    const puedeIniciar = cita.estado === "en_proceso" || canTransitionEstado(cita.estado, "en_proceso");
    if (!puedeIniciar) return null;

    const serviciosCita = await tx
      .select({
        servicioId: detalleCitasServicios.servicioId,
        nombre: servicios.nombre,
        precio: detalleCitasServicios.precio,
      })
      .from(detalleCitasServicios)
      .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
      .where(and(eq(detalleCitasServicios.citaId, cita.id), eq(detalleCitasServicios.activo, true)));

    const [venta] = await tx
      .insert(ventas)
      .values({
        organizacionId,
        sucursalId: cita.sucursalId,
        citaId: cita.id,
        clienteId: cita.clienteId,
        usuarioId: cita.usuarioId,
        estado: "en_proceso",
        createdBy: user.id,
      })
      .returning({ id: ventas.id });

    for (const servicio of serviciosCita) {
      await tx.insert(detalleVentasServicios).values({
        ventaId: venta.id,
        servicioId: servicio.servicioId,
        usuarioId: cita.usuarioId,
        nombre: servicio.nombre,
        precio: servicio.precio,
        cantidad: 1,
        createdBy: user.id,
      });
    }
    await recalcularVenta(tx, venta.id, user.id);
    if (cita.estado !== "en_proceso") {
      await tx.update(citas).set({ estado: "en_proceso", updatedBy: user.id }).where(eq(citas.id, cita.id));
    }
    return venta.id;
  });
}

function safeAdminReturnTo(value: FormDataEntryValue | string | null | undefined, fallback: string) {
  const returnTo = String(value ?? "");
  return returnTo.startsWith("/admin/") && !returnTo.startsWith("//") ? returnTo : fallback;
}

export async function abrirVentaDeCita(formData: FormData) {
  const organizacionId = String(formData.get("organizacionId") ?? "");
  const citaId = String(formData.get("citaId") ?? "");
  const returnTo = safeAdminReturnTo(formData.get("returnTo"), `/admin/agenda?organizationId=${organizacionId}`);
  const ventaId = await getOrCreateVentaDeCita(organizacionId, citaId);
  if (ventaId) {
    const db = getDatabase();
    const [venta] = await db.select({ sucursalId: ventas.sucursalId }).from(ventas).where(eq(ventas.id, ventaId)).limit(1);
    const search = new URLSearchParams({ organizationId: organizacionId, ventaId, returnTo });
    if (venta?.sucursalId) search.set("sucursalId", venta.sucursalId);
    redirect(`/admin/pos?${search.toString()}`);
  }
  revalidatePath("/admin/agenda");
  redirect(returnTo);
}

/**
 * Variante sin redirect del "abrir venta": la usa el panel lateral de agenda
 * para abrir el checkout inline sin salir de la vista.
 */
export async function iniciarVentaDeCita(
  _previousState: ActionState<{ ventaId: string }>,
  formData: FormData,
): Promise<ActionState<{ ventaId: string }>> {
  const parsed = parseWithSchema(
    z.object({ organizacionId: z.string().uuid(), citaId: z.string().uuid() }),
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return parsed.state;
  const ventaId = await getOrCreateVentaDeCita(parsed.data.organizacionId, parsed.data.citaId);
  if (!ventaId) {
    return actionError("No se pudo abrir la venta. Revisa el estado de la cita.");
  }
  revalidatePath("/admin/agenda");
  return actionSuccess("Venta lista para cobrar.", { ventaId });
}

/** Datos del ticket para el checkout inline (sheet de agenda). */
export async function cargarTicket(
  organizacionId: string,
  ventaId: string,
): Promise<TicketData | null> {
  const access = await checkPermission(organizacionId, "ventas.ver");
  if (!access) return null;
  const ticket = await getTicketData(organizacionId, ventaId);
  if (!ticket || !canAccessBranch(access, ticket.venta.sucursalId)) return null;
  return {
    ...ticket,
    puedeCancelar: hasPermission(access, "ventas.cancelar"),
    puedeAjustarPago: hasPermission(access, "ventas.ajustar_pago") || hasPermission(access, "ventas.cancelar"),
    puedeFacturar: hasPermission(access, "facturacion.emitir"),
  };
}

const lineaSchema = z.object({
  organizacionId: z.string().uuid(),
  ventaId: z.string().uuid(),
});

const agregarServicioSchema = lineaSchema.extend({ servicioId: z.string().uuid() });
const agregarProductoSchema = lineaSchema.extend({
  productoId: z.string().uuid(),
  cantidad: z.coerce.number().int().min(1).max(999),
});
const quitarSchema = lineaSchema.extend({ detalleId: z.string().uuid() });
const descuentoSchema = lineaSchema.extend({ descuento: z.coerce.number().min(0) });

export async function agregarServicioVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(agregarServicioSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    const [servicio] = await tx
      .select({ precio: servicios.precioBase, nombre: servicios.nombre })
      .from(servicios)
      .where(and(eq(servicios.id, input.servicioId), eq(servicios.organizacionId, input.organizacionId), eq(servicios.activo, true)))
      .limit(1);
    if (!servicio) return actionError("Selecciona un servicio válido.");

    const [existente] = await tx
      .select({ id: detalleVentasServicios.id, cantidad: detalleVentasServicios.cantidad })
      .from(detalleVentasServicios)
      .where(and(eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.servicioId, input.servicioId), eq(detalleVentasServicios.activo, true)))
      .limit(1);
    if (existente) {
      await tx.update(detalleVentasServicios).set({ cantidad: existente.cantidad + 1, updatedBy: user.id }).where(eq(detalleVentasServicios.id, existente.id));
    } else {
      await tx.insert(detalleVentasServicios).values({ ventaId: venta.id, servicioId: input.servicioId, usuarioId: venta.usuarioId, nombre: servicio.nombre, precio: servicio.precio, cantidad: 1, createdBy: user.id });
    }
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess("Servicio agregado.");
  });

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

export async function agregarProductoVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(agregarProductoSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    const [producto] = await tx
      .select({ precio: productos.precioVenta, nombre: productos.nombre })
      .from(productos)
      .where(and(eq(productos.id, input.productoId), eq(productos.organizacionId, input.organizacionId), eq(productos.activo, true), eq(productos.visiblePos, true)))
      .limit(1);
    if (!producto) return actionError("Selecciona un producto válido.");

    const [existente] = await tx
      .select({ id: detalleVentasProductos.id, cantidad: detalleVentasProductos.cantidad })
      .from(detalleVentasProductos)
      .where(and(eq(detalleVentasProductos.ventaId, venta.id), eq(detalleVentasProductos.productoId, input.productoId), eq(detalleVentasProductos.activo, true)))
      .limit(1);
    if (existente) {
      await tx.update(detalleVentasProductos).set({ cantidad: existente.cantidad + input.cantidad, updatedBy: user.id }).where(eq(detalleVentasProductos.id, existente.id));
    } else {
      await tx.insert(detalleVentasProductos).values({ ventaId: venta.id, productoId: input.productoId, nombre: producto.nombre, precio: producto.precio, cantidad: input.cantidad, createdBy: user.id });
    }
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess("Producto agregado.");
  });

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

export async function quitarServicioVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(quitarSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    await tx
      .update(detalleVentasServicios)
      .set({ activo: false, updatedBy: user.id })
      .where(and(eq(detalleVentasServicios.id, input.detalleId), eq(detalleVentasServicios.ventaId, venta.id)));
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess("Servicio quitado.");
  });

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

export async function quitarProductoVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(quitarSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    await tx
      .update(detalleVentasProductos)
      .set({ activo: false, updatedBy: user.id })
      .where(and(eq(detalleVentasProductos.id, input.detalleId), eq(detalleVentasProductos.ventaId, venta.id)));
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess("Producto quitado.");
  });

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

const cantidadSchema = lineaSchema.extend({
  tipo: z.enum(["servicio", "producto"]),
  detalleId: z.string().uuid(),
  delta: z.coerce.number().int().min(-99).max(99),
});

export async function cambiarCantidadLinea(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(cantidadSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  if (input.delta === 0) return actionError("Cambio de cantidad inválido.");
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();
  const tabla = input.tipo === "servicio" ? detalleVentasServicios : detalleVentasProductos;

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    const [linea] = await tx
      .select({ id: tabla.id, cantidad: tabla.cantidad })
      .from(tabla)
      .where(and(eq(tabla.id, input.detalleId), eq(tabla.ventaId, venta.id), eq(tabla.activo, true)))
      .limit(1)
    if (!linea) return actionError("Línea no encontrada.");
    const nueva = linea.cantidad + input.delta;
    if (nueva <= 0) {
      await tx.update(tabla).set({ activo: false, updatedBy: user.id }).where(eq(tabla.id, linea.id));
    } else {
      await tx.update(tabla).set({ cantidad: nueva, updatedBy: user.id }).where(eq(tabla.id, linea.id));
    }
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess(nueva <= 0 ? "Línea eliminada." : "Cantidad actualizada.");
  });

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

const estilistaSchema = lineaSchema.extend({
  detalleId: z.string().uuid(),
  usuarioId: z.string().uuid().optional().or(z.literal("")),
});

export async function asignarEstilistaLinea(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(estilistaSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    if (input.usuarioId) {
      // El profesional debe ser miembro activo de la organización y estar
      // asignado a la sucursal de la venta (o no tener restricción).
      const [profesional] = await tx
        .select({ id: usuarios.id })
        .from(usuarios)
        .innerJoin(
          miembrosOrganizaciones,
          and(
            eq(miembrosOrganizaciones.usuarioId, usuarios.id),
            eq(miembrosOrganizaciones.organizacionId, input.organizacionId),
            eq(miembrosOrganizaciones.estado, "activo"),
          ),
        )
        .where(and(eq(usuarios.id, input.usuarioId), eq(usuarios.activo, true)))
        .limit(1);
      if (!profesional) return actionError("El profesional no pertenece a la organización.");
    }
    await tx
      .update(detalleVentasServicios)
      .set({ usuarioId: input.usuarioId || null, updatedBy: user.id })
      .where(and(eq(detalleVentasServicios.id, input.detalleId), eq(detalleVentasServicios.ventaId, venta.id)));
    return actionSuccess("Profesional asignado.");
  });

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

const pagoSchema = z.object({
  medioPagoId: z.string().uuid(),
  monto: z.coerce.number().positive("Monto inválido.").max(9_999_999),
  referencia: z.string().trim().max(120).optional().or(z.literal("")),
});

const cobroSchema = z.object({
  organizacionId: z.string().uuid(),
  ventaId: z.string().uuid(),
  pagos: z.string().min(2).max(4000),
  propina: z.coerce.number().min(0).max(9_999_999).default(0),
  // Clave generada por el formulario de cobro; un reenvío con la misma clave
  // devuelve el resultado original sin duplicar pagos ni movimientos.
  idempotencia: z.string().uuid().optional().or(z.literal("")),
  modo: z.enum(["inline"]).optional().or(z.literal("")),
  returnTo: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CobroActionState = ActionState<{ ventaId: string }>;

export async function cobrarVenta(_previousState: CobroActionState, formData: FormData): Promise<CobroActionState> {
  const parsed = parseWithSchema(cobroSchema, Object.fromEntries(formData.entries()), "Revisa los datos del cobro.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  // La lista puede ir vacía cuando un anticipo vigente cubre todo el total;
  // dentro de la transacción se exige al menos un pago si queda saldo.
  const pagosRaw = z.array(pagoSchema).min(0).max(8).safeParse(JSON.parse(input.pagos));
  if (!pagosRaw.success) {
    return actionError("Lista de pagos inválida.", { fieldErrors: { pagos: ["Revisa los pagos capturados."] } });
  }
  const pagosInput = pagosRaw.data;

  const access = await checkPermission(input.organizacionId, "ventas.cobrar");
  if (!access) return actionError("No tienes permiso para cobrar ventas.");
  const { user } = access;
  const db = getDatabase();

  let outcome: CobroActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CobroActionState> => {
      // Idempotencia: una repetición del mismo request devuelve el resultado
      // del primer cobro en lugar de insertar pagos/movimientos duplicados.
      const idem = await registrarClaveIdempotencia(tx, {
        organizacionId: input.organizacionId,
        clave: input.idempotencia || undefined,
        accion: "venta.cobrar",
      });
      if (idem.repetida) {
        const ventaId = typeof idem.resultado?.ventaId === "string" ? idem.resultado.ventaId : input.ventaId;
        return actionSuccess("Venta cobrada correctamente.", { ventaId });
      }

      const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
      if (!venta) return actionError("Venta no encontrada o ya cerrada.");
      if (!canAccessBranch(access, venta.sucursalId)) {
        return actionError("La venta pertenece a otra sucursal.");
      }

      const medioIds = [...new Set(pagosInput.map((p) => p.medioPagoId))];
      const medios = await tx
        .select()
        .from(catMediosPago)
        .where(and(inArray(catMediosPago.id, medioIds), eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.activo, true)));
      const mediosPorId = new Map(medios.map((m) => [m.id, m]));

      // `total` puede quedar en $0 cuando todas las líneas están cubiertas
      // por sesiones de paquete; el cobro sigue siendo válido sin pagos.
      const { subtotal, total, lineasActivas } = await recalcularVenta(tx, venta.id, user.id);
      if (lineasActivas === 0) return actionError("Agrega al menos un servicio o producto antes de cobrar.");

      // Las líneas de paquete/membresía requieren cliente: el saldo o la
      // vigencia se crean a su nombre.
      const lineasPaquetes = await tx
        .select({ id: detalleVentasPaquetes.id, paqueteId: detalleVentasPaquetes.paqueteId, cantidad: detalleVentasPaquetes.cantidad, nombre: detalleVentasPaquetes.nombre })
        .from(detalleVentasPaquetes)
        .where(and(eq(detalleVentasPaquetes.ventaId, venta.id), eq(detalleVentasPaquetes.activo, true)));
      if (lineasPaquetes.length > 0 && !venta.clienteId) {
        return actionError("Asigna un cliente a la venta: el paquete genera saldo a su nombre.");
      }
      const lineasMembresias = await tx
        .select({ id: detalleVentasMembresias.id, membresiaId: detalleVentasMembresias.membresiaId, cantidad: detalleVentasMembresias.cantidad, nombre: detalleVentasMembresias.nombre })
        .from(detalleVentasMembresias)
        .where(and(eq(detalleVentasMembresias.ventaId, venta.id), eq(detalleVentasMembresias.activo, true)));
      if (lineasMembresias.length > 0 && !venta.clienteId) {
        return actionError("Asigna un cliente a la venta: la membresía queda registrada a su nombre.");
      }

      // Última verificación de entitlements dentro del lock: un ticket
      // compuesto antes de un cambio de plan no puede cobrar lo que el plan
      // ya no incluye. El canje de sesiones/vigencias ya pagadas sí se honra.
      const suscripcion = await contextoSuscripcion(input.organizacionId, tx);
      if (lineasPaquetes.length > 0 && !tieneCapacidad(suscripcion, "paquetes")) {
        return actionError("El ticket vende un paquete y tu plan actual no los incluye. Quita la línea o cambia de plan.");
      }
      if (lineasMembresias.length > 0 && !tieneCapacidad(suscripcion, "membresias")) {
        return actionError("El ticket vende una membresía y tu plan actual no las incluye. Quita la línea o cambia de plan.");
      }
      if (venta.promocionId && !tieneCapacidad(suscripcion, "promociones")) {
        return actionError("El ticket tiene una promoción aplicada y tu plan actual no las incluye. Quita la promoción o cambia de plan.");
      }

      // Política de sucursal: si exige corte abierto para cobrar, el cobro se
      // rechaza antes de registrar cualquier pago (la tx no escribe nada).
      const [[sucursalRow], [corteAbierto]] = await Promise.all([
        tx
          .select({ exigirCorteParaCobrar: sucursales.exigirCorteParaCobrar, zonaHoraria: sucursales.zonaHoraria })
          .from(sucursales)
          .where(and(eq(sucursales.id, venta.sucursalId), eq(sucursales.organizacionId, input.organizacionId)))
          .limit(1),
        tx
          .select({ id: cortesCaja.id })
          .from(cortesCaja)
          .where(
            and(
              eq(cortesCaja.sucursalId, venta.sucursalId),
              eq(cortesCaja.organizacionId, input.organizacionId),
              eq(cortesCaja.estado, "abierto"),
              eq(cortesCaja.activo, true),
            ),
          )
          .limit(1),
      ]);
      if (sucursalRow?.exigirCorteParaCobrar && !corteAbierto) {
        return actionError("La sucursal exige un corte de caja abierto para cobrar. Abre caja primero.", {
          fieldErrors: { pagos: ["No hay corte abierto en esta sucursal."] },
        });
      }

      // Anticipos vigentes de la cita: se aplican completos contra el total
      // (la propina siempre se cobra aparte). Un anticipo que no cabe entero
      // queda vigente para devolución manual desde la cita.
      let anticipoAplicado = 0;
      const anticiposAplicados: string[] = [];
      if (venta.citaId) {
        const vigentes = await tx
          .select({ id: anticipos.id, monto: anticipos.monto })
          .from(anticipos)
          .where(
            and(
              eq(anticipos.citaId, venta.citaId),
              eq(anticipos.organizacionId, input.organizacionId),
              eq(anticipos.estado, "vigente"),
              eq(anticipos.activo, true),
            ),
          )
          .orderBy(asc(anticipos.createdAt))
          .for("update");
        const { aplicados, suma } = anticiposAplicables(vigentes, total);
        anticipoAplicado = suma;
        for (const ant of aplicados) anticiposAplicados.push(ant.id);
      }

      const propina = Math.round(input.propina * 100) / 100;
      const aCubrir = Math.max(Math.round((total + propina - anticipoAplicado) * 100) / 100, 0);
      const cobro = resolverCobroPagos({ pagos: pagosInput, aCubrir, mediosPorId });
      if (!cobro.ok) {
        return actionError(cobro.error, { fieldErrors: { pagos: [cobro.detalle ?? cobro.error] } });
      }

      // El `monto` persistido es lo aplicado a la venta y `recibido` lo
      // entregado; el cambio solo existe en pagos en efectivo.
      for (const linea of cobro.lineas) {
        await tx.insert(detalleVentasMediosPagos).values({
          ventaId: venta.id,
          medioPagoId: linea.medioPagoId,
          monto: linea.aplicado.toFixed(2),
          recibido: linea.recibido.toFixed(2),
          cambio: linea.cambio.toFixed(2),
          referencia: linea.referencia,
          createdBy: user.id,
        });
      }
      // Los anticipos quedan ligados a esta venta; si se cancela vuelven a
      // "vigente" para re-cobro o devolución.
      if (anticiposAplicados.length > 0) {
        await tx
          .update(anticipos)
          .set({ estado: "aplicado", ventaId: venta.id, updatedBy: user.id })
          .where(inArray(anticipos.id, anticiposAplicados));
      }

      // `corteAbierto` ya se resolvió arriba (política de corte exigido).
      await tx
        .update(ventas)
        .set({
          estado: "completada",
          cobradaAt: new Date(),
          corteId: corteAbierto?.id ?? null,
          subtotal: subtotal.toFixed(2),
          total: total.toFixed(2),
          propina: propina.toFixed(2),
          updatedBy: user.id,
        })
        .where(eq(ventas.id, venta.id));

      // Paquetes vendidos: generan saldo de sesiones para el cliente.
      if (lineasPaquetes.length > 0 && venta.clienteId) {
        const paqueteIds = [...new Set(lineasPaquetes.map((l) => l.paqueteId))];
        const defs = await tx
          .select({ id: paquetes.id, sesiones: paquetes.sesiones })
          .from(paquetes)
          .where(inArray(paquetes.id, paqueteIds));
        const sesionesPorPaquete = new Map(defs.map((d) => [d.id, d.sesiones]));
        for (const linea of lineasPaquetes) {
          const sesiones = sesionesPorPaquete.get(linea.paqueteId) ?? 0;
          for (let i = 0; i < linea.cantidad && sesiones > 0; i++) {
            await tx.insert(clientePaquetes).values({
              organizacionId: input.organizacionId,
              sucursalId: venta.sucursalId,
              clienteId: venta.clienteId,
              paqueteId: linea.paqueteId,
              ventaId: venta.id,
              sesionesTotal: sesiones,
              sesionesRestantes: sesiones,
              estado: "vigente",
              createdBy: user.id,
            });
          }
        }
      }

      // Membresías vendidas: vigencia desde hoy (zona de la sucursal) por
      // `duracion_dias` del catálogo, una membresía de cliente por unidad.
      if (lineasMembresias.length > 0 && venta.clienteId) {
        const membresiaIds = [...new Set(lineasMembresias.map((l) => l.membresiaId))];
        const defs = await tx
          .select({ id: membresias.id, duracionDias: membresias.duracionDias })
          .from(membresias)
          .where(inArray(membresias.id, membresiaIds));
        const duracionPorMembresia = new Map(defs.map((d) => [d.id, d.duracionDias]));
        const hoy = todayDateInput(sucursalRow?.zonaHoraria ?? undefined);
        for (const linea of lineasMembresias) {
          const duracion = duracionPorMembresia.get(linea.membresiaId) ?? 0;
          for (let i = 0; i < linea.cantidad && duracion > 0; i++) {
            await tx.insert(clienteMembresias).values({
              organizacionId: input.organizacionId,
              sucursalId: venta.sucursalId,
              clienteId: venta.clienteId,
              membresiaId: linea.membresiaId,
              ventaId: venta.id,
              vigenciaDesde: hoy,
              vigenciaHasta: sumarDias(hoy, duracion),
              estado: "vigente",
              createdBy: user.id,
            });
          }
        }
      }

      // Comisiones y reparto de propina por profesional.
      const lineasServicio = await tx
        .select({
          detalleId: detalleVentasServicios.id,
          servicioId: detalleVentasServicios.servicioId,
          usuarioId: detalleVentasServicios.usuarioId,
          precio: detalleVentasServicios.precio,
          cantidad: detalleVentasServicios.cantidad,
        })
        .from(detalleVentasServicios)
        .where(and(eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.activo, true)));

      const servicioIds = [...new Set(lineasServicio.map((l) => l.servicioId))];
      const reglas = servicioIds.length > 0
        ? await tx
            .select({ id: comisiones.id, servicioId: comisiones.servicioId, rolId: comisiones.rolId, tipo: comisiones.tipo, valor: comisiones.valor })
            .from(comisiones)
            .where(and(inArray(comisiones.servicioId, servicioIds), eq(comisiones.organizacionId, input.organizacionId), eq(comisiones.activo, true)))
        : [];
      const usuarioIds = [...new Set(lineasServicio.map((l) => l.usuarioId).filter((u): u is string => Boolean(u)))];
      const rolesPorUsuario = await getRolesPorUsuario(input.organizacionId, usuarioIds);

      const comisionesCalc = calcularComisiones(
        lineasServicio.map((l) => ({ ...l, precio: Number(l.precio) })),
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

      const propinasCalc = repartirPropina(propina, lineasServicio.map((l) => ({ ...l, precio: Number(l.precio) })), venta.usuarioId);
      for (const p of propinasCalc) {
        await tx.insert(detalleVentasPropinas).values({
          ventaId: venta.id,
          usuarioId: p.usuarioId,
          monto: p.monto.toFixed(2),
          createdBy: user.id,
        });
      }

      await descontarInventarioVenta(tx, venta, user.id);

      if (venta.citaId) {
        const [cita] = await tx
          .select({ id: citas.id, estado: citas.estado })
          .from(citas)
          .where(and(eq(citas.id, venta.citaId), eq(citas.organizacionId, input.organizacionId)))
          .limit(1);
        if (cita && cita.estado !== "completada") {
          if (!canTransitionEstado(cita.estado, "completada")) {
            throw new PosOperationError(`La cita está en estado "${cita.estado}" y no puede completarse.`);
          }
          await tx.update(citas).set({ estado: "completada", updatedBy: user.id }).where(eq(citas.id, cita.id));
        }
      }
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: venta.sucursalId,
        usuarioId: user.id,
        accion: "venta.cobrada",
        entidad: "venta",
        entidadId: venta.id,
        detalle: {
          total,
          subtotal,
          propina,
          cambio: cobro.cambioTotal,
          anticipo: anticipoAplicado,
          medios: pagosInput.map((p) => p.medioPagoId).length,
          paquetes: lineasPaquetes.length,
          membresias: lineasMembresias.length,
          citaId: venta.citaId,
        },
      });
      if (idem.claveId) {
        await tx
          .update(clavesIdempotencia)
          .set({ resultado: { ventaId: venta.id } })
          .where(eq(clavesIdempotencia.id, idem.claveId));
      }
      return actionSuccess("Venta cobrada correctamente.", { ventaId: venta.id });
      }),
    );
  } catch (error) {
    if (error instanceof PosOperationError) return actionError(error.message);
    console.error("cobrarVenta", error);
    return actionError("No se pudo cobrar la venta. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/agenda");
    revalidatePath("/admin/pos");
    revalidatePath("/admin/inventario");
    if (input.modo === "inline") {
      return outcome;
    }
    // redirect() del lado servidor: el formulario se desmonta al cerrar la
    // venta, así que un router.push en useEffect nunca llegaría a correr.
    redirect(
      safeAdminReturnTo(input.returnTo, `/admin/pos?organizationId=${input.organizacionId}`),
    );
  }
  return outcome;
}

const ajusteMedioPagoSchema = z.object({
  organizacionId: z.string().uuid(),
  ventaId: z.string().uuid(),
  pagoId: z.string().uuid(),
  medioPagoId: z.string().uuid(),
  monto: z.coerce.number().positive().max(9_999_999),
  motivo: z.string().trim().min(3, "Indica el motivo de la corrección.").max(500),
});

/** Reclasifica un pago sin editar el registro original ni alterar un corte cerrado. */
export async function ajustarMedioPagoVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(ajusteMedioPagoSchema, Object.fromEntries(formData.entries()), "Revisa la corrección del medio de pago.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  // `ventas.ajustar_pago` es el permiso explícito. El fallback temporal permite
  // operar organizaciones creadas antes de que se agregara el permiso; `access:seed`
  // sincroniza la relación para dejar solo el permiso específico.
  let access = await checkPermission(input.organizacionId, "ventas.ajustar_pago");
  if (!access) access = await checkPermission(input.organizacionId, "ventas.cancelar");
  if (!access) return actionError("No tienes permiso para corregir medios de pago.");
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<ActionState> => {
        const [venta] = await tx
          .select({ id: ventas.id, sucursalId: ventas.sucursalId, estado: ventas.estado, corteId: ventas.corteId })
          .from(ventas)
          .where(and(eq(ventas.id, input.ventaId), eq(ventas.organizacionId, input.organizacionId), eq(ventas.activo, true)))
          .limit(1)
          .for("update");
        if (!venta) return actionError("La venta no existe.");
        if (venta.estado !== "completada") return actionError("Solo se pueden corregir pagos de ventas cobradas.");
        if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");

        const [pago] = await tx
          .select({ id: detalleVentasMediosPagos.id, medioPagoId: detalleVentasMediosPagos.medioPagoId, monto: detalleVentasMediosPagos.monto })
          .from(detalleVentasMediosPagos)
          .where(and(eq(detalleVentasMediosPagos.id, input.pagoId), eq(detalleVentasMediosPagos.ventaId, venta.id), eq(detalleVentasMediosPagos.activo, true)))
          .limit(1)
          .for("update");
        if (!pago) return actionError("El pago no existe o ya no está activo.");
        if (pago.medioPagoId === input.medioPagoId) return actionError("Selecciona un medio de pago diferente.");

        const [medioDestino] = await tx
          .select({ id: catMediosPago.id })
          .from(catMediosPago)
          .where(and(eq(catMediosPago.id, input.medioPagoId), eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.activo, true)))
          .limit(1);
        if (!medioDestino) return actionError("El medio de pago destino no es válido.");

        const [ajustesPrevios] = await tx
          .select({ total: sql<string>`coalesce(sum(${ajustesPagosVenta.monto}), 0)` })
          .from(ajustesPagosVenta)
          .where(and(eq(ajustesPagosVenta.detalleVentaMedioPagoId, pago.id), eq(ajustesPagosVenta.ventaId, venta.id)));
        const restante = Math.round((Number(pago.monto) - Number(ajustesPrevios?.total ?? 0)) * 100) / 100;
        if (input.monto > restante + 0.005) {
          return actionError(`Solo quedan ${Math.max(restante, 0).toFixed(2)} por reclasificar en este pago.`);
        }

        await tx.insert(ajustesPagosVenta).values({
          organizacionId: input.organizacionId,
          sucursalId: venta.sucursalId,
          ventaId: venta.id,
          detalleVentaMedioPagoId: pago.id,
          medioPagoOrigenId: pago.medioPagoId,
          medioPagoDestinoId: input.medioPagoId,
          monto: input.monto.toFixed(2),
          motivo: input.motivo,
          usuarioId: user.id,
          corteOrigenId: venta.corteId,
          createdBy: user.id,
        });
        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: venta.sucursalId,
          usuarioId: user.id,
          accion: "venta.medio_pago_ajustado",
          entidad: "venta",
          entidadId: venta.id,
          detalle: { pagoId: pago.id, medioPagoOrigenId: pago.medioPagoId, medioPagoDestinoId: input.medioPagoId, monto: input.monto, motivo: input.motivo, corteOrigenId: venta.corteId },
        });
        return actionSuccess("Corrección de medio de pago registrada.", { ventaId: venta.id });
      }),
    );
  } catch (error) {
    console.error("ajustarMedioPagoVenta", error);
    return actionError("No se pudo corregir el medio de pago. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/pos");
    revalidatePath("/admin/ventas");
    revalidatePath("/admin/reportes");
  }
  return outcome;
}

export async function aplicarDescuento(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(descuentoSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    const { subtotal } = await recalcularVenta(tx, venta.id, user.id);
    const aplicado = Math.min(input.descuento, subtotal);
    await tx
      .update(ventas)
      .set({ descuento: aplicado.toFixed(2), updatedBy: user.id })
      .where(eq(ventas.id, venta.id));
    // Recalcular de nuevo: el total descuenta descuento manual + promoción.
    await recalcularVenta(tx, venta.id, user.id);
    await auditEvent(tx, {
      organizacionId: input.organizacionId,
      sucursalId: venta.sucursalId,
      usuarioId: user.id,
      accion: "venta.descuento",
      entidad: "venta",
      entidadId: venta.id,
      detalle: { descuento: aplicado, subtotal },
    });
    return actionSuccess("Descuento aplicado.");
  });

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

const promocionVentaSchema = z.object({
  organizacionId: z.string().uuid(),
  ventaId: z.string().uuid(),
  promocionId: z.string().uuid("Selecciona la promoción."),
});

/**
 * Liga una promoción vigente del catálogo al ticket. El descuento promocional
 * se calcula en `recalcularVenta` contra las líneas actuales, así que si el
 * ticket cambia después, la promoción se reevalúa sola.
 */
export async function aplicarPromocionVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(promocionVentaSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const negado = await requiereCapacidad(input.organizacionId, "promociones");
  if (negado) return actionError(negado);
  const { user } = access;
  const db = getDatabase();

  const outcome = await withDbRetry(() =>
    db.transaction(async (tx) => {
      const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
      if (!venta) return actionError("Venta no encontrada o ya cerrada.");
      if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");

      const [promo] = await tx
        .select({
          id: promociones.id,
          nombre: promociones.nombre,
          activo: promociones.activo,
          vigenciaDesde: promociones.vigenciaDesde,
          vigenciaHasta: promociones.vigenciaHasta,
        })
        .from(promociones)
        .where(and(eq(promociones.id, input.promocionId), eq(promociones.organizacionId, input.organizacionId)))
        .limit(1);
      if (!promo) return actionError("La promoción no existe.");

      const [sucursal] = await tx
        .select({ zonaHoraria: sucursales.zonaHoraria })
        .from(sucursales)
        .where(eq(sucursales.id, venta.sucursalId))
        .limit(1);
      const hoy = todayDateInput(sucursal?.zonaHoraria ?? undefined);
      if (!promocionVigente(promo, hoy)) {
        return actionError("La promoción está inactiva o fuera de vigencia.");
      }

      await tx
        .update(ventas)
        .set({ promocionId: promo.id, updatedBy: user.id })
        .where(eq(ventas.id, venta.id));
      const { subtotal, total } = await recalcularVenta(tx, venta.id, user.id);
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: venta.sucursalId,
        usuarioId: user.id,
        accion: "venta.promocion",
        entidad: "venta",
        entidadId: venta.id,
        detalle: { promocionId: promo.id, promocion: promo.nombre, subtotal, total },
      });
      return actionSuccess(`Promoción "${promo.nombre}" aplicada.`);
    }),
  );

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

/** Quita la promoción ligada al ticket (el descuento manual no se toca). */
export async function quitarPromocionVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(
    promocionVentaSchema.omit({ promocionId: true }),
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await withDbRetry(() =>
    db.transaction(async (tx) => {
      const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
      if (!venta) return actionError("Venta no encontrada o ya cerrada.");
      if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
      await tx
        .update(ventas)
        .set({ promocionId: null, descuentoPromocion: "0", updatedBy: user.id })
        .where(eq(ventas.id, venta.id));
      await recalcularVenta(tx, venta.id, user.id);
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: venta.sucursalId,
        usuarioId: user.id,
        accion: "venta.promocion_quitada",
        entidad: "venta",
        entidadId: venta.id,
      });
      return actionSuccess("Promoción retirada.");
    }),
  );

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

export async function crearVentaDirecta(formData: FormData) {
  const parsed = parseWithSchema(
    z.object({ organizacionId: z.string().uuid(), sucursalId: z.string().uuid() }),
    { organizacionId: formData.get("organizacionId"), sucursalId: formData.get("sucursalId") },
  );
  if (!parsed.success) redirect("/admin/pos");
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) redirect(`/admin/pos?organizationId=${input.organizacionId}`);
  const { user } = access;
  const db = getDatabase();
  const sucursalValida = await assertBranchScope(access, input.sucursalId);
  if (!sucursalValida) redirect(`/admin/pos?organizationId=${input.organizacionId}`);

  const [venta] = await db
    .insert(ventas)
    .values({ organizacionId: input.organizacionId, sucursalId: input.sucursalId, estado: "en_proceso", createdBy: user.id })
    .returning({ id: ventas.id });
  redirect(`/admin/pos?organizationId=${input.organizacionId}&sucursalId=${input.sucursalId}&ventaId=${venta.id}`);
}

const cancelarVentaSchema = z.object({
  organizacionId: z.string().uuid(),
  ventaId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Indica el motivo de la cancelación.").max(500),
});

/**
 * Cancela una venta cobrada generando documentos compensatorios: la venta
 * queda en estado "cancelada" (nunca se borra ni se editan sus líneas), se
 * registra la devolución con sus líneas, se revierte el stock de productos,
 * se anulan comisiones/propinas devengadas y la cita vuelve a "en_proceso"
 * para permitir un nuevo cobro. Los insumos consumidos NO regresan al stock
 * (físicamente ya se utilizaron); quedan en el historial de movimientos.
 */
export async function cancelarVentaCobrada(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(cancelarVentaSchema, Object.fromEntries(formData.entries()), "Revisa el motivo de cancelación.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "ventas.cancelar");
  if (!access) return actionError("No tienes permiso para cancelar ventas.");
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<ActionState> => {
        const [venta] = await tx
          .select()
          .from(ventas)
          .where(and(eq(ventas.id, input.ventaId), eq(ventas.organizacionId, input.organizacionId), eq(ventas.activo, true)))
          .limit(1)
          .for("update");
        if (!venta) return actionError("La venta no existe.");
        if (venta.estado !== "completada") {
          return actionError(venta.estado === "cancelada" ? "La venta ya fue cancelada." : "Solo se cancelan ventas cobradas.");
        }
        if (!canAccessBranch(access, venta.sucursalId)) {
          return actionError("La venta pertenece a otra sucursal.");
        }
        if (venta.corteId) {
          const [corte] = await tx
            .select({ estado: cortesCaja.estado })
            .from(cortesCaja)
            .where(eq(cortesCaja.id, venta.corteId))
            .limit(1);
          if (corte?.estado === "cerrado") {
            return actionError("La venta pertenece a un corte ya cerrado. Registra la devolución como movimiento de caja.");
          }
        }

        const montoDevuelto = Math.round((Number(venta.total) + Number(venta.propina)) * 100) / 100;
        // Lo que saldrá del cajón = lo cobrado en el momento de la venta (los
        // pagos registrados). Si un anticipo cubrió parte, ese dinero ya estaba
        // en caja desde el depósito y vuelve a quedar vigente, no se re-entrega.
        const pagosVenta = await tx
          .select({ monto: detalleVentasMediosPagos.monto })
          .from(detalleVentasMediosPagos)
          .where(and(eq(detalleVentasMediosPagos.ventaId, venta.id), eq(detalleVentasMediosPagos.activo, true)));
        const montoRetiro = Math.round(pagosVenta.reduce((s, p) => s + Number(p.monto), 0) * 100) / 100;

        const [lineasServicios, lineasProductos, lineasPaquetes, lineasMembresias, usosVenta] = await Promise.all([
          tx
            .select({ id: detalleVentasServicios.id, cantidad: detalleVentasServicios.cantidad, precio: detalleVentasServicios.precio })
            .from(detalleVentasServicios)
            .where(and(eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.activo, true))),
          tx
            .select({ id: detalleVentasProductos.id, productoId: detalleVentasProductos.productoId, cantidad: detalleVentasProductos.cantidad, precio: detalleVentasProductos.precio })
            .from(detalleVentasProductos)
            .where(and(eq(detalleVentasProductos.ventaId, venta.id), eq(detalleVentasProductos.activo, true))),
          tx
            .select({ id: detalleVentasPaquetes.id, cantidad: detalleVentasPaquetes.cantidad, precio: detalleVentasPaquetes.precio })
            .from(detalleVentasPaquetes)
            .where(and(eq(detalleVentasPaquetes.ventaId, venta.id), eq(detalleVentasPaquetes.activo, true))),
          tx
            .select({ id: detalleVentasMembresias.id, membresiaId: detalleVentasMembresias.membresiaId, cantidad: detalleVentasMembresias.cantidad, precio: detalleVentasMembresias.precio })
            .from(detalleVentasMembresias)
            .where(and(eq(detalleVentasMembresias.ventaId, venta.id), eq(detalleVentasMembresias.activo, true))),
          tx
            .select({ id: paqueteUsos.id, clientePaqueteId: paqueteUsos.clientePaqueteId, cantidad: paqueteUsos.cantidad })
            .from(paqueteUsos)
            .where(and(eq(paqueteUsos.ventaId, venta.id), eq(paqueteUsos.activo, true))),
        ]);

        // No se puede cancelar la compra de un paquete que ya consumió
        // sesiones en otra venta; primero se resuelven esos usos.
        const paquetesComprados = await tx
          .select({ id: clientePaquetes.id })
          .from(clientePaquetes)
          .where(and(eq(clientePaquetes.ventaId, venta.id), eq(clientePaquetes.organizacionId, input.organizacionId), ne(clientePaquetes.estado, "cancelado"), eq(clientePaquetes.activo, true)));
        let bloqueoPaquete = false;
        if (paquetesComprados.length > 0) {
          const [usoExterno] = await tx
            .select({ id: paqueteUsos.id })
            .from(paqueteUsos)
            .where(and(inArray(paqueteUsos.clientePaqueteId, paquetesComprados.map((p) => p.id)), eq(paqueteUsos.activo, true), ne(paqueteUsos.ventaId, venta.id)))
            .limit(1);
          bloqueoPaquete = Boolean(usoExterno);
        }

        // Ídem membresías: si el beneficio ya se aplicó en otra venta
        // cobrada del mismo cliente, cancelar la compra dejaría ese
        // descuento "gratis". Primero se resuelve esa venta.
        const membresiasCompradas = await tx
          .select({ id: clienteMembresias.id, membresiaId: clienteMembresias.membresiaId })
          .from(clienteMembresias)
          .where(and(eq(clienteMembresias.ventaId, venta.id), eq(clienteMembresias.organizacionId, input.organizacionId), ne(clienteMembresias.estado, "cancelado"), eq(clienteMembresias.activo, true)));
        let bloqueoMembresia = false;
        if (membresiasCompradas.length > 0 && venta.clienteId) {
          const [aplicadaEnOtra] = await tx
            .select({ id: ventas.id })
            .from(ventas)
            .where(and(inArray(ventas.membresiaId, membresiasCompradas.map((m) => m.membresiaId)), eq(ventas.clienteId, venta.clienteId), eq(ventas.estado, "completada"), eq(ventas.activo, true), ne(ventas.id, venta.id)))
            .limit(1);
          bloqueoMembresia = Boolean(aplicadaEnOtra);
        }
        const motivo = motivoBloqueoCancelacion({
          paqueteTieneUsosExternos: bloqueoPaquete,
          membresiaTieneAplicacionExterna: bloqueoMembresia,
        });
        if (motivo) return actionError(motivo);

        // Todas las validaciones que pueden rechazar la cancelación terminan
        // antes de crear la devolución. Así un `return actionError(...)` dentro
        // de la transacción no confirma un documento parcial.
        const [devolucion] = await tx
          .insert(devoluciones)
          .values({
            organizacionId: input.organizacionId,
            sucursalId: venta.sucursalId,
            ventaId: venta.id,
            monto: montoDevuelto.toFixed(2),
            motivo: input.motivo,
            usuarioId: user.id,
            createdBy: user.id,
          })
          .returning({ id: devoluciones.id });

        for (const linea of lineasServicios) {
          await tx.insert(detalleDevoluciones).values({
            devolucionId: devolucion.id,
            tipo: "servicio",
            detalleId: linea.id,
            cantidad: String(linea.cantidad),
            monto: (Number(linea.precio) * linea.cantidad).toFixed(2),
          });
        }
        for (const linea of lineasProductos) {
          await tx.insert(detalleDevoluciones).values({
            devolucionId: devolucion.id,
            tipo: "producto",
            detalleId: linea.id,
            cantidad: String(linea.cantidad),
            monto: (Number(linea.precio) * linea.cantidad).toFixed(2),
          });
          const outcomeStock = await applyInventoryMovement(tx, {
            organizacionId: input.organizacionId,
            sucursalId: venta.sucursalId,
            productoId: linea.productoId,
            ventaId: venta.id,
            tipo: "devolucion",
            cantidad: linea.cantidad,
            notas: `Devolución por cancelación de venta`,
            userId: user.id,
          });
          if (!outcomeStock.success) throw new PosOperationError(outcomeStock.error ?? "No se pudo revertir el stock.");
        }
        for (const linea of lineasPaquetes) {
          await tx.insert(detalleDevoluciones).values({
            devolucionId: devolucion.id,
            tipo: "paquete",
            detalleId: linea.id,
            cantidad: String(linea.cantidad),
            monto: (Number(linea.precio) * linea.cantidad).toFixed(2),
          });
        }
        for (const linea of lineasMembresias) {
          await tx.insert(detalleDevoluciones).values({
            devolucionId: devolucion.id,
            tipo: "membresia",
            detalleId: linea.id,
            cantidad: String(linea.cantidad),
            monto: (Number(linea.precio) * linea.cantidad).toFixed(2),
          });
        }

        // Sesiones consumidas en esta venta regresan al saldo del cliente.
        for (const uso of usosVenta) {
          await tx.update(paqueteUsos).set({ activo: false, updatedBy: user.id }).where(eq(paqueteUsos.id, uso.id));
          const [saldo] = await tx
            .select({ sesionesRestantes: clientePaquetes.sesionesRestantes })
            .from(clientePaquetes)
            .where(eq(clientePaquetes.id, uso.clientePaqueteId))
            .limit(1)
            .for("update");
          if (saldo) {
            await tx
              .update(clientePaquetes)
              .set({ sesionesRestantes: saldo.sesionesRestantes + uso.cantidad, estado: "vigente", updatedBy: user.id })
              .where(eq(clientePaquetes.id, uso.clientePaqueteId));
          }
        }
        // Los paquetes comprados en esta venta se cancelan (sin usos: el guard
        // de arriba garantiza que ninguno consumió sesiones fuera de la venta).
        if (paquetesComprados.length > 0) {
          await tx
            .update(clientePaquetes)
            .set({ estado: "cancelado", sesionesRestantes: 0, updatedBy: user.id })
            .where(inArray(clientePaquetes.id, paquetesComprados.map((p) => p.id)));
        }
        // Las membresías compradas en esta venta se cancelan: dejan de dar
        // beneficio en ventas futuras (las ya cobradas conservan su total).
        if (membresiasCompradas.length > 0) {
          await tx
            .update(clienteMembresias)
            .set({ estado: "cancelado", updatedBy: user.id })
            .where(inArray(clienteMembresias.id, membresiasCompradas.map((m) => m.id)));
        }

        // Comisiones y propinas devengadas quedan anuladas (trazabilidad: las
        // filas siguen existiendo con activo=false, no se borran).
        await tx
          .update(detalleVentasComisiones)
          .set({ activo: false, updatedBy: user.id })
          .where(eq(detalleVentasComisiones.ventaId, venta.id));
        await tx
          .update(detalleVentasPropinas)
          .set({ activo: false, updatedBy: user.id })
          .where(eq(detalleVentasPropinas.ventaId, venta.id));

        // La devolución sale del cajón si hay un corte abierto.
        await registrarRetiroDevolucion(tx, {
          organizacionId: input.organizacionId,
          sucursalId: venta.sucursalId,
          ventaId: venta.id,
          monto: montoRetiro,
          notas: `Devolución por cancelación de venta`,
          userId: user.id,
        });

        // Anticipos que se aplicaron a esta venta vuelven a vigente: el crédito
        // sigue en la cita para re-cobro o devolución manual.
        await tx
          .update(anticipos)
          .set({ estado: "vigente", ventaId: null, updatedBy: user.id })
          .where(and(eq(anticipos.ventaId, venta.id), eq(anticipos.estado, "aplicado")));

        await tx
          .update(ventas)
          .set({ estado: "cancelada", updatedBy: user.id })
          .where(eq(ventas.id, venta.id));

        // La cita vuelve a "en_proceso" para poder re-cobrarla si fue un error.
        if (venta.citaId) {
          await tx
            .update(citas)
            .set({ estado: "en_proceso", updatedBy: user.id })
            .where(and(eq(citas.id, venta.citaId), eq(citas.estado, "completada")));
        }

        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: venta.sucursalId,
          usuarioId: user.id,
          accion: "venta.cancelada",
          entidad: "venta",
          entidadId: venta.id,
          detalle: { montoDevuelto, motivo: input.motivo, devolucionId: devolucion.id },
        });
        return actionSuccess("Venta cancelada y devolución registrada.", { ventaId: venta.id });
      }),
    );
  } catch (error) {
    if (error instanceof PosOperationError) return actionError(error.message);
    console.error("cancelarVentaCobrada", error);
    return actionError("No se pudo cancelar la venta. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/pos");
    revalidatePath("/admin/agenda");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/caja");
  }
  return outcome;
}

const lineaDevolucionSchema = z.object({
  tipo: z.enum(["servicio", "producto", "paquete", "membresia"]),
  detalleId: z.string().uuid(),
  cantidad: z.coerce.number().positive("Cantidad inválida.").max(9999),
});

const devolverLineasSchema = z.object({
  organizacionId: z.string().uuid(),
  ventaId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Indica el motivo de la devolución.").max(500),
  lineas: z.string().min(2).max(4000),
});

/**
 * Devolución parcial por líneas: el cliente regresa parte del ticket. La venta
 * permanece "completada" (sus líneas son inmutables); se genera una devolución
 * con las líneas y cantidades elegidas, el stock de productos se revierte por
 * la cantidad devuelta y las comisiones de líneas de servicio devueltas por
 * completo quedan anuladas. El monto de cada línea se prorratea con el factor
 * neto del ticket (total/subtotal) para repartir el descuento manual.
 */
export async function devolverLineasVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(devolverLineasSchema, Object.fromEntries(formData.entries()), "Revisa los datos de la devolución.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const lineasRaw = z.array(lineaDevolucionSchema).min(1).max(50).safeParse(JSON.parse(input.lineas));
  if (!lineasRaw.success) return actionError("Selecciona al menos una línea a devolver.");
  const lineasInput = lineasRaw.data;

  const access = await checkPermission(input.organizacionId, "ventas.cancelar");
  if (!access) return actionError("No tienes permiso para registrar devoluciones.");
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<ActionState> => {
        const [venta] = await tx
          .select()
          .from(ventas)
          .where(and(eq(ventas.id, input.ventaId), eq(ventas.organizacionId, input.organizacionId), eq(ventas.activo, true)))
          .limit(1)
          .for("update");
        if (!venta) return actionError("La venta no existe.");
        if (venta.estado !== "completada") {
          return actionError(venta.estado === "cancelada" ? "La venta ya fue cancelada." : "Solo se pueden devolver ventas cobradas.");
        }
        if (!canAccessBranch(access, venta.sucursalId)) {
          return actionError("La venta pertenece a otra sucursal.");
        }
        if (venta.corteId) {
          const [corte] = await tx
            .select({ estado: cortesCaja.estado })
            .from(cortesCaja)
            .where(eq(cortesCaja.id, venta.corteId))
            .limit(1);
          if (corte?.estado === "cerrado") {
            return actionError("La venta pertenece a un corte ya cerrado. Registra la salida como movimiento de caja.");
          }
        }

        const [lineasServicios, lineasProductos, lineasPaquetes, lineasMembresias, usosVenta, devueltasPrevias] = await Promise.all([
          tx
            .select({ id: detalleVentasServicios.id, cantidad: detalleVentasServicios.cantidad, precio: detalleVentasServicios.precio })
            .from(detalleVentasServicios)
            .where(and(eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.activo, true))),
          tx
            .select({ id: detalleVentasProductos.id, productoId: detalleVentasProductos.productoId, cantidad: detalleVentasProductos.cantidad, precio: detalleVentasProductos.precio })
            .from(detalleVentasProductos)
            .where(and(eq(detalleVentasProductos.ventaId, venta.id), eq(detalleVentasProductos.activo, true))),
          tx
            .select({ id: detalleVentasPaquetes.id, paqueteId: detalleVentasPaquetes.paqueteId, cantidad: detalleVentasPaquetes.cantidad, precio: detalleVentasPaquetes.precio })
            .from(detalleVentasPaquetes)
            .where(and(eq(detalleVentasPaquetes.ventaId, venta.id), eq(detalleVentasPaquetes.activo, true))),
          tx
            .select({ id: detalleVentasMembresias.id, membresiaId: detalleVentasMembresias.membresiaId, cantidad: detalleVentasMembresias.cantidad, precio: detalleVentasMembresias.precio })
            .from(detalleVentasMembresias)
            .where(and(eq(detalleVentasMembresias.ventaId, venta.id), eq(detalleVentasMembresias.activo, true))),
          tx
            .select({ id: paqueteUsos.id, clientePaqueteId: paqueteUsos.clientePaqueteId, detalleVentaServicioId: paqueteUsos.detalleVentaServicioId, cantidad: paqueteUsos.cantidad })
            .from(paqueteUsos)
            .where(and(eq(paqueteUsos.ventaId, venta.id), eq(paqueteUsos.activo, true))),
          tx
            .select({ detalleId: detalleDevoluciones.detalleId, devuelta: detalleDevoluciones.cantidad })
            .from(detalleDevoluciones)
            .innerJoin(devoluciones, eq(detalleDevoluciones.devolucionId, devoluciones.id))
            .where(eq(devoluciones.ventaId, venta.id)),
        ]);
        const usoPorDetalle = new Map(usosVenta.map((u) => [u.detalleVentaServicioId, u]));

        // Cantidad ya devuelta por línea en devoluciones anteriores.
        const devueltoPorDetalle = new Map<string, number>();
        for (const row of devueltasPrevias) {
          if (!row.detalleId) continue;
          devueltoPorDetalle.set(row.detalleId, (devueltoPorDetalle.get(row.detalleId) ?? 0) + Number(row.devuelta));
        }

        const subtotalNum = Number(venta.subtotal);
        const factorNeto = subtotalNum > 0 ? Number(venta.total) / subtotalNum : 1;

        // Resuelve y valida cada línea pedida contra el ticket y lo ya devuelto.
        // Líneas cubiertas por paquete no regresan dinero: restauran sesiones.
        const resultado = resolverLineasDevolucion({
          solicitadas: lineasInput,
          ticketPorTipo: {
            servicio: lineasServicios,
            producto: lineasProductos,
            paquete: lineasPaquetes,
            membresia: lineasMembresias,
          },
          devueltasPrevias: devueltoPorDetalle,
          serviciosCubiertosPorPaquete: new Set(usosVenta.map((u) => u.detalleVentaServicioId)),
          factorNeto,
        });
        if (!resultado.ok) return actionError(resultado.error);
        const { resueltas, montoDevuelto } = resultado;

        const [devolucion] = await tx
          .insert(devoluciones)
          .values({
            organizacionId: input.organizacionId,
            sucursalId: venta.sucursalId,
            ventaId: venta.id,
            monto: montoDevuelto.toFixed(2),
            motivo: input.motivo,
            usuarioId: user.id,
            createdBy: user.id,
          })
          .returning({ id: devoluciones.id });

        for (const linea of resueltas) {
          await tx.insert(detalleDevoluciones).values({
            devolucionId: devolucion.id,
            tipo: linea.tipo,
            detalleId: linea.detalleId,
            cantidad: String(linea.cantidad),
            monto: linea.monto.toFixed(2),
          });
          if (linea.tipo === "producto" && linea.productoId) {
            const outcomeStock = await applyInventoryMovement(tx, {
              organizacionId: input.organizacionId,
              sucursalId: venta.sucursalId,
              productoId: linea.productoId,
              ventaId: venta.id,
              tipo: "devolucion",
              cantidad: linea.cantidad,
              notas: "Devolución parcial de venta",
              userId: user.id,
            });
            if (!outcomeStock.success) throw new PosOperationError(outcomeStock.error ?? "No se pudo revertir el stock.");
          }
          // Línea de servicio devuelta por completo: su comisión se anula.
          if (linea.tipo === "servicio" && linea.completa) {
            await tx
              .update(detalleVentasComisiones)
              .set({ activo: false, updatedBy: user.id })
              .where(eq(detalleVentasComisiones.detalleVentaServicioId, linea.detalleId));
          }
          // Línea cubierta por paquete: la devolución restaura la sesión al
          // saldo del cliente en lugar de regresar dinero.
          const uso = linea.tipo === "servicio" ? usoPorDetalle.get(linea.detalleId) : undefined;
          if (uso) {
            const restaurar = Math.min(linea.cantidad, uso.cantidad);
            if (linea.cantidad >= uso.cantidad) {
              await tx.update(paqueteUsos).set({ activo: false, updatedBy: user.id }).where(eq(paqueteUsos.id, uso.id));
            } else {
              await tx.update(paqueteUsos).set({ cantidad: uso.cantidad - linea.cantidad, updatedBy: user.id }).where(eq(paqueteUsos.id, uso.id));
            }
            const [saldo] = await tx
              .select({ sesionesRestantes: clientePaquetes.sesionesRestantes, sesionesTotal: clientePaquetes.sesionesTotal })
              .from(clientePaquetes)
              .where(eq(clientePaquetes.id, uso.clientePaqueteId))
              .limit(1)
              .for("update");
            if (saldo) {
              const nuevas = Math.min(saldo.sesionesRestantes + restaurar, saldo.sesionesTotal);
              await tx
                .update(clientePaquetes)
                .set({ sesionesRestantes: nuevas, estado: "vigente", updatedBy: user.id })
                .where(eq(clientePaquetes.id, uso.clientePaqueteId));
            }
          }
          // Línea de paquete: cancela unidades del saldo comprado en esta
          // venta. Solo se cancelan paquetes sin sesiones ya consumidas.
          if (linea.tipo === "paquete" && linea.paqueteId) {
            const comprados = await tx
              .select({ id: clientePaquetes.id })
              .from(clientePaquetes)
              .where(and(eq(clientePaquetes.ventaId, venta.id), eq(clientePaquetes.paqueteId, linea.paqueteId), ne(clientePaquetes.estado, "cancelado"), eq(clientePaquetes.activo, true)))
              .for("update");
            const usados = comprados.length
              ? await tx
                  .select({ clientePaqueteId: paqueteUsos.clientePaqueteId })
                  .from(paqueteUsos)
                  .where(and(inArray(paqueteUsos.clientePaqueteId, comprados.map((c) => c.id)), eq(paqueteUsos.activo, true)))
              : [];
            const conUsos = new Set(usados.map((u) => u.clientePaqueteId));
            const cancelables = comprados.filter((c) => !conUsos.has(c.id));
            if (cancelables.length < linea.cantidad) {
              throw new PosOperationError("El paquete ya consumió sesiones; no se puede devolver.");
            }
            await tx
              .update(clientePaquetes)
              .set({ estado: "cancelado", sesionesRestantes: 0, updatedBy: user.id })
              .where(inArray(clientePaquetes.id, cancelables.slice(0, linea.cantidad).map((c) => c.id)));
          }
          // Línea de membresía: cancela unidades vigentes compradas en esta
          // venta (el beneficio deja de aplicar en ventas futuras).
          if (linea.tipo === "membresia" && linea.membresiaId) {
            const vigentes = await tx
              .select({ id: clienteMembresias.id })
              .from(clienteMembresias)
              .where(and(eq(clienteMembresias.ventaId, venta.id), eq(clienteMembresias.membresiaId, linea.membresiaId), eq(clienteMembresias.estado, "vigente"), eq(clienteMembresias.activo, true)))
              .for("update");
            if (vigentes.length < linea.cantidad) {
              throw new PosOperationError("La membresía ya no está vigente o ya fue cancelada; no se puede devolver.");
            }
            await tx
              .update(clienteMembresias)
              .set({ estado: "cancelado", updatedBy: user.id })
              .where(inArray(clienteMembresias.id, vigentes.slice(0, linea.cantidad).map((c) => c.id)));
          }
        }

        // La devolución sale del cajón si hay un corte abierto.
        await registrarRetiroDevolucion(tx, {
          organizacionId: input.organizacionId,
          sucursalId: venta.sucursalId,
          ventaId: venta.id,
          monto: montoDevuelto,
          notas: `Devolución parcial de venta`,
          userId: user.id,
        });

        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: venta.sucursalId,
          usuarioId: user.id,
          accion: "venta.devolucion_parcial",
          entidad: "venta",
          entidadId: venta.id,
          detalle: { montoDevuelto, motivo: input.motivo, devolucionId: devolucion.id, lineas: resueltas.length },
        });
        return actionSuccess(`Devolución registrada por ${montoDevuelto.toFixed(2)}.`, { ventaId: venta.id });
      }),
    );
  } catch (error) {
    if (error instanceof PosOperationError) return actionError(error.message);
    console.error("devolverLineasVenta", error);
    return actionError("No se pudo registrar la devolución. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/pos");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/caja");
  }
  return outcome;
}

// ── Paquetes prepagados ─────────────────────────────────────────────────────

const asignarClienteSchema = lineaSchema.extend({ clienteId: z.string().uuid() });
const agregarPaqueteSchema = lineaSchema.extend({ paqueteId: z.string().uuid() });

/** Asigna (o cambia) el cliente de una venta en proceso. Requisito para
 * vender paquetes o consumir sesiones del cliente. */
export async function asignarClienteVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(asignarClienteSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    const [cliente] = await tx
      .select({ id: clientes.id, nombre: clientes.nombre })
      .from(clientes)
      .where(and(eq(clientes.id, input.clienteId), eq(clientes.organizacionId, input.organizacionId), eq(clientes.activo, true)))
      .limit(1);
    if (!cliente) return actionError("Selecciona un cliente válido.");
    await tx.update(ventas).set({ clienteId: cliente.id, updatedBy: user.id }).where(eq(ventas.id, venta.id));
    await auditEvent(tx, {
      organizacionId: input.organizacionId,
      sucursalId: venta.sucursalId,
      usuarioId: user.id,
      accion: "venta.cliente",
      entidad: "venta",
      entidadId: venta.id,
      detalle: { clienteId: cliente.id, clienteNombre: cliente.nombre },
    });
    return actionSuccess(`Cliente asignado: ${cliente.nombre}.`);
  });
  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

/** Agrega una línea de paquete prepagado al ticket. Requiere cliente asignado:
 * el saldo de sesiones se genera al cobrar a nombre de ese cliente. */
export async function agregarPaqueteVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(agregarPaqueteSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const negado = await requiereCapacidad(input.organizacionId, "paquetes");
  if (negado) return actionError(negado);
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    if (!venta.clienteId) return actionError("Asigna un cliente a la venta para vender un paquete.");
    const [paquete] = await tx
      .select({ precio: paquetes.precio, nombre: paquetes.nombre })
      .from(paquetes)
      .where(and(eq(paquetes.id, input.paqueteId), eq(paquetes.organizacionId, input.organizacionId), eq(paquetes.activo, true)))
      .limit(1);
    if (!paquete) return actionError("Selecciona un paquete válido.");

    const [existente] = await tx
      .select({ id: detalleVentasPaquetes.id, cantidad: detalleVentasPaquetes.cantidad })
      .from(detalleVentasPaquetes)
      .where(and(eq(detalleVentasPaquetes.ventaId, venta.id), eq(detalleVentasPaquetes.paqueteId, input.paqueteId), eq(detalleVentasPaquetes.activo, true)))
      .limit(1);
    if (existente) {
      await tx.update(detalleVentasPaquetes).set({ cantidad: existente.cantidad + 1, updatedBy: user.id }).where(eq(detalleVentasPaquetes.id, existente.id));
    } else {
      await tx.insert(detalleVentasPaquetes).values({ ventaId: venta.id, paqueteId: input.paqueteId, nombre: paquete.nombre, precio: paquete.precio, cantidad: 1, createdBy: user.id });
    }
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess("Paquete agregado al ticket.");
  });
  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

export async function quitarPaqueteVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(quitarSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    await tx
      .update(detalleVentasPaquetes)
      .set({ activo: false, updatedBy: user.id })
      .where(and(eq(detalleVentasPaquetes.id, input.detalleId), eq(detalleVentasPaquetes.ventaId, venta.id)));
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess("Paquete quitado del ticket.");
  });
  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

/**
 * Consume sesiones del paquete del cliente para cubrir una línea de servicio:
 * la línea deja de sumar al subtotal (queda "pagada" con el prepago) y el
 * saldo del paquete baja. Elección FIFO entre los paquetes vigentes que
 * cubren el servicio. `quitarPaqueteDeLinea` revierte el consumo.
 */
export async function usarPaqueteEnLinea(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(quitarSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await withDbRetry(() =>
    db.transaction(async (tx) => {
      const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
      if (!venta) return actionError("Venta no encontrada o ya cerrada.");
      if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
      if (!venta.clienteId) return actionError("Asigna un cliente a la venta para usar su paquete.");
      const [linea] = await tx
        .select({ id: detalleVentasServicios.id, servicioId: detalleVentasServicios.servicioId, cantidad: detalleVentasServicios.cantidad })
        .from(detalleVentasServicios)
        .where(and(eq(detalleVentasServicios.id, input.detalleId), eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.activo, true)))
        .limit(1);
      if (!linea) return actionError("La línea ya no pertenece a la venta.");
      const [usoPrevio] = await tx
        .select({ id: paqueteUsos.id })
        .from(paqueteUsos)
        .where(and(eq(paqueteUsos.detalleVentaServicioId, linea.id), eq(paqueteUsos.activo, true)))
        .limit(1);
      if (usoPrevio) return actionError("La línea ya está cubierta por un paquete.");

      const saldos = await tx
        .select({ id: clientePaquetes.id, servicioId: paquetes.servicioId, sesionesRestantes: clientePaquetes.sesionesRestantes })
        .from(clientePaquetes)
        .innerJoin(paquetes, eq(clientePaquetes.paqueteId, paquetes.id))
        .where(
          and(
            eq(clientePaquetes.organizacionId, input.organizacionId),
            eq(clientePaquetes.clienteId, venta.clienteId),
            eq(clientePaquetes.estado, "vigente"),
            eq(clientePaquetes.activo, true),
            eq(paquetes.servicioId, linea.servicioId),
          ),
        )
        .orderBy(asc(clientePaquetes.createdAt))
        .for("update");
      const elegido = elegirPaqueteParaServicio(saldos, linea.servicioId, linea.cantidad);
      if (!elegido) return actionError("El cliente no tiene sesiones disponibles para este servicio.");

      const restantes = restarSesiones(elegido.sesionesRestantes, linea.cantidad);
      await tx
        .update(clientePaquetes)
        .set({ sesionesRestantes: restantes, estado: estadoTrasUso(restantes), updatedBy: user.id })
        .where(eq(clientePaquetes.id, elegido.id));
      await tx.insert(paqueteUsos).values({
        organizacionId: input.organizacionId,
        clientePaqueteId: elegido.id,
        ventaId: venta.id,
        detalleVentaServicioId: linea.id,
        cantidad: linea.cantidad,
        createdBy: user.id,
      });
      await recalcularVenta(tx, venta.id, user.id);
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: venta.sucursalId,
        usuarioId: user.id,
        accion: "paquete.uso",
        entidad: "cliente_paquete",
        entidadId: elegido.id,
        detalle: { ventaId: venta.id, detalleId: linea.id, cantidad: linea.cantidad, restantes },
      });
      return actionSuccess("Sesión de paquete aplicada a la línea.");
    }),
  );
  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

/** Libera el consumo de paquete de una línea: la sesión regresa al saldo del
 * cliente y la línea vuelve a cobrarse. */
export async function quitarPaqueteDeLinea(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(quitarSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await withDbRetry(() =>
    db.transaction(async (tx) => {
      const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
      if (!venta) return actionError("Venta no encontrada o ya cerrada.");
      if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
      const [uso] = await tx
        .select({ id: paqueteUsos.id, clientePaqueteId: paqueteUsos.clientePaqueteId, cantidad: paqueteUsos.cantidad })
        .from(paqueteUsos)
        .where(and(eq(paqueteUsos.detalleVentaServicioId, input.detalleId), eq(paqueteUsos.ventaId, venta.id), eq(paqueteUsos.activo, true)))
        .limit(1);
      if (!uso) return actionError("La línea no está cubierta por un paquete.");

      await tx.update(paqueteUsos).set({ activo: false, updatedBy: user.id }).where(eq(paqueteUsos.id, uso.id));
      const [saldo] = await tx
        .select({ sesionesRestantes: clientePaquetes.sesionesRestantes })
        .from(clientePaquetes)
        .where(eq(clientePaquetes.id, uso.clientePaqueteId))
        .limit(1)
        .for("update");
      if (saldo) {
        await tx
          .update(clientePaquetes)
          .set({ sesionesRestantes: saldo.sesionesRestantes + uso.cantidad, estado: "vigente", updatedBy: user.id })
          .where(eq(clientePaquetes.id, uso.clientePaqueteId));
      }
      await recalcularVenta(tx, venta.id, user.id);
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: venta.sucursalId,
        usuarioId: user.id,
        accion: "paquete.uso_liberado",
        entidad: "cliente_paquete",
        entidadId: uso.clientePaqueteId,
        detalle: { ventaId: venta.id, detalleId: input.detalleId, cantidad: uso.cantidad },
      });
      return actionSuccess("Sesión devuelta al paquete del cliente.");
    }),
  );
  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

// ── Membresías ───────────────────────────────────────────────────────────────

const agregarMembresiaSchema = lineaSchema.extend({ membresiaId: z.string().uuid() });
const aplicarMembresiaSchema = lineaSchema.extend({ clienteMembresiaId: z.string().uuid() });

/** Agrega una línea de membresía al ticket. Requiere cliente asignado: la
 * vigencia se crea a su nombre al cobrar. */
export async function agregarMembresiaVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(agregarMembresiaSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const negado = await requiereCapacidad(input.organizacionId, "membresias");
  if (negado) return actionError(negado);
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    if (!venta.clienteId) return actionError("Asigna un cliente a la venta para vender una membresía.");
    const [membresia] = await tx
      .select({ precio: membresias.precio, nombre: membresias.nombre })
      .from(membresias)
      .where(and(eq(membresias.id, input.membresiaId), eq(membresias.organizacionId, input.organizacionId), eq(membresias.activo, true)))
      .limit(1);
    if (!membresia) return actionError("Selecciona una membresía válida.");

    const [existente] = await tx
      .select({ id: detalleVentasMembresias.id, cantidad: detalleVentasMembresias.cantidad })
      .from(detalleVentasMembresias)
      .where(and(eq(detalleVentasMembresias.ventaId, venta.id), eq(detalleVentasMembresias.membresiaId, input.membresiaId), eq(detalleVentasMembresias.activo, true)))
      .limit(1);
    if (existente) {
      await tx.update(detalleVentasMembresias).set({ cantidad: existente.cantidad + 1, updatedBy: user.id }).where(eq(detalleVentasMembresias.id, existente.id));
    } else {
      await tx.insert(detalleVentasMembresias).values({ ventaId: venta.id, membresiaId: input.membresiaId, nombre: membresia.nombre, precio: membresia.precio, cantidad: 1, createdBy: user.id });
    }
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess("Membresía agregada al ticket.");
  });
  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

export async function quitarMembresiaVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(quitarSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await db.transaction(async (tx) => {
    const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
    if (!venta) return actionError("Venta no encontrada o ya cerrada.");
    if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
    await tx
      .update(detalleVentasMembresias)
      .set({ activo: false, updatedBy: user.id })
      .where(and(eq(detalleVentasMembresias.id, input.detalleId), eq(detalleVentasMembresias.ventaId, venta.id)));
    await recalcularVenta(tx, venta.id, user.id);
    return actionSuccess("Membresía quitada del ticket.");
  });
  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

/**
 * Aplica la membresía vigente del cliente al ticket: `ventas.membresia_id`
 * guarda el catálogo de la membresía elegida y `recalcularVenta` calcula el
 * descuento porcentual sobre el subtotal elegible en cada cambio de líneas.
 */
export async function aplicarMembresiaVenta(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(aplicarMembresiaSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await withDbRetry(() =>
    db.transaction(async (tx) => {
      const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
      if (!venta) return actionError("Venta no encontrada o ya cerrada.");
      if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
      if (!venta.clienteId) return actionError("Asigna un cliente a la venta para usar su membresía.");

      const [clienteMembresia] = await tx
        .select({
          id: clienteMembresias.id,
          membresiaId: clienteMembresias.membresiaId,
          estado: clienteMembresias.estado,
          vigenciaDesde: clienteMembresias.vigenciaDesde,
          vigenciaHasta: clienteMembresias.vigenciaHasta,
          nombre: membresias.nombre,
        })
        .from(clienteMembresias)
        .innerJoin(membresias, eq(clienteMembresias.membresiaId, membresias.id))
        .where(and(
          eq(clienteMembresias.id, input.clienteMembresiaId),
          eq(clienteMembresias.organizacionId, input.organizacionId),
          eq(clienteMembresias.clienteId, venta.clienteId),
          eq(clienteMembresias.activo, true),
        ))
        .limit(1);
      if (!clienteMembresia) return actionError("La membresía no pertenece al cliente de la venta.");

      const [sucursal] = await tx
        .select({ zonaHoraria: sucursales.zonaHoraria })
        .from(sucursales)
        .where(eq(sucursales.id, venta.sucursalId))
        .limit(1);
      const hoy = todayDateInput(sucursal?.zonaHoraria ?? undefined);
      if (!membresiaVigente(clienteMembresia, hoy)) {
        return actionError("La membresía está cancelada o fuera de vigencia.");
      }

      await tx
        .update(ventas)
        .set({ membresiaId: clienteMembresia.membresiaId, updatedBy: user.id })
        .where(eq(ventas.id, venta.id));
      const { subtotal, total } = await recalcularVenta(tx, venta.id, user.id);
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: venta.sucursalId,
        usuarioId: user.id,
        accion: "venta.membresia",
        entidad: "venta",
        entidadId: venta.id,
        detalle: { clienteMembresiaId: clienteMembresia.id, membresiaId: clienteMembresia.membresiaId, membresia: clienteMembresia.nombre, subtotal, total },
      });
      return actionSuccess(`Membresía "${clienteMembresia.nombre}" aplicada.`);
    }),
  );

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

/** Quita la membresía ligada al ticket (descuento y promoción no se tocan). */
export async function quitarMembresiaAplicada(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(
    aplicarMembresiaSchema.omit({ clienteMembresiaId: true }),
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "ventas.crear");
  if (!access) return actionError("No tienes permiso para editar ventas.");
  const { user } = access;
  const db = getDatabase();

  const outcome = await withDbRetry(() =>
    db.transaction(async (tx) => {
      const venta = await lockVentaEditable(tx, input.organizacionId, input.ventaId);
      if (!venta) return actionError("Venta no encontrada o ya cerrada.");
      if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
      await tx
        .update(ventas)
        .set({ membresiaId: null, descuentoMembresia: "0", updatedBy: user.id })
        .where(eq(ventas.id, venta.id));
      await recalcularVenta(tx, venta.id, user.id);
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: venta.sucursalId,
        usuarioId: user.id,
        accion: "venta.membresia_quitada",
        entidad: "venta",
        entidadId: venta.id,
      });
      return actionSuccess("Membresía retirada.");
    }),
  );

  if (outcome.success) revalidatePath("/admin/pos");
  return outcome;
}

// ── Anticipos (depósitos de cita) ────────────────────────────────────────────

export type CitaAnticipo = {
  id: string;
  monto: string;
  estado: string;
  medioNombre: string | null;
  notas: string | null;
  createdAt: Date;
};

/**
 * Datos del panel lateral de agenda: anticipos de la cita, medios de pago
 * disponibles y permisos resueltos del usuario que consulta.
 */
export async function getCitaAnticipos(
  formData: FormData,
): Promise<
  | { success: true; anticipos: CitaAnticipo[]; mediosPago: Array<{ id: string; nombre: string; categoria: string }>; puedeCobrar: boolean; puedeDevolver: boolean }
  | { success: false; error: string }
> {
  const parsed = parseWithSchema(
    z.object({ organizacionId: z.string().uuid(), citaId: z.string().uuid() }),
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "agenda.ver");
  if (!access) return { success: false, error: "No tienes permiso para ver la agenda." };
  const db = getDatabase();

  const [cita] = await db
    .select({ sucursalId: citas.sucursalId })
    .from(citas)
    .where(and(eq(citas.id, input.citaId), eq(citas.organizacionId, input.organizacionId), eq(citas.activo, true)))
    .limit(1);
  if (!cita || !canAccessBranch(access, cita.sucursalId)) {
    return { success: false, error: "La cita no existe." };
  }

  const [anticipoRows, mediosPago] = await Promise.all([
    db
      .select({
        id: anticipos.id,
        monto: anticipos.monto,
        estado: anticipos.estado,
        notas: anticipos.notas,
        createdAt: anticipos.createdAt,
        medioNombre: catMediosPago.nombre,
      })
      .from(anticipos)
      .leftJoin(catMediosPago, eq(anticipos.medioPagoId, catMediosPago.id))
      .where(and(eq(anticipos.citaId, input.citaId), eq(anticipos.organizacionId, input.organizacionId), eq(anticipos.activo, true)))
      .orderBy(asc(anticipos.createdAt)),
    db
      .select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria })
      .from(catMediosPago)
      .where(and(eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.activo, true)))
      .orderBy(asc(catMediosPago.nombre)),
  ]);

  return {
    success: true,
    anticipos: anticipoRows,
    mediosPago,
    puedeCobrar: hasPermission(access, "ventas.cobrar"),
    puedeDevolver: hasPermission(access, "ventas.cancelar"),
  };
}

const anticipoSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  monto: z.coerce.number().positive("Indica un monto mayor a cero.").max(999_999),
  medioPagoId: z.string().uuid("Selecciona el medio de pago."),
  referencia: z.string().trim().max(120).optional().or(z.literal("")),
  notas: z.string().trim().max(500).optional().or(z.literal("")),
  idempotencia: z.string().uuid().optional().or(z.literal("")),
});

/**
 * Cobra un anticipo/depósito sobre una cita. El dinero entra al cajón del
 * corte abierto como movimiento de entrada por su medio de pago; si la
 * sucursal exige corte para cobrar y no hay, se rechaza (misma política del
 * POS). Se aplica automáticamente al cobrar la venta de la cita.
 */
export async function cobrarAnticipo(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(anticipoSchema, Object.fromEntries(formData.entries()), "Revisa los datos del anticipo.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "ventas.cobrar");
  if (!access) return actionError("No tienes permiso para cobrar anticipos.");
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<ActionState> => {
        const idem = await registrarClaveIdempotencia(tx, {
          organizacionId: input.organizacionId,
          clave: input.idempotencia || undefined,
          accion: "anticipo.cobrar",
        });
        if (idem.repetida) return actionSuccess("Anticipo registrado correctamente.");

        const [cita] = await tx
          .select()
          .from(citas)
          .where(and(eq(citas.id, input.citaId), eq(citas.organizacionId, input.organizacionId), eq(citas.activo, true)))
          .limit(1)
          .for("update");
        if (!cita) return actionError("La cita no existe.");
        if (!canAccessBranch(access, cita.sucursalId)) {
          return actionError("La cita pertenece a otra sucursal.");
        }
        if (!["pendiente", "confirmada", "en_proceso"].includes(cita.estado)) {
          return actionError(`No se puede cobrar anticipo de una cita "${cita.estado}".`);
        }
        const [ventaCobrada] = await tx
          .select({ id: ventas.id })
          .from(ventas)
          .where(and(eq(ventas.citaId, cita.id), eq(ventas.organizacionId, input.organizacionId), eq(ventas.estado, "completada"), eq(ventas.activo, true)))
          .limit(1);
        if (ventaCobrada) return actionError("La cita ya tiene una venta cobrada.");

        const [medio] = await tx
          .select()
          .from(catMediosPago)
          .where(and(eq(catMediosPago.id, input.medioPagoId), eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.activo, true)))
          .limit(1);
        if (!medio) return actionError("El medio de pago no es válido.");
        if (medio.categoria !== "efectivo" && !input.referencia) {
          return actionError(`El medio "${medio.nombre}" requiere referencia.`, {
            fieldErrors: { referencia: ["Captura el folio o autorización."] },
          });
        }

        const [[sucursalRow], [corteAbierto]] = await Promise.all([
          tx
            .select({ exigirCorteParaCobrar: sucursales.exigirCorteParaCobrar })
            .from(sucursales)
            .where(and(eq(sucursales.id, cita.sucursalId), eq(sucursales.organizacionId, input.organizacionId)))
            .limit(1),
          tx
            .select({ id: cortesCaja.id })
            .from(cortesCaja)
            .where(
              and(
                eq(cortesCaja.sucursalId, cita.sucursalId),
                eq(cortesCaja.organizacionId, input.organizacionId),
                eq(cortesCaja.estado, "abierto"),
                eq(cortesCaja.activo, true),
              ),
            )
            .limit(1),
        ]);
        if (sucursalRow?.exigirCorteParaCobrar && !corteAbierto) {
          return actionError("La sucursal exige un corte de caja abierto para cobrar. Abre caja primero.");
        }

        const monto = Math.round(input.monto * 100) / 100;
        const [anticipo] = await tx
          .insert(anticipos)
          .values({
            organizacionId: input.organizacionId,
            sucursalId: cita.sucursalId,
            citaId: cita.id,
            clienteId: cita.clienteId,
            monto: monto.toFixed(2),
            medioPagoId: input.medioPagoId,
            referencia: input.referencia || null,
            corteId: corteAbierto?.id ?? null,
            estado: "vigente",
            notas: input.notas || null,
            usuarioId: user.id,
            createdBy: user.id,
          })
          .returning({ id: anticipos.id });

        // El depósito entra físicamente al cajón: entrada sobre el corte
        // abierto para que el esperado del cierre lo incluya.
        if (corteAbierto) {
          await tx.insert(movimientosCaja).values({
            organizacionId: input.organizacionId,
            sucursalId: cita.sucursalId,
            corteId: corteAbierto.id,
            medioPagoId: input.medioPagoId,
            tipo: "entrada",
            monto: monto.toFixed(2),
            notas: `Anticipo de cita${input.notas ? ` — ${input.notas}` : ""}`,
            usuarioId: user.id,
            createdBy: user.id,
          });
        }

        await tx.insert(citasHistorial).values({
          citaId: cita.id,
          organizacionId: input.organizacionId,
          usuarioId: user.id,
          accion: "anticipo",
          detalle: { monto, medio: medio.nombre },
        });
        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: cita.sucursalId,
          usuarioId: user.id,
          accion: "anticipo.cobrado",
          entidad: "anticipo",
          entidadId: anticipo.id,
          detalle: { monto, citaId: cita.id, medioPagoId: input.medioPagoId, corteId: corteAbierto?.id ?? null },
        });
        return actionSuccess("Anticipo registrado correctamente.");
      }),
    );
  } catch (error) {
    if (error instanceof PosOperationError) return actionError(error.message);
    console.error("cobrarAnticipo", error);
    return actionError("No se pudo registrar el anticipo. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/agenda");
    revalidatePath("/admin/caja");
    revalidatePath("/admin/pos");
  }
  return outcome;
}

const devolverAnticipoSchema = z.object({
  organizacionId: z.string().uuid(),
  anticipoId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Indica el motivo de la devolución.").max(500),
});

/**
 * Devuelve un anticipo vigente (la cita no se concretó o se cobró de más).
 * Si hay un corte abierto registra el retiro del cajón por el mismo medio
 * con el que se cobró el depósito.
 */
export async function devolverAnticipo(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(devolverAnticipoSchema, Object.fromEntries(formData.entries()), "Revisa los datos.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "ventas.cancelar");
  if (!access) return actionError("No tienes permiso para devolver anticipos.");
  const { user } = access;
  const db = getDatabase();

  let outcome: ActionState;
  try {
    outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<ActionState> => {
        const [anticipo] = await tx
          .select()
          .from(anticipos)
          .where(and(eq(anticipos.id, input.anticipoId), eq(anticipos.organizacionId, input.organizacionId), eq(anticipos.activo, true)))
          .limit(1)
          .for("update");
        if (!anticipo) return actionError("El anticipo no existe.");
        if (!canAccessBranch(access, anticipo.sucursalId)) {
          return actionError("El anticipo pertenece a otra sucursal.");
        }
        if (anticipo.estado !== "vigente") {
          return actionError(
            anticipo.estado === "aplicado"
              ? "El anticipo ya se aplicó a una venta; cancela la venta para liberarlo."
              : "El anticipo ya fue devuelto.",
          );
        }

        const [corteAbierto] = await tx
          .select({ id: cortesCaja.id })
          .from(cortesCaja)
          .where(
            and(
              eq(cortesCaja.sucursalId, anticipo.sucursalId),
              eq(cortesCaja.organizacionId, input.organizacionId),
              eq(cortesCaja.estado, "abierto"),
              eq(cortesCaja.activo, true),
            ),
          )
          .limit(1);
        if (corteAbierto) {
          await tx.insert(movimientosCaja).values({
            organizacionId: input.organizacionId,
            sucursalId: anticipo.sucursalId,
            corteId: corteAbierto.id,
            medioPagoId: anticipo.medioPagoId,
            tipo: "retiro",
            monto: anticipo.monto,
            notas: `Devolución de anticipo — ${input.motivo}`,
            usuarioId: user.id,
            createdBy: user.id,
          });
        }

        await tx
          .update(anticipos)
          .set({ estado: "devuelto", notas: input.motivo, updatedBy: user.id })
          .where(eq(anticipos.id, anticipo.id));

        await tx.insert(citasHistorial).values({
          citaId: anticipo.citaId,
          organizacionId: input.organizacionId,
          usuarioId: user.id,
          accion: "anticipo_devuelto",
          detalle: { monto: Number(anticipo.monto), motivo: input.motivo },
        });
        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: anticipo.sucursalId,
          usuarioId: user.id,
          accion: "anticipo.devuelto",
          entidad: "anticipo",
          entidadId: anticipo.id,
          detalle: { monto: Number(anticipo.monto), motivo: input.motivo, citaId: anticipo.citaId },
        });
        return actionSuccess("Anticipo devuelto correctamente.");
      }),
    );
  } catch (error) {
    if (error instanceof PosOperationError) return actionError(error.message);
    console.error("devolverAnticipo", error);
    return actionError("No se pudo devolver el anticipo. Intenta de nuevo.");
  }

  if (outcome.success) {
    revalidatePath("/admin/agenda");
    revalidatePath("/admin/caja");
    revalidatePath("/admin/pos");
  }
  return outcome;
}
