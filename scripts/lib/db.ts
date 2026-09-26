import "dotenv/config";

import { Client } from "pg";

/**
 * Cliente pg directo sobre DATABASE_URL para consultas de diagnóstico:
 * abre la conexión, ejecuta `fn` y cierra siempre (éxito o error).
 */
export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
