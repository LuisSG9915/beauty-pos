import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { compras } from "@/db/schema/compras";
import { medios } from "@/db/schema/media";
import { auditEvent } from "@/lib/audit";
import { getApiSessionUser } from "@/lib/auth/access";
import {
  assertBranchScope,
  hasPermission,
  resolveAccessSafe,
} from "@/lib/auth/authorization";
import { claveMediaR2, extensionPorMime, mediaDelete, mediaPut } from "@/lib/media";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La foto del ticket se envía luego a Workers AI (`ejecutarVisionJson`), que
 * solo admite jpeg/png: por eso esta ruta NO acepta webp aunque `medios` sí.
 * 4 MB de tope: el cliente comprime a JPEG ≤2048px, pero una foto sin
 * comprimir desde celular puede llegar más pesada y aún ser legible.
 */
const TICKET_MAX_BYTES = 4 * 1024 * 1024;
const TICKET_MIMES = new Set(["image/jpeg", "image/png"]);

/**
 * `crearCompraConTicket` (plan 10): alta de una compra en `borrador` con la
 * foto del ticket opcional ya subida a R2 (`medios`, entidad `compra`). La
 * recepcionista la dispara desde "Nueva compra"; el análisis corre aparte en
 * `POST /api/compras/[id]/analizar` (misma petición, sin Queues).
 *
 * Sin binding de R2 (dev local) la compra igual se crea: `fotoOk: false` lo
 * reporta para que la UI avise que el ticket no se guardó.
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "La solicitud no es válida." }, { status: 400 });
  }

  const organizacionId = String(form.get("organizacionId") ?? "");
  const sucursalId = String(form.get("sucursalId") ?? "");
  const foto = form.get("foto");

  if (!UUID_RE.test(organizacionId) || !UUID_RE.test(sucursalId)) {
    return NextResponse.json({ error: "Datos de la compra inválidos." }, { status: 400 });
  }

  const user = await getApiSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para registrar compras." }, { status: 401 });
  }
  const access = await resolveAccessSafe(organizacionId, user);
  if (!access || !hasPermission(access, "compras.editar")) {
    return NextResponse.json(
      { error: "No tienes permiso para registrar compras." },
      { status: 403 },
    );
  }
  const sucursalValida = await assertBranchScope(access, sucursalId);
  if (!sucursalValida) {
    return NextResponse.json(
      { error: "La sucursal no existe, está inactiva o no tienes acceso a ella." },
      { status: 400 },
    );
  }

  let buffer: ArrayBuffer | null = null;
  let mime: string | null = null;
  if (foto instanceof File && foto.size > 0) {
    if (!TICKET_MIMES.has(foto.type)) {
      return NextResponse.json(
        { error: "Formato no soportado: el ticket debe ser foto JPG o PNG." },
        { status: 400 },
      );
    }
    if (foto.size > TICKET_MAX_BYTES) {
      return NextResponse.json(
        { error: "La foto del ticket no puede superar 4 MB." },
        { status: 400 },
      );
    }
    buffer = await foto.arrayBuffer();
    mime = foto.type;
  } else if (foto !== null) {
    return NextResponse.json({ error: "La foto del ticket está vacía." }, { status: 400 });
  }

  const db = getDatabase();
  const [compra] = await db
    .insert(compras)
    .values({
      organizacionId,
      sucursalId,
      estado: "borrador",
      createdBy: user.id,
    })
    .returning({ id: compras.id });

  let fotoOk = false;
  if (buffer && mime) {
    const extension = extensionPorMime(mime) ?? "jpg";
    const clave = claveMediaR2(
      organizacionId,
      "compra",
      compra.id,
      `${crypto.randomUUID()}.${extension}`,
    );
    const subido = await mediaPut(clave, buffer, mime);
    if (subido) {
      try {
        await db.transaction(async (tx) => {
          const [medio] = await tx
            .insert(medios)
            .values({
              organizacionId,
              entidad: "compra",
              entidadId: compra.id,
              claveR2: clave,
              mime,
              bytes: buffer.byteLength,
              createdBy: user.id,
            })
            .returning({ id: medios.id });
          await tx
            .update(compras)
            .set({ medioTicketId: medio.id, updatedBy: user.id })
            .where(eq(compras.id, compra.id));
        });
        fotoOk = true;
      } catch (error) {
        // La fila del medio no quedó: el objeto R2 queda huérfano → se limpia.
        await mediaDelete(clave).catch(() => {});
        throw error;
      }
    }
  }

  await auditEvent(db, {
    organizacionId,
    sucursalId,
    usuarioId: user.id,
    accion: "compra.creada",
    entidad: "compra",
    entidadId: compra.id,
    detalle: { conFoto: fotoOk },
  });

  return NextResponse.json({ id: compra.id, fotoOk }, { status: 201 });
}
