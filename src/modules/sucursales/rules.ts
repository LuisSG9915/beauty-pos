/**
 * Reglas puras de gestión de sucursales: quién puede crear/activar otra
 * sucursal según el plan vigente y la cobertura facturada.
 *
 * Modelo comercial: el precio base del plan cubre `sucursalesIncluidas` y
 * cada sucursal adicional se factura aparte (Profesional). `maxSucursales`
 * es el tope absoluto del plan y `cubiertas` la cobertura pagada vigente —
 * crear/activar exige respetar ambos. La capacidad `multisucursal` (solo
 * Profesional) habilita la vista consolidada de reportes, no la creación.
 */

export type CapacidadSucursales = {
  /** Sucursales actualmente activas en la organización. */
  activas: number;
  /** `max_sucursales` del plan; null = sin tope (o sin suscripción). */
  maxSucursales: number | null;
  /** Sucursales cubiertas por la suscripción; null = sin suscripción. */
  cubiertas: number | null;
};

/**
 * La primera sucursal nunca exige nada: sin sucursal activa no hay
 * operación. De la 2ª en adelante se requiere quedar dentro del máximo del
 * plan y de la cobertura facturada.
 */
export function puedeCrearOtraSucursal(cap: CapacidadSucursales): boolean {
  if (cap.activas === 0) return true;
  if (cap.maxSucursales != null && cap.activas >= cap.maxSucursales) return false;
  if (cap.cubiertas != null && cap.activas >= cap.cubiertas) return false;
  return true;
}

/** Motivo visible cuando `puedeCrearOtraSucursal` es falso. */
export function motivoBloqueoSucursal(cap: CapacidadSucursales): string {
  if (cap.maxSucursales != null && cap.activas >= cap.maxSucursales) {
    return `Tu plan permite hasta ${cap.maxSucursales} sucursal(es) activa(s). El plan Profesional cubre más.`;
  }
  return "Amplía la cobertura de tu suscripción para agregar otra sucursal.";
}
