import { describe, expect, it } from "vitest";

import { cotizarSuscripcion, planPreciosDesdeFila, type PlanPrecios } from "./precios";

const profesional: PlanPrecios = {
  precioMensual: 899,
  precioAnual: 8990,
  sucursalesIncluidas: 3,
  precioSucursalExtra: 249,
};

const crecimiento: PlanPrecios = {
  precioMensual: 399,
  precioAnual: 3990,
  sucursalesIncluidas: 2,
  precioSucursalExtra: null,
};

describe("cotizarSuscripcion", () => {
  it("cobra solo el precio base dentro de la cobertura incluida", () => {
    const r = cotizarSuscripcion(profesional, { periodicidad: "mensual", sucursalesFacturadas: 3, meses: 1 });
    expect(r).toMatchObject({ ok: true, monto: 899, extras: 0, precioUnitario: 899 });
  });

  it("la cuarta sucursal de Profesional suma el precio del extra", () => {
    const r = cotizarSuscripcion(profesional, { periodicidad: "mensual", sucursalesFacturadas: 4, meses: 1 });
    expect(r).toMatchObject({ ok: true, monto: 899 + 249, extras: 1, precioExtraUnitario: 249 });
  });

  it("varios extras y varios meses multiplican", () => {
    const r = cotizarSuscripcion(profesional, { periodicidad: "mensual", sucursalesFacturadas: 6, meses: 2 });
    expect(r).toMatchObject({ ok: true, monto: (899 + 3 * 249) * 2, extras: 3 });
  });

  it("anual equivale a 10 mensualidades en base y extras", () => {
    const r = cotizarSuscripcion(profesional, { periodicidad: "anual", sucursalesFacturadas: 5, meses: 12 });
    expect(r).toMatchObject({ ok: true, periodos: 1, precioUnitario: 8990, precioExtraUnitario: 2490 });
    if (r.ok) expect(r.monto).toBe(8990 + 2 * 2490);
  });

  it("anual con 24 meses son dos periodos", () => {
    const r = cotizarSuscripcion(profesional, { periodicidad: "anual", sucursalesFacturadas: 3, meses: 24 });
    if (r.ok) expect(r.monto).toBe(8990 * 2);
  });

  it("anual exige meses múltiplos de 12", () => {
    const r = cotizarSuscripcion(profesional, { periodicidad: "anual", sucursalesFacturadas: 3, meses: 6 });
    expect(r).toMatchObject({ ok: false, error: "anual-requiere-12" });
  });

  it("rechaza extras en planes que no los permiten", () => {
    const r = cotizarSuscripcion(crecimiento, { periodicidad: "mensual", sucursalesFacturadas: 3, meses: 1 });
    expect(r).toMatchObject({ ok: false, error: "extras-no-permitidos" });
  });

  it("rechaza anual sin precio anual configurado", () => {
    const r = cotizarSuscripcion(
      { ...crecimiento, precioAnual: null },
      { periodicidad: "anual", sucursalesFacturadas: 2, meses: 12 },
    );
    expect(r).toMatchObject({ ok: false, error: "sin-precio-anual" });
  });

  it("rechaza entradas inválidas", () => {
    expect(cotizarSuscripcion(profesional, { periodicidad: "mensual", sucursalesFacturadas: 0, meses: 1 }).ok).toBe(false);
    expect(cotizarSuscripcion(profesional, { periodicidad: "mensual", sucursalesFacturadas: 3, meses: 0 }).ok).toBe(false);
  });
});

describe("planPreciosDesdeFila", () => {
  it("coerciona los numéricos de la BD (llegan como string)", () => {
    expect(
      planPreciosDesdeFila({
        precioMensual: "899.00",
        precioAnual: "8990.00",
        sucursalesIncluidas: 3,
        precioSucursalExtra: "249.00",
      }),
    ).toEqual({ precioMensual: 899, precioAnual: 8990, sucursalesIncluidas: 3, precioSucursalExtra: 249 });
  });
});
