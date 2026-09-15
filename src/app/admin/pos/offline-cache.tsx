"use client";

import { useEffect } from "react";

import { guardarCatalogoOffline, offlineDbDisponible, type OfflineCatalogo } from "@/modules/offline/idb";

/**
 * Persiste en IndexedDB el catálogo que el ticket ya cargó del servidor.
 * Cada visita al POS en línea refresca el snapshot, de modo que `/offline/venta`
 * tiene precios y medios de pago recientes cuando falte la conexión.
 */
export function OfflineCatalogoCache({ catalogo }: { catalogo: OfflineCatalogo }) {
  useEffect(() => {
    if (!offlineDbDisponible()) return;
    guardarCatalogoOffline(catalogo).catch(() => {
      // IndexedDB lleno/deshabilitado: el modo offline no estará disponible.
    });
  }, [catalogo]);
  return null;
}
