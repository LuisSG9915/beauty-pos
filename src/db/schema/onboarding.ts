import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { organizaciones, usuarios } from "@/db/schema/core";

/**
 * Progreso de las guías de primera experiencia por usuario/organización.
 * El checklist de "qué falta" se deriva de los datos reales del negocio;
 * esta tabla solo guarda si la persona omitió, terminó o va a mitad de la
 * guía, para no volver a mostrarla en cada inicio de sesión.
 */
export const progresoGuias = pgTable(
  "progreso_guias",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    guiaClave: varchar("guia_clave", { length: 60 }).notNull(),
    guiaVersion: integer("guia_version").notNull(),
    pasoActual: integer("paso_actual").default(0).notNull(),
    estado: varchar("estado", { length: 20 }).default("en_progreso").notNull(),
    iniciadaAt: timestamp("iniciada_at", { withTimezone: true }).defaultNow().notNull(),
    actualizadaAt: timestamp("actualizada_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    terminadaAt: timestamp("terminada_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("progreso_guias_usuario_uq").on(
      table.usuarioId,
      table.organizacionId,
      table.guiaClave,
      table.guiaVersion,
    ),
    index("progreso_guias_organizacion_idx").on(table.organizacionId),
    check("progreso_guias_estado_chk", sql`${table.estado} in ('en_progreso', 'completada', 'omitida')`),
    check("progreso_guias_paso_chk", sql`${table.pasoActual} >= 0`),
  ],
);

/**
 * Hitos de producto que no se pueden deducir de los datos del negocio
 * (p. ej. «la guía fue omitida»). Los atributos son mínimos y nunca deben
 * incluir datos personales de clientes ni contenido operativo.
 */
export const eventosProducto = pgTable(
  "eventos_producto",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").references(() => organizaciones.id),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    atributos: jsonb("atributos"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("eventos_producto_organizacion_fecha_idx").on(table.organizacionId, table.createdAt),
    index("eventos_producto_nombre_idx").on(table.nombre),
  ],
);
