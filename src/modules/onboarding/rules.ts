import type {
  EstadoNegocio,
  PasoEvaluado,
  PasoGuia,
  ResumenGuia,
} from "./types";

/**
 * Pasos de la guía «configuración inicial». El orden es el recorrido
 * recomendado; cada paso declara el permiso necesario para realizarlo, de
 * modo que una recepcionista o una especialista solo ven lo que pueden
 * hacer. La completitud se deriva del estado real del negocio.
 */
export const PASOS_GUIA: readonly PasoGuia[] = [
  {
    clave: "nombre_sucursal",
    titulo: "Ponle nombre a tu sucursal",
    descripcion: "Opcional: el nombre con que la conoce tu equipo, en vez de \"Sucursal principal\".",
    href: "/sucursales",
    permisos: ["sucursales.editar"],
    opcional: true,
    completado: (estado) =>
      estado.sucursalNombre != null && estado.sucursalNombre !== "Sucursal principal",
    detalleDetectado: (estado) =>
      estado.sucursalNombre != null && estado.sucursalNombre !== "Sucursal principal"
        ? `Sucursal: "${estado.sucursalNombre}"`
        : null,
  },
  {
    clave: "servicios",
    titulo: "Crea tu primer servicio",
    descripcion: "Nombre, duración y precio: es lo que aparecerá al agendar y cobrar.",
    href: "/servicios",
    permisos: ["catalogos.editar"],
    completado: (estado) => estado.serviciosActivos > 0,
    detalleDetectado: (estado) =>
      estado.serviciosActivos > 0
        ? `${estado.serviciosActivos} servicio${estado.serviciosActivos > 1 ? "s" : ""} activo${estado.serviciosActivos > 1 ? "s" : ""}`
        : null,
  },
  {
    clave: "horario",
    titulo: "Define el horario de atención",
    descripcion: "Los días y horas en que tu sucursal recibe citas.",
    href: "/agenda",
    permisos: ["agenda.editar"],
    completado: (estado) => estado.horariosActivos > 0,
    detalleDetectado: (estado) =>
      estado.horariosActivos > 0 ? "Horarios de atención configurados" : null,
  },
  {
    clave: "equipo",
    titulo: "Invita a tu equipo",
    descripcion: "Opcional: agrega recepción, caja o especialistas con su rol.",
    href: "/usuarios",
    permisos: ["usuarios.invitar"],
    opcional: true,
    completado: (estado) => estado.miembrosActivos > 1,
    detalleDetectado: (estado) =>
      estado.miembrosActivos > 1
        ? `${estado.miembrosActivos} miembros en tu equipo`
        : null,
  },
  {
    clave: "primera_cita",
    titulo: "Agenda tu primera cita real",
    descripcion: "Elige cliente, servicio y horario. Ya son datos de tu negocio.",
    href: "/agenda",
    permisos: ["agenda.editar"],
    completado: (estado) => estado.citasRegistradas > 0,
    detalleDetectado: (estado) =>
      estado.citasRegistradas > 0
        ? `${estado.citasRegistradas} cita${estado.citasRegistradas > 1 ? "s" : ""} agendada${estado.citasRegistradas > 1 ? "s" : ""}`
        : null,
  },
  {
    clave: "primer_cobro",
    titulo: "Registra tu primer cobro",
    descripcion: "Cobra una cita o una venta directa y revisa el ticket.",
    href: "/pos",
    permisos: ["ventas.cobrar"],
    completado: (estado) => estado.ventasCobradas > 0,
    detalleDetectado: (estado) =>
      estado.ventasCobradas > 0
        ? `${estado.ventasCobradas} venta${estado.ventasCobradas > 1 ? "s" : ""} cobrada${estado.ventasCobradas > 1 ? "s" : ""}`
        : null,
  },
  {
    clave: "resultado",
    titulo: "Revisa tu primer reporte",
    descripcion: "Comprueba que la venta aparece y aprende dónde corregirla.",
    href: "/reportes",
    permisos: ["reportes.operativos", "reportes.financieros"],
    completado: (estado) => estado.ventasCobradas > 0,
    detalleDetectado: (estado) =>
      estado.ventasCobradas > 0 ? "Reportes listos con datos reales" : null,
  },
];

/**
 * Pasos visibles para un usuario. `permissions === null` representa al
 * administrador de plataforma (sin filtro). Un conjunto vacío devuelve
 * una lista vacía: el llamador decide no mostrar la guía en ese caso.
 */
export function pasosParaPermisos(
  permissions: ReadonlySet<string> | null,
): PasoGuia[] {
  if (permissions === null) return [...PASOS_GUIA];
  return PASOS_GUIA.filter((paso) =>
    paso.permisos.some((permiso) => permissions.has(permiso)),
  );
}

/** Evalúa cada paso contra el estado real del negocio. */
export function evaluarPasos(
  pasos: readonly PasoGuia[],
  estado: EstadoNegocio,
): PasoEvaluado[] {
  return pasos.map((paso) => ({
    ...paso,
    hecho: paso.completado(estado),
    detalleDetectadoTexto: paso.detalleDetectado ? paso.detalleDetectado(estado) : null,
  }));
}

/**
 * Resumen del avance. La guía está «terminada» cuando todos los pasos
 * requeridos visibles están hechos; los opcionales no bloquean.
 */
export function resumenGuia(pasos: readonly PasoEvaluado[]): ResumenGuia {
  const completados = pasos.filter((paso) => paso.hecho).length;
  const siguiente = pasos.findIndex((paso) => !paso.hecho && !paso.opcional);
  return {
    pasos: [...pasos],
    total: pasos.length,
    completados,
    siguiente,
    terminada: pasos.length > 0 && pasos.every((paso) => paso.hecho || paso.opcional),
  };
}

export type PackArranqueId = "estetica" | "barberia" | "unas" | "pestanas";

export interface ServicioPreset {
  nombre: string;
  duracionMinutos: number;
  precioMxn: number;
  precioCentavos: number;
}

export interface PackArranquePreset {
  id: PackArranqueId;
  etiqueta: string;
  categoriaNombre: string;
  servicios: readonly ServicioPreset[];
}

export const PACKS_ARRANQUE_MEXICO: readonly PackArranquePreset[] = [
  {
    id: "estetica",
    etiqueta: "Estética / Salón",
    categoriaNombre: "Servicios de Salón",
    servicios: [
      { nombre: "Corte Dama", duracionMinutos: 45, precioMxn: 250, precioCentavos: 25000 },
      { nombre: "Corte Caballero", duracionMinutos: 30, precioMxn: 180, precioCentavos: 18000 },
      { nombre: "Tinte Completo", duracionMinutos: 120, precioMxn: 850, precioCentavos: 85000 },
      { nombre: "Balayage", duracionMinutos: 180, precioMxn: 1800, precioCentavos: 180000 },
      { nombre: "Alaciado Express", duracionMinutos: 120, precioMxn: 1200, precioCentavos: 120000 },
      { nombre: "Manicure Gelish", duracionMinutos: 45, precioMxn: 280, precioCentavos: 28000 },
    ],
  },
  {
    id: "barberia",
    etiqueta: "Barbería Clásica",
    categoriaNombre: "Barbería",
    servicios: [
      { nombre: "Corte Clásico", duracionMinutos: 35, precioMxn: 200, precioCentavos: 20000 },
      { nombre: "Arreglo de Barba con Toalla Caliente", duracionMinutos: 30, precioMxn: 180, precioCentavos: 18000 },
      { nombre: "Paquete Corte + Barba", duracionMinutos: 60, precioMxn: 350, precioCentavos: 35000 },
      { nombre: "Exfoliación Facial", duracionMinutos: 30, precioMxn: 220, precioCentavos: 22000 },
    ],
  },
  {
    id: "unas",
    etiqueta: "Nail Spa / Uñas",
    categoriaNombre: "Uñas y Spa",
    servicios: [
      { nombre: "Aplicación Gelish", duracionMinutos: 45, precioMxn: 250, precioCentavos: 25000 },
      { nombre: "Uñas Acrílicas Esculturales", duracionMinutos: 90, precioMxn: 550, precioCentavos: 55000 },
      { nombre: "Retoque de Acrílico", duracionMinutos: 60, precioMxn: 350, precioCentavos: 35000 },
      { nombre: "Pedicure Spa", duracionMinutos: 60, precioMxn: 420, precioCentavos: 42000 },
    ],
  },
  {
    id: "pestanas",
    etiqueta: "Lash & Brow Bar",
    categoriaNombre: "Pestañas y Cejas",
    servicios: [
      { nombre: "Extensiones Clásicas 1x1", duracionMinutos: 90, precioMxn: 650, precioCentavos: 65000 },
      { nombre: "Retoque 15 días", duracionMinutos: 45, precioMxn: 350, precioCentavos: 35000 },
      { nombre: "Lifting de Pestañas", duracionMinutos: 45, precioMxn: 400, precioCentavos: 40000 },
      { nombre: "Planchado de Ceja", duracionMinutos: 35, precioMxn: 300, precioCentavos: 30000 },
    ],
  },
] as const;

export function obtenerPackArranque(id: string): PackArranquePreset | null {
  return PACKS_ARRANQUE_MEXICO.find((pack) => pack.id === id) ?? null;
}

