import { describe, expect, it } from "vitest";

import { motivoBloqueoSucursal, puedeCrearOtraSucursal } from "./rules";

const base = { activas: 1, multisucursal: true, maxSucursales: null, cubiertas: null };

describe("puedeCrearOtraSucursal", () => {
  it("la primera sucursal nunca exige multisucursal", () => {
    expect(puedeCrearOtraSucursal({ ...base, activas: 0, multisucursal: false })).toBe(true);
  });

  it("sin multisucursal no permite una segunda", () => {
    expect(puedeCrearOtraSucursal({ ...base, multisucursal: false })).toBe(false);
  });

  it("con multisucursal sin topes permite", () => {
    expect(puedeCrearOtraSucursal(base)).toBe(true);
  });

  it("respeta el máximo del plan", () => {
    expect(puedeCrearOtraSucursal({ ...base, activas: 3, maxSucursales: 3 })).toBe(false);
    expect(puedeCrearOtraSucursal({ ...base, activas: 2, maxSucursales: 3 })).toBe(true);
  });

  it("respeta la cobertura facturada", () => {
    expect(puedeCrearOtraSucursal({ ...base, activas: 2, cubiertas: 2 })).toBe(false);
    expect(puedeCrearOtraSucursal({ ...base, activas: 1, cubiertas: 2 })).toBe(true);
  });

  it("aplica ambos topes: el más restrictivo gana", () => {
    const cap = { ...base, activas: 2, maxSucursales: 5, cubiertas: 2 };
    expect(puedeCrearOtraSucursal(cap)).toBe(false);
  });
});

describe("motivoBloqueoSucursal", () => {
  it("menciona Profesional cuando falta multisucursal", () => {
    expect(motivoBloqueoSucursal({ ...base, multisucursal: false })).toContain("Profesional");
  });

  it("menciona el máximo del plan cuando se alcanza", () => {
    expect(motivoBloqueoSucursal({ ...base, activas: 3, maxSucursales: 3 })).toContain("3 sucursal");
  });

  it("pide ampliar cobertura cuando solo falta facturación", () => {
    expect(motivoBloqueoSucursal({ ...base, activas: 2, cubiertas: 2 })).toContain("cobertura");
  });
});
