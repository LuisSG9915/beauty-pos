import { getRuntimeEnv } from "@/lib/runtime-env";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

/**
 * Recordatorio de cita por correo (Brevo HTTP). Lanza si el envío falla para
 * que el llamador marque el envío como `fallido` en la bitácora.
 */
export async function sendRecordatorioCita(input: {
  to: string;
  nombreCliente: string;
  nombreNegocio: string;
  sucursalNombre: string;
  /** Fecha/hora ya formateada en la zona local del negocio. */
  fechaHoraTexto: string;
  servicioNombre?: string | null;
}) {
  const env = getRuntimeEnv();
  const apiKey = env.BREVO_API_KEY;
  const fromEmail = env.BREVO_FROM_EMAIL;
  const fromName = env.BREVO_FROM_NAME ?? input.nombreNegocio;
  if (!apiKey || !fromEmail) {
    throw new Error("BREVO_API_KEY and BREVO_FROM_EMAIL are not configured.");
  }

  const negocio = escapeHtml(input.nombreNegocio);
  const cliente = escapeHtml(input.nombreCliente);
  const sucursal = escapeHtml(input.sucursalNombre);
  const cuando = escapeHtml(input.fechaHoraTexto);
  const servicio = input.servicioNombre ? escapeHtml(input.servicioNombre) : null;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: input.to, name: input.nombreCliente }],
      subject: `Recordatorio de tu cita en ${input.nombreNegocio}`,
      htmlContent: `
        <main style="font-family: Arial, sans-serif; line-height: 1.6; color: #292522">
          <h1 style="font-size: 20px">Hola, ${cliente}</h1>
          <p>Te recordamos tu cita en <strong>${negocio}</strong>:</p>
          <table style="border-collapse: collapse">
            <tr><td style="padding: 4px 12px 4px 0; color: #81746c">Sucursal</td><td><strong>${sucursal}</strong></td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #81746c">Fecha y hora</td><td><strong>${cuando}</strong></td></tr>
            ${servicio ? `<tr><td style="padding: 4px 12px 4px 0; color: #81746c">Servicio</td><td><strong>${servicio}</strong></td></tr>` : ""}
          </table>
          <p>Si necesitas cambiar o cancelar tu cita, comunícate con el negocio.</p>
          <p style="color: #a8958a; font-size: 12px">Enviado por Beauty POS a nombre de ${negocio}.</p>
        </main>
      `,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Brevo reminder failed (${response.status}): ${responseBody}`);
  }
}
