import { and, count, eq, gte, inArray, isNull, lt, sql, sum } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { productos } from "@/db/schema/catalogs";
import {
  citas,
  cortesCaja,
  detalleCortes,
  inventarioStock,
  notificacionesEnvios,
} from "@/db/schema/operations";

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

type AlertasDb = Pick<ReturnType<typeof getDatabase>, "select">;

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

  const alertas: AlertaOperativa[] = [];
  const consultas: Promise<void>[] = [];

  // ---------- Agenda ----------
  if (permisos.has("agenda.ver")) {
    consultas.push(
      db
        .select({ total: count() })
        .from(citas)
        .where(
          and(
            eq(citas.organizacionId, organizacionId),
            eq(citas.activo, true),
            eq(citas.estado, "pendiente"),
            gte(citas.fechaHora, ahora),
            sucursalIds ? inArray(citas.sucursalId, sucursalIds) : undefined,
          ),
        )
        .then(([row]) => {
          if ((row?.total ?? 0) > 0) {
            alertas.push({
              clave: "citas_pendientes",
              titulo: "Reservas por confirmar",
              cantidad: row.total,
              href: "/agenda",
              tono: "advertencia",
            });
          }
        }),
      db
        .select({ total: count() })
        .from(citas)
        .where(
          and(
            eq(citas.organizacionId, organizacionId),
            eq(citas.activo, true),
            isNull(citas.usuarioId),
            gte(citas.fechaHora, ahora),
            lt(citas.fechaHora, en24h),
            sql`${citas.estado} in ('pendiente','confirmada')`,
            sucursalIds ? inArray(citas.sucursalId, sucursalIds) : undefined,
          ),
        )
        .then(([row]) => {
          if ((row?.total ?? 0) > 0) {
            alertas.push({
              clave: "citas_sin_profesional",
              titulo: "Citas próximas sin profesional",
              cantidad: row.total,
              href: "/agenda",
              tono: "advertencia",
            });
          }
        }),
      db
        .select({ total: count() })
        .from(notificacionesEnvios)
        .where(
          and(
            eq(notificacionesEnvios.organizacionId, organizacionId),
            eq(notificacionesEnvios.estado, "fallido"),
            gte(notificacionesEnvios.createdAt, hace7d),
          ),
        )
        .then(([row]) => {
          if ((row?.total ?? 0) > 0) {
            alertas.push({
              clave: "avisos_fallidos",
              titulo: "Avisos de correo fallidos (7 días)",
              cantidad: row.total,
              href: "/agenda",
              tono: "critico",
            });
          }
        }),
    );
  }

  // ---------- Caja ----------
  if (permisos.has("caja.ver")) {
    consultas.push(
      db
        .select({ total: count() })
        .from(cortesCaja)
        .where(
          and(
            eq(cortesCaja.organizacionId, organizacionId),
            eq(cortesCaja.activo, true),
            eq(cortesCaja.estado, "abierto"),
            lt(cortesCaja.createdAt, hace24h),
            sucursalIds ? inArray(cortesCaja.sucursalId, sucursalIds) : undefined,
          ),
        )
        .then(([row]) => {
          if ((row?.total ?? 0) > 0) {
            alertas.push({
              clave: "corte_sin_cerrar",
              titulo: "Turno de caja sin cerrar (>24 h)",
              cantidad: row.total,
              href: "/caja",
              tono: "critico",
            });
          }
        }),
      db
        .select({ corteId: detalleCortes.corteId, diferencia: sum(detalleCortes.diferencia) })
        .from(detalleCortes)
        .innerJoin(cortesCaja, eq(detalleCortes.corteId, cortesCaja.id))
        .where(
          and(
            eq(cortesCaja.organizacionId, organizacionId),
            eq(detalleCortes.activo, true),
            gte(detalleCortes.createdAt, hace7d),
            sucursalIds ? inArray(cortesCaja.sucursalId, sucursalIds) : undefined,
          ),
        )
        .groupBy(detalleCortes.corteId)
        .then((rows) => {
          const conDiferencia = rows.filter(
            (row) => Math.abs(Number(row.diferencia ?? 0)) >= 0.005,
          ).length;
          if (conDiferencia > 0) {
            alertas.push({
              clave: "diferencias_caja",
              titulo: "Cortes con diferencia (7 días)",
              cantidad: conDiferencia,
              href: "/caja",
              tono: "critico",
            });
          }
        }),
    );
  }

  // ---------- Inventario ----------
  if (permisos.has("inventario.ver")) {
    consultas.push(
      db
        .select({ total: count() })
        .from(inventarioStock)
        .innerJoin(productos, eq(inventarioStock.productoId, productos.id))
        .where(
          and(
            eq(inventarioStock.organizacionId, organizacionId),
            eq(productos.activo, true),
            sql`${productos.stockMinimo} > 0`,
            sql`${inventarioStock.stockActual} <= ${productos.stockMinimo}`,
            sucursalIds ? inArray(inventarioStock.sucursalId, sucursalIds) : undefined,
          ),
        )
        .then(([row]) => {
          if ((row?.total ?? 0) > 0) {
            alertas.push({
              clave: "stock_bajo",
              titulo: "Productos bajo el mínimo",
              cantidad: row.total,
              href: "/inventario",
              tono: "advertencia",
            });
          }
        }),
    );
  }

  await Promise.all(consultas);
  return alertas;
}
