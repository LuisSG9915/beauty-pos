import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/lib/runtime-env";
import { procesarRecordatorios } from "@/modules/recordatorios/service";

export const dynamic = "force-dynamic";

/**
 * Cron de recordatorios de citas por correo. Protegido con `CRON_SECRET`
 * (Authorization: Bearer …). Pensado para un scheduler externo cada 15–30 min
 * (Cloudflare Cron Trigger, GitHub Actions, etc.): el índice único de envíos
 * por cita+tipo vuelve la operación segura ante corridas duplicadas.
 */
async function handler(request: Request) {
  const secret = getRuntimeEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado." }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const resultado = await procesarRecordatorios();
  return NextResponse.json({ ok: true, ...resultado });
}

export async function GET(request: Request) {
  return handler(request);
}

export async function POST(request: Request) {
  return handler(request);
}
