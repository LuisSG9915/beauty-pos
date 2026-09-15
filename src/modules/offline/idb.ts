/**
 * IndexedDB del POS offline. Dos stores:
 * - `catalogo`: snapshot del catálogo por sucursal (servicios, productos,
 *   medios de pago y staff) escrito cada vez que el ticket se ve en línea.
 * - `ventas`: ventas cobradas sin conexión, aún no confirmadas por el servidor.
 * La venta solo sale de la cola cuando `sincronizarVentaOffline` devuelve
 * éxito — mientras tanto la UI la muestra como "por sincronizar", nunca
 * como cobrada, porque la confirmación real la da el servidor.
 */

export type OfflineCatalogo = {
  organizacionId: string;
  sucursalId: string;
  sucursalNombre: string;
  moneda: string;
  guardadoAt: string;
  servicios: Array<{ id: string; nombre: string; precio: string }>;
  productos: Array<{ id: string; nombre: string; precio: string }>;
  mediosPago: Array<{ id: string; nombre: string; categoria: string }>;
  staff: Array<{ id: string; nombre: string }>;
};

export type LineaOffline = {
  id: string;
  usuarioId: string | null;
  nombre: string;
  precio: string;
  cantidad: number;
};

export type PagoOffline = {
  medioPagoId: string;
  monto: string;
  referencia: string | null;
};

export type VentaOffline = {
  /** UUID generado en el dispositivo; también es la clave de idempotencia. */
  clave: string;
  organizacionId: string;
  sucursalId: string;
  /** Marca local de cuándo se "cobró" sin conexión. */
  cobradaAt: string;
  notas: string | null;
  servicios: LineaOffline[];
  productos: LineaOffline[];
  pagos: PagoOffline[];
};

const DB_NAME = "beauty-pos-offline";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("catalogo")) {
        db.createObjectStore("catalogo", { keyPath: "sucursalId" });
      }
      if (!db.objectStoreNames.contains("ventas")) {
        db.createObjectStore("ventas", { keyPath: "clave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("No se pudo abrir IndexedDB."));
  });
}

function txDone(req: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    req.oncomplete = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Error de IndexedDB."));
    req.onabort = () => reject(req.error ?? new Error("Transacción de IndexedDB abortada."));
  });
}

export function offlineDbDisponible() {
  return typeof indexedDB !== "undefined";
}

export async function guardarCatalogoOffline(catalogo: OfflineCatalogo) {
  const db = await openDb();
  const tx = db.transaction("catalogo", "readwrite");
  tx.objectStore("catalogo").put({ ...catalogo, guardadoAt: new Date().toISOString() });
  await txDone(tx);
}

export async function leerCatalogoOffline(sucursalId: string): Promise<OfflineCatalogo | null> {
  const db = await openDb();
  const tx = db.transaction("catalogo", "readonly");
  const req = tx.objectStore("catalogo").get(sucursalId);
  const value = await new Promise<OfflineCatalogo | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as OfflineCatalogo | undefined);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx).catch(() => {});
  return value ?? null;
}

export async function leerUltimoCatalogoOffline(): Promise<OfflineCatalogo | null> {
  const db = await openDb();
  const tx = db.transaction("catalogo", "readonly");
  const req = tx.objectStore("catalogo").getAll();
  const values = await new Promise<OfflineCatalogo[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as OfflineCatalogo[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx).catch(() => {});
  return values.sort((a, b) => b.guardadoAt.localeCompare(a.guardadoAt))[0] ?? null;
}

export async function encolarVentaOffline(venta: VentaOffline) {
  const db = await openDb();
  const tx = db.transaction("ventas", "readwrite");
  tx.objectStore("ventas").put(venta);
  await txDone(tx);
}

export async function listarVentasOffline(): Promise<VentaOffline[]> {
  const db = await openDb();
  const tx = db.transaction("ventas", "readonly");
  const req = tx.objectStore("ventas").getAll();
  const values = await new Promise<VentaOffline[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as VentaOffline[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx).catch(() => {});
  return values.sort((a, b) => a.cobradaAt.localeCompare(b.cobradaAt));
}

export async function eliminarVentaOffline(clave: string) {
  const db = await openDb();
  const tx = db.transaction("ventas", "readwrite");
  tx.objectStore("ventas").delete(clave);
  await txDone(tx);
}
