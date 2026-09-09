import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

type HyperdriveBinding = {
  connectionString: string;
};

type RuntimeEnv = {
  HYPERDRIVE?: HyperdriveBinding;
};

type DatabaseGlobal = typeof globalThis & {
  __beautyPosPools?: Map<string, Pool>;
};

function getConnectionString() {
  try {
    const cloudflareEnv = getCloudflareContext({ async: false }).env as RuntimeEnv;
    const hyperdriveConnectionString = cloudflareEnv.HYPERDRIVE?.connectionString;

    if (hyperdriveConnectionString) {
      return hyperdriveConnectionString;
    }
  } catch {
    // The local Next.js server does not provide a Cloudflare context.
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  throw new Error("No database connection is configured.");
}

export function getDatabase() {
  const connectionString = getConnectionString();
  const runtimeGlobal = globalThis as DatabaseGlobal;
  const pools = (runtimeGlobal.__beautyPosPools ??= new Map());
  const pool = pools.get(connectionString) ?? new Pool({ connectionString, max: 5 });

  pools.set(connectionString, pool);

  return drizzle({ client: pool, schema });
}
