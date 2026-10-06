import { describe, expect, it } from "vitest";

import { borradorProductoIaSchema } from "@/lib/ia/esquemas";

const BORRADOR_VALIDO = {
  nombre: "Shampoo reparador",
  marca: "Elvive",
  contenido: "400 ml",
  descripcion: "Uso diario",
  codigoBarras: "7501234567890",
  categoriaSugerida: "Shampoo",
  precioEtiqueta: 129.5,
  camposDudosos: ["contenido"],
};

describe("borradorProductoIaSchema", () => {
  it("acepta el borrador completo y recorta strings", () => {
    const salida = borradorProductoIaSchema.parse({
      ...BORRADOR_VALIDO,
      nombre: "  Shampoo reparador  ",
    });
    expect(salida).toEqual(BORRADOR_VALIDO);
  });

  it("acepta todos los campos en null (foto ilegible)", () => {
    const salida = borradorProductoIaSchema.parse({
      nombre: null,
      marca: null,
      contenido: null,
      descripcion: null,
      codigoBarras: null,
      categoriaSugerida: null,
      precioEtiqueta: null,
      camposDudosos: [],
    });
    expect(salida.nombre).toBeNull();
    expect(salida.camposDudosos).toEqual([]);
  });

  it("convierte strings vacíos en null", () => {
    const salida = borradorProductoIaSchema.parse({
      ...BORRADOR_VALIDO,
      marca: "   ",
    });
    expect(salida.marca).toBeNull();
  });

  it("rechaza campos requeridos faltantes o con tipo incorrecto", () => {
    expect(() =>
      borradorProductoIaSchema.parse({ ...BORRADOR_VALIDO, precioEtiqueta: "129" }),
    ).toThrow();
    expect(() =>
      borradorProductoIaSchema.parse({ ...BORRADOR_VALIDO, nombre: undefined }),
    ).toThrow();
    const sinDudosos: Record<string, unknown> = { ...BORRADOR_VALIDO };
    delete sinDudosos.camposDudosos;
    expect(() => borradorProductoIaSchema.parse(sinDudosos)).toThrow();
  });

  it("rechaza propiedades extra (espejo de additionalProperties:false)", () => {
    expect(() =>
      borradorProductoIaSchema.parse({ ...BORRADOR_VALIDO, sorpresa: "x" }),
    ).toThrow();
  });

  it("rechaza strings más largos que el tope y más de 8 dudosos", () => {
    expect(() =>
      borradorProductoIaSchema.parse({ ...BORRADOR_VALIDO, nombre: "x".repeat(121) }),
    ).toThrow();
    expect(() =>
      borradorProductoIaSchema.parse({
        ...BORRADOR_VALIDO,
        camposDudosos: Array.from({ length: 9 }, (_, i) => `c${i}`),
      }),
    ).toThrow();
  });

  it("rechaza precioEtiqueta negativo", () => {
    expect(() =>
      borradorProductoIaSchema.parse({ ...BORRADOR_VALIDO, precioEtiqueta: -5 }),
    ).toThrow();
  });
});
