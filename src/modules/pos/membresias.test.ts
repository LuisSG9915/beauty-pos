import { describe, expect, it } from "vitest";

import {
  calcularDescuentoMembresia,
  membresiaVigente,
  sumarDias,
} from "@/modules/pos/membresias";

describe("calcularDescuentoMembresia", () => {
  it("aplica el porcentaje sobre servicios y productos con aplica=ambos", () => {
    expect(
      calcularDescuentoMembresia({ descuentoPorcentaje: 15, aplica: "ambos" }, 300, 100),
    ).toBe(60);
  });

  it("solo servicios cuando aplica=servicio", () => {
    expect(
      calcularDescuentoMembresia({ descuentoPorcentaje: 10, aplica: "servicio" }, 300, 100),
    ).toBe(30);
  });

  it("solo productos cuando aplica=producto", () => {
    expect(
      calcularDescuentoMembresia({ descuentoPorcentaje: 10, aplica: "producto" }, 300, 100),
    ).toBe(10);
  });

  it("devuelve 0 sin subtotal elegible y topa al 100%", () => {
    expect(calcularDescuentoMembresia({ descuentoPorcentaje: 10, aplica: "servicio" }, 0, 100)).toBe(0);
    expect(calcularDescuentoMembresia({ descuentoPorcentaje: 150, aplica: "ambos" }, 300, 0)).toBe(300);
  });
});

describe("membresiaVigente", () => {
  it("vigente dentro del rango de fechas", () => {
    expect(
      membresiaVigente({ estado: "vigente", vigenciaDesde: "2025-01-01", vigenciaHasta: "2025-12-31" }, "2025-06-15"),
    ).toBe(true);
  });

  it("no vigente fuera de rango o cancelada", () => {
    expect(
      membresiaVigente({ estado: "vigente", vigenciaDesde: "2025-06-01", vigenciaHasta: "2025-06-30" }, "2025-07-01"),
    ).toBe(false);
    expect(
      membresiaVigente({ estado: "cancelado", vigenciaDesde: "2025-01-01", vigenciaHasta: "2025-12-31" }, "2025-06-15"),
    ).toBe(false);
  });

  it("los límites del rango son inclusivos", () => {
    expect(
      membresiaVigente({ estado: "vigente", vigenciaDesde: "2025-06-01", vigenciaHasta: "2025-06-30" }, "2025-06-30"),
    ).toBe(true);
  });
});

describe("sumarDias", () => {
  it("suma días naturales sobre fechas ISO", () => {
    expect(sumarDias("2025-06-15", 30)).toBe("2025-07-15");
    expect(sumarDias("2025-12-31", 1)).toBe("2026-01-01");
  });
});
