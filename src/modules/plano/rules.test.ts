import { describe, expect, it } from "vitest";

import {
  cabeEnPiso,
  elementosFueraDelPiso,
  primerEspacioLibre,
  rectsOverlap,
  validarColocacion,
  type ElementoPlano,
} from "./rules";

const el = (id: string, x: number, y: number, ancho = 2, alto = 1): ElementoPlano => ({
  id,
  x,
  y,
  ancho,
  alto,
});

describe("rectsOverlap", () => {
  it("detecta traslape parcial y total", () => {
    expect(rectsOverlap(el("a", 0, 0, 2, 2), el("b", 1, 1, 2, 2))).toBe(true);
    expect(rectsOverlap(el("a", 0, 0, 4, 4), el("b", 1, 1, 1, 1))).toBe(true);
  });

  it("tocarse en el borde NO es traslape (rectángulos semiabiertos)", () => {
    expect(rectsOverlap(el("a", 0, 0, 2, 1), el("b", 2, 0, 2, 1))).toBe(false);
    expect(rectsOverlap(el("a", 0, 0, 2, 1), el("b", 0, 1, 2, 1))).toBe(false);
    // Solo comparten una esquina.
    expect(rectsOverlap(el("a", 0, 0, 2, 2), el("b", 2, 2, 2, 2))).toBe(false);
  });

  it("elementos separados no se traslapan", () => {
    expect(rectsOverlap(el("a", 0, 0), el("b", 5, 5))).toBe(false);
  });
});

describe("cabeEnPiso", () => {
  it("acepta un elemento dentro de la cuadrícula", () => {
    expect(cabeEnPiso({ x: 0, y: 0, ancho: 2, alto: 1 }, 24, 16)).toBe(true);
    expect(cabeEnPiso({ x: 22, y: 14, ancho: 2, alto: 2 }, 24, 16)).toBe(true);
  });

  it("rechaza salirse por la derecha o por abajo", () => {
    expect(cabeEnPiso({ x: 23, y: 0, ancho: 2, alto: 1 }, 24, 16)).toBe(false);
    expect(cabeEnPiso({ x: 0, y: 15, ancho: 1, alto: 2 }, 24, 16)).toBe(false);
  });

  it("rechaza coordenadas negativas y tamaños menores a 1", () => {
    expect(cabeEnPiso({ x: -1, y: 0, ancho: 2, alto: 1 }, 24, 16)).toBe(false);
    expect(cabeEnPiso({ x: 0, y: -1, ancho: 2, alto: 1 }, 24, 16)).toBe(false);
    expect(cabeEnPiso({ x: 0, y: 0, ancho: 0, alto: 1 }, 24, 16)).toBe(false);
    expect(cabeEnPiso({ x: 0, y: 0, ancho: 2, alto: 0 }, 24, 16)).toBe(false);
  });

  it("rechaza celdas no enteras", () => {
    expect(cabeEnPiso({ x: 0.5, y: 0, ancho: 2, alto: 1 }, 24, 16)).toBe(false);
    expect(cabeEnPiso({ x: 0, y: 0, ancho: 1.5, alto: 1 }, 24, 16)).toBe(false);
  });
});

describe("validarColocacion", () => {
  const piso = { columnas: 10, filas: 8 };
  const ocupados = [el("u1", 0, 0, 2, 2), el("m1", 4, 0, 2, 1)];

  it("acepta un rectángulo en celda libre", () => {
    expect(
      validarColocacion({ rect: { x: 6, y: 4, ancho: 2, alto: 1 }, ...piso, elementos: ocupados }),
    ).toEqual([]);
  });

  it("rechaza salirse del piso", () => {
    const violaciones = validarColocacion({
      rect: { x: 9, y: 0, ancho: 2, alto: 1 },
      ...piso,
      elementos: ocupados,
    });
    expect(violaciones.map((v) => v.codigo)).toContain("fuera_de_piso");
  });

  it("rechaza encimarse con otro elemento (ubicación o mueble)", () => {
    const violaciones = validarColocacion({
      rect: { x: 1, y: 1, ancho: 2, alto: 1 },
      ...piso,
      elementos: ocupados,
    });
    expect(violaciones).toEqual([
      expect.objectContaining({ codigo: "encimado", conflictoId: "u1" }),
    ]);
  });

  it("ignora al propio elemento al moverlo (misma posición no es traslape)", () => {
    expect(
      validarColocacion({
        rect: { x: 0, y: 0, ancho: 2, alto: 2 },
        ...piso,
        elementos: ocupados,
        ignorarId: "u1",
      }),
    ).toEqual([]);
  });
});

describe("elementosFueraDelPiso", () => {
  it("lista los elementos que la reducción dejaría fuera", () => {
    const elementos = [el("a", 0, 0), el("b", 8, 0), el("c", 0, 10)];
    expect(elementosFueraDelPiso(8, 8, elementos).map((e) => e.id)).toEqual(["b", "c"]);
    expect(elementosFueraDelPiso(10, 11, elementos)).toEqual([]);
  });
});

describe("primerEspacioLibre", () => {
  it("devuelve el origen cuando el piso está vacío", () => {
    expect(primerEspacioLibre({ columnas: 24, filas: 16, elementos: [] })).toEqual({ x: 0, y: 0 });
  });

  it("salta los elementos ocupados en orden de lectura", () => {
    const ocupados = [el("a", 0, 0, 2, 1), el("b", 2, 0, 2, 1)];
    expect(primerEspacioLibre({ columnas: 6, filas: 4, elementos: ocupados })).toEqual({ x: 4, y: 0 });
  });

  it("baja de fila cuando la primera está llena", () => {
    const ocupados = [el("a", 0, 0, 6, 1)];
    expect(
      primerEspacioLibre({ columnas: 6, filas: 4, elementos: ocupados, ancho: 2, alto: 1 }),
    ).toEqual({ x: 0, y: 1 });
  });

  it("devuelve null cuando el piso está lleno", () => {
    const ocupados = [el("a", 0, 0, 4, 4)];
    expect(primerEspacioLibre({ columnas: 4, filas: 4, elementos: ocupados })).toBeNull();
  });
});
