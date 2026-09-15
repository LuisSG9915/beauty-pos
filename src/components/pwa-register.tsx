"use client";

import { useEffect } from "react";

/**
 * Registra `/sw.js` solo en producción: en desarrollo el cache de chunks de
 * `/_next/static` dejaría obsoleto el hot-reload.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // El SW es progresivo: la app sigue funcionando sin él.
    });
  }, []);
  return null;
}
