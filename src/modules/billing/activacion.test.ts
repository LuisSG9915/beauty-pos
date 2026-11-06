import { describe, expect, it } from "vitest";

import { formatearMinutos, percentil, resumenActivacion } from "./activacion";

const t0 = new Date("2026-11-01T10:00:00Z");
const enMinutos = (minutos: number) => new Date(t0.getTime() + minutos * 60_000);

describe("percentil", () => {
  it("usa el rango más cercano", () => {
    expect(percentil([1, 2, 3, 4], 50)).toBe(2);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentil([], 50)).toBeNull();
  });
});

describe("resumenActivacion", () => {
  it("mide los minutos desde el registro hasta la primera venta", () => {
    expect(
      resumenActivacion([
        { creadaAt: t0, activa: true, primeraVentaAt: enMinutos(4) },
        { creadaAt: t0, activa: true, primeraVentaAt: enMinutos(25) },
        { creadaAt: t0, activa: true, primeraVentaAt: enMinutos(10) },
      ]),
    ).toEqual({ conPrimeraVenta: 3, sinPrimerCobro: 0, medianaMinutos: 10, p90Minutos: 25, pctHasta10Min: 67 });
  });

  it("no cuenta en la proporción a los negocios sin venta y cuenta aparte a los activos sin cobro", () => {
    expect(
      resumenActivacion([
        { creadaAt: t0, activa: true, primeraVentaAt: enMinutos(5) },
        { creadaAt: t0, activa: true, primeraVentaAt: null },
        { creadaAt: t0, activa: false, primeraVentaAt: null },
      ]),
    ).toEqual({ conPrimeraVenta: 1, sinPrimerCobro: 1, medianaMinutos: 5, p90Minutos: 5, pctHasta10Min: 100 });
  });

  it("trata un desfase de reloj como cero minutos", () => {
    expect(resumenActivacion([{ creadaAt: t0, activa: true, primeraVentaAt: enMinutos(-3) }]).medianaMinutos).toBe(0);
  });

  it("sin ventas no inventa cifras", () => {
    expect(resumenActivacion([{ creadaAt: t0, activa: true, primeraVentaAt: null }])).toEqual({
      conPrimeraVenta: 0,
      sinPrimerCobro: 1,
      medianaMinutos: null,
      p90Minutos: null,
      pctHasta10Min: null,
    });
  });
});

describe("formatearMinutos", () => {
  it("escribe minutos, horas o días según la magnitud", () => {
    expect(formatearMinutos(null)).toBe("—");
    expect(formatearMinutos(4.2)).toBe("4 min");
    expect(formatearMinutos(90)).toBe("2 h");
    expect(formatearMinutos(1440)).toBe("1 día");
    expect(formatearMinutos(2880)).toBe("2 días");
  });
});
