import { z } from "zod";

import type { FichaInsumo } from "@/db/schema/operations";

export const UNIDADES_INSUMO = ["g", "ml", "oz", "gotas", "unidad"] as const;
export type UnidadInsumo = (typeof UNIDADES_INSUMO)[number];

export const FOTO_ROLES = ["antes", "despues", "proceso"] as const;
export type FotoRol = (typeof FOTO_ROLES)[number];

export const fichaInsumoSchema = z.object({
  id: z.string().min(1),
  productoId: z.string().uuid().optional().nullable(),
  nombre: z.string().trim().min(1, "El nombre del insumo es obligatorio.").max(120),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
  unidad: z.enum(UNIDADES_INSUMO),
  proporcion: z.string().trim().max(30).optional().nullable(),
  descontarStock: z.boolean().optional().default(false),
});

export const fichaFotoDetalleSchema = z.object({
  claveR2: z.string().min(1),
  rol: z.enum(FOTO_ROLES),
});

/**
 * Genera un texto resumen conciso y legible para la fórmula.
 * Mantiene compatibilidad con interfaces históricas que solo leen `formula` en texto plano.
 */
export function formatearResumenFormula(
  insumos: FichaInsumo[],
  formulaTextoLibre?: string | null,
): string {
  if (!insumos || insumos.length === 0) {
    return formulaTextoLibre?.trim() || "";
  }

  const partes = insumos.map((item) => {
    const cant = `${item.cantidad} ${item.unidad}`;
    const prop = item.proporcion?.trim() ? ` [${item.proporcion.trim()}]` : "";
    return `${item.nombre.trim()} (${cant})${prop}`;
  });

  const baseFormula = partes.join(" + ");
  const extra = formulaTextoLibre?.trim();
  if (extra && !baseFormula.toLowerCase().includes(extra.toLowerCase())) {
    return `${baseFormula} · ${extra}`;
  }
  return baseFormula;
}

/**
 * Filtra y agrupa los insumos marcados para descuento de inventario.
 */
export function obtenerConsumosInventario(
  insumos: FichaInsumo[],
): Array<{ productoId: string; cantidad: number; nombre: string }> {
  if (!insumos || insumos.length === 0) return [];

  const consumos: Array<{ productoId: string; cantidad: number; nombre: string }> = [];
  for (const item of insumos) {
    if (item.productoId && item.descontarStock && item.cantidad > 0) {
      consumos.push({
        productoId: item.productoId,
        cantidad: Number(item.cantidad.toFixed(3)),
        nombre: item.nombre.trim(),
      });
    }
  }
  return consumos;
}
