/**
 * Cálculo del descuento que una promoción del catálogo genera sobre el ticket.
 *
 * La promoción convive con el descuento manual: `total = subtotal − descuento
 * − descuentoPromocion`. `aplica` decide sobre qué subtotal se evalúa:
 *  - "ambos"      → servicios + productos
 *  - "servicios"  → solo líneas de servicios
 *  - "productos"  → solo líneas de productos
 * `tipo`:
 *  - "porcentaje" → valor % del subtotal elegible
 *  - "monto"      → monto fijo, topado al subtotal elegible
 *
 * El descuento nunca excede el subtotal elegible y nunca es negativo.
 */

export type PromocionCalculo = {
  tipo: string;
  /** porcentaje (0-100) o monto fijo según `tipo`. */
  valor: number;
  aplica: string;
};

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcularDescuentoPromocion(
  promo: PromocionCalculo,
  subtotalServicios: number,
  subtotalProductos: number,
): number {
  const elegible =
    promo.aplica === "servicios"
      ? subtotalServicios
      : promo.aplica === "productos"
        ? subtotalProductos
        : subtotalServicios + subtotalProductos;
  if (elegible <= 0) return 0;
  const bruto =
    promo.tipo === "monto" ? promo.valor : (elegible * promo.valor) / 100;
  return Math.max(0, Math.min(redondear(bruto), elegible));
}

/** Vigencia por fecha local de la sucursal (`hoy` = YYYY-MM-DD en su timezone). */
export function promocionVigente(
  promo: { activo: boolean; vigenciaDesde: string; vigenciaHasta: string | null },
  hoy: string,
): boolean {
  if (!promo.activo) return false;
  if (promo.vigenciaDesde > hoy) return false;
  if (promo.vigenciaHasta && promo.vigenciaHasta < hoy) return false;
  return true;
}
