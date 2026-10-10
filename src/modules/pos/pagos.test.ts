import { describe, expect, it } from "vitest";

import { resolverCobroPagos } from "./pagos";

const medios = new Map([
  ["efe", { nombre: "Efectivo", categoria: "efectivo" }],
  ["efe2", { nombre: "Efectivo secundario", categoria: "efectivo" }],
  ["tj", { nombre: "Tarjeta", categoria: "tarjeta" }],
  ["tr", { nombre: "Transferencia", categoria: "transferencia" }],
]);

describe("resolverCobroPagos", () => {
  it("cobro exacto en efectivo no genera cambio", () => {
    const r = resolverCobroPagos({
      pagos: [{ medioPagoId: "efe", monto: 500 }],
      aCubrir: 500,
      mediosPorId: medios,
    });
    expect(r).toMatchObject({ ok: true, cambioTotal: 0 });
    if (r.ok) {
      expect(r.lineas[0]).toMatchObject({ aplicado: 500, recibido: 500, cambio: 0 });
    }
  });

  it("efectivo de más genera cambio y lo aplica es solo lo cubierto", () => {
    const r = resolverCobroPagos({
      pagos: [{ medioPagoId: "efe", monto: 1000 }],
      aCubrir: 735.5,
      mediosPorId: medios,
    });
    expect(r).toMatchObject({ ok: true, cambioTotal: 264.5 });
    if (r.ok) {
      expect(r.lineas[0]).toMatchObject({ aplicado: 735.5, cambio: 264.5 });
    }
  });

  it("pago mixto efectivo + tarjeta exacto es válido", () => {
    const r = resolverCobroPagos({
      pagos: [
        { medioPagoId: "tj", monto: 300, referencia: "A1B2" },
        { medioPagoId: "efe", monto: 200 },
      ],
      aCubrir: 500,
      mediosPorId: medios,
    });
    expect(r).toMatchObject({ ok: true, cambioTotal: 0 });
  });

  it("pago mixto con efectivo de más reparte el cambio solo al efectivo", () => {
    const r = resolverCobroPagos({
      pagos: [
        { medioPagoId: "tj", monto: 300, referencia: "A1B2" },
        { medioPagoId: "efe", monto: 300 },
      ],
      aCubrir: 450,
      mediosPorId: medios,
    });
    expect(r).toMatchObject({ ok: true, cambioTotal: 150 });
    if (r.ok) {
      expect(r.lineas[0]).toMatchObject({ medioPagoId: "tj", aplicado: 300, cambio: 0 });
      expect(r.lineas[1]).toMatchObject({ medioPagoId: "efe", aplicado: 150, cambio: 150 });
    }
  });

  it("el cambio se reparte entre varios pagos en efectivo en orden", () => {
    const r = resolverCobroPagos({
      pagos: [
        { medioPagoId: "efe", monto: 100 },
        { medioPagoId: "efe2", monto: 100 },
      ],
      aCubrir: 150,
      mediosPorId: medios,
    });
    expect(r).toMatchObject({ ok: true, cambioTotal: 50 });
    if (r.ok) {
      expect(r.lineas[0]).toMatchObject({ aplicado: 50, cambio: 50 });
      expect(r.lineas[1]).toMatchObject({ aplicado: 100, cambio: 0 });
    }
  });

  it("tarjeta por encima del total se rechaza: no puede generar cambio", () => {
    const r = resolverCobroPagos({
      pagos: [{ medioPagoId: "tj", monto: 600, referencia: "OK" }],
      aCubrir: 500,
      mediosPorId: medios,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("exceden el total");
  });

  it("solo tarjeta con monto inexacto menor también se rechaza", () => {
    const r = resolverCobroPagos({
      pagos: [{ medioPagoId: "tj", monto: 400, referencia: "OK" }],
      aCubrir: 500,
      mediosPorId: medios,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("debe ser exacto");
  });

  it("medio no efectivo sin referencia se acepta como opcional", () => {
    const r = resolverCobroPagos({
      pagos: [{ medioPagoId: "tr", monto: 500 }],
      aCubrir: 500,
      mediosPorId: medios,
    });
    expect(r.ok).toBe(true);
  });

  it("medio desconocido se rechaza", () => {
    const r = resolverCobroPagos({
      pagos: [{ medioPagoId: "inexistente", monto: 100 }],
      aCubrir: 100,
      mediosPorId: medios,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no es válido");
  });

  it("sin pagos y con saldo a cubrir se rechaza", () => {
    const r = resolverCobroPagos({ pagos: [], aCubrir: 250, mediosPorId: medios });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Falta cubrir 250.00");
  });

  it("total ya cubierto (anticipo/paquete) no acepta pagos adicionales", () => {
    const r = resolverCobroPagos({
      pagos: [{ medioPagoId: "efe", monto: 50 }],
      aCubrir: 0,
      mediosPorId: medios,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya está cubierto");
  });

  it("total cero sin pagos es un cobro válido", () => {
    const r = resolverCobroPagos({ pagos: [], aCubrir: 0, mediosPorId: medios });
    expect(r).toMatchObject({ ok: true, cambioTotal: 0, lineas: [] });
  });

  it("montos con centavos se redondean correctamente", () => {
    const r = resolverCobroPagos({
      pagos: [
        { medioPagoId: "tj", monto: 99.99, referencia: "X" },
        { medioPagoId: "efe", monto: 50.51 },
      ],
      aCubrir: 150.5,
      mediosPorId: medios,
    });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      const aplicado = r.lineas.reduce((s, l) => s + l.aplicado, 0);
      expect(aplicado).toBeCloseTo(150.5, 2);
    }
  });
});
