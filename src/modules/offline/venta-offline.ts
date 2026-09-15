/**
 * Cálculo y validación de una venta registrada offline. Lo usa el ticket del
 * modo offline (para mostrar el total) y `sincronizarVentaOffline` (para
 * recalcular de forma autoritativa lo que el dispositivo envió).
 */

export type LineaOfflineCalc = { precio: string | number; cantidad: number };
export type PagoOfflineCalc = { monto: string | number; esEfectivo: boolean };

export function totalVentaOffline(lineas: LineaOfflineCalc[]): number {
  return lineas.reduce((sum, l) => sum + Number(l.precio) * l.cantidad, 0);
}

/**
 * Replica las reglas de pago de `cobrarVenta`: el efectivo puede exceder el
 * total (la diferencia es cambio) pero los demás medios no pueden excederlo.
 * Devuelve null si la combinación de pagos cubre la venta.
 */
export function validarPagosOffline(pagos: PagoOfflineCalc[], total: number): string | null {
  if (total <= 0) return "El total de la venta debe ser mayor a cero.";
  if (pagos.length === 0) return "Agrega al menos un pago.";
  const recibido = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
  const noEfectivo = pagos.filter((p) => !p.esEfectivo).reduce((sum, p) => sum + Number(p.monto), 0);
  if (recibido < total) return "El pago recibido no cubre el total.";
  if (noEfectivo > total) return "Los medios distintos a efectivo no pueden exceder el total.";
  return null;
}
