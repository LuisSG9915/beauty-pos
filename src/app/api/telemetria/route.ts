import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { telemetriaEventos } from "@/db/schema/telemetry";

const COOKIE_VID = "bp_vid";

const eventoSchema = z.object({
  tipo: z.enum(["visita"]),
  origen: z.enum(["landing", "precios"]),
  utm: z
    .object({
      utm_source: z.string().max(120).optional(),
      utm_medium: z.string().max(120).optional(),
      utm_campaign: z.string().max(160).optional(),
    })
    .optional(),
});

/**
 * Ping de visita de las páginas de marketing. Asigna una cookie anónima
 * (`bp_vid`) si no existe — permite atribuir registro → visita sin guardar
 * IPs ni datos personales. Falla en silencio hacia el cliente (204 siempre
 * que el payload sea válido) porque la telemetría nunca debe romper el sitio.
 */
export async function POST(request: NextRequest) {
  const parsed = eventoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const vidExistente = request.cookies.get(COOKIE_VID)?.value;
  const vid = vidExistente ?? crypto.randomUUID();

  try {
    const db = getDatabase();
    await db.insert(telemetriaEventos).values({
      vid,
      tipo: parsed.data.tipo,
      origen: parsed.data.origen,
      referer: request.headers.get("referer")?.slice(0, 500) ?? null,
      utm: parsed.data.utm ?? null,
    });
  } catch (error) {
    console.error("telemetria POST", error);
  }

  const response = new NextResponse(null, { status: 204 });
  if (!vidExistente) {
    response.cookies.set(COOKIE_VID, vid, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}
