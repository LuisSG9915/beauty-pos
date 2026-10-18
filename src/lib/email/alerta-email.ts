import { getRuntimeEnv } from "@/lib/runtime-env";

export type AlertaIncidenteInput = {
  to: string;
  titulo: string;
  ruta: string;
  fingerprint: string;
  cfRay?: string;
  prioridad: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}

/**
 * Envía un correo de alerta de incidente crítico (P0/P1) usando Brevo SMTP API.
 */
export async function enviarAlertaIncidenteCritico(input: AlertaIncidenteInput): Promise<void> {
  const env = getRuntimeEnv();
  const apiKey = env.BREVO_API_KEY;
  const fromEmail = env.BREVO_FROM_EMAIL;
  const fromName = env.BREVO_FROM_NAME ?? "Melena Observabilidad";

  if (!apiKey || !fromEmail) {
    return;
  }

  const safeTitulo = escapeHtml(input.titulo);
  const safeRuta = escapeHtml(input.ruta);
  const safeFingerprint = escapeHtml(input.fingerprint);
  const safeRay = escapeHtml(input.cfRay ?? "n/a");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    signal: AbortSignal.timeout(6000),
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: input.to }],
      subject: `[ALERTA ${input.prioridad}] Incidente crítico en ${input.ruta}: ${input.titulo.slice(0, 80)}`,
      htmlContent: `
        <main style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 8px 0; color: #991b1b; font-size: 18px;">Alerta de Incidente Crítico (${escapeHtml(input.prioridad)})</h2>
            <p style="margin: 0; color: #7f1d1d; font-size: 14px;">Se ha registrado una nueva ocurrencia crítica en producción que requiere atención inmediata.</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 120px; color: #475569;">Título:</td>
              <td style="padding: 8px 0; color: #0f172a;">${safeTitulo}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Ruta:</td>
              <td style="padding: 8px 0; color: #0f172a;"><code>${safeRuta}</code></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Fingerprint:</td>
              <td style="padding: 8px 0; color: #0f172a;"><code style="font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${safeFingerprint}</code></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">CF-Ray:</td>
              <td style="padding: 8px 0; color: #0f172a;"><code style="font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${safeRay}</code></td>
            </tr>
          </table>
          <p style="font-size: 14px; margin-bottom: 20px;">
            <a href="https://melena.app/admin/incidentes" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              Ver incidente en panel
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">Melena Observability &bull; Notificación generada automáticamente en Edge.</p>
        </main>
      `,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Brevo alert email failed (${response.status}): ${errorBody}`);
  }
}
