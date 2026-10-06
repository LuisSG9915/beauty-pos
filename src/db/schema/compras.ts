import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { productos } from "@/db/schema/catalogs";
import { organizaciones, sucursales, usuarios } from "@/db/schema/core";
import { medios } from "@/db/schema/media";

const catalogAuditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
};

const opAuditColumns = catalogAuditColumns;

export const COMPRA_ESTADOS = [
  "borrador",
  "por_verificar",
  "verificada",
  "con_observacion",
  "cancelada",
] as const;
export type CompraEstado = (typeof COMPRA_ESTADOS)[number];

// Origen de una línea de compra: leída por IA del ticket o capturada a mano.
export const COMPRA_LINEA_ORIGENES = ["ia", "manual"] as const;
export type CompraLineaOrigen = (typeof COMPRA_LINEA_ORIGENES)[number];

// Proveedores del negocio (plan 10): catálogo simple por organización; el
// nombre es único por org para que la lectura del ticket pueda emparejarlo
// sin ambigüedad.
export const proveedores = pgTable(
  "proveedores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    telefono: varchar("telefono", { length: 40 }),
    correo: varchar("correo", { length: 160 }),
    notas: text("notas"),
    activo: boolean("activo").default(true).notNull(),
    ...catalogAuditColumns,
  },
  (table) => [
    // El único por (org, nombre) ya cubre los lookups por organización.
    uniqueIndex("proveedores_org_nombre_uq").on(table.organizacionId, table.nombre),
  ],
);

// Compra a proveedor con ciclo de vida: borrador → por_verificar →
// verificada | con_observacion → (resolver) verificada; cancelable hasta
// recibirse. `estado` se valida con CHECK y las transiciones se exigen con
// `select … for update` dentro de la transacción del server action.
export const compras = pgTable(
  "compras",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    proveedorId: uuid("proveedor_id").references(() => proveedores.id),
    // Nombre del proveedor tal como lo leyó la IA del ticket, cuando no
    // coincide con el catálogo (se conserva aunque luego se empareje).
    proveedorTexto: varchar("proveedor_texto", { length: 160 }),
    folio: varchar("folio", { length: 80 }),
    fechaCompra: date("fecha_compra"),
    estado: varchar("estado", { length: 20 }).default("borrador").notNull(),
    // Total leído del ticket; `total_calculado` es la suma de las líneas
    // activas y al recibir se comparan para marcar observación (> $1).
    totalTicket: numeric("total_ticket", { precision: 12, scale: 2 }),
    totalCalculado: numeric("total_calculado", { precision: 12, scale: 2 }).default("0").notNull(),
    medioTicketId: uuid("medio_ticket_id").references(() => medios.id),
    // Salida del modelo ya validada por zod (nunca la imagen). Incluye dudas.
    analisisIa: jsonb("analisis_ia").$type<Record<string, unknown>>(),
    analisisError: text("analisis_error"),
    observaciones: text("observaciones"),
    // Opción elegida al recibir: copiar costo_unitario → productos.costo.
    actualizarCostos: boolean("actualizar_costos").default(true).notNull(),
    recibidaPor: uuid("recibida_por").references(() => usuarios.id),
    recibidaAt: timestamp("recibida_at", { withTimezone: true }),
    resueltaPor: uuid("resuelta_por").references(() => usuarios.id),
    resueltaAt: timestamp("resuelta_at", { withTimezone: true }),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("compras_org_idx").on(table.organizacionId),
    index("compras_sucursal_estado_idx").on(table.sucursalId, table.estado),
    check(
      "compras_estado_chk",
      sql`${table.estado} in ('borrador','por_verificar','verificada','con_observacion','cancelada')`,
    ),
  ],
);

// Línea de la compra (leída del ticket o capturada a mano). `productoId` es
// null hasta que una persona la empareja con el catálogo; la entrada de stock
// ocurre solo al recibir, por `cantidad_recibida` de las líneas emparejadas.
export const detalleCompras = pgTable(
  "detalle_compras",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    compraId: uuid("compra_id")
      .notNull()
      .references(() => compras.id),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    productoId: uuid("producto_id").references(() => productos.id),
    // Texto del renglón tal como venía en el ticket (o capturado a mano).
    descripcion: varchar("descripcion", { length: 240 }).notNull(),
    cantidad: numeric("cantidad", { precision: 12, scale: 3 }).notNull(),
    // null hasta confirmar la recepción; 0 = la línea no llegó.
    cantidadRecibida: numeric("cantidad_recibida", { precision: 12, scale: 3 }),
    costoUnitario: numeric("costo_unitario", { precision: 12, scale: 2 }).notNull(),
    importe: numeric("importe", { precision: 12, scale: 2 }).notNull(),
    observacion: text("observacion"),
    origen: varchar("origen", { length: 10 }).default("manual").notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("detalle_compras_compra_idx").on(table.compraId),
    index("detalle_compras_producto_idx").on(table.productoId),
    check(
      "detalle_compras_origen_chk",
      sql`${table.origen} in ('ia','manual')`,
    ),
  ],
);
