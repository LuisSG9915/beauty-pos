/**
 * Utilidades de cliente para la preferencia de sucursal persistente por organización.
 *
 * Se separa de `sucursal-cookie.ts` para no importar `next/headers` en Client
 * Components. Permite leer y escribir la cookie `melena_sucursal_{orgId}`
 * inmediatamente desde el navegador (`document.cookie`), evitando cualquier
 * parpadeo o pérdida de preferencia durante navegaciones del lado del cliente.
 */

export const SUCURSAL_COOKIE_PREFIX = "melena_sucursal_";
/** 90 días, en segundos. */
export const SUCURSAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export function sucursalCookieName(organizacionId: string): string {
  return `${SUCURSAL_COOKIE_PREFIX}${organizacionId}`;
}

/**
 * Escribe la cookie de sucursal preferida directamente en el navegador.
 */
export function setClientSucursalCookie(organizacionId: string, sucursalId: string): void {
  if (typeof document === "undefined") return;
  const name = sucursalCookieName(organizacionId);
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(sucursalId)}; path=/admin; max-age=${SUCURSAL_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * Lee la sucursal preferida guardada en las cookies del cliente para una organización.
 */
export function getClientSucursalCookie(organizacionId: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const name = sucursalCookieName(organizacionId);
  const prefix = `${name}=`;
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(prefix)) {
      const val = decodeURIComponent(trimmed.slice(prefix.length)).trim();
      return val || undefined;
    }
  }
  return undefined;
}

/**
 * Devuelve un mapa `organizacionId → sucursalId` de todas las cookies presentes en el cliente.
 */
export function getClientSucursalesMap(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const map: Record<string, string> = {};
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (!trimmed.startsWith(SUCURSAL_COOKIE_PREFIX)) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const organizacionId = trimmed.slice(SUCURSAL_COOKIE_PREFIX.length, eqIdx);
    const value = decodeURIComponent(trimmed.slice(eqIdx + 1)).trim();
    if (organizacionId && value) {
      map[organizacionId] = value;
    }
  }
  return map;
}
