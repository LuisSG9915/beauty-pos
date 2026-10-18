import { cookies } from "next/headers";

/**
 * Preferencia de layout según el ancho del dispositivo.
 *
 * Las páginas admin con listados renderizan DOS layouts (tarjetas para
 * teléfono y tabla para escritorio) y el CSS oculta uno; en un salón que
 * entra todos los días desde el mismo equipo, el layout oculto es ~la mitad
 * del HTML y del render (medido: 6–14 ms y ~6–9 KB por fila duplicada).
 *
 * La elección vive en la cookie `melena_viewport`: el bootstrap inline la
 * fija/corrige antes de pintar y el servidor emite SOLO el layout que el
 * usuario verá. Sin cookie (primera visita) se emiten ambos como siempre —
 * mejora progresiva sin regresión ni CLS.
 */

export type ViewportPreference = "movil" | "escritorio";

export const VIEWPORT_COOKIE_NAME = "melena_viewport";
/** Un año, en segundos (misma vida que `melena_theme`). */
export const VIEWPORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Punto de corte `md` de Tailwind (el que usan los listados del proyecto). */
export const VIEWPORT_BREAKPOINT_PX = 768;

export function isViewportPreference(value: unknown): value is ViewportPreference {
  return value === "movil" || value === "escritorio";
}

/** Normaliza cualquier entrada a una preferencia válida; fallback `null`. */
export function parseViewportPreference(value: string | null | undefined): ViewportPreference | null {
  const normalized = value?.trim().toLowerCase();
  return isViewportPreference(normalized) ? normalized : null;
}

/**
 * Preferencia de layout guardada; `null` = sin cookie (primera visita: se
 * renderizan ambos layouts y el CSS decide).
 */
export async function leerViewportPreference(): Promise<ViewportPreference | null> {
  const store = await cookies();
  return parseViewportPreference(store.get(VIEWPORT_COOKIE_NAME)?.value);
}

/**
 * Bootstrap inline (antes de pintar): fija la cookie con el ancho actual y,
 * si ya existía con OTRO valor (cambio de dispositivo), la corrige y recarga
 * una sola vez para que el servidor re-renderice el layout correcto. Nunca
 * recarga en la primera visita (sin cookie).
 */
export const VIEWPORT_BOOTSTRAP_SCRIPT = `(function(){try{var bp=${VIEWPORT_BREAKPOINT_PX};var valor=window.matchMedia("(min-width: "+bp+"px)").matches?"escritorio":"movil";var match=document.cookie.match(/(?:^|; )${VIEWPORT_COOKIE_NAME}=([^;]*)/);var actual=match?match[1]:null;if(actual===valor)return;document.cookie="${VIEWPORT_COOKIE_NAME}="+valor+"; path=/; max-age=${VIEWPORT_COOKIE_MAX_AGE}; samesite=lax";if(actual)location.reload();}catch(e){}})();`;
