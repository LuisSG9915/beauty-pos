import { and, desc, eq, gte, ilike, lt, sql, type SQL } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  incidentesError,
  type IncidenteEstado,
  type IncidentePrioridad,
} from "@/db/schema/incidents";
import { usuarios } from "@/db/schema/core";

export type IncidenteFiltros = {
  estado?: string;
  prioridad?: string;
  modulo?: string;
  q?: string;
  desde?: string;
  hasta?: string;
};

const ESTADOS_ABIERTOS: readonly IncidenteEstado[] = ["nuevo", "en_revision", "en_progreso"];

/** Lista paginada para el módulo de plataforma. Solo admins de plataforma. */
export async function listarIncidentes(filtros: IncidenteFiltros, page: number, pageSize = 30) {
  const db = getDatabase();
  const conditions: SQL[] = [];
  if (filtros.estado === "abiertos") {
    conditions.push(
      sql`${incidentesError.estado} in (${sql.join(
        ESTADOS_ABIERTOS.map((estado) => sql`${estado}`),
        sql`, `,
      )})`,
    );
  } else if (filtros.estado) {
    conditions.push(eq(incidentesError.estado, filtros.estado));
  }
  if (filtros.prioridad) conditions.push(eq(incidentesError.prioridad, filtros.prioridad));
  if (filtros.modulo) conditions.push(eq(incidentesError.modulo, filtros.modulo));
  if (filtros.q) conditions.push(ilike(incidentesError.titulo, `%${filtros.q.slice(0, 80)}%`));
  if (filtros.desde) {
    conditions.push(gte(incidentesError.ultimaVezAt, new Date(`${filtros.desde}T00:00:00`)));
  }
  if (filtros.hasta) {
    conditions.push(lt(incidentesError.ultimaVezAt, new Date(`${filtros.hasta}T23:59:59.999`)));
  }

  const ordenPrioridad = sql`case ${incidentesError.prioridad}
    when 'p0' then 0 when 'p1' then 1 when 'p2' then 2 else 3 end`;

  return db
    .select({
      id: incidentesError.id,
      titulo: incidentesError.titulo,
      fuente: incidentesError.fuente,
      modulo: incidentesError.modulo,
      ruta: incidentesError.ruta,
      prioridad: incidentesError.prioridad,
      estado: incidentesError.estado,
      ocurrencias: incidentesError.ocurrencias,
      organizacionesAfectadas: incidentesError.organizacionesAfectadas,
      primeraVezAt: incidentesError.primeraVezAt,
      ultimaVezAt: incidentesError.ultimaVezAt,
      asignadoNombre: usuarios.nombre,
    })
    .from(incidentesError)
    .leftJoin(usuarios, eq(incidentesError.asignadoA, usuarios.id))
    .where(conditions.length ? and(...conditions) : undefined)
    // Urgencia: prioridad → recencia → frecuencia.
    .orderBy(ordenPrioridad, desc(incidentesError.ultimaVezAt), desc(incidentesError.ocurrencias))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
}

/** Detalle completo: incidente + ocurrencias recientes + historial + navegadores. */
export async function obtenerIncidente(id: string) {
  const db = getDatabase();

  type IncidenteDetalleRow = {
    incidente: {
      id: string;
      fingerprint: string;
      titulo: string;
      mensaje: string | null;
      fuente: string;
      modulo: string | null;
      ruta: string | null;
      actionId: string | null;
      prioridad: string;
      estado: string;
      ocurrencias: number;
      organizacionesAfectadas: number;
      primeraVezAt: string;
      ultimaVezAt: string;
      sentryIssueUrl: string | null;
      releaseAparece: string | null;
      releaseCorregido: string | null;
      asignadoA: string | null;
      resueltoAt: string | null;
      notaResolucion: string | null;
      asignadoNombre: string | null;
      resueltoNombre: string | null;
    } | null;
    ocurrencias: Array<{
      id: string;
      correlationId: string;
      ruta: string | null;
      navegador: string | null;
      dispositivo: string | null;
      release: string | null;
      contexto: Record<string, unknown> | null;
      createdAt: string;
      organizacion: string | null;
    }>;
    historial: Array<{
      id: string;
      tipo: string;
      valorAnterior: string | null;
      valorNuevo: string | null;
      comentario: string | null;
      createdAt: string;
      usuario: string | null;
    }>;
    por_navegador: Array<{ navegador: string | null; total: number }>;
  };

  // Incidente + ocurrencias (25) + historial (50) + conteo por navegador en
  // UNA sola consulta SQL (antes 4 consultas en 2 rondas secuenciales).
  const { rows } = await db.execute<IncidenteDetalleRow>(sql`
    select
      (
        select jsonb_build_object(
          'id', ie.id,
          'fingerprint', ie.fingerprint,
          'titulo', ie.titulo,
          'mensaje', ie.mensaje,
          'fuente', ie.fuente,
          'modulo', ie.modulo,
          'ruta', ie.ruta,
          'actionId', ie.action_id,
          'prioridad', ie.prioridad,
          'estado', ie.estado,
          'ocurrencias', ie.ocurrencias,
          'organizacionesAfectadas', ie.organizaciones_afectadas,
          'primeraVezAt', to_char(ie.primera_vez_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'ultimaVezAt', to_char(ie.ultima_vez_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'sentryIssueUrl', ie.sentry_issue_url,
          'releaseAparece', ie.release_aparece,
          'releaseCorregido', ie.release_corregido,
          'asignadoA', ie.asignado_a,
          'resueltoAt', case when ie.resuelto_at is null then null
            else to_char(ie.resuelto_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
          'notaResolucion', ie.nota_resolucion,
          'asignadoNombre', u.nombre,
          'resueltoNombre', rp.nombre
        )
        from incidentes_error ie
        left join usuarios u on u.id = ie.asignado_a
        left join usuarios rp on rp.id = ie.resuelto_por
        where ie.id = ${id}
        limit 1
      ) as incidente,
      coalesce((
        select jsonb_agg(t) from (
          select
            io.id,
            io.correlation_id as "correlationId",
            io.ruta,
            io.navegador,
            io.dispositivo,
            io.release,
            io.contexto,
            to_char(io.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
            o.nombre as organizacion
          from incidentes_ocurrencias io
          left join organizaciones o on o.id = io.organizacion_id
          where io.incidente_id = ${id}
          order by io.created_at desc
          limit 25
        ) t
      ), '[]'::jsonb) as ocurrencias,
      coalesce((
        select jsonb_agg(t) from (
          select
            ih.id,
            ih.tipo,
            ih.valor_anterior as "valorAnterior",
            ih.valor_nuevo as "valorNuevo",
            ih.comentario,
            to_char(ih.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
            u2.nombre as usuario
          from incidentes_historial ih
          left join usuarios u2 on u2.id = ih.usuario_id
          where ih.incidente_id = ${id}
          order by ih.created_at desc
          limit 50
        ) t
      ), '[]'::jsonb) as historial,
      coalesce((
        select jsonb_agg(jsonb_build_object('navegador', navegador, 'total', total))
        from (
          select io2.navegador, count(*)::int as total
          from incidentes_ocurrencias io2
          where io2.incidente_id = ${id}
          group by io2.navegador
        ) t
      ), '[]'::jsonb) as por_navegador
  `);

  const row = rows[0];
  if (!row?.incidente) return null;
  const incidente = {
    ...row.incidente,
    primeraVezAt: new Date(row.incidente.primeraVezAt),
    ultimaVezAt: new Date(row.incidente.ultimaVezAt),
    resueltoAt: row.incidente.resueltoAt ? new Date(row.incidente.resueltoAt) : null,
  };
  const ocurrencias = (row.ocurrencias ?? []).map((o) => ({ ...o, createdAt: new Date(o.createdAt) }));
  const historial = (row.historial ?? []).map((h) => ({ ...h, createdAt: new Date(h.createdAt) }));
  const porNavegador = row.por_navegador ?? [];

  return { incidente, ocurrencias, historial, porNavegador };
}

/** Admins de plataforma asignables como responsables de incidentes. */
export async function administradoresPlataforma() {
  const db = getDatabase();
  return db
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(usuarios)
    .where(eq(usuarios.esAdministradorPlataforma, true))
    .orderBy(usuarios.nombre);
}

export { ESTADOS_ABIERTOS };
export type { IncidenteEstado, IncidentePrioridad };
