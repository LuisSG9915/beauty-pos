/**
 * Capa de consulta compartida de reportes: la página, el CSV y (a futuro) el
 * consolidado multisucursal leen los mismos agregados con idénticos filtros —
 * ninguna consulta agrupa por nombre visible, siempre por ID estable.
 */
import { sql, type SQL } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { dayBoundsUtc } from "@/modules/agenda";
import type { ResumenGastos } from "@/modules/gastos/queries";

export const num = (v: string | number | null | undefined) => Number(v ?? 0);

export type ReporteFiltros = {
  organizacionId: string;
  /** ID de sucursal, o null = consolidado de TODAS las sucursales de la org. */
  sucursalId: string | null;
  /**
   * Zona del reporte: la de la sucursal en modo individual, la de la
   * organización en consolidado — nunca se mezclan zonas dentro de un rango.
   */
  timeZone: string;
  /** YYYY-MM-DD local de la zona del reporte (ambos inclusive). */
  desde: string;
  hasta: string;
  operativos: boolean;
  financieros: boolean;
  /** Alcance del usuario: cuando existe, limita el consolidado a esas sucursales. */
  sucursalesPermitidas?: ReadonlySet<string> | null;
};

type ReporteSqlRow = {
  citas_por_estado: Array<{ estado: string; total: number }>;
  clientes_nuevos: number;
  top_servicios: Array<{ servicioId: string | null; nombre: string; unidades: number; importe: string }>;
  profesionales: Array<{ usuarioId: string; nombre: string; total: number; completadas: number; minutos: number }>;
  citas_por_origen: Array<{ origen: string; total: number }>;
  avisos_metricas: Array<{ estado: string; total: number; reintentos: number }>;
  ventas_por_dia: Array<{ dia: string; operaciones: number; descuentos: string; propinas: string; total: string }>;
  pagos_originales: Array<{ medioPagoId: string; nombre: string; operaciones: number; total: string }>;
  pagos_ajustes: Array<{ origenId: string; destinoId: string; total: string }>;
  medios_catalogo: Array<{ id: string; nombre: string }>;
  descuentos: { manual: string; promocion: string; membresia: string } | null;
  comision_por_usuario: Array<{ usuarioId: string; nombre: string; total: string }>;
  propina_por_usuario: Array<{ usuarioId: string; nombre: string; total: string }>;
  diferencias_corte: Array<{
    cerradoAt: string | null;
    cajero: string | null;
    medio: string;
    esperado: string;
    contado: string;
    diferencia: string;
  }>;
  gastos_totales: { confirmado: string; revertido: string } | null;
  gastos_por_categoria: Array<{ nombre: string; total: string }>;
  liquidado_por_usuario: Array<{ usuarioId: string; nombre: string; total: string }>;
  devoluciones_resumen: { total: string; operaciones: number } | null;
  anticipos_resumen: { cobrados: string; aplicados: string; vigentes: string } | null;
  productos_sin_costo: { unidades: number; productos: number } | null;
};

export async function cargarReporte(db: ReturnType<typeof getDatabase>, filtros: ReporteFiltros) {
  const { organizacionId, sucursalId, timeZone, desde, hasta } = filtros;
  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) return null;
  const iniciaAt = boundsDesde.iniciaAt;
  const terminaAt = boundsHasta.terminaAt;
  const operativos = filtros.operativos;
  const financieros = filtros.financieros;

  const idsPermitidas = filtros.sucursalesPermitidas ? [...filtros.sucursalesPermitidas] : null;
  if (!sucursalId && idsPermitidas && idsPermitidas.length === 0) {
    return {
      citasPorEstado: [],
      clientesNuevos: [{ total: 0 }],
      topServicios: [],
      profesionales: [],
      citasPorOrigen: [],
      avisosMetricas: [],
      ventasPorDia: [],
      pagosPorMedio: [],
      descuentos: [{ manual: "0", promocion: "0", membresia: "0" }],
      comisionPorUsuario: [],
      propinaPorUsuario: [],
      diferenciasCorte: [],
      gastosResumen: { totalConfirmado: 0, totalRevertido: 0, porCategoria: [] } satisfies ResumenGastos,
      liquidadoPorUsuario: [],
      devolucionesResumen: [{ total: "0", operaciones: 0 }],
      anticiposResumen: [{ cobrados: "0", aplicados: "0", vigentes: "0" }],
      productosSinCosto: [{ unidades: 0, productos: 0 }],
    };
  }

  // Alcance por sucursal: individual = igualdad; consolidado = IN sobre el
  // alcance del usuario cuando existe, o toda la organización.
  const enSucursalSql = (columna: SQL) =>
    sucursalId
      ? sql`and ${columna} = ${sucursalId}`
      : idsPermitidas
        ? sql`and ${columna} in (${sql.join(idsPermitidas.map((id) => sql`${id}`), sql`, `)})`
        : sql``;

  // Todo el reporte en UNA consulta SQL: `citas_rango` y `ventas_rango` se
  // materializan una sola vez (antes se escaneaban 3 y 8 veces en 20 queries
  // paralelas que saturaban el pool max:2 de Hyperdrive).
  const { rows } = await db.execute<ReporteSqlRow>(sql`
    with citas_rango as materialized (
      select c.id, c.sucursal_id, c.usuario_id, c.estado, c.origen, c.duracion_minutos
      from citas c
      where ${operativos}
        and c.organizacion_id = ${organizacionId}
        and c.activo
        and c.fecha_hora >= ${iniciaAt}
        and c.fecha_hora < ${terminaAt}
        ${enSucursalSql(sql`c.sucursal_id`)}
    ),
    ventas_rango as materialized (
      select
        v.id,
        v.total,
        v.propina,
        v.descuento,
        v.descuento_promocion,
        v.descuento_membresia,
        coalesce(v.cobrada_at, v.created_at) as fecha_venta
      from ventas v
      where (${operativos} or ${financieros})
        and v.organizacion_id = ${organizacionId}
        and v.estado = 'completada'
        and v.activo
        and coalesce(v.cobrada_at, v.created_at) >= ${iniciaAt}
        and coalesce(v.cobrada_at, v.created_at) < ${terminaAt}
        ${enSucursalSql(sql`v.sucursal_id`)}
    )
    select
      case when ${operativos} then coalesce((
        select jsonb_agg(jsonb_build_object('estado', estado, 'total', total))
        from (
          select cr.estado, count(*)::int as total
          from citas_rango cr
          group by cr.estado
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as citas_por_estado,
      case when ${operativos} then (
        select count(*)::int
        from (
          select c.cliente_id,
                 min(c.fecha_hora) as primera,
                 (array_agg(c.sucursal_id order by c.fecha_hora))[1] as sucursal_primera
          from citas c
          where c.organizacion_id = ${organizacionId}
            and c.estado = 'completada'
            and c.activo = true
          group by c.cliente_id
        ) primera_atencion
        where primera >= ${iniciaAt} and primera < ${terminaAt}
          ${enSucursalSql(sql`sucursal_primera`)}
      ) else 0 end as clientes_nuevos,
      case when ${operativos} then coalesce((
        select jsonb_agg(t)
        from (
          select
            dvs.servicio_id as "servicioId",
            max(dvs.nombre) as nombre,
            coalesce(sum(dvs.cantidad), 0)::int as unidades,
            coalesce(sum(dvs.precio * dvs.cantidad), 0)::text as importe
          from ventas_rango vr
          join detalle_ventas_servicios dvs on dvs.venta_id = vr.id and dvs.activo
          group by dvs.servicio_id
          order by sum(dvs.precio * dvs.cantidad) desc
          limit 10
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as top_servicios,
      case when ${operativos} then coalesce((
        select jsonb_agg(t)
        from (
          select
            u.id as "usuarioId",
            u.nombre,
            count(*)::int as total,
            count(*) filter (where cr.estado = 'completada')::int as completadas,
            coalesce(sum(cr.duracion_minutos), 0)::int as minutos
          from citas_rango cr
          join usuarios u on u.id = cr.usuario_id
          group by u.id, u.nombre
          order by count(*) desc
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as profesionales,
      case when ${operativos} then coalesce((
        select jsonb_agg(jsonb_build_object('origen', origen, 'total', total))
        from (
          select cr.origen, count(*)::int as total
          from citas_rango cr
          group by cr.origen
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as citas_por_origen,
      case when ${operativos} then coalesce((
        select jsonb_agg(t)
        from (
          select
            ne.estado,
            count(*)::int as total,
            coalesce(sum(ne.intentos), 0)::int as reintentos
          from notificaciones_envios ne
          join citas c on c.id = ne.cita_id
          where ne.organizacion_id = ${organizacionId}
            and ne.created_at >= ${iniciaAt}
            and ne.created_at < ${terminaAt}
            ${enSucursalSql(sql`c.sucursal_id`)}
          group by ne.estado
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as avisos_metricas,
      case when ${financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            (vr.fecha_venta at time zone ${timeZone})::date::text as dia,
            count(*)::int as operaciones,
            coalesce(sum(vr.descuento + vr.descuento_promocion + vr.descuento_membresia), 0)::text as descuentos,
            coalesce(sum(vr.propina), 0)::text as propinas,
            coalesce(sum(vr.total), 0)::text as total
          from ventas_rango vr
          group by 1
          order by 1 desc
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as ventas_por_dia,
      case when ${financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            dvmp.medio_pago_id as "medioPagoId",
            mp.nombre,
            count(*)::int as operaciones,
            coalesce(sum(dvmp.monto), 0)::text as total
          from ventas_rango vr
          join detalle_ventas_medios_pagos dvmp on dvmp.venta_id = vr.id and dvmp.activo
          join cat_medios_pago mp on mp.id = dvmp.medio_pago_id
          group by dvmp.medio_pago_id, mp.nombre
          order by sum(dvmp.monto) desc
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as pagos_originales,
      case when ${financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            apv.medio_pago_origen_id as "origenId",
            apv.medio_pago_destino_id as "destinoId",
            coalesce(sum(apv.monto), 0)::text as total
          from ventas_rango vr
          join ajustes_pagos_venta apv on apv.venta_id = vr.id
          join detalle_ventas_medios_pagos dvmp on dvmp.id = apv.detalle_venta_medio_pago_id and dvmp.activo
          group by apv.medio_pago_origen_id, apv.medio_pago_destino_id
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as pagos_ajustes,
      case when ${financieros} then coalesce((
        select jsonb_agg(jsonb_build_object('id', mp.id, 'nombre', mp.nombre))
        from cat_medios_pago mp
        where mp.organizacion_id = ${organizacionId}
      ), '[]'::jsonb) else '[]'::jsonb end as medios_catalogo,
      case when ${financieros} then (
        select jsonb_build_object(
          'manual', coalesce(sum(vr.descuento), 0)::text,
          'promocion', coalesce(sum(vr.descuento_promocion), 0)::text,
          'membresia', coalesce(sum(vr.descuento_membresia), 0)::text
        )
        from ventas_rango vr
      ) else null end as descuentos,
      case when ${financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            u.id as "usuarioId",
            u.nombre,
            coalesce(sum(dvc.monto), 0)::text as total
          from ventas_rango vr
          join detalle_ventas_comisiones dvc on dvc.venta_id = vr.id and dvc.activo
          join usuarios u on u.id = dvc.usuario_id
          group by u.id, u.nombre
          order by sum(dvc.monto) desc
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as comision_por_usuario,
      case when ${financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            u.id as "usuarioId",
            u.nombre,
            coalesce(sum(dvp.monto), 0)::text as total
          from ventas_rango vr
          join detalle_ventas_propinas dvp on dvp.venta_id = vr.id and dvp.activo
          join usuarios u on u.id = dvp.usuario_id
          group by u.id, u.nombre
          order by sum(dvp.monto) desc
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as propina_por_usuario,
      case when ${financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            case when cc.cerrado_at is null then null
              else to_char(cc.cerrado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end as "cerradoAt",
            u.nombre as cajero,
            mp.nombre as medio,
            dc.esperado::text as esperado,
            dc.contado::text as contado,
            dc.diferencia::text as diferencia
          from detalle_cortes dc
          join cortes_caja cc on cc.id = dc.corte_id
          join cat_medios_pago mp on mp.id = dc.medio_pago_id
          left join usuarios u on u.id = cc.usuario_id
          where cc.organizacion_id = ${organizacionId}
            and cc.estado = 'cerrado'
            and dc.activo = true
            and dc.diferencia <> 0
            and cc.cerrado_at >= ${iniciaAt}
            and cc.cerrado_at < ${terminaAt}
            ${enSucursalSql(sql`cc.sucursal_id`)}
          order by cc.cerrado_at desc
          limit 20
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as diferencias_corte,
      case when ${financieros} then (
        select jsonb_build_object(
          'confirmado', coalesce(sum(g.importe) filter (where g.estado = 'confirmado'), 0)::text,
          'revertido', coalesce(sum(g.importe) filter (where g.estado = 'revertido'), 0)::text
        )
        from gastos g
        where g.organizacion_id = ${organizacionId}
          ${sucursalId ? sql`and g.sucursal_id = ${sucursalId}` : sql``}
          and g.fecha_gasto >= ${desde}
          and g.fecha_gasto <= ${hasta}
      ) else null end as gastos_totales,
      case when ${financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            coalesce(cg.nombre, 'Sin categoría') as nombre,
            coalesce(sum(g.importe), 0)::text as total
          from gastos g
          left join cat_categorias_gastos cg on cg.id = g.categoria_id
          where g.organizacion_id = ${organizacionId}
            ${sucursalId ? sql`and g.sucursal_id = ${sucursalId}` : sql``}
            and g.fecha_gasto >= ${desde}
            and g.fecha_gasto <= ${hasta}
            and g.estado = 'confirmado'
          group by cg.nombre
          order by sum(g.importe) desc
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as gastos_por_categoria,
      case when ${financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            u.id as "usuarioId",
            u.nombre,
            coalesce(sum(lc.total), 0)::text as total
          from liquidaciones_comisiones lc
          join usuarios u on u.id = lc.usuario_id
          where lc.organizacion_id = ${organizacionId}
            and lc.estado = 'confirmada'
            and lc.created_at >= ${iniciaAt}
            and lc.created_at < ${terminaAt}
            ${enSucursalSql(sql`lc.sucursal_id`)}
          group by u.id, u.nombre
          order by sum(lc.total) desc
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as liquidado_por_usuario,
      case when ${financieros} then (
        select jsonb_build_object(
          'total', coalesce(sum(d.monto), 0)::text,
          'operaciones', count(*)::int
        )
        from devoluciones d
        where d.organizacion_id = ${organizacionId}
          and d.created_at >= ${iniciaAt}
          and d.created_at < ${terminaAt}
          ${enSucursalSql(sql`d.sucursal_id`)}
      ) else null end as devoluciones_resumen,
      case when ${financieros} then (
        select jsonb_build_object(
          'cobrados', coalesce(sum(a.monto) filter (where a.estado <> 'devuelto'), 0)::text,
          'aplicados', coalesce(sum(a.monto) filter (where a.estado = 'aplicado'), 0)::text,
          'vigentes', coalesce(sum(a.monto) filter (where a.estado = 'vigente'), 0)::text
        )
        from anticipos a
        where a.organizacion_id = ${organizacionId}
          and a.activo = true
          and a.created_at >= ${iniciaAt}
          and a.created_at < ${terminaAt}
          ${enSucursalSql(sql`a.sucursal_id`)}
      ) else null end as anticipos_resumen,
      case when ${financieros} then (
        select jsonb_build_object(
          'unidades', coalesce(sum(dvp.cantidad), 0)::int,
          'productos', count(distinct dvp.producto_id)::int
        )
        from ventas_rango vr
        join detalle_ventas_productos dvp on dvp.venta_id = vr.id and dvp.activo
        join productos p on p.id = dvp.producto_id
        where coalesce(p.costo, 0) <= 0
      ) else null end as productos_sin_costo
  `);

  const r = rows[0];
  const nombresMedios = new Map((r?.medios_catalogo ?? []).map((m) => [m.id, m.nombre]));
  const porMedio = new Map<string, { nombre: string; operaciones: number; total: number }>();
  for (const row of r?.pagos_originales ?? []) {
    porMedio.set(row.medioPagoId, { nombre: row.nombre, operaciones: Number(row.operaciones), total: num(row.total) });
  }
  for (const ajuste of r?.pagos_ajustes ?? []) {
    const origen = porMedio.get(ajuste.origenId);
    if (origen) origen.total -= num(ajuste.total);
    const destino = porMedio.get(ajuste.destinoId) ?? {
      nombre: nombresMedios.get(ajuste.destinoId) ?? "Medio inactivo",
      operaciones: 0,
      total: 0,
    };
    destino.operaciones += 1;
    destino.total += num(ajuste.total);
    porMedio.set(ajuste.destinoId, destino);
  }
  const pagosPorMedio = [...porMedio.values()]
    .filter((row) => row.total > 0.005)
    .sort((a, b) => b.total - a.total);

  const gastosResumen: ResumenGastos = {
    totalConfirmado: Number(r?.gastos_totales?.confirmado ?? 0),
    totalRevertido: Number(r?.gastos_totales?.revertido ?? 0),
    porCategoria: (r?.gastos_por_categoria ?? []).map((row) => ({
      nombre: row.nombre,
      total: Number(row.total),
    })),
  };

  return {
    citasPorEstado: r?.citas_por_estado ?? [],
    clientesNuevos: [{ total: Number(r?.clientes_nuevos ?? 0) }],
    topServicios: r?.top_servicios ?? [],
    profesionales: r?.profesionales ?? [],
    citasPorOrigen: r?.citas_por_origen ?? [],
    avisosMetricas: r?.avisos_metricas ?? [],
    ventasPorDia: r?.ventas_por_dia ?? [],
    pagosPorMedio,
    descuentos: r?.descuentos ? [r.descuentos] : [],
    comisionPorUsuario: r?.comision_por_usuario ?? [],
    propinaPorUsuario: r?.propina_por_usuario ?? [],
    diferenciasCorte: (r?.diferencias_corte ?? []).map((d) => ({
      ...d,
      cerradoAt: d.cerradoAt ? new Date(d.cerradoAt) : null,
    })),
    gastosResumen,
    liquidadoPorUsuario: r?.liquidado_por_usuario ?? [],
    devolucionesResumen: [r?.devoluciones_resumen ?? { total: "0", operaciones: 0 }],
    anticiposResumen: [r?.anticipos_resumen ?? { cobrados: "0", aplicados: "0", vigentes: "0" }],
    productosSinCosto: [r?.productos_sin_costo ?? { unidades: 0, productos: 0 }],
  };
}

export type ReporteDatos = NonNullable<Awaited<ReturnType<typeof cargarReporte>>>;

/** Totales agregados del periodo anterior (misma longitud, previo inmediato). */
export async function cargarAgregadosAnteriores(
  db: ReturnType<typeof getDatabase>,
  filtros: Pick<
    ReporteFiltros,
    "organizacionId" | "sucursalId" | "timeZone" | "sucursalesPermitidas"
  > & {
    desde: string;
    hasta: string;
    operativos: boolean;
    financieros: boolean;
  },
) {
  const { organizacionId, sucursalId, timeZone, desde, hasta } = filtros;
  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) return { ventasAnt: [{ total: "0", operaciones: 0 }], citasAnt: [] };

  const idsPermitidas = filtros.sucursalesPermitidas ? [...filtros.sucursalesPermitidas] : null;
  if (!sucursalId && idsPermitidas && idsPermitidas.length === 0) {
    return { ventasAnt: [{ total: "0", operaciones: 0 }], citasAnt: [] };
  }

  const enSucursalSql = (columna: SQL) =>
    sucursalId
      ? sql`and ${columna} = ${sucursalId}`
      : idsPermitidas
        ? sql`and ${columna} in (${sql.join(idsPermitidas.map((id) => sql`${id}`), sql`, `)})`
        : sql``;

  const { rows } = await db.execute<{
    ventas_ant: { total: string; operaciones: number } | null;
    citas_ant: Array<{ estado: string; total: number }>;
  }>(sql`
    select
      case when ${filtros.financieros} then (
        select jsonb_build_object(
          'total', coalesce(sum(v.total), 0)::text,
          'operaciones', count(*)::int
        )
        from ventas v
        where v.organizacion_id = ${organizacionId}
          and v.estado = 'completada'
          and v.activo = true
          and coalesce(v.cobrada_at, v.created_at) >= ${boundsDesde.iniciaAt}
          and coalesce(v.cobrada_at, v.created_at) < ${boundsHasta.terminaAt}
          ${enSucursalSql(sql`v.sucursal_id`)}
      ) else null end as ventas_ant,
      case when ${filtros.operativos} then coalesce((
        select jsonb_agg(jsonb_build_object('estado', estado, 'total', total))
        from (
          select c.estado, count(*)::int as total
          from citas c
          where c.organizacion_id = ${organizacionId}
            and c.activo = true
            and c.fecha_hora >= ${boundsDesde.iniciaAt}
            and c.fecha_hora < ${boundsHasta.terminaAt}
            ${enSucursalSql(sql`c.sucursal_id`)}
          group by c.estado
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as citas_ant
  `);

  const r = rows[0];
  return {
    ventasAnt: [r?.ventas_ant ?? { total: "0", operaciones: 0 }],
    citasAnt: r?.citas_ant ?? [],
  };
}

/** Comparativo por sucursal para la vista consolidada (Profesional). */
export async function comparativoSucursales(
  db: ReturnType<typeof getDatabase>,
  filtros: Pick<
    ReporteFiltros,
    "organizacionId" | "sucursalesPermitidas" | "timeZone" | "operativos" | "financieros"
  > & { desde: string; hasta: string },
) {
  const { organizacionId, timeZone, desde, hasta } = filtros;
  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) return [];
  const iniciaAt = boundsDesde.iniciaAt;
  const terminaAt = boundsHasta.terminaAt;

  const idsPermitidas = filtros.sucursalesPermitidas ? [...filtros.sucursalesPermitidas] : null;
  if (idsPermitidas && idsPermitidas.length === 0) return [];

  const permitidasSql = (columna: SQL) =>
    idsPermitidas
      ? sql`and ${columna} in (${sql.join(idsPermitidas.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

  const { rows } = await db.execute<{
    ventas_por_sucursal: Array<{ sucursalId: string; total: string; operaciones: number }>;
    citas_por_sucursal: Array<{
      sucursalId: string;
      total: number;
      completadas: number;
      canceladas: number;
      noShow: number;
    }>;
    nombres: Array<{ id: string; nombre: string }>;
  }>(sql`
    select
      case when ${filtros.financieros} then coalesce((
        select jsonb_agg(t)
        from (
          select
            v.sucursal_id as "sucursalId",
            coalesce(sum(v.total), 0)::text as total,
            count(*)::int as operaciones
          from ventas v
          where v.organizacion_id = ${organizacionId}
            and v.estado = 'completada'
            and v.activo = true
            and coalesce(v.cobrada_at, v.created_at) >= ${iniciaAt}
            and coalesce(v.cobrada_at, v.created_at) < ${terminaAt}
            ${permitidasSql(sql`v.sucursal_id`)}
          group by v.sucursal_id
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as ventas_por_sucursal,
      case when ${filtros.operativos} then coalesce((
        select jsonb_agg(t)
        from (
          select
            c.sucursal_id as "sucursalId",
            count(*)::int as total,
            count(*) filter (where c.estado = 'completada')::int as completadas,
            count(*) filter (where c.estado = 'cancelada')::int as canceladas,
            count(*) filter (where c.estado in ('no_asistio', 'no_show'))::int as "noShow"
          from citas c
          where c.organizacion_id = ${organizacionId}
            and c.activo = true
            and c.fecha_hora >= ${iniciaAt}
            and c.fecha_hora < ${terminaAt}
            ${permitidasSql(sql`c.sucursal_id`)}
          group by c.sucursal_id
        ) t
      ), '[]'::jsonb) else '[]'::jsonb end as citas_por_sucursal,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre))
        from sucursales s
        where s.organizacion_id = ${organizacionId}
          ${permitidasSql(sql`s.id`)}
      ), '[]'::jsonb) as nombres
  `);

  const r = rows[0];
  const ventasPorSucursal = r?.ventas_por_sucursal ?? [];
  const citasPorSucursal = r?.citas_por_sucursal ?? [];
  const nombres = r?.nombres ?? [];

  const ids = new Set<string>([
    ...ventasPorSucursal.map((row) => row.sucursalId),
    ...citasPorSucursal.map((row) => row.sucursalId),
    ...nombres.map((row) => row.id),
  ]);
  const nombreDe = new Map(nombres.map((row) => [row.id, row.nombre]));
  const ventaDe = new Map(ventasPorSucursal.map((row) => [row.sucursalId, row]));
  const citaDe = new Map(citasPorSucursal.map((row) => [row.sucursalId, row]));

  return [...ids]
    .map((id) => ({
      sucursalId: id,
      nombre: nombreDe.get(id) ?? "Sucursal",
      vendido: num(ventaDe.get(id)?.total),
      operaciones: ventaDe.get(id)?.operaciones ?? 0,
      citas: citaDe.get(id)?.total ?? 0,
      completadas: citaDe.get(id)?.completadas ?? 0,
      canceladas: citaDe.get(id)?.canceladas ?? 0,
      noShow: citaDe.get(id)?.noShow ?? 0,
    }))
    .sort((a, b) => b.vendido - a.vendido || a.nombre.localeCompare(b.nombre, "es"));
}
