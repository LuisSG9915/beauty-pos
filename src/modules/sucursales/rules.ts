/**
 * Reglas puras de gestión de sucursales: quién puede crear/activar otra
 * sucursal según el plan vigente y la cobertura facturada.
 */

export type CapacidadSucursales = {
  /** Sucursales actualmente activas en la organización. */
  activas: number;
  /** El plan vigente incluye la capacidad `multisucursal`. */
  multisucursal: boolean;
  /** `max_sucursales` del plan; null = sin tope (o sin suscripción). */
  maxSucursales: number | null;
  /** Sucursales cubiertas por la suscripción; null = sin suscripción. */
  cubiertas: number | null;
};

/**
 * La primera sucursal nunca exige multisucursal: sin sucursal activa no hay
 * operación. De la 2ª en adelante se requiere la capacidad, el máximo del
 * plan y cobertura facturada disponible.
 */
export function puedeCrearOtraSucursal(cap: CapacidadSucursales): boolean {
  if (cap.activas === 0) return true;
  if (!cap.multisucursal) return false;
  if (cap.maxSucursales != null && cap.activas >= cap.maxSucursales) return false;
  if (cap.cubiertas != null && cap.activas >= cap.cubiertas) return false;
  return true;
}

/** Motivo visible cuando `puedeCrearOtraSucursal` es falso. */
export function motivoBloqueoSucursal(cap: CapacidadSucursales): string {
  if (!cap.multisucursal) return "Multisucursal requiere el plan Profesional.";
  if (cap.maxSucursales != null && cap.activas >= cap.maxSucursales) {
    return `Tu plan permite hasta ${cap.maxSucursales} sucursal(es) activa(s).`;
  }
  return "Amplía la cobertura de tu suscripción para agregar otra sucursal.";
}
