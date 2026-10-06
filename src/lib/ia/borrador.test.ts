import { describe, expect, it } from "vitest";

import {
  CAMPO_FORM_POR_CAMPO_IA,
  componerNombreSugerido,
  fusionarBorrador,
  normalizarCodigoBarras,
  normalizarTexto,
  resolverCategoriaId,
} from "@/lib/ia/borrador";

describe("normalizarCodigoBarras", () => {
  it("acepta largos válidos (8, 12, 13, 14 dígitos)", () => {
    expect(normalizarCodigoBarras("12345678")).toBe("12345678");
    expect(normalizarCodigoBarras("123456789012")).toBe("123456789012");
    expect(normalizarCodigoBarras("7501234567890")).toBe("7501234567890");
    expect(normalizarCodigoBarras("12345678901234")).toBe("12345678901234");
  });

  it("conserva solo dígitos (quita espacios y guiones)", () => {
    expect(normalizarCodigoBarras("7501 2345 6789 0")).toBe("7501234567890");
    expect(normalizarCodigoBarras("750-1234-5678-90")).toBe("7501234567890");
  });

  it("rechaza largos inválidos y no-strings", () => {
    expect(normalizarCodigoBarras("123")).toBeNull();
    expect(normalizarCodigoBarras("12345678901")).toBeNull();
    expect(normalizarCodigoBarras("123456789012345")).toBeNull();
    expect(normalizarCodigoBarras("")).toBeNull();
    expect(normalizarCodigoBarras("abc")).toBeNull();
    expect(normalizarCodigoBarras(null)).toBeNull();
    expect(normalizarCodigoBarras(undefined)).toBeNull();
    expect(normalizarCodigoBarras(7501234567890)).toBeNull();
  });
});

describe("normalizarTexto", () => {
  it("minúsculas, sin acentos, espacios colapsados", () => {
    expect(normalizarTexto("  Shámpoo   Reparador ")).toBe("shampoo reparador");
    expect(normalizarTexto("UÑAS")).toBe("unas");
  });
});

describe("resolverCategoriaId", () => {
  const categorias = [
    { id: "cat-1", nombre: "Shampoo" },
    { id: "cat-2", nombre: "Tintes y color" },
    { id: "cat-3", nombre: "Herramientas" },
  ];

  it("resuelve por igualdad normalizada", () => {
    expect(resolverCategoriaId("shampoo", categorias)).toBe("cat-1");
    expect(resolverCategoriaId("SHAMPOO", categorias)).toBe("cat-1");
  });

  it("resuelve por inclusión en cualquier dirección", () => {
    // sugerida ⊂ nombre de la categoría
    expect(resolverCategoriaId("Tinte", categorias)).toBe("cat-2");
    // nombre de la categoría ⊂ sugerida
    expect(resolverCategoriaId("Shampoo hidratante", categorias)).toBe("cat-1");
  });

  it("devuelve null sin sugerencia o sin coincidencia", () => {
    expect(resolverCategoriaId(null, categorias)).toBeNull();
    expect(resolverCategoriaId("", categorias)).toBeNull();
    expect(resolverCategoriaId("Muebles", categorias)).toBeNull();
  });
});

describe("componerNombreSugerido", () => {
  it("une nombre + marca + contenido (ejemplo del plan)", () => {
    expect(
      componerNombreSugerido(["Shampoo reparador", "Elvive", "400 ml"]),
    ).toBe("Shampoo reparador Elvive 400 ml");
  });

  it("no repite palabras ya contenidas (marca dentro del nombre)", () => {
    expect(
      componerNombreSugerido(["Shampoo Elvive reparador", "Elvive", "400 ml"]),
    ).toBe("Shampoo Elvive reparador 400 ml");
  });

  it("omite partes nulas o vacías", () => {
    expect(componerNombreSugerido([null, "Elvive", null])).toBe("Elvive");
    expect(componerNombreSugerido([null, null, null])).toBeNull();
    expect(componerNombreSugerido([])).toBeNull();
  });
});

describe("fusionarBorrador", () => {
  it("rellena solo campos vacíos y no pisa lo escrito a mano", () => {
    const actual = { nombre: "Ya escrito", descripcion: "", codigoBarras: "  " };
    const { valores, aplicados } = fusionarBorrador(actual, {
      nombre: "Shampoo Elvive 400 ml",
      descripcion: "Uso diario",
      codigoBarras: "7501234567890",
    });
    expect(valores.nombre).toBe("Ya escrito");
    expect(valores.descripcion).toBe("Uso diario");
    expect(valores.codigoBarras).toBe("7501234567890");
    expect(aplicados.sort()).toEqual(["codigoBarras", "descripcion"]);
  });

  it("ignora propuestas null o vacías", () => {
    const { valores, aplicados } = fusionarBorrador(
      { nombre: "" },
      { nombre: null },
    );
    expect(valores.nombre).toBe("");
    expect(aplicados).toEqual([]);
  });
});

describe("CAMPO_FORM_POR_CAMPO_IA", () => {
  it("marca y contenido se marcan como dudas en el campo nombre", () => {
    expect(CAMPO_FORM_POR_CAMPO_IA.marca).toBe("nombre");
    expect(CAMPO_FORM_POR_CAMPO_IA.contenido).toBe("nombre");
    expect(CAMPO_FORM_POR_CAMPO_IA.codigoBarras).toBe("codigoBarras");
    expect(CAMPO_FORM_POR_CAMPO_IA.categoriaSugerida).toBe("categoriaId");
    expect(CAMPO_FORM_POR_CAMPO_IA.precioEtiqueta).toBe("precioVenta");
  });
});
