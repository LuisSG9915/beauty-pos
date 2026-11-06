import { describe, expect, it } from "vitest";

import { resolverAyudaRuta } from "./ayuda-contextual";

describe("resolverAyudaRuta", () => {
  it("lleva el cobro y la caja al modo práctica", () => {
    expect(resolverAyudaRuta("/admin/pos")).toBe("/practica");
    expect(resolverAyudaRuta("/admin/caja")).toBe("/practica");
  });

  it("lleva agenda, clientes, servicios, productos y reportes a la guía", () => {
    expect(resolverAyudaRuta("/admin/agenda")).toBe("/guia");
    expect(resolverAyudaRuta("/admin/clientes/0fc0bede-0ea9-4c46-ba36-b6062d9c2e63")).toBe("/guia");
    expect(resolverAyudaRuta("/admin/servicios")).toBe("/guia");
    expect(resolverAyudaRuta("/admin/productos")).toBe("/guia");
    expect(resolverAyudaRuta("/admin/reportes")).toBe("/guia");
  });

  it("usa la ayuda general en el resto del panel", () => {
    expect(resolverAyudaRuta("/admin")).toBe("/ayuda");
    expect(resolverAyudaRuta("/admin/roles")).toBe("/ayuda");
    expect(resolverAyudaRuta("/admin/compras/abc")).toBe("/ayuda");
  });

  it("no muestra ayuda en herramientas de plataforma ni fuera del panel", () => {
    expect(resolverAyudaRuta("/admin/incidentes")).toBeNull();
    expect(resolverAyudaRuta("/admin/incidentes/abc")).toBeNull();
    expect(resolverAyudaRuta("/admin/telemetria")).toBeNull();
    expect(resolverAyudaRuta("/precios")).toBeNull();
    expect(resolverAyudaRuta("/reservar/estetica")).toBeNull();
  });
});
