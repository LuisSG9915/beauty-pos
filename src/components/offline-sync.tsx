"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listarVentasOffline, offlineDbDisponible, type VentaOffline } from "@/modules/offline/idb";
import { drenarColaOffline } from "@/modules/offline/sync-client";

/**
 * Drena la cola de ventas offline. Va montado en el layout admin: al cargar
 * cualquier página (y en el evento `online`) reenvía cada venta pendiente al
 * servidor. La venta solo se borra de IndexedDB cuando el servidor confirma —
 * si rechaza, queda en la cola con su error para reintento manual.
 */
export function OfflineSyncBadge() {
  const [pendientes, setPendientes] = useState<VentaOffline[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [sincronizando, setSincronizando] = useState(false);
  // Igual que en /offline/venta: no se lee `navigator.onLine` al montar para
  // no romper la hidratación; se corrige post-render y con los eventos.
  const [enLinea, setEnLinea] = useState(true);
  const busy = useRef(false);

  const refrescar = useCallback(async () => {
    if (!offlineDbDisponible()) return;
    const cola = await listarVentasOffline().catch(() => [] as VentaOffline[]);
    setPendientes(cola);
  }, []);

  const sincronizar = useCallback(async () => {
    if (busy.current || !offlineDbDisponible()) return;
    busy.current = true;
    setSincronizando(true);
    try {
      const fallas = await drenarColaOffline();
      setErrores(fallas);
      setEnLinea(!Object.values(fallas).includes("Sin conexión con el servidor."));
      await refrescar();
    } finally {
      busy.current = false;
      setSincronizando(false);
    }
  }, [refrescar]);

  useEffect(() => {
    const inicial = setTimeout(() => {
      setEnLinea(navigator.onLine);
      void refrescar();
      if (navigator.onLine) void sincronizar();
    }, 0);
    const onOnline = () => {
      setEnLinea(true);
      void sincronizar();
    };
    const onOffline = () => setEnLinea(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(inicial);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refrescar, sincronizar]);

  if (pendientes.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-warning/40 bg-accent/70 p-4 shadow-lg" role="status">
      <p className="text-sm font-semibold text-warning">
        {pendientes.length === 1 ? "1 venta offline por sincronizar" : `${pendientes.length} ventas offline por sincronizar`}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-warning">
        {pendientes.slice(0, 4).map((v) => (
          <li className="truncate" key={v.clave}>
            {new Date(v.cobradaAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
            {errores[v.clave] ? ` — ${errores[v.clave]}` : ""}
          </li>
        ))}
        {pendientes.length > 4 ? <li>y {pendientes.length - 4} más…</li> : null}
      </ul>
      <button
        className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--primary),black_10%)] disabled:opacity-50"
        disabled={sincronizando || !enLinea}
        onClick={() => void sincronizar()}
        type="button"
      >
        {sincronizando ? "Sincronizando…" : enLinea ? "Sincronizar ahora" : "Sin conexión"}
      </button>
    </div>
  );
}
