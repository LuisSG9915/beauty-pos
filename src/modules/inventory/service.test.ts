import { describe, expect, it } from "vitest";

import { resolveInventoryDelta } from "./service";

describe("resolveInventoryDelta", () => {
  it("entrada suma la cantidad al stock", () => {
    const r = resolveInventoryDelta("entrada", 5, 10);
    expect(r).toMatchObject({ delta: 5, stockResultante: 15 });
  });

  it("salida, venta y consumo restan la cantidad", () => {
    for (const tipo of ["salida", "venta", "consumo"] as const) {
      const r = resolveInventoryDelta(tipo, 3, 10);
      expect(r).toMatchObject({ delta: -3, stockResultante: 7 });
    }
  });

  it("ajuste interpreta la cantidad como conteo físico absoluto", () => {
    expect(resolveInventoryDelta("ajuste", 12, 10)).toMatchObject({ delta: 2, stockResultante: 12 });
    expect(resolveInventoryDelta("ajuste", 4, 10)).toMatchObject({ delta: -6, stockResultante: 4 });
  });

  it("rechaza cantidades negativas y no finitas", () => {
    expect(resolveInventoryDelta("entrada", -1, 10).error).toBeTruthy();
    expect(resolveInventoryDelta("entrada", Number.NaN, 10).error).toBeTruthy();
    expect(resolveInventoryDelta("salida", -5, 10).error).toBeTruthy();
  });

  it("rechaza cantidad cero en entrada, salida, venta y consumo", () => {
    for (const tipo of ["entrada", "salida", "venta", "consumo"] as const) {
      expect(resolveInventoryDelta(tipo, 0, 10).error).toBeTruthy();
    }
  });

  it("permite ajuste a cero y detecta ajuste sin cambio", () => {
    expect(resolveInventoryDelta("ajuste", 0, 10)).toMatchObject({ delta: -10, stockResultante: 0 });
    expect(resolveInventoryDelta("ajuste", 10, 10).error).toContain("coincide");
  });

  it("impide que el stock quede negativo", () => {
    const r = resolveInventoryDelta("salida", 15, 10);
    expect(r.error).toContain("Stock insuficiente");
    expect(r.stockResultante).toBe(-5);
    expect(resolveInventoryDelta("ajuste", 0, 0).error).toBeTruthy();
  });

  it("permite dejar el stock exactamente en cero", () => {
    expect(resolveInventoryDelta("venta", 10, 10)).toMatchObject({ delta: -10, stockResultante: 0 });
  });

  it("devolución reingresa la cantidad al stock", () => {
    expect(resolveInventoryDelta("devolucion", 3, 10)).toMatchObject({ delta: 3, stockResultante: 13 });
    expect(resolveInventoryDelta("devolucion", 0, 10).error).toBeTruthy();
    expect(resolveInventoryDelta("devolucion", -2, 10).error).toBeTruthy();
  });
});
