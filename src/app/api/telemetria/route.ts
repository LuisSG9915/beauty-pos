import { after, type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { telemetriaEventos } from "@/db/schema/telemetry";
import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeNavigationTelemetry } from "@/lib/telemetry/analytics-engine";

const COOKIE_VID = "bp_vid";

const eventoSchema = z.object({
  tipo: z.enum(["visita"]),
  origen: z.enum(["landing", "precios"]).optional(),
  ruta: z.string().max(160).optional(),
  duracionMs: z.number().min(0).max(600_000).optional(),
  ttfbMs: z.number().min(0).max(600_000).optional(),
  organizacionId: z.string().optional(),
  rol: z.string().optional(),
  dispositivo: z.string().optional(),
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
 * IPs ni datos personales.
 *
 * En producción sobre Cloudflare Workers, envía el punto a Analytics Engine y
 * responde inmediatamente sin tocar CockroachDB.
 * En desarrollo local o testing, degrada a db.insert diferido vía after().
 */
export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8192) {
    return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
  }

  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit("telemetria:" + ip, { max: 60, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const parsed = eventoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const vidExistente = request.cookies.get(COOKIE_VID)?.value;
  const vid = vidExistente ?? crypto.randomUUID();

  const ruta =
    parsed.data.ruta ??
    (parsed.data.origen === "landing" ? "/" : `/${parsed.data.origen ?? ""}`);

  const writtenToAe = writeNavigationTelemetry({
    ruta,
    duracionMs: parsed.data.duracionMs ?? 0,
    ttfbMs: parsed.data.ttfbMs,
    organizacionId: parsed.data.organizacionId,
    rol: parsed.data.rol,
    dispositivo: parsed.data.dispositivo,
  });

  if (!writtenToAe) {
    after(async () => {
      try {
        const db = getDatabase();
        await db.insert(telemetriaEventos).values({
          vid,
          tipo: parsed.data.tipo,
          origen: parsed.data.origen ?? "landing",
          referer: request.headers.get("referer")?.slice(0, 500) ?? null,
          utm: parsed.data.utm ?? null,
        });
      } catch (error) {
        console.error("telemetria POST", error);
      }
    });
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
