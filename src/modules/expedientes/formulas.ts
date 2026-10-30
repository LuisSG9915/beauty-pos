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

export interface ResumenFormulaRapida {
  id: string;
  fechaCorta: string;
  textoPastilla: string; // Ej: "12-sep: Tinte 7.1 + 20 vol (45 min) — Matiz 9.2"
  formulaCompleta: string;
}

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

export function construirResumenFormulaRapida(registro: {
  id: string;
  creadoEn: Date | string;
  mezcla: string;
  peroxido?: string | null;
  tiempoPoseMinutos?: number | null;
  matiz?: string | null;
}): ResumenFormulaRapida {
  let dia = "";
  let mes = "";

  if (typeof registro.creadoEn === "string") {
    const match = registro.creadoEn.match(/^\d{4}-(\d{2})-(\d{2})/);
    if (match) {
      const mesIndex = Number(match[1]) - 1;
      dia = match[2];
      mes = MESES_CORTOS[mesIndex] ?? "";
    }
  }

  if (!mes) {
    const d = typeof registro.creadoEn === "string" ? new Date(registro.creadoEn) : registro.creadoEn;
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      dia = String(d.getDate()).padStart(2, "0");
      mes = MESES_CORTOS[d.getMonth()] ?? "";
    }
  }

  const fechaCorta = mes ? `${dia}-${mes}` : "";

  let base = registro.mezcla?.trim() || "";
  if (registro.peroxido?.trim()) {
    base = base ? `${base} + ${registro.peroxido.trim()}` : registro.peroxido.trim();
  }
  if (registro.tiempoPoseMinutos && registro.tiempoPoseMinutos > 0) {
    base = base ? `${base} (${registro.tiempoPoseMinutos} min)` : `(${registro.tiempoPoseMinutos} min)`;
  }
  if (registro.matiz?.trim()) {
    base = base ? `${base} — ${registro.matiz.trim()}` : registro.matiz.trim();
  }

  const formulaCompleta = base;
  const textoPastilla = fechaCorta
    ? (formulaCompleta ? `${fechaCorta}: ${formulaCompleta}` : fechaCorta)
    : formulaCompleta;

  return {
    id: registro.id,
    fechaCorta,
    textoPastilla,
    formulaCompleta,
  };
}
