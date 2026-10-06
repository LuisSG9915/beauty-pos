import { describe, expect, it } from "vitest";

import { MEDIO_ENTIDADES } from "@/db/schema/media";
import {
  claveMediaR2,
  extensionPorMime,
  MEDIO_MAX_BYTES,
  MEDIO_MIMES,
  PERMISO_POR_ENTIDAD,
  urlMedio,
} from "@/lib/media";

describe("media helpers", () => {
  it("mapea mimes aceptados a extensiones", () => {
    expect(extensionPorMime("image/jpeg")).toBe("jpg");
    expect(extensionPorMime("image/png")).toBe("png");
    expect(extensionPorMime("image/webp")).toBe("webp");
    expect(extensionPorMime("image/gif")).toBeNull();
    expect(extensionPorMime("image/svg+xml")).toBeNull();
    expect(extensionPorMime("application/pdf")).toBeNull();
  });

  it("acepta solo jpg/png/webp hasta 5 MB", () => {
    expect(MEDIO_MIMES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(MEDIO_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("construye la llave R2 con org/entidad/entidadId/archivo", () => {
    const clave = claveMediaR2("org-1", "producto", "prod-9", "abc123.webp");
    expect(clave).toBe("org-1/producto/prod-9/abc123.webp");
    expect(clave.split("/")).toHaveLength(4);
  });

  it("expone un permiso de escritura por cada entidad soportada", () => {
    for (const entidad of MEDIO_ENTIDADES) {
      expect(PERMISO_POR_ENTIDAD[entidad]).toBeTruthy();
    }
    expect(PERMISO_POR_ENTIDAD.producto).toBe("catalogos.editar");
    expect(PERMISO_POR_ENTIDAD.servicio).toBe("catalogos.editar");
  });

  it("genera la URL de servicio bajo /api/medios", () => {
    expect(urlMedio("org/producto/id/abc.webp")).toBe(
      "/api/medios/org/producto/id/abc.webp",
    );
  });
});
