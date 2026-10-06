import { and, eq, sql } from "drizzle-orm";
import type { Column, ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";

type Schema = typeof import("@/db/schema");

/**
 * Largo máximo de las columnas únicas por organización (el más amplio es
 * `productos.sku`, 80). `slugClave` recorta a este tope por defecto; cada
 * catálogo pasa el suyo según el `varchar(n)` de su columna.
 */
export const SLUG_MAX = 80;

/** Conexión usable dentro o fuera de una transacción (mismo criterio que `BillingDb`). */
export type ClaveDb =
  | NodePgDatabase<Schema>
  | NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;

/** Tabla de catálogo con `organizacion_id` y columna única `clave` (o `sku` en productos). */
export type TablaConClave = PgTable & { organizacionId: Column } & (
    | { clave: Column }
    | { sku: Column }
  );

/**
 * Normaliza un nombre a clave de catálogo: minúsculas, sin acentos (NFD +
 * diacríticos fuera), cualquier racha no alfanumérica como un solo `-`,
 * sin guiones al borde y largo acotado a `max`.
 *   "Tónico Facial" → "tonico-facial" · "Corte & Peinado!" → "corte-peinado"
 * Sin caracteres útiles cae en "item"; la unicidad la remata `claveDisponible`.
 */
export function slugClave(nombre: string | null | undefined, max: number = SLUG_MAX): string {
  const slug = (nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, Math.max(1, max))
    .replace(/-+$/g, "");
  return slug || "item";
}

/**
 * Primera clave libre para `base` dentro de la organización: prueba `base`,
 * `base-2`, `base-3`, … recortando siempre al largo de la columna.
 *
 * El índice único `(organizacion_id, clave)` NO filtra por `activo`, así que
 * la búsqueda cubre también filas inactivas; además compara sin distinguir
 * mayúsculas porque hay claves históricas en mayúscula ("CORTE" ocuparía el
 * lugar de "corte"). La carrera entre dos altas simultáneas del mismo nombre
 * la resuelve el índice único: el insert perdedor falla igual que hoy.
 */
export async function claveDisponible(
  db: ClaveDb,
  tabla: TablaConClave,
  organizacionId: string,
  base: string,
  max: number = SLUG_MAX,
): Promise<string> {
  const columna = "clave" in tabla ? tabla.clave : tabla.sku;
  const slug = slugClave(base, max);
  for (let n = 1; ; n += 1) {
    const sufijo = n === 1 ? "" : `-${n}`;
    const candidata = `${slug.slice(0, max - sufijo.length)}${sufijo}`;
    const rows = await db
      .select({ n: sql`1` })
      .from(tabla)
      .where(and(eq(tabla.organizacionId, organizacionId), eq(sql`lower(${columna})`, candidata)))
      .limit(1);
    if (rows.length === 0) return candidata;
  }
}
