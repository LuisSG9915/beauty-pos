import { and, desc, eq, gte, ilike, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDatabase } from "@/db/client";
import {
  incidentesError,
  incidentesHistorial,
  incidentesOcurrencias,
  type IncidenteEstado,
  type IncidentePrioridad,
} from "@/db/schema/incidents";
import { organizaciones, usuarios } from "@/db/schema/core";

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

/** Detalle completo: incidente + ocurrencias recientes + historial. */
export async function obtenerIncidente(id: string) {
  const db = getDatabase();
  const resueltoPor = alias(usuarios, "resuelto_por_usuario");
  const [incidente] = await db
    .select({
      id: incidentesError.id,
      fingerprint: incidentesError.fingerprint,
      titulo: incidentesError.titulo,
      mensaje: incidentesError.mensaje,
      fuente: incidentesError.fuente,
      modulo: incidentesError.modulo,
      ruta: incidentesError.ruta,
      actionId: incidentesError.actionId,
      prioridad: incidentesError.prioridad,
      estado: incidentesError.estado,
      ocurrencias: incidentesError.ocurrencias,
      organizacionesAfectadas: incidentesError.organizacionesAfectadas,
      primeraVezAt: incidentesError.primeraVezAt,
      ultimaVezAt: incidentesError.ultimaVezAt,
      sentryIssueUrl: incidentesError.sentryIssueUrl,
      releaseAparece: incidentesError.releaseAparece,
      releaseCorregido: incidentesError.releaseCorregido,
      asignadoA: incidentesError.asignadoA,
      resueltoAt: incidentesError.resueltoAt,
      notaResolucion: incidentesError.notaResolucion,
      asignadoNombre: usuarios.nombre,
      resueltoNombre: resueltoPor.nombre,
    })
    .from(incidentesError)
    .leftJoin(usuarios, eq(incidentesError.asignadoA, usuarios.id))
    .leftJoin(resueltoPor, eq(resueltoPor.id, incidentesError.resueltoPor))
    .where(eq(incidentesError.id, id))
    .limit(1);

  if (!incidente) return null;

  const [ocurrencias, historial, porNavegador] = await Promise.all([
    db
      .select({
        id: incidentesOcurrencias.id,
        correlationId: incidentesOcurrencias.correlationId,
        ruta: incidentesOcurrencias.ruta,
        navegador: incidentesOcurrencias.navegador,
        dispositivo: incidentesOcurrencias.dispositivo,
        release: incidentesOcurrencias.release,
        contexto: incidentesOcurrencias.contexto,
        createdAt: incidentesOcurrencias.createdAt,
        organizacion: organizaciones.nombre,
      })
      .from(incidentesOcurrencias)
      .leftJoin(organizaciones, eq(incidentesOcurrencias.organizacionId, organizaciones.id))
      .where(eq(incidentesOcurrencias.incidenteId, id))
      .orderBy(desc(incidentesOcurrencias.createdAt))
      .limit(25),
    db
      .select({
        id: incidentesHistorial.id,
        tipo: incidentesHistorial.tipo,
        valorAnterior: incidentesHistorial.valorAnterior,
        valorNuevo: incidentesHistorial.valorNuevo,
        comentario: incidentesHistorial.comentario,
        createdAt: incidentesHistorial.createdAt,
        usuario: usuarios.nombre,
      })
      .from(incidentesHistorial)
      .leftJoin(usuarios, eq(incidentesHistorial.usuarioId, usuarios.id))
      .where(eq(incidentesHistorial.incidenteId, id))
      .orderBy(desc(incidentesHistorial.createdAt))
      .limit(50),
    db
      .select({
        navegador: incidentesOcurrencias.navegador,
        total: sql<number>`count(*)::int`,
      })
      .from(incidentesOcurrencias)
      .where(eq(incidentesOcurrencias.incidenteId, id))
      .groupBy(incidentesOcurrencias.navegador),
  ]);

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
