import { iniciarCapturaErrores } from "@/lib/observability/reportar-error";
import { iniciarTelemetria, trackPageView } from "@/lib/telemetry/cliente";

/**
 * Instrumentación del navegador (convención Next.js `instrumentation-client`):
 * corre tras cargar el HTML y antes de la hidratación, así que captura errores
 * tempranos de arranque. Todo el trabajo es fire-and-forget y envuelto en
 * try/catch: un fallo aquí jamás debe impedir que la app sea interactiva.
 */
try {
  iniciarTelemetria();
  iniciarCapturaErrores();
} catch {
  // Nunca propagar errores de instrumentación.
}

/**
 * Las navegaciones del App Router no recargan la página: este hook emite el
 * page view "virtual" con la ruta normalizada para la telemetría de producto.
 */
export function onRouterTransitionStart(url: string) {
  try {
    trackPageView(url);
  } catch {
    // Ignorar.
  }
}
