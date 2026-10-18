"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

import {
  THEME_PREFERENCES,
  persistThemePreference,
  subscribeThemePreference,
  currentThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
] as const satisfies readonly { value: ThemePreference; label: string; Icon: typeof Sun }[];

/** Snapshot del servidor/hidratación: la preferencia real solo existe en el cliente. */
const serverSnapshot = (): ThemePreference => "system";

type ThemeModeSelectorProps = {
  className?: string;
  /** Oculta el texto y deja solo el icono (contextos compactos). */
  iconOnly?: boolean;
};

/**
 * Selector Sistema/Claro/Oscuro. Persiste en la cookie `melena_theme` y
 * aplica el modo de inmediato; el snapshot de servidor es "system" para no
 * romper la hidratación (el bootstrap ya pintó el tema correcto de todos
 * modos). Funciona en admin y en páginas públicas: no depende de ningún shell.
 */
export function ThemeModeSelector({ className, iconOnly = false }: ThemeModeSelectorProps) {
  // useSyncExternalStore: el render de hidratación usa el snapshot de
  // servidor y React relee la cookie al montar — sin mismatch y sin efecto
  // de "cargar estado" manual.
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    currentThemePreference,
    serverSnapshot,
  );

  const select = useCallback((next: ThemePreference) => {
    persistThemePreference(next);
  }, []);

  // Patrón radiogroup: flechas/Home/End mueven la selección entre opciones.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const current = THEME_PREFERENCES.indexOf(preference);
      let index: number;
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = THEME_PREFERENCES.length - 1;
      else {
        const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        index = (current + delta + THEME_PREFERENCES.length) % THEME_PREFERENCES.length;
      }
      select(THEME_PREFERENCES[index]);
      // Mueve el foco al botón recién elegido (comportamiento de radiogroup).
      event.currentTarget
        .querySelectorAll<HTMLButtonElement>("[role=radio]")
        [index]?.focus();
    },
    [preference, select],
  );

  return (
    <div
      aria-label="Tema de color"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted p-1",
        className,
      )}
      onKeyDown={onKeyDown}
      role="radiogroup"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const checked = preference === value;
        return (
          <button
            aria-checked={checked}
            aria-label={label}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-op-xs font-medium transition-colors",
              checked
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
            key={value}
            onClick={() => select(value)}
            role="radio"
            title={label}
            // El grupo se navega con flechas; solo la opción activa va al Tab.
            tabIndex={checked ? 0 : -1}
            type="button"
          >
            <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {iconOnly ? <span className="sr-only">{label}</span> : label}
          </button>
        );
      })}
    </div>
  );
}
