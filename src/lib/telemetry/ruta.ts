const SEGMENTO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENTO_ID_LARGO = /^[0-9a-z-]{16,}$/i;

/**
 * Normaliza un pathname a su patrón de ruta para métricas y diagnóstico:
 * quita query/hash, sustituye UUIDs e IDs largos por `[id]` y recorta a 160
 * caracteres. Así `/admin/clientes/8f3a…` agrega como `/admin/clientes/[id]`
 * y nunca persiste identificadores ni parámetros con datos sensibles.
 */
export function normalizarRuta(pathname: string): string {
  const sinQuery = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const segmentos = sinQuery
    .split("/")
    .map((segmento) =>
      SEGMENTO_UUID.test(segmento) || SEGMENTO_ID_LARGO.test(segmento)
        ? "[id]"
        : segmento,
    );
  return segmentos.join("/").slice(0, 160) || "/";
}

/** Módulo funcional inferido de la ruta normalizada (para agrupar reportes). */
export function moduloDeRuta(ruta: string | null | undefined): string {
  if (!ruta) return "otro";
  if (ruta.startsWith("/admin/agenda") || ruta.startsWith("/admin/mi-dia")) return "agenda";
  if (ruta.startsWith("/admin/pos") || ruta.startsWith("/admin/ventas")) return "pos";
  if (ruta.startsWith("/admin/caja")) return "caja";
  if (ruta.startsWith("/reservar") || ruta.startsWith("/mi-cita")) return "reservas";
  if (ruta.startsWith("/admin/clientes")) return "clientes";
  if (ruta.startsWith("/admin/inventario") || ruta.startsWith("/admin/productos")) return "inventario";
  if (ruta.startsWith("/login") || ruta.startsWith("/registro")) return "auth";
  if (ruta.startsWith("/admin")) return "admin";
  return "otro";
}
