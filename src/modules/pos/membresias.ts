/**
 * Reglas puras de membresías: vigencia por fecha (en la zona horaria de la
 * sucursal) y descuento porcentual sobre el subtotal elegible según `aplica`.
 */

export type MembresiaRegla = {
  descuentoPorcentaje: number;
  aplica: string; // "ambos" | "servicio" | "producto"
};

export type MembresiaVigencia = {
  estado: string;
  vigenciaDesde: string; // ISO date
  vigenciaHasta: string; // ISO date
};

/** Descuento de la membresía sobre el subtotal elegible; topado a ese monto. */
export function calcularDescuentoMembresia(
  membresia: MembresiaRegla,
  subtotalServicios: number,
  subtotalProductos: number,
): number {
  const elegible =
    membresia.aplica === "servicio"
      ? subtotalServicios
      : membresia.aplica === "producto"
        ? subtotalProductos
        : subtotalServicios + subtotalProductos;
  if (elegible <= 0) return 0;
  const pct = Math.min(Math.max(membresia.descuentoPorcentaje, 0), 100);
  return Math.min(Math.round(((elegible * pct) / 100) * 100) / 100, elegible);
}

/** Vigente = estado "vigente" y hoy (fecha sucursal) dentro del rango. */
export function membresiaVigente(
  membresia: MembresiaVigencia,
  hoy: string,
): boolean {
  return (
    membresia.estado === "vigente" &&
    membresia.vigenciaDesde <= hoy &&
    hoy <= membresia.vigenciaHasta
  );
}

/** Fecha ISO resultante de sumar `dias` a una fecha ISO (calendario). */
export function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
