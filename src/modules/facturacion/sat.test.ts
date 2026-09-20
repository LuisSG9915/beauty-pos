import { describe, expect, it } from "vitest";

import { desglosarIva, formaPagoDesdeCategoria, rfcValido, PUBLICO_EN_GENERAL } from "./sat";

describe("desglosarIva", () => {
  it("con IVA incluido desglosa subtotal e impuesto (16%)", () => {
    const r = desglosarIva(116, 0.16, true);
    expect(r.subtotal).toBe(100);
    expect(r.impuestos).toBe(16);
    expect(r.total).toBe(116);
  });
  it("con IVA incluido redondea centavos", () => {
    const r = desglosarIva(250, 0.16, true);
    expect(r.subtotal).toBe(215.52);
    expect(r.impuestos).toBe(34.48);
    expect(r.subtotal + r.impuestos).toBeCloseTo(250, 2);
  });
  it("sin IVA incluido suma el impuesto", () => {
    const r = desglosarIva(100, 0.16, false);
    expect(r.subtotal).toBe(100);
    expect(r.impuestos).toBe(16);
    expect(r.total).toBe(116);
  });
  it("tasa 0 devuelve impuestos 0", () => {
    const r = desglosarIva(80, 0, true);
    expect(r).toEqual({ subtotal: 80, impuestos: 0, total: 80 });
  });
});

describe("formaPagoDesdeCategoria", () => {
  it("mapea categorías internas a claves SAT", () => {
    expect(formaPagoDesdeCategoria("efectivo")).toBe("01");
    expect(formaPagoDesdeCategoria("tarjeta")).toBe("28");
    expect(formaPagoDesdeCategoria("transferencia")).toBe("03");
    expect(formaPagoDesdeCategoria("wallet")).toBe("05");
    expect(formaPagoDesdeCategoria("otro")).toBe("99");
    expect(formaPagoDesdeCategoria(null)).toBe("99");
  });
});

describe("rfcValido", () => {
  it("acepta RFC de persona física (13) y moral (12)", () => {
    expect(rfcValido("XAXX010101000")).toBe(true);
    expect(rfcValido("ABC010101AB1")).toBe(true);
    expect(rfcValido("aaa010101000")).toBe(true); // normaliza a mayúsculas
    expect(rfcValido("X1")).toBe(false);
    expect(rfcValido("")).toBe(false);
  });
  it("el RFC de público en general es válido", () => {
    expect(rfcValido(PUBLICO_EN_GENERAL.rfc)).toBe(true);
  });
});
