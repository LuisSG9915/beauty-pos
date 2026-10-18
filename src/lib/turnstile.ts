import { getCloudflareContext } from "@opennextjs/cloudflare";

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
};

/**
 * Valida un token de Cloudflare Turnstile contra el endpoint de siteverify.
 * Si TURNSTILE_SECRET_KEY no está configurada (en local, preview o CI/E2E),
 * retorna `true` automáticamente (bypass seguro para desarrollo/tests).
 */
export async function verificarTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  let secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    try {
      const context = getCloudflareContext({ async: false }) as {
        env?: { TURNSTILE_SECRET_KEY?: string };
      } | null;
      secretKey = context?.env?.TURNSTILE_SECRET_KEY;
    } catch {
      // Fuera de Workers
    }
  }

  // Bypass seguro si no está configurada la llave secreta en el entorno
  if (!secretKey) {
    return true;
  }

  // Si la llave está configurada pero no se proporcionó token
  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return false;
    }

    const data = (await res.json()) as TurnstileVerifyResponse;
    return Boolean(data.success);
  } catch (error) {
    console.error("[turnstile] Error validando token:", error);
    return false;
  }
}
