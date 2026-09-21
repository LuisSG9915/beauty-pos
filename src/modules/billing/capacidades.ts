/**
 * Catálogo canónico de capacidades comerciales y de los planes de lanzamiento.
 * Las claves de capacidad se usan en `planes.capacidades` (jsonb) y en los
 * checks de entitlement del servidor — el catálogo válido vive en código
 * porque las capacidades las define el producto, no cada organización.
 */

export const CAPACIDADES = {
  reservas_online: {
    nombre: "Reservas en línea",
    descripcion: "Portal público donde tus clientes agendan solos, conectado a la agenda real.",
  },
  reservas_auto_confirmar: {
    nombre: "Confirmación automática de reservas",
    descripcion: "Las reservas web entran confirmadas; sin ella quedan pendientes de tu aprobación.",
  },
  recordatorios_email: {
    nombre: "Recordatorios por correo",
    descripcion: "Avisos automáticos antes de cada cita para reducir faltas.",
  },
  gastos: {
    nombre: "Gastos del negocio",
    descripcion: "Salidas por categoría integradas al esperado del corte de caja.",
  },
  comisiones: {
    nombre: "Comisiones",
    descripcion: "Cálculo por servicio y liquidación auditable del equipo.",
  },
  reportes_avanzados: {
    nombre: "Reportes avanzados",
    descripcion: "Gráficas, tendencias y lectura clara de cuánto gana el negocio.",
  },
  exportaciones: {
    nombre: "Exportaciones",
    descripcion: "Descarga de datos operativos y financieros.",
  },
  paquetes: {
    nombre: "Paquetes de sesiones",
    descripcion: "Sesiones prepagadas por servicio con saldo por cliente.",
  },
  membresias: {
    nombre: "Membresías de clientes",
    descripcion: "Descuento por vigencia para clientes frecuentes.",
  },
  promociones: {
    nombre: "Promociones",
    descripcion: "Descuentos y ofertas configurables del catálogo.",
  },
  auditoria: {
    nombre: "Auditoría operativa",
    descripcion: "Bitácora completa de quién hizo qué y cuándo.",
  },
  multisucursal: {
    nombre: "Multisucursal",
    descripcion: "Varias sucursales con supervisión y reportes consolidados.",
  },
} as const;

export type CapacidadClave = keyof typeof CAPACIDADES;

/** Operación completa de un salón pequeño: no se venden castrados lo esencial. */
const CAPACIDADES_ESENCIAL: readonly CapacidadClave[] = [
  "reservas_online",
  "recordatorios_email",
  "gastos",
  "comisiones",
];

/** Automatización, analítica y retención para negocios que quieren crecer. */
const CAPACIDADES_CRECIMIENTO: readonly CapacidadClave[] = [
  ...CAPACIDADES_ESENCIAL,
  "reservas_auto_confirmar",
  "reportes_avanzados",
  "exportaciones",
  "paquetes",
  "membresias",
  "promociones",
  "auditoria",
];

export type PlanCatalogo = {
  clave: string;
  nombre: string;
  descripcion: string;
  /** MXN al mes con la cobertura incluida, IVA incluido (precio vigente de contratación). */
  precioMensual: string;
  /** MXN al año con la cobertura incluida (= 10 mensualidades); null = solo mensual. */
  precioAnual: string | null;
  /** Precio de lista público, mostrado tachado durante la campaña de lanzamiento. */
  precioListaMensual: string;
  precioListaAnual: string | null;
  /** Precio de lista por sucursal adicional (null = igual que `precioSucursalExtra`). */
  precioListaSucursalExtra: string | null;
  /** Sucursales que cubre el precio base (sin costo adicional). */
  sucursalesIncluidas: number;
  /** MXN/mes por sucursal adicional a las incluidas; null = no permite extras. */
  precioSucursalExtra: string | null;
  trialDias: number;
  /** null = sin límite. */
  maxSucursales: number | null;
  maxUsuarios: number | null;
  capacidades: readonly CapacidadClave[];
  recomendado: boolean;
  orden: number;
};

/**
 * Catálogo comercial vigente (MXN, IVA incluido). Modelo: el precio base
 * cubre `sucursalesIncluidas` sucursales y cada adicional cuesta
 * `precioSucursalExtra`/mes; el anual equivale a 10 mensualidades.
 * Es la fuente del seed idempotente y del fallback del registro: la tabla
 * `planes` se sincroniza con estos valores. Los contratos ya activos guardan
 * su propio snapshot en `suscripciones`/`pagos_suscripcion`, así que editar
 * este catálogo solo afecta contrataciones nuevas.
 *
 * Durante el lanzamiento `precioMensual`/`precioAnual` son la tarifa fundador
 * de los primeros 100 negocios; `precioLista*` conserva la referencia de
 * lista para mostrarla tachada. Al cerrar la campaña se restaura el precio
 * de contratación a los valores `precioLista*` y se vuelve a sembrar.
 */
export const PLANES_CATALOGO: readonly PlanCatalogo[] = [
  {
    clave: "esencial",
    nombre: "Esencial",
    descripcion: "Agenda, reservas, cobro, caja, inventario, gastos y comisiones para una estética pequeña.",
    precioMensual: "149",
    precioAnual: "1490",
    precioListaMensual: "199",
    precioListaAnual: "1990",
    precioListaSucursalExtra: null,
    sucursalesIncluidas: 1,
    precioSucursalExtra: null,
    trialDias: 0,
    maxSucursales: 1,
    maxUsuarios: 3,
    capacidades: CAPACIDADES_ESENCIAL,
    recomendado: false,
    orden: 1,
  },
  {
    clave: "crecimiento",
    nombre: "Crecimiento",
    descripcion:
      "Automatiza reservas, reportes y retención: paquetes, membresías, promociones y exportaciones.",
    precioMensual: "299",
    precioAnual: "2990",
    precioListaMensual: "399",
    precioListaAnual: "3990",
    precioListaSucursalExtra: null,
    sucursalesIncluidas: 2,
    precioSucursalExtra: null,
    trialDias: 14,
    maxSucursales: 2,
    maxUsuarios: 8,
    capacidades: CAPACIDADES_CRECIMIENTO,
    recomendado: true,
    orden: 2,
  },
  {
    clave: "profesional",
    nombre: "Profesional",
    descripcion: "Desde la tercera sucursal: supervisión centralizada y reportes consolidados para equipos grandes.",
    precioMensual: "699",
    precioAnual: "6990",
    precioListaMensual: "899",
    precioListaAnual: "8990",
    precioListaSucursalExtra: "249",
    sucursalesIncluidas: 3,
    precioSucursalExtra: "199",
    trialDias: 0,
    maxSucursales: null,
    maxUsuarios: 20,
    capacidades: [...CAPACIDADES_CRECIMIENTO, "multisucursal"],
    recomendado: false,
    orden: 3,
  },
];

export function planCatalogoPorClave(clave: string): PlanCatalogo | undefined {
  return PLANES_CATALOGO.find((p) => p.clave === clave);
}
