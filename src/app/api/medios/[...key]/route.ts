import { and, desc, eq, ne } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { productos, servicios } from "@/db/schema/catalogs";
import { medios, type MedioEntidad } from "@/db/schema/media";
import { getApiSessionUser } from "@/lib/auth/access";
import { hasPermission, resolveAccessSafe } from "@/lib/auth/authorization";
import { catalogoTag } from "@/lib/catalogo-cache";
import { getMediaBucket, mediaDelete, mediaGet, PERMISO_POR_ENTIDAD } from "@/lib/media";

type RouteParams = { params: Promise<{ key: string[] }> };

/**
 * La llave viaja en el path (`/api/medios/{org}/{entidad}/{entidadId}/{uuid}.{ext}`),
 * así que necesita catch-all: los segmentos se reconstruyen con `/`.
 */
function claveDesdeParams(segments: string[] | undefined): string | null {
  if (!segments || segments.length !== 4) return null;
  const clave = decodeURIComponent(segments.join("/"));
  // El primer segmento debe ser el uuid de la organización.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segments[0] ?? "")
  ) {
    return null;
  }
  return clave;
}

/**
 * Sirve una imagen de R2 verificando que la llave pertenece a una organización
 * donde el usuario es miembro activo (la key trae la org en el primer segmento
 * y se contrasta contra la fila `medios`). Cache immutable: cada subida genera
 * llave nueva, así que la URL nunca cambia de contenido. `private` porque el
 * acceso requiere sesión; un CDN compartido no debe guardarla.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const segments = (await params).key;
  const clave = claveDesdeParams(segments);
  if (!clave) return new Response(null, { status: 404 });

  // Sin binding (dev sin wrangler) la app no truena: 404 → la UI muestra el
  // placeholder, sin tocar la BD.
  if (!getMediaBucket()) return new Response(null, { status: 404 });

  const user = await getApiSessionUser();
  if (!user) return new Response(null, { status: 401 });

  const db = getDatabase();
  const [medio] = await db
    .select({
      organizacionId: medios.organizacionId,
      mime: medios.mime,
      activo: medios.activo,
    })
    .from(medios)
    .where(eq(medios.claveR2, clave))
    .limit(1);
  // La fila debe existir, seguir activa y coincidir con la org de la key.
  if (!medio || !medio.activo || medio.organizacionId !== segments[0]) {
    return new Response(null, { status: 404 });
  }

  const access = await resolveAccessSafe(medio.organizacionId, user);
  // 404 (no 403): no filtrar si la llave existe en otra organización.
  if (!access) return new Response(null, { status: 404 });

  const objeto = await mediaGet(clave);
  if (!objeto) return new Response(null, { status: 404 });

  const baseHeaders = {
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: objeto.httpEtag,
    "X-Content-Type-Options": "nosniff",
  };
  if (request.headers.get("if-none-match") === objeto.httpEtag) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  const headers = new Headers(baseHeaders);
  objeto.writeHttpMetadata?.(headers);
  if (!headers.has("content-type")) headers.set("content-type", medio.mime);
  headers.set("content-length", String(objeto.size));
  // El stream de workerd no coincide nominalmente con el ReadableStream del
  // DOM; en runtime es el mismo objeto.
  return new Response(objeto.body as unknown as BodyInit, { headers });
}

/**
 * Elimina un medio: borra la fila `medios` y el objeto R2. Si era la imagen
 * principal de un producto/servicio, promueve la más reciente que quede (o
 * limpia `imagen_principal_id`). Las fotos de ficha quedan apuntando a llaves
 * inexistentes → el `<img>` devuelve 404 y se ve el hueco, sin tronar.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const segments = (await params).key;
  const clave = claveDesdeParams(segments);
  if (!clave) return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });

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
  if (!medio || !medio.activo || medio.organizacionId !== segments[0]) {
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
  if (esCatalogo) revalidateTag(catalogoTag(medio.organizacionId), "max");
  return NextResponse.json({ ok: true });
}
