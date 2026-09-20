import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { organizaciones } from "@/db/schema/core";

const billingAuditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
};

/** Catálogo de planes comerciales (global, no por organización). */
export const planes = pgTable(
  "planes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clave: varchar("clave", { length: 40 }).notNull(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    descripcion: text("descripcion"),
    /** Precio del mes con la cobertura incluida (IVA incluido). */
    precioMensual: numeric("precio_mensual", { precision: 12, scale: 2 }).default("0").notNull(),
    moneda: varchar("moneda", { length: 3 }).default("MXN").notNull(),
    /** Días de prueba gratuita al registrarse con este plan. */
    trialDias: integer("trial_dias").default(14).notNull(),
    /** Precio del año con la cobertura incluida (= 10 mensualidades); null = solo mensual. */
    precioAnual: numeric("precio_anual", { precision: 12, scale: 2 }),
    /** Sucursales cubiertas por el precio base del plan. */
    sucursalesIncluidas: integer("sucursales_incluidas").default(1).notNull(),
    /** Precio mensual por cada sucursal adicional a las incluidas; null = no permite extras. */
    precioSucursalExtra: numeric("precio_sucursal_extra", { precision: 12, scale: 2 }),
    /** Capacidades incluidas (claves de src/modules/billing/capacidades). */
    capacidades: jsonb("capacidades").$type<string[]>().default([]).notNull(),
    /** null = sin límite. */
    maxSucursales: integer("max_sucursales"),
    maxUsuarios: integer("max_usuarios"),
    /** Destaca el plan en la página de precios. */
    recomendado: boolean("recomendado").default(false).notNull(),
    /** Orden de exhibición en el portal de precios. */
    orden: integer("orden").default(0).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...billingAuditColumns,
  },
  (table) => [uniqueIndex("planes_clave_uq").on(table.clave)],
);

/**
 * Suscripción de una organización. Una org puede tener varias filas
 * históricas, pero máximo una vigente (`trialing`/`activa`/`past_due`) por
 * el índice parcial. `trialing` usa `trial_termina_at`; `activa`/`past_due`
 * usan `periodo_termina_at` (null = sin corte, vigente).
 */
export const suscripciones = pgTable(
  "suscripciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    planId: uuid("plan_id").notNull().references(() => planes.id),
    estado: varchar("estado", { length: 20 }).default("trialing").notNull(),
    /** Periodicidad contratada: mensual o anual. */
    periodicidad: varchar("periodicidad", { length: 20 }).default("mensual").notNull(),
    /** Sucursales cubiertas por esta suscripción. */
    sucursalesFacturadas: integer("sucursales_facturadas").default(1).notNull(),
    /**
     * Snapshot comercial del contrato vigente — se llena al registrar el
     * pago/activación para que ediciones posteriores del catálogo no alteren
     * lo ya contratado. null en trials o contratos anteriores al snapshot.
     */
    sucursalesIncluidas: integer("sucursales_incluidas"),
    /** Precio del periodo contratado (cobertura incluida, sin extras). */
    precioUnitario: numeric("precio_unitario", { precision: 12, scale: 2 }),
    /** Precio del periodo por sucursal adicional contratada. */
    precioSucursalExtra: numeric("precio_sucursal_extra", { precision: 12, scale: 2 }),
    trialTerminaAt: timestamp("trial_termina_at", { withTimezone: true }),
    periodoIniciaAt: timestamp("periodo_inicia_at", { withTimezone: true }),
    periodoTerminaAt: timestamp("periodo_termina_at", { withTimezone: true }),
    canceladaAt: timestamp("cancelada_at", { withTimezone: true }),
    motivoCancelacion: text("motivo_cancelacion"),
    ...billingAuditColumns,
  },
  (table) => [
    index("suscripciones_organizacion_idx").on(table.organizacionId),
    uniqueIndex("suscripciones_vigente_uq")
      .on(table.organizacionId)
      .where(sql`${table.estado} in ('trialing','activa','past_due')`),
    check("suscripciones_estado_chk", sql`${table.estado} in ('trialing','activa','past_due','cancelada','vencida')`),
    check("suscripciones_periodicidad_chk", sql`${table.periodicidad} in ('mensual','anual')`),
    check("suscripciones_sucursales_chk", sql`${table.sucursalesFacturadas} > 0`),
  ],
);

/**
 * Pago confirmado de una suscripción (manual por transferencia o webhook del
 * proveedor). `external_id` da idempotencia: el mismo evento del proveedor no
 * puede duplicar un pago.
 */
export const pagosSuscripcion = pgTable(
  "pagos_suscripcion",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    suscripcionId: uuid("suscripcion_id").notNull().references(() => suscripciones.id),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    moneda: varchar("moneda", { length: 3 }).default("MXN").notNull(),
    /** manual (transferencia registrada a mano), mercadopago, stripe… */
    proveedor: varchar("proveedor", { length: 30 }).default("manual").notNull(),
    externalId: varchar("external_id", { length: 160 }),
    referencia: varchar("referencia", { length: 160 }),
    periodoDesde: date("periodo_desde"),
    periodoHasta: date("periodo_hasta"),
    /** Snapshot del precio contratado: el plan puede cambiar después. */
    planClave: varchar("plan_clave", { length: 40 }),
    periodicidad: varchar("periodicidad", { length: 20 }),
    sucursalesFacturadas: integer("sucursales_facturadas"),
    precioUnitario: numeric("precio_unitario", { precision: 12, scale: 2 }),
    estado: varchar("estado", { length: 20 }).default("confirmado").notNull(),
    ...billingAuditColumns,
  },
  (table) => [
    index("pagos_suscripcion_suscripcion_idx").on(table.suscripcionId),
    index("pagos_suscripcion_organizacion_idx").on(table.organizacionId),
    uniqueIndex("pagos_suscripcion_external_uq")
      .on(table.proveedor, table.externalId)
      .where(sql`${table.externalId} is not null`),
    check("pagos_suscripcion_estado_chk", sql`${table.estado} in ('pendiente','confirmado','rechazado')`),
    check("pagos_suscripcion_monto_chk", sql`${table.monto} >= 0`),
  ],
);

/**
 * Bitácora de eventos de facturación (webhooks, activaciones manuales,
 * cancelaciones). Sirve para idempotencia y soporte; no guarda datos
 * sensibles del pagador.
 */
export const billingEventos = pgTable(
  "billing_eventos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").references(() => organizaciones.id),
    suscripcionId: uuid("suscripcion_id").references(() => suscripciones.id),
    /** p.ej. `trial.iniciado`, `pago.confirmado`, `suscripcion.cancelada`. */
    tipo: varchar("tipo", { length: 60 }).notNull(),
    /** ID del evento en el proveedor para idempotencia de webhooks. */
    externalId: varchar("external_id", { length: 160 }),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("billing_eventos_organizacion_idx").on(table.organizacionId),
    uniqueIndex("billing_eventos_external_uq")
      .on(table.tipo, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ],
);
