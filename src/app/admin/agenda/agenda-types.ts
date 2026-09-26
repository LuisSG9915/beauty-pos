/**
 * Tipos y constantes compartidas de la agenda del panel. Solo datos de vista:
 * la lógica de dominio vive en `src/modules/agenda`.
 */

export type AgendaCita = {
  id: string;
  fechaHora: string;
  duracionMinutos: number;
  estado: string;
  notas: string | null;
  totalEstimado: string;
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteNotas: string | null;
  sucursalId: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  /** Concurrencia optimista: se envía en cada mutación. */
  version: number;
  ventaId: string | null;
  servicios: Array<{ id: string; nombre: string; categoriaId: string | null; precio: string }>;
  recursos: Array<{ id: string; nombre: string }>;
};

export type AgendaRecurso = {
  id: string;
  nombre: string;
  tipo: string;
  capacidad: number;
};

export type AgendaHorario = {
  diaSemana: number;
  iniciaMinutos: number;
  terminaMinutos: number;
};

export type AgendaBloqueo = {
  id: string;
  usuarioId: string | null;
  iniciaAt: string;
  terminaAt: string;
  tipo: string;
  motivo: string | null;
};

export type AgendaVista = "dia" | "semana" | "lista";
export type MoveMode = "mover" | "reagendar";

export const FALLBACK_START = 8 * 60;
export const FALLBACK_END = 21 * 60;
export const HOUR_PX = 76;
export const PX_PER_MIN = HOUR_PX / 60;
export const COLUMN_HEADER_PX = 46;

export const BLOQUEO_LABEL: Record<string, string> = {
  descanso: "Descanso",
  cierre: "Cerrado",
  personal: "Personal",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};
