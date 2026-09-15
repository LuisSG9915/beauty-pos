import { describe, expect, it } from "vitest";

import { totalVentaOffline, validarPagosOffline } from "./venta-offline";

describe("totalVentaOffline", () => {
  it("suma precio × cantidad de todas las líneas", () => {
    expect(totalVentaOffline([{ precio: "100.00", cantidad: 2 }, { precio: "50.50", cantidad: 1 }])).toBeCloseTo(250.5);
  });
  it("devuelve 0 sin líneas", () => {
    expect(totalVentaOffline([])).toBe(0);
  });
});

describe("validarPagosOffline", () => {
  it("rechaza venta sin líneas (total 0)", () => {
    expect(validarPagosOffline([{ monto: "10", esEfectivo: true }], 0)).toMatch(/mayor a cero/);
  });
  it("rechaza total sin pagos", () => {
    expect(validarPagosOffline([], 100)).toMatch(/al menos un pago/);
  });
  it("rechaza pago insuficiente", () => {
    expect(validarPagosOffline([{ monto: "50", esEfectivo: true }], 100)).toMatch(/no cubre/);
  });
  it("acepta efectivo mayor al total (genera cambio)", () => {
    expect(validarPagosOffline([{ monto: "200", esEfectivo: true }], 150)).toBeNull();
  });
  it("rechaza no-efectivo que excede el total", () => {
    expect(validarPagosOffline([{ monto: "200", esEfectivo: false }], 150)).toMatch(/no pueden exceder/);
  });
  it("acepta pago mixto exacto", () => {
    expect(
      validarPagosOffline(
        [
          { monto: "100", esEfectivo: true },
          { monto: "50", esEfectivo: false },
        ],
        150,
      ),
    ).toBeNull();
  });
  it("acepta mixto donde solo el efectivo excede", () => {
    expect(
      validarPagosOffline(
        [
          { monto: "200", esEfectivo: true },
          { monto: "50", esEfectivo: false },
        ],
        150,
      ),
    ).toBeNull();
  });
});
