import { getCloudflareContext } from "@opennextjs/cloudflare";

type KVNamespaceLike = {
  get(key: string, options?: { type?: "text" | "json" }): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

type RuntimeEnv = {
  CACHE_KV?: KVNamespaceLike;
};

/**
 * Namespace KV del Worker (`CACHE_KV` en wrangler.jsonc). `null` fuera de
 * Cloudflare (next dev, scripts): los consumidores deben degradar a
 * "cache miss" y leer de la base de datos.
 */
export function getCacheKv(): KVNamespaceLike | null {
  try {
    const context = getCloudflareContext({ async: false }) as { env: RuntimeEnv } | null;
    return context?.env.CACHE_KV ?? null;
  } catch {
    return null;
  }
}

/**
 * Read-through sobre KV: devuelve el valor cacheado o ejecuta `loader`,
 * guarda su resultado y lo devuelve. Cualquier fallo de KV se degrada a la
 * fuente — el caché nunca puede romper la lectura.
 */
export async function kvReadThrough<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const kv = getCacheKv();
  if (kv) {
    try {
      const cached = (await kv.get(key, { type: "json" })) as { v: T } | null;
      // Envoltura `{v}`: distingue "sin dato" (miss) de "dato = null"
      // (hit negativo — organizaciones sin suscripción, p. ej.).
      if (cached && typeof cached === "object" && "v" in cached) return cached.v;
    } catch {
      // KV no disponible o dato corrupto: seguimos a la fuente.
    }
  }

  const value = await loader();
  if (kv) {
    try {
      await kv.put(key, JSON.stringify({ v: value ?? null }), { expirationTtl: ttlSeconds });
    } catch {
      // Escritura de caché fallida: el valor ya se obtuvo de la fuente.
    }
  }
  return value;
}

/**
 * Obtiene y deserializa un JSON desde KV; `null` si no existe, expiró o no hay binding.
 */
export async function kvGetJson<T>(key: string): Promise<T | null> {
  const kv = getCacheKv();
  if (!kv) return null;
  try {
    const cached = (await kv.get(key, { type: "json" })) as { v: T } | null;
    if (cached && typeof cached === "object" && "v" in cached) return cached.v;
    return null;
  } catch {
    return null;
  }
}

/**
 * Serializa y guarda un JSON en KV con TTL opcional. Falla silenciosamente.
 */
export async function kvPutJson<T>(
  key: string,
  value: T,
  options?: { expirationTtl?: number },
): Promise<void> {
  const kv = getCacheKv();
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify({ v: value ?? null }), options);
  } catch {
    // Silencioso: la degradación es segura
  }
}

/** Elimina una clave de KV; no lanza si el binding no existe o falla. */
export async function kvDelete(key: string): Promise<void> {
  return kvInvalidate(key);
}

/** Invalida una clave de caché; no lanza si KV no está disponible. */
export async function kvInvalidate(key: string): Promise<void> {
  const kv = getCacheKv();
  if (!kv) return;
  try {
    await kv.delete(key);
  } catch {
    // La clave expira por TTL de todos modos.
  }
}

