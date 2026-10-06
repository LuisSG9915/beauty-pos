import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";

type PlanoDb = Pick<ReturnType<typeof getDatabase>, "execute">;

export type PlanoPiso = {
  id: string;
  nombre: string;
  orden: number;
  columnas: number;
  filas: number;
};

export type PlanoUbicacionProducto = {
  productoId: string;
  nombre: string;
  sku: string;
  /** Cantidad informativa asignada a la ubicación (numeric → text). */
  cantidad: string;
};

export type PlanoUbicacion = {
  id: string;
  pisoId: string;
  tipo: string;
  nombre: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  productos: PlanoUbicacionProducto[];
};

export type PlanoMobiliario = {
  id: string;
  /** null = mueble registrado sin colocar en el plano. */
  pisoId: string | null;
  tipo: string;
  nombre: string;
  estado: string;
  recursoId: string | null;
  recursoNombre: string | null;
  /** Llave R2 de la foto del mueble (se sirve por /api/medios). */
  fotoClaveR2: string | null;
  fotoId: string | null;
  fechaAdquisicion: string | null;
  costo: string | null;
  notas: string | null;
  x: number;
  y: number;
  ancho: number;
  alto: number;
};

export type PlanoProducto = {
  id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  /** Stock real de la sucursal (numeric → text). */
  stock: string;
  /** Σ de lo asignado a ubicaciones del plano (informativo). */
  ubicado: string;
};

export type PlanoRecurso = { id: string; nombre: string; tipo: string };

export type PlanoDatos = {
  pisos: PlanoPiso[];
  ubicaciones: PlanoUbicacion[];
  mobiliario: PlanoMobiliario[];
  productos: PlanoProducto[];
  recursos: PlanoRecurso[];
};

type PlanoRow = {
  pisos: PlanoPiso[] | null;
  ubicaciones: PlanoUbicacion[] | null;
  mobiliario: PlanoMobiliario[] | null;
  productos: PlanoProducto[] | null;
  recursos: PlanoRecurso[] | null;
};

/**
 * Todo el plano de la sucursal en UNA consulta: pisos activos, ubicaciones
 * (con sus productos como jsonb anidado), mobiliario (con nombre del recurso
 * enlazado y llave de la foto), catálogo de productos con stock de la
 * sucursal y total ubicado (para "Sin ubicar"), y recursos activos para el
 * combobox de enlace. La regla del proyecto penaliza cada round-trip a la BD
 * remota (~50-100 ms), así que todo viaja como subselects `jsonb`.
 */
export async function cargarPlano(
  db: PlanoDb,
  params: { organizacionId: string; sucursalId: string },
): Promise<PlanoDatos> {
  const { organizacionId, sucursalId } = params;
  const { rows } = await db.execute<PlanoRow>(sql`
    select
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', p.id, 'nombre', p.nombre, 'orden', p.orden,
            'columnas', p.columnas, 'filas', p.filas
          ) order by p.orden, p.nombre)
          from pisos p
         where p.organizacion_id = ${organizacionId}
           and p.sucursal_id = ${sucursalId}
           and p.activo
      ), '[]'::jsonb) as pisos,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', u.id, 'pisoId', u.piso_id, 'tipo', u.tipo, 'nombre', u.nombre,
            'x', u.x, 'y', u.y, 'ancho', u.ancho, 'alto', u.alto,
            'productos', coalesce((
              select jsonb_agg(jsonb_build_object(
                  'productoId', iu.producto_id, 'nombre', pr.nombre, 'sku', pr.sku,
                  'cantidad', iu.cantidad::text
                ) order by pr.nombre)
                from inventario_ubicaciones iu
                join productos pr on pr.id = iu.producto_id
               where iu.ubicacion_id = u.id
            ), '[]'::jsonb)
          ) order by u.nombre)
          from ubicaciones u
         where u.organizacion_id = ${organizacionId}
           and u.sucursal_id = ${sucursalId}
           and u.activo
      ), '[]'::jsonb) as ubicaciones,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', m.id, 'pisoId', m.piso_id, 'tipo', m.tipo, 'nombre', m.nombre,
            'estado', m.estado,
            'recursoId', m.recurso_id, 'recursoNombre', r.nombre,
            'fotoId', m.foto_id, 'fotoClaveR2', f.clave_r2,
            'fechaAdquisicion', m.fecha_adquisicion,
            'costo', m.costo::text, 'notas', m.notas,
            'x', m.x, 'y', m.y, 'ancho', m.ancho, 'alto', m.alto
          ) order by m.nombre)
          from mobiliario m
          left join recursos r on r.id = m.recurso_id
          left join medios f on f.id = m.foto_id
         where m.organizacion_id = ${organizacionId}
           and m.sucursal_id = ${sucursalId}
           and m.activo
      ), '[]'::jsonb) as mobiliario,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', p.id, 'sku', p.sku, 'nombre', p.nombre,
            'unidad', um.clave,
            'stock', coalesce(st.stock_actual, 0)::text,
            'ubicado', coalesce(ub.total, 0)::text
          ) order by p.nombre)
          from productos p
          left join cat_unidades_medida um on um.id = p.unidad_medida_id
          left join inventario_stock st
            on st.producto_id = p.id and st.sucursal_id = ${sucursalId}
          left join (
            select iu.producto_id, sum(iu.cantidad::numeric) as total
              from inventario_ubicaciones iu
              join ubicaciones u2 on u2.id = iu.ubicacion_id and u2.activo
             where iu.organizacion_id = ${organizacionId}
               and u2.sucursal_id = ${sucursalId}
             group by iu.producto_id
          ) ub on ub.producto_id = p.id
         where p.organizacion_id = ${organizacionId} and p.activo
      ), '[]'::jsonb) as productos,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.nombre, 'tipo', r.tipo)
                         order by r.nombre)
          from recursos r
         where r.organizacion_id = ${organizacionId}
           and r.sucursal_id = ${sucursalId}
           and r.activo
      ), '[]'::jsonb) as recursos
  `);

  const row = rows[0];
  return {
    pisos: row?.pisos ?? [],
    ubicaciones: row?.ubicaciones ?? [],
    mobiliario: row?.mobiliario ?? [],
    productos: row?.productos ?? [],
    recursos: row?.recursos ?? [],
  };
}
