/** Reglas puras del módulo de liquidación de comisiones: no conocen la BD. */

export const ESTADOS_LIQUIDACION = ["confirmada", "revertida"] as const;
export type EstadoLiquidacion = (typeof ESTADOS_LIQUIDACION)[number];

/** Solo una liquidación confirmada puede revertirse; no se deshace la reversa. */
export function puedeRevertir(estado: string): estado is "confirmada" {
  return estado === "confirmada";
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida el periodo a liquidar; devuelve el primer error o null. */
export function validarPeriodoLiquidacion(desde: string, hasta: string): string | null {
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta)) return "Indica el periodo a liquidar.";
  if (desde > hasta) return "La fecha inicial no puede ser mayor a la final.";
  return null;
}

export type ComisionPendiente = {
  id: string;
  usuarioId: string;
  monto: number;
};

/** Suma de comisiones pendientes por profesional, ordenada de mayor a menor. */
export function resumirPendientes(
  rows: ComisionPendiente[],
): Array<{ usuarioId: string; total: number; cantidad: number }> {
  const porUsuario = new Map<string, { total: number; cantidad: number }>();
  for (const row of rows) {
    const actual = porUsuario.get(row.usuarioId) ?? { total: 0, cantidad: 0 };
    actual.total += row.monto;
    actual.cantidad += 1;
    porUsuario.set(row.usuarioId, actual);
  }
  return [...porUsuario.entries()]
    .map(([usuarioId, acumulado]) => ({ usuarioId, ...acumulado }))
    .sort((a, b) => b.total - a.total);
}
