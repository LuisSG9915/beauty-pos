import { describe, expect, it } from "vitest";

import {
  fichaInsumoSchema,
  formatearResumenFormula,
  obtenerConsumosInventario,
} from "./formulas";

describe("expedientes / formulas", () => {
  it("valida un insumo correctamente con Zod", () => {
    const valido = {
      id: "insumo-1",
      productoId: "b80e4635-c3f2-45e0-82dc-3fe67b93a201",
      nombre: "Igora Royal 7.1",
      cantidad: 40,
      unidad: "g",
      proporcion: "1:1",
      descontarStock: true,
    };
    const parsed = fichaInsumoSchema.safeParse(valido);
    expect(parsed.success).toBe(true);
  });

  it("rechaza insumos con cantidad no positiva o unidad inválida", () => {
    const invalido = {
      id: "insumo-1",
      nombre: "Tinte",
      cantidad: 0,
      unidad: "kilos",
    };
    const parsed = fichaInsumoSchema.safeParse(invalido);
    expect(parsed.success).toBe(false);
  });

  it("formatea el resumen de fórmula a partir de insumos", () => {
    const insumos = [
      {
        id: "1",
        nombre: "Igora Royal 7.1",
        cantidad: 40,
        unidad: "g" as const,
        proporcion: "1:1",
      },
      {
        id: "2",
        nombre: "Peróxido 20 Vol",
        cantidad: 40,
        unidad: "ml" as const,
      },
    ];

    const resumen = formatearResumenFormula(insumos);
    expect(resumen).toBe("Igora Royal 7.1 (40 g) [1:1] + Peróxido 20 Vol (40 ml)");
  });

  it("combina insumos con notas de fórmula libre si se proporcionan", () => {
    const insumos = [
      {
        id: "1",
        nombre: "Decolorante Blondme",
        cantidad: 30,
        unidad: "g" as const,
      },
    ];
    const resumen = formatearResumenFormula(insumos, "Aplicar en raíces primero");
    expect(resumen).toBe("Decolorante Blondme (30 g) · Aplicar en raíces primero");
  });

  it("degrada limpiamente a texto libre si no hay insumos estructurados", () => {
    const resumen = formatearResumenFormula([], "Fórmula clásica 8.1 con 20 vol");
    expect(resumen).toBe("Fórmula clásica 8.1 con 20 vol");
  });

  it("filtra insumos marcados para descuento de inventario", () => {
    const insumos = [
      {
        id: "1",
        productoId: "b80e4635-c3f2-45e0-82dc-3fe67b93a201",
        nombre: "Igora Royal 7.1",
        cantidad: 60,
        unidad: "g" as const,
        descontarStock: true,
      },
      {
        id: "2",
        nombre: "Shampoo neutro genérico",
        cantidad: 15,
        unidad: "ml" as const,
        descontarStock: false,
      },
      {
        id: "3",
        productoId: "a10e4635-c3f2-45e0-82dc-3fe67b93a202",
        nombre: "Olaplex Nº 1",
        cantidad: 3.75,
        unidad: "ml" as const,
        descontarStock: true,
      },
    ];

    const consumos = obtenerConsumosInventario(insumos);
    expect(consumos).toHaveLength(2);
    expect(consumos[0]).toEqual({
      productoId: "b80e4635-c3f2-45e0-82dc-3fe67b93a201",
      cantidad: 60,
      nombre: "Igora Royal 7.1",
    });
    expect(consumos[1]).toEqual({
      productoId: "a10e4635-c3f2-45e0-82dc-3fe67b93a202",
      cantidad: 3.75,
      nombre: "Olaplex Nº 1",
    });
  });
});
