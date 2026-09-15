/**
 * Acceso a datos del dominio de Agenda. Toda la lectura/escritura con Drizzle
 * vive aquí; las reglas puras están en `rules.ts` y no conocen la base.
 */

import { and, eq, gt, inArray, lt, notInArray } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";

import { clientes, organizaciones, relUsuariosSucursales, sucursales } from "@/db/schema/core";
import { bloqueosAgenda, citaRecursos, citas, citasHistorial, horariosSucursales, recursos } from "@/db/schema/operations";
import { ESTADOS_CITA_INACTIVOS } from "./types";
import type { BloqueoLike, CitaLike, RecursoLike, TurnoDia } from "./rules";
import { resolveTimeZone } from "./timezone";

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
 */
export async function getOcupacionAgenda(
  db: AgendaDb,
  params: { organizacionId: string; sucursalId: string; desde: Date; hasta: Date },
): Promise<OcupacionAgenda> {
  const { organizacionId, sucursalId, desde, hasta } = params;
  const desdeCitas = new Date(desde.getTime() - 24 * 60 * 60 * 1000);

  const [horarioRows, bloqueoRows, citaRows, recursoRows] = await Promise.all([
    db
      .select({
        diaSemana: horariosSucursales.diaSemana,
        iniciaMinutos: horariosSucursales.iniciaMinutos,
        terminaMinutos: horariosSucursales.terminaMinutos,
        activo: horariosSucursales.activo,
      })
      .from(horariosSucursales)
      .where(
        and(
          eq(horariosSucursales.organizacionId, organizacionId),
          eq(horariosSucursales.sucursalId, sucursalId),
          eq(horariosSucursales.activo, true),
        ),
      ),
    db
      .select({
        id: bloqueosAgenda.id,
        usuarioId: bloqueosAgenda.usuarioId,
        iniciaAt: bloqueosAgenda.iniciaAt,
        terminaAt: bloqueosAgenda.terminaAt,
        tipo: bloqueosAgenda.tipo,
      })
      .from(bloqueosAgenda)
      .where(
        and(
          eq(bloqueosAgenda.organizacionId, organizacionId),
          eq(bloqueosAgenda.sucursalId, sucursalId),
          eq(bloqueosAgenda.activo, true),
          lt(bloqueosAgenda.iniciaAt, hasta),
          gt(bloqueosAgenda.terminaAt, desde),
        ),
      ),
    db
      .select({
        id: citas.id,
        usuarioId: citas.usuarioId,
        fechaHora: citas.fechaHora,
        duracionMinutos: citas.duracionMinutos,
        estado: citas.estado,
        activo: citas.activo,
      })
      .from(citas)
      .where(
        and(
          eq(citas.organizacionId, organizacionId),
          eq(citas.sucursalId, sucursalId),
          eq(citas.activo, true),
          notInArray(citas.estado, [...ESTADOS_CITA_INACTIVOS]),
          lt(citas.fechaHora, hasta),
          gt(citas.fechaHora, desdeCitas),
        ),
      ),
    db
      .select({
        id: recursos.id,
        nombre: recursos.nombre,
        capacidad: recursos.capacidad,
      })
      .from(recursos)
      .where(
        and(
          eq(recursos.organizacionId, organizacionId),
          eq(recursos.sucursalId, sucursalId),
          eq(recursos.activo, true),
        ),
      ),
  ]);

  // Recursos asignados por cita (solo las citas vivas de la ventana).
  const citaIds = citaRows.map((c) => c.id);
  const asignaciones = citaIds.length > 0
    ? await db
        .select({ citaId: citaRecursos.citaId, recursoId: citaRecursos.recursoId })
        .from(citaRecursos)
        .where(and(inArray(citaRecursos.citaId, citaIds), eq(citaRecursos.activo, true)))
    : [];
  const recursosPorCita = new Map<string, string[]>();
  for (const asignacion of asignaciones) {
    const list = recursosPorCita.get(asignacion.citaId) ?? [];
    list.push(asignacion.recursoId);
    recursosPorCita.set(asignacion.citaId, list);
  }

  return {
    horarios: horarioRows,
    bloqueos: bloqueoRows.map((b) => ({
      id: b.id,
      usuarioId: b.usuarioId,
      tipo: b.tipo,
      iniciaAtMs: b.iniciaAt.getTime(),
      terminaAtMs: b.terminaAt.getTime(),
      activo: true,
    })),
    citas: citaRows.map((c) => ({ ...toCitaLike(c), recursoIds: recursosPorCita.get(c.id) ?? [] })),
    recursos: recursoRows,
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
