import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { after, type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { productos, servicios } from "@/db/schema/catalogs";
import { medios, type MedioEntidad } from "@/db/schema/media";
import { citas, reservasGestionTokens } from "@/db/schema/operations";
import { getApiSessionUser } from "@/lib/auth/access";
import { hasPermission, resolveAccessSafe } from "@/lib/auth/authorization";
import { catalogoTag } from "@/lib/catalogo-cache";
import { getMediaBucket, mediaDelete, mediaGet, PERMISO_POR_ENTIDAD } from "@/lib/media";
import { kvInvalidate, kvReadThrough } from "@/lib/kv-cache";
import { hashTokenGestion } from "@/modules/reservas/gestion";

type RouteParams = { params: Promise<{ key: string[] }> };

const PREFIJOS_PUBLICOS = new Set([
  "productos",
  "servicios",
  "logos",
  "organizaciones",
  "portafolio",
  "producto",
  "servicio",
  "logo",
  "organizacion",
]);

/**
 * Parsea los segmentos de la llave.
 * Soporta formato canónico de R2 `{prefijo}/{orgId}/...` y el formato
 * estructurado `{orgId}/{entidad}/{entidadId}/{uuid}.{ext}`.
 */
function parsearClaveMedio(segments: string[] | undefined): {
  clave: string;
  prefix: string;
  organizacionId: string;
  esPublico: boolean;
} | null {
  if (!segments || segments.length < 2) return null;
  const clave = decodeURIComponent(segments.join("/"));

  const isUuid = (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  let prefix: string;
  let organizacionId: string;

  if (isUuid(segments[0])) {
    // Formato `{orgId}/{entidad}/{entidadId}/{uuid}.{ext}`
    organizacionId = segments[0];
    prefix = segments[1] ?? "";
  } else {
    // Formato `{prefijo}/{orgId}/...`
    prefix = segments[0] ?? "";
    organizacionId = segments[1] ?? "";
  }

  const esPublico = PREFIJOS_PUBLICOS.has(prefix.toLowerCase());
  return { clave, prefix, organizacionId, esPublico };
}

/**
 * Sirve una imagen de R2.
 * Prefijos públicos: productos, servicios, logos, organizaciones, portafolio.
 * Se cachean en `caches.default` de Cloudflare Edge y responden con Cache-Control inmutable.
 * Prefijos privados: compras, clientes, expedientes (y cualquier otro no público).
 * Requieren sesión activa y validación de membresía en la organización.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const segments = (await params).key;
  const parsed = parsearClaveMedio(segments);
  if (!parsed) return new Response(null, { status: 404 });

  const { clave, prefix, organizacionId, esPublico } = parsed;

  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(request.url, { method: "GET" });

  // 1. Si el prefijo es público: consultar primero la Cache API del edge
  if (esPublico && cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch {
      // Degradar si la Cache API falla
    }
  }

  // 2. Si el prefijo es privado: validar sesión y pertenencia a la organización
  if (!esPublico) {
    let autorizado = false;
    const user = await getApiSessionUser();

    // Soporte para acceso a fichas/expedientes con token seguro de cita (WhatsApp/email)
    const entidadLower = prefix.toLowerCase();
    if (entidadLower === "ficha" || entidadLower === "expedientes" || entidadLower === "expediente") {
      const token = request.nextUrl.searchParams.get("token");
      if (token && /^[0-9a-f]{64}$/i.test(token)) {
        const tokenHash = hashTokenGestion(token);
        const db = getDatabase();
        const [tokenRow] = await db
          .select({ id: reservasGestionTokens.id })
          .from(reservasGestionTokens)
          .innerJoin(citas, eq(reservasGestionTokens.citaId, citas.id))
          .where(
            and(
              eq(reservasGestionTokens.tokenHash, tokenHash),
              eq(citas.organizacionId, organizacionId),
              isNull(reservasGestionTokens.revocadoAt),
              eq(citas.activo, true),
            ),
          )
          .limit(1);
        if (tokenRow) autorizado = true;
      }
    }

    if (!autorizado) {
      if (!user) {
        return new Response(null, { status: 401 });
      }
      const access = await resolveAccessSafe(organizacionId, user);
      if (!access) {
        return new Response(null, { status: 403 });
      }
    }
  }

  // Sin binding de almacenamiento R2 (entornos sin Cloudflare), devolver 404
  if (!getMediaBucket()) return new Response(null, { status: 404 });

  // Lectura de metadata amortiguada con Cloudflare KV (24h de TTL)
  const medio = await kvReadThrough<{ organizacionId: string; mime: string; activo: boolean } | null>(
    `medio:${clave}`,
    86400,
    async () => {
      const db = getDatabase();
      const [row] = await db
        .select({
          organizacionId: medios.organizacionId,
          mime: medios.mime,
          activo: medios.activo,
        })
        .from(medios)
        .where(eq(medios.claveR2, clave))
        .limit(1);
      return row ?? null;
    },
  );

  // La fila debe estar activa y coincidir con la organización si existe registro
  if (medio && (!medio.activo || medio.organizacionId !== organizacionId)) {
    return new Response(null, { status: 404 });
  }

  const objeto = await mediaGet(clave);
  if (!objeto) return new Response(null, { status: 404 });

  const cacheControl = esPublico
    ? "public, max-age=31536000, immutable"
    : "private, max-age=3600";

  const baseHeaders = new Headers({
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  });
  if (objeto.httpEtag) {
    baseHeaders.set("ETag", objeto.httpEtag);
  }
  if (objeto.httpEtag && request.headers.get("if-none-match") === objeto.httpEtag) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  objeto.writeHttpMetadata?.(baseHeaders);
  if (!baseHeaders.has("content-type")) {
    baseHeaders.set("content-type", medio?.mime ?? "image/webp");
  }
  baseHeaders.set("content-length", String(objeto.size));

  const response = new Response(objeto.body as unknown as BodyInit, { headers: baseHeaders });

  // Guardar en Cache API del edge para prefijos públicos
  if (esPublico && cache) {
    const responseToCache = response.clone();
    try {
      after(async () => {
        try {
          await cache.put(cacheKey, responseToCache);
        } catch (e) {
          console.error("[medios-cache-put]", e);
        }
      });
    } catch {
      cache.put(cacheKey, responseToCache).catch(() => {});
    }
  }

  return response;
}

/**
 * Elimina un medio: borra la fila `medios` y el objeto R2. Si era la imagen
 * principal de un producto/servicio, promueve la más reciente que quede (o
 * limpia `imagen_principal_id`). Las fotos de ficha quedan apuntando a llaves
 * inexistentes → el `<img>` devuelve 404 y se ve el hueco, sin tronar.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const segments = (await params).key;
  const parsed = parsearClaveMedio(segments);
  if (!parsed) return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });

  const { clave, organizacionId } = parsed;

  const user = await getApiSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para eliminar imágenes." }, { status: 401 });
  }

  const db = getDatabase();
  const [medio] = await db
    .select({
      id: medios.id,
      organizacionId: medios.organizacionId,
      entidad: medios.entidad,
      entidadId: medios.entidadId,
      principal: medios.principal,
      activo: medios.activo,
    })
    .from(medios)
    .where(eq(medios.claveR2, clave))
    .limit(1);
  if (!medio || !medio.activo || medio.organizacionId !== organizacionId) {
    return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });
  }

  const entidad = medio.entidad as MedioEntidad;
  const access = await resolveAccessSafe(medio.organizacionId, user);
  if (!access || !hasPermission(access, PERMISO_POR_ENTIDAD[entidad])) {
    return NextResponse.json(
      { error: "No tienes permiso para eliminar esta imagen." },
      { status: 403 },
    );
  }

  const esCatalogo = entidad === "producto" || entidad === "servicio";
  await db.transaction(async (tx) => {
    await tx.delete(medios).where(eq(medios.id, medio.id));
    if (esCatalogo && medio.principal) {
      const [siguiente] = await tx
        .select({ id: medios.id })
        .from(medios)
        .where(
          and(
            eq(medios.organizacionId, medio.organizacionId),
            eq(medios.entidad, medio.entidad),
            eq(medios.entidadId, medio.entidadId),
            eq(medios.activo, true),
            ne(medios.id, medio.id),
          ),
        )
        .orderBy(desc(medios.createdAt))
        .limit(1);
      if (siguiente) {
        await tx
          .update(medios)
          .set({ principal: true, updatedBy: user.id })
          .where(eq(medios.id, siguiente.id));
      }
      const imagenPrincipalId = siguiente?.id ?? null;
      if (entidad === "producto") {
        await tx
          .update(productos)
          .set({ imagenPrincipalId, updatedBy: user.id })
          .where(and(eq(productos.id, medio.entidadId), eq(productos.organizacionId, medio.organizacionId)));
      } else {
        await tx
          .update(servicios)
          .set({ imagenPrincipalId, updatedBy: user.id })
          .where(and(eq(servicios.id, medio.entidadId), eq(servicios.organizacionId, medio.organizacionId)));
      }
    }
  });

  // Best-effort: si R2 falla el objeto queda huérfano pero desreferenciado.
  await mediaDelete(clave).catch(() => {});
  await kvInvalidate(`medio:${clave}`).catch(() => {});
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (cache) cache.delete(new Request(request.url, { method: "GET" })).catch(() => {});
  if (esCatalogo) revalidateTag(catalogoTag(medio.organizacionId), "max");
  return NextResponse.json({ ok: true });
}
