import { and, desc, eq, gte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  telemetriaProductoEventos,
  telemetriaSesiones,
} from "@/db/schema/telemetry";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { queryAnalyticsEngine } from "@/lib/telemetry/analytics-engine";

/**
 * Consultas del panel de telemetría de producto (solo administradores de
 * plataforma). Agregan sobre `telemetria_sesiones` y
 * `telemetria_producto_eventos`; ninguna expone datos personales porque el
 * colector nunca los captura.
 *
 * Si están configuradas CF_ACCOUNT_ID y CF_API_TOKEN_ANALYTICS, consulta
 * prioritariamente la SQL API de Cloudflare Workers Analytics Engine; de lo
 * contrario degrada con elegancia a las tablas de CockroachDB.
 */

function isAeConfigured(): boolean {
  const env = getRuntimeEnv();
  return Boolean(
    (env.CF_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID) &&
      (env.CF_API_TOKEN_ANALYTICS ?? process.env.CF_API_TOKEN_ANALYTICS),
  );
}

export async function resumenSesiones(dias: number) {
  if (isAeConfigured()) {
    const rows = await queryAnalyticsEngine<{
      sesiones: number | string;
      paginasTotales: number | string;
      usuariosUnicos: number | string;
    }>(`
      SELECT
        toUInt32(count()) as sesiones,
        toUInt32(sum(_sample_interval)) as paginasTotales,
        toUInt32(count(distinct index1)) as usuariosUnicos
      FROM melena_telemetry
      WHERE timestamp >= NOW() - INTERVAL '${dias}' DAY
    `);
    if (rows && rows.length > 0 && Number(rows[0].sesiones) > 0) {
      const r = rows[0];
      const sesiones = Number(r.sesiones);
      const paginasTotales = Number(r.paginasTotales);
      const usuariosUnicos = Number(r.usuariosUnicos);
      return {
        sesiones,
        engaged: sesiones,
        paginasTotales,
        promedioPaginas: sesiones > 0 ? Number((paginasTotales / sesiones).toFixed(1)) : 0,
        promedioActivoSeg: 0,
        usuariosUnicos,
        tasaRebote: 0,
      };
    }
  }

  const db = getDatabase();
  const corte = new Date(Date.now() - dias * 24 * 60 * 60_000);
  const [fila] = await db
    .select({
      sesiones: sql<number>`count(*)::int`,
      engaged: sql<number>`count(*) filter (where ${telemetriaSesiones.engaged})::int`,
      paginasTotales: sql<number>`coalesce(sum(${telemetriaSesiones.paginas}), 0)::int`,
      promedioPaginas: sql<number>`coalesce(avg(${telemetriaSesiones.paginas}), 0)::float`,
      promedioActivoSeg: sql<number>`coalesce(avg(${telemetriaSesiones.tiempoActivoMs}) / 1000, 0)::float`,
      usuariosUnicos: sql<number>`count(distinct ${telemetriaSesiones.usuarioId})::int`,
    })
    .from(telemetriaSesiones)
    .where(gte(telemetriaSesiones.iniciaAt, corte));
  return {
    ...fila,
    tasaRebote:
      fila.sesiones > 0 ? Math.round(((fila.sesiones - fila.engaged) / fila.sesiones) * 100) : 0,
  };
}

export async function paginasMasVistas(dias: number, limite = 20) {
  if (isAeConfigured()) {
    const rows = await queryAnalyticsEngine<{
      ruta: string;
      vistas: number | string;
      sesiones: number | string;
    }>(`
      SELECT
        blob2 as ruta,
        toUInt32(sum(_sample_interval)) as vistas,
        toUInt32(count(distinct index1)) as sesiones
      FROM melena_telemetry
      WHERE blob1 = 'nav' AND timestamp >= NOW() - INTERVAL '${dias}' DAY
      GROUP BY ruta
      ORDER BY vistas DESC
      LIMIT ${limite}
    `);
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        ruta: r.ruta,
        vistas: Number(r.vistas),
        sesiones: Number(r.sesiones),
      }));
    }
  }

  const db = getDatabase();
  const corte = new Date(Date.now() - dias * 24 * 60 * 60_000);
  return db
    .select({
      ruta: telemetriaProductoEventos.ruta,
      vistas: sql<number>`count(*)::int`,
      sesiones: sql<number>`count(distinct ${telemetriaProductoEventos.sid})::int`,
    })
    .from(telemetriaProductoEventos)
    .where(
      and(
        eq(telemetriaProductoEventos.tipo, "page_view"),
        gte(telemetriaProductoEventos.createdAt, corte),
      ),
    )
    .groupBy(telemetriaProductoEventos.ruta)
    .orderBy(desc(sql`count(*)`))
    .limit(limite);
}

export async function accionesMasUsadas(dias: number, limite = 20) {
  if (isAeConfigured()) {
    const rows = await queryAnalyticsEngine<{
      actionId: string;
      total: number | string;
      clave: number | string;
    }>(`
      SELECT
        blob2 as actionId,
        toUInt32(sum(_sample_interval)) as total,
        toUInt32(sum(if(blob3 = 'clave' or double2 = 1, 1, 0))) as clave
      FROM melena_telemetry
      WHERE blob1 = 'prod' AND timestamp >= NOW() - INTERVAL '${dias}' DAY
      GROUP BY actionId
      ORDER BY total DESC
      LIMIT ${limite}
    `);
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        actionId: r.actionId,
        total: Number(r.total),
        clave: Number(r.clave),
      }));
    }
  }

  const db = getDatabase();
  const corte = new Date(Date.now() - dias * 24 * 60 * 60_000);
  return db
    .select({
      actionId: telemetriaProductoEventos.actionId,
      total: sql<number>`count(*)::int`,
      clave: sql<number>`count(*) filter (where ${telemetriaProductoEventos.accionClave})::int`,
    })
    .from(telemetriaProductoEventos)
    .where(
      and(
        eq(telemetriaProductoEventos.tipo, "action"),
        gte(telemetriaProductoEventos.createdAt, corte),
      ),
    )
    .groupBy(telemetriaProductoEventos.actionId)
    .orderBy(desc(sql`count(*)`))
    .limit(limite);
}

/**
 * Rebote por página de entrada: % de sesiones NO engaged que entraron por esa
 * ruta (criterio GA4: <10 s activos, una sola página y sin acción clave).
 */
export async function rebotePorEntrada(dias: number, limite = 15) {
  const db = getDatabase();
  const corte = new Date(Date.now() - dias * 24 * 60 * 60_000);
  return db
    .select({
      ruta: telemetriaSesiones.entradaRuta,
      sesiones: sql<number>`count(*)::int`,
      rebotes: sql<number>`count(*) filter (where not ${telemetriaSesiones.engaged})::int`,
    })
    .from(telemetriaSesiones)
    .where(gte(telemetriaSesiones.iniciaAt, corte))
    .groupBy(telemetriaSesiones.entradaRuta)
    .orderBy(desc(sql`count(*)`))
    .limit(limite);
}

/** Percentiles p50/p75/p95 de cada Web Vital recolectada. */
export async function webVitals(dias: number) {
  const db = getDatabase();
  const corte = new Date(Date.now() - dias * 24 * 60 * 60_000);
  return db
    .select({
      metrica: telemetriaProductoEventos.metrica,
      muestras: sql<number>`count(*)::int`,
      p50: sql<number>`percentile_cont(0.5) within group (order by ${telemetriaProductoEventos.valor})::float`,
      p75: sql<number>`percentile_cont(0.75) within group (order by ${telemetriaProductoEventos.valor})::float`,
      p95: sql<number>`percentile_cont(0.95) within group (order by ${telemetriaProductoEventos.valor})::float`,
    })
    .from(telemetriaProductoEventos)
    .where(
      and(
        eq(telemetriaProductoEventos.tipo, "performance"),
        gte(telemetriaProductoEventos.createdAt, corte),
      ),
    )
    .groupBy(telemetriaProductoEventos.metrica);
}

/** Resultados de formularios/flujos: éxito vs error por acción. */
export async function resultadosFormularios(dias: number, limite = 20) {
  const db = getDatabase();
  const corte = new Date(Date.now() - dias * 24 * 60 * 60_000);
  return db
    .select({
      actionId: telemetriaProductoEventos.actionId,
      exitos: sql<number>`count(*) filter (where ${telemetriaProductoEventos.tipo} = 'form_success')::int`,
      errores: sql<number>`count(*) filter (where ${telemetriaProductoEventos.tipo} = 'form_error')::int`,
    })
    .from(telemetriaProductoEventos)
    .where(
      and(
        sql`${telemetriaProductoEventos.tipo} in ('form_success', 'form_error')`,
        gte(telemetriaProductoEventos.createdAt, corte),
      ),
    )
    .groupBy(telemetriaProductoEventos.actionId)
    .orderBy(desc(sql`count(*)`))
    .limit(limite);
}
