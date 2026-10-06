import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";

type InventarioDb = Pick<ReturnType<typeof getDatabase>, "execute">;

export type InventarioPanelKpis = {
  /** Σ stock × costo de los productos activos dentro del alcance. */
  valorTotal: number;
  /** Productos con existencias pero por debajo de su stock mínimo. */
  bajoMinimo: number;
  /** Productos activos sin existencias en el alcance. */
  sinStock: number;
  /** Productos activos considerados en el panel. */
  productos: number;
};

export type InventarioPanelStock = {
  id: string;
  nombre: string;
  /** Stock agregado del alcance (suma por sucursal en vista "Todas"). */
  stock: number;
  minimo: number;
  /** stock × costo en el alcance, calculado en SQL. */
  valor: number;
  /** Detalle por sucursal (para expandir la vista "Todas"); null sin filas. */
  porSucursal: Array<{ sucursal: string; stock: number }> | null;
};

export type InventarioPanelCategoria = { categoria: string; valor: number };

export type InventarioPanel = {
  kpis: InventarioPanelKpis;
  topStock: InventarioPanelStock[];
  valorCategoria: InventarioPanelCategoria[];
  /** Σ |cantidad| × costo de los movimientos de los últimos 30 días. */
  valorMovimiento30d: number;
};

type InventarioPanelRow = {
  kpis: InventarioPanelKpis | null;
  top_stock: InventarioPanelStock[] | null;
  valor_categoria: InventarioPanelCategoria[] | null;
  valor_movimiento_30d: string | number | null;
};

/**
 * Panel del inventario en UNA consulta: KPIs, top de stock vs mínimo y valor
 * por categoría viajan como subselects escalares/jsonb sobre un mismo CTE de
 * alcance (`scope` = sucursales visibles del usuario). Los valores monetarios
 * se calculan en SQL (`stock × costo`), no fila a fila en JS — la regla del
 * proyecto penaliza cada round-trip extra a la BD remota (~50-100 ms).
 *
 * `sucursalIds` es el alcance YA acotado (la sucursal activa o todas las del
 * acceso); la agregación por producto hace que "Todas" sume existencias sin
 * duplicar renglones.
 */
export async function cargarPanelInventario(
  db: InventarioDb,
  params: { organizacionId: string; sucursalIds: readonly string[]; topN?: number },
): Promise<InventarioPanel> {
  const { organizacionId, sucursalIds, topN = 8 } = params;
  const ids = [...sucursalIds];

  const { rows } = await db.execute<InventarioPanelRow>(sql`
    with scope as (
      select i.producto_id, i.sucursal_id, su.nombre as sucursal, i.stock_actual::numeric as stock
        from inventario_stock i
        join sucursales su on su.id = i.sucursal_id
       where i.organizacion_id = ${organizacionId}
         and i.sucursal_id = any(${ids})
    ),
    por_producto as (
      select p.id, p.nombre,
             p.stock_minimo::numeric as minimo,
             p.costo::numeric as costo,
             coalesce(cp.nombre, 'Sin categoría') as categoria,
             coalesce(sum(s.stock), 0)::numeric as stock,
             jsonb_agg(jsonb_build_object('sucursal', s.sucursal, 'stock', s.stock) order by s.sucursal)
               filter (where s.producto_id is not null) as por_sucursal
        from productos p
        left join cat_categorias_productos cp on cp.id = p.categoria_id
        left join scope s on s.producto_id = p.id
       where p.organizacion_id = ${organizacionId} and p.activo
       group by p.id, cp.nombre
    )
    select
      (select jsonb_build_object(
          'valorTotal', coalesce(sum(stock * costo), 0),
          'bajoMinimo', count(*) filter (where stock > 0 and stock < minimo)::int,
          'sinStock', count(*) filter (where stock <= 0)::int,
          'productos', count(*)::int
        ) from por_producto) as kpis,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', t.id, 'nombre', t.nombre,
            'stock', t.stock, 'minimo', t.minimo,
            'valor', t.valor, 'porSucursal', t.por_sucursal
          ) order by t.valor desc, t.nombre)
          from (
            select id, nombre, stock, minimo, costo, stock * costo as valor, por_sucursal
              from por_producto
             order by stock * costo desc, nombre
             limit ${topN}
          ) t
      ), '[]'::jsonb) as top_stock,
      coalesce((
        select jsonb_agg(jsonb_build_object('categoria', t.categoria, 'valor', t.valor)
                         order by t.valor desc, t.categoria)
          from (
            select categoria, sum(stock * costo) as valor
              from por_producto
             group by categoria
            having sum(stock * costo) > 0
          ) t
      ), '[]'::jsonb) as valor_categoria,
      (select coalesce(sum(abs(mi.cantidad::numeric) * p.costo::numeric), 0)
         from movimientos_inventario mi
         join productos p on p.id = mi.producto_id
        where mi.organizacion_id = ${organizacionId}
          and mi.sucursal_id = any(${ids})
          and mi.created_at >= now() - interval '30 days') as valor_movimiento_30d
  `);

  const row = rows[0];
  return {
    kpis: row?.kpis ?? { valorTotal: 0, bajoMinimo: 0, sinStock: 0, productos: 0 },
    topStock: row?.top_stock ?? [],
    valorCategoria: row?.valor_categoria ?? [],
    valorMovimiento30d: Number(row?.valor_movimiento_30d ?? 0),
  };
}
