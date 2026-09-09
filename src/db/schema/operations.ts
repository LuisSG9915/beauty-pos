import {
  boolean,
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

import { clientes, organizaciones, sucursales, usuarios } from "@/db/schema/core";
import { catMediosPago, servicios } from "@/db/schema/catalogs";

const opAuditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid("updated_by"),
};

export const citas = pgTable(
  "citas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    clienteId: uuid("cliente_id").references(() => clientes.id),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    fechaHora: timestamp("fecha_hora", { withTimezone: true }).notNull(),
    duracionMinutos: integer("duracion_minutos").default(60).notNull(),
    estado: varchar("estado", { length: 30 }).default("pendiente").notNull(),
    notas: text("notas"),
    totalEstimado: numeric("total_estimado", { precision: 12, scale: 2 }).default("0").notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("citas_organizacion_idx").on(table.organizacionId),
    index("citas_sucursal_fecha_idx").on(table.sucursalId, table.fechaHora),
    index("citas_cliente_idx").on(table.clienteId),
    index("citas_usuario_idx").on(table.usuarioId),
    index("citas_estado_idx").on(table.estado),
  ],
);

export const detalleCitasServicios = pgTable(
  "detalle_citas_servicios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    citaId: uuid("cita_id").notNull().references(() => citas.id),
    servicioId: uuid("servicio_id").notNull().references(() => servicios.id),
    precio: numeric("precio", { precision: 12, scale: 2 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    uniqueIndex("detalle_citas_servicios_cita_servicio_uq").on(table.citaId, table.servicioId),
    index("detalle_citas_servicios_cita_idx").on(table.citaId),
  ],
);

export const ventas = pgTable(
  "ventas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    citaId: uuid("cita_id").references(() => citas.id),
    clienteId: uuid("cliente_id").references(() => clientes.id),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    estado: varchar("estado", { length: 30 }).default("en_proceso").notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
    descuento: numeric("descuento", { precision: 12, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).default("0").notNull(),
    notas: text("notas"),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("ventas_organizacion_idx").on(table.organizacionId),
    index("ventas_sucursal_idx").on(table.sucursalId),
    index("ventas_cita_idx").on(table.citaId),
    index("ventas_estado_idx").on(table.estado),
  ],
);

export const detalleVentasServicios = pgTable(
  "detalle_ventas_servicios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    servicioId: uuid("servicio_id").notNull().references(() => servicios.id),
    precio: numeric("precio", { precision: 12, scale: 2 }).notNull(),
    cantidad: integer("cantidad").default(1).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("detalle_ventas_servicios_venta_idx").on(table.ventaId),
  ],
);

export const detalleVentasMediosPagos = pgTable(
  "detalle_ventas_medios_pagos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    medioPagoId: uuid("medio_pago_id").notNull().references(() => catMediosPago.id),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    referencia: varchar("referencia", { length: 120 }),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("detalle_ventas_medios_pagos_venta_idx").on(table.ventaId),
  ],
);
