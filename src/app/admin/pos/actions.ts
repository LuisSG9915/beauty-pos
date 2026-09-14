"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { withDbRetry } from "@/db/retry";
import { catMediosPago, comisiones, productos, relServiciosInsumos, servicios } from "@/db/schema/catalogs";
import { miembrosOrganizaciones, usuarios } from "@/db/schema/core";
import {
  citas,
  clavesIdempotencia,
  cortesCaja,
  detalleCitasServicios,
  detalleDevoluciones,
  detalleVentasComisiones,
  detalleVentasMediosPagos,
  detalleVentasProductos,
  detalleVentasPropinas,
  detalleVentasServicios,
  devoluciones,
  ventas,
} from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import {
  assertBranchScope,
  canAccessBranch,
  checkPermission,
  hasPermission,
} from "@/lib/auth/authorization";
import { canTransitionEstado } from "@/modules/agenda";
import { applyInventoryMovement, type InventoryDb } from "@/modules/inventory";
import { calcularComisiones, repartirPropina } from "@/modules/pos/comisiones";
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
  const [servs, prods] = await Promise.all([
    db
      .select({ precio: detalleVentasServicios.precio, cantidad: detalleVentasServicios.cantidad })
      .from(detalleVentasServicios)
      .where(and(eq(detalleVentasServicios.ventaId, ventaId), eq(detalleVentasServicios.activo, true))),
    db
      .select({ precio: detalleVentasProductos.precio, cantidad: detalleVentasProductos.cantidad })
      .from(detalleVentasProductos)
      .where(and(eq(detalleVentasProductos.ventaId, ventaId), eq(detalleVentasProductos.activo, true))),
  ]);
  const subtotal =
    servs.reduce((sum, line) => sum + Number(line.precio) * line.cantidad, 0) +
    prods.reduce((sum, line) => sum + Number(line.precio) * line.cantidad, 0);
  const [venta] = await db.select({ descuento: ventas.descuento }).from(ventas).where(eq(ventas.id, ventaId)).limit(1);
  const descuento = venta ? Number(venta.descuento) : 0;
  const total = Math.max(subtotal - descuento, 0);
  await db
    .update(ventas)
    .set({ subtotal: subtotal.toFixed(2), total: total.toFixed(2), updatedBy: userId })
    .where(eq(ventas.id, ventaId));
  return { subtotal, total };
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
  return { ...ticket, puedeCancelar: hasPermission(access, "ventas.cancelar") };
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

  const pagosRaw = z.array(pagoSchema).min(1).max(8).safeParse(JSON.parse(input.pagos));
  if (!pagosRaw.success) {
    return actionError("Lista de pagos inválida.", { fieldErrors: { pagos: ["Agrega al menos un pago."] } });
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
      for (const pago of pagosInput) {
        const medio = mediosPorId.get(pago.medioPagoId);
        if (!medio) return actionError("Uno de los medios de pago no es válido.");
        if (medio.categoria !== "efectivo" && !pago.referencia) {
          return actionError(`El medio "${medio.nombre}" requiere referencia.`, {
            fieldErrors: { pagos: [`Falta la referencia de ${medio.nombre}.`] },
          });
        }
      }

      const { subtotal, total } = await recalcularVenta(tx, venta.id, user.id);
      if (total <= 0) return actionError("Agrega al menos un servicio o producto antes de cobrar.");

      const propina = Math.round(input.propina * 100) / 100;
      const aCubrir = total + propina;
      const esEfectivo = (medioPagoId: string) => mediosPorId.get(medioPagoId)?.categoria === "efectivo";
      const recibidoEfectivo = Math.round(
        pagosInput.filter((p) => esEfectivo(p.medioPagoId)).reduce((s, p) => s + p.monto, 0) * 100,
      ) / 100;
      const recibidoNoEfectivo = Math.round(
        pagosInput.filter((p) => !esEfectivo(p.medioPagoId)).reduce((s, p) => s + p.monto, 0) * 100,
      ) / 100;
      const recibido = recibidoEfectivo + recibidoNoEfectivo;
      // Solo el efectivo puede exceder el total (genera cambio); los pagos con
      // tarjeta/transferencia/wallet deben ser exactos respecto a lo cubierto.
      if (recibidoNoEfectivo > aCubrir + 0.005) {
        return actionError(`Los pagos sin efectivo exceden el total (${aCubrir.toFixed(2)}).`, {
          fieldErrors: { pagos: ["Un pago sin efectivo no puede generar cambio."] },
        });
      }
      if (recibido + 0.005 < aCubrir) {
        return actionError(`Los pagos no cubren el total (${aCubrir.toFixed(2)}).`, {
          fieldErrors: { pagos: ["Completa el monto restante."] },
        });
      }
      if (recibidoEfectivo === 0 && Math.abs(recibidoNoEfectivo - aCubrir) > 0.005) {
        return actionError(`Sin efectivo el pago debe ser exacto (${aCubrir.toFixed(2)}).`, {
          fieldErrors: { pagos: ["Ajusta el monto al total exacto."] },
        });
      }
      const cambioTotal = Math.max(Math.round((recibido - aCubrir) * 100) / 100, 0);

      // El cambio se imputa a los pagos en efectivo (en orden); el `monto`
      // persistido es lo aplicado a la venta y `recibido` lo entregado.
      let cambioPendiente = cambioTotal;
      for (const pago of pagosInput) {
        const cambioPago = esEfectivo(pago.medioPagoId)
          ? Math.min(pago.monto, cambioPendiente)
          : 0;
        cambioPendiente = Math.round((cambioPendiente - cambioPago) * 100) / 100;
        const aplicado = Math.round((pago.monto - cambioPago) * 100) / 100;
        await tx.insert(detalleVentasMediosPagos).values({
          ventaId: venta.id,
          medioPagoId: pago.medioPagoId,
          monto: aplicado.toFixed(2),
          recibido: pago.monto.toFixed(2),
          cambio: cambioPago.toFixed(2),
          referencia: pago.referencia || null,
          createdBy: user.id,
        });
      }
      // Asocia la venta al corte de caja abierto de la sucursal (si existe).
      const [corteAbierto] = await tx
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
        .limit(1);

      await tx
        .update(ventas)
        .set({
          estado: "completada",
          corteId: corteAbierto?.id ?? null,
          subtotal: subtotal.toFixed(2),
          total: total.toFixed(2),
          propina: propina.toFixed(2),
          updatedBy: user.id,
        })
        .where(eq(ventas.id, venta.id));

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
          cambio: cambioTotal,
          medios: pagosInput.map((p) => p.medioPagoId).length,
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
      .set({ descuento: aplicado.toFixed(2), total: Math.max(subtotal - aplicado, 0).toFixed(2), updatedBy: user.id })
      .where(eq(ventas.id, venta.id));
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

        const [lineasServicios, lineasProductos] = await Promise.all([
          tx
            .select({ id: detalleVentasServicios.id, cantidad: detalleVentasServicios.cantidad, precio: detalleVentasServicios.precio })
            .from(detalleVentasServicios)
            .where(and(eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.activo, true))),
          tx
            .select({ id: detalleVentasProductos.id, productoId: detalleVentasProductos.productoId, cantidad: detalleVentasProductos.cantidad, precio: detalleVentasProductos.precio })
            .from(detalleVentasProductos)
            .where(and(eq(detalleVentasProductos.ventaId, venta.id), eq(detalleVentasProductos.activo, true))),
        ]);

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
