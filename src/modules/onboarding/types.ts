/**
 * Tipos de la guía de primera experiencia.
 *
 * El progreso real (qué pasos ya están hechos) se deriva de los datos del
 * negocio — servicios, horarios, citas y ventas — no de botones de
 * «Siguiente». `progreso_guias` solo recuerda si la persona omitió o
 * terminó la guía para no insistir en cada inicio de sesión.
 */

export const GUIA_CONFIGURACION = "configuracion_inicial" as const;
export const GUIA_VERSION = 1;

export type EstadoGuia = "en_progreso" | "completada" | "omitida";

/** Señales reales del negocio usadas para evaluar el checklist. */
export type EstadoNegocio = {
  serviciosActivos: number;
  horariosActivos: number;
  miembrosActivos: number;
  citasRegistradas: number;
  ventasCobradas: number;
  /** Nombre de la sucursal del contexto; detecta el genérico "Sucursal principal". */
  sucursalNombre: string | null;
};

export type PasoClave =
  | "nombre_sucursal"
  | "servicios"
  | "horario"
  | "equipo"
  | "primera_cita"
  | "primer_cobro"
  | "resultado";

export type PasoGuia = {
  clave: PasoClave;
  titulo: string;
  descripcion: string;
  /** Ruta del panel (sin /admin ni parámetros de contexto). */
  href: `/${string}`;
  /** Permiso(s) necesarios para realizar el paso; cualquiera basta. */
  permisos: readonly string[];
  /** Los pasos opcionales no bloquean la conclusión de la guía. */
  opcional?: boolean;
  /** Evaluación derivada del estado real del negocio. */
  completado: (estado: EstadoNegocio) => boolean;
};

export type PasoEvaluado = PasoGuia & { hecho: boolean };

export type ResumenGuia = {
  pasos: PasoEvaluado[];
  total: number;
  completados: number;
  /** Índice del primer paso requerido pendiente; -1 si no hay. */
  siguiente: number;
  /** true cuando todos los pasos requeridos visibles están hechos. */
  terminada: boolean;
};

/** Hitos de producto persistidos en `eventos_producto`. */
export const EVENTOS_PRODUCTO = {
  guiaIniciada: "guia.iniciada",
  guiaOmitida: "guia.omitida",
  guiaReanudada: "guia.reanudada",
  guiaReiniciada: "guia.reiniciada",
} as const;
export type EventoProducto = (typeof EVENTOS_PRODUCTO)[keyof typeof EVENTOS_PRODUCTO];
