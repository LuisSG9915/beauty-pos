import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { MedioEntidad } from "@/db/schema/media";

/**
 * Límite y tipos aceptados para subir imágenes de catálogo/fichas. El cliente
 * comprime a webp ≤1600px antes de subir, así que 5 MB sobra incluso para
 * fotos de celular sin comprimir.
 */
export const MEDIO_MAX_BYTES = 5 * 1024 * 1024;

const MIME_A_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MEDIO_MIMES = Object.keys(MIME_A_EXT) as Array<keyof typeof MIME_A_EXT>;

export function extensionPorMime(mime: string): string | null {
  return MIME_A_EXT[mime] ?? null;
}

/**
 * Permiso requerido para subir/eliminar un medio según la entidad dueña.
 * producto/servicio → catálogos; ficha → expediente del cliente; compra →
 * compras (foto del ticket de compra, plan 10); mobiliario → plano del salón
 * (plan 11, se edita con el permiso de sucursales).
 */
export const PERMISO_POR_ENTIDAD: Record<MedioEntidad, string> = {
  producto: "catalogos.editar",
  servicio: "catalogos.editar",
  ficha: "clientes.editar",
  compra: "compras.editar",
  mobiliario: "sucursales.editar",
};

/**
 * Llave del objeto en R2: `{orgId}/{entidad}/{entidadId}/{uuid}` (sin
 * extensión — la extensión la añade el caller según el mime). La org va primero
 * para que el endpoint de servir pueda contrastar pertenencia con un lookup
 * barato en `medios`.
 */
export function claveMediaR2(
  organizacionId: string,
  entidad: MedioEntidad,
  entidadId: string,
  nombreArchivo: string,
): string {
  return `${organizacionId}/${entidad}/${entidadId}/${nombreArchivo}`;
}

/** URL de la app que sirve el objeto (route handler con control de acceso). */
export function urlMedio(claveR2: string): string {
  return `/api/medios/${encodeURI(claveR2)}`;
}

type RuntimeEnv = {
  MEDIA?: R2Bucket;
};

/**
 * Bucket R2 del Worker (`MEDIA` en wrangler.jsonc → `melena-media`). `null`
 * fuera de Cloudflare o si el binding no está configurado: los consumidores
 * deben degradar a "sin imagen" (placeholder), igual que `kv-cache.ts`.
 */
export function getMediaBucket(): R2Bucket | null {
  try {
    const context = getCloudflareContext({ async: false }) as { env: RuntimeEnv } | null;
    return context?.env.MEDIA ?? null;
  } catch {
    return null;
  }
}

/** Sube un objeto a R2. Devuelve `false` cuando el binding no existe. */
export async function mediaPut(
  claveR2: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream | Blob,
  mime: string,
): Promise<boolean> {
  const bucket = getMediaBucket();
  if (!bucket) return false;
  await bucket.put(claveR2, body, {
    httpMetadata: { contentType: mime },
  });
  return true;
}

/** Lee un objeto de R2; `null` si no existe o el binding falta. */
export async function mediaGet(claveR2: string): Promise<R2ObjectBody | null> {
  const bucket = getMediaBucket();
  if (!bucket) return null;
  return bucket.get(claveR2);
}

/** Borra un objeto de R2; no lanza si el binding no existe. */
export async function mediaDelete(claveR2: string): Promise<void> {
  const bucket = getMediaBucket();
  if (!bucket) return;
  await bucket.delete(claveR2);
}
