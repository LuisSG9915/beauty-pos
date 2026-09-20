import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { usuarios } from "@/db/schema/core";
import { catCategoriasGastos, gastos } from "@/db/schema/finance";

type Db = ReturnType<typeof getDatabase>;

export type FiltroGastos = {
  organizacionId: string;
  sucursalId: string;
  /** Rango sobre `fecha_gasto` (YYYY-MM-DD), ambos incluidos. */
  desde: string;
  hasta: string;
  estado?: "confirmado" | "revertido";
  categoriaId?: string;
};

export type GastoRow = {
  id: string;
  concepto: string;
  fechaGasto: string;
  importe: string;
  estado: string;
  proveedor: string | null;
  referencia: string | null;
  notas: string | null;
  categoria: string | null;
  medio: string;
  medioCategoria: string;
  cajaVinculada: boolean;
  registradoPor: string | null;
  motivoReversion: string | null;
  createdAt: Date;
};

/** Lista paginada de gastos con nombres de catálogo resueltos. */
export async function listarGastos(
  db: Db,
  filtro: FiltroGastos,
  opciones: { page: number; pageSize: number },
): Promise<{ rows: GastoRow[]; hasMore: boolean }> {
  const conditions = [
    eq(gastos.organizacionId, filtro.organizacionId),
    eq(gastos.sucursalId, filtro.sucursalId),
    gte(gastos.fechaGasto, filtro.desde),
    lte(gastos.fechaGasto, filtro.hasta),
  ];
  if (filtro.estado) conditions.push(eq(gastos.estado, filtro.estado));
  if (filtro.categoriaId) conditions.push(eq(gastos.categoriaId, filtro.categoriaId));

  const rows = await db
    .select({
      id: gastos.id,
      concepto: gastos.concepto,
      fechaGasto: gastos.fechaGasto,
      importe: gastos.importe,
      estado: gastos.estado,
      proveedor: gastos.proveedor,
      referencia: gastos.referencia,
      notas: gastos.notas,
      categoria: catCategoriasGastos.nombre,
      medio: catMediosPago.nombre,
      medioCategoria: catMediosPago.categoria,
      cajaVinculada: sql<boolean>`${gastos.movimientoCajaId} is not null`,
      registradoPor: usuarios.nombre,
      motivoReversion: gastos.motivoReversion,
      createdAt: gastos.createdAt,
    })
    .from(gastos)
    .leftJoin(catCategoriasGastos, eq(gastos.categoriaId, catCategoriasGastos.id))
    .innerJoin(catMediosPago, eq(gastos.medioPagoId, catMediosPago.id))
    .leftJoin(usuarios, eq(gastos.usuarioId, usuarios.id))
    .where(and(...conditions))
    .orderBy(desc(gastos.fechaGasto), desc(gastos.createdAt))
    .limit(opciones.pageSize + 1)
    .offset((opciones.page - 1) * opciones.pageSize);

  return { rows: rows.slice(0, opciones.pageSize), hasMore: rows.length > opciones.pageSize };
}

export type ResumenGastos = {
  /** Solo gastos confirmados: lo que realmente salió del negocio. */
  totalConfirmado: number;
  totalRevertido: number;
  porCategoria: Array<{ nombre: string; total: number }>;
};

/** Totales del periodo para el listado y para el reporte financiero. */
export async function resumenGastos(
  db: Db,
  filtro: Pick<FiltroGastos, "organizacionId" | "desde" | "hasta"> & {
    /** null = consolidado de toda la organización. */
    sucursalId: string | null;
  },
): Promise<ResumenGastos> {
  const scope = () =>
    and(
      eq(gastos.organizacionId, filtro.organizacionId),
      filtro.sucursalId ? eq(gastos.sucursalId, filtro.sucursalId) : undefined,
      gte(gastos.fechaGasto, filtro.desde),
      lte(gastos.fechaGasto, filtro.hasta),
    );

  const [totales, porCategoria] = await Promise.all([
    db
      .select({
        confirmado: sql<string>`coalesce(sum(${gastos.importe}) filter (where ${gastos.estado} = 'confirmado'), 0)`,
        revertido: sql<string>`coalesce(sum(${gastos.importe}) filter (where ${gastos.estado} = 'revertido'), 0)`,
      })
      .from(gastos)
      .where(scope()),
    db
      .select({
        nombre: sql<string>`coalesce(${catCategoriasGastos.nombre}, 'Sin categoría')`,
        total: sql<string>`coalesce(sum(${gastos.importe}), 0)`,
      })
      .from(gastos)
      .leftJoin(catCategoriasGastos, eq(gastos.categoriaId, catCategoriasGastos.id))
      .where(and(scope(), eq(gastos.estado, "confirmado")))
      .groupBy(catCategoriasGastos.nombre)
      .orderBy(desc(sql`sum(${gastos.importe})`)),
  ]);

  return {
    totalConfirmado: Number(totales[0]?.confirmado ?? 0),
    totalRevertido: Number(totales[0]?.revertido ?? 0),
    porCategoria: porCategoria.map((row) => ({ nombre: row.nombre, total: Number(row.total) })),
  };
}
