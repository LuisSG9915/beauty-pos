import "dotenv/config";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { Page } from "puppeteer";

import { getDatabase } from "@/db/client";
import { account, user } from "@/db/schema/auth";
import { createAuth } from "@/lib/auth/server";

export const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
export const E2E_EMAIL = process.env.PERF_EMAIL ?? "e2e-salon@test.dev";

/**
 * Genera una contraseña aleatoria para la cuenta de pruebas y la aplica con el
 * mismo hasher de better-auth. La contraseña solo vive en este proceso.
 */
async function applyTestPassword(email: string): Promise<string> {
  const password = `Bench!${randomBytes(12).toString("hex")}`;
  const auth = createAuth();
  const ctx = await (auth as unknown as {
    $context: Promise<{ password: { hash: (p: string) => Promise<string> } }>;
  }).$context;
  const hash = await ctx.password.hash(password);
  const db = getDatabase();
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!target) throw new Error(`Usuario ${email} no existe`);
  await db
    .update(account)
    .set({ password: hash })
    .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")));
  return password;
}

export async function resetTestPassword(email: string) {
  return applyTestPassword(email);
}

/**
 * Obtiene una cookie de sesión válida haciendo sign-in contra BASE_URL.
 *
 * El reset de contraseña escribe por DATABASE_URL directo, pero el Worker lee
 * vía Hyperdrive (caché habilitado): un sign-in inmediato puede validar contra
 * el hash anterior y responder 401. Se reintenta con pausa hasta que la caché
 * expire (~60 s máx.). La cookie remota ya trae el nombre/firma correctos del
 * entorno (__Secure- en https).
 */
/** Todas las cookies de sesión better-auth (token + session_data del cookieCache). */
export async function sessionCookies(
  email = E2E_EMAIL,
): Promise<Array<{ name: string; value: string }>> {
  const password = await applyTestPassword(email);
  const auth = createAuth();
  const secure = BASE_URL.startsWith("https");

  const parseCookies = (headers: Headers) =>
    (typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") ?? ""])
      .flatMap((line) => line.split(/,(?=\s*[^=;\s]+=[^;]*;)/))
      .flatMap((line) => {
        const match = line.match(/([^=;\s]+)=([^;]*)/);
        return match ? [{ name: match[1], value: match[2] }] : [];
      })
      .filter((cookie) => /better-auth/i.test(cookie.name));

  // Vía local: el sign-in corre en este proceso (DATABASE_URL directo, sin
  // Hyperdrive ni rate-limit HTTP). Las cookies se firman con el mismo
  // BETTER_AUTH_SECRET que producción; solo cambia el prefijo __Secure-.
  try {
    const res = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    const cookies = parseCookies(res.headers);
    if (res.ok && cookies.some((cookie) => /session_token/.test(cookie.name))) {
      return cookies.map((cookie) => ({
        name: secure && !cookie.name.startsWith("__Secure-") ? `__Secure-${cookie.name}` : cookie.name,
        value: cookie.value,
      }));
    }
  } catch {
    // cae al sign-in remoto
  }

  const deadline = Date.now() + 90_000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({ email, password }),
    });
    lastStatus = res.status;
    if (res.ok) {
      const cookies = parseCookies(res.headers);
      if (cookies.some((cookie) => /session_token/.test(cookie.name))) return cookies;
      throw new Error("sign-in sin session_token en set-cookie");
    }
    if (res.status !== 401 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error(`sign-in remoto falló (${lastStatus}) tras reintentos`);
}

export async function sessionCookie(email = E2E_EMAIL): Promise<{ name: string; value: string }> {
  const cookies = await sessionCookies(email);
  const token = cookies.find((cookie) => /session_token/.test(cookie.name));
  if (!token) throw new Error("sign-in sin session_token");
  return token;
}

/** Cabecera Cookie completa para fetch (incluye session_data si existe). */
export async function sessionCookieHeader(email = E2E_EMAIL): Promise<string> {
  const cookies = await sessionCookies(email);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/**
 * Inyecta una sesión válida y espera la llegada al panel. Las páginas del
 * mismo contexto comparten cookies, así que basta una llamada por contexto;
 * con sesión activa el formulario de sign-in responde 401.
 */
export async function login(page: Page, email = E2E_EMAIL) {
  const probe = await page.goto(`${BASE_URL}/admin`, { waitUntil: "load" }).catch(() => null);
  if (probe && !new URL(page.url()).pathname.startsWith("/login")) {
    await page
      .waitForFunction(() => location.pathname.startsWith("/admin"), { timeout: 15000, polling: 100 })
      .catch(() => {});
    if (new URL(page.url()).pathname.startsWith("/admin")) return;
  }
  const cookies = await sessionCookies(email);
  await page.setCookie(...cookies.map((cookie) => ({ ...cookie, url: BASE_URL })));
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "load" });
  // polling por intervalo: en headless el rAF puede pausarse y el default
  // de waitForFunction (raf) se queda esperando aunque la navegación ya ocurrió.
  await page.waitForFunction(() => location.pathname.startsWith("/admin"), {
    timeout: 30000,
    polling: 100,
  });
}
