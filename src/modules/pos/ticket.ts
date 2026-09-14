import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { relMiembrosRoles } from "@/db/schema/access";
import {
  catCategoriasProductos,
  catCategoriasServicios,
  catMediosPago,
  productos,
  servicios,
} from "@/db/schema/catalogs";
import {
  clientes,
  miembrosOrganizaciones,
  relUsuariosSucursales,
  usuarios,
} from "@/db/schema/core";
import {
  detalleVentasComisiones,
  detalleVentasMediosPagos,
  detalleVentasProductos,
  detalleVentasPropinas,
  detalleVentasServicios,
  ventas,
} from "@/db/schema/operations";

export type TicketData = {
  venta: {
    id: string;
    estado: string;
    citaId: string | null;
    sucursalId: string;
    clienteNombre: string | null;
    subtotal: string;
    descuento: string;
    total: string;
    propina: string;
  };
  lineasServicios: Array<{
    id: string;
    nombre: string;
    precio: string;
    cantidad: number;
    usuarioId: string | null;
  }>;
  lineasProductos: Array<{ id: string; nombre: string; precio: string; cantidad: number }>;
  catalogoServicios: Array<{
    id: string;
    nombre: string;
    precio: string;
    duracionMinutos: number;
    categoriaId: string | null;
    categoriaNombre: string | null;
  }>;
  catalogoProductos: Array<{
    id: string;
    nombre: string;
    sku: string;
    precio: string;
    categoriaId: string | null;
    categoriaNombre: string | null;
  }>;
  mediosPago: Array<{ id: string; nombre: string; categoria: string }>;
  pagos: Array<{ nombre: string; monto: string; recibido: string; cambio: string }>;
  staff: Array<{ id: string; nombre: string }>;
  propinas: Array<{ usuarioNombre: string; monto: string }>;
  comisiones: Array<{ usuarioNombre: string; monto: string }>;
  /** Lo fija `cargarTicket` según el permiso del usuario que consulta. */
  puedeCancelar?: boolean;
};

/**
 * Arma el ticket completo de una venta (líneas, catálogos POS, medios de pago,
 * pagos registrados, staff de la sucursal y comisiones/propinas devengadas).
 * Lo usan la página `/admin/pos` y la action `cargarTicket` del cobro inline.
 */
export async function getTicketData(
  organizacionId: string,
  ventaId: string,
): Promise<TicketData | null> {
  const db = getDatabase();

  const [venta] = await db
    .select({
      id: ventas.id,
      estado: ventas.estado,
      citaId: ventas.citaId,
      sucursalId: ventas.sucursalId,
      clienteNombre: clientes.nombre,
      subtotal: ventas.subtotal,
      descuento: ventas.descuento,
      total: ventas.total,
      propina: ventas.propina,
    })
    .from(ventas)
    .leftJoin(clientes, eq(ventas.clienteId, clientes.id))
    .where(and(eq(ventas.id, ventaId), eq(ventas.organizacionId, organizacionId), eq(ventas.activo, true)))
    .limit(1);
  if (!venta) return null;

  const [
    lineasServicios,
    lineasProductos,
    catalogoServicios,
    catalogoProductos,
    mediosPago,
    pagos,
    staff,
    propinas,
    comisiones,
  ] = await Promise.all([
    db
      .select({
        id: detalleVentasServicios.id,
        // Snapshot con fallback al catálogo (líneas históricas sin snapshot).
        nombre: sql<string>`coalesce(${detalleVentasServicios.nombre}, ${servicios.nombre})`,
        precio: detalleVentasServicios.precio,
        cantidad: detalleVentasServicios.cantidad,
        usuarioId: detalleVentasServicios.usuarioId,
      })
      .from(detalleVentasServicios)
      .innerJoin(servicios, eq(detalleVentasServicios.servicioId, servicios.id))
      .where(and(eq(detalleVentasServicios.ventaId, venta.id), eq(detalleVentasServicios.activo, true))),
    db
      .select({
        id: detalleVentasProductos.id,
        nombre: sql<string>`coalesce(${detalleVentasProductos.nombre}, ${productos.nombre})`,
        precio: detalleVentasProductos.precio,
        cantidad: detalleVentasProductos.cantidad,
      })
      .from(detalleVentasProductos)
      .innerJoin(productos, eq(detalleVentasProductos.productoId, productos.id))
      .where(and(eq(detalleVentasProductos.ventaId, venta.id), eq(detalleVentasProductos.activo, true))),
    db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        precio: servicios.precioBase,
        duracionMinutos: servicios.duracionMinutos,
        categoriaId: servicios.categoriaId,
        categoriaNombre: catCategoriasServicios.nombre,
      })
      .from(servicios)
      .leftJoin(catCategoriasServicios, eq(servicios.categoriaId, catCategoriasServicios.id))
      .where(and(eq(servicios.organizacionId, organizacionId), eq(servicios.activo, true)))
      .orderBy(asc(servicios.nombre)),
    db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        sku: productos.sku,
        precio: productos.precioVenta,
        categoriaId: productos.categoriaId,
        categoriaNombre: catCategoriasProductos.nombre,
      })
      .from(productos)
      .leftJoin(catCategoriasProductos, eq(productos.categoriaId, catCategoriasProductos.id))
      .where(
        and(
          eq(productos.organizacionId, organizacionId),
          eq(productos.activo, true),
          eq(productos.visiblePos, true),
          or(eq(productos.tipo, "producto"), eq(productos.tipo, "ambos")),
        ),
      )
      .orderBy(asc(productos.nombre)),
    db
      .select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria })
      .from(catMediosPago)
      .where(and(eq(catMediosPago.organizacionId, organizacionId), eq(catMediosPago.activo, true)))
      .orderBy(asc(catMediosPago.nombre)),
    db
      .select({
        nombre: catMediosPago.nombre,
        monto: detalleVentasMediosPagos.monto,
        recibido: detalleVentasMediosPagos.recibido,
        cambio: detalleVentasMediosPagos.cambio,
      })
      .from(detalleVentasMediosPagos)
      .innerJoin(catMediosPago, eq(detalleVentasMediosPagos.medioPagoId, catMediosPago.id))
      .where(and(eq(detalleVentasMediosPagos.ventaId, venta.id), eq(detalleVentasMediosPagos.activo, true))),
    db
      .select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(relUsuariosSucursales)
      .innerJoin(usuarios, eq(relUsuariosSucursales.usuarioId, usuarios.id))
      .innerJoin(
        miembrosOrganizaciones,
        and(
          eq(miembrosOrganizaciones.usuarioId, usuarios.id),
          eq(miembrosOrganizaciones.organizacionId, organizacionId),
          eq(miembrosOrganizaciones.estado, "activo"),
        ),
      )
      .where(
        and(
          eq(relUsuariosSucursales.organizacionId, organizacionId),
          eq(relUsuariosSucursales.sucursalId, venta.sucursalId),
          eq(usuarios.activo, true),
        ),
      )
      .orderBy(asc(usuarios.nombre)),
    db
      .select({ usuarioNombre: usuarios.nombre, monto: detalleVentasPropinas.monto })
      .from(detalleVentasPropinas)
      .innerJoin(usuarios, eq(detalleVentasPropinas.usuarioId, usuarios.id))
      .where(and(eq(detalleVentasPropinas.ventaId, venta.id), eq(detalleVentasPropinas.activo, true))),
    db
      .select({ usuarioNombre: usuarios.nombre, monto: detalleVentasComisiones.monto })
      .from(detalleVentasComisiones)
      .innerJoin(usuarios, eq(detalleVentasComisiones.usuarioId, usuarios.id))
      .where(and(eq(detalleVentasComisiones.ventaId, venta.id), eq(detalleVentasComisiones.activo, true))),
  ]);

  return {
    venta: { ...venta, sucursalId: venta.sucursalId ?? "" },
    lineasServicios,
    lineasProductos,
    catalogoServicios,
    catalogoProductos,
    mediosPago,
    pagos,
    staff,
    propinas,
    comisiones,
  };
}

/** Roles activos por usuario (para resolver comisiones por rol). */
export async function getRolesPorUsuario(
  organizacionId: string,
  usuarioIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (usuarioIds.length === 0) return map;
  const db = getDatabase();
  const rows = await db
    .select({ usuarioId: miembrosOrganizaciones.usuarioId, rolId: relMiembrosRoles.rolId })
    .from(relMiembrosRoles)
    .innerJoin(miembrosOrganizaciones, eq(relMiembrosRoles.miembroOrganizacionId, miembrosOrganizaciones.id))
    .where(
      and(
        eq(miembrosOrganizaciones.organizacionId, organizacionId),
        inArray(miembrosOrganizaciones.usuarioId, usuarioIds),
      ),
    );
  for (const row of rows) {
    const list = map.get(row.usuarioId) ?? [];
    list.push(row.rolId);
    map.set(row.usuarioId, list);
  }
  return map;
}
