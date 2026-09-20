import { describe, expect, it } from "vitest";

import { resolverLineasDevolucion } from "./devoluciones";

const ticketBase = {
  servicio: [
    { id: "sv1", cantidad: 2, precio: "300.00" },
    { id: "sv2", cantidad: 1, precio: "150.00" },
  ],
  producto: [{ id: "pr1", cantidad: 3, precio: "100.00", productoId: "prod-1" }],
  paquete: [{ id: "pq1", cantidad: 1, precio: "900.00", paqueteId: "paq-1" }],
  membresia: [{ id: "mb1", cantidad: 1, precio: "500.00", membresiaId: "mem-1" }],
};

function resolver(overrides: Partial<Parameters<typeof resolverLineasDevolucion>[0]> = {}) {
  return resolverLineasDevolucion({
    solicitadas: [{ tipo: "servicio", detalleId: "sv1", cantidad: 1 }],
    ticketPorTipo: ticketBase,
    devueltasPrevias: new Map(),
    serviciosCubiertosPorPaquete: new Set(),
    factorNeto: 1,
    ...overrides,
  });
}

describe("resolverLineasDevolucion", () => {
  it("devolución parcial de servicio calcula el monto prorrateado", () => {
    const r = resolver();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.montoDevuelto).toBe(300);
      expect(r.resueltas[0]).toMatchObject({ cantidad: 1, monto: 300, completa: false });
    }
  });

  it("devolución completa marca la línea como completa", () => {
    const r = resolver({ solicitadas: [{ tipo: "servicio", detalleId: "sv2", cantidad: 1 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resueltas[0].completa).toBe(true);
  });

  it("rechaza devolver más de lo pendiente", () => {
    const r = resolver({ solicitadas: [{ tipo: "servicio", detalleId: "sv1", cantidad: 3 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Solo quedan 2 pieza(s)");
  });

  it("descuenta lo ya devuelto en devoluciones anteriores", () => {
    const r = resolver({
      solicitadas: [{ tipo: "servicio", detalleId: "sv1", cantidad: 2 }],
      devueltasPrevias: new Map([["sv1", 1]]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Solo quedan 1 pieza(s)");
  });

  it("permite completar exactamente lo pendiente tras devoluciones previas", () => {
    const r = resolver({
      solicitadas: [{ tipo: "servicio", detalleId: "sv1", cantidad: 1 }],
      devueltasPrevias: new Map([["sv1", 1]]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.montoDevuelto).toBe(300);
  });

  it("rechaza una línea que no pertenece al ticket", () => {
    const r = resolver({ solicitadas: [{ tipo: "servicio", detalleId: "otro", cantidad: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya no pertenece a la venta");
  });

  it("producto devuelto conserva su productoId para revertir stock", () => {
    const r = resolver({ solicitadas: [{ tipo: "producto", detalleId: "pr1", cantidad: 2 }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.montoDevuelto).toBe(200);
      expect(r.resueltas[0].productoId).toBe("prod-1");
    }
  });

  it("servicio cubierto por paquete no regresa dinero y marca restauración", () => {
    const r = resolver({ serviciosCubiertosPorPaquete: new Set(["sv1"]) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.montoDevuelto).toBe(0);
      expect(r.huboRestauracion).toBe(true);
      expect(r.resueltas[0].cubiertaPorPaquete).toBe(true);
    }
  });

  it("descuento global prorratea el monto devuelto (factorNeto)", () => {
    const r = resolver({ factorNeto: 0.8 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.montoDevuelto).toBe(240);
  });

  it("rechaza una devolución con monto cero y sin restauración", () => {
    const r = resolverLineasDevolucion({
      solicitadas: [{ tipo: "servicio", detalleId: "sv1", cantidad: 1 }],
      ticketPorTipo: { ...ticketBase, servicio: [{ id: "sv1", cantidad: 2, precio: "0.00" }] },
      devueltasPrevias: new Map(),
      serviciosCubiertosPorPaquete: new Set(),
      factorNeto: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("mayor a cero");
  });

  it("resuelve varias líneas de distintos tipos a la vez", () => {
    const r = resolver({
      solicitadas: [
        { tipo: "servicio", detalleId: "sv2", cantidad: 1 },
        { tipo: "producto", detalleId: "pr1", cantidad: 1 },
        { tipo: "membresia", detalleId: "mb1", cantidad: 1 },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.montoDevuelto).toBe(750);
      expect(r.resueltas).toHaveLength(3);
    }
  });
});
