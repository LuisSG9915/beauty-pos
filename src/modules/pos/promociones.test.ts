import { describe, expect, it } from "vitest";

import {
  calcularDescuentoPromocion,
  promocionVigente,
  type PromocionCalculo,
} from "@/modules/pos/promociones";

const promo = (partial: Partial<PromocionCalculo>): PromocionCalculo => ({
  tipo: "porcentaje",
  valor: 10,
  aplica: "ambos",
  ...partial,
});

describe("calcularDescuentoPromocion", () => {
  it("porcentaje sobre el subtotal elegible (ambos)", () => {
    expect(calcularDescuentoPromocion(promo({}), 200, 100)).toBe(30);
  });

  it("aplica=servicios solo descuenta líneas de servicio", () => {
    expect(calcularDescuentoPromocion(promo({ aplica: "servicios" }), 200, 100)).toBe(20);
  });

  it("aplica=productos solo descuenta líneas de producto", () => {
    expect(calcularDescuentoPromocion(promo({ aplica: "productos" }), 200, 100)).toBe(10);
  });

  it("monto fijo se topa al subtotal elegible", () => {
    expect(calcularDescuentoPromocion(promo({ tipo: "monto", valor: 50 }), 200, 100)).toBe(50);
    expect(calcularDescuentoPromocion(promo({ tipo: "monto", valor: 999 }), 0, 100)).toBe(100);
  });

  it("subtotal elegible en cero no genera descuento", () => {
    expect(calcularDescuentoPromocion(promo({ aplica: "productos" }), 200, 0)).toBe(0);
  });

  it("redondea a centavos", () => {
    // 33% de 99.99 = 32.9967 → 33.00
    expect(calcularDescuentoPromocion(promo({ valor: 33 }), 0, 99.99)).toBe(33);
  });
});

describe("promocionVigente", () => {
  const base = { activo: true, vigenciaDesde: "2026-09-01", vigenciaHasta: null };

  it("activa sin fecha fin vigente desde su inicio", () => {
    expect(promocionVigente(base, "2026-09-14")).toBe(true);
    expect(promocionVigente(base, "2026-09-01")).toBe(true);
  });

  it("inactiva nunca aplica", () => {
    expect(promocionVigente({ ...base, activo: false }, "2026-09-14")).toBe(false);
  });

  it("aún no empieza", () => {
    expect(promocionVigente(base, "2026-08-31")).toBe(false);
  });

  it("respeta la fecha de fin", () => {
    const conFin = { ...base, vigenciaHasta: "2026-09-15" };
    expect(promocionVigente(conFin, "2026-09-15")).toBe(true);
    expect(promocionVigente(conFin, "2026-09-16")).toBe(false);
  });
});
