import { sql, type SQL } from "drizzle-orm";

import { getDatabase } from "@/db/client";

/**
 * Tablero central de alertas operativas del negocio. Cada alerta es un
 * conteo accionable con enlace al módulo que la resuelve; las señales se
 * calculan por sucursal visible y solo se incluyen si el usuario tiene el
 * permiso del módulo correspondiente (no se filtra la existencia de datos
 * que no puede ver).
 */

export type AlertaOperativa = {
  clave: string;
  titulo: string;
  cantidad: number;
  /** Ruta del módulo que resuelve la alerta (sin parámetros de contexto). */
  href: `/${string}`;
  tono: "advertencia" | "critico";
};

type AlertasDb = Pick<ReturnType<typeof getDatabase>, "execute">;

type AlertasRow = {
  citas_pendientes: number | null;
  citas_sin_profesional: number | null;
  avisos_fallidos: number | null;
  corte_sin_cerrar: number | null;
  diferencias_caja: number | null;
  stock_bajo: number | null;
};

/**
 * Todas las señales en UNA consulta con subselects escalares: antes eran
 * hasta 7 queries paralelas que saturaban el pool y encolaban conexiones
 * frías; con la BD remota cada ronda cuesta ~50-100 ms. Los subselects solo
 * se incluyen cuando el usuario tiene el permiso del módulo (la columna
 * queda en `null` si no aplica).
 */
export async function cargarAlertas(
  db: AlertasDb,
  params: {
    organizacionId: string;
    /** Sucursales visibles; null = alcance de toda la organización. */
    sucursalIds: string[] | null;
    permisos: ReadonlySet<string>;
  },
): Promise<AlertaOperativa[]> {
  const { organizacionId, sucursalIds, permisos } = params;
  if (sucursalIds !== null && sucursalIds.length === 0) return [];

  const ahora = new Date();
  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60_000);
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60_000);
  const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60_000);

  const enSucursales = (columna: SQL) =>
    sucursalIds ? sql`and ${columna} = any(${sucursalIds})` : sql``;

  const columnas: SQL[] = [];
  if (permisos.has("agenda.ver")) {
    columnas.push(
      sql`(select count(*)::int from citas c
        where c.organizacion_id = ${organizacionId} and c.activo
          and c.estado = 'pendiente' and c.fecha_hora >= ${ahora}
          ${enSucursales(sql`c.sucursal_id`)}) as citas_pendientes`,
      sql`(select count(*)::int from citas c
        where c.organizacion_id = ${organizacionId} and c.activo
          and c.usuario_id is null and c.fecha_hora >= ${ahora}
          and c.fecha_hora < ${en24h}
          and c.estado in ('pendiente','confirmada')
          ${enSucursales(sql`c.sucursal_id`)}) as citas_sin_profesional`,
      sql`(select count(*)::int from notificaciones_envios n
        where n.organizacion_id = ${organizacionId}
          and n.estado = 'fallido' and n.created_at >= ${hace7d}) as avisos_fallidos`,
    );
  }
  if (permisos.has("caja.ver")) {
    columnas.push(
      sql`(select count(*)::int from cortes_caja cc
        where cc.organizacion_id = ${organizacionId} and cc.activo
          and cc.estado = 'abierto' and cc.created_at < ${hace24h}
          ${enSucursales(sql`cc.sucursal_id`)}) as corte_sin_cerrar`,
      sql`(select count(*)::int from (
          select d.corte_id
            from detalle_cortes d
            join cortes_caja cc2 on d.corte_id = cc2.id
           where cc2.organizacion_id = ${organizacionId} and d.activo
             and d.created_at >= ${hace7d}
             ${enSucursales(sql`cc2.sucursal_id`)}
           group by d.corte_id
          having abs(coalesce(sum(d.diferencia), 0)::numeric) >= 0.005
        ) t) as diferencias_caja`,
    );
  }
  if (permisos.has("inventario.ver")) {
    columnas.push(
      sql`(select count(*)::int from inventario_stock i
        join productos p on i.producto_id = p.id
        where i.organizacion_id = ${organizacionId} and p.activo
          and p.stock_minimo > 0 and i.stock_actual <= p.stock_minimo
          ${enSucursales(sql`i.sucursal_id`)}) as stock_bajo`,
    );
  }

  if (columnas.length === 0) return [];

  const { rows } = await db.execute<AlertasRow>(
    sql`select ${sql.join(columnas, sql`, `)}`,
  );
  const row = rows[0] ?? {};

  const alertas: AlertaOperativa[] = [];
  const empujar = (cantidad: number | null | undefined, alerta: Omit<AlertaOperativa, "cantidad">) => {
    if ((cantidad ?? 0) > 0) alertas.push({ ...alerta, cantidad: cantidad! });
  };

  empujar(row.citas_pendientes, {
    clave: "citas_pendientes",
    titulo: "Reservas por confirmar",
    href: "/agenda",
    tono: "advertencia",
  });
  empujar(row.citas_sin_profesional, {
    clave: "citas_sin_profesional",
    titulo: "Citas próximas sin profesional",
    href: "/agenda",
    tono: "advertencia",
  });
  empujar(row.avisos_fallidos, {
    clave: "avisos_fallidos",
    titulo: "Avisos de correo fallidos (7 días)",
    href: "/agenda",
    tono: "critico",
  });
  empujar(row.corte_sin_cerrar, {
    clave: "corte_sin_cerrar",
    titulo: "Turno de caja sin cerrar (>24 h)",
    href: "/caja",
    tono: "critico",
  });
  empujar(row.diferencias_caja, {
    clave: "diferencias_caja",
    titulo: "Cortes con diferencia (7 días)",
    href: "/caja",
    tono: "critico",
  });
  empujar(row.stock_bajo, {
    clave: "stock_bajo",
    titulo: "Productos bajo el mínimo",
    href: "/inventario",
    tono: "advertencia",
  });

  return alertas;
}
