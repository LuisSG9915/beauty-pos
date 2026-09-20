/**
 * Reglas puras de devoluciones parciales: valida las líneas pedidas contra el
 * ticket original y lo ya devuelto, y calcula el monto a reintegrar. Las
 * escrituras (devolución, stock, comisiones, sesiones de paquete) viven en la
 * server action — aquí solo se decide qué y cuánto.
 */

export type TipoLineaDevolucion = "servicio" | "producto" | "paquete" | "membresia";

export type LineaTicketDevolucion = {
  id: string;
  cantidad: number;
  precio: number | string;
  productoId?: string | null;
  paqueteId?: string | null;
  membresiaId?: string | null;
};

export type LineaDevolucionResuelta = {
  tipo: TipoLineaDevolucion;
  detalleId: string;
  cantidad: number;
  /** Monto a reintegrar; 0 cuando la línea se cubrió con sesiones de paquete. */
  monto: number;
  productoId?: string;
  paqueteId?: string;
  membresiaId?: string;
  /** `true` cuando se devuelve la cantidad completa de la línea original. */
  completa: boolean;
  /** `true` cuando la línea de servicio se pagó con saldo de paquete. */
  cubiertaPorPaquete: boolean;
};

export type ResultadoDevolucion =
  | {
      ok: true;
      resueltas: LineaDevolucionResuelta[];
      montoDevuelto: number;
      /** `true` si alguna línea restaura sesiones en lugar de regresar dinero. */
      huboRestauracion: boolean;
    }
  | { ok: false; error: string };

const redondear = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Resuelve y valida cada línea pedida:
 * - Debe pertenecer al ticket original.
 * - No puede exceder lo pendiente (cantidad original − ya devuelto en
 *   devoluciones anteriores de la misma venta).
 * - Una línea de servicio cubierta por paquete no regresa dinero: su monto es
 *   0 y la acción restaura la sesión al saldo del cliente.
 * - El monto se prorratea por `factorNeto` (total/subtotal) para respetar
 *   descuentos aplicados a la venta completa.
 */
export function resolverLineasDevolucion(input: {
  solicitadas: Array<{ tipo: TipoLineaDevolucion; detalleId: string; cantidad: number }>;
  ticketPorTipo: Record<TipoLineaDevolucion, LineaTicketDevolucion[]>;
  /** Cantidades ya devueltas en devoluciones previas: detalleId → cantidad. */
  devueltasPrevias: ReadonlyMap<string, number>;
  /** detalleVentaServicioId cubiertos por un uso de paquete. */
  serviciosCubiertosPorPaquete: ReadonlySet<string>;
  /** total/subtotal de la venta (1 cuando no hay descuento global). */
  factorNeto: number;
}): ResultadoDevolucion {
  const { solicitadas, ticketPorTipo, devueltasPrevias, serviciosCubiertosPorPaquete, factorNeto } = input;

  const resueltas: LineaDevolucionResuelta[] = [];
  for (const linea of solicitadas) {
    const origen = ticketPorTipo[linea.tipo];
    const ticket = origen.find((l) => l.id === linea.detalleId);
    if (!ticket) return { ok: false, error: "Una de las líneas ya no pertenece a la venta." };

    const pendiente = ticket.cantidad - (devueltasPrevias.get(linea.detalleId) ?? 0);
    if (linea.cantidad > pendiente + 1e-6) {
      return { ok: false, error: `Solo quedan ${pendiente} pieza(s) por devolver en una línea.` };
    }

    const cubierta = linea.tipo === "servicio" && serviciosCubiertosPorPaquete.has(linea.detalleId);
    resueltas.push({
      tipo: linea.tipo,
      detalleId: linea.detalleId,
      cantidad: linea.cantidad,
      monto: cubierta ? 0 : redondear(Number(ticket.precio) * linea.cantidad * factorNeto),
      productoId: linea.tipo === "producto" ? (ticket.productoId ?? undefined) : undefined,
      paqueteId: linea.tipo === "paquete" ? (ticket.paqueteId ?? undefined) : undefined,
      membresiaId: linea.tipo === "membresia" ? (ticket.membresiaId ?? undefined) : undefined,
      completa: linea.cantidad >= ticket.cantidad,
      cubiertaPorPaquete: cubierta,
    });
  }

  const montoDevuelto = redondear(resueltas.reduce((s, l) => s + l.monto, 0));
  const huboRestauracion = resueltas.some((l) => l.cubiertaPorPaquete);
  if (montoDevuelto <= 0 && !huboRestauracion) {
    return { ok: false, error: "El monto a devolver debe ser mayor a cero." };
  }

  return { ok: true, resueltas, montoDevuelto, huboRestauracion };
}
