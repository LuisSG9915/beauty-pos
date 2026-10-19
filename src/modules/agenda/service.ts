/**
 * Acceso a datos del dominio de Agenda. Toda la lectura/escritura con Drizzle
 * vive aquí; las reglas puras están en `rules.ts` y no conocen la base.
 */

import { and, eq, lt, ne, notInArray, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";

import { clientes, organizaciones, relUsuariosSucursales, sucursales } from "@/db/schema/core";
import { citaRecursos, citas, citasHistorial } from "@/db/schema/operations";
import { ESTADOS_CITA_INACTIVOS, intervalFromDates, type DisponibilidadResult } from "./types";
import type { BloqueoLike, CitaLike, RecursoLike, TurnoDia } from "./rules";
import { validateCitaAvailability } from "./rules";
import { getZonedParts, resolveTimeZone } from "./timezone";

type Schema = typeof import("@/db/schema");

/** Conexión usable dentro o fuera de una transacción. */
export type AgendaDb = NodePgDatabase<Schema> | NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;

export type CitaRow = typeof citas.$inferSelect;

export interface SucursalAgendaContext {
  id: string;
  organizacionId: string;
  activo: boolean;
  /** Zona IANA efectiva: sucursal.zonaHoraria ?? organizacion.zonaHoraria ?? default. */
  zonaHoraria: string;
  /**
   * Capacidad simultánea del carril "sin asignar" (política configurable por
   * sucursal). 1 = una sola cita sin profesional por horario (comportamiento
   * histórico).
   */
  capacidadSinAsignar: number;
}

/**
 * Serializa las mutaciones de agenda por sucursal: toma un lock `FOR UPDATE`
 * sobre la fila de la sucursal (debe llamarse dentro de una transacción) y
 * devuelve el contexto con la zona horaria efectiva. `null` si la sucursal no
 * existe o no pertenece a la organización.
 */
export async function lockSucursalAgenda(
  db: AgendaDb,
  organizacionId: string,
  sucursalId: string,
): Promise<SucursalAgendaContext | null> {
  const [row] = await db
    .select({
      id: sucursales.id,
      organizacionId: sucursales.organizacionId,
      activo: sucursales.activo,
      zonaHoraria: sucursales.zonaHoraria,
      capacidadSinAsignar: sucursales.capacidadSinAsignar,
    })
    .from(sucursales)
    .where(and(eq(sucursales.id, sucursalId), eq(sucursales.organizacionId, organizacionId)))
    .limit(1)
    .for("update");

  if (!row) return null;

  const [org] = await db
    .select({ zonaHoraria: organizaciones.zonaHoraria })
    .from(organizaciones)
    .where(eq(organizaciones.id, organizacionId))
    .limit(1);

  return {
    id: row.id,
    organizacionId: row.organizacionId,
    activo: row.activo,
    zonaHoraria: resolveTimeZone(row.zonaHoraria, org?.zonaHoraria, undefined),
    capacidadSinAsignar: Math.max(1, row.capacidadSinAsignar ?? 1),
  };
}

export async function getCita(db: AgendaDb, organizacionId: string, citaId: string): Promise<CitaRow | null> {
  const [row] = await db
    .select()
    .from(citas)
    .where(and(eq(citas.id, citaId), eq(citas.organizacionId, organizacionId)))
    .limit(1);
  return row ?? null;
}

export async function clienteEnOrganizacion(db: AgendaDb, organizacionId: string, clienteId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.organizacionId, organizacionId)))
    .limit(1);
  return Boolean(row);
}

/** El profesional debe estar asignado a la sucursal vía rel_usuarios_sucursales. */
export async function profesionalAsignadoASucursal(
  db: AgendaDb,
  organizacionId: string,
  sucursalId: string,
  usuarioId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: relUsuariosSucursales.id })
    .from(relUsuariosSucursales)
    .where(
      and(
        eq(relUsuariosSucursales.organizacionId, organizacionId),
        eq(relUsuariosSucursales.sucursalId, sucursalId),
        eq(relUsuariosSucursales.usuarioId, usuarioId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export interface OcupacionAgenda {
  horarios: TurnoDia[];
  bloqueos: BloqueoLike[];
  citas: CitaLike[];
  /** Recursos activos de la sucursal (para validar asignaciones). */
  recursos: RecursoLike[];
}

/**
 * Carga horarios activos de la sucursal, bloqueos que se traslapan con
 * [desde, hasta) y citas vivas que podrían traslaparse. Como una cita dura a lo
 * máximo 1440 min, cualquier traslape empieza dentro de las 24h previas.
 *
 * UNA sola query con subselects `jsonb`: `getOcupacionAgenda` se llama DENTRO
 * de transacciones (`saveCita` → `validarDisponibilidadCita`) y ahí todas las
 * consultas comparten una única conexión — paralelizarlas con `Promise.all`
 * dispara "Calling client.query() when the client is already executing a
 * query" y falla en producción (Hyperdrive). Fusionar además ahorra 4 rondas.
 */
export async function getOcupacionAgenda(
  db: AgendaDb,
  params: { organizacionId: string; sucursalId: string; desde: Date; hasta: Date },
): Promise<OcupacionAgenda> {
  const { organizacionId, sucursalId, desde, hasta } = params;
  const desdeCitas = new Date(desde.getTime() - 24 * 60 * 60 * 1000);
  const estadosInactivos = sql.join(
    ESTADOS_CITA_INACTIVOS.map((estado) => sql`${estado}`),
    sql`, `,
  );

  const { rows } = await db.execute<{
    horarios: TurnoDia[];
    bloqueos: Array<{
      id: string;
      usuarioId: string | null;
      tipo: string;
      iniciaAtMs: number | string;
      terminaAtMs: number | string;
    }>;
    citas: Array<{
      id: string;
      usuarioId: string | null;
      fechaHoraMs: number | string;
      duracionMinutos: number;
      estado: string;
      activo: boolean;
    }>;
    recursos: RecursoLike[];
    asignaciones: Array<{ citaId: string; recursoId: string }>;
  }>(sql`
    select
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'diaSemana', h.dia_semana, 'iniciaMinutos', h.inicia_minutos,
          'terminaMinutos', h.termina_minutos, 'activo', h.activo))
          from horarios_sucursales h
         where h.organizacion_id = ${organizacionId}
           and h.sucursal_id = ${sucursalId}
           and h.activo
      ), '[]'::jsonb) as horarios,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'usuarioId', b.usuario_id, 'tipo', b.tipo,
          'iniciaAtMs', (extract(epoch from b.inicia_at) * 1000)::float8,
          'terminaAtMs', (extract(epoch from b.termina_at) * 1000)::float8))
          from bloqueos_agenda b
         where b.organizacion_id = ${organizacionId}
           and b.sucursal_id = ${sucursalId}
           and b.activo
           and b.inicia_at < ${hasta}
           and b.termina_at > ${desde}
      ), '[]'::jsonb) as bloqueos,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'usuarioId', c.usuario_id,
          'fechaHoraMs', (extract(epoch from c.fecha_hora) * 1000)::float8,
          'duracionMinutos', c.duracion_minutos, 'estado', c.estado, 'activo', c.activo))
          from citas c
         where c.organizacion_id = ${organizacionId}
           and c.sucursal_id = ${sucursalId}
           and c.activo
           and c.estado not in (${estadosInactivos})
           and c.fecha_hora < ${hasta}
           and c.fecha_hora > ${desdeCitas}
      ), '[]'::jsonb) as citas,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'capacidad', r.capacidad))
          from recursos r
         where r.organizacion_id = ${organizacionId}
           and r.sucursal_id = ${sucursalId}
           and r.activo
      ), '[]'::jsonb) as recursos,
      coalesce((
        select jsonb_agg(jsonb_build_object('citaId', cr.cita_id, 'recursoId', cr.recurso_id))
          from cita_recursos cr
         where cr.activo
           and cr.cita_id in (
             select c2.id from citas c2
              where c2.organizacion_id = ${organizacionId}
                and c2.sucursal_id = ${sucursalId}
                and c2.activo
                and c2.estado not in (${estadosInactivos})
                and c2.fecha_hora < ${hasta}
                and c2.fecha_hora > ${desdeCitas})
      ), '[]'::jsonb) as asignaciones
  `);

  const data = rows[0];
  const recursosPorCita = new Map<string, string[]>();
  for (const asignacion of data?.asignaciones ?? []) {
    const list = recursosPorCita.get(asignacion.citaId) ?? [];
    list.push(asignacion.recursoId);
    recursosPorCita.set(asignacion.citaId, list);
  }

  return {
    horarios: data?.horarios ?? [],
    bloqueos: (data?.bloqueos ?? []).map((b) => ({
      id: b.id,
      usuarioId: b.usuarioId,
      tipo: b.tipo,
      iniciaAtMs: Number(b.iniciaAtMs),
      terminaAtMs: Number(b.terminaAtMs),
      activo: true,
    })),
    citas: (data?.citas ?? []).map((c) => ({
      ...toCitaLike({
        id: c.id,
        usuarioId: c.usuarioId,
        fechaHora: new Date(Number(c.fechaHoraMs)),
        duracionMinutos: c.duracionMinutos,
        estado: c.estado,
        activo: c.activo,
      }),
      recursoIds: recursosPorCita.get(c.id) ?? [],
    })),
    recursos: data?.recursos ?? [],
  };
}

/**
 * Control optimista de concurrencia: cuando el cliente envía `versionEsperada`
 * debe coincidir con `version` actual de la cita. `undefined` omite la
 * validación (llamadas internas como el cobro POS).
 */
export function versionCoincide(cita: { version: number }, versionEsperada: number | undefined): boolean {
  return versionEsperada === undefined || versionEsperada === cita.version;
}

/** Mensaje estándar para edición sobre una versión obsoleta. */
export const CITA_STALE_MESSAGE =
  "La cita fue modificada por otro usuario. Recarga la agenda y vuelve a intentar.";

/**
 * Inserta un movimiento en `citas_historial`. Debe llamarse dentro de la misma
 * transacción que origina el cambio para que quede comprometido junto con él.
 */
export async function registrarHistorialCita(
  db: AgendaDb,
  params: {
    citaId: string;
    organizacionId: string;
    /** Quien ejecuta la acción (null = proceso interno, p.ej. cobro POS). */
    usuarioId: string | null;
    /** Ej. "creada", "editada", "movida", "reagendada", "estado", "servicio_agregado". */
    accion: string;
    detalle?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(citasHistorial).values({
    citaId: params.citaId,
    organizacionId: params.organizacionId,
    usuarioId: params.usuarioId,
    accion: params.accion,
    detalle: params.detalle ?? null,
  });
}

export function toCitaLike(row: {
  id: string;
  usuarioId: string | null;
  fechaHora: Date;
  duracionMinutos: number;
  estado: string;
  activo?: boolean;
}): CitaLike {
  const iniciaAtMs = row.fechaHora.getTime();
  return {
    id: row.id,
    usuarioId: row.usuarioId,
    iniciaAtMs,
    terminaAtMs: iniciaAtMs + row.duracionMinutos * 60_000,
    estado: row.estado,
    activo: row.activo ?? true,
  };
}

/** Recursos activos asignados actualmente a la cita. */
export async function recursosDeCita(db: AgendaDb, citaId: string): Promise<string[]> {
  const rows = await db
    .select({ recursoId: citaRecursos.recursoId })
    .from(citaRecursos)
    .where(and(eq(citaRecursos.citaId, citaId), eq(citaRecursos.activo, true)));
  return rows.map((r) => r.recursoId);
}

/** Convierte las violaciones de disponibilidad en un mensaje para el usuario. */
export function violacionesAError(disponibilidad: DisponibilidadResult): string {
  return disponibilidad.violaciones.map((v) => v.mensaje).join(" ") || "La cita no está disponible en ese horario.";
}

/**
 * Valida la disponibilidad de una cita candidata contra la agenda real de la
 * sucursal: horario de atención, bloqueos, traslapes, profesional y recursos.
 * Debe llamarse dentro de la transacción que ya tomó `lockSucursalAgenda`.
 */
export async function validarDisponibilidadCita(
  db: AgendaDb,
  params: {
    organizacionId: string;
    sucursalId: string;
    usuarioId: string | null;
    fechaHora: Date;
    duracionMinutos: number;
    zonaHoraria: string;
    ignoreCitaId?: string | null;
    capacidadSinAsignar?: number;
    /** Recursos que ocupará la cita (default: los que ya tiene asignados). */
    recursoIds?: readonly string[];
  },
): Promise<DisponibilidadResult> {
  const candidato = intervalFromDates(params.fechaHora, params.duracionMinutos);
  const partes = getZonedParts(params.fechaHora, params.zonaHoraria);
  const ocupacion = await getOcupacionAgenda(db, {
    organizacionId: params.organizacionId,
    sucursalId: params.sucursalId,
    desde: new Date(candidato.iniciaAtMs),
    hasta: new Date(candidato.terminaAtMs),
  });
  return validateCitaAvailability({
    candidato: { ...candidato, usuarioId: params.usuarioId },
    diaSemana: partes.diaSemana,
    iniciaMinutosLocal: partes.minutosDelDia,
    duracionMinutos: params.duracionMinutos,
    horarios: ocupacion.horarios,
    bloqueos: ocupacion.bloqueos,
    citas: ocupacion.citas,
    recursoIds: params.recursoIds,
    recursos: ocupacion.recursos,
    ignoreCitaId: params.ignoreCitaId,
    capacidadSinAsignar: params.capacidadSinAsignar,
  });
}

/**
 * Consulta de colisión directa de horario para un estilista dentro de una transacción SERIALIZABLE.
 * Bloquea contra double-booking concurrente disparando fallo 40001 si hay traslape con otra tx.
 */
export async function verificarColisionEstilista(
  db: AgendaDb,
  params: {
    sucursalId: string;
    usuarioId: string;
    inicio: Date;
    fin: Date;
    ignoreCitaId?: string | null;
  },
): Promise<boolean> {
  const condiciones = [
    eq(citas.sucursalId, params.sucursalId),
    eq(citas.usuarioId, params.usuarioId),
    eq(citas.activo, true),
    notInArray(citas.estado, ["cancelada", "no_asistio"]),
    lt(citas.fechaHora, params.fin),
    sql`${citas.fechaHora} + (${citas.duracionMinutos} * interval '1 minute') > ${params.inicio}`,
  ];
  if (params.ignoreCitaId) {
    condiciones.push(ne(citas.id, params.ignoreCitaId));
  }
  const colisiones = await db
    .select({ id: citas.id })
    .from(citas)
    .where(and(...condiciones))
    .limit(1);

  return colisiones.length > 0;
}
