/**
 * Cálculo puro del esperado por medio de pago al cerrar un corte de caja.
 *
 * esperado = cobrado (pagos aplicados de ventas del corte)
 *          + fondo inicial (solo en un medio efectivo, una sola vez)
 *          + entradas − retiros − gastos − depósitos + ajustes (monto firmado)
 *
 * `monto` de ajuste puede ser negativo; los demás tipos siempre positivos.
 */

export type MovimientoParaEsperado = {
  tipo: "entrada" | "retiro" | "gasto" | "deposito" | "ajuste";
  monto: number;
};

const SIGNO: Record<MovimientoParaEsperado["tipo"], number> = {
  entrada: 1,
  retiro: -1,
  gasto: -1,
  deposito: -1,
  ajuste: 1,
};

export function movimientosNetos(movimientos: MovimientoParaEsperado[]): number {
  return movimientos.reduce((sum, mov) => sum + SIGNO[mov.tipo] * mov.monto, 0);
}

export function calcularEsperadoMedio(input: {
  cobrado: number;
  fondo: number;
  movimientos: MovimientoParaEsperado[];
}): number {
  return input.cobrado + input.fondo + movimientosNetos(input.movimientos);
}

/**
 * El fondo es efectivo físico único: se imputa una sola vez al medio de
 * categoría efectivo que tuvo cobros (o al primero si no hubo ninguno).
 */
export function medioDelFondo(
  medios: Array<{ id: string; categoria: string }>,
  cobrado: Map<string, number>,
): string | undefined {
  return (
    medios.find((m) => m.categoria === "efectivo" && (cobrado.get(m.id) ?? 0) > 0)?.id ??
    medios.find((m) => m.categoria === "efectivo")?.id
  );
}
