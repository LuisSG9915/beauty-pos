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
 * Inicia sesión por la UI (flujo real de login) y espera la llegada al panel.
 */
export async function login(page: Page, email = E2E_EMAIL) {
  const password = await resetTestPassword(email);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "load" });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname.startsWith("/admin"), {
    timeout: 30000,
  });
}
