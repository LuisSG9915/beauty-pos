import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
};

export const organizaciones = pgTable(
  "organizaciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    zonaHoraria: varchar("zona_horaria", { length: 80 }).default("America/Mexico_City").notNull(),
    moneda: varchar("moneda", { length: 3 }).default("MXN").notNull(),
    // Recordatorios automáticos de citas por correo (a toda la organización).
    recordatoriosActivos: boolean("recordatorios_activos").default(false).notNull(),
    // Horas antes de la cita en que se envía el recordatorio.
    recordatoriosHorasAntes: integer("recordatorios_horas_antes").default(24).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...auditColumns,
  },
  (table) => [uniqueIndex("organizaciones_slug_uq").on(table.slug)],
);

export const sucursales = pgTable(
  "sucursales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    clave: varchar("clave", { length: 40 }).notNull(),
    telefono: varchar("telefono", { length: 30 }),
    correo: varchar("correo", { length: 254 }),
    direccion: text("direccion"),
    zonaHoraria: varchar("zona_horaria", { length: 80 }),
    // Capacidad del carril "sin asignar": cuántas citas sin profesional pueden
    // traslaparse en la misma sucursal y horario. 1 = una sola a la vez.
    capacidadSinAsignar: integer("capacidad_sin_asignar").default(1).notNull(),
    // Portal público de reservas (/reservar/[slug]). Las reservas web ocupan
    // el carril "sin asignar" y el equipo asigna profesional al confirmar.
    reservasOnline: boolean("reservas_online").default(false).notNull(),
    // true = la reserva web queda confirmada de inmediato; false = pendiente
    // hasta que el equipo la confirme desde la agenda.
    reservasAutoConfirmar: boolean("reservas_auto_confirmar").default(false).notNull(),
    // Horas mínimas antes de la cita para que el cliente pueda cancelarla o
    // reagendarla desde su enlace público. 0 = hasta el mismo momento.
    reservasCancelacionHoras: integer("reservas_cancelacion_horas").default(24).notNull(),
    // Minutos mínimos de anticipación para crear una reserva web.
    reservasAnticipacionMinutos: integer("reservas_anticipacion_minutos").default(0).notNull(),
    // Días máximos hacia adelante en que se puede reservar en línea.
    reservasHorizonteDias: integer("reservas_horizonte_dias").default(30).notNull(),
    // Política de caja: true = el POS rechaza cobros sin un corte abierto en
    // la sucursal; false = cobra libre y asocia la venta al corte si existe.
    exigirCorteParaCobrar: boolean("exigir_corte_para_cobrar").default(false).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("sucursales_organizacion_clave_uq").on(table.organizacionId, table.clave),
    index("sucursales_organizacion_idx").on(table.organizacionId),
  ],
);

const baseClientes = pgTable(
  "clientes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    nombre: varchar("nombre", { length: 100 }).notNull(),
    apellidoPaterno: varchar("apellido_paterno", { length: 100 }),
    apellidoMaterno: varchar("apellido_materno", { length: 100 }),
    telefono: varchar("telefono", { length: 30 }),
    telefonoNormalizado: varchar("telefono_normalizado", { length: 30 }),
    correo: varchar("correo", { length: 254 }),
    correoNormalizado: varchar("correo_normalizado", { length: 254 }),
    fechaNacimiento: date("fecha_nacimiento"),
    notasOperativas: text("notas_operativas"),
    rfc: varchar("rfc", { length: 13 }),
    razonSocial: varchar("razon_social", { length: 254 }),
    codigoPostalFiscal: varchar("codigo_postal_fiscal", { length: 5 }),
    regimenFiscal: varchar("regimen_fiscal", { length: 3 }),
    usoCfdi: varchar("uso_cfdi", { length: 4 }),
    activo: boolean("activo").default(true).notNull(),
    ...auditColumns,
  },
  (table) => [
    index("clientes_organizacion_idx").on(table.organizacionId),
    index("clientes_organizacion_nombre_idx").on(table.organizacionId, table.nombre),
    index("clientes_organizacion_telefono_idx").on(table.organizacionId, table.telefonoNormalizado),
    index("clientes_organizacion_correo_idx").on(table.organizacionId, table.correoNormalizado),
    index("clientes_organizacion_fecha_idx").on(table.organizacionId, table.createdAt),
  ],
);

Object.defineProperty(baseClientes, "creadoEn", {
  get() {
    return this.createdAt;
  },
});

export type ClientesTable = typeof baseClientes & {
  creadoEn: typeof baseClientes.createdAt;
};

export const clientes: ClientesTable = baseClientes as ClientesTable;

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUsuarioId: text("auth_usuario_id").notNull(),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    correo: varchar("correo", { length: 254 }).notNull(),
    telefono: varchar("telefono", { length: 30 }),
    esAdministradorPlataforma: boolean("es_administrador_plataforma").default(false).notNull(),
    activo: boolean("activo").default(true).notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("usuarios_auth_usuario_uq").on(table.authUsuarioId),
    uniqueIndex("usuarios_correo_uq").on(table.correo),
  ],
);

export const miembrosOrganizaciones = pgTable(
  "miembros_organizaciones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    estado: varchar("estado", { length: 30 }).default("activo").notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("miembros_organizaciones_usuario_uq").on(table.organizacionId, table.usuarioId),
    index("miembros_organizaciones_usuario_idx").on(table.usuarioId),
  ],
);

export const relUsuariosSucursales = pgTable(
  "rel_usuarios_sucursales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("rel_usuarios_sucursales_uq").on(
      table.usuarioId,
      table.sucursalId,
    ),
    index("rel_usuarios_sucursales_organizacion_idx").on(table.organizacionId),
    index("rel_usuarios_sucursales_sucursal_idx").on(table.sucursalId),
  ],
);
