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
export async function resetTestPassword(email: string) {
  const password = `Bench!${randomBytes(12).toString("hex")}`;
  const auth = createAuth();
  const ctx = await (auth as unknown as {
    $context: Promise<{ password: { hash: (p: string) => Promise<string> } }>;
  }).$context;
  const hash = await ctx.password.hash(password);
  const db = getDatabase();
  const target = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!target[0]) throw new Error(`Usuario ${email} no existe`);
  await db
    .update(account)
    .set({ password: hash })
    .where(and(eq(account.userId, target[0].id), eq(account.providerId, "credential")));
  return password;
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
export async function sessionCookie(email = E2E_EMAIL): Promise<{ name: string; value: string }> {
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

  // Vía local: el sign-in corre en este proceso (DATABASE_URL directo, sin
  // Hyperdrive ni rate-limit HTTP). La cookie se firma con el mismo
  // BETTER_AUTH_SECRET que producción; solo cambia el prefijo __Secure-.
  try {
    const res = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    const match = (res.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=([^;]*)/i);
    if (res.ok && match) {
      const name = BASE_URL.startsWith("https")
        ? "__Secure-better-auth.session_token"
        : "better-auth.session_token";
      return { name, value: match[1] };
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
      const match = (res.headers.get("set-cookie") ?? "").match(/([^=;\s]*session_token)=([^;]*)/i);
      if (match) return { name: match[1], value: match[2] };
      throw new Error("sign-in sin session_token en set-cookie");
    }
    if (res.status !== 401 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error(`sign-in remoto falló (${lastStatus}) tras reintentos`);
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
  const { name, value } = await sessionCookie(email);
  await page.setCookie({ name, value, url: BASE_URL });
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "load" });
  // polling por intervalo: en headless el rAF puede pausarse y el default
  // de waitForFunction (raf) se queda esperando aunque la navegación ya ocurrió.
  await page.waitForFunction(() => location.pathname.startsWith("/admin"), {
    timeout: 30000,
    polling: 100,
  });
}
