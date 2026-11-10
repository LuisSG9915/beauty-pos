import "dotenv/config";

import { Client } from "pg";

/**
 * Cliente pg directo sobre DATABASE_URL para consultas de diagnóstico:
 * abre la conexión, ejecuta `fn` y cierra siempre (éxito o error).
 */
export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  // La base es remota: el handshake TLS a veces excede el timeout en frío.
  // Un solo reintento en connect (nunca en la query: reintentar una consulta
  // podría duplicar una escritura).
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => {});
    const retry = new Client({ connectionString: process.env.DATABASE_URL });
    await retry.connect();
    try {
      return await fn(retry);
    } finally {
      await retry.end();
    }
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
