import { and, eq, ne } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { productos, servicios } from "@/db/schema/catalogs";
import { MEDIO_ENTIDADES, medios, type MedioEntidad } from "@/db/schema/media";
import { mobiliario } from "@/db/schema/plano";
import { getApiSessionUser } from "@/lib/auth/access";
import { hasPermission, resolveAccessSafe } from "@/lib/auth/authorization";
import { catalogoTag } from "@/lib/catalogo-cache";
import {
  claveMediaR2,
  extensionPorMime,
  mediaDelete,
  mediaPut,
  MEDIO_MAX_BYTES,
  PERMISO_POR_ENTIDAD,
  urlMedio,
} from "@/lib/media";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dimensionValida(valor: FormDataEntryValue | null): number | null {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 && numero <= 20000 ? numero : null;
}

/**
 * Sube una imagen a R2 y la registra en `medios`. El cliente ya comprimió a
 * webp ≤1600px; aquí se revalidan mime (jpg/png/webp), tamaño (≤5 MB) y que la
 * entidad exista dentro de la organización. Para producto/servicio la imagen
 * queda como principal (`imagen_principal_id`).
 *
 * `ficha`/`compra` no verifican existencia: su `entidadId` es un uuid que el
 * cliente genera antes de guardar la entidad (la ficha aún no existe al subir
 * sus fotos). El permiso por entidad es el control efectivo.
 *
 * `mobiliario` (plan 11) sí verifica existencia: la foto se fija en
 * `mobiliario.foto_id` dentro de la misma transacción, como
 * `imagen_principal_id` pero sin galería (una foto por mueble).
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "La solicitud no es válida." }, { status: 400 });
  }

  const organizacionId = String(form.get("organizacionId") ?? "");
  const entidad = String(form.get("entidad") ?? "") as MedioEntidad;
  const entidadId = String(form.get("entidadId") ?? "");
  const archivo = form.get("archivo");

  if (
    !UUID_RE.test(organizacionId) ||
    !UUID_RE.test(entidadId) ||
    !MEDIO_ENTIDADES.includes(entidad)
  ) {
    return NextResponse.json({ error: "Datos de la imagen inválidos." }, { status: 400 });
  }
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Selecciona una imagen." }, { status: 400 });
  }
  if (archivo.size > MEDIO_MAX_BYTES) {
    return NextResponse.json(
      { error: "La imagen no puede superar 5 MB." },
      { status: 400 },
    );
  }
  const extension = extensionPorMime(archivo.type);
  if (!extension) {
    return NextResponse.json(
      { error: "Formato no soportado: usa JPG, PNG o WebP." },
      { status: 400 },
    );
  }

  const user = await getApiSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para subir imágenes." }, { status: 401 });
  }
  const access = await resolveAccessSafe(organizacionId, user);
  if (!access || !hasPermission(access, PERMISO_POR_ENTIDAD[entidad])) {
    return NextResponse.json(
      { error: "No tienes permiso para subir imágenes aquí." },
      { status: 403 },
    );
  }

  const db = getDatabase();
  if (entidad === "producto") {
    const [owner] = await db
      .select({ id: productos.id })
      .from(productos)
      .where(and(eq(productos.id, entidadId), eq(productos.organizacionId, organizacionId)))
      .limit(1);
    if (!owner) {
      return NextResponse.json({ error: "El producto no existe." }, { status: 404 });
    }
  } else if (entidad === "servicio") {
    const [owner] = await db
      .select({ id: servicios.id })
      .from(servicios)
      .where(and(eq(servicios.id, entidadId), eq(servicios.organizacionId, organizacionId)))
      .limit(1);
    if (!owner) {
      return NextResponse.json({ error: "El servicio no existe." }, { status: 404 });
    }
  } else if (entidad === "mobiliario") {
    const [owner] = await db
      .select({ id: mobiliario.id })
      .from(mobiliario)
      .where(and(eq(mobiliario.id, entidadId), eq(mobiliario.organizacionId, organizacionId)))
      .limit(1);
    if (!owner) {
      return NextResponse.json({ error: "El mueble no existe." }, { status: 404 });
    }
  }

  const clave = claveMediaR2(
    organizacionId,
    entidad,
    entidadId,
    `${crypto.randomUUID()}.${extension}`,
  );
  const contenido = await archivo.arrayBuffer();
  const subido = await mediaPut(clave, contenido, archivo.type);
  if (!subido) {
    return NextResponse.json(
      { error: "El almacenamiento de imágenes no está disponible en este entorno." },
      { status: 503 },
    );
  }

  const esPrincipal = entidad === "producto" || entidad === "servicio";
  let medioId = "";
  try {
    medioId = await db.transaction(async (tx) => {
      if (esPrincipal) {
        // Una sola imagen principal por entidad: la nueva la sustituye.
        await tx
          .update(medios)
          .set({ principal: false, updatedBy: user.id })
          .where(
            and(
              eq(medios.organizacionId, organizacionId),
              eq(medios.entidad, entidad),
              eq(medios.entidadId, entidadId),
            ),
          );
      }
      const [insertado] = await tx
        .insert(medios)
        .values({
          organizacionId,
          entidad,
          entidadId,
          claveR2: clave,
          mime: archivo.type,
          bytes: contenido.byteLength,
          ancho: dimensionValida(form.get("ancho")),
          alto: dimensionValida(form.get("alto")),
          principal: esPrincipal,
          createdBy: user.id,
        })
        .returning({ id: medios.id });
      if (entidad === "producto") {
        await tx
          .update(productos)
          .set({ imagenPrincipalId: insertado.id, updatedBy: user.id })
          .where(and(eq(productos.id, entidadId), eq(productos.organizacionId, organizacionId)));
      } else if (entidad === "servicio") {
        await tx
          .update(servicios)
          .set({ imagenPrincipalId: insertado.id, updatedBy: user.id })
          .where(and(eq(servicios.id, entidadId), eq(servicios.organizacionId, organizacionId)));
      } else if (entidad === "mobiliario") {
        // Una foto por mueble: las anteriores quedan inactivas (su URL deja
        // de servirse) y el mueble apunta a la nueva.
        await tx
          .update(medios)
          .set({ activo: false, updatedBy: user.id })
          .where(
            and(
              eq(medios.entidad, "mobiliario"),
              eq(medios.entidadId, entidadId),
              ne(medios.id, insertado.id),
            ),
          );
        await tx
          .update(mobiliario)
          .set({ fotoId: insertado.id, updatedBy: user.id })
          .where(and(eq(mobiliario.id, entidadId), eq(mobiliario.organizacionId, organizacionId)));
      }
      return insertado.id;
    });
  } catch (error) {
    // Si la fila no se registró, el objeto queda huérfano: se limpia.
    await mediaDelete(clave).catch(() => {});
    throw error;
  }

  // Route handler → revalidateTag (updateTag solo existe en Server Actions).
  if (esPrincipal) revalidateTag(catalogoTag(organizacionId), "max");
  return NextResponse.json(
    { id: medioId, claveR2: clave, url: urlMedio(clave) },
    { status: 201 },
  );
}
