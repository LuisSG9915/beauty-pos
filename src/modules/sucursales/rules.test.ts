import { describe, expect, it } from "vitest";

import { motivoBloqueoSucursal, puedeCrearOtraSucursal } from "./rules";

const base = { activas: 1, maxSucursales: null, cubiertas: null };

describe("puedeCrearOtraSucursal", () => {
  it("la primera sucursal nunca exige nada", () => {
    expect(puedeCrearOtraSucursal({ activas: 0, maxSucursales: 1, cubiertas: 1 })).toBe(true);
  });

  it("sin topes permite otra", () => {
    expect(puedeCrearOtraSucursal(base)).toBe(true);
  });

  it("Crecimiento permite la segunda pero no la tercera", () => {
    expect(puedeCrearOtraSucursal({ ...base, activas: 1, maxSucursales: 2, cubiertas: 2 })).toBe(true);
    expect(puedeCrearOtraSucursal({ ...base, activas: 2, maxSucursales: 2, cubiertas: 3 })).toBe(false);
  });

  it("respeta la cobertura facturada", () => {
    expect(puedeCrearOtraSucursal({ ...base, activas: 2, cubiertas: 2 })).toBe(false);
    expect(puedeCrearOtraSucursal({ ...base, activas: 1, cubiertas: 2 })).toBe(true);
  });

  it("Profesional: sin tope de plan, la cobertura pagada es el límite", () => {
    expect(puedeCrearOtraSucursal({ ...base, activas: 3, cubiertas: 4 })).toBe(true);
    expect(puedeCrearOtraSucursal({ ...base, activas: 4, cubiertas: 4 })).toBe(false);
  });

  it("aplica ambos topes: el más restrictivo gana", () => {
    const cap = { ...base, activas: 2, maxSucursales: 5, cubiertas: 2 };
    expect(puedeCrearOtraSucursal(cap)).toBe(false);
  });
});

describe("motivoBloqueoSucursal", () => {
  it("menciona Profesional cuando se alcanza el máximo del plan", () => {
    expect(motivoBloqueoSucursal({ ...base, activas: 2, maxSucursales: 2 })).toContain("Profesional");
  });

  it("menciona el máximo del plan cuando se alcanza", () => {
    expect(motivoBloqueoSucursal({ ...base, activas: 3, maxSucursales: 3 })).toContain("3 sucursal");
  });

  it("pide ampliar cobertura cuando solo falta facturación", () => {
    expect(motivoBloqueoSucursal({ ...base, activas: 2, cubiertas: 2 })).toContain("cobertura");
  });
});
