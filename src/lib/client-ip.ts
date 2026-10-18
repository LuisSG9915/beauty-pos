import { headers } from "next/headers";

/**
 * Extrae la IP del cliente a partir de un objeto Headers (cf-connecting-ip → x-forwarded-for → x-real-ip).
 */
export function getClientIp(h: Headers): string {
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return h.get("x-real-ip")?.trim() ?? "anon";
}

/**
 * IP del cliente desde las cabeceras del proxy, con el mismo orden de
 * precedencia que better-auth (`cf-connecting-ip` → `x-forwarded-for` →
 * `x-real-ip`). `null` cuando el request no trae ninguna (p.ej. tests).
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const ip = getClientIp(h);
  return ip === "anon" ? null : ip;
}

