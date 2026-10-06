import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { organizaciones } from "@/db/schema/core";

const mediaAuditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
};

export const MEDIO_ENTIDADES = ["producto", "servicio", "ficha", "compra", "mobiliario"] as const;
export type MedioEntidad = (typeof MEDIO_ENTIDADES)[number];

// Archivos de imagen almacenados en R2 (bucket `melena-media`, binding MEDIA).
// `claveR2` es la llave del objeto: `{orgId}/{entidad}/{entidadId}/{uuid}.{ext}`
// — incluir la org en la llave permite validar pertenencia con un lookup barato
// antes de servir. `principal` marca la imagen principal de la entidad para
// soportar galerías futuras; productos/servicios además apuntan con
// `imagen_principal_id`. Las fichas técnicas guardan las llaves en su
// `fotos jsonb` (el medio es la fuente de verdad del objeto).
export const medios = pgTable(
  "medios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    entidad: varchar("entidad", { length: 20 }).notNull(),
    entidadId: uuid("entidad_id").notNull(),
    claveR2: varchar("clave_r2", { length: 500 }).notNull(),
    mime: varchar("mime", { length: 80 }).notNull(),
    bytes: integer("bytes").notNull(),
    ancho: integer("ancho"),
    alto: integer("alto"),
    principal: boolean("principal").default(false).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...mediaAuditColumns,
  },
  (table) => [
    uniqueIndex("medios_clave_r2_uq").on(table.claveR2),
    index("medios_organizacion_idx").on(table.organizacionId),
    index("medios_entidad_idx").on(table.entidad, table.entidadId),
    check(
      "medios_entidad_chk",
      sql`${table.entidad} in ('producto','servicio','ficha','compra','mobiliario')`,
    ),
  ],
);
