import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { organizaciones, sucursales, usuarios } from "./core";

export const INCIDENTE_PRIORIDADES = ["p0", "p1", "p2", "p3"] as const;
export type IncidentePrioridad = (typeof INCIDENTE_PRIORIDADES)[number];

export const INCIDENTE_ESTADOS = ["nuevo", "en_revision", "en_progreso", "resuelto", "ignorado"] as const;
export type IncidenteEstado = (typeof INCIDENTE_ESTADOS)[number];

export const INCIDENTE_FUENTES = ["client", "server", "server_action", "worker"] as const;
export type IncidenteFuente = (typeof INCIDENTE_FUENTES)[number];

/**
 * Error de aplicación agrupado por fingerprint. Guarda solo contexto técnico
 * sanitizado: rutas normalizadas, módulo, navegador, release. Nunca valores de
 * formularios, cookies, tokens ni datos personales. La prioridad combina
 * severidad del flujo, frecuencia y organizaciones afectadas.
 */
export const incidentesError = pgTable(
  "incidentes_error",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Huella estable del error (tipo + frame de app + ruta/digest). */
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    mensaje: text("mensaje"),
    fuente: varchar("fuente", { length: 20 }).notNull(),
    /** Módulo inferido de la ruta/acción: agenda | pos | caja | reservas | auth | otro. */
    modulo: varchar("modulo", { length: 40 }),
    ruta: varchar("ruta", { length: 160 }),
    actionId: varchar("action_id", { length: 100 }),
    prioridad: varchar("prioridad", { length: 4 }).default("p3").notNull(),
    estado: varchar("estado", { length: 20 }).default("nuevo").notNull(),
    ocurrencias: integer("ocurrencias").default(1).notNull(),
    organizacionesAfectadas: integer("organizaciones_afectadas").default(0).notNull(),
    primeraVezAt: timestamp("primera_vez_at", { withTimezone: true }).defaultNow().notNull(),
    ultimaVezAt: timestamp("ultima_vez_at", { withTimezone: true }).defaultNow().notNull(),
    sentryIssueUrl: varchar("sentry_issue_url", { length: 300 }),
    releaseAparece: varchar("release_aparece", { length: 60 }),
    releaseCorregido: varchar("release_corregido", { length: 60 }),
    asignadoA: uuid("asignado_a").references(() => usuarios.id),
    resueltoAt: timestamp("resuelto_at", { withTimezone: true }),
    resueltoPor: uuid("resuelto_por").references(() => usuarios.id),
    notaResolucion: text("nota_resolucion"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("incidentes_error_fingerprint_uq").on(table.fingerprint),
    index("incidentes_error_estado_idx").on(table.estado, table.prioridad),
    index("incidentes_error_fecha_idx").on(table.ultimaVezAt),
    index("incidentes_error_modulo_idx").on(table.modulo),
  ],
);

/**
 * Ocurrencia individual de un incidente. Las FKs a organización/usuario son
 * solo para diagnóstico del equipo de plataforma; nunca se exponen al cliente.
 */
export const incidentesOcurrencias = pgTable(
  "incidentes_ocurrencias",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    incidenteId: uuid("incidente_id")
      .notNull()
      .references(() => incidentesError.id),
    correlationId: varchar("correlation_id", { length: 40 }).notNull(),
    organizacionId: uuid("organizacion_id").references(() => organizaciones.id),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    ruta: varchar("ruta", { length: 160 }),
    navegador: varchar("navegador", { length: 40 }),
    dispositivo: varchar("dispositivo", { length: 20 }),
    release: varchar("release", { length: 60 }),
    /** Stack/contexto ya sanitizado (sin PII ni secretos). */
    contexto: jsonb("contexto").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("incidentes_ocurrencias_incidente_idx").on(table.incidenteId, table.createdAt),
    index("incidentes_ocurrencias_corr_idx").on(table.correlationId),
    index("incidentes_ocurrencias_org_idx").on(table.organizacionId, table.createdAt),
  ],
);

/** Historial inmutable de cambios de estado, prioridad, responsable y notas. */
export const incidentesHistorial = pgTable(
  "incidentes_historial",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    incidenteId: uuid("incidente_id")
      .notNull()
      .references(() => incidentesError.id),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    /** estado | prioridad | asignacion | nota | reapertura */
    tipo: varchar("tipo", { length: 30 }).notNull(),
    valorAnterior: varchar("valor_anterior", { length: 120 }),
    valorNuevo: varchar("valor_nuevo", { length: 120 }),
    comentario: text("comentario"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("incidentes_historial_incidente_idx").on(table.incidenteId, table.createdAt)],
);
