"use client";

/**
 * Integración opcional con Sentry (solo navegador). Se activa cuando existe
 * `NEXT_PUBLIC_SENTRY_DSN`; sin la variable este módulo no carga el SDK ni
 * emite nada — la captura first-party en /api/errores sigue siendo la vía
 * principal y no depende de servicios externos.
 *
 * Privacidad: Replay arranca con todo el texto e imágenes enmascarados y
 * `sendDefaultPii` apagado. Muestreo inicial: 5% de sesiones normales y
 * 100% de sesiones con error.
 *
 * Nota: el SDK de servidor para Cloudflare Workers (@sentry/cloudflare)
 * requiere envolver el entry generado por OpenNext; los errores de servidor
 * ya llegan al módulo de incidentes vía instrumentation.ts.
 */
type SentryBrowser = typeof import("@sentry/browser");

let sentry: SentryBrowser | null = null;
let iniciado = false;

export function iniciarSentry() {
  if (iniciado) return;
  iniciado = true;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || typeof window === "undefined") return;
  void import("@sentry/browser")
    .then((modulo) => {
      modulo.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_APP_ENV ?? "production",
        release: process.env.NEXT_PUBLIC_APP_RELEASE,
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0.05,
        replaysOnErrorSampleRate: 1,
        integrations: [
          modulo.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
          }),
        ],
      });
      sentry = modulo;
    })
    .catch(() => {
      // Sentry es opcional: si el chunk o la inicialización fallan, la app
      // sigue reportando por la vía first-party.
    });
}

/** Adjunta el error a Sentry cuando está activo; no-op en caso contrario. */
export function capturarEnSentry(
  error: Error,
  contexto: Record<string, string | undefined>,
) {
  try {
    sentry?.captureException(error, { extra: contexto });
  } catch {
    // Silencio.
  }
}
