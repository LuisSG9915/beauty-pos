import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

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
