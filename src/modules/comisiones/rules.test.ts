import { describe, expect, it } from "vitest";

import { puedeRevertir, resumirPendientes, validarPeriodoLiquidacion } from "@/modules/comisiones/rules";

describe("validarPeriodoLiquidacion", () => {
  it("rechaza fechas vacías o con formato incorrecto", () => {
    expect(validarPeriodoLiquidacion("", "2025-01-31")).toBeTruthy();
    expect(validarPeriodoLiquidacion("31/01/2025", "2025-01-31")).toBeTruthy();
  });

  it("rechaza un periodo invertido", () => {
    expect(validarPeriodoLiquidacion("2025-02-01", "2025-01-01")).toBeTruthy();
  });

  it("acepta un periodo válido", () => {
    expect(validarPeriodoLiquidacion("2025-01-01", "2025-01-31")).toBeNull();
    expect(validarPeriodoLiquidacion("2025-01-15", "2025-01-15")).toBeNull();
  });
});

describe("puedeRevertir", () => {
  it("solo una liquidación confirmada es reversible", () => {
    expect(puedeRevertir("confirmada")).toBe(true);
    expect(puedeRevertir("revertida")).toBe(false);
  });
});

describe("resumirPendientes", () => {
  it("agrupa por profesional y ordena de mayor a menor", () => {
    const resumen = resumirPendientes([
      { id: "1", usuarioId: "a", monto: 100 },
      { id: "2", usuarioId: "b", monto: 250 },
      { id: "3", usuarioId: "a", monto: 50 },
      { id: "4", usuarioId: "a", monto: 20 },
    ]);
    expect(resumen).toEqual([
      { usuarioId: "b", total: 250, cantidad: 1 },
      { usuarioId: "a", total: 170, cantidad: 3 },
    ]);
  });

  it("devuelve lista vacía sin pendientes", () => {
    expect(resumirPendientes([])).toEqual([]);
  });
});
