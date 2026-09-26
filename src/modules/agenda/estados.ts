/**
 * Estados de PRESENTACIÓN de una cita en la agenda.
 *
 * La base de datos conserva `pendiente | confirmada | en_proceso |
 * completada | cancelada | no_asistio`; para operar el día importa además si
 * la cita completada ya tiene venta cobrada. De ahí salen los estados
 * visuales "por_cobrar" y "cobrada".
 *
 * Las clases referencian los tokens `--cita-*` definidos en globals.css
 * (claro y oscuro); el color dominante de la tarjeta es el estado y la
 * franja lateral queda para el tipo de servicio (ver category-color.ts).
 */

export type EstadoVista =
  | "agendada"
  | "confirmada"
  | "en_atencion"
  | "por_cobrar"
  | "cobrada"
  | "cancelada"
  | "no_asistio";

export function estadoVistaDeCita(cita: { estado: string; ventaId: string | null }): EstadoVista {
  switch (cita.estado) {
    case "confirmada":
      return "confirmada";
    case "en_proceso":
      return "en_atencion";
    case "completada":
      return cita.ventaId ? "cobrada" : "por_cobrar";
    case "cancelada":
      return "cancelada";
    case "no_asistio":
      return "no_asistio";
    default:
      return "agendada";
  }
}

/** Etiquetas en lenguaje del salón (sin jerga técnica ni estados internos). */
export const ESTADO_VISTA_LABEL: Record<EstadoVista, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  en_atencion: "En atención",
  por_cobrar: "Por cobrar",
  cobrada: "Cobrada",
  cancelada: "Cancelada",
  no_asistio: "No vino",
};

/** Fondo + borde + texto de la tarjeta de cita (pares con contraste AA). */
export const ESTADO_VISTA_CARD: Record<EstadoVista, string> = {
  agendada: "border-(--cita-agendada-border) bg-(--cita-agendada-bg) text-(--cita-agendada-fg)",
  confirmada: "border-(--cita-confirmada-border) bg-(--cita-confirmada-bg) text-(--cita-confirmada-fg)",
  en_atencion: "border-(--cita-en-atencion-border) bg-(--cita-en-atencion-bg) text-(--cita-en-atencion-fg)",
  por_cobrar: "border-(--cita-por-cobrar-border) bg-(--cita-por-cobrar-bg) text-(--cita-por-cobrar-fg)",
  cobrada: "border-(--cita-cobrada-border) bg-(--cita-cobrada-bg) text-(--cita-cobrada-fg)",
  cancelada: "border-(--cita-cancelada-border) bg-(--cita-cancelada-bg) text-(--cita-cancelada-fg)",
  no_asistio: "border-(--cita-no-asistio-border) bg-(--cita-no-asistio-bg) text-(--cita-no-asistio-fg)",
};

/** Texto en color de acento del estado (iconos y etiqueta dentro de la tarjeta). */
export const ESTADO_VISTA_ACCENT: Record<EstadoVista, string> = {
  agendada: "text-(--cita-agendada)",
  confirmada: "text-(--cita-confirmada)",
  en_atencion: "text-(--cita-en-atencion)",
  por_cobrar: "text-(--cita-por-cobrar)",
  cobrada: "text-(--cita-cobrada)",
  cancelada: "text-(--cita-cancelada)",
  no_asistio: "text-(--cita-no-asistio)",
};

/** Punto de color sólido (leyenda de la agenda). */
export const ESTADO_VISTA_DOT: Record<EstadoVista, string> = {
  agendada: "bg-(--cita-agendada)",
  confirmada: "bg-(--cita-confirmada)",
  en_atencion: "bg-(--cita-en-atencion)",
  por_cobrar: "bg-(--cita-por-cobrar)",
  cobrada: "bg-(--cita-cobrada)",
  cancelada: "bg-(--cita-cancelada)",
  no_asistio: "bg-(--cita-no-asistio)",
};

/** Estados atenuados en la rejilla: lo pasado o cancelado resta protagonismo. */
export const ESTADOS_VISTA_ATENUADOS = new Set<EstadoVista>(["cancelada", "no_asistio"]);

/** Orden fijo para la leyenda de colores. */
export const ESTADOS_VISTA_ORDEN: readonly EstadoVista[] = [
  "agendada",
  "confirmada",
  "en_atencion",
  "por_cobrar",
  "cobrada",
  "cancelada",
  "no_asistio",
];

/**
 * Verbos de las transiciones de estado tal como las dice el equipo del salón.
 * La clave es el estado de DESTINO en la base de datos.
 */
export const TRANSICION_LABEL: Record<string, string> = {
  pendiente: "Volver a agendar",
  confirmada: "Confirmar",
  en_proceso: "Ya llegó",
  completada: "Terminar",
  cancelada: "Cancelar cita",
  no_asistio: "No vino",
};

/**
 * Etiqueta del estado CRUDO de BD (historial, listas administrativas).
 * En UI operativa preferir `estadoVistaDeCita` + `ESTADO_VISTA_LABEL`, que
 * distingue "por cobrar" de "cobrada" según la venta ligada.
 */
export const ESTADO_BD_LABEL: Record<string, string> = {
  pendiente: "Agendada",
  confirmada: "Confirmada",
  en_proceso: "En atención",
  completada: "Terminada",
  cancelada: "Cancelada",
  no_asistio: "No vino",
};
