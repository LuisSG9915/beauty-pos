import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

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
 * Sirve una imagen de R2.
 * Catálogo (producto/servicio): imágenes públicas con llave inmutable (UUID).
 * Se cachean en el edge (CDN) y el lookup de metadatos se lee de Cloudflare KV,
 * eliminando por completo las consultas a CockroachDB en navegación habitual.
 * Privados (fichas, compras): requieren sesión y membresía activa.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const segments = (await params).key;
  const clave = claveDesdeParams(segments);
  if (!clave) return new Response(null, { status: 404 });

  // Sin binding (dev sin wrangler) la app no truena: 404 → la UI muestra el
  // placeholder, sin tocar la BD.
  if (!getMediaBucket()) return new Response(null, { status: 404 });

  const entidad = segments[1];
  const esCatalogo = entidad === "producto" || entidad === "servicio";

  if (!esCatalogo) {
    const user = await getApiSessionUser();
    let autorizado = false;
    if (user) {
      const access = await resolveAccessSafe(segments[0]!, user);
      if (access) autorizado = true;
    } else if (entidad === "ficha") {
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
              eq(citas.organizacionId, segments[0]!),
              isNull(reservasGestionTokens.revocadoAt),
              eq(citas.activo, true),
            ),
          )
          .limit(1);
        if (tokenRow) autorizado = true;
      }
    }

    if (!autorizado) {
      return new Response(null, { status: user ? 404 : 401 });
    }
  }

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

  // La fila debe existir, seguir activa y coincidir con la org de la key.
  if (!medio || !medio.activo || medio.organizacionId !== segments[0]) {
    return new Response(null, { status: 404 });
  }

  const objeto = await mediaGet(clave);
  if (!objeto) return new Response(null, { status: 404 });

  const baseHeaders = {
    "Cache-Control": esCatalogo
      ? "public, max-age=31536000, immutable"
      : "private, max-age=31536000, immutable",
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
  await kvInvalidate(`medio:${clave}`).catch(() => {});
  if (esCatalogo) revalidateTag(catalogoTag(medio.organizacionId), "max");
  return NextResponse.json({ ok: true });
}
