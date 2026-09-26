/**
 * Preferencia de tema global de Melena (Bugambilia).
 *
 * La elección vive en la cookie `melena_theme` — accesible desde JS (no
 * HttpOnly) para que el bootstrap inline del layout la lea antes del primer
 * paint sin pasar por `cookies()` del servidor (eso rompería el prerender).
 * Valores válidos: "system" | "light" | "dark"; cualquier valor ausente o
 * inválido se interpreta como "system".
 *
 * Flujo:
 *  - `BOOTSTRAP_SCRIPT` (inline en <head>) aplica `.dark` + data-* + el meta
 *    theme-color durante el parseo del HTML.
 *  - `ThemeRuntime` re-aplica tras hidratación y escucha prefers-color-scheme
 *    mientras la preferencia sea "system".
 *  - `ThemeModeSelector` persiste con `persistThemePreference` y avisa por
 *    `THEME_CHANGE_EVENT` (misma pestaña) y por un espejo en localStorage
 *    `THEME_STORAGE_KEY` (evento `storage`, otras pestañas).
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const satisfies readonly ThemePreference[];

export const THEME_COOKIE_NAME = "melena_theme";
/** Espejo en localStorage para sincronizar pestañas (evento `storage`). */
export const THEME_STORAGE_KEY = "melena_theme";
/** Evento custom emitido al cambiar la preferencia en la pestaña actual. */
export const THEME_CHANGE_EVENT = "melena:theme-change";
/** Un año, en segundos. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Color del chrome del navegador por modo resuelto. Debe mantenerse en sync
 * con `--background` de globals.css.
 */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#faf9fb",
  dark: "#1a1117",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Normaliza cualquier entrada a una preferencia válida; fallback "system". */
export function parseThemePreference(value: string | null | undefined): ThemePreference {
  const normalized = value?.trim().toLowerCase();
  return isThemePreference(normalized) ? normalized : "system";
}

/**
 * El panel operativo (`/admin`) arranca en claro aunque el SO esté en oscuro:
 * el público objetivo trabaja de día en salones iluminados y el modo claro es
 * la experiencia diseñada por defecto. Quien elija "Oscuro" explícitamente lo
 * conserva; fuera de /admin "system" sigue al SO.
 */
export const ADMIN_DEFAULT_THEME_PREFIX = "/admin";

function isAdminPathname(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith(ADMIN_DEFAULT_THEME_PREFIX)
  );
}

/**
 * Resuelve el modo efectivo: explícito, o el del sistema si es "system" —
 * salvo en /admin, donde "system" cae a claro (`adminDefaultLight`).
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
  adminDefaultLight = false,
): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  if (adminDefaultLight) return "light";
  return systemPrefersDark ? "dark" : "light";
}

/** Color del meta theme-color para un modo resuelto. */
export function themeColorFor(resolved: ResolvedTheme): string {
  return THEME_COLOR[resolved];
}

/**
 * Extrae la preferencia de una cadena de cookies (`document.cookie` o el
 * header Cookie). Tolera espacios, valores codificados y `=` dentro del valor.
 */
export function readThemePreferenceCookie(cookieString: string | null | undefined): ThemePreference {
  if (!cookieString) return "system";
  for (const pair of cookieString.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== THEME_COOKIE_NAME) continue;
    let value = pair.slice(separator + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // Valor mal codificado: se trata como inválido → "system".
    }
    return parseThemePreference(value);
  }
  return "system";
}

/** Serializa la cookie completa para asignar a `document.cookie`. */
export function serializeThemeCookie(preference: ThemePreference): string {
  const value = isThemePreference(preference) ? preference : "system";
  return `${THEME_COOKIE_NAME}=${value}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Preferencia vigente leída de `document.cookie` ("system" fuera del navegador). */
export function currentThemePreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  return readThemePreferenceCookie(document.cookie);
}

/**
 * Aplica la preferencia al documento: clase `.dark`, atributos
 * `data-theme-preference`/`data-theme-resolved`, `color-scheme` inline y un
 * meta `theme-color` propio (`data-theme-runtime`). No toca metadatos de
 * Next: mutar nodos administrados por React antes de hidratar rompe la
 * navegación cliente al desmontar la ruta anterior.
 */
export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference, systemPrefersDark(), isAdminPathname());
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme-preference", preference);
  root.setAttribute("data-theme-resolved", resolved);
  root.style.colorScheme = resolved;
  const color = themeColorFor(resolved);
  const metas = document.querySelectorAll('meta[name="theme-color"][data-theme-runtime="true"]');
  let meta = metas[0];
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("data-theme-runtime", "true");
    (document.head ?? root).appendChild(meta);
  }
  meta.setAttribute("content", color);
  for (let index = 1; index < metas.length; index += 1) {
    metas[index].remove();
  }
  return resolved;
}

/**
 * Persiste y aplica la preferencia: cookie de un año, espejo en localStorage
 * (sincroniza otras pestañas vía `storage`) y evento `THEME_CHANGE_EVENT`
 * para los controles de esta pestaña.
 */
export function persistThemePreference(preference: ThemePreference): ResolvedTheme {
  const value = isThemePreference(preference) ? preference : "system";
  document.cookie = serializeThemeCookie(value);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // localStorage puede estar bloqueado; la cookie basta.
  }
  const resolved = applyThemePreference(value);
  window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: value }));
  return resolved;
}

/**
 * Suscripción para `useSyncExternalStore`: avisa cuando cambia la preferencia
 * en esta pestaña (`THEME_CHANGE_EVENT`) o en otra (`storage` del espejo).
 */
export function subscribeThemePreference(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) callback();
  };
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Script inline mínimo que corre en <head> antes del primer paint. Replica
 * `applyThemePreference` sin dependencias: lee la cookie, resuelve "system"
 * con matchMedia (claro fijo bajo /admin), fija `.dark` + data-* +
 * color-scheme y sincroniza un meta theme-color propio marcado con
 * `data-theme-runtime`.
 * Va envuelto en try/catch: si falla, la página queda en claro, sin error.
 */
export const BOOTSTRAP_SCRIPT = `(function(){try{var d=document.documentElement;var p="system";var cs=document.cookie.split(";");for(var i=0;i<cs.length;i++){var at=cs[i].indexOf("=");if(at<0)continue;if(cs[i].slice(0,at).trim()==="${THEME_COOKIE_NAME}"){var v=cs[i].slice(at+1).trim();try{v=decodeURIComponent(v)}catch(x){}if(v==="light"||v==="dark")p=v;break;}}var r=p;if(p==="system"){r=location.pathname.indexOf("${ADMIN_DEFAULT_THEME_PREFIX}")===0?"light":(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}d.classList.toggle("dark",r==="dark");d.setAttribute("data-theme-preference",p);d.setAttribute("data-theme-resolved",r);d.style.colorScheme=r;var c=r==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}";var els=document.querySelectorAll('meta[name="theme-color"][data-theme-runtime="true"]');var el=els[0];if(!el){el=document.createElement("meta");el.setAttribute("name","theme-color");el.setAttribute("data-theme-runtime","true");(document.head||d).appendChild(el);}el.setAttribute("content",c);for(var j=1;j<els.length;j++){els[j].remove();}}catch(e){}})();`;
