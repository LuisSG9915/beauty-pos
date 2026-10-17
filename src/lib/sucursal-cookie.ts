/**
 * Preferencia de sucursal persistente por organización.
 *
 * La elección vive en la cookie `melena_sucursal_{organizacionId}` — httpOnly
 * (solo el servidor la lee/escribe) para que llegue al primer render sin
 * parpadeo y no pueda manipularse desde JS del cliente. Se escribe únicamente
 * desde la server action `guardarSucursalPreferida`, que valida el alcance
 * del usuario antes de persistirla; en la lectura siempre se vuelve a validar
 * contra las sucursales visibles, así que un valor manipulado u obsoleto se
 * ignora sin error.
 *
 * `path=/admin` limita la cookie al panel y `max-age` la conserva 90 días.
 */
import { cookies } from "next/headers";
import {
  SUCURSAL_COOKIE_MAX_AGE,
  SUCURSAL_COOKIE_PREFIX,
  sucursalCookieName,
} from "./sucursal-cookie-client";

export {
  SUCURSAL_COOKIE_MAX_AGE,
  SUCURSAL_COOKIE_PREFIX,
  sucursalCookieName,
};

/**
 * Lee la sucursal preferida de una organización. El valor NO es confiable:
 * validarlo siempre contra las sucursales del alcance del usuario.
 */
export async function leerSucursalCookie(
  organizacionId: string,
): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(sucursalCookieName(organizacionId))?.value?.trim();
  return value ? value : undefined;
}

/** Persiste la preferencia tras haber validado el alcance en la acción. */
export async function escribirSucursalCookie(
  organizacionId: string,
  sucursalId: string,
): Promise<void> {
  const store = await cookies();
  store.set(sucursalCookieName(organizacionId), sucursalId, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: SUCURSAL_COOKIE_MAX_AGE,
  });
}

/**
 * Mapa `organizacionId → sucursalId` con todas las preferencias guardadas.
 * El layout lo pasa al shell (cliente) para que el selector muestre la misma
 * sucursal que el servidor resolvió con la cookie httpOnly.
 */
export async function leerSucursalesCookieMap(): Promise<Record<string, string>> {
  const store = await cookies();
  const mapa: Record<string, string> = {};
  for (const cookie of store.getAll()) {
    if (!cookie.name.startsWith(SUCURSAL_COOKIE_PREFIX)) continue;
    const organizacionId = cookie.name.slice(SUCURSAL_COOKIE_PREFIX.length);
    const value = cookie.value?.trim();
    if (organizacionId && value) mapa[organizacionId] = value;
  }
  return mapa;
}

/*
 * Descarte de la tarjeta "¿Cómo se llama tu salón?" del inicio: cuando el
 * usuario la cierra sin renombrar, `melena_nombre_sucursal_{sucursalId}`
 * queda marcada y la tarjeta no vuelve a aparecer (el nombre sigue siendo
 * el genérico; renombrarla después vuelve a dejarla sin efecto porque la
 * condición de la tarjeta deja de cumplirse).
 */
export const NOMBRE_SUCURSAL_COOKIE_PREFIX = "melena_nombre_sucursal_";

export async function leerNombreSucursalOmitida(sucursalId: string): Promise<boolean> {
  const store = await cookies();
  return store.get(`${NOMBRE_SUCURSAL_COOKIE_PREFIX}${sucursalId}`)?.value === "omitida";
}

/** Marca el descarte de la tarjeta de nombre para una sucursal. */
export async function escribirNombreSucursalOmitida(sucursalId: string): Promise<void> {
  const store = await cookies();
  store.set(`${NOMBRE_SUCURSAL_COOKIE_PREFIX}${sucursalId}`, "omitida", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: SUCURSAL_COOKIE_MAX_AGE,
  });
}
