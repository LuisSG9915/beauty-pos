import { createHash } from "node:crypto";

import { and, countDistinct, eq, gt, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  incidentesError,
  incidentesOcurrencias,
  type IncidenteFuente,
  type IncidentePrioridad,
} from "@/db/schema/incidents";
import { moduloDeRuta, normalizarRuta } from "@/lib/telemetry/ruta";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const TELEFONO_RE = /(?<!\d)(?:\+?\d[\d\s-]{7,}\d)(?!\d)/g;
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const QUERY_RE = /\?[^\s)'"]*/g;
const SECRETO_RE =
  /(password|token|secret|api[_-]?key|authorization|cookie)[=:]\s*[^\s,;]+/gi;

/**
 * Mensaje seguro para almacenar y mostrar: sin correos, teléfonos, UUIDs,
 * query strings ni pares clave=valor de credenciales. Truncado a 500 chars.
 */
export function sanitizarTexto(texto: string, max = 500): string {
  return texto
    .replace(SECRETO_RE, "$1=[redactado]")
    .replace(EMAIL_RE, "[correo]")
    .replace(UUID_RE, "[id]")
    .replace(TELEFONO_RE, "[tel]")
    .replace(QUERY_RE, "?[params]")
    .slice(0, max);
}

/**
 * Stack seguro: conserva solo frames de la app (`/src/` o el dominio propio),
 * sin URLs con query ni rutas absolutas del servidor. Máx. 12 frames / 4000.
 */
export function sanitizarStack(stack: string): string {
  return sanitizarTexto(stack, 4000)
    .split("\n")
    .filter(
      (linea) =>
        linea.trim().startsWith("at") === false ||
        !linea.includes("node_modules") ||
        linea.includes("/src/"),
    )
    .slice(0, 12)
    .join("\n");
}

/** Primer frame de la app del stack — estabiliza la agrupación por causa. */
function primerFrameApp(stack: string | null): string {
  if (!stack) return "";
  const frame = stack
    .split("\n")
    .find((linea) => linea.includes("/src/") || linea.includes("app/"));
  return frame?.trim().replace(/\s*at\s+/, "").slice(0, 200) ?? "";
}

export type ErrorReporte = {
  fuente: IncidenteFuente;
  /** Tipo/clase del error (TypeError, Error, DigestError…). */
  tipo: string;
  mensaje: string;
  stack?: string | null;
  digest?: string | null;
  ruta?: string | null;
  actionId?: string | null;
  correlationId?: string | null;
  organizacionId?: string | null;
  sucursalId?: string | null;
  usuarioId?: string | null;
  navegador?: string | null;
  dispositivo?: string | null;
  release?: string | null;
  /** Rastro de acciones semánticas previas (ya sanitizadas). */
  rastro?: readonly string[];
  contexto?: Record<string, unknown>;
};

/** Huella estable: mismo tipo + causa (frame o digest) + módulo → un incidente. */
export function fingerprintDe(reporte: ErrorReporte): string {
  const stack = reporte.stack ? sanitizarStack(reporte.stack) : null;
  const base = [
    reporte.fuente,
    reporte.tipo.slice(0, 80),
    reporte.digest ?? primerFrameApp(stack),
    moduloDeRuta(reporte.ruta ? normalizarRuta(reporte.ruta) : null),
  ].join("|");
  return createHash("sha256").update(base).digest("hex").slice(0, 48);
}

/**
 * Prioridad por impacto: flujo afectado (pos/caja son el dinero del negocio),
 * frecuencia reciente y alcance (organizaciones distintas afectadas).
 * p0 = detiene cobro/agenda o es masivo; p3 = menor o aislado.
 */
export function calcularPrioridad(params: {
  fuente: IncidenteFuente;
  modulo: string | null;
  ocurrencias24h: number;
  organizaciones: number;
}): IncidentePrioridad {
  let score = 0;
  const moduloCritico = params.modulo === "pos" || params.modulo === "caja" || params.modulo === "agenda";
  if (params.fuente === "server" || params.fuente === "server_action") score += 1;
  if (moduloCritico) score += 1;
  if (params.ocurrencias24h >= 50) score += 2;
  else if (params.ocurrencias24h >= 10) score += 1;
  if (params.organizaciones >= 5) score += 2;
  else if (params.organizaciones >= 2) score += 1;
  if (score >= 4) return "p0";
  if (score === 3) return "p1";
  if (score === 2) return "p2";
  return "p3";
}

type Db = ReturnType<typeof getDatabase>;

async function ocurrencias24h(db: Db, incidenteId: string): Promise<number> {
  const corte = new Date(Date.now() - 24 * 60 * 60_000);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(incidentesOcurrencias)
    .where(
      and(
        eq(incidentesOcurrencias.incidenteId, incidenteId),
        gt(incidentesOcurrencias.createdAt, corte),
      ),
    );
  return total;
}

async function organizacionesAfectadas(db: Db, incidenteId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: countDistinct(incidentesOcurrencias.organizacionId) })
    .from(incidentesOcurrencias)
    .where(eq(incidentesOcurrencias.incidenteId, incidenteId));
  return total;
}

/**
 * Registra (o agrupa) un error reportado. Crea el incidente por fingerprint o
 * suma una ocurrencia al existente, recalcula prioridad y reabre si estaba
 * resuelto. Nunca lanza: la captura de errores no puede romper la app.
 */
export async function registrarError(db: Db, reporte: ErrorReporte): Promise<string | null> {
  try {
    const fingerprint = fingerprintDe(reporte);
    const mensaje = sanitizarTexto(reporte.mensaje || "Error sin mensaje");
    const stack = reporte.stack ? sanitizarStack(reporte.stack) : null;
    const ruta = reporte.ruta ? normalizarRuta(reporte.ruta) : null;
    const modulo = moduloDeRuta(ruta);
    const titulo = `${reporte.tipo}: ${mensaje.split("\n")[0]}`.slice(0, 200);
    const correlationId =
      reporte.correlationId ?? crypto.randomUUID().replaceAll("-", "").slice(0, 24);

    const contexto = {
      digest: reporte.digest ?? null,
      stack,
      rastro: reporte.rastro?.slice(0, 8) ?? [],
      ...reporte.contexto,
    };

    const resultado = await db.transaction(async (tx) => {
      const [incidente] = await tx
        .insert(incidentesError)
        .values({
          fingerprint,
          titulo,
          mensaje,
          fuente: reporte.fuente,
          modulo,
          ruta,
          actionId: reporte.actionId ?? null,
          releaseAparece: reporte.release ?? null,
        })
        .onConflictDoUpdate({
          target: incidentesError.fingerprint,
          set: {
            ultimaVezAt: new Date(),
            ocurrencias: sql`${incidentesError.ocurrencias} + 1`,
            // Reapertura automática si el error vuelve tras resolverse.
            estado: sql`case when ${incidentesError.estado} = 'resuelto' then 'en_revision' else ${incidentesError.estado} end`,
            resueltoAt: sql`case when ${incidentesError.estado} = 'resuelto' then null else ${incidentesError.resueltoAt} end`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: incidentesError.id, estado: incidentesError.estado });

      await tx.insert(incidentesOcurrencias).values({
        incidenteId: incidente.id,
        correlationId,
        organizacionId: reporte.organizacionId ?? null,
        sucursalId: reporte.sucursalId ?? null,
        usuarioId: reporte.usuarioId ?? null,
        ruta,
        navegador: reporte.navegador ?? null,
        dispositivo: reporte.dispositivo ?? null,
        release: reporte.release ?? null,
        contexto,
      });

      return incidente;
    });

    // Recálculo de prioridad fuera de la tx (lecturas agregadas).
    const [recientes24h, orgs] = await Promise.all([
      ocurrencias24h(db, resultado.id),
      organizacionesAfectadas(db, resultado.id),
    ]);
    const prioridad = calcularPrioridad({
      fuente: reporte.fuente,
      modulo,
      ocurrencias24h: recientes24h,
      organizaciones: orgs,
    });
    await db
      .update(incidentesError)
      .set({ prioridad, organizacionesAfectadas: orgs })
      .where(eq(incidentesError.id, resultado.id));

    return resultado.id;
  } catch (error) {
    console.error("registrarError", error);
    return null;
  }
}
