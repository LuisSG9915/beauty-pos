import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

import { clientes, organizaciones, sucursales, usuarios } from "@/db/schema/core";
import { catMediosPago, comisiones, productos, servicios } from "@/db/schema/catalogs";

const opAuditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
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
    corteId: uuid("corte_id").references(() => cortesCaja.id),
    estado: varchar("estado", { length: 30 }).default("en_proceso").notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).default("0").notNull(),
    descuento: numeric("descuento", { precision: 12, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).default("0").notNull(),
    propina: numeric("propina", { precision: 12, scale: 2 }).default("0").notNull(),
    notas: text("notas"),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("ventas_organizacion_idx").on(table.organizacionId),
    index("ventas_sucursal_idx").on(table.sucursalId),
    index("ventas_cita_idx").on(table.citaId),
    index("ventas_corte_idx").on(table.corteId),
    index("ventas_estado_idx").on(table.estado),
  ],
);

export const detalleVentasServicios = pgTable(
  "detalle_ventas_servicios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    servicioId: uuid("servicio_id").notNull().references(() => servicios.id),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    // Snapshot del nombre al cobrar: el ticket histórico no depende del catálogo.
    nombre: varchar("nombre", { length: 160 }),
    precio: numeric("precio", { precision: 12, scale: 2 }).notNull(),
    cantidad: integer("cantidad").default(1).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("detalle_ventas_servicios_venta_idx").on(table.ventaId),
  ],
);

export const detalleVentasProductos = pgTable(
  "detalle_ventas_productos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    productoId: uuid("producto_id").notNull().references(() => productos.id),
    // Snapshot del nombre al cobrar: el ticket histórico no depende del catálogo.
    nombre: varchar("nombre", { length: 160 }),
    cantidad: integer("cantidad").default(1).notNull(),
    precio: numeric("precio", { precision: 12, scale: 2 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("detalle_ventas_productos_venta_idx").on(table.ventaId),
    index("detalle_ventas_productos_producto_idx").on(table.productoId),
  ],
);

export const detalleVentasMediosPagos = pgTable(
  "detalle_ventas_medios_pagos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    medioPagoId: uuid("medio_pago_id").notNull().references(() => catMediosPago.id),
    // Monto aplicado a la venta (lo que queda en caja). En efectivo puede ser
    // menor que `recibido` cuando hubo cambio.
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    // Efectivo físicamente recibido; en medios no efectivo coincide con monto.
    recibido: numeric("recibido", { precision: 12, scale: 2 }).default("0").notNull(),
    cambio: numeric("cambio", { precision: 12, scale: 2 }).default("0").notNull(),
    referencia: varchar("referencia", { length: 120 }),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("detalle_ventas_medios_pagos_venta_idx").on(table.ventaId),
  ],
);

// Propinas repartidas por profesional al cobrar una venta.
export const detalleVentasPropinas = pgTable(
  "detalle_ventas_propinas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("detalle_ventas_propinas_venta_idx").on(table.ventaId),
    index("detalle_ventas_propinas_usuario_idx").on(table.usuarioId),
  ],
);

// Comisiones devengadas por línea de servicio al cobrar una venta.
export const detalleVentasComisiones = pgTable(
  "detalle_ventas_comisiones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    detalleVentaServicioId: uuid("detalle_venta_servicio_id").notNull().references(() => detalleVentasServicios.id),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    comisionId: uuid("comision_id").references(() => comisiones.id),
    tipo: varchar("tipo", { length: 20 }).notNull(),
    valor: numeric("valor", { precision: 12, scale: 3 }).notNull(),
    base: numeric("base", { precision: 12, scale: 2 }).notNull(),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("detalle_ventas_comisiones_venta_idx").on(table.ventaId),
    index("detalle_ventas_comisiones_usuario_idx").on(table.usuarioId),
    index("detalle_ventas_comisiones_linea_idx").on(table.detalleVentaServicioId),
  ],
);

export const inventarioStock = pgTable(
  "inventario_stock",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    productoId: uuid("producto_id").notNull().references(() => productos.id),
    stockActual: numeric("stock_actual", { precision: 12, scale: 3 }).default("0").notNull(),
    ...opAuditColumns,
  },
  (table) => [
    uniqueIndex("inventario_stock_sucursal_producto_uq").on(table.sucursalId, table.productoId),
    index("inventario_stock_organizacion_idx").on(table.organizacionId),
    index("inventario_stock_producto_idx").on(table.productoId),
  ],
);

export const movimientosInventario = pgTable(
  "movimientos_inventario",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    productoId: uuid("producto_id").notNull().references(() => productos.id),
    ventaId: uuid("venta_id").references(() => ventas.id),
    tipo: varchar("tipo", { length: 20 }).notNull(),
    cantidad: numeric("cantidad", { precision: 12, scale: 3 }).notNull(),
    stockResultante: numeric("stock_resultante", { precision: 12, scale: 3 }).notNull(),
    notas: text("notas"),
    ...opAuditColumns,
  },
  (table) => [
    index("movimientos_inventario_organizacion_idx").on(table.organizacionId),
    index("movimientos_inventario_sucursal_producto_idx").on(table.sucursalId, table.productoId),
    index("movimientos_inventario_venta_idx").on(table.ventaId),
  ],
);

export const FICHA_TIPOS = ["color", "tratamiento", "alergia", "nota"] as const;
export type FichaTipo = (typeof FICHA_TIPOS)[number];

// Ficha técnica del cliente: fórmulas de color, tratamientos, alergias y notas
// registradas durante el servicio. `fotos` guarda URLs (antes/después) cuando
// se configure almacenamiento (fase posterior).
export const clientesFichasTecnicas = pgTable(
  "clientes_fichas_tecnicas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    clienteId: uuid("cliente_id").notNull().references(() => clientes.id),
    citaId: uuid("cita_id").references(() => citas.id),
    servicioId: uuid("servicio_id").references(() => servicios.id),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    tipo: varchar("tipo", { length: 20 }).notNull(),
    formula: text("formula"),
    tiempoPoseMinutos: integer("tiempo_pose_minutos"),
    notas: text("notas"),
    fotos: jsonb("fotos").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("clientes_fichas_organizacion_idx").on(table.organizacionId),
    index("clientes_fichas_cliente_idx").on(table.clienteId),
    index("clientes_fichas_cita_idx").on(table.citaId),
    check("clientes_fichas_tipo_chk", sql`${table.tipo} in ('color','tratamiento','alergia','nota')`),
  ],
);

// Turnos de atención por sucursal. diaSemana usa la convención JS: 0=domingo … 6=sábado.
// iniciaMinutos/terminaMinutos son minutos desde medianoche local (0-1440), lo que
// permite varios turnos por día (p.ej. 08:00-13:00 y 15:00-21:00).
export const horariosSucursales = pgTable(
  "horarios_sucursales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    diaSemana: integer("dia_semana").notNull(),
    iniciaMinutos: integer("inicia_minutos").notNull(),
    terminaMinutos: integer("termina_minutos").notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("horarios_sucursales_organizacion_idx").on(table.organizacionId),
    index("horarios_sucursales_sucursal_dia_idx").on(table.sucursalId, table.diaSemana),
    check("horarios_sucursales_dia_chk", sql`${table.diaSemana} between 0 and 6`),
    check("horarios_sucursales_rango_chk", sql`${table.iniciaMinutos} >= 0 and ${table.terminaMinutos} <= 1440 and ${table.iniciaMinutos} < ${table.terminaMinutos}`),
  ],
);

// Bloqueos de agenda: descansos, cierres, mantenimiento o tiempo personal.
// usuarioId NULL = bloqueo general de la sucursal; con valor = solo ese profesional.
export const bloqueosAgenda = pgTable(
  "bloqueos_agenda",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    iniciaAt: timestamp("inicia_at", { withTimezone: true }).notNull(),
    terminaAt: timestamp("termina_at", { withTimezone: true }).notNull(),
    tipo: varchar("tipo", { length: 30 }).default("personal").notNull(),
    motivo: text("motivo"),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("bloqueos_agenda_organizacion_idx").on(table.organizacionId),
    index("bloqueos_agenda_sucursal_inicia_idx").on(table.sucursalId, table.iniciaAt),
    index("bloqueos_agenda_usuario_idx").on(table.usuarioId),
    check("bloqueos_agenda_rango_chk", sql`${table.iniciaAt} < ${table.terminaAt}`),
  ],
);

export const CORTE_ESTADOS = ["abierto", "cerrado"] as const;

// Corte de caja por sucursal: se abre con fondo inicial, las ventas cobradas se
// asocian al corte abierto y el cierre es "ciego" (el cajero declara el conteo
// sin ver el esperado; la diferencia se calcula al confirmar).
export const cortesCaja = pgTable(
  "cortes_caja",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    fondoInicial: numeric("fondo_inicial", { precision: 12, scale: 2 }).default("0").notNull(),
    estado: varchar("estado", { length: 20 }).default("abierto").notNull(),
    cerradoAt: timestamp("cerrado_at", { withTimezone: true }),
    cerradoPor: uuid("cerrado_por").references(() => usuarios.id),
    notas: text("notas"),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    index("cortes_caja_organizacion_idx").on(table.organizacionId),
    index("cortes_caja_sucursal_estado_idx").on(table.sucursalId, table.estado),
    // Un solo corte abierto por sucursal, garantizado a nivel de base de datos
    // aunque dos aperturas lleguen en paralelo.
    uniqueIndex("cortes_caja_abierto_sucursal_uq")
      .on(table.sucursalId)
      .where(sql`${table.estado} = 'abierto' and ${table.activo}`),
    check("cortes_caja_estado_chk", sql`${table.estado} in ('abierto','cerrado')`),
  ],
);

export const MOVIMIENTO_CAJA_TIPOS = ["entrada", "retiro", "gasto", "deposito", "ajuste"] as const;
export type MovimientoCajaTipo = (typeof MOVIMIENTO_CAJA_TIPOS)[number];

// Movimientos manuales de caja durante el turno: entradas no-venta, retiros,
// gastos, depósitos y ajustes. Inmutables; las correcciones son movimientos
// compensatorios. El signo se deriva del tipo (ajuste admite monto negativo).
export const movimientosCaja = pgTable(
  "movimientos_caja",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    corteId: uuid("corte_id").notNull().references(() => cortesCaja.id),
    medioPagoId: uuid("medio_pago_id").notNull().references(() => catMediosPago.id),
    tipo: varchar("tipo", { length: 20 }).notNull(),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    notas: text("notas"),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
  },
  (table) => [
    index("movimientos_caja_organizacion_idx").on(table.organizacionId),
    index("movimientos_caja_corte_idx").on(table.corteId),
    index("movimientos_caja_sucursal_idx").on(table.sucursalId),
    check("movimientos_caja_tipo_chk", sql`${table.tipo} in ('entrada','retiro','gasto','deposito','ajuste')`),
    check("movimientos_caja_monto_chk", sql`${table.monto} <> 0`),
  ],
);

// Conteo por medio de pago registrado al cerrar el corte (esperado vs. contado).
export const detalleCortes = pgTable(
  "detalle_cortes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    corteId: uuid("corte_id").notNull().references(() => cortesCaja.id),
    medioPagoId: uuid("medio_pago_id").notNull().references(() => catMediosPago.id),
    esperado: numeric("esperado", { precision: 12, scale: 2 }).default("0").notNull(),
    contado: numeric("contado", { precision: 12, scale: 2 }).default("0").notNull(),
    diferencia: numeric("diferencia", { precision: 12, scale: 2 }).default("0").notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...opAuditColumns,
  },
  (table) => [
    uniqueIndex("detalle_cortes_corte_medio_uq").on(table.corteId, table.medioPagoId),
    index("detalle_cortes_corte_idx").on(table.corteId),
  ],
);

// Claves de idempotencia: el cliente genera una clave por intento de operación
// (p. ej. cobrar). Si el request se repite (doble click, retry de red), la
// segunda ejecución devuelve el resultado guardado en vez de duplicar efectos.
export const clavesIdempotencia = pgTable(
  "claves_idempotencia",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    clave: varchar("clave", { length: 80 }).notNull(),
    accion: varchar("accion", { length: 60 }).notNull(),
    resultado: jsonb("resultado").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("claves_idempotencia_org_clave_uq").on(table.organizacionId, table.clave),
  ],
);

// Devoluciones/cancelaciones de ventas cobradas. Documento compensatorio: la
// venta original queda intacta (estado "cancelada") y la devolución registra
// monto, motivo y líneas devueltas; el stock de productos se revierte.
export const devoluciones = pgTable(
  "devoluciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").notNull().references(() => sucursales.id),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    motivo: text("motivo").notNull(),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
  },
  (table) => [
    index("devoluciones_organizacion_idx").on(table.organizacionId),
    index("devoluciones_venta_idx").on(table.ventaId),
    index("devoluciones_sucursal_idx").on(table.sucursalId),
  ],
);

export const detalleDevoluciones = pgTable(
  "detalle_devoluciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    devolucionId: uuid("devolucion_id").notNull().references(() => devoluciones.id),
    tipo: varchar("tipo", { length: 20 }).notNull(),
    detalleId: uuid("detalle_id"),
    cantidad: numeric("cantidad", { precision: 12, scale: 3 }).notNull(),
    monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("detalle_devoluciones_devolucion_idx").on(table.devolucionId),
    check("detalle_devoluciones_tipo_chk", sql`${table.tipo} in ('servicio','producto')`),
  ],
);
