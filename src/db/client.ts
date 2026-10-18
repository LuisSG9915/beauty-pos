import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/node-postgres";
import { after } from "next/server";
import { Pool } from "pg";

import * as schema from "@/db/schema";

type HyperdriveBinding = {
  connectionString: string;
};

type RuntimeEnv = {
  HYPERDRIVE?: HyperdriveBinding;
  DATABASE_URL?: string;
};

type DatabaseGlobal = typeof globalThis & {
  __beautyPosPools?: Map<string, Pool>;
};

// Pools por request en Workers: los sockets abiertos por el runtime no
// sobreviven entre invocaciones; reutilizarlos en el siguiente request deja
// consultas colgadas hasta que el runtime cancela (error 500). La clave es el
// ExecutionContext de la invocación actual; el WeakMap libera la entrada al
// terminar el request.
const workerPools = new WeakMap<object, { connectionString: string; pool: Pool }>();

function getCloudflare() {
  try {
    return getCloudflareContext({ async: false }) as {
      env: RuntimeEnv;
      ctx: object;
    } | null;
  } catch {
    // Fuera de Workers (next dev local, scripts tsx) no hay contexto.
    return null;
  }
}

/**
 * Clave del request actual en Workers (el ExecutionContext), `null` fuera de
 * Cloudflare. Sirve para acotar caches al request: nada que capture una
 * conexión de BD puede vivir en un global, porque los sockets no sobreviven
 * entre invocaciones.
 */
export function getRequestScope(): object | null {
  return getCloudflare()?.ctx ?? null;
}

function getConnectionString(env?: RuntimeEnv) {
  const hyperdriveConnectionString = env?.HYPERDRIVE?.connectionString ?? process.env.HYPERDRIVE_CONNECTION_STRING;
  if (hyperdriveConnectionString) {
    return hyperdriveConnectionString;
  }

  const databaseUrl = env?.DATABASE_URL ?? process.env.DATABASE_URL;
  if (databaseUrl) {
    return databaseUrl;
  }

  throw new Error("No database connection is configured.");
}

function drizzleFor(pool: Pool) {
  return drizzle({
    client: pool,
    schema,
    // Diagnóstico local: DB_LOG_QUERIES=1 imprime cada consulta y su duración.
    logger: process.env.DB_LOG_QUERIES === "1",
  });
}

export function getDatabase() {
  const cloudflare = getCloudflare();
  const connectionString = getConnectionString(cloudflare?.env);

  if (cloudflare?.ctx) {
    const existing = workerPools.get(cloudflare.ctx);
    if (existing && existing.connectionString === connectionString) {
      return drizzleFor(existing.pool);
    }
    const isHyperdrive = Boolean(cloudflare.env?.HYPERDRIVE?.connectionString || process.env.HYPERDRIVE_CONNECTION_STRING);
    // max 2 cuando proviene de HYPERDRIVE (Hyperdrive gestiona el pool en edge; abrir más sockets desperdicia descriptores).
    // Fuera de Hyperdrive se permiten hasta 8 para consultas paralelas.
    const pool = new Pool({
      connectionString,
      max: isHyperdrive ? 2 : 8,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
      idleTimeoutMillis: 5000,
    });
    workerPools.set(cloudflare.ctx, { connectionString, pool });
    // `after` corre cuando la respuesta ya se envió: allí es seguro drenar el
    // pool sin cortar consultas en vuelo (pool.end espera a los clientes).
    // Se silencia cualquier error de socket cerrado y se registra en ctx.waitUntil.
    const ctx = cloudflare.ctx as { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
    const endPool = () => pool.end().catch(() => {});
    try {
      after(async () => {
        const p = endPool();
        if (typeof ctx?.waitUntil === "function") {
          ctx.waitUntil(p);
        }
        await p;
      });
    } catch {
      // Sin contexto de request (prerender de build): registrar en waitUntil si está disponible.
      if (typeof ctx?.waitUntil === "function") {
        ctx.waitUntil(endPool());
      }
    }
    return drizzleFor(pool);
  }

  // Entorno local/scripts: pool global por cadena de conexión (los sockets sí
  // persisten entre requests del mismo proceso).
  const isHyperdrive = Boolean(cloudflare?.env?.HYPERDRIVE?.connectionString || process.env.HYPERDRIVE_CONNECTION_STRING);
  const runtimeGlobal = globalThis as DatabaseGlobal;
  const pools = (runtimeGlobal.__beautyPosPools ??= new Map());
  const pool =
    pools.get(connectionString) ??
    new Pool({
      connectionString,
      max: isHyperdrive ? 2 : 5,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
      idleTimeoutMillis: 5000,
    });
  pools.set(connectionString, pool);

  return drizzleFor(pool);
}
