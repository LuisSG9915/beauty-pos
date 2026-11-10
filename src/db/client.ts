import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/node-postgres";
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

// Un socket ocioso puede morir en cualquier momento (Hyperdrive/runtime reaps,
// FIN/RST del intermediario). pg-pool lo purga y re-emite `error` en el Pool:
// sin listener, EventEmitter lanza el error como excepción no capturada que
// mata el request en vuelo (stream RSC roto → skeleton). Solo se registra.
function conManejadorErrores(pool: Pool): Pool {
  pool.on("error", (error) => {
    console.warn("[db] conexión ociosa perdida:", error?.message ?? error);
  });
  return pool;
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
    const pool = conManejadorErrores(new Pool({
      connectionString,
      max: isHyperdrive ? 2 : 8,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
      idleTimeoutMillis: 5000,
    }));
    workerPools.set(cloudflare.ctx, { connectionString, pool });
    // No drenar con after(): los callbacks after() corren en paralelo (p-queue
    // con concurrencia infinita), así que un pool.end() registrado dentro de un
    // after() corre concurrente con el callback que creó el pool y lo cierra a
    // mitad de sus consultas ("Cannot use a pool after calling end"). El pool
    // se acota solo: idleTimeoutMillis destruye clientes ociosos y el WeakMap
    // por ExecutionContext garantiza que nada se reutilice entre invocaciones.
    return drizzleFor(pool);
  }

  // Entorno local/scripts: pool global por cadena de conexión (los sockets sí
  // persisten entre requests del mismo proceso). La base es remota (~100 ms
  // por consulta): idleTimeoutMillis alto evita destruir y reabrir sockets TLS
  // entre pasos del E2E o pausas del usuario; keepAlive detecta sockets que el
  // servidor remoto ya cerró; timeouts amplios dejan terminar ráfagas durante
  // picos de latencia de CockroachDB en vez de fallar la página completa.
  const isHyperdrive = Boolean(cloudflare?.env?.HYPERDRIVE?.connectionString || process.env.HYPERDRIVE_CONNECTION_STRING);
  const runtimeGlobal = globalThis as DatabaseGlobal;
  const pools = (runtimeGlobal.__beautyPosPools ??= new Map());
  const pool =
    pools.get(connectionString) ??
    conManejadorErrores(new Pool({
      connectionString,
      max: isHyperdrive ? 2 : 8,
      connectionTimeoutMillis: 15000,
      query_timeout: 30000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    }));
  pools.set(connectionString, pool);

  return drizzleFor(pool);
}
