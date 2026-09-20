import { updateTag } from "next/cache";

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

export function revalidateCatalogos(organizacionId: string): void {
  updateTag(catalogoTag(organizacionId));
}
