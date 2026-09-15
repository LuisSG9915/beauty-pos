/**
 * Reglas puras del dominio de Agenda. Sin acceso a base de datos ni efectos:
 * toda entrada sale del caller, lo que las hace testeables de forma aislada.
 */

import type { CitaEstado, DisponibilidadResult, IntervalMs, ViolacionAgenda } from "./types";
import { ESTADOS_CITA_INACTIVOS } from "./types";

/** Turno de atención (horario) en minutos locales de un día de semana. */
export interface TurnoDia {
  diaSemana: number;
  iniciaMinutos: number;
  terminaMinutos: number;
  activo: boolean;
}

export interface BloqueoLike extends IntervalMs {
  id?: string;
  /** null = bloqueo general de la sucursal; con valor = solo ese profesional. */
  usuarioId: string | null;
  tipo?: string;
  activo: boolean;
}

export interface CitaLike extends IntervalMs {
  id: string;
  usuarioId: string | null;
  estado: string;
  activo: boolean;
  /** Recursos activos asignados a la cita (para validación de recursos). */
  recursoIds?: readonly string[];
}

/** Recurso físico de sucursal (cabina, silla, equipo). */
export interface RecursoLike {
  id: string;
  nombre: string;
  /** Citas simultáneas que puede atender (default 1). */
  capacidad: number;
}

/** Solape de intervalos semiabiertos [inicio, fin): tocarse en el borde NO es traslape. */
export function intervalsOverlap(a: IntervalMs, b: IntervalMs): boolean {
  return a.iniciaAtMs < b.terminaAtMs && b.iniciaAtMs < a.terminaAtMs;
}

/** Devuelve los intervalos de `existentes` que se traslapan con `candidato`. */
export function detectOverlap<T extends IntervalMs>(candidato: IntervalMs, existentes: readonly T[]): T[] {
  return existentes.filter((otro) => intervalsOverlap(candidato, otro));
}

/**
 * Valida que la cita quepa completa dentro de un turno activo del día.
 * `terminaMinutosLocal` puede exceder 1440 si la cita cruza medianoche; como
 * ningún turno llega más allá de 1440, eso resulta en `fuera_horario`.
 */
export function validateBusinessHours(params: {
  diaSemana: number;
  iniciaMinutosLocal: number;
  duracionMinutos: number;
  horarios: readonly TurnoDia[];
}): ViolacionAgenda[] {
  const { diaSemana, iniciaMinutosLocal, duracionMinutos, horarios } = params;
  if (!Number.isInteger(duracionMinutos) || duracionMinutos <= 0 || duracionMinutos > 1440) {
    return [{ codigo: "duracion_invalida", mensaje: "La duración de la cita es inválida." }];
  }
  const terminaMinutosLocal = iniciaMinutosLocal + duracionMinutos;
  const turnos = horarios.filter((h) => h.activo && h.diaSemana === diaSemana);
  if (turnos.length === 0) {
    return [{ codigo: "sin_horario", mensaje: "La sucursal no tiene horario de atención ese día." }];
  }
  const contenida = turnos.some((h) => iniciaMinutosLocal >= h.iniciaMinutos && terminaMinutosLocal <= h.terminaMinutos);
  if (!contenida) {
    return [{ codigo: "fuera_horario", mensaje: "La cita queda fuera del horario de atención de la sucursal." }];
  }
  return [];
}

/**
 * Bloqueos activos que se traslapan con el candidato. Un bloqueo con
 * `usuarioId` null aplica a toda la sucursal; con valor, solo a ese profesional.
 */
export function validateBlocks(params: {
  candidato: IntervalMs & { usuarioId: string | null };
  bloqueos: readonly BloqueoLike[];
}): ViolacionAgenda[] {
  const { candidato, bloqueos } = params;
  const violaciones: ViolacionAgenda[] = [];
  for (const bloqueo of bloqueos) {
    if (!bloqueo.activo) continue;
    const aplica = bloqueo.usuarioId === null || bloqueo.usuarioId === candidato.usuarioId;
    if (!aplica) continue;
    if (intervalsOverlap(candidato, bloqueo)) {
      violaciones.push({
        codigo: "bloqueo",
        mensaje: bloqueo.usuarioId === null
          ? "La sucursal tiene un bloqueo de agenda en ese horario."
          : "El profesional tiene un bloqueo de agenda en ese horario.",
        conflictoId: bloqueo.id,
      });
    }
  }
  return violaciones;
}

/**
 * Traslapes entre citas del mismo "carril". Para citas con profesional el
 * carril tiene capacidad 1 (cualquier traslape es violación). Las citas sin
 * asignar comparten un carril con `capacidadSinAsignar` lugares simultáneos
 * (política configurable por sucursal); se viola al exceder la capacidad.
 * Se ignoran citas inactivas, en estados terminales y la propia cita que se
 * edita (`ignoreCitaId`).
 */
export function validateCitaOverlaps(params: {
  candidato: IntervalMs & { usuarioId: string | null };
  citas: readonly CitaLike[];
  ignoreCitaId?: string | null;
  /** Capacidad del carril "sin asignar" (default 1). */
  capacidadSinAsignar?: number;
}): ViolacionAgenda[] {
  const { candidato, citas, ignoreCitaId } = params;
  const capacidad = Math.max(1, params.capacidadSinAsignar ?? 1);
  const violaciones: ViolacionAgenda[] = [];
  let traslapesSinAsignar = 0;
  for (const cita of citas) {
    if (!cita.activo) continue;
    if (ignoreCitaId && cita.id === ignoreCitaId) continue;
    if ((ESTADOS_CITA_INACTIVOS as readonly string[]).includes(cita.estado)) continue;
    if (cita.usuarioId !== candidato.usuarioId) continue;
    if (!intervalsOverlap(candidato, cita)) continue;
    if (cita.usuarioId !== null) {
      violaciones.push({
        codigo: "traslape",
        mensaje: "El profesional ya tiene una cita en ese horario.",
        conflictoId: cita.id,
      });
      continue;
    }
    traslapesSinAsignar += 1;
    if (traslapesSinAsignar >= capacidad) {
      violaciones.push({
        codigo: "traslape",
        mensaje:
          capacidad === 1
            ? "Ya hay otra cita sin asignar en ese horario."
            : `El horario sin asignar ya tiene ${capacidad} citas simultáneas.`,
        conflictoId: cita.id,
      });
    }
  }
  return violaciones;
}

/**
 * Recursos asignados a la cita candidata: cada recurso es un carril con
 * `capacidad` lugares simultáneos; se viola al excederlo contando citas vivas
 * que lo tienen asignado y se traslapan. Recursos desconocidos (no presentes
 * en `recursos`) se ignoran: el caller debe validarlos antes.
 */
export function validateRecursos(params: {
  recursoIds: readonly string[];
  recursos: readonly RecursoLike[];
  citas: readonly CitaLike[];
  candidato: IntervalMs;
  ignoreCitaId?: string | null;
}): ViolacionAgenda[] {
  const { recursoIds, recursos, citas, candidato, ignoreCitaId } = params;
  if (recursoIds.length === 0) return [];
  const capacidadPorId = new Map(recursos.map((r) => [r.id, r]));
  const violaciones: ViolacionAgenda[] = [];
  for (const recursoId of new Set(recursoIds)) {
    const recurso = capacidadPorId.get(recursoId);
    if (!recurso) continue;
    const capacidad = Math.max(1, recurso.capacidad);
    let enUso = 0;
    for (const cita of citas) {
      if (!cita.activo) continue;
      if (ignoreCitaId && cita.id === ignoreCitaId) continue;
      if ((ESTADOS_CITA_INACTIVOS as readonly string[]).includes(cita.estado)) continue;
      if (!cita.recursoIds?.includes(recursoId)) continue;
      if (!intervalsOverlap(candidato, cita)) continue;
      enUso += 1;
      if (enUso >= capacidad) {
        violaciones.push({
          codigo: "recurso",
          mensaje: `El recurso "${recurso.nombre}" ya está ocupado en ese horario.`,
          conflictoId: recursoId,
        });
        break;
      }
    }
  }
  return violaciones;
}

/**
 * Disponibilidad completa de una cita candidata: horario de sucursal, bloqueos,
 * traslapes con otras citas y recursos asignados.
 */
export function validateCitaAvailability(params: {
  candidato: IntervalMs & { usuarioId: string | null };
  /** Día de semana (0-6) del inicio de la cita, en la zona de la sucursal. */
  diaSemana: number;
  /** Minutos desde medianoche local del inicio de la cita. */
  iniciaMinutosLocal: number;
  duracionMinutos: number;
  horarios: readonly TurnoDia[];
  bloqueos: readonly BloqueoLike[];
  citas: readonly CitaLike[];
  /** Recursos elegidos para la cita candidata. */
  recursoIds?: readonly string[];
  /** Catálogo de recursos de la sucursal (id, nombre, capacidad). */
  recursos?: readonly RecursoLike[];
  ignoreCitaId?: string | null;
  capacidadSinAsignar?: number;
}): DisponibilidadResult {
  const violaciones: ViolacionAgenda[] = [
    ...validateBusinessHours({
      diaSemana: params.diaSemana,
      iniciaMinutosLocal: params.iniciaMinutosLocal,
      duracionMinutos: params.duracionMinutos,
      horarios: params.horarios,
    }),
    ...validateBlocks({ candidato: params.candidato, bloqueos: params.bloqueos }),
    ...validateCitaOverlaps({
      candidato: params.candidato,
      citas: params.citas,
      ignoreCitaId: params.ignoreCitaId,
      capacidadSinAsignar: params.capacidadSinAsignar,
    }),
    ...validateRecursos({
      recursoIds: params.recursoIds ?? [],
      recursos: params.recursos ?? [],
      citas: params.citas,
      candidato: params.candidato,
      ignoreCitaId: params.ignoreCitaId,
    }),
  ];
  return { ok: violaciones.length === 0, violaciones };
}

/** Mapa de transiciones permitidas entre estados de cita. */
export const CITA_TRANSICIONES: Record<CitaEstado, readonly CitaEstado[]> = {
  pendiente: ["confirmada", "en_proceso", "cancelada", "no_asistio"],
  confirmada: ["en_proceso", "completada", "cancelada", "no_asistio", "pendiente"],
  en_proceso: ["completada", "cancelada"],
  completada: [],
  cancelada: ["pendiente"],
  no_asistio: ["pendiente"],
};

export function canTransitionEstado(from: string, to: string): boolean {
  if (from === to) return false;
  const destinos = (CITA_TRANSICIONES as Record<string, readonly string[]>)[from];
  return Array.isArray(destinos) && destinos.includes(to);
}

/** Una cita solo puede editarse (datos, horario, servicios) en estados vivos. */
export function isCitaEditable(estado: string): boolean {
  return !(ESTADOS_CITA_INACTIVOS as readonly string[]).includes(estado);
}

/**
 * Estados desde los que `rescheduleCita` puede mover y reactivar una cita.
 * `completada` queda fuera: está ligada a una venta cobrada en POS.
 */
export const ESTADOS_REAGENDABLES: readonly string[] = ["pendiente", "confirmada", "cancelada", "no_asistio"];

export function canRescheduleEstado(estado: string): boolean {
  return ESTADOS_REAGENDABLES.includes(estado);
}
