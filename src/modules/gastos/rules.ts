/** Reglas puras del módulo de gastos: no conocen la base de datos. */

export const ESTADOS_GASTO = ["confirmado", "revertido"] as const;
export type EstadoGasto = (typeof ESTADOS_GASTO)[number];

/**
 * Un gasto solo mueve el cajón cuando su medio de pago es de categoría
 * `efectivo`. Tarjeta, transferencia y banco no tocan el corte de caja.
 */
export function afectaCaja(categoriaMedio: string): boolean {
  return categoriaMedio === "efectivo";
}

/** Solo un gasto confirmado puede revertirse; la reversión no se deshace. */
export function puedeRevertir(estado: string): estado is "confirmado" {
  return estado === "confirmado";
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validación pura del formulario de gasto; devuelve el primer error o null. */
export function validarGastoInput(input: {
  concepto: string;
  importe: number;
  fechaGasto: string;
}): string | null {
  if (!input.concepto.trim()) return "Indica el concepto del gasto.";
  if (!Number.isFinite(input.importe) || input.importe <= 0) {
    return "El importe debe ser mayor a cero.";
  }
  if (!FECHA_RE.test(input.fechaGasto)) return "Indica la fecha del gasto.";
  return null;
}
