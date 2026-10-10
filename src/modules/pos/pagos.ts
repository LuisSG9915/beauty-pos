/**
 * Reglas puras del cobro del POS: valida la lista de pagos capturados contra
 * el total a cubrir y reparte el cambio entre los pagos en efectivo.
 * Nada de I/O — la transacción que inserta vive en la server action.
 */

export type PagoCapturado = {
  medioPagoId: string;
  monto: number;
  referencia?: string | null;
};

export type MedioPagoCobro = {
  nombre: string;
  categoria: string;
};

/** Pago ya resuelto: lo aplicado a la venta, lo recibido y el cambio dado. */
export type LineaPagoResuelta = {
  medioPagoId: string;
  /** Monto aplicado a la venta (recibido − cambio). */
  aplicado: number;
  /** Monto entregado por el cliente. */
  recibido: number;
  /** Cambio devuelto (solo en medios efectivos). */
  cambio: number;
  referencia: string | null;
};

export type ResultadoCobro =
  | { ok: true; cambioTotal: number; lineas: LineaPagoResuelta[] }
  | { ok: false; error: string; detalle?: string };

const EPSILON = 0.005;
const redondear = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Reglas del cobro:
 * - Todo medio debe existir y los no efectivos exigen referencia.
 * - Con saldo a cubrir se requiere al menos un pago; con total ya cubierto
 *   (paquetes/anticipos) no se aceptan pagos adicionales.
 * - Solo el efectivo puede exceder lo cubierto (genera cambio); tarjeta,
 *   transferencia y similares deben ser exactos.
 * - Sin efectivo, el total recibido debe ser exacto.
 * - El cambio se imputa a los pagos en efectivo en el orden capturado.
 */
export function resolverCobroPagos(input: {
  pagos: PagoCapturado[];
  /** Saldo por cubrir: total + propina − anticipo aplicado. */
  aCubrir: number;
  mediosPorId: ReadonlyMap<string, MedioPagoCobro>;
}): ResultadoCobro {
  const { pagos, aCubrir, mediosPorId } = input;

  for (const pago of pagos) {
    const medio = mediosPorId.get(pago.medioPagoId);
    if (!medio) return { ok: false, error: "Uno de los medios de pago no es válido." };
  }

  if (aCubrir > EPSILON && pagos.length === 0) {
    return {
      ok: false,
      error: `Falta cubrir ${aCubrir.toFixed(2)} del total.`,
      detalle: "Agrega al menos un pago.",
    };
  }
  if (aCubrir <= EPSILON && pagos.length > 0) {
    return {
      ok: false,
      error: "El total ya está cubierto; cobra sin pagos adicionales.",
      detalle: "Quita los pagos: el total ya está cubierto.",
    };
  }

  const esEfectivo = (medioPagoId: string) => mediosPorId.get(medioPagoId)?.categoria === "efectivo";
  const recibidoEfectivo = redondear(pagos.filter((p) => esEfectivo(p.medioPagoId)).reduce((s, p) => s + p.monto, 0));
  const recibidoNoEfectivo = redondear(pagos.filter((p) => !esEfectivo(p.medioPagoId)).reduce((s, p) => s + p.monto, 0));
  const recibido = recibidoEfectivo + recibidoNoEfectivo;

  if (recibidoNoEfectivo > aCubrir + EPSILON) {
    return {
      ok: false,
      error: `Los pagos sin efectivo exceden el total (${aCubrir.toFixed(2)}).`,
      detalle: "Un pago sin efectivo no puede generar cambio.",
    };
  }
  if (recibidoEfectivo === 0 && Math.abs(recibidoNoEfectivo - aCubrir) > EPSILON) {
    return {
      ok: false,
      error: `Sin efectivo el pago debe ser exacto (${aCubrir.toFixed(2)}).`,
      detalle: "Ajusta el monto al total exacto.",
    };
  }
  if (recibido + EPSILON < aCubrir) {
    return {
      ok: false,
      error: `Los pagos no cubren el total (${aCubrir.toFixed(2)}).`,
      detalle: "Completa el monto restante.",
    };
  }

  const cambioTotal = Math.max(redondear(recibido - aCubrir), 0);
  let cambioPendiente = cambioTotal;
  const lineas = pagos.map((pago) => {
    const cambio = esEfectivo(pago.medioPagoId) ? Math.min(pago.monto, cambioPendiente) : 0;
    cambioPendiente = redondear(cambioPendiente - cambio);
    return {
      medioPagoId: pago.medioPagoId,
      aplicado: redondear(pago.monto - cambio),
      recibido: pago.monto,
      cambio,
      referencia: pago.referencia || null,
    };
  });

  return { ok: true, cambioTotal, lineas };
}
