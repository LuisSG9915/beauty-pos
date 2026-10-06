import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { productos } from "@/db/schema/catalogs";
import { organizaciones, sucursales } from "@/db/schema/core";
import { medios } from "@/db/schema/media";
import { recursos } from "@/db/schema/operations";

const planoAuditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
};

export const UBICACION_TIPOS = ["vitrina", "estante", "bodega", "mostrador", "otro"] as const;
export type UbicacionTipo = (typeof UBICACION_TIPOS)[number];

export const MOBILIARIO_TIPOS = ["asiento", "mesa", "tocador", "lavacabezas", "camilla", "carrito", "espejo", "otro"] as const;
export type MobiliarioTipo = (typeof MOBILIARIO_TIPOS)[number];

export const MOBILIARIO_ESTADOS = ["bueno", "mantenimiento", "baja"] as const;
export type MobiliarioEstado = (typeof MOBILIARIO_ESTADOS)[number];

/** Límites de la cuadrícula de un piso (celdas enteras). */
export const PISO_MIN_COLUMNAS = 8;
export const PISO_MAX_COLUMNAS = 60;
export const PISO_MIN_FILAS = 8;
export const PISO_MAX_FILAS = 40;
export const ELEMENTO_MAX_CELDAS = 20;

/**
 * Posición/tamaño en celdas enteras dentro de la cuadrícula del piso
 * (1 celda = 32 px en pantalla). Compartida por `ubicaciones` y `mobiliario`.
 */
const posicion = {
  x: integer("x").default(0).notNull(),
  y: integer("y").default(0).notNull(),
  ancho: integer("ancho").default(2).notNull(),
  alto: integer("alto").default(1).notNull(),
};

/**
 * Pisos del plano de una sucursal ("Planta baja", "Planta alta"…). La
 * cuadrícula es `columnas` × `filas` celdas; reducirla falla si deja elementos
 * fuera (regla validada en `src/modules/plano/rules.ts` y en la acción).
 */
export const pisos = pgTable(
  "pisos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    orden: integer("orden").default(0).notNull(),
    columnas: integer("columnas").default(24).notNull(),
    filas: integer("filas").default(16).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...planoAuditColumns,
  },
  (table) => [
    index("pisos_sucursal_idx").on(table.sucursalId),
    index("pisos_organizacion_idx").on(table.organizacionId),
    check(
      "pisos_tamano_chk",
      sql`${table.columnas} between ${sql.raw(String(PISO_MIN_COLUMNAS))} and ${sql.raw(String(PISO_MAX_COLUMNAS))} and ${table.filas} between ${sql.raw(String(PISO_MIN_FILAS))} and ${sql.raw(String(PISO_MAX_FILAS))}`,
    ),
  ],
);

/**
 * Ubicaciones donde se guarda mercancía (vitrinas, estantes, bodega,
 * mostrador). Ocultan rectángulos de celdas en un piso; dos elementos activos
 * del mismo piso (ubicación o mobiliario) nunca se enciman — se valida en la
 * acción `moverElemento`/`guardarUbicacion`.
 */
export const ubicaciones = pgTable(
  "ubicaciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    pisoId: uuid("piso_id")
      .notNull()
      .references(() => pisos.id),
    tipo: varchar("tipo", { length: 20 }).default("estante").notNull(),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    ...posicion,
    activo: boolean("activo").default(true).notNull(),
    ...planoAuditColumns,
  },
  (table) => [
    index("ubicaciones_piso_idx").on(table.pisoId),
    index("ubicaciones_sucursal_idx").on(table.sucursalId),
    check(
      "ubicaciones_tipo_chk",
      sql`${table.tipo} in ('vitrina','estante','bodega','mostrador','otro')`,
    ),
    check(
      "ubicaciones_pos_chk",
      sql`${table.x} >= 0 and ${table.y} >= 0 and ${table.ancho} between 1 and ${sql.raw(String(ELEMENTO_MAX_CELDAS))} and ${table.alto} between 1 and ${sql.raw(String(ELEMENTO_MAX_CELDAS))}`,
    ),
  ],
);

/**
 * Relación informativa producto ↔ ubicación: cuánto stock del producto se
 * guarda en esa ubicación. NO descuenta ventas ni mueve `inventario_stock` —
 * el stock real sigue por sucursal; la diferencia se muestra como
 * "Sin ubicar".
 */
export const inventarioUbicaciones = pgTable(
  "inventario_ubicaciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    ubicacionId: uuid("ubicacion_id")
      .notNull()
      .references(() => ubicaciones.id),
    productoId: uuid("producto_id")
      .notNull()
      .references(() => productos.id),
    cantidad: numeric("cantidad", { precision: 12, scale: 3 }).default("0").notNull(),
    ...planoAuditColumns,
  },
  (table) => [
    uniqueIndex("inventario_ubicaciones_ubic_prod_uq").on(table.ubicacionId, table.productoId),
    index("inventario_ubicaciones_producto_idx").on(table.productoId),
    index("inventario_ubicaciones_organizacion_idx").on(table.organizacionId),
    check("inventario_ubicaciones_cantidad_chk", sql`${table.cantidad} >= 0`),
  ],
);

/**
 * Mobiliario/activos físicos de la sucursal (asientos, mesas, tocadores…).
 * `pisoId` null = registrado pero aún sin colocar en el plano. `recursoId`
 * enlaza opcionalmente a un recurso agendable de la agenda (una silla de
 * manicura puede ser ambas cosas); no se crea el recurso automáticamente.
 */
export const mobiliario = pgTable(
  "mobiliario",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    pisoId: uuid("piso_id").references(() => pisos.id),
    tipo: varchar("tipo", { length: 20 }).default("otro").notNull(),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    estado: varchar("estado", { length: 20 }).default("bueno").notNull(),
    recursoId: uuid("recurso_id").references(() => recursos.id),
    // El medio puede borrarse por DELETE /api/medios: la referencia se limpia
    // sola en vez de bloquear el borrado (la fila media es desechable).
    fotoId: uuid("foto_id").references(() => medios.id, { onDelete: "set null" }),
    fechaAdquisicion: date("fecha_adquisicion"),
    costo: numeric("costo", { precision: 12, scale: 2 }),
    notas: text("notas"),
    ...posicion,
    activo: boolean("activo").default(true).notNull(),
    ...planoAuditColumns,
  },
  (table) => [
    index("mobiliario_sucursal_idx").on(table.sucursalId),
    index("mobiliario_piso_idx").on(table.pisoId),
    index("mobiliario_organizacion_idx").on(table.organizacionId),
    check(
      "mobiliario_tipo_chk",
      sql`${table.tipo} in ('asiento','mesa','tocador','lavacabezas','camilla','carrito','espejo','otro')`,
    ),
    check("mobiliario_estado_chk", sql`${table.estado} in ('bueno','mantenimiento','baja')`),
    check(
      "mobiliario_pos_chk",
      sql`${table.x} >= 0 and ${table.y} >= 0 and ${table.ancho} between 1 and ${sql.raw(String(ELEMENTO_MAX_CELDAS))} and ${table.alto} between 1 and ${sql.raw(String(ELEMENTO_MAX_CELDAS))}`,
    ),
  ],
);
