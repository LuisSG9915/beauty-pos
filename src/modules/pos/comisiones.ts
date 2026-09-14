/**
 * Cálculo puro de comisiones devengadas al cobrar una venta.
 *
 * Reglas (`comisiones`): `tipo` ∈ porcentaje | monto_fijo, `valor` es el
 * porcentaje (sobre el importe de la línea) o el monto fijo por unidad.
 * `rolId` null = regla genérica; con valor aplica solo a usuarios con ese rol.
 * Precedencia: regla de rol específica > genérica. Si hay empate de
 * precedencia, se toma la más reciente (la última recibida).
 */

export type LineaServicioInput = {
  /** id de detalle_ventas_servicios */
  detalleId: string;
  servicioId: string;
  /** usuarioId asignado a la línea (estilista); null = sin comisión */
  usuarioId: string | null;
  precio: number;
  cantidad: number;
};

export type ReglaComision = {
  id: string;
  /** null nunca coincide con una línea (la regla siempre lleva servicio) */
  servicioId: string | null;
  rolId: string | null;
  tipo: "porcentaje" | "monto_fijo";
  valor: number;
};

export type ComisionCalculada = {
  detalleVentaServicioId: string;
  usuarioId: string;
  comisionId: string | null;
  tipo: string;
  valor: number;
  base: number;
  monto: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function calcularComisiones(
  lineas: LineaServicioInput[],
  reglas: ReglaComision[],
  rolesPorUsuario: Map<string, string[]>,
): ComisionCalculada[] {
  const resultado: ComisionCalculada[] = [];
  for (const linea of lineas) {
    if (!linea.usuarioId) continue;
    const roles = rolesPorUsuario.get(linea.usuarioId) ?? [];
    const base = linea.precio * linea.cantidad;
    if (base <= 0) continue;

    const aplicables = reglas.filter(
      (regla) =>
        regla.servicioId === linea.servicioId &&
        (regla.rolId === null || roles.includes(regla.rolId)),
    );
    if (aplicables.length === 0) continue;

    const regla =
      aplicables.find((item) => item.rolId !== null) ?? aplicables[aplicables.length - 1];
    const monto =
      regla.tipo === "porcentaje"
        ? round2((base * regla.valor) / 100)
        : round2(regla.valor * linea.cantidad);
    if (monto <= 0) continue;

    resultado.push({
      detalleVentaServicioId: linea.detalleId,
      usuarioId: linea.usuarioId,
      comisionId: regla.id,
      tipo: regla.tipo,
      valor: regla.valor,
      base: round2(base),
      monto,
    });
  }
  return resultado;
}

/**
 * Reparte la propina de la venta entre los profesionales que atendieron las
 * líneas de servicio, proporcional al importe de sus líneas. Si ninguna línea
 * tiene estilista asignado, la propina va completa a `fallbackUsuarioId`
 * (el profesional de la cita/venta) cuando existe.
 */
export function repartirPropina(
  propina: number,
  lineas: LineaServicioInput[],
  fallbackUsuarioId: string | null,
): Array<{ usuarioId: string; monto: number }> {
  const total = round2(propina);
  if (total <= 0) return [];

  const pesos = new Map<string, number>();
  let baseTotal = 0;
  for (const linea of lineas) {
    if (!linea.usuarioId) continue;
    const importe = linea.precio * linea.cantidad;
    pesos.set(linea.usuarioId, (pesos.get(linea.usuarioId) ?? 0) + importe);
    baseTotal += importe;
  }

  if (baseTotal <= 0 || pesos.size === 0) {
    return fallbackUsuarioId ? [{ usuarioId: fallbackUsuarioId, monto: total }] : [];
  }

  const reparto: Array<{ usuarioId: string; monto: number }> = [];
  let asignado = 0;
  const entradas = [...pesos.entries()];
  entradas.forEach(([usuarioId, peso], index) => {
    // El último absorbe el redondeo para que la suma cuadre exacta.
    const monto =
      index === entradas.length - 1
        ? round2(total - asignado)
        : round2((total * peso) / baseTotal);
    asignado += monto;
    reparto.push({ usuarioId, monto });
  });
  return reparto.filter((item) => item.monto > 0);
}
