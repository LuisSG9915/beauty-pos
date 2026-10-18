"use client";

import { capturarEnSentry } from "@/lib/observability/sentry";
import { normalizarRuta } from "@/lib/telemetry/ruta";
import { rastroReciente, sidActual } from "@/lib/telemetry/cliente";

/**
 * Reporta un error del navegador a `/api/errores` con contexto mínimo y
 * sanitizado en servidor: ruta normalizada, último `data-action-id` tocado,
 * rastro de acciones semánticas y correlationId por carga de página. Nunca
 * lanza ni bloquea — los errores de diagnóstico no rompen la app.
 */

const correlationId = crypto.randomUUID().replaceAll("-", "").slice(0, 24);

type ErrorCliente = {
  error: unknown;
  /** Boundary de React/Next lo llama con el digest del error RSC. */
  digest?: string | null;
  /** Acción semántica en curso cuando falló (ej. `pos.cobro.confirmar`). */
  actionId?: string | null;
};

export function reportarErrorCliente({ error, digest, actionId }: ErrorCliente) {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const ua = navigator.userAgent;
    const params = new URLSearchParams(window.location.search);
    const payload = {
      tipo: err.name || "Error",
      mensaje: err.message || String(error),
      stack: err.stack ?? undefined,
      digest: digest ?? undefined,
      ruta: normalizarRuta(window.location.pathname),
      actionId: actionId ?? rastroReciente().at(-1) ?? undefined,
      correlationId,
      sid: sidActual() ?? undefined,
      organizacionId: params.get("organizationId") ?? undefined,
      sucursalId: params.get("sucursalId") ?? undefined,
      navegador: /Edg\//.test(ua)
        ? "edge"
        : /Chrome\//.test(ua)
          ? "chrome"
          : /Safari\//.test(ua)
            ? "safari"
            : /Firefox\//.test(ua)
              ? "firefox"
              : "otro",
      dispositivo: /Mobile|Android|iPhone|iPad/i.test(ua)
        ? "movil"
        : "escritorio",
      release: process.env.NEXT_PUBLIC_APP_RELEASE ?? undefined,
      rastro: [...rastroReciente()],
    };
    // Espejo opcional en Sentry con el mismo correlationId para cruzar el
    // incidente interno con el issue/replay externo.
    capturarEnSentry(err, {
      actionId: payload.actionId,
      correlationId,
      digest: payload.digest,
      ruta: payload.ruta,
    });
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/errores",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/errores", {
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => {});
  } catch {
    // Silencio absoluto: el reporte de errores nunca falla hacia el usuario.
  }
}

/** Instala listeners globales de error. Idempotente; llamar una vez. */
export function iniciarCapturaErrores() {
  window.addEventListener("error", (evento) => {
    reportarErrorCliente({ error: evento.error ?? evento.message });
  });
  window.addEventListener("unhandledrejection", (evento) => {
    reportarErrorCliente({ error: evento.reason });
  });
}

/**
 * Extrae los headers cf-ray y cf-ipcountry (si existen en el request o headers actuales)
 * para inyectarlos en el objeto contexto antes de guardar en incidentes_error.
 */
export function extraerHeadersCloudflare(
  requestHeaders?: Headers | Record<string, string | string[] | undefined> | null,
): { "cf-ray"?: string; "cf-ipcountry"?: string } {
  if (!requestHeaders) return {};
  if (typeof (requestHeaders as Headers).get === "function") {
    const h = requestHeaders as Headers;
    const cfRay = h.get("cf-ray");
    const cfIpCountry = h.get("cf-ipcountry");
    return {
      ...(cfRay ? { "cf-ray": cfRay } : {}),
      ...(cfIpCountry ? { "cf-ipcountry": cfIpCountry } : {}),
    };
  }
  const rec = requestHeaders as Record<string, string | string[] | undefined>;
  const rawRay = rec["cf-ray"];
  const rawCountry = rec["cf-ipcountry"];
  const cfRay = Array.isArray(rawRay) ? rawRay[0] : rawRay;
  const cfIpCountry = Array.isArray(rawCountry) ? rawCountry[0] : rawCountry;
  return {
    ...(cfRay ? { "cf-ray": cfRay } : {}),
    ...(cfIpCountry ? { "cf-ipcountry": cfIpCountry } : {}),
  };
}

/**
 * Incluye cf-ray y cf-ipcountry desde requestHeaders en el objeto contexto cuando están presentes.
 */
export function enriquecerContextoConHeaders(
  contexto: Record<string, unknown> = {},
  requestHeaders?: Headers | null,
): Record<string, unknown> {
  const cfRay = requestHeaders?.get("cf-ray");
  const cfIpCountry = requestHeaders?.get("cf-ipcountry");
  return {
    ...contexto,
    ...(cfRay ? { "cf-ray": cfRay } : {}),
    ...(cfIpCountry ? { "cf-ipcountry": cfIpCountry } : {}),
  };
}
