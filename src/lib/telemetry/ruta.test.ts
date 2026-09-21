import { describe, expect, it } from "vitest";

import { moduloDeRuta, normalizarRuta } from "./ruta";

describe("normalizarRuta", () => {
  it("quita query y hash", () => {
    expect(normalizarRuta("/admin/pos?organizationId=x#y")).toBe("/admin/pos");
  });

  it("sustituye UUIDs por [id]", () => {
    expect(
      normalizarRuta("/admin/clientes/8f3a2b1c-4d5e-4f6a-9b8c-0d1e2f3a4b5c"),
    ).toBe("/admin/clientes/[id]");
  });

  it("sustituye ids largos (tokens de gestión)", () => {
    expect(normalizarRuta("/mi-cita/ab12cd34ef56gh78ij90")).toBe("/mi-cita/[id]");
  });

  it("conserva segmentos normales", () => {
    expect(normalizarRuta("/admin/agenda")).toBe("/admin/agenda");
  });
});

describe("moduloDeRuta", () => {
  it.each([
    ["/admin/pos", "pos"],
    ["/admin/ventas", "pos"],
    ["/admin/caja", "caja"],
    ["/admin/agenda", "agenda"],
    ["/admin/mi-dia", "agenda"],
    ["/reservar/mi-salon", "reservas"],
    ["/mi-cita/abc", "reservas"],
    ["/login", "auth"],
    ["/admin/reportes", "admin"],
    ["/otra", "otro"],
  ])("%s → %s", (ruta, modulo) => {
    expect(moduloDeRuta(ruta)).toBe(modulo);
  });
});
