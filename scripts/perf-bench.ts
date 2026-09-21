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

// Conteo de tráfico del Worker por escenario: permite medir prefetch storm,
// re-descargas de metadata y efectos laterales, no solo Web Vitals.
type NetStats = {
  total: number;
  prefetch: number;
  metadata: number;
  paths: Record<string, number>;
  prefetchPaths: Record<string, number>;
};

function freshNet(): NetStats {
  return { total: 0, prefetch: 0, metadata: 0, paths: {}, prefetchPaths: {} };
}

function watchRequests(page: Page, net: NetStats) {
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    net.total += 1;
    net.paths[path] = (net.paths[path] ?? 0) + 1;
    if (req.headers()["next-router-prefetch"]) {
      net.prefetch += 1;
      net.prefetchPaths[path] = (net.prefetchPaths[path] ?? 0) + 1;
    }
    if (/\/(icon|apple-icon|manifest\.webmanifest|favicon\.ico)$/.test(path)) {
      net.metadata += 1;
    }
  });
}

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

    const net = freshNet();
    watchRequests(page, net);
    for (const route of ROUTES) {
      const samples: Sample[] = [];
      let reqs = 0;
      let prefetches = 0;
      let meta = 0;
      for (let i = 0; i < RUNS; i++) {
        Object.assign(net, freshNet(), { paths: {} });
        samples.push(await measure(page, `${BASE_URL}${route}`));
        reqs += net.total;
        prefetches += net.prefetch;
        meta += net.metadata;
      }
      const t = stats(samples.map((s) => s.ttfb));
      const lcp = stats(samples.map((s) => s.lcp).filter((v) => v > 0));
      const cls = Math.max(...samples.map((s) => s.cls));
      console.log(
        `${route.padEnd(20)} TTFB p50 ${t.p50}ms (p95 ${t.p95}) | LCP p50 ${lcp.p50}ms | CLS máx ${cls} | req/nav ${(reqs / RUNS).toFixed(0)} (prefetch ${(prefetches / RUNS).toFixed(0)}, meta ${(meta / RUNS).toFixed(1)})`,
      );
    }

    // /admin/clientes: las filas no deben prefetchear expedientes ni la
    // exportación (efecto lateral de auditoría por descarga).
    Object.assign(net, freshNet(), { paths: {}, prefetchPaths: {} });
    await measure(page, `${BASE_URL}/admin/clientes`);
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 15000 }).catch(() => {});
    const prefetchPaths = Object.keys(net.prefetchPaths).filter((p) =>
      /^\/admin\/clientes\/.+/.test(p),
    );
    const exportHits = net.paths["/admin/clientes/export"] ?? 0;
    console.log(
      `check clientes: prefetch de expedientes ${prefetchPaths.length}, export sin clic ${exportHits} ${exportHits === 0 && prefetchPaths.length === 0 ? "OK" : "FALLO"}`,
    );
    await page.close();
  }

  // Navegación cliente solo en escritorio: mide el costo de las transiciones
  // del App Router sin el ruido del primer render.
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[0]);
  const navNet = freshNet();
  watchRequests(page, navNet);
  await login(page, E2E_EMAIL);
  console.log("\n=== Navegación cliente (desktop) ===");
  const clientSamples: Record<string, number[]> = {};
  const clientReqs: Record<string, { req: number; prefetch: number }[]> = {};
  for (const route of ROUTES.slice(1)) {
    clientSamples[route] = [];
    clientReqs[route] = [];
  }

  for (let i = 0; i < RUNS; i++) {
    for (const route of ROUTES.slice(1)) {
      Object.assign(navNet, freshNet(), { paths: {}, prefetchPaths: {} });
      const t0 = Date.now();
      const clicked = await page.evaluate((h) => {
        const link = [...document.querySelectorAll("a")].find(
          (a) => new URL(a.href).pathname === h && a.getBoundingClientRect().width > 0,
        );
        link?.click();
        return Boolean(link);
      }, route);
      if (!clicked) {
        // Rutas secundarias viven tras "Más opciones": abrirla y reintentar.
        await page.click('[data-action-id="nav.mas_opciones"]').catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 400));
        await page.evaluate((h) => {
          const link = [...document.querySelectorAll("a")].find(
            (a) => new URL(a.href).pathname === h,
          );
          link?.click();
        }, route);
      }
      try {
        await page.waitForFunction((h) => location.pathname === h, { timeout: 15000, polling: 100 }, route);
        clientSamples[route].push(Date.now() - t0);
      } catch {
        console.log(`  !! ${route}: clicked=${clicked} url=${page.url()}`);
        clientSamples[route].push(NaN);
      }
      // Settle breve para contar requests de la navegación sin medir su
      // duración: el dev server mantiene conexiones vivas y un idle largo
      // inflaría el tiempo registrado.
      await page.waitForNetworkIdle({ idleTime: 300, timeout: 3000 }).catch(() => {});
      clientReqs[route].push({ req: navNet.total, prefetch: navNet.prefetch });
      // Regresar a /admin para que el siguiente clic parta del mismo origen.
      await page.goto(`${BASE_URL}/admin`, { waitUntil: "load" });
    }
  }

  for (const [route, samples] of Object.entries(clientSamples)) {
    const ok = samples.filter((v) => Number.isFinite(v));
    const reqs = clientReqs[route];
    const avgReq = reqs.reduce((a, r) => a + r.req, 0) / reqs.length;
    const avgPre = reqs.reduce((a, r) => a + r.prefetch, 0) / reqs.length;
    if (ok.length === 0) {
      console.log(`nav -> ${route.padEnd(20)} FALLO: ${samples.length}/${samples.length} navegaciones sin completar`);
      continue;
    }
    const s = stats(ok);
    const fallos = samples.length - ok.length;
    console.log(`nav -> ${route.padEnd(20)} p50 ${s.p50}ms (p95 ${s.p95}, min ${s.min}) | req ${avgReq.toFixed(0)} (prefetch ${avgPre.toFixed(0)})${fallos ? ` | ${fallos} fallo(s)` : ""}`);
  }

  await browser.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
