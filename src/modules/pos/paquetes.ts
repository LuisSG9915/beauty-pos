/**
 * Reglas puras de paquetes prepagados: qué paquete del cliente consume una
 * línea de servicio y cómo cambia el saldo. La selección es FIFO entre los
 * paquetes vigentes del cliente que cubren el servicio (el más antiguo con
 * saldo suficiente se usa primero).
 */

export type PaqueteClienteResumen = {
  id: string;
  servicioId: string;
  sesionesRestantes: number;
};

/**
 * Elige el primer paquete vigente (la lista ya viene ordenada por antigüedad)
 * que cubre el servicio y tiene sesiones suficientes para la línea completa.
 */
export function elegirPaqueteParaServicio<T extends PaqueteClienteResumen>(
  paquetesCliente: T[],
  servicioId: string,
  cantidad: number,
): T | null {
  if (cantidad <= 0) return null;
  return (
    paquetesCliente.find(
      (p) => p.servicioId === servicioId && p.sesionesRestantes >= cantidad,
    ) ?? null
  );
}

/** Sesiones restantes tras consumir `cantidad`; nunca baja de cero. */
export function restarSesiones(restantes: number, cantidad: number): number {
  return Math.max(restantes - Math.max(cantidad, 0), 0);
}

/** Estado resultante tras consumir sesiones. */
export function estadoTrasUso(restantes: number): "vigente" | "agotado" {
  return restantes > 0 ? "vigente" : "agotado";
}

/** Saldo total del cliente para un servicio (suma de sus paquetes vigentes). */
export function saldoParaServicio(
  paquetesCliente: PaqueteClienteResumen[],
  servicioId: string,
): number {
  return paquetesCliente
    .filter((p) => p.servicioId === servicioId)
    .reduce((s, p) => s + p.sesionesRestantes, 0);
}
