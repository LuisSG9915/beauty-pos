import { and, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { getDatabase } from "@/db/client";
import { relMiembrosRoles } from "@/db/schema/access";
import { miembrosOrganizaciones } from "@/db/schema/core";
import { catalogoTag } from "@/lib/catalogo-cache";
import { todayDateInput } from "@/lib/format";
import { anticiposAplicables } from "@/modules/pos/anticipos";
import { membresiaVigente } from "@/modules/pos/membresias";
import { promocionVigente } from "@/modules/pos/promociones";

export type TicketData = {
  venta: {
    id: string;
    estado: string;
    citaId: string | null;
    sucursalId: string;
    clienteId: string | null;
    clienteNombre: string | null;
    clienteTelefono: string | null;
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
  // Una sola ronda SQL: cada catálogo viaja como subselect jsonb. Los 8
  // selects en Promise.all de antes abrían 8 conexiones frías al pool
  // (~60 ms de handshake c/u) en cada miss de cache.
  const result = await db.execute<CatalogosTicket>(sql`
    select
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', m.id, 'nombre', m.nombre, 'precio', m.precio::text,
            'duracionDias', m.duracion_dias,
            'descuentoPorcentaje', m.descuento_porcentaje::text, 'aplica', m.aplica
          ) order by m.nombre)
          from membresias m
         where m.organizacion_id = ${organizacionId} and m.activo
      ), '[]'::jsonb) as "catalogoMembresias",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', s.id, 'nombre', s.nombre, 'precio', s.precio_base::text,
            'duracionMinutos', s.duracion_minutos,
            'categoriaId', s.categoria_id, 'categoriaNombre', cs.nombre,
            'imagenClaveR2', me.clave_r2
          ) order by s.nombre)
          from servicios s
          left join cat_categorias_servicios cs on s.categoria_id = cs.id
          left join medios me on me.id = s.imagen_principal_id
         where s.organizacion_id = ${organizacionId} and s.activo
      ), '[]'::jsonb) as "catalogoServicios",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', p.id, 'nombre', p.nombre, 'sku', p.sku,
            'precio', p.precio_venta::text,
            'categoriaId', p.categoria_id, 'categoriaNombre', cp.nombre,
            'imagenClaveR2', me.clave_r2
          ) order by p.nombre)
          from productos p
          left join cat_categorias_productos cp on p.categoria_id = cp.id
          left join medios me on me.id = p.imagen_principal_id
         where p.organizacion_id = ${organizacionId} and p.activo
           and p.visible_pos and p.tipo in ('producto', 'ambos')
      ), '[]'::jsonb) as "catalogoProductos",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', pq.id, 'nombre', pq.nombre, 'precio', pq.precio::text,
            'sesiones', pq.sesiones, 'servicioId', pq.servicio_id,
            'servicioNombre', s.nombre
          ) order by pq.nombre)
          from paquetes pq
          join servicios s on pq.servicio_id = s.id
         where pq.organizacion_id = ${organizacionId} and pq.activo
      ), '[]'::jsonb) as "catalogoPaquetes",
      coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'telefono', c.telefono) order by c.creado_en desc)
          from (
            select id, nombre, telefono, creado_en from clientes
             where organizacion_id = ${organizacionId} and activo
             order by creado_en desc limit 100
          ) c
      ), '[]'::jsonb) as "catalogoClientes",
      coalesce((
        select jsonb_agg(jsonb_build_object('id', mp.id, 'nombre', mp.nombre, 'categoria', mp.categoria) order by mp.nombre)
          from cat_medios_pago mp
         where mp.organizacion_id = ${organizacionId} and mp.activo
      ), '[]'::jsonb) as "mediosPago",
      coalesce((
        select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
          from rel_usuarios_sucursales rus
          join usuarios u on rus.usuario_id = u.id
          join miembros_organizaciones mo on mo.usuario_id = u.id
            and mo.organizacion_id = ${organizacionId} and mo.estado = 'activo'
         where rus.organizacion_id = ${organizacionId} and rus.sucursal_id = ${sucursalId}
           and u.activo
      ), '[]'::jsonb) as "staff",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', pr.id, 'nombre', pr.nombre, 'tipo', pr.tipo,
            'valor', pr.valor::text, 'aplica', pr.aplica, 'activo', pr.activo,
            'vigenciaDesde', pr.vigencia_desde::text, 'vigenciaHasta', pr.vigencia_hasta::text
          ) order by pr.nombre)
          from promociones pr
         where pr.organizacion_id = ${organizacionId}
      ), '[]'::jsonb) as "promocionesRows"
  `);
  return (
    result.rows[0] ?? {
      catalogoMembresias: [],
      catalogoServicios: [],
      catalogoProductos: [],
      catalogoPaquetes: [],
      catalogoClientes: [],
      mediosPago: [],
      staff: [],
      promocionesRows: [],
    }
  );
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
 * Fila cruda de la consulta fusionada del ticket: numerics y fechas viajan
 * como texto jsonb y se hidratan a string/Date al armar `TicketData`.
 */
type TicketDetallesRow = {
  venta: {
    id: string;
    estado: string;
    citaId: string | null;
    sucursalId: string;
    clienteId: string | null;
    clienteNombre: string | null;
    clienteTelefono: string | null;
    clienteRfc: string | null;
    clienteRazonSocial: string | null;
    clienteRegimenFiscal: string | null;
    clienteCodigoPostalFiscal: string | null;
    clienteUsoCfdi: string | null;
    subtotal: string;
    descuento: string;
    total: string;
    propina: string;
    promocionId: string | null;
    promocionNombre: string | null;
    descuentoPromocion: string;
    membresiaId: string | null;
    membresiaNombre: string | null;
    descuentoMembresia: string;
    sucursalZonaHoraria: string | null;
  } | null;
  lineasServicios: Array<{
    id: string;
    servicioId: string;
    nombre: string;
    precio: string;
    cantidad: number;
    usuarioId: string | null;
  }>;
  lineasProductos: Array<{ id: string; nombre: string; precio: string; cantidad: number }>;
  lineasPaquetes: Array<{ id: string; paqueteId: string; nombre: string; precio: string; cantidad: number }>;
  lineasMembresias: Array<{ id: string; membresiaId: string; nombre: string; precio: string; cantidad: number }>;
  membresiasClienteRows: Array<{
    id: string;
    nombre: string;
    descuentoPorcentaje: string;
    aplica: string;
    estado: string;
    vigenciaDesde: string;
    vigenciaHasta: string;
  }>;
  paquetesClienteRows: Array<{
    id: string;
    nombre: string;
    servicioId: string;
    servicioNombre: string | null;
    sesionesTotal: number;
    sesionesRestantes: number;
  }>;
  usosRows: Array<{ detalleVentaServicioId: string; paqueteNombre: string }>;
  pagos: Array<{
    id: string;
    medioPagoId: string;
    nombre: string;
    monto: string;
    recibido: string;
    cambio: string;
    ajustes: Array<{
      id: string;
      destinoNombre: string | null;
      monto: string;
      motivo: string;
      createdAt: string;
    }>;
  }>;
  propinas: Array<{ usuarioNombre: string; monto: string }>;
  comisiones: Array<{ usuarioNombre: string; monto: string }>;
  devolucionesRows: Array<{
    id: string;
    monto: string;
    motivo: string;
    createdAt: string;
    usuarioNombre: string | null;
    lineas: Array<{ tipo: string; detalleId: string | null; cantidad: string; monto: string; nombre: string }>;
  }>;
  devueltoPorDetalle: Record<string, number>;
  anticipoRows: Array<{
    id: string;
    ventaId: string | null;
    monto: string;
    estado: string;
    createdAt: string;
    medioNombre: string | null;
  }>;
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
    timbradoAt: string | null;
  } | null;
  facturacionConfigurada: boolean;
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

  // Una sola ronda SQL: la venta viaja como CTE `v` (vacía si no existe) y
  // cada lista del ticket como subselect jsonb correlacionado con ella.
  // Las ~17 consultas en Promise.all de antes abrían una conexión fría al
  // pool (~60 ms de handshake + ~100 ms de RT a Cockroach) por cada una.
  const result = await db.execute<TicketDetallesRow>(sql`
    with v as (
      select v.id, v.estado,
        v.cita_id as "citaId", v.sucursal_id as "sucursalId", v.cliente_id as "clienteId",
        cl.nombre as "clienteNombre", cl.telefono as "clienteTelefono",
        cl.rfc as "clienteRfc", cl.razon_social as "clienteRazonSocial",
        cl.regimen_fiscal as "clienteRegimenFiscal",
        cl.codigo_postal_fiscal as "clienteCodigoPostalFiscal", cl.uso_cfdi as "clienteUsoCfdi",
        v.subtotal::text as subtotal, v.descuento::text as descuento,
        v.total::text as total, v.propina::text as propina,
        v.promocion_id as "promocionId", pr.nombre as "promocionNombre",
        v.descuento_promocion::text as "descuentoPromocion",
        v.membresia_id as "membresiaId", mb.nombre as "membresiaNombre",
        v.descuento_membresia::text as "descuentoMembresia",
        su.zona_horaria as "sucursalZonaHoraria"
      from ventas v
      left join clientes cl on v.cliente_id = cl.id
      left join promociones pr on v.promocion_id = pr.id
      left join membresias mb on v.membresia_id = mb.id
      join sucursales su on v.sucursal_id = su.id
      where v.id = ${ventaId} and v.organizacion_id = ${organizacionId} and v.activo
    )
    select
      (select to_jsonb(v) from v) as venta,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', dvs.id, 'servicioId', dvs.servicio_id,
            -- Snapshot con fallback al catálogo (líneas históricas sin snapshot).
            'nombre', coalesce(dvs.nombre, s.nombre),
            'precio', dvs.precio::text, 'cantidad', dvs.cantidad,
            'usuarioId', dvs.usuario_id))
          from detalle_ventas_servicios dvs
          join servicios s on dvs.servicio_id = s.id
         where dvs.venta_id = (select id from v) and dvs.activo
      ), '[]'::jsonb) as "lineasServicios",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', dvp.id, 'nombre', coalesce(dvp.nombre, p.nombre),
            'precio', dvp.precio::text, 'cantidad', dvp.cantidad))
          from detalle_ventas_productos dvp
          join productos p on dvp.producto_id = p.id
         where dvp.venta_id = (select id from v) and dvp.activo
      ), '[]'::jsonb) as "lineasProductos",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', dvq.id, 'paqueteId', dvq.paquete_id,
            'nombre', coalesce(dvq.nombre, pq.nombre),
            'precio', dvq.precio::text, 'cantidad', dvq.cantidad))
          from detalle_ventas_paquetes dvq
          join paquetes pq on dvq.paquete_id = pq.id
         where dvq.venta_id = (select id from v) and dvq.activo
      ), '[]'::jsonb) as "lineasPaquetes",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', dvm.id, 'membresiaId', dvm.membresia_id,
            'nombre', coalesce(dvm.nombre, mb.nombre),
            'precio', dvm.precio::text, 'cantidad', dvm.cantidad))
          from detalle_ventas_membresias dvm
          join membresias mb on dvm.membresia_id = mb.id
         where dvm.venta_id = (select id from v) and dvm.activo
      ), '[]'::jsonb) as "lineasMembresias",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', cm.id, 'nombre', mb.nombre,
            'descuentoPorcentaje', mb.descuento_porcentaje::text, 'aplica', mb.aplica,
            'estado', cm.estado,
            'vigenciaDesde', cm.vigencia_desde::text, 'vigenciaHasta', cm.vigencia_hasta::text
          ) order by cm.created_at)
          from cliente_membresias cm
          join membresias mb on cm.membresia_id = mb.id
         where cm.organizacion_id = ${organizacionId}
           and cm.cliente_id = (select "clienteId" from v)
           and cm.activo and cm.estado = 'vigente'
      ), '[]'::jsonb) as "membresiasClienteRows",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', cp.id, 'nombre', pq.nombre, 'servicioId', pq.servicio_id,
            'servicioNombre', s.nombre,
            'sesionesTotal', cp.sesiones_total, 'sesionesRestantes', cp.sesiones_restantes
          ) order by cp.created_at)
          from cliente_paquetes cp
          join paquetes pq on cp.paquete_id = pq.id
          join servicios s on pq.servicio_id = s.id
         where cp.organizacion_id = ${organizacionId}
           and cp.cliente_id = (select "clienteId" from v)
           and cp.estado = 'vigente' and cp.activo and cp.sesiones_restantes > 0
      ), '[]'::jsonb) as "paquetesClienteRows",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'detalleVentaServicioId', pu.detalle_venta_servicio_id,
            'paqueteNombre', pq.nombre))
          from paquete_usos pu
          join cliente_paquetes cp on pu.cliente_paquete_id = cp.id
          join paquetes pq on cp.paquete_id = pq.id
         where pu.venta_id = (select id from v) and pu.activo
      ), '[]'::jsonb) as "usosRows",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', dvp.id, 'medioPagoId', dvp.medio_pago_id, 'nombre', mp.nombre,
            'monto', dvp.monto::text, 'recibido', dvp.recibido::text, 'cambio', dvp.cambio::text,
            'ajustes', coalesce((
              select jsonb_agg(jsonb_build_object(
                  'id', apv.id, 'destinoNombre', mpd.nombre,
                  'monto', apv.monto::text, 'motivo', apv.motivo,
                  'createdAt', to_char(apv.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                ) order by apv.created_at)
                from ajustes_pagos_venta apv
                left join cat_medios_pago mpd on apv.medio_pago_destino_id = mpd.id
               where apv.detalle_venta_medio_pago_id = dvp.id
                 and apv.venta_id = (select id from v)
                 and apv.organizacion_id = ${organizacionId}
            ), '[]'::jsonb)))
          from detalle_ventas_medios_pagos dvp
          join cat_medios_pago mp on dvp.medio_pago_id = mp.id
         where dvp.venta_id = (select id from v) and dvp.activo
      ), '[]'::jsonb) as "pagos",
      coalesce((
        select jsonb_agg(jsonb_build_object('usuarioNombre', u.nombre, 'monto', dvp.monto::text))
          from detalle_ventas_propinas dvp
          join usuarios u on dvp.usuario_id = u.id
         where dvp.venta_id = (select id from v) and dvp.activo
      ), '[]'::jsonb) as "propinas",
      coalesce((
        select jsonb_agg(jsonb_build_object('usuarioNombre', u.nombre, 'monto', dvc.monto::text))
          from detalle_ventas_comisiones dvc
          join usuarios u on dvc.usuario_id = u.id
         where dvc.venta_id = (select id from v) and dvc.activo
      ), '[]'::jsonb) as "comisiones",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', d.id, 'monto', d.monto::text, 'motivo', d.motivo,
            'createdAt', to_char(d.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'usuarioNombre', u.nombre,
            'lineas', coalesce((
              select jsonb_agg(jsonb_build_object(
                  'tipo', dd.tipo, 'detalleId', dd.detalle_id,
                  'cantidad', dd.cantidad::text, 'monto', dd.monto::text,
                  'nombre', coalesce(s.nombre, p.nombre, dvq.nombre, dvm.nombre, 'Línea')))
                from detalle_devoluciones dd
                left join detalle_ventas_servicios dvs on dd.detalle_id = dvs.id and dd.tipo = 'servicio'
                left join servicios s on dvs.servicio_id = s.id
                left join detalle_ventas_productos dvp2 on dd.detalle_id = dvp2.id and dd.tipo = 'producto'
                left join productos p on dvp2.producto_id = p.id
                left join detalle_ventas_paquetes dvq on dd.detalle_id = dvq.id and dd.tipo = 'paquete'
                left join detalle_ventas_membresias dvm on dd.detalle_id = dvm.id and dd.tipo = 'membresia'
               where dd.devolucion_id = d.id
            ), '[]'::jsonb)) order by d.created_at)
          from devoluciones d
          left join usuarios u on d.usuario_id = u.id
         where d.venta_id = (select id from v)
      ), '[]'::jsonb) as "devolucionesRows",
      coalesce((
        select jsonb_object_agg(dd.detalle_id::text, sum(dd.cantidad)::float8)
          from detalle_devoluciones dd
          join devoluciones dv on dd.devolucion_id = dv.id
         where dv.venta_id = (select id from v) and dd.detalle_id is not null
      ), '{}'::jsonb) as "devueltoPorDetalle",
      -- Anticipos aplicados a esta venta + vigentes de la cita (se aplican al cobrar).
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', a.id, 'ventaId', a.venta_id, 'monto', a.monto::text,
            'estado', a.estado,
            'createdAt', to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'medioNombre', mp.nombre) order by a.created_at)
          from anticipos a
          left join cat_medios_pago mp on a.medio_pago_id = mp.id
         where a.organizacion_id = ${organizacionId} and a.activo
           and a.estado in ('vigente', 'aplicado') and a.monto > 0
           and (
             a.cita_id = (select "citaId" from v)
             or ((select "citaId" from v) is null and a.venta_id = (select id from v))
           )
      ), '[]'::jsonb) as "anticipoRows",
      -- Comprobante fiscal activo más reciente de la venta (si se emitió).
      (select jsonb_build_object(
          'id', c.id, 'estado', c.estado, 'serie', c.serie, 'folio', c.folio,
          'uuid', c.uuid, 'receptorRfc', c.receptor_rfc, 'receptorNombre', c.receptor_nombre,
          'total', c.total::text, 'error', c.error,
          'timbradoAt', case when c.timbrado_at is null then null
            else to_char(c.timbrado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end)
        from comprobantes c
       where c.venta_id = (select id from v) and c.organizacion_id = ${organizacionId} and c.activo
       order by c.created_at desc limit 1) as comprobante,
      exists(
        select 1 from facturacion_config fc
         where fc.organizacion_id = ${organizacionId} and fc.activo
      ) as "facturacionConfigurada"
  `);

  const row = result.rows[0];
  const venta = row?.venta;
  if (!row || !venta) return null;

  // Catálogos del POS cacheados por org+sucursal (tag `catalogos:{org}`).
  const catalogos = await catalogosTicketCached(organizacionId, venta.sucursalId);

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

  const usoPorDetalle = new Map(row.usosRows.map((u) => [u.detalleVentaServicioId, u.paqueteNombre]));
  // Hidratación de fechas (viajan como ISO texto desde jsonb).
  const anticipoRows = row.anticipoRows.map((a) => ({ ...a, createdAt: new Date(a.createdAt) }));
  const devoluciones = row.devolucionesRows.map((d) => ({ ...d, createdAt: new Date(d.createdAt) }));
  const comprobante = row.comprobante
    ? { ...row.comprobante, timbradoAt: row.comprobante.timbradoAt ? new Date(row.comprobante.timbradoAt) : null }
    : null;

  return {
    venta: { ...ventaData, sucursalId: venta.sucursalId ?? "" },
    promocionesDisponibles,
    lineasServicios: row.lineasServicios.map((linea) => ({
      ...linea,
      paqueteUsado: usoPorDetalle.has(linea.id),
      paqueteNombre: usoPorDetalle.get(linea.id) ?? null,
    })),
    lineasProductos: row.lineasProductos,
    lineasPaquetes: row.lineasPaquetes,
    lineasMembresias: row.lineasMembresias,
    catalogoMembresias: catalogos.catalogoMembresias,
    membresiasCliente: row.membresiasClienteRows
      .filter((m) => membresiaVigente(m, hoySucursal))
      .map(({ id, nombre, descuentoPorcentaje, aplica, vigenciaHasta }) => ({ id, nombre, descuentoPorcentaje, aplica, vigenciaHasta })),
    catalogoPaquetes: catalogos.catalogoPaquetes,
    paquetesCliente: row.paquetesClienteRows,
    catalogoClientes: catalogos.catalogoClientes,
    catalogoServicios: catalogos.catalogoServicios,
    catalogoProductos: catalogos.catalogoProductos,
    mediosPago: catalogos.mediosPago,
    pagos: row.pagos.map((pago) => ({
      ...pago,
      ajustes: pago.ajustes.map((a) => ({ ...a, createdAt: new Date(a.createdAt) })),
    })),
    staff: catalogos.staff,
    propinas: row.propinas,
    comisiones: row.comisiones,
    devoluciones,
    devueltoPorDetalle: row.devueltoPorDetalle,
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
    comprobante,
    clienteFiscal,
    facturacionConfigurada: row.facturacionConfigurada,
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
