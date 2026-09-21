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

export type AvisoCitaInput = {
  to: string;
  nombreCliente: string;
  nombreNegocio: string;
  sucursalNombre: string;
  /** Fecha/hora ya formateada en la zona local del negocio. */
  fechaHoraTexto: string;
  /** Fecha/hora previa, solo para avisos de cambio. */
  fechaHoraPreviaTexto?: string | null;
  servicioNombre?: string | null;
  /** Nota del negocio (p.ej. política de cancelación), ya en texto plano. */
  nota?: string | null;
  /** Enlace público de autogestión (`/mi-cita/[token]`) para el correo. */
  gestionUrl?: string | null;
};

type Plantilla = { subject: string; titulo: string; mensaje: string };

function plantillaPorTipo(tipo: string, input: AvisoCitaInput): Plantilla {
  const negocio = input.nombreNegocio;
  switch (tipo) {
    case "confirmacion":
      return {
        subject: `Tu cita en ${negocio} está confirmada`,
        titulo: "¡Tu cita está confirmada!",
        mensaje: `Estos son los detalles de tu cita en <strong>${escapeHtml(negocio)}</strong>:`,
      };
    case "recordatorio":
      return {
        subject: `Recordatorio de tu cita en ${negocio}`,
        titulo: "Te esperamos pronto",
        mensaje: `Te recordamos tu cita en <strong>${escapeHtml(negocio)}</strong>:`,
      };
    case "cambio":
      return {
        subject: `Tu cita en ${negocio} cambió de horario`,
        titulo: "Tu cita cambió de horario",
        mensaje: `Tu cita en <strong>${escapeHtml(negocio)}</strong> fue reagendada. Este es el nuevo horario:`,
      };
    case "cancelacion":
      return {
        subject: `Tu cita en ${negocio} fue cancelada`,
        titulo: "Tu cita fue cancelada",
        mensaje: `Tu cita en <strong>${escapeHtml(negocio)}</strong> fue cancelada:`,
      };
    case "solicitud":
      return {
        subject: `Recibimos tu solicitud de cita en ${negocio}`,
        titulo: "Recibimos tu solicitud",
        mensaje: `Tu solicitud de cita en <strong>${escapeHtml(negocio)}</strong> está pendiente de confirmación por el negocio:`,
      };
    default:
      return {
        subject: `Aviso de tu cita en ${negocio}`,
        titulo: "Aviso de tu cita",
        mensaje: `Detalles de tu cita en <strong>${escapeHtml(negocio)}</strong>:`,
      };
  }
}

/**
 * Aviso transaccional de cita por correo (Brevo HTTP). Lanza si el envío falla
 * para que el worker reintente; en éxito devuelve el `messageId` del proveedor
 * para dejar trazabilidad de la entrega aceptada.
 */
export async function sendAvisoCita(tipo: string, input: AvisoCitaInput): Promise<{ proveedorId: string | null }> {
  const env = getRuntimeEnv();
  const apiKey = env.BREVO_API_KEY;
  const fromEmail = env.BREVO_FROM_EMAIL;
  const fromName = env.BREVO_FROM_NAME ?? input.nombreNegocio;
  if (!apiKey || !fromEmail) {
    throw new Error("BREVO_API_KEY and BREVO_FROM_EMAIL are not configured.");
  }

  const cliente = escapeHtml(input.nombreCliente);
  const sucursal = escapeHtml(input.sucursalNombre);
  const cuando = escapeHtml(input.fechaHoraTexto);
  const antes = input.fechaHoraPreviaTexto ? escapeHtml(input.fechaHoraPreviaTexto) : null;
  const servicio = input.servicioNombre ? escapeHtml(input.servicioNombre) : null;
  const nota = input.nota ? escapeHtml(input.nota) : null;
  const gestion = input.gestionUrl ? escapeHtml(input.gestionUrl) : null;
  const plantilla = plantillaPorTipo(tipo, input);

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
      subject: plantilla.subject,
      htmlContent: `
        <main style="font-family: Arial, sans-serif; line-height: 1.6; color: #272328">
          <h1 style="font-size: 20px">Hola, ${cliente}</h1>
          <h2 style="font-size: 16px; font-weight: 600">${plantilla.titulo}</h2>
          <p>${plantilla.mensaje}</p>
          <table style="border-collapse: collapse">
            <tr><td style="padding: 4px 12px 4px 0; color: #675d6a">Sucursal</td><td><strong>${sucursal}</strong></td></tr>
            ${antes ? `<tr><td style="padding: 4px 12px 4px 0; color: #675d6a">Horario anterior</td><td><s>${antes}</s></td></tr>` : ""}
            <tr><td style="padding: 4px 12px 4px 0; color: #675d6a">Fecha y hora</td><td><strong>${cuando}</strong></td></tr>
            ${servicio ? `<tr><td style="padding: 4px 12px 4px 0; color: #675d6a">Servicio</td><td><strong>${servicio}</strong></td></tr>` : ""}
          </table>
          ${nota ? `<p style="color: #554d58">${nota}</p>` : ""}
          ${
            gestion
              ? `<p style="margin: 20px 0"><a href="${gestion}" style="background: #272328; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; display: inline-block">Consultar o modificar mi cita</a></p>
                 <p style="color: #675d6a; font-size: 12px">Guarda este enlace: con él puedes consultar el estado de tu cita, reagendarla o cancelarla según la política del negocio.</p>`
              : `<p>Si necesitas cambiar o cancelar tu cita, comunícate con el negocio.</p>`
          }
          <p style="color: #675d6a; font-size: 12px">Enviado por Melena a nombre de ${escapeHtml(input.nombreNegocio)}.</p>
        </main>
      `,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    // Sanitiza: solo status + prefijo del cuerpo, nunca credenciales.
    throw new Error(`Brevo ${response.status}: ${responseBody.slice(0, 200)}`);
  }

  const body = (await response.json().catch(() => null)) as { messageId?: string } | null;
  return { proveedorId: body?.messageId ?? null };
}
