import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { miembrosOrganizaciones, organizaciones, sucursales, usuarios } from "@/db/schema/core";

export const catRoles = pgTable(
  "cat_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").references(() => organizaciones.id),
    clave: varchar("clave", { length: 80 }).notNull(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    alcance: varchar("alcance", { length: 30 }).default("organizacion").notNull(),
    esSistema: boolean("es_sistema").default(false).notNull(),
    activo: boolean("activo").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cat_roles_organizacion_clave_uq").on(table.organizacionId, table.clave),
    index("cat_roles_organizacion_idx").on(table.organizacionId),
  ],
);

export const catPermisos = pgTable(
  "cat_permisos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clave: varchar("clave", { length: 120 }).notNull(),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    modulo: varchar("modulo", { length: 80 }).notNull(),
    descripcion: text("descripcion"),
    activo: boolean("activo").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cat_permisos_clave_uq").on(table.clave),
    index("cat_permisos_modulo_idx").on(table.modulo),
  ],
);

export const relRolesPermisos = pgTable(
  "rel_roles_permisos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rolId: uuid("rol_id")
      .notNull()
      .references(() => catRoles.id),
    permisoId: uuid("permiso_id")
      .notNull()
      .references(() => catPermisos.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("rel_roles_permisos_uq").on(table.rolId, table.permisoId)],
);

export const relMiembrosRoles = pgTable(
  "rel_miembros_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    miembroOrganizacionId: uuid("miembro_organizacion_id")
      .notNull()
      .references(() => miembrosOrganizaciones.id),
    rolId: uuid("rol_id")
      .notNull()
      .references(() => catRoles.id),
    prioridad: integer("prioridad").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
  },
  (table) => [
    uniqueIndex("rel_miembros_roles_uq").on(table.miembroOrganizacionId, table.rolId),
    index("rel_miembros_roles_rol_idx").on(table.rolId),
  ],
);

export const invitacionesUsuarios = pgTable(
  "invitaciones_usuarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    rolId: uuid("rol_id").references(() => catRoles.id),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    correo: varchar("correo", { length: 254 }).notNull(),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    estado: varchar("estado", { length: 30 }).default("pendiente").notNull(),
    expiraAt: timestamp("expira_at", { withTimezone: true }).notNull(),
    aceptadaAt: timestamp("aceptada_at", { withTimezone: true }),
    aceptadaPor: uuid("aceptada_por").references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => usuarios.id),
  },
  (table) => [
    index("invitaciones_usuarios_organizacion_idx").on(table.organizacionId),
    uniqueIndex("invitaciones_usuarios_token_hash_uq").on(table.tokenHash),
  ],
);
