/**
 * Contratos serializables del dominio de Agenda.
 * Todas las formas aquí definidas cruzan la frontera cliente/servidor sin
 * transformaciones: nada de clases, `Date` ni valores no-JSON.
 */

export const CITA_ESTADOS = [
  "pendiente",
  "confirmada",
  "en_proceso",
  "completada",
  "cancelada",
  "no_asistio",
] as const;

export type CitaEstado = (typeof CITA_ESTADOS)[number];

export function isCitaEstado(value: unknown): value is CitaEstado {
  return typeof value === "string" && (CITA_ESTADOS as readonly string[]).includes(value);
}

/** Estados que ya no ocupan tiempo en la agenda ni bloquean traslapes. */
export const ESTADOS_CITA_INACTIVOS: readonly CitaEstado[] = ["completada", "cancelada", "no_asistio"];

export const BLOQUEO_TIPOS = ["descanso", "cierre", "personal", "mantenimiento", "otro"] as const;

export type BloqueoTipo = (typeof BLOQUEO_TIPOS)[number];

/** Intervalo absoluto en milisegundos epoch (UTC). */
export interface IntervalMs {
  iniciaAtMs: number;
  terminaAtMs: number;
}

export function intervalFromDates(iniciaAt: Date, duracionMinutos: number): IntervalMs {
  return { iniciaAtMs: iniciaAt.getTime(), terminaAtMs: iniciaAt.getTime() + duracionMinutos * 60_000 };
}

/** Cita tal como viaja al cliente de la agenda. */
export interface AgendaCitaDTO {
  id: string;
  organizacionId: string;
  sucursalId: string;
  clienteId: string | null;
  usuarioId: string | null;
  /** ISO 8601 UTC. */
  fechaHora: string;
  duracionMinutos: number;
  estado: CitaEstado;
  notas: string | null;
  totalEstimado: string;
  activo: boolean;
}

/** Turno de atención de una sucursal en un día de semana (0=domingo … 6=sábado). */
export interface HorarioSucursalDTO {
  id: string;
  organizacionId: string;
  sucursalId: string;
  diaSemana: number;
  /** Minutos desde medianoche local, 0-1439. */
  iniciaMinutos: number;
  /** Minutos desde medianoche local, 1-1440 (exclusivo). */
  terminaMinutos: number;
  activo: boolean;
}

export interface BloqueoAgendaDTO {
  id: string;
  organizacionId: string;
  sucursalId: string;
  /** null = bloqueo general de la sucursal. */
  usuarioId: string | null;
  /** ISO 8601 UTC. */
  iniciaAt: string;
  terminaAt: string;
  tipo: BloqueoTipo;
  motivo: string | null;
  activo: boolean;
}

export type ViolacionCodigo =
  | "fuera_horario"
  | "sin_horario"
  | "bloqueo"
  | "traslape"
  | "recurso"
  | "duracion_invalida";

export interface ViolacionAgenda {
  codigo: ViolacionCodigo;
  mensaje: string;
  /** Id del bloqueo o de la cita que provoca el conflicto, cuando aplica. */
  conflictoId?: string;
}

export interface DisponibilidadResult {
  ok: boolean;
  violaciones: ViolacionAgenda[];
}
