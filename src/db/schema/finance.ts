import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { catMediosPago } from "@/db/schema/catalogs";
import { organizaciones, sucursales, usuarios } from "@/db/schema/core";
import { movimientosCaja } from "@/db/schema/operations";

const financeAuditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
};

/** Catálogo de categorías de gasto por organización (renta, insumos, nómina…). */
export const catCategoriasGastos = pgTable(
  "cat_categorias_gastos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    clave: varchar("clave", { length: 40 }).notNull(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...financeAuditColumns,
  },
  (table) => [
    uniqueIndex("cat_categorias_gastos_organizacion_clave_uq").on(table.organizacionId, table.clave),
    index("cat_categorias_gastos_organizacion_idx").on(table.organizacionId),
  ],
);

/**
 * Gasto del negocio. Documento confirmado e inmutable en su contenido: las
 * correcciones se hacen por reversión (estado `revertido` + motivo), nunca
 * borrando ni editando el importe original.
 *
 * Solo los gastos en efectivo vinculan `movimientoCajaId` (salida del cajón
 * del corte abierto). Gastos bancarios/tarjeta no tocan el efectivo.
 */
export const gastos = pgTable(
  "gastos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    categoriaId: uuid("categoria_id").references(() => catCategoriasGastos.id),
    concepto: varchar("concepto", { length: 200 }).notNull(),
    /** Fecha en que ocurrió el gasto; `created_at` es cuándo se registró. */
    fechaGasto: date("fecha_gasto").notNull(),
    importe: numeric("importe", { precision: 12, scale: 2 }).notNull(),
    medioPagoId: uuid("medio_pago_id").notNull().references(() => catMediosPago.id),
    proveedor: varchar("proveedor", { length: 160 }),
    referencia: varchar("referencia", { length: 120 }),
    notas: text("notas"),
    /** Salida de efectivo generada en el corte abierto al registrar. */
    movimientoCajaId: uuid("movimiento_caja_id").references(() => movimientosCaja.id),
    estado: varchar("estado", { length: 20 }).default("confirmado").notNull(),
    revertidoAt: timestamp("revertido_at", { withTimezone: true }),
    revertidoPor: uuid("revertido_por").references(() => usuarios.id),
    motivoReversion: text("motivo_reversion"),
    /** Quien registró el gasto. */
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    ...financeAuditColumns,
  },
  (table) => [
    index("gastos_organizacion_idx").on(table.organizacionId),
    index("gastos_sucursal_fecha_idx").on(table.sucursalId, table.fechaGasto),
    index("gastos_categoria_idx").on(table.categoriaId),
    index("gastos_medio_pago_idx").on(table.medioPagoId),
    index("gastos_usuario_idx").on(table.usuarioId),
    // Un movimiento de caja pertenece a un solo gasto.
    uniqueIndex("gastos_movimiento_caja_uq")
      .on(table.movimientoCajaId)
      .where(sql`${table.movimientoCajaId} is not null`),
    check("gastos_estado_chk", sql`${table.estado} in ('confirmado','revertido')`),
    check("gastos_importe_chk", sql`${table.importe} > 0`),
  ],
);
