"use client";

import { useEffect } from "react";

import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyThemePreference,
  currentThemePreference,
} from "@/lib/theme-preference";

/**
 * Mantiene el tema sincronizado después del bootstrap inline del layout:
 *
 * - Re-aplica al montar (en dev, Strict Mode remonta y React limpia los
 *   atributos que el script dejó en <html>; en producción es un no-op).
 * - Escucha `prefers-color-scheme` solo mientras la preferencia sea
 *   "system": con elección explícita el OS no debe mover el tema.
 * - Re-aplica ante `THEME_CHANGE_EVENT` (selectores de esta pestaña) y ante
 *   `storage` de la llave espejo (otras pestañas).
 *
 * Va montado una sola vez en el root layout; no renderiza nada.
 */
export function ThemeRuntime() {
  useEffect(() => {
    const apply = () => {
      applyThemePreference(currentThemePreference());
    };
    apply();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (currentThemePreference() === "system") apply();
    };
    const onThemeChange = () => apply();
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) apply();
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
