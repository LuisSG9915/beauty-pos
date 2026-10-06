import { sql } from "drizzle-orm";

import type { getDatabase } from "@/db/client";

/**
 * Consulta fusionada del reporte "Qué comprar" (plan 12): UN `db.execute` por
 * sucursal que devuelve una fila por producto activo con todo lo que las
 * funciones puras de `reabastecimiento.ts` necesitan.
 *
 * - `salidas30`/`salidas90`: suma neta de `movimientos_inventario` con tipo
 *   `venta|consumo|devolucion` (cantidad con signo; `greatest(0, -Σ)` porque las
 *   devoluciones restan demanda). `entrada`, `salida` manual y `ajuste` no
 *   cuentan como demanda.
 * - `enCamino`: piezas pedidas en compras `borrador|por_verificar` (plan 10 —
 *   no hay estado "en camino"; se descuenta lo ya capturado pendiente de
 *   recibir).
 * - Los cálculos (velocidad, cobertura, sugerido, prioridad) se hacen en
 *   TypeScript con las funciones puras — aquí solo se traen los insumos.
 */

export type ReabastoRow = {
  producto_id: string;
  nombre: string;
  sku: string | null;
  tipo: string;
  costo: number;
  precio_venta: number;
  stock_minimo: number;
  stock: number;
  salidas30: number;
  salidas90: number;
  en_camino: number;
  creado_at: string | Date;
};

type ReabastoDb = Pick<ReturnType<typeof getDatabase>, "execute">;

export async function cargarReabastecimiento(
  db: ReabastoDb,
  params: { organizacionId: string; sucursalId: string },
): Promise<ReabastoRow[]> {
  const { organizacionId, sucursalId } = params;

  const { rows } = await db.execute<ReabastoRow>(sql`
    with salidas as (
      select m.producto_id,
             greatest(0, -coalesce(sum(m.cantidad::numeric)
               filter (where m.created_at >= now() - interval '30 days'), 0)) as salidas30,
             greatest(0, -coalesce(sum(m.cantidad::numeric), 0)) as salidas90
        from movimientos_inventario m
       where m.organizacion_id = ${organizacionId}
         and m.sucursal_id = ${sucursalId}
         and m.tipo in ('venta', 'consumo', 'devolucion')
         and m.created_at >= now() - interval '90 days'
       group by m.producto_id
    ),
    en_camino as (
      select d.producto_id, sum(d.cantidad::numeric) as cantidad
        from detalle_compras d
        join compras c on c.id = d.compra_id
       where c.organizacion_id = ${organizacionId}
         and c.sucursal_id = ${sucursalId}
         and c.activo
         and c.estado in ('borrador', 'por_verificar')
         and d.activo
         and d.producto_id is not null
       group by d.producto_id
    )
    select p.id as producto_id,
           p.nombre,
           p.sku,
           p.tipo,
           p.costo::float8 as costo,
           p.precio_venta::float8 as precio_venta,
           p.stock_minimo::float8 as stock_minimo,
           coalesce(i.stock_actual::float8, 0) as stock,
           coalesce(s.salidas30::float8, 0) as salidas30,
           coalesce(s.salidas90::float8, 0) as salidas90,
           coalesce(e.cantidad::float8, 0) as en_camino,
           p.created_at as creado_at
      from productos p
      left join inventario_stock i
        on i.producto_id = p.id
       and i.sucursal_id = ${sucursalId}
       and i.organizacion_id = ${organizacionId}
      left join salidas s on s.producto_id = p.id
      left join en_camino e on e.producto_id = p.id
     where p.organizacion_id = ${organizacionId}
       and p.activo
     order by p.nombre
  `);

  return rows;
}
