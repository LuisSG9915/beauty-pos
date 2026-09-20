import { describe, expect, it } from "vitest";

import { motivoBloqueoCancelacion } from "./cancelacion";

describe("motivoBloqueoCancelacion", () => {
  it("permite cancelar cuando no hay beneficios usados en otra venta", () => {
    expect(
      motivoBloqueoCancelacion({
        paqueteTieneUsosExternos: false,
        membresiaTieneAplicacionExterna: false,
      }),
    ).toBeNull();
  });

  it("bloquea cancelar un paquete usado en otra venta", () => {
    expect(
      motivoBloqueoCancelacion({
        paqueteTieneUsosExternos: true,
        membresiaTieneAplicacionExterna: false,
      }),
    ).toContain("paquete vendido");
  });

  it("bloquea cancelar una membresía aplicada en otra venta", () => {
    expect(
      motivoBloqueoCancelacion({
        paqueteTieneUsosExternos: false,
        membresiaTieneAplicacionExterna: true,
      }),
    ).toContain("membresía vendida");
  });
});
