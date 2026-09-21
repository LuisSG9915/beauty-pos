import puppeteer, { type Page } from "puppeteer";

import { BASE_URL, E2E_EMAIL, login } from "./lib/e2e";

const RUNS = Number(process.env.PERF_RUNS ?? 3);

const ROUTES = [
  "/admin",
  "/admin/agenda",
  "/admin/pos",
  "/admin/clientes",
  "/admin/reportes",
  "/admin/sucursales",
];

// Mismo criterio que la telemetría de producto: escritorio de mostrador y
// teléfono modesto, los dos contextos reales del salón.
const VIEWPORTS = [
  { nombre: "desktop", width: 1366, height: 900 },
  { nombre: "movil", width: 390, height: 844, isMobile: true, hasTouch: true },
];

type Sample = { ttfb: number; total: number; fcp: number; lcp: number; cls: number };

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return { p50: pick(0.5), p95: pick(0.95), min: sorted[0], max: sorted[sorted.length - 1] };
}

// Observadores de LCP/CLS se instalan antes de navegar (evaluateOnNewDocument
// corre en cada carga); los valores quedan en window.__perf para leerlos al
// final. `buffered: true` recupera entradas ya emitidas.
async function instrumentVitals(page: Page) {
  await page.evaluateOnNewDocument(() => {
    const vitals = { lcp: 0, cls: 0 };
    (window as unknown as { __perf: typeof vitals }).__perf = vitals;
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) vitals.lcp = entries[entries.length - 1].startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!shift.hadRecentInput) vitals.cls += shift.value ?? 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // Navegador sin soporte: las métricas quedan en 0.
    }
  });
}

async function measure(page: Page, url: string): Promise<Sample> {
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => {});
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
    const vitals = (window as unknown as { __perf?: { lcp: number; cls: number } }).__perf ?? { lcp: 0, cls: 0 };
    return {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      total: Math.round(nav.loadEventEnd || nav.duration),
      fcp: Math.round(paint?.startTime ?? -1),
      lcp: Math.round(vitals.lcp),
      cls: Number(vitals.cls.toFixed(3)),
    };
  });
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await instrumentVitals(page);
    await login(page, E2E_EMAIL);
    console.log(`\n=== ${viewport.nombre} ${viewport.width}x${viewport.height} — cargas completas ===`);

    for (const route of ROUTES) {
      const samples: Sample[] = [];
      for (let i = 0; i < RUNS; i++) {
        samples.push(await measure(page, `${BASE_URL}${route}`));
      }
      const t = stats(samples.map((s) => s.ttfb));
      const lcp = stats(samples.map((s) => s.lcp).filter((v) => v > 0));
      const cls = Math.max(...samples.map((s) => s.cls));
      console.log(
        `${route.padEnd(20)} TTFB p50 ${t.p50}ms (p95 ${t.p95}) | LCP p50 ${lcp.p50}ms | CLS máx ${cls}`,
      );
    }
    await page.close();
  }

  // Navegación cliente solo en escritorio: mide el costo de las transiciones
  // del App Router sin el ruido del primer render.
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[0]);
  await login(page, E2E_EMAIL);
  console.log("\n=== Navegación cliente (desktop) ===");
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
      // Regresar a /admin para que el siguiente clic parta del mismo origen.
      await page.goto(`${BASE_URL}/admin`, { waitUntil: "load" });
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
