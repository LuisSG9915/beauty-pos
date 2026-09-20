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
    clave: "servicios",
    titulo: "Crea tu primer servicio",
    descripcion: "Nombre, duración y precio: es lo que aparecerá al agendar y cobrar.",
    href: "/servicios",
    permisos: ["catalogos.editar"],
    completado: (estado) => estado.serviciosActivos > 0,
  },
  {
    clave: "horario",
    titulo: "Define el horario de atención",
    descripcion: "Los días y horas en que tu sucursal recibe citas.",
    href: "/agenda",
    permisos: ["agenda.editar"],
    completado: (estado) => estado.horariosActivos > 0,
  },
  {
    clave: "equipo",
    titulo: "Invita a tu equipo",
    descripcion: "Opcional: agrega recepción, caja o especialistas con su rol.",
    href: "/usuarios",
    permisos: ["usuarios.invitar"],
    opcional: true,
    completado: (estado) => estado.miembrosActivos > 1,
  },
  {
    clave: "primera_cita",
    titulo: "Agenda tu primera cita real",
    descripcion: "Elige cliente, servicio y horario. Ya son datos de tu negocio.",
    href: "/agenda",
    permisos: ["agenda.editar"],
    completado: (estado) => estado.citasRegistradas > 0,
  },
  {
    clave: "primer_cobro",
    titulo: "Registra tu primer cobro",
    descripcion: "Cobra una cita o una venta directa y revisa el ticket.",
    href: "/pos",
    permisos: ["ventas.cobrar"],
    completado: (estado) => estado.ventasCobradas > 0,
  },
  {
    clave: "resultado",
    titulo: "Revisa tu primer reporte",
    descripcion: "Comprueba que la venta aparece y aprende dónde corregirla.",
    href: "/reportes",
    permisos: ["reportes.operativos", "reportes.financieros"],
    completado: (estado) => estado.ventasCobradas > 0,
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
  return pasos.map((paso) => ({ ...paso, hecho: paso.completado(estado) }));
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
