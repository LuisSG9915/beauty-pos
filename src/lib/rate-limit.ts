import { getCacheKv } from "@/lib/kv-cache";

type RateLimitConfig = {
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
  const ttlSegundos = Math.max(60, Math.ceil(ventanaMs / 1000));
  const kv = getCacheKv();

  if (kv) {
    try {
      const data = (await kv.get(key, { type: "json" })) as { count: number } | null;
      const countActual = data?.count ?? 0;
      if (countActual >= limite) {
        return true;
      }
      await kv.put(key, JSON.stringify({ count: countActual + 1 }), {
        expirationTtl: ttlSegundos,
      });
      return false;
    } catch {
      // Si KV falla temporalmente, no bloqueamos al usuario (fail-open)
      return false;
    }
  }

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

  memoriaLimites.set(key, {
    count: 1,
    expiraAt: ahoraMs + ventanaMs,
  });
  return false;
}
