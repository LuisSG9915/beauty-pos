import type { Instrumentation } from "next";

export function register() {
  // Reservado para inicialización futura (p.ej. Sentry cuando haya DSN).
}

/**
 * Errores de servidor capturados por Next.js: render de RSC, route handlers y
 * server actions. Se persisten sanitizados en `incidentes_error` para el
 * módulo de la plataforma. El `digest` de React agrupa el error real aunque la
 * instancia llegue procesada.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  try {
    const { getDatabase } = await import("@/db/client");
    const { extraerHeadersCloudflare, registrarError } = await import("@/lib/observability/error-core");

    const err = error instanceof Error ? error : new Error(String(error));
    // Drizzle envuelve el error real de pg en `cause` ("Failed query: <sql>");
    // sin la causa el incidente muestra solo el SQL y no el motivo de red.
    let mensaje = err.message || String(error);
    let causa: unknown = err.cause;
    let niveles = 0;
    while (causa instanceof Error && causa.message && niveles < 3) {
      mensaje = `[causa] ${causa.message} | ${mensaje}`;
      causa = causa.cause;
      niveles += 1;
    }
    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest?: unknown }).digest)
        : null;

    const userAgent = request.headers["user-agent"];
    const ua = Array.isArray(userAgent) ? userAgent[0] : userAgent;

    await registrarError(getDatabase(), {
      fuente: context.routeType === "action" ? "server_action" : "server",
      tipo: err.name || "Error",
      mensaje,
      stack: err.stack ?? null,
      digest,
      // routePath es el patrón de archivo (/app/blog/[slug]) — ya normalizado.
      ruta: context.routePath ?? request.path,
      contexto: {
        metodo: request.method,
        routeType: context.routeType,
        renderSource: context.renderSource,
        ...extraerHeadersCloudflare(request.headers),
      },
      navegador: ua
        ? /Edg\//.test(ua)
          ? "edge"
          : /Chrome\//.test(ua)
            ? "chrome"
            : /Safari\//.test(ua)
              ? "safari"
              : /Firefox\//.test(ua)
                ? "firefox"
                : "otro"
        : null,
      dispositivo: ua
        ? /Mobile|Android|iPhone|iPad/i.test(ua)
          ? "movil"
          : "escritorio"
        : null,
      release: process.env.APP_RELEASE ?? null,
    });
  } catch (captureError) {
    // Último recurso: el log de Workers conserva el error original.
    console.error("onRequestError capture failed", captureError);
  }
};
