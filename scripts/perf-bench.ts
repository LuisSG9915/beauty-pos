import "dotenv/config";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import puppeteer, { type Page } from "puppeteer";

import { getDatabase } from "@/db/client";
import { account, user } from "@/db/schema/auth";
import { createAuth } from "@/lib/auth/server";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const BENCH_EMAIL = process.env.PERF_EMAIL ?? "e2e-salon@test.dev";
const RUNS = Number(process.env.PERF_RUNS ?? 3);

const ROUTES = [
  "/admin",
  "/admin/agenda",
  "/admin/pos",
  "/admin/clientes",
  "/admin/reportes",
  "/admin/sucursales",
];

type Sample = { ttfb: number; total: number; fcp: number };

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return { p50: pick(0.5), p95: pick(0.95), min: sorted[0], max: sorted[sorted.length - 1] };
}

async function measure(page: Page, url: string): Promise<Sample> {
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => {});
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
    return {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      total: Math.round(nav.loadEventEnd || nav.duration),
      fcp: Math.round(paint?.startTime ?? -1),
    };
  });
}

// Genera una contraseña aleatoria para la cuenta de pruebas y la aplica con el
// mismo hasher de better-auth. La contraseña solo vive en este proceso.
async function resetTestPassword(email: string) {
  const password = `Bench!${randomBytes(12).toString("hex")}`;
  const auth = createAuth();
  const ctx = await (auth as unknown as { $context: Promise<{ password: { hash: (p: string) => Promise<string> } }> }).$context;
  const hash = await ctx.password.hash(password);
  const db = getDatabase();
  const target = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!target[0]) throw new Error(`Usuario ${email} no existe`);
  await db
    .update(account)
    .set({ password: hash })
    .where(and(eq(account.userId, target[0].id), eq(account.providerId, "credential")));
  return password;
}

async function main() {
  const password = await resetTestPassword(BENCH_EMAIL);
  console.log(`Cuenta de pruebas lista: ${BENCH_EMAIL}`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });

  await page.goto(`${BASE_URL}/login`, { waitUntil: "load" });
  await page.type('input[name="email"]', BENCH_EMAIL);
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname.startsWith("/admin"), { timeout: 30000 });

  console.log("Sesión OK. Midiendo cargas completas de documento...\n");

  for (const route of ROUTES) {
    const samples: Sample[] = [];
    for (let i = 0; i < RUNS; i++) {
      samples.push(await measure(page, `${BASE_URL}${route}`));
    }
    const t = stats(samples.map((s) => s.ttfb));
    const l = stats(samples.map((s) => s.total));
    const f = stats(samples.map((s) => s.fcp).filter((v) => v >= 0));
    console.log(
      `${route.padEnd(20)} TTFB p50 ${t.p50}ms (p95 ${t.p95}) | load p50 ${l.p50}ms | fcp p50 ${f.p50}ms`,
    );
  }

  console.log("\nMidiendo navegación cliente entre rutas...");
  const clientSamples: Record<string, number[]> = {};
  for (const route of ROUTES.slice(1)) clientSamples[route] = [];

  for (let i = 0; i < RUNS; i++) {
    for (const route of ROUTES.slice(1)) {
      const t0 = Date.now();
      await page.evaluate((h) => {
        const link = [...document.querySelectorAll("a")].find(
          (a) => new URL(a.href).pathname === h,
        );
        link?.click();
      }, route);
      await page.waitForFunction((h) => location.pathname === h, { timeout: 30000 }, route);
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 30000 }).catch(() => {});
      clientSamples[route].push(Date.now() - t0);
    }
  }

  for (const [route, samples] of Object.entries(clientSamples)) {
    const s = stats(samples);
    console.log(`nav -> ${route.padEnd(20)} p50 ${s.p50}ms (p95 ${s.p95}, min ${s.min})`);
  }

  await browser.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
