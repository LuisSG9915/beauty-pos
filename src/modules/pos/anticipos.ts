/**
 * Regla de aplicación de anticipos al cobrar una venta: cada anticipo vigente
 * entra completo si cabe contra el total de la venta (la propina siempre se
 * cobra aparte). Se evalúan en orden de creación; el que no cabe entero queda
 * vigente para devolución manual. La misma regla la usa `cobrarVenta`
 * (ejecución) y el ticket (vista previa "por aplicar").
 */
export function anticiposAplicables<T extends { monto: number | string }>(
  vigentes: T[],
  total: number,
): { aplicados: T[]; suma: number } {
  const aplicados: T[] = [];
  let restante = total;
  for (const anticipo of vigentes) {
    const monto = Number(anticipo.monto);
    if (monto <= restante + 0.005) {
      aplicados.push(anticipo);
      restante = Math.round((restante - monto) * 100) / 100;
    }
  }
  const suma = Math.round(aplicados.reduce((s, a) => s + Number(a.monto), 0) * 100) / 100;
  return { aplicados, suma };
}
