"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";

import { listarVentasOffline, offlineDbDisponible, type VentaOffline } from "@/modules/offline/idb";
import { drenarColaOffline } from "@/modules/offline/sync-client";

/**
 * Monitorea el estado de red y drena la cola de ventas offline.
 * Cuando se va la red, alerta al personal y ofrece acceso directo a la venta de emergencia.
 * Cuando regresa la conexión, sincroniza automáticamente las ventas guardadas en IndexedDB.
 */
export function OfflineSyncBadge() {
  const [pendientes, setPendientes] = useState<VentaOffline[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [sincronizando, setSincronizando] = useState(false);
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

  // Si está en línea y no hay ventas pendientes por sincronizar, no mostramos nada
  if (enLinea && pendientes.length === 0) return null;

  // Si se cortó el internet pero no hay ventas en cola aún: alerta proactiva
  if (!enLinea && pendientes.length === 0) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-destructive/40 bg-card/95 p-3.5 shadow-xl backdrop-blur-sm"
        role="status"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <WifiOff className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">Sin internet en el salón</p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Puedes seguir cobrando en la caja offline sin detenerte.
          </p>
        </div>
        <Link
          className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow-xs hover:bg-destructive/90 transition-colors"
          href="/offline/venta"
        >
          Cobrar
          <ArrowRight className="size-3" />
        </Link>
      </div>
    );
  }

  // Hay ventas pendientes por sincronizar (con o sin internet)
  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-84 rounded-2xl border border-warning/40 bg-card/95 p-4 shadow-xl backdrop-blur-sm"
      role="status"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {enLinea ? (
            <Wifi className="size-4 text-success" />
          ) : (
            <WifiOff className="size-4 text-warning" />
          )}
          <p className="text-sm font-semibold text-foreground">
            {pendientes.length === 1
              ? "1 venta offline pendiente"
              : `${pendientes.length} ventas offline pendientes`}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            enLinea ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
          }`}
        >
          {enLinea ? "En línea" : "Offline"}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {enLinea
          ? "Sincronizando con el servidor central para asentar en caja y contabilidad…"
          : "Guardadas de forma segura en tu navegador. Se sincronizarán automáticamente al volver la red."}
      </p>

      <ul className="space-y-1.5 text-xs text-foreground/90 max-h-32 overflow-y-auto mb-3 pr-1">
        {pendientes.slice(0, 4).map((v) => {
          const totalVenta = v.pagos.reduce((acc, p) => acc + Number(p.monto || 0), 0);
          const totalItems = v.servicios.length + v.productos.length;
          return (
            <li
              className="rounded-lg bg-muted/40 px-2.5 py-1 text-[11px]"
              key={v.clave}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">
                  {new Date(v.cobradaAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  {` · ${totalItems} item${totalItems === 1 ? "" : "s"}`}
                </span>
                <span className="font-semibold tabular-nums ml-2">${totalVenta.toFixed(2)}</span>
              </div>
              {errores[v.clave] ? (
                <p className="text-[10px] text-destructive truncate mt-0.5">{errores[v.clave]}</p>
              ) : null}
            </li>
          );
        })}
        {pendientes.length > 4 ? (
          <li className="text-[11px] text-muted-foreground text-center pt-1">
            + {pendientes.length - 4} ventas más en cola
          </li>
        ) : null}
      </ul>

      <div className="flex items-center gap-2">
        <button
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          disabled={sincronizando || !enLinea}
          onClick={() => void sincronizar()}
          type="button"
        >
          <RefreshCw className={`size-3.5 ${sincronizando ? "animate-spin" : ""}`} />
          {sincronizando ? "Sincronizando…" : enLinea ? "Sincronizar ahora" : "Esperando conexión…"}
        </button>
        <Link
          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors text-center"
          href="/offline/venta"
        >
          Caja offline
        </Link>
      </div>
    </div>
  );
}
