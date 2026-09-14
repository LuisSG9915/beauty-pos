import {
  boolean,
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

import { organizaciones, sucursales } from "@/db/schema/core";
import { catRoles } from "@/db/schema/access";

const catalogAuditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
};

export const catCategoriasServicios = pgTable(
  "cat_categorias_servicios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    clave: varchar("clave", { length: 60 }).notNull(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    descripcion: text("descripcion"),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    uniqueIndex("cat_categorias_servicios_organizacion_clave_uq").on(table.organizacionId, table.clave),
    index("cat_categorias_servicios_organizacion_idx").on(table.organizacionId),
  ],
);

export const servicios = pgTable(
  "servicios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    categoriaId: uuid("categoria_id").references(() => catCategoriasServicios.id),
    clave: varchar("clave", { length: 60 }).notNull(),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    descripcion: text("descripcion"),
    duracionMinutos: integer("duracion_minutos").default(60).notNull(),
    precioBase: numeric("precio_base", { precision: 12, scale: 2 }).notNull(),
    visibleAgenda: boolean("visible_agenda").default(true).notNull(),
    requiereCabina: boolean("requiere_cabina").default(false).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    uniqueIndex("servicios_organizacion_clave_uq").on(table.organizacionId, table.clave),
    index("servicios_organizacion_idx").on(table.organizacionId),
    index("servicios_categoria_idx").on(table.categoriaId),
  ],
);

export const preciosServicios = pgTable(
  "precios_servicios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    servicioId: uuid("servicio_id")
      .notNull()
      .references(() => servicios.id),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    precio: numeric("precio", { precision: 12, scale: 2 }).notNull(),
    vigenciaDesde: date("vigencia_desde").notNull(),
    vigenciaHasta: date("vigencia_hasta"),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    index("precios_servicios_servicio_sucursal_idx").on(table.servicioId, table.sucursalId),
    index("precios_servicios_vigencia_idx").on(table.vigenciaDesde, table.vigenciaHasta),
  ],
);

export const catCategoriasProductos = pgTable(
  "cat_categorias_productos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    clave: varchar("clave", { length: 60 }).notNull(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [uniqueIndex("cat_categorias_productos_organizacion_clave_uq").on(table.organizacionId, table.clave)],
);

export const catUnidadesMedida = pgTable(
  "cat_unidades_medida",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    clave: varchar("clave", { length: 20 }).notNull(),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [uniqueIndex("cat_unidades_medida_organizacion_clave_uq").on(table.organizacionId, table.clave)],
);

export const catMediosPago = pgTable(
  "cat_medios_pago",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    clave: varchar("clave", { length: 40 }).notNull(),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    categoria: varchar("categoria", { length: 20 }).default("efectivo").notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    uniqueIndex("cat_medios_pago_organizacion_clave_uq").on(table.organizacionId, table.clave),
    index("cat_medios_pago_organizacion_idx").on(table.organizacionId),
  ],
);

export const productos = pgTable(
  "productos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    categoriaId: uuid("categoria_id").references(() => catCategoriasProductos.id),
    unidadMedidaId: uuid("unidad_medida_id").references(() => catUnidadesMedida.id),
    sku: varchar("sku", { length: 80 }).notNull(),
    codigoBarras: varchar("codigo_barras", { length: 80 }),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    descripcion: text("descripcion"),
    tipo: varchar("tipo", { length: 20 }).default("producto").notNull(),
    costo: numeric("costo", { precision: 12, scale: 2 }).default("0").notNull(),
    precioVenta: numeric("precio_venta", { precision: 12, scale: 2 }).default("0").notNull(),
    stockMinimo: numeric("stock_minimo", { precision: 12, scale: 3 }).default("0").notNull(),
    visiblePos: boolean("visible_pos").default(true).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    uniqueIndex("productos_organizacion_sku_uq").on(table.organizacionId, table.sku),
    index("productos_organizacion_idx").on(table.organizacionId),
    index("productos_categoria_idx").on(table.categoriaId),
  ],
);

export const catImpuestos = pgTable(
  "cat_impuestos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    clave: varchar("clave", { length: 40 }).notNull(),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    tasa: numeric("tasa", { precision: 6, scale: 4 }).notNull(),
    tipo: varchar("tipo", { length: 20 }).default("agregado").notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    uniqueIndex("cat_impuestos_organizacion_clave_uq").on(table.organizacionId, table.clave),
    index("cat_impuestos_organizacion_idx").on(table.organizacionId),
  ],
);

export const promociones = pgTable(
  "promociones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    clave: varchar("clave", { length: 60 }).notNull(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    descripcion: text("descripcion"),
    tipo: varchar("tipo", { length: 20 }).default("porcentaje").notNull(),
    valor: numeric("valor", { precision: 12, scale: 3 }).default("0").notNull(),
    aplica: varchar("aplica", { length: 20 }).default("ambos").notNull(),
    vigenciaDesde: date("vigencia_desde").notNull(),
    vigenciaHasta: date("vigencia_hasta"),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    uniqueIndex("promociones_organizacion_clave_uq").on(table.organizacionId, table.clave),
    index("promociones_organizacion_idx").on(table.organizacionId),
    index("promociones_vigencia_idx").on(table.vigenciaDesde, table.vigenciaHasta),
  ],
);

export const relServiciosInsumos = pgTable(
  "rel_servicios_insumos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    servicioId: uuid("servicio_id").notNull().references(() => servicios.id),
    productoId: uuid("producto_id").notNull().references(() => productos.id),
    cantidad: numeric("cantidad", { precision: 12, scale: 3 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    uniqueIndex("rel_servicios_insumos_servicio_producto_uq").on(table.servicioId, table.productoId),
    index("rel_servicios_insumos_servicio_idx").on(table.servicioId),
    index("rel_servicios_insumos_producto_idx").on(table.productoId),
  ],
);

export const comisiones = pgTable(
  "comisiones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    servicioId: uuid("servicio_id").references(() => servicios.id),
    rolId: uuid("rol_id").references(() => catRoles.id),
    tipo: varchar("tipo", { length: 20 }).default("porcentaje").notNull(),
    valor: numeric("valor", { precision: 12, scale: 3 }).default("0").notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    index("comisiones_organizacion_idx").on(table.organizacionId),
    index("comisiones_servicio_idx").on(table.servicioId),
    index("comisiones_rol_idx").on(table.rolId),
  ],
);
