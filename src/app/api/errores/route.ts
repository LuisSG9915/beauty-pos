import { type NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { createAuth } from "@/lib/auth/server";
import { registrarError } from "@/lib/observability/error-core";
import { extraerHeadersCloudflare } from "@/lib/observability/error-core";

const reporteSchema = z.object({
  tipo: z.string().max(80).default("Error"),
  mensaje: z.string().max(2000),
  stack: z.string().max(12_000).optional(),
  digest: z.string().max(120).nullish(),
  ruta: z.string().max(200).optional(),
  actionId: z.string().max(100).nullish(),
  correlationId: z.string().max(40).nullish(),
  sid: z.string().max(40).nullish(),
  organizacionId: z.uuid().nullish(),
  sucursalId: z.uuid().nullish(),
  navegador: z.string().max(40).nullish(),
  dispositivo: z.string().max(20).nullish(),
  release: z.string().max(60).nullish(),
  rastro: z.array(z.string().max(100)).max(8).optional(),
});

import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit, registrarYVerificarRateLimit } from "@/lib/rate-limit";

async function limitePorClave(clave: string): Promise<boolean> {
  // Máx. 60 reportes/hora por clave (sid o IP): evita inundar incidentes sin tocar CockroachDB.
  return registrarYVerificarRateLimit({
    bucket: "errores_cliente",
    clave,
    limite: 60,
    ventanaMs: 60 * 60_000,
  });
}

/**
 * Reporte de error del navegador (error boundary, window.onerror,
 * unhandledrejection). Siempre 204: el reportero no reintenta ni muestra nada.
 * La organización declarada solo se acepta si el usuario autenticado pertenece
 * a ella — nadie puede inflar el contador de otra organización.
 */
export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16384) {
    return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
  }

  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit("errores:" + ip, { max: 15, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const parsed = reporteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const db = getDatabase();
    const data = parsed.data;

    const clave =
      data.sid ??
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anon";
    if (await limitePorClave(clave)) {
      return new NextResponse(null, { status: 204 });
    }

    let usuarioId: string | null = null;
    let organizacionId = data.organizacionId ?? null;
    const authSession = await createAuth().api.getSession({
      headers: request.headers,
    });
    if (authSession) {
      const { usuarios, miembrosOrganizaciones } = await import(
        "@/db/schema/core"
      );
      const [usuario] = await db
        .select({
          id: usuarios.id,
          esAdministradorPlataforma: usuarios.esAdministradorPlataforma,
        })
        .from(usuarios)
        .where(eq(usuarios.authUsuarioId, authSession.user.id))
        .limit(1);
      usuarioId = usuario?.id ?? null;
      if (organizacionId && usuarioId && !usuario?.esAdministradorPlataforma) {
        const [miembro] = await db
          .select({ id: miembrosOrganizaciones.id })
          .from(miembrosOrganizaciones)
          .where(
            and(
              eq(miembrosOrganizaciones.organizacionId, organizacionId),
              eq(miembrosOrganizaciones.usuarioId, usuarioId),
              eq(miembrosOrganizaciones.estado, "activo"),
            ),
          )
          .limit(1);
        if (!miembro) organizacionId = null;
      }
    } else {
      // Sin sesión no se acepta contexto de organización/usuario del cliente.
      organizacionId = null;
    }

    const cfContexto = extraerHeadersCloudflare(request.headers);

    await registrarError(db, {
      fuente: "client",
      tipo: data.tipo,
      mensaje: data.mensaje,
      stack: data.stack ?? null,
      digest: data.digest ?? null,
      ruta: data.ruta ?? null,
      actionId: data.actionId ?? null,
      correlationId: data.correlationId ?? null,
      organizacionId,
      sucursalId: data.sucursalId ?? null,
      usuarioId,
      navegador: data.navegador ?? null,
      dispositivo: data.dispositivo ?? null,
      release: data.release ?? null,
      rastro: data.rastro,
      contexto: cfContexto,
    });
  } catch (error) {
    console.error("errores POST", error);
  }

  return new NextResponse(null, { status: 204 });
}
