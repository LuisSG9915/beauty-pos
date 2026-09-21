import type { Metadata } from "next";

import { OfflineVenta } from "./offline-venta";

export const metadata: Metadata = { title: "Venta sin conexión" };

/**
 * Ticket de emergencia sin conexión. El HTML es estático (sin datos de la
 * organización) para que el service worker pueda precachearlo; el catálogo y
 * la cola viven en IndexedDB.
 */
export default function OfflineVentaPage() {
  return <OfflineVenta />;
}
