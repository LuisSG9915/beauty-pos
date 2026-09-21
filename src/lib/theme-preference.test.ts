import { describe, expect, it } from "vitest";

import {
  BOOTSTRAP_SCRIPT,
  THEME_CHANGE_EVENT,
  THEME_COLOR,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  currentThemePreference,
  isThemePreference,
  parseThemePreference,
  readThemePreferenceCookie,
  resolveTheme,
  serializeThemeCookie,
  themeColorFor,
} from "@/lib/theme-preference";

describe("theme preference", () => {
  it("define exactamente los tres valores soportados", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "light", "dark"]);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference("")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(3)).toBe(false);
  });

  it("parse: valor inválido o ausente cae en system", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference(" Dark ")).toBe("dark");
    expect(parseThemePreference("LIGHT")).toBe("light");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference("")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
  });

  it("resolve: explícito gana; system sigue al SO", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("serializa la cookie con Path=/, SameSite=Lax y un año", () => {
    const cookie = serializeThemeCookie("dark");
    expect(cookie).toBe(
      `${THEME_COOKIE_NAME}=dark; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`,
    );
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
    expect(cookie.toLowerCase()).not.toContain("httponly");
    // Defensa: preferencia inválida serializa como system.
    expect(serializeThemeCookie("neon" as never)).toContain(`${THEME_COOKIE_NAME}=system`);
  });

  it("lee la preferencia desde una cadena de cookies", () => {
    expect(readThemePreferenceCookie("melena_theme=dark")).toBe("dark");
    expect(readThemePreferenceCookie("otra=1; melena_theme=light ; mas=2")).toBe("light");
    expect(readThemePreferenceCookie("melena_theme=%22dark%22")).toBe("system"); // comillas → inválido
    expect(readThemePreferenceCookie("melena_theme=neon")).toBe("system");
    expect(readThemePreferenceCookie("session=abc; otro=melena_theme")).toBe("system");
    expect(readThemePreferenceCookie("melena_theme")).toBe("system");
    expect(readThemePreferenceCookie("")).toBe("system");
    expect(readThemePreferenceCookie(null)).toBe("system");
    // Toma la primera aparición si hubiera duplicados.
    expect(readThemePreferenceCookie("melena_theme=dark; melena_theme=light")).toBe("dark");
  });

  it("expone los colores de chrome coherentes con globals.css", () => {
    expect(THEME_COLOR.light).toBe("#faf9fb");
    expect(THEME_COLOR.dark).toBe("#1a1117");
    expect(themeColorFor("dark")).toBe("#1a1117");
    expect(themeColorFor("light")).toBe("#faf9fb");
  });

  it("BOOTSTRAP_SCRIPT es autocontenido y cubre el flujo completo", () => {
    expect(BOOTSTRAP_SCRIPT.startsWith("(function(){try{")).toBe(true);
    expect(BOOTSTRAP_SCRIPT.endsWith(")();")).toBe(true);
    expect(BOOTSTRAP_SCRIPT).toContain(THEME_COOKIE_NAME);
    expect(BOOTSTRAP_SCRIPT).toContain('matchMedia("(prefers-color-scheme: dark)")');
    expect(BOOTSTRAP_SCRIPT).toContain('classList.toggle("dark"');
    expect(BOOTSTRAP_SCRIPT).toContain('data-theme-preference');
    expect(BOOTSTRAP_SCRIPT).toContain('data-theme-resolved');
    expect(BOOTSTRAP_SCRIPT).toContain('meta[name="theme-color"]');
    expect(BOOTSTRAP_SCRIPT).toContain('data-theme-runtime="true"');
    expect(BOOTSTRAP_SCRIPT).toContain('querySelectorAll');
    expect(BOOTSTRAP_SCRIPT).toContain('els[j].remove()');
    expect(BOOTSTRAP_SCRIPT).toContain(THEME_COLOR.light);
    expect(BOOTSTRAP_SCRIPT).toContain(THEME_COLOR.dark);
    // Sin saltos de línea: seguro para dangerouslySetInnerHTML.
    expect(BOOTSTRAP_SCRIPT).not.toContain("\n");
  });

  it("en entorno sin document la preferencia actual es system", () => {
    // vitest corre en environment "node": no hay document.
    expect(currentThemePreference()).toBe("system");
  });

  it("las claves de sincronización son estables", () => {
    expect(THEME_COOKIE_NAME).toBe("melena_theme");
    expect(THEME_STORAGE_KEY).toBe("melena_theme");
    expect(THEME_CHANGE_EVENT).toBe("melena:theme-change");
  });
});
