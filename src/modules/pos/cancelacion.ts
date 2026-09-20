export type RestriccionesCancelacion = {
  paqueteTieneUsosExternos: boolean;
  membresiaTieneAplicacionExterna: boolean;
};

export function motivoBloqueoCancelacion(
  restricciones: RestriccionesCancelacion,
): string | null {
  if (restricciones.paqueteTieneUsosExternos) {
    return "El paquete vendido en esta venta ya consumió sesiones en otra venta. Cancela primero esa venta o registra una devolución parcial.";
  }
  if (restricciones.membresiaTieneAplicacionExterna) {
    return "La membresía vendida en esta venta ya aplicó su descuento en otra venta cobrada. Cancela primero esa venta o registra una devolución parcial.";
  }
  return null;
}
