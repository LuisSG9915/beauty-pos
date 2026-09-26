"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { getZonedParts } from "@/modules/agenda";

/** Media query como external store (sin hydration mismatch en SSR). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Minuto actual del día en la zona de la sucursal; null si no es hoy. */
export function useMinutoActual(fecha: string, timeZone: string) {
  const [minuto, setMinuto] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const parts = getZonedParts(new Date(), timeZone);
      setMinuto(parts.dayKey === fecha ? parts.minutosDelDia : null);
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [fecha, timeZone]);
  return minuto;
}
