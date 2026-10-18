import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { getDatabase } from "@/db/client";
import { catalogoTag } from "@/lib/catalogo-cache";
import { todayDateInput } from "@/lib/format";
import { anticiposAplicables } from "@/modules/pos/anticipos";
import { membresiaVigente } from "@/modules/pos/membresias";
import { promocionVigente } from "@/modules/pos/promociones";
import { relMiembrosRoles } from "@/db/schema/access";
import {
  catCategoriasProductos,
  catCategoriasServicios,
  catMediosPago,
  membresias,
  paquetes,
  productos,
  promociones,
  servicios,
} from "@/db/schema/catalogs";
import { medios } from "@/db/schema/media";
import {
  clientes,
  miembrosOrganizaciones,
  relUsuariosSucursales,
  sucursales,
  usuarios,
} from "@/db/schema/core";
import {
  ajustesPagosVenta,
  anticipos,
  clienteMembresias,
  clientePaquetes,
  comprobantes,
  detalleDevoluciones,
  detalleVentasComisiones,
  detalleVentasMediosPagos,
  detalleVentasMembresias,
  detalleVentasPaquetes,
  detalleVentasProductos,
  detalleVentasPropinas,
  detalleVentasServicios,
  devoluciones,
  facturacionConfig,
  paqueteUsos,
  ventas,
} from "@/db/schema/operations";

export type TicketData = {
  venta: {
    id: string;
    estado: string;
    citaId: string | null;
    sucursalId: string;
    clienteId: string | null;
    clienteNombre: string | null;
    subtotal: string;
    descuento: string;
    total: string;
    propina: string;
    /** Promoción del catálogo ligada al ticket (si hay). */
    promocionId: string | null;
    promocionNombre: string | null;
    descuentoPromocion: string;
    /** Membresía del catálogo ligada al ticket (beneficio del cliente). */
    membresiaId: string | null;
    membresiaNombre: string | null;
    descuentoMembresia: string;
  };
  /** Promociones vigentes hoy (timezone de la sucursal) para el selector. */
  promocionesDisponibles: Array<{ id: string; nombre: string; tipo: string; valor: string; aplica: string }>;
  lineasServicios: Array<{
    id: string;
    servicioId: string;
    nombre: string;
    precio: string;
    cantidad: number;
    usuarioId: string | null;
    /** true si la línea está cubierta por una sesión de paquete (no cobra). */
    paqueteUsado: boolean;
    paqueteNombre: string | null;
  }>;
  lineasProductos: Array<{ id: string; nombre: string; precio: string; cantidad: number }>;
  /** Líneas de compra de paquetes prepagados en el ticket. */
  lineasPaquetes: Array<{ id: string; paqueteId: string; nombre: string; precio: string; cantidad: number }>;
  /** Líneas de compra de membresías en el ticket. */
  lineasMembresias: Array<{ id: string; membresiaId: string; nombre: string; precio: string; cantidad: number }>;
  /** Membresías activas del catálogo para la pestaña del selector POS. */
  catalogoMembresias: Array<{
    id: string;
    nombre: string;
    precio: string;
    duracionDias: number;
    descuentoPorcentaje: string;
    aplica: string;
  }>;
  /** Membresías vigentes hoy del cliente de la venta (para aplicar beneficio). */
  membresiasCliente: Array<{
    id: string;
    nombre: string;
    descuentoPorcentaje: string;
    aplica: string;
    vigenciaHasta: string;
  }>;
  /** Paquetes activos del catálogo para la pestaña del selector POS. */
  catalogoPaquetes: Array<{
    id: string;
    nombre: string;
    precio: string;
    sesiones: number;
    servicioId: string;
    servicioNombre: string | null;
  }>;
  /** Saldo de paquetes del cliente de la venta (vigentes con sesiones). */
  paquetesCliente: Array<{
    id: string;
    nombre: string;
    servicioId: string;
    servicioNombre: string | null;
    sesionesTotal: number;
    sesionesRestantes: number;
  }>;
  /** Clientes activos para asignar a una venta walk-in. */
  catalogoClientes: Array<{ id: string; nombre: string; telefono: string | null }>;
  catalogoServicios: Array<{
    id: string;
    nombre: string;
    precio: string;
    duracionMinutos: number;
    categoriaId: string | null;
    categoriaNombre: string | null;
    /** Llave R2 de la foto principal; null → el selector muestra la inicial. */
    imagenClaveR2: string | null;
  }>;
  catalogoProductos: Array<{
    id: string;
    nombre: string;
    sku: string;
    precio: string;
    categoriaId: string | null;
    categoriaNombre: string | null;
    imagenClaveR2: string | null;
  }>;
  mediosPago: Array<{ id: string; nombre: string; categoria: string }>;
  pagos: Array<{
    id: string;
    medioPagoId: string;
    nombre: string;
    monto: string;
    recibido: string;
    cambio: string;
    ajustes: Array<{ id: string; destinoNombre: string | null; monto: string; motivo: string; createdAt: Date }>;
  }>;
  staff: Array<{ id: string; nombre: string }>;
  propinas: Array<{ usuarioNombre: string; monto: string }>;
  comisiones: Array<{ usuarioNombre: string; monto: string }>;
  /** Devoluciones parciales/totales registradas contra la venta. */
  devoluciones: Array<{
    id: string;
    monto: string;
    motivo: string;
    createdAt: Date;
    usuarioNombre: string | null;
    lineas: Array<{ tipo: string; detalleId: string | null; cantidad: string; monto: string; nombre: string }>;
  }>;
  /** Cantidad ya devuelta por línea de ticket (para el límite de devolución). */
  devueltoPorDetalle: Record<string, number>;
  /** Anticipos ligados a la venta/cita: aplicados al cobrar y vigentes aún. */
  anticipos: Array<{
    id: string;
    monto: string;
    estado: string;
    medioNombre: string | null;
    createdAt: Date;
  }>;
  /** Suma de anticipos con estado "aplicado" ligados a esta venta. */
  anticipoAplicado: number;
  /** Anticipos vigentes que caben completos contra el total (se aplican al cobrar). */
  anticipoPorAplicar: number;
  /** Lo fija `cargarTicket` según el permiso del usuario que consulta. */
  puedeCancelar?: boolean;
  /** Permiso para reclasificar un pago con motivo y auditoría. */
  puedeAjustarPago?: boolean;
  /** Ídem para facturacion.emitir. */
  puedeFacturar?: boolean;
  /** Comprobante fiscal activo más reciente ligado a la venta (si hay). */
  comprobante: {
    id: string;
    estado: string;
    serie: string | null;
    folio: number | null;
    uuid: string | null;
    receptorRfc: string;
    receptorNombre: string;
    total: string;
    error: string | null;
    timbradoAt: Date | null;
  } | null;
  /** Datos fiscales del cliente de la venta (null si están incompletos). */
  clienteFiscal: {
    rfc: string;
    razonSocial: string;
    regimenFiscal: string;
    codigoPostalFiscal: string;
    usoCfdi: string | null;
  } | null;
  /** La organización ya configuró sus datos de emisor. */
  facturacionConfigurada: boolean;
};

/**
 * Catálogos del ticket que cambian poco durante una sesión de cobro
 * (servicios, productos, paquetes, membresías, medios, staff, clientes y
 * promociones del catálogo). Solo datos serializables: nada de `Date`.
 */
type CatalogosTicket = {
  catalogoMembresias: Array<{
    id: string;
    nombre: string;
    precio: string;
    duracionDias: number;
    descuentoPorcentaje: string;
    aplica: string;
  }>;
  catalogoServicios: TicketData["catalogoServicios"];
  catalogoProductos: TicketData["catalogoProductos"];
  catalogoPaquetes: TicketData["catalogoPaquetes"];
  catalogoClientes: TicketData["catalogoClientes"];
  mediosPago: TicketData["mediosPago"];
  staff: TicketData["staff"];
  /** Filas crudas de promociones; la vigencia se evalúa fuera del cache. */
  promocionesRows: Array<{
    id: string;
    nombre: string;
    tipo: string;
    valor: string;
    aplica: string;
    activo: boolean;
    vigenciaDesde: string;
    vigenciaHasta: string | null;
  }>;
};

async function loadCatalogosTicket(organizacionId: string, sucursalId: string): Promise<CatalogosTicket> {
  const db = getDatabase();
  const [
    catalogoMembresias,
    catalogoServicios,
    catalogoProductos,
    catalogoPaquetes,
    catalogoClientes,
    mediosPago,
    staff,
    promocionesRows,
  ] = await Promise.all([
    db
      .select({
        id: membresias.id,
        nombre: membresias.nombre,
        precio: membresias.precio,
        duracionDias: membresias.duracionDias,
        descuentoPorcentaje: membresias.descuentoPorcentaje,
        aplica: membresias.aplica,
      })
      .from(membresias)
      .where(and(eq(membresias.organizacionId, organizacionId), eq(membresias.activo, true)))
      .orderBy(asc(membresias.nombre)),
    db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        precio: servicios.precioBase,
        duracionMinutos: servicios.duracionMinutos,
        categoriaId: servicios.categoriaId,
        categoriaNombre: catCategoriasServicios.nombre,
        imagenClaveR2: medios.claveR2,
      })
      .from(servicios)
      .leftJoin(catCategoriasServicios, eq(servicios.categoriaId, catCategoriasServicios.id))
      .leftJoin(medios, eq(servicios.imagenPrincipalId, medios.id))
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
        imagenClaveR2: medios.claveR2,
      })
      .from(productos)
      .leftJoin(catCategoriasProductos, eq(productos.categoriaId, catCategoriasProductos.id))
      .leftJoin(medios, eq(productos.imagenPrincipalId, medios.id))
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
      .select({
        id: paquetes.id,
        nombre: paquetes.nombre,
        precio: paquetes.precio,
        sesiones: paquetes.sesiones,
        servicioId: paquetes.servicioId,
        servicioNombre: servicios.nombre,
      })
      .from(paquetes)
      .innerJoin(servicios, eq(paquetes.servicioId, servicios.id))
      .where(and(eq(paquetes.organizacionId, organizacionId), eq(paquetes.activo, true)))
      .orderBy(asc(paquetes.nombre)),
    db
      .select({ id: clientes.id, nombre: clientes.nombre, telefono: clientes.telefono })
      .from(clientes)
      .where(and(eq(clientes.organizacionId, organizacionId), eq(clientes.activo, true)))
      .orderBy(desc(clientes.creadoEn))
      .limit(100),
    db
      .select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria })
      .from(catMediosPago)
      .where(and(eq(catMediosPago.organizacionId, organizacionId), eq(catMediosPago.activo, true)))
      .orderBy(asc(catMediosPago.nombre)),
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
          eq(relUsuariosSucursales.sucursalId, sucursalId),
          eq(usuarios.activo, true),
        ),
      )
      .orderBy(asc(usuarios.nombre)),
    db
      .select({
        id: promociones.id,
        nombre: promociones.nombre,
        tipo: promociones.tipo,
        valor: promociones.valor,
        aplica: promociones.aplica,
        activo: promociones.activo,
        vigenciaDesde: promociones.vigenciaDesde,
        vigenciaHasta: promociones.vigenciaHasta,
      })
      .from(promociones)
      .where(eq(promociones.organizacionId, organizacionId))
      .orderBy(asc(promociones.nombre)),
  ]);

  return {
    catalogoMembresias,
    catalogoServicios,
    catalogoProductos,
    catalogoPaquetes,
    catalogoClientes,
    mediosPago,
    staff,
    promocionesRows,
  };
}

/**
 * Cache de catálogos del ticket por organización+sucursal. Las mutaciones de
 * catálogos llaman `revalidateCatalogos(org)`; los 60 s son el respaldo ante
 * escrituras que no pasen por las actions (p. ej. edición directa en BD).
 */
export const catalogosTicketCached = (organizacionId: string, sucursalId: string) =>
  unstable_cache(
    async () => loadCatalogosTicket(organizacionId, sucursalId),
    ["ticket-catalogos", organizacionId, sucursalId],
    { tags: [catalogoTag(organizacionId)], revalidate: 60 },
  )();

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
      clienteId: ventas.clienteId,
      clienteNombre: clientes.nombre,
      clienteRfc: clientes.rfc,
      clienteRazonSocial: clientes.razonSocial,
      clienteRegimenFiscal: clientes.regimenFiscal,
      clienteCodigoPostalFiscal: clientes.codigoPostalFiscal,
      clienteUsoCfdi: clientes.usoCfdi,
      subtotal: ventas.subtotal,
      descuento: ventas.descuento,
      total: ventas.total,
      propina: ventas.propina,
      promocionId: ventas.promocionId,
      promocionNombre: promociones.nombre,
      descuentoPromocion: ventas.descuentoPromocion,
      membresiaId: ventas.membresiaId,
      membresiaNombre: membresias.nombre,
      descuentoMembresia: ventas.descuentoMembresia,
      sucursalZonaHoraria: sucursales.zonaHoraria,
    })
    .from(ventas)
    .leftJoin(clientes, eq(ventas.clienteId, clientes.id))
    .leftJoin(promociones, eq(ventas.promocionId, promociones.id))
    .leftJoin(membresias, eq(ventas.membresiaId, membresias.id))
    .innerJoin(sucursales, eq(ventas.sucursalId, sucursales.id))
    .where(and(eq(ventas.id, ventaId), eq(ventas.organizacionId, organizacionId), eq(ventas.activo, true)))
    .limit(1);
  if (!venta) return null;

  const [
    lineasServicios,
    lineasProductos,
    lineasPaquetes,
    lineasMembresias,
    catalogos,
    membresiasClienteRows,
    paquetesClienteRows,
    usosRows,
    pagos,
    ajustesPagoRows,
    propinas,
    comisiones,
    devolucionesRows,
    detalleDevolucionesRows,
    anticipoRows,
    comprobanteRows,
    facturacionConfigRows,
  ] = await Promise.all([
    db
      .select({
        id: detalleVentasServicios.id,
        servicioId: detalleVentasServicios.servicioId,
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
        id: detalleVentasPaquetes.id,
        paqueteId: detalleVentasPaquetes.paqueteId,
        nombre: sql<string>`coalesce(${detalleVentasPaquetes.nombre}, ${paquetes.nombre})`,
        precio: detalleVentasPaquetes.precio,
        cantidad: detalleVentasPaquetes.cantidad,
      })
      .from(detalleVentasPaquetes)
      .innerJoin(paquetes, eq(detalleVentasPaquetes.paqueteId, paquetes.id))
      .where(and(eq(detalleVentasPaquetes.ventaId, venta.id), eq(detalleVentasPaquetes.activo, true))),
    db
      .select({
        id: detalleVentasMembresias.id,
        membresiaId: detalleVentasMembresias.membresiaId,
        nombre: sql<string>`coalesce(${detalleVentasMembresias.nombre}, ${membresias.nombre})`,
        precio: detalleVentasMembresias.precio,
        cantidad: detalleVentasMembresias.cantidad,
      })
      .from(detalleVentasMembresias)
      .innerJoin(membresias, eq(detalleVentasMembresias.membresiaId, membresias.id))
      .where(and(eq(detalleVentasMembresias.ventaId, venta.id), eq(detalleVentasMembresias.activo, true))),
    // Catálogos del POS cacheados por org+sucursal (tag `catalogos:{org}`).
    catalogosTicketCached(organizacionId, venta.sucursalId),
    venta.clienteId
      ? db
          .select({
            id: clienteMembresias.id,
            nombre: membresias.nombre,
            descuentoPorcentaje: membresias.descuentoPorcentaje,
            aplica: membresias.aplica,
            estado: clienteMembresias.estado,
            vigenciaDesde: clienteMembresias.vigenciaDesde,
            vigenciaHasta: clienteMembresias.vigenciaHasta,
          })
          .from(clienteMembresias)
          .innerJoin(membresias, eq(clienteMembresias.membresiaId, membresias.id))
          .where(
            and(
              eq(clienteMembresias.organizacionId, organizacionId),
              eq(clienteMembresias.clienteId, venta.clienteId),
              eq(clienteMembresias.activo, true),
              eq(clienteMembresias.estado, "vigente"),
            ),
          )
          .orderBy(asc(clienteMembresias.createdAt))
      : Promise.resolve([]),
    venta.clienteId
      ? db
          .select({
            id: clientePaquetes.id,
            nombre: paquetes.nombre,
            servicioId: paquetes.servicioId,
            servicioNombre: servicios.nombre,
            sesionesTotal: clientePaquetes.sesionesTotal,
            sesionesRestantes: clientePaquetes.sesionesRestantes,
          })
          .from(clientePaquetes)
          .innerJoin(paquetes, eq(clientePaquetes.paqueteId, paquetes.id))
          .innerJoin(servicios, eq(paquetes.servicioId, servicios.id))
          .where(
            and(
              eq(clientePaquetes.organizacionId, organizacionId),
              eq(clientePaquetes.clienteId, venta.clienteId),
              eq(clientePaquetes.estado, "vigente"),
              eq(clientePaquetes.activo, true),
              gt(clientePaquetes.usosRestantes, 0),
            ),
          )
          .orderBy(asc(clientePaquetes.createdAt))
      : Promise.resolve([]),
    db
      .select({
        detalleVentaServicioId: paqueteUsos.detalleVentaServicioId,
        paqueteNombre: paquetes.nombre,
      })
      .from(paqueteUsos)
      .innerJoin(clientePaquetes, eq(paqueteUsos.clientePaqueteId, clientePaquetes.id))
      .innerJoin(paquetes, eq(clientePaquetes.paqueteId, paquetes.id))
      .where(and(eq(paqueteUsos.ventaId, venta.id), eq(paqueteUsos.activo, true))),
    db
      .select({
        id: detalleVentasMediosPagos.id,
        medioPagoId: detalleVentasMediosPagos.medioPagoId,
        nombre: catMediosPago.nombre,
        monto: detalleVentasMediosPagos.monto,
        recibido: detalleVentasMediosPagos.recibido,
        cambio: detalleVentasMediosPagos.cambio,
      })
      .from(detalleVentasMediosPagos)
      .innerJoin(catMediosPago, eq(detalleVentasMediosPagos.medioPagoId, catMediosPago.id))
      .where(and(eq(detalleVentasMediosPagos.ventaId, venta.id), eq(detalleVentasMediosPagos.activo, true))),
    db
      .select({
        pagoId: ajustesPagosVenta.detalleVentaMedioPagoId,
        id: ajustesPagosVenta.id,
        destinoNombre: catMediosPago.nombre,
        monto: ajustesPagosVenta.monto,
        motivo: ajustesPagosVenta.motivo,
        createdAt: ajustesPagosVenta.createdAt,
      })
      .from(ajustesPagosVenta)
      .leftJoin(catMediosPago, eq(ajustesPagosVenta.medioPagoDestinoId, catMediosPago.id))
      .where(and(eq(ajustesPagosVenta.ventaId, venta.id), eq(ajustesPagosVenta.organizacionId, organizacionId)))
      .orderBy(asc(ajustesPagosVenta.createdAt)),
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
    db
      .select({
        id: devoluciones.id,
        monto: devoluciones.monto,
        motivo: devoluciones.motivo,
        createdAt: devoluciones.createdAt,
        usuarioNombre: usuarios.nombre,
      })
      .from(devoluciones)
      .leftJoin(usuarios, eq(devoluciones.usuarioId, usuarios.id))
      .where(eq(devoluciones.ventaId, venta.id))
      .orderBy(asc(devoluciones.createdAt)),
    db
      .select({
        devolucionId: detalleDevoluciones.devolucionId,
        tipo: detalleDevoluciones.tipo,
        detalleId: detalleDevoluciones.detalleId,
        cantidad: detalleDevoluciones.cantidad,
        monto: detalleDevoluciones.monto,
        nombreServicio: sql<string | null>`${servicios.nombre}`,
        nombreProducto: sql<string | null>`${productos.nombre}`,
        nombrePaquete: sql<string | null>`${detalleVentasPaquetes.nombre}`,
        nombreMembresia: sql<string | null>`${detalleVentasMembresias.nombre}`,
      })
      .from(detalleDevoluciones)
      .innerJoin(devoluciones, eq(detalleDevoluciones.devolucionId, devoluciones.id))
      .leftJoin(detalleVentasServicios, and(eq(detalleDevoluciones.detalleId, detalleVentasServicios.id), eq(detalleDevoluciones.tipo, "servicio")))
      .leftJoin(servicios, eq(detalleVentasServicios.servicioId, servicios.id))
      .leftJoin(detalleVentasProductos, and(eq(detalleDevoluciones.detalleId, detalleVentasProductos.id), eq(detalleDevoluciones.tipo, "producto")))
      .leftJoin(productos, eq(detalleVentasProductos.productoId, productos.id))
      .leftJoin(detalleVentasPaquetes, and(eq(detalleDevoluciones.detalleId, detalleVentasPaquetes.id), eq(detalleDevoluciones.tipo, "paquete")))
      .leftJoin(detalleVentasMembresias, and(eq(detalleDevoluciones.detalleId, detalleVentasMembresias.id), eq(detalleDevoluciones.tipo, "membresia")))
      .where(eq(devoluciones.ventaId, venta.id)),
    // Anticipos aplicados a esta venta + vigentes de la cita (se aplican al cobrar).
    venta.citaId
      ? db
          .select({
            id: anticipos.id,
            ventaId: anticipos.ventaId,
            monto: anticipos.monto,
            estado: anticipos.estado,
            createdAt: anticipos.createdAt,
            medioNombre: catMediosPago.nombre,
          })
          .from(anticipos)
          .leftJoin(catMediosPago, eq(anticipos.medioPagoId, catMediosPago.id))
          .where(
            and(
              eq(anticipos.citaId, venta.citaId),
              eq(anticipos.organizacionId, organizacionId),
              eq(anticipos.activo, true),
              inArray(anticipos.estado, ["vigente", "aplicado"]),
              gt(anticipos.monto, "0"),
            ),
          )
          .orderBy(asc(anticipos.createdAt))
      : db
          .select({
            id: anticipos.id,
            ventaId: anticipos.ventaId,
            monto: anticipos.monto,
            estado: anticipos.estado,
            createdAt: anticipos.createdAt,
            medioNombre: catMediosPago.nombre,
          })
          .from(anticipos)
          .leftJoin(catMediosPago, eq(anticipos.medioPagoId, catMediosPago.id))
          .where(
            and(
              eq(anticipos.ventaId, venta.id),
              eq(anticipos.organizacionId, organizacionId),
              eq(anticipos.activo, true),
              inArray(anticipos.estado, ["vigente", "aplicado"]),
              gt(anticipos.monto, "0"),
            ),
          )
          .orderBy(asc(anticipos.createdAt)),
    // Comprobante fiscal activo más reciente de la venta (si se emitió).
    db
      .select({
        id: comprobantes.id,
        estado: comprobantes.estado,
        serie: comprobantes.serie,
        folio: comprobantes.folio,
        uuid: comprobantes.uuid,
        receptorRfc: comprobantes.receptorRfc,
        receptorNombre: comprobantes.receptorNombre,
        total: comprobantes.total,
        error: comprobantes.error,
        timbradoAt: comprobantes.timbradoAt,
      })
      .from(comprobantes)
      .where(and(eq(comprobantes.ventaId, venta.id), eq(comprobantes.organizacionId, organizacionId), eq(comprobantes.activo, true)))
      .orderBy(desc(comprobantes.createdAt))
      .limit(1),
    db
      .select({ id: facturacionConfig.id })
      .from(facturacionConfig)
      .where(and(eq(facturacionConfig.organizacionId, organizacionId), eq(facturacionConfig.activo, true)))
      .limit(1),
  ]);

  const {
    sucursalZonaHoraria,
    clienteRfc,
    clienteRazonSocial,
    clienteRegimenFiscal,
    clienteCodigoPostalFiscal,
    clienteUsoCfdi,
    ...ventaData
  } = venta;
  const clienteFiscal =
    clienteRfc && clienteRegimenFiscal && clienteCodigoPostalFiscal
      ? {
          rfc: clienteRfc,
          razonSocial: clienteRazonSocial ?? "",
          regimenFiscal: clienteRegimenFiscal,
          codigoPostalFiscal: clienteCodigoPostalFiscal,
          usoCfdi: clienteUsoCfdi,
        }
      : null;
  const hoySucursal = todayDateInput(sucursalZonaHoraria ?? undefined);
  const promocionesDisponibles = catalogos.promocionesRows
    .filter((p) => promocionVigente(p, hoySucursal))
    .map(({ id, nombre, tipo, valor, aplica }) => ({ id, nombre, tipo, valor, aplica }));

  const devueltoPorDetalle: Record<string, number> = {};
  const lineasPorDevolucion = new Map<string, NonNullable<TicketData["devoluciones"]>[number]["lineas"]>();
  for (const linea of detalleDevolucionesRows) {
    if (linea.detalleId) {
      devueltoPorDetalle[linea.detalleId] = (devueltoPorDetalle[linea.detalleId] ?? 0) + Number(linea.cantidad);
    }
    const list = lineasPorDevolucion.get(linea.devolucionId) ?? [];
    list.push({
      tipo: linea.tipo,
      detalleId: linea.detalleId,
      cantidad: linea.cantidad,
      monto: linea.monto,
      nombre: linea.nombreServicio ?? linea.nombreProducto ?? linea.nombrePaquete ?? linea.nombreMembresia ?? "Línea",
    });
    lineasPorDevolucion.set(linea.devolucionId, list);
  }

  const usoPorDetalle = new Map(usosRows.map((u) => [u.detalleVentaServicioId, u.paqueteNombre]));
  const ajustesPorPago = new Map<string, TicketData["pagos"][number]["ajustes"]>();
  for (const ajuste of ajustesPagoRows) {
    const list = ajustesPorPago.get(ajuste.pagoId) ?? [];
    list.push({
      id: ajuste.id,
      destinoNombre: ajuste.destinoNombre,
      monto: ajuste.monto,
      motivo: ajuste.motivo,
      createdAt: ajuste.createdAt,
    });
    ajustesPorPago.set(ajuste.pagoId, list);
  }
  const pagosConAjustes = pagos.map((pago) => ({
    ...pago,
    ajustes: ajustesPorPago.get(pago.id) ?? [],
  }));

  return {
    venta: { ...ventaData, sucursalId: venta.sucursalId ?? "" },
    promocionesDisponibles,
    lineasServicios: lineasServicios.map((linea) => ({
      ...linea,
      paqueteUsado: usoPorDetalle.has(linea.id),
      paqueteNombre: usoPorDetalle.get(linea.id) ?? null,
    })),
    lineasProductos,
    lineasPaquetes,
    lineasMembresias,
    catalogoMembresias: catalogos.catalogoMembresias,
    membresiasCliente: membresiasClienteRows
      .filter((m) => membresiaVigente(m, hoySucursal))
      .map(({ id, nombre, descuentoPorcentaje, aplica, vigenciaHasta }) => ({ id, nombre, descuentoPorcentaje, aplica, vigenciaHasta })),
    catalogoPaquetes: catalogos.catalogoPaquetes,
    paquetesCliente: paquetesClienteRows,
    catalogoClientes: catalogos.catalogoClientes,
    catalogoServicios: catalogos.catalogoServicios,
    catalogoProductos: catalogos.catalogoProductos,
    mediosPago: catalogos.mediosPago,
    pagos: pagosConAjustes,
    staff: catalogos.staff,
    propinas,
    comisiones,
    devoluciones: devolucionesRows.map((row) => ({
      ...row,
      lineas: lineasPorDevolucion.get(row.id) ?? [],
    })),
    devueltoPorDetalle,
    // Solo los vigentes (se aplicarán al cobrar) o los ya aplicados a esta venta.
    anticipos: anticipoRows
      .filter((a) => a.estado === "vigente" || a.ventaId === venta.id)
      .map((a) => ({
        id: a.id,
        monto: a.monto,
        estado: a.estado,
        medioNombre: a.medioNombre,
        createdAt: a.createdAt,
      })),
    anticipoAplicado: anticipoRows
      .filter((a) => a.estado === "aplicado" && a.ventaId === venta.id)
      .reduce((s, a) => s + Number(a.monto), 0),
    // Misma regla greedy que cobrarVenta (módulo compartido): cada anticipo
    // entra completo si cabe contra el total (sin propina).
    anticipoPorAplicar: anticiposAplicables(
      anticipoRows.filter((a) => a.estado === "vigente"),
      Number(venta.total),
    ).suma,
    comprobante: comprobanteRows[0] ?? null,
    clienteFiscal,
    facturacionConfigurada: facturacionConfigRows.length > 0,
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
