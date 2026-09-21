import { getRuntimeEnv } from "@/lib/runtime-env";

type AuthEmailInput = {
  to: string;
  subject: string;
  title: string;
  url: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '\"': "&quot;",
  })[character] ?? character);
}

export async function sendAuthEmail({ to, subject, title, url }: AuthEmailInput) {
  const env = getRuntimeEnv();
  const apiKey = env.BREVO_API_KEY;
  const fromEmail = env.BREVO_FROM_EMAIL;
  const fromName = env.BREVO_FROM_NAME ?? "Melena";

  if (!apiKey || !fromEmail) {
    throw new Error("BREVO_API_KEY and BREVO_FROM_EMAIL are not configured.");
  }

  const safeTitle = escapeHtml(title);
  const safeUrl = escapeHtml(url);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      subject,
      htmlContent: `
        <main style="font-family: Arial, sans-serif; line-height: 1.5">
          <h1>${safeTitle}</h1>
          <p>Usa el siguiente enlace para continuar en Melena:</p>
          <p><a href="${safeUrl}">Continuar</a></p>
          <p>Si no solicitaste esta acción, puedes ignorar este correo.</p>
        </main>
      `,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Brevo email request failed (${response.status}): ${responseBody}`);
  }
}
