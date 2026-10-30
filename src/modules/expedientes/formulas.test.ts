import { describe, expect, it } from "vitest";

import {
  construirResumenFormulaRapida,
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

  describe("construirResumenFormulaRapida", () => {
    it("construye resumen completo con mezcla, peróxido, tiempo de pose y matiz", () => {
      const resumen = construirResumenFormulaRapida({
        id: "ficha-123",
        creadoEn: "2025-09-12T15:30:00.000Z",
        mezcla: "Tinte 7.1",
        peroxido: "20 vol",
        tiempoPoseMinutos: 45,
        matiz: "Matiz 9.2",
      });

      expect(resumen.id).toBe("ficha-123");
      expect(resumen.fechaCorta).toBe("12-sep");
      expect(resumen.formulaCompleta).toBe("Tinte 7.1 + 20 vol (45 min) — Matiz 9.2");
      expect(resumen.textoPastilla).toBe("12-sep: Tinte 7.1 + 20 vol (45 min) — Matiz 9.2");
    });

    it("funciona con Date object y omite campos opcionales no proporcionados", () => {
      const resumen = construirResumenFormulaRapida({
        id: "ficha-456",
        creadoEn: new Date(2025, 8, 12),
        mezcla: "Decoloración global",
      });

      expect(resumen.id).toBe("ficha-456");
      expect(resumen.fechaCorta).toBe("12-sep");
      expect(resumen.formulaCompleta).toBe("Decoloración global");
      expect(resumen.textoPastilla).toBe("12-sep: Decoloración global");
    });

    it("maneja mezclas con peróxido pero sin tiempo ni matiz", () => {
      const resumen = construirResumenFormulaRapida({
        id: "ficha-789",
        creadoEn: "2025-09-12",
        mezcla: "Tinte 5.0",
        peroxido: "10 vol",
      });

      expect(resumen.fechaCorta).toBe("12-sep");
      expect(resumen.formulaCompleta).toBe("Tinte 5.0 + 10 vol");
      expect(resumen.textoPastilla).toBe("12-sep: Tinte 5.0 + 10 vol");
    });
  });
});
