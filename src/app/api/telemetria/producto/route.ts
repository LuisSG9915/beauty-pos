import { after, type NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  telemetriaProductoEventos,
  telemetriaSesiones,
} from "@/db/schema/telemetry";
import { createAuth } from "@/lib/auth/server";
import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit, registrarYVerificarRateLimit } from "@/lib/rate-limit";
import { writeProductTelemetry } from "@/lib/telemetry/analytics-engine";
import { moduloDeRuta } from "@/lib/telemetry/ruta";

const LOTE_MAX = 50;
const EVENTO_TIPOS = [
  "page_view",
  "action",
  "form_success",
  "form_error",
  "performance",
  "session_end",
] as const;

const eventoSchema = z.object({
  tipo: z.enum(EVENTO_TIPOS),
  ruta: z.string().max(160).optional(),
  actionId: z
    .string()
    .regex(/^[a-z0-9_.-]+$/)
    .max(100)
    .optional(),
  accionClave: z.boolean().optional(),
  metrica: z.enum(["ttfb", "fcp", "lcp", "cls", "inp"]).optional(),
  valor: z.number().min(0).max(600_000).optional(),
  clientAt: z.number().optional(),
});

const loteSchema = z.object({
  sesion: z.object({
    sid: z
      .string()
      .regex(/^[a-z0-9-]{8,40}$/)
      .max(40),
    iniciaAt: z.number(),
    paginas: z.number().int().min(0).max(10_000),
    acciones: z.number().int().min(0).max(100_000),
    accionesClave: z.number().int().min(0).max(100_000).default(0),
    tiempoActivoMs: z.number().min(0).max(86_400_000),
    entradaRuta: z.string().max(160).optional(),
    salidaRuta: z.string().max(160).optional(),
    organizacionId: z.uuid().nullish(),
    sucursalId: z.uuid().nullish(),
    dispositivo: z.string().max(20).optional(),
    navegador: z.string().max(40).optional(),
    release: z.string().max(60).nullish(),
  }),
  eventos: z.array(eventoSchema).max(LOTE_MAX),
});

async function limitePorSesion(sid: string) {
  // Máx. ~120 lotes/hora por sid: suficiente para uso real, corta abusos sin tocar CockroachDB.
  return registrarYVerificarRateLimit({
    bucket: "telemetria_producto",
    clave: sid,
    limite: 120,
    ventanaMs: 60 * 60_000,
  });
}

/**
 * Lote de eventos de producto del colector del navegador.
 *
 * En producción sobre Cloudflare Workers, envía los eventos a Analytics Engine y
 * responde 204 inmediatamente sin tocar CockroachDB.
 * En desarrollo local o fallback sin binding, ejecuta el upsert de sesión y eventos en after().
 */
export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8192) {
    return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
  }

  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit("telemetria_producto:" + ip, { max: 60, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const parsed = loteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new NextResponse(null, { status: 204 });
  }

  const { sesion, eventos } = parsed.data;

  if (await limitePorSesion(sesion.sid)) {
    return new NextResponse(null, { status: 204 });
  }

  // 1. Intento de descarga síncrona a Analytics Engine en Cloudflare Edge
  let escritoEnAe = false;
  if (sesion.organizacionId) {
    if (eventos.length > 0) {
      for (const evento of eventos) {
        const modulo = moduloDeRuta(evento.ruta ?? null) ?? "general";
        const ok = writeProductTelemetry({
          evento: evento.actionId ?? evento.tipo,
          modulo,
          organizacionId: sesion.organizacionId,
          sucursalId: sesion.sucursalId ?? null,
          duracionMs: evento.valor ?? null,
        });
        if (ok) escritoEnAe = true;
      }
    } else {
      escritoEnAe = writeProductTelemetry({
        evento: "sesion",
        modulo: "sesion",
        organizacionId: sesion.organizacionId,
        sucursalId: sesion.sucursalId ?? null,
        duracionMs: sesion.tiempoActivoMs,
      });
    }
  }

  if (escritoEnAe) {
    return new NextResponse(null, { status: 204 });
  }

  // 2. Fallback a CockroachDB diferido fuera del camino crítico vía after()
  const headers = request.headers;
  const vid = request.cookies.get("bp_vid")?.value ?? null;

  after(async () => {
    try {
      const db = getDatabase();

      // Identidad: la sesión auth (si existe) fija usuario y plataforma; la org
      // declarada por el cliente solo se acepta si el usuario pertenece a ella.
      let usuarioId: string | null = null;
      let esPlataforma = false;
      const authSession = await createAuth().api.getSession({
        headers,
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
        esPlataforma = usuario?.esAdministradorPlataforma ?? false;
        if (
          usuarioId &&
          sesion.organizacionId &&
          !esPlataforma
        ) {
          const [miembro] = await db
            .select({ id: miembrosOrganizaciones.id })
            .from(miembrosOrganizaciones)
            .where(
              and(
                eq(miembrosOrganizaciones.organizacionId, sesion.organizacionId),
                eq(miembrosOrganizaciones.usuarioId, usuarioId),
                eq(miembrosOrganizaciones.estado, "activo"),
              ),
            )
            .limit(1);
          if (!miembro) sesion.organizacionId = null;
        }
      }

      const ahora = new Date();
      const engaged =
        sesion.tiempoActivoMs > 10_000 ||
        sesion.paginas >= 2 ||
        sesion.accionesClave > 0;

      const [fila] = await db
        .insert(telemetriaSesiones)
        .values({
          sid: sesion.sid,
          vid,
          usuarioId,
          organizacionId: sesion.organizacionId ?? null,
          sucursalId: sesion.sucursalId ?? null,
          entradaRuta: sesion.entradaRuta ?? sesion.salidaRuta ?? null,
          salidaRuta: sesion.salidaRuta ?? null,
          iniciaAt: new Date(sesion.iniciaAt),
          ultimaActividadAt: ahora,
          paginas: sesion.paginas,
          acciones: sesion.acciones,
          tiempoActivoMs: Math.round(sesion.tiempoActivoMs),
          engaged,
          dispositivo: sesion.dispositivo ?? null,
          navegador: sesion.navegador ?? null,
          release: sesion.release ?? null,
        })
        .onConflictDoUpdate({
          target: telemetriaSesiones.sid,
          set: {
            usuarioId: sql`coalesce(excluded.usuario_id, telemetria_sesiones.usuario_id)`,
            organizacionId: sql`coalesce(excluded.organizacion_id, telemetria_sesiones.organizacion_id)`,
            sucursalId: sql`coalesce(excluded.sucursal_id, telemetria_sesiones.sucursal_id)`,
            salidaRuta: sql`coalesce(excluded.salida_ruta, telemetria_sesiones.salida_ruta)`,
            ultimaActividadAt: ahora,
            paginas: sesion.paginas,
            acciones: sesion.acciones,
            tiempoActivoMs: Math.round(sesion.tiempoActivoMs),
            engaged,
          },
        })
        .returning({ id: telemetriaSesiones.id });

      if (eventos.length > 0 && fila) {
        await db.insert(telemetriaProductoEventos).values(
          eventos.map((evento) => ({
            sesionId: fila.id,
            sid: sesion.sid,
            usuarioId,
            organizacionId: sesion.organizacionId ?? null,
            sucursalId: sesion.sucursalId ?? null,
            tipo: evento.tipo,
            ruta: evento.ruta ?? null,
            actionId: evento.actionId ?? null,
            accionClave: evento.accionClave ?? false,
            metrica: evento.metrica ?? null,
            valor: evento.valor !== undefined ? String(evento.valor) : null,
            clientAt: evento.clientAt ? new Date(evento.clientAt) : null,
          })),
        );
      }
    } catch (error) {
      // Telemetría best-effort: log y no reintentar
      console.error("telemetria/producto POST", error);
    }
  });

  return new NextResponse(null, { status: 204 });
}
