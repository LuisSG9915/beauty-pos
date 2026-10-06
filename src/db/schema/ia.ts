import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { organizaciones } from "@/db/schema/core";

export const IA_TIPOS = ["producto", "ticket", "texto"] as const;
export type IaTipo = (typeof IA_TIPOS)[number];

// Contador mensual de llamadas a Workers AI por organización y tipo de
// captura (plan 08; los límites por plan viven en `src/lib/ia/uso.ts`).
// `mes` guarda el primer día del mes UTC. La cuota es compartida: el límite
// aplica a la SUMA de los tipos del mismo mes — el desglose por tipo existe
// para métricas, no para límites separados.
export const usoIa = pgTable(
  "uso_ia",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    mes: date("mes").notNull(),
    tipo: varchar("tipo", { length: 20 }).notNull(),
    conteo: integer("conteo").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uso_ia_org_mes_tipo_uq").on(table.organizacionId, table.mes, table.tipo),
    check("uso_ia_tipo_chk", sql`${table.tipo} in ('producto','ticket','texto')`),
  ],
);
