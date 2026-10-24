import { cache } from "react";
import { updateTag } from "next/cache";

import { kvInvalidate, kvReadThrough } from "@/lib/kv-cache";
import { catalogosTicketCached } from "@/modules/pos/ticket";

/**
 * Tag de los catálogos del POS por organización. Los catálogos del ticket
 * (servicios, productos, paquetes, membresías, medios de pago, staff,
 * clientes, promociones) se sirven desde `unstable_cache`; cualquier acción
 * que muta esos catálogos debe llamar `revalidateCatalogos` para que el POS
 * vea el cambio de inmediato (el `revalidate: 60` del cache es el respaldo).
 * `updateTag` expira al instante (read-your-own-writes) y solo es válido en
 * Server Actions — que es donde viven todas las mutaciones de catálogos.
 */
export function catalogoTag(organizacionId: string): string {
  return `catalogos:${organizacionId}`;
}

export function catalogoKvKey(organizacionId: string, sucursalId: string): string {
  return `catalogo:pos:${organizacionId}:${sucursalId}`;
}

/**
 * Obtiene el catálogo activo del POS (servicios, productos, medios de pago,
 * impuestos, promociones y estilistas) cacheado en KV (TTL 300 s) y
 * deduplicado intra-request con `React.cache()`.
 */
export const obtenerCatalogoPosCacheado = cache(
  async (organizacionId: string, sucursalId: string) => {
    return kvReadThrough(
      catalogoKvKey(organizacionId, sucursalId),
      300,
      () => catalogosTicketCached(organizacionId, sucursalId),
    );
  },
);

export function revalidateCatalogos(organizacionId: string, sucursalId?: string): void {
  try {
    updateTag(catalogoTag(organizacionId));
  } catch {
    // updateTag solo es válido en Server Actions
  }
  if (sucursalId) {
    void kvInvalidate(catalogoKvKey(organizacionId, sucursalId));
  }
}

