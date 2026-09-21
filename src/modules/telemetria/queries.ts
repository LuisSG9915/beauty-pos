import { and, desc, eq, gte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  telemetriaProductoEventos,
  telemetriaSesiones,
} from "@/db/schema/telemetry";

/**
 * Consultas del panel de telemetría de producto (solo administradores de
 * plataforma). Agregan sobre `telemetria_sesiones` y
 * `telemetria_producto_eventos`; ninguna expone datos personales porque el
 * colector nunca los captura.
 */

export async function resumenSesiones(dias: number) {
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
