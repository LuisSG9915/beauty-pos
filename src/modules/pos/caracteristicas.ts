/**
 * Características activables del punto de venta por organización.
 *
 * Cada característica controla si un módulo del POS se muestra u oculta
 * para la dueña. El valor por defecto es `true` (activado) y la selección
 * se persiste en la tabla `configuracion_pos`.
 */

export type ClaveCaracteristicaPos = string;

export interface CaracteristicaPos {
  /** Clave usada en `configuracion_pos.clave`. */
  clave: ClaveCaracteristicaPos;
  /** Etiqueta visible para la dueña (sin jerga técnica). */
  etiqueta: string;
  /** Descripción corta de qué controla la característica. */
  descripcion: string;
  /** Ruta del panel donde se configura o usa la característica. */
  ruta: `/${string}`;
  /** Permiso necesario para ver/editar la característica. */
  permiso: string;
  /** Valor por defecto para organizaciones nuevas. */
  activaPorDefecto: boolean;
}

/** Catálogo de características del POS, ordenado como se muestra al iniciar. */
export const CARACTERISTICAS_POS: readonly CaracteristicaPos[] = [
  {
    clave: "agenda-citas",
    etiqueta: "Agenda y citas",
    descripcion: "Tus clientes eligen día y hora. Tú ves tu agenda.",
    ruta: "/agenda",
    permiso: "agenda.ver",
    activaPorDefecto: true,
  },
  {
    clave: "cobro-caja",
    etiqueta: "Cobro y caja",
    descripcion: "La pantalla para cobrar en efectivo, tarjeta o transferencia.",
    ruta: "/pos",
    permiso: "ventas.cobrar",
    activaPorDefecto: true,
  },
  {
    clave: "ventas-tienda",
    etiqueta: "Ventas y tienda",
    descripcion: "Productos y servicios que se venden sin cita agendada.",
    ruta: "/productos",
    permiso: "productos.ver",
    activaPorDefecto: true,
  },
  {
    clave: "clientes-marketing",
    etiqueta: "Clientes y marketing",
    descripcion: "Quién viene, cada cuándo y cuánto gasta. Sellos y cupones.",
    ruta: "/clientes",
    permiso: "clientes.ver",
    activaPorDefecto: true,
  },
  {
    clave: "pagina-presencia",
    etiqueta: "Página y presencia",
    descripcion: "Aparece en Mi NorHud para que clientes nuevos te encuentren.",
    ruta: "/pagina",
    permiso: "pagina.editar",
    activaPorDefecto: true,
  },
  {
    clave: "caja",
    etiqueta: "Caja",
    descripcion: "Fondo y corte del efectivo. También punto de venta.",
    ruta: "/caja",
    permiso: "caja.ver",
    activaPorDefecto: true,
  },
  {
    clave: "impresion",
    etiqueta: "Impresión",
    descripcion: "Imprime tickets y comandas.",
    ruta: "/impresion",
    permiso: "impresion.usar",
    activaPorDefecto: true,
  },
  {
    clave: "gastos",
    etiqueta: "Gastos",
    descripcion: "Anota lo que gastas y ve lo que te queda.",
    ruta: "/gastos",
    permiso: "gastos.ver",
    activaPorDefecto: true,
  },
] as const;

/** Claves de características disponibles. */
export const CLAVES_CARACTERISTICAS_POS: readonly ClaveCaracteristicaPos[] =
  CARACTERISTICAS_POS.map((c) => c.clave);

/** Todas las características activadas por defecto. */
export const CARACTERISTICAS_POR_DEFECTO: Record<
  ClaveCaracteristicaPos,
  boolean
> = Object.fromEntries(
  CARACTERISTICAS_POS.map((c) => [c.clave, c.activaPorDefecto]),
) as Record<ClaveCaracteristicaPos, boolean>;

export function obtenerCaracteristica(
  clave: ClaveCaracteristicaPos,
): CaracteristicaPos | undefined {
  return CARACTERISTICAS_POS.find((c) => c.clave === clave);
}
