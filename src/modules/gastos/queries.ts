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
  const { rows } = await db.execute<{
    confirmado: string;
    revertido: string;
    por_categoria: Array<{ nombre: string; total: string }>;
  }>(sql`
    select
      coalesce(sum(g.importe) filter (where g.estado = 'confirmado'), 0)::text as confirmado,
      coalesce(sum(g.importe) filter (where g.estado = 'revertido'), 0)::text as revertido,
      coalesce((
        select jsonb_agg(t) from (
          select
            coalesce(cg.nombre, 'Sin categoría') as nombre,
            coalesce(sum(g2.importe), 0)::text as total
          from gastos g2
          left join cat_categorias_gastos cg on cg.id = g2.categoria_id
          where g2.organizacion_id = ${filtro.organizacionId}
            ${filtro.sucursalId ? sql`and g2.sucursal_id = ${filtro.sucursalId}` : sql``}
            and g2.fecha_gasto >= ${filtro.desde}
            and g2.fecha_gasto <= ${filtro.hasta}
            and g2.estado = 'confirmado'
          group by cg.nombre
          order by sum(g2.importe) desc
        ) t
      ), '[]'::jsonb) as por_categoria
    from gastos g
    where g.organizacion_id = ${filtro.organizacionId}
      ${filtro.sucursalId ? sql`and g.sucursal_id = ${filtro.sucursalId}` : sql``}
      and g.fecha_gasto >= ${filtro.desde}
      and g.fecha_gasto <= ${filtro.hasta}
  `);

  const row = rows[0];
  return {
    totalConfirmado: Number(row?.confirmado ?? 0),
    totalRevertido: Number(row?.revertido ?? 0),
    porCategoria: (row?.por_categoria ?? []).map((item) => ({
      nombre: item.nombre,
      total: Number(item.total),
    })),
  };
}
