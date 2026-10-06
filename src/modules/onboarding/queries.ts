import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { servicios } from "@/db/schema/catalogs";
import { miembrosOrganizaciones, sucursales } from "@/db/schema/core";
import { citas, horariosSucursales, ventas } from "@/db/schema/operations";
import { progresoGuias } from "@/db/schema/onboarding";
import type { EstadoGuia, EstadoNegocio } from "./types";
import { GUIA_CONFIGURACION, GUIA_VERSION } from "./types";

type Db = ReturnType<typeof getDatabase>;

async function contar(db: Db, query: Promise<{ total: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.total ?? 0;
}

/**
 * Señales reales del negocio para evaluar el checklist de la guía.
 * Las consultas son independientes y se lanzan en paralelo.
 */
export async function cargarEstadoNegocio(
  db: Db,
  organizacionId: string,
  sucursalId: string,
): Promise<EstadoNegocio> {
  const conteo = sql<number>`count(*)::int`;
  const [serviciosActivos, horariosActivos, miembrosActivos, citasRegistradas, ventasCobradas, sucursalRow] =
    await Promise.all([
      contar(
        db,
        db
          .select({ total: conteo })
          .from(servicios)
          .where(and(eq(servicios.organizacionId, organizacionId), eq(servicios.activo, true))),
      ),
      contar(
        db,
        db
          .select({ total: conteo })
          .from(horariosSucursales)
          .where(
            and(
              eq(horariosSucursales.organizacionId, organizacionId),
              eq(horariosSucursales.sucursalId, sucursalId),
              eq(horariosSucursales.activo, true),
            ),
          ),
      ),
      contar(
        db,
        db
          .select({ total: conteo })
          .from(miembrosOrganizaciones)
          .where(
            and(
              eq(miembrosOrganizaciones.organizacionId, organizacionId),
              eq(miembrosOrganizaciones.estado, "activo"),
            ),
          ),
      ),
      contar(
        db,
        db
          .select({ total: conteo })
          .from(citas)
          .where(
            and(
              eq(citas.organizacionId, organizacionId),
              eq(citas.sucursalId, sucursalId),
              eq(citas.activo, true),
            ),
          ),
      ),
      contar(
        db,
        db
          .select({ total: conteo })
          .from(ventas)
          .where(
            and(
              eq(ventas.organizacionId, organizacionId),
              eq(ventas.sucursalId, sucursalId),
              eq(ventas.activo, true),
              eq(ventas.estado, "completada"),
            ),
          ),
      ),
      // Nombre de la sucursal del contexto: el paso "nombre_sucursal" se
      // completa cuando deja de ser el genérico "Sucursal principal".
      db
        .select({ nombre: sucursales.nombre })
        .from(sucursales)
        .where(eq(sucursales.id, sucursalId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
  return {
    serviciosActivos,
    horariosActivos,
    miembrosActivos,
    citasRegistradas,
    ventasCobradas,
    sucursalNombre: sucursalRow?.nombre ?? null,
  };
}

export type ProgresoGuiaRow = {
  estado: EstadoGuia;
  pasoActual: number;
};

/** Último estado guardado de la guía; `null` si nunca se ha interactuado. */
export async function cargarProgresoGuia(
  db: Db,
  organizacionId: string,
  usuarioId: string,
): Promise<ProgresoGuiaRow | null> {
  const [row] = await db
    .select({ estado: progresoGuias.estado, pasoActual: progresoGuias.pasoActual })
    .from(progresoGuias)
    .where(
      and(
        eq(progresoGuias.organizacionId, organizacionId),
        eq(progresoGuias.usuarioId, usuarioId),
        eq(progresoGuias.guiaClave, GUIA_CONFIGURACION),
        eq(progresoGuias.guiaVersion, GUIA_VERSION),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { estado: row.estado as EstadoGuia, pasoActual: row.pasoActual };
}
