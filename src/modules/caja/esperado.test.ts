import { describe, expect, it } from "vitest";

import { calcularEsperadoMedio, medioDelFondo, movimientosNetos } from "./esperado";

describe("movimientosNetos", () => {
  it("entradas suman; retiros, gastos y depósitos restan; ajuste es firmado", () => {
    const neto = movimientosNetos([
      { tipo: "entrada", monto: 500 },
      { tipo: "retiro", monto: 200 },
      { tipo: "gasto", monto: 80 },
      { tipo: "deposito", monto: 300 },
      { tipo: "ajuste", monto: -15 },
      { tipo: "ajuste", monto: 5 },
    ]);
    expect(neto).toBe(-90);
  });

  it("sin movimientos el neto es cero", () => {
    expect(movimientosNetos([])).toBe(0);
  });
});

describe("calcularEsperadoMedio", () => {
  it("suma cobrado + fondo + movimientos", () => {
    expect(
      calcularEsperadoMedio({
        cobrado: 1500,
        fondo: 500,
        movimientos: [
          { tipo: "entrada", monto: 100 },
          { tipo: "retiro", monto: 250 },
        ],
      }),
    ).toBe(1850);
  });

  it("un medio no efectivo no recibe fondo", () => {
    expect(
      calcularEsperadoMedio({ cobrado: 800, fondo: 0, movimientos: [] }),
    ).toBe(800);
  });
});

describe("medioDelFondo", () => {
  const medios = [
    { id: "ef1", categoria: "efectivo" },
    { id: "ef2", categoria: "efectivo" },
    { id: "tj", categoria: "tarjeta" },
  ];

  it("imputa el fondo al medio efectivo con cobros", () => {
    expect(medioDelFondo(medios, new Map([["ef2", 100]]))).toBe("ef2");
  });

  it("sin cobros en efectivo usa el primer medio efectivo", () => {
    expect(medioDelFondo(medios, new Map([["tj", 50]]))).toBe("ef1");
    expect(medioDelFondo(medios, new Map())).toBe("ef1");
  });

  it("sin medios efectivos devuelve undefined", () => {
    expect(medioDelFondo([{ id: "tj", categoria: "tarjeta" }], new Map())).toBeUndefined();
  });
});
