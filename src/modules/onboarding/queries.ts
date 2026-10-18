import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { progresoGuias } from "@/db/schema/onboarding";
import { kvDelete, kvGetJson, kvPutJson } from "@/lib/kv-cache";
import type { EstadoGuia, EstadoNegocio } from "./types";
import { GUIA_CONFIGURACION, GUIA_VERSION } from "./types";

type Db = ReturnType<typeof getDatabase>;

/**
 * Señales reales del negocio para evaluar el checklist de la guía.
 * Fusionadas en 1 consulta única con subselects para evitar handshakes múltiples al pool.
 */
export async function cargarEstadoNegocio(
  db: Db,
  organizacionId: string,
  sucursalId: string,
): Promise<EstadoNegocio> {
  const result = await db.execute<{
    servicios_activos: number;
    horarios_activos: number;
    miembros_activos: number;
    citas_registradas: number;
    ventas_cobradas: number;
    sucursal_nombre: string | null;
  }>(sql`
    select
      (select count(*)::int from servicios where organizacion_id = ${organizacionId} and activo = true) as servicios_activos,
      (select count(*)::int from horarios_sucursales where organizacion_id = ${organizacionId} and sucursal_id = ${sucursalId} and activo = true) as horarios_activos,
      (select count(*)::int from miembros_organizaciones where organizacion_id = ${organizacionId} and estado = 'activo') as miembros_activos,
      (select count(*)::int from citas where organizacion_id = ${organizacionId} and sucursal_id = ${sucursalId} and activo = true) as citas_registradas,
      (select count(*)::int from ventas where organizacion_id = ${organizacionId} and sucursal_id = ${sucursalId} and activo = true and estado = 'completada') as ventas_cobradas,
      (select nombre from sucursales where id = ${sucursalId} limit 1) as sucursal_nombre
  `);

  const row = (result.rows?.[0] ?? {}) as {
    servicios_activos?: number;
    horarios_activos?: number;
    miembros_activos?: number;
    citas_registradas?: number;
    ventas_cobradas?: number;
    sucursal_nombre?: string | null;
  };

  return {
    serviciosActivos: Number(row.servicios_activos ?? 0),
    horariosActivos: Number(row.horarios_activos ?? 0),
    miembrosActivos: Number(row.miembros_activos ?? 0),
    citasRegistradas: Number(row.citas_registradas ?? 0),
    ventasCobradas: Number(row.ventas_cobradas ?? 0),
    sucursalNombre: row.sucursal_nombre ?? null,
  };
}

export type EstadoYProgreso = {
  estadoNegocio: EstadoNegocio;
  progresoGuia: ProgresoGuiaRow | null;
};

/**
 * Estado del negocio + progreso de guía en UNA sola consulta: los 6
 * escalares operativos y el row de `progreso_guias` viajan como subselects
 * de la misma ronda (cada consulta extra pagaría otro handshake al pool).
 */
export async function cargarEstadoYProgresoGuia(
  db: Db,
  organizacionId: string,
  sucursalId: string,
  usuarioId: string,
): Promise<EstadoYProgreso> {
  const result = await db.execute<{
    servicios_activos: number;
    horarios_activos: number;
    miembros_activos: number;
    citas_registradas: number;
    ventas_cobradas: number;
    sucursal_nombre: string | null;
    progreso: { estado: EstadoGuia; paso_actual: number } | null;
  }>(sql`
    select
      (select count(*)::int from servicios where organizacion_id = ${organizacionId} and activo = true) as servicios_activos,
      (select count(*)::int from horarios_sucursales where organizacion_id = ${organizacionId} and sucursal_id = ${sucursalId} and activo = true) as horarios_activos,
      (select count(*)::int from miembros_organizaciones where organizacion_id = ${organizacionId} and estado = 'activo') as miembros_activos,
      (select count(*)::int from citas where organizacion_id = ${organizacionId} and sucursal_id = ${sucursalId} and activo = true) as citas_registradas,
      (select count(*)::int from ventas where organizacion_id = ${organizacionId} and sucursal_id = ${sucursalId} and activo = true and estado = 'completada') as ventas_cobradas,
      (select nombre from sucursales where id = ${sucursalId} limit 1) as sucursal_nombre,
      (select jsonb_build_object('estado', estado, 'paso_actual', paso_actual)
         from progreso_guias
        where organizacion_id = ${organizacionId}
          and usuario_id = ${usuarioId}
          and guia_clave = ${GUIA_CONFIGURACION}
          and guia_version = ${GUIA_VERSION}
        limit 1) as progreso
  `);

  const row = result.rows?.[0] ?? {};
  return {
    estadoNegocio: {
      serviciosActivos: Number(row.servicios_activos ?? 0),
      horariosActivos: Number(row.horarios_activos ?? 0),
      miembrosActivos: Number(row.miembros_activos ?? 0),
      citasRegistradas: Number(row.citas_registradas ?? 0),
      ventasCobradas: Number(row.ventas_cobradas ?? 0),
      sucursalNombre: row.sucursal_nombre ?? null,
    },
    progresoGuia: row.progreso
      ? { estado: row.progreso.estado, pasoActual: row.progreso.paso_actual }
      : null,
  };
}

export type ProgresoGuiaRow = {
  estado: EstadoGuia;
  pasoActual: number;
};

/** Último estado guardado de la guía; `null` si nunca se ha interactuado. */
export async function cargarProgresoGuia(
  db: Db,
  organizacionId: string,
  usuarioId: string,
): Promise<ProgresoGuiaRow | null> {
  const [row] = await db
    .select({ estado: progresoGuias.estado, pasoActual: progresoGuias.pasoActual })
    .from(progresoGuias)
    .where(
      and(
        eq(progresoGuias.organizacionId, organizacionId),
        eq(progresoGuias.usuarioId, usuarioId),
        eq(progresoGuias.guiaClave, GUIA_CONFIGURACION),
        eq(progresoGuias.guiaVersion, GUIA_VERSION),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { estado: row.estado as EstadoGuia, pasoActual: row.pasoActual };
}

export type ProgresoOnboarding = {
  estadoNegocio: EstadoNegocio | null;
  progresoGuia: ProgresoGuiaRow | null;
};

/**
 * Obtiene el progreso de onboarding con caché KV (TTL 10 min).
 */
export async function obtenerProgresoOnboarding(
  organizacionId: string,
  sucursalId?: string | null,
  usuarioId?: string | null,
): Promise<ProgresoOnboarding> {
  const cacheKey = `onboarding:${organizacionId}`;
  const cached = await kvGetJson<ProgresoOnboarding>(cacheKey);
  if (cached !== null) return cached;

  const db = getDatabase();
  let resultado: ProgresoOnboarding;
  if (sucursalId && usuarioId) {
    resultado = await cargarEstadoYProgresoGuia(db, organizacionId, sucursalId, usuarioId);
  } else {
    const [estadoNegocio, progresoGuia] = await Promise.all([
      sucursalId ? cargarEstadoNegocio(db, organizacionId, sucursalId) : Promise.resolve(null),
      usuarioId ? cargarProgresoGuia(db, organizacionId, usuarioId) : Promise.resolve(null),
    ]);
    resultado = { estadoNegocio, progresoGuia };
  }

  await kvPutJson(cacheKey, resultado, { expirationTtl: 600 });
  return resultado;
}

/**
 * Invalida la caché de onboarding para una organización.
 */
export async function invalidarCacheOnboarding(organizacionId: string): Promise<void> {
  await kvDelete(`onboarding:${organizacionId}`);
}

