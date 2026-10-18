import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/lib/runtime-env";
import { procesarNotificaciones } from "@/modules/notificaciones/service";

export const dynamic = "force-dynamic";

function timingSafeMatch(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Worker de avisos de cita por correo (confirmación, solicitud, cambio,
 * cancelación y recordatorio). Protegido con `CRON_SECRET`
 * (Authorization: Bearer …). Pensado para un scheduler externo cada 15–30 min:
 * el lease por aviso y la unicidad (cita, tipo, versión) lo hacen seguro ante
 * corridas duplicadas o workers concurrentes.
 */
async function handler(request: Request) {
  const secret = getRuntimeEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado." }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const expectedAuth = `Bearer ${secret}`;
  if (!timingSafeMatch(auth, expectedAuth)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const resultado = await procesarNotificaciones();
  return NextResponse.json({ ok: true, ...resultado });
}

export async function GET(request: Request) {
  return handler(request);
}

export async function POST(request: Request) {
  return handler(request);
}
