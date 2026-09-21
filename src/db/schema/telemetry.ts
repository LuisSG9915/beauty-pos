import { boolean, index, integer, jsonb, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Telemetría first-party de adquisición: visitas al landing/precios y
 * registros completados. `vid` es un identificador anónimo aleatorio en
 * cookie (`bp_vid`) que permite atribuir registro → visita sin guardar IPs
 * ni datos personales. Volumen acotado por naturaleza (marketing pages).
 */
export const telemetriaEventos = pgTable(
  "telemetria_eventos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Visitante anónimo (cookie bp_vid); null si el evento llega sin cookie. */
    vid: varchar("vid", { length: 40 }),
    /** visita | registro_completado */
    tipo: varchar("tipo", { length: 30 }).notNull(),
    /** Página/origen del evento: landing | precios | registro. */
    origen: varchar("origen", { length: 40 }).notNull(),
    referer: varchar("referer", { length: 500 }),
    /** { utm_source, utm_medium, utm_campaign } si la visita llegó con UTMs. */
    utm: jsonb("utm"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("telemetria_eventos_tipo_fecha_idx").on(table.tipo, table.createdAt),
    index("telemetria_eventos_vid_idx").on(table.vid),
  ],
);

/**
 * Sesión de uso del producto (panel autenticado y páginas públicas internas).
 * `sid` es aleatorio por sesión del navegador; `vid` la cookie anual de
 * adquisición cuando existe. Nunca guarda IPs ni contenido introducido.
 * `engaged` sigue el criterio GA4: >10 s activos, ≥2 páginas o ≥1 acción clave.
 */
export const telemetriaSesiones = pgTable(
  "telemetria_sesiones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Identificador aleatorio de la sesión del navegador (sessionStorage). */
    sid: varchar("sid", { length: 40 }).notNull(),
    vid: varchar("vid", { length: 40 }),
    usuarioId: uuid("usuario_id"),
    organizacionId: uuid("organizacion_id"),
    sucursalId: uuid("sucursal_id"),
    /** Categoría de rol efectiva (propietario|administrador|recepcion|cajero|especialista|almacen|otro). */
    rol: varchar("rol", { length: 40 }),
    /** Rutas normalizadas con parámetros dinámicos (sin UUIDs ni query). */
    entradaRuta: varchar("entrada_ruta", { length: 160 }),
    salidaRuta: varchar("salida_ruta", { length: 160 }),
    iniciaAt: timestamp("inicia_at", { withTimezone: true }).notNull(),
    ultimaActividadAt: timestamp("ultima_actividad_at", { withTimezone: true }).notNull(),
    terminaAt: timestamp("termina_at", { withTimezone: true }),
    paginas: integer("paginas").default(0).notNull(),
    acciones: integer("acciones").default(0).notNull(),
    /** Milisegundos con la pestaña visible. */
    tiempoActivoMs: integer("tiempo_activo_ms").default(0).notNull(),
    engaged: boolean("engaged").default(false).notNull(),
    dispositivo: varchar("dispositivo", { length: 20 }),
    navegador: varchar("navegador", { length: 40 }),
    release: varchar("release", { length: 60 }),
  },
  (table) => [
    uniqueIndex("telemetria_sesiones_sid_uq").on(table.sid),
    index("telemetria_sesiones_fecha_idx").on(table.iniciaAt),
    index("telemetria_sesiones_org_idx").on(table.organizacionId, table.iniciaAt),
    index("telemetria_sesiones_entrada_idx").on(table.entradaRuta, table.iniciaAt),
  ],
);

/**
 * Evento de producto: page view, acción semántica, resultado de formulario o
 * métrica Web Vital. `metadata` solo admite claves de una lista blanca
 * (nunca valores de formularios ni datos personales).
 */
export const telemetriaProductoEventos = pgTable(
  "telemetria_producto_eventos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sesionId: uuid("sesion_id").references(() => telemetriaSesiones.id),
    sid: varchar("sid", { length: 40 }),
    usuarioId: uuid("usuario_id"),
    organizacionId: uuid("organizacion_id"),
    sucursalId: uuid("sucursal_id"),
    /** page_view | action | form_success | form_error | performance | session_end */
    tipo: varchar("tipo", { length: 30 }).notNull(),
    /** Ruta normalizada (/admin/clientes/[id]) — nunca la URL real. */
    ruta: varchar("ruta", { length: 160 }),
    /** Acción semántica estable: modulo.objeto.accion (ej. pos.cobro.confirmar). */
    actionId: varchar("action_id", { length: 100 }),
    /** true cuando la acción cuenta como acción clave para engagement. */
    accionClave: boolean("accion_clave").default(false).notNull(),
    /** Valor de métrica Web Vital (ms o score) cuando tipo=performance. */
    metrica: varchar("metrica", { length: 20 }),
    valor: numeric("valor", { precision: 12, scale: 3 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    /** Marca de tiempo del cliente para medir duraciones entre eventos. */
    clientAt: timestamp("client_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("telemetria_prod_fecha_idx").on(table.createdAt),
    index("telemetria_prod_tipo_fecha_idx").on(table.tipo, table.createdAt),
    index("telemetria_prod_ruta_idx").on(table.ruta, table.createdAt),
    index("telemetria_prod_action_idx").on(table.actionId, table.createdAt),
    index("telemetria_prod_org_idx").on(table.organizacionId, table.createdAt),
    index("telemetria_prod_sesion_idx").on(table.sesionId),
  ],
);
