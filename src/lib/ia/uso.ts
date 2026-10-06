import { sql } from "drizzle-orm";

import type { IaTipo } from "@/db/schema/ia";
import { contextoSuscripcionCache, type BillingDb } from "@/modules/billing/queries";

/**
 * Capturas con IA permitidas por mes según el plan vigente (plan 08). Es la
 * única fuente de límites — la tabla `uso_ia` solo lleva el conteo.
 */
export const LIMITE_IA_MENSUAL: Record<string, number> = {
  esencial: 30,
  crecimiento: 300,
  profesional: 1000,
};

/** Límite del plan; sin plan o clave desconocida cae en el de `esencial`. */
export function limiteIaMensual(planClave: string | null | undefined): number {
  return LIMITE_IA_MENSUAL[planClave ?? ""] ?? LIMITE_IA_MENSUAL.esencial;
}

/** Primer día del mes en curso (UTC) como `date` "YYYY-MM-01". */
export function mesActualUtc(ahora: Date = new Date()): string {
  return `${ahora.toISOString().slice(0, 7)}-01`;
}

/**
 * Cuenta un intento de captura IA y evalúa la cuota del mes. El incremento es
 * atómico (upsert por organización+mes+tipo) y el intento se cuenta aunque
 * supere el límite — el plan lo acepta para simplificar la concurrencia.
 *
 * Cuota compartida: el límite compara contra la SUMA de los tipos del mes
 * (`producto`, `ticket`, `texto`), así que tras el upsert se agrega el total
 * del mes en una segunda lectura (una consulta no puede ver sus propias
 * escrituras en el mismo snapshot).
 */
export async function consumirCuotaIa(
  db: BillingDb,
  organizacionId: string,
  tipo: IaTipo,
): Promise<{ ok: true } | { ok: false; limite: number }> {
  const ctx = await contextoSuscripcionCache(organizacionId);
  const limite = limiteIaMensual(ctx.plan?.clave);
  const mes = mesActualUtc();

  await db.execute(sql`
    insert into uso_ia (organizacion_id, mes, tipo, conteo)
    values (${organizacionId}, ${mes}::date, ${tipo}, 1)
    on conflict (organizacion_id, mes, tipo)
    do update set conteo = uso_ia.conteo + 1, updated_at = now()
  `);

  const { rows } = await db.execute<{ total: number }>(sql`
    select coalesce(sum(conteo), 0)::int as total
      from uso_ia
     where organizacion_id = ${organizacionId}
       and mes = ${mes}::date
  `);

  const total = Number(rows[0]?.total ?? 0);
  if (total > limite) return { ok: false, limite };
  return { ok: true };
}
