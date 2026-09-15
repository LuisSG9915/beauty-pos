"use client";

import { sincronizarVentaOffline } from "@/app/admin/pos/offline-actions";

import { eliminarVentaOffline, listarVentasOffline } from "./idb";

/**
 * Reenvía al servidor cada venta encolada en IndexedDB. Solo se elimina de la
 * cola cuando el servidor confirma (`success`): un rechazo permanente deja la
 * venta visible con su error y un corte de red detiene el drenado para
 * reintentar después. La idempotencia del servidor hace seguro reenviar una
 * venta ya aplicada.
 */
export async function drenarColaOffline(): Promise<Record<string, string>> {
  const cola = await listarVentasOffline().catch(() => []);
  const fallas: Record<string, string> = {};
  for (const venta of cola) {
    try {
      const res = await sincronizarVentaOffline(venta);
      if (res.success) {
        await eliminarVentaOffline(venta.clave).catch(() => {});
      } else {
        fallas[venta.clave] = res.error ?? "No se pudo sincronizar.";
      }
    } catch {
      fallas[venta.clave] = "Sin conexión con el servidor.";
      break;
    }
  }
  return fallas;
}
