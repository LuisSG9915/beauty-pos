import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getCacheKv } from "@/lib/kv-cache";

type RateLimiterBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type RuntimeEnv = {
  PUBLIC_RATE_LIMITER?: RateLimiterBinding;
};

export type CheckRateLimitOptions = {
  max?: number;
  windowMs?: number;
};

export type RateLimitConfig = {
  bucket: string;
  clave: string;
  limite: number;
  ventanaMs: number;
};

// Fallback en memoria para dev local y tests sin Workers KV
const memoriaLimites = new Map<string, { count: number; expiraAt: number }>();

/**
 * Evalúa y registra un evento de rate limiting sin tocar la base de datos relacional.
 * Prefiere Cloudflare KV (con expirationTtl automático para no generar tombstones)
 * y degrada a almacenamiento en memoria cuando el binding no existe.
 * Devuelve true si el límite fue excedido.
 */
export async function registrarYVerificarRateLimit(
  config: RateLimitConfig,
  ahora: Date = new Date(),
): Promise<boolean> {
  const { bucket, clave, limite, ventanaMs } = config;
  const key = `rl:${bucket}:${clave}`;

  // Fallback en memoria (desarrollo local / tests)
  const ahoraMs = ahora.getTime();
  const entry = memoriaLimites.get(key);
  if (entry && entry.expiraAt > ahoraMs) {
    if (entry.count >= limite) {
      return true;
    }
    entry.count += 1;
    return false;
  }

  // Intentar binding nativo si está disponible
  try {
    const context = getCloudflareContext({ async: false }) as { env: RuntimeEnv } | null;
    if (context?.env?.PUBLIC_RATE_LIMITER) {
      const res = await context.env.PUBLIC_RATE_LIMITER.limit({ key: `${bucket}:${clave}` });
      return !res.success;
    }
  } catch {
    // Fuera de runtime de Workers
  }

  const kv = getCacheKv();
  if (kv) {
    try {
      const data = (await kv.get(key, { type: "json" })) as { count: number } | null;
      const countActual = data?.count ?? 0;
      if (countActual >= limite) {
        return true;
      }
      const ttlSegundos = Math.max(60, Math.ceil(ventanaMs / 1000));
      await kv.put(key, JSON.stringify({ count: countActual + 1 }), {
        expirationTtl: ttlSegundos,
      });
      return false;
    } catch {
      // Si KV falla temporalmente, no bloqueamos al usuario (fail-open)
      return false;
    }
  }

  memoriaLimites.set(key, {
    count: 1,
    expiraAt: ahoraMs + ventanaMs,
  });
  return false;
}

/**
 * Verifica el límite de peticiones para una clave dada (IP, endpoint o acción).
 * Intenta usar primero el binding nativo de Cloudflare Workers Paid `PUBLIC_RATE_LIMITER`.
 * Si no está disponible (desarrollo local, tests o configuración de cuota personalizada),
 * degrada a KV o a Map en memoria.
 * Retorna `{ success: true }` si está permitido, `{ success: false }` si excede la cuota.
 */
export async function checkRateLimit(
  key: string,
  options: CheckRateLimitOptions = {},
): Promise<{ success: boolean }> {
  // 1. Intentar usar binding nativo de Workers Paid
  try {
    const context = getCloudflareContext({ async: false }) as { env: RuntimeEnv } | null;
    if (context?.env?.PUBLIC_RATE_LIMITER) {
      const res = await context.env.PUBLIC_RATE_LIMITER.limit({ key });
      return { success: Boolean(res.success) };
    }
  } catch {
    // Fuera de Workers
  }

  // 2. Fallback de cuotas con memoria / KV
  const limite = options.max ?? 20;
  const ventanaMs = options.windowMs ?? 60_000;
  const excede = await registrarYVerificarRateLimit({
    bucket: "check",
    clave: key,
    limite,
    ventanaMs,
  });
  return { success: !excede };
}

