import { sql, type SQL } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { kvDelete, kvGetJson, kvPutJson } from "@/lib/kv-cache";

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
  por_agotarse: number | null;
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

  // IN con parámetros sueltos en vez de `any($array)`: drizzle aplana arrays
  // de un elemento y pg los manda como escalar, lo que rompe con "array must
  // be enclosed in { and }" (22P02) en cuentas con una sola sucursal.
  const enSucursales = (columna: SQL) =>
    sucursalIds
      ? sql`and ${columna} in (${sql.join(sucursalIds.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

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
      // Plan 12: queda menos de una semana de stock al ritmo de salidas netas
      // (venta+consumo−devolución) de los últimos 7 días. Las salidas se
      // agregan una sola vez y se emparejan por producto+sucursal.
      sql`(select count(*)::int from inventario_stock i
        join productos p on i.producto_id = p.id
        join (
          select m.producto_id, m.sucursal_id,
                 greatest(0, -coalesce(sum(m.cantidad::numeric), 0)) as salidas7
            from movimientos_inventario m
           where m.organizacion_id = ${organizacionId}
             and m.tipo in ('venta','consumo','devolucion')
             and m.created_at >= ${hace7d}
             ${enSucursales(sql`m.sucursal_id`)}
           group by m.producto_id, m.sucursal_id
        ) s on s.producto_id = i.producto_id and s.sucursal_id = i.sucursal_id
        where i.organizacion_id = ${organizacionId} and p.activo
          and i.stock_actual > 0 and i.stock_actual < s.salidas7
          ${enSucursales(sql`i.sucursal_id`)}) as por_agotarse`,
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
  empujar(row.por_agotarse, {
    clave: "por_agotarse",
    titulo: "Productos por agotarse esta semana",
    href: "/inventario/reabastecer",
    tono: "advertencia",
  });

  return alertas;
}

const PERMISOS_ALERTAS_DEFAULT = new Set(["agenda.ver", "caja.ver", "inventario.ver"]);

/**
 * Obtiene las alertas operativas activas con caché de lectura en KV (TTL 60s).
 */
export async function obtenerAlertasActivas(
  organizacionId: string,
  sucursalId?: string | null,
  permisos?: ReadonlySet<string>,
): Promise<AlertaOperativa[]> {
  const cacheKey = `alertas:${organizacionId}:${sucursalId ?? "all"}`;
  const cached = await kvGetJson<AlertaOperativa[]>(cacheKey);
  if (cached !== null) return cached;

  const db = getDatabase();
  const alertas = await cargarAlertas(db, {
    organizacionId,
    sucursalIds: sucursalId ? [sucursalId] : null,
    permisos: permisos ?? PERMISOS_ALERTAS_DEFAULT,
  });

  await kvPutJson(cacheKey, alertas, { expirationTtl: 60 });
  return alertas;
}

/**
 * Invalida la caché de alertas de la sucursal o de toda la organización en KV.
 */
export async function invalidarCacheAlertas(
  organizacionId: string,
  sucursalId?: string,
): Promise<void> {
  await kvDelete(`alertas:${organizacionId}:${sucursalId ?? "all"}`);
  if (sucursalId) {
    await kvDelete(`alertas:${organizacionId}:all`);
  }
}

