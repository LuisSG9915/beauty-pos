/**
 * Benchmark de TTFB/LCP/CLS de las rutas admin y de navegación cliente,
 * en escritorio (1366px) y móvil (390px), con conteo de tráfico del Worker
 * (prefetch storm, re-descargas de metadata).
 *
 * Uso: pnpm test:perf  (con `pnpm dev` corriendo)
 *   --only=pos           limita las rutas por subcadena (repetible o CSV)
 *   --viewport=movil     corre solo un contexto (desktop | movil)
 *   --runs=5             repeticiones por medición (default 3 o PERF_RUNS)
 *   --json               guarda resultados en .artifacts/perf-*.json
 */
import type { Page } from "puppeteer";

import { loggedPage, pickViewports, withBrowser } from "./lib/browser";
import { checkFlags } from "./lib/cli";
import { clickByHref } from "./lib/dom";
import { BASE_URL } from "./lib/e2e";
import { writeArtifact } from "./lib/report";

const ROUTES = [
  "/admin",
  "/admin/agenda",
  "/admin/mi-dia",
  "/admin/pos",
  "/admin/caja",
  "/admin/clientes",
  "/admin/reportes",
  "/admin/sucursales",
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

type CargaRow = {
  viewport: string;
  ruta: string;
  ttfbP50: number;
  ttfbP95: number;
  lcpP50: number | null;
  clsMax: number;
  reqNav: number;
  prefetch: number;
  meta: number;
};

type NavRow = {
  viewport: string;
  ruta: string;
  feedbackP50: number | null;
  totalP50: number | null;
  totalP95: number | null;
  min: number | null;
  req: number;
  prefetch: number;
  fallos: number;
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
  const flags = checkFlags();
  const RUNS = flags.runs ?? Number(process.env.PERF_RUNS ?? 3);
  const match = (list: string[]) =>
    flags.only.length ? list.filter((r) => flags.only.some((o) => r.includes(o))) : list;
  const routes = match(ROUTES);
  const viewports = pickViewports(flags.viewports);
  if (viewports.length === 0) {
    throw new Error(`--viewport sin coincidencias: ${flags.viewports.join(", ")} (desktop | movil)`);
  }

  const cargas: CargaRow[] = [];
  const navs: NavRow[] = [];
  const clientesCheck: { viewport: string; prefetchExpedientes: number; exportSinClic: number }[] = [];

  await withBrowser(async (browser) => {
    for (const viewport of viewports) {
      const page = await loggedPage(browser, viewport);
      await instrumentVitals(page);
      console.log(`\n=== ${viewport.nombre} ${viewport.width}x${viewport.height} — cargas completas ===`);

      const net = freshNet();
      watchRequests(page, net);
      for (const route of routes) {
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
        const lcpVals = samples.map((s) => s.lcp).filter((v) => v > 0);
        const lcp = lcpVals.length ? stats(lcpVals).p50 : null;
        const cls = Math.max(...samples.map((s) => s.cls));
        cargas.push({
          viewport: viewport.nombre,
          ruta: route,
          ttfbP50: t.p50,
          ttfbP95: t.p95,
          lcpP50: lcp,
          clsMax: cls,
          reqNav: reqs / RUNS,
          prefetch: prefetches / RUNS,
          meta: meta / RUNS,
        });
        console.log(
          `${route.padEnd(20)} TTFB p50 ${t.p50}ms (p95 ${t.p95}) | LCP p50 ${lcp ?? "-"}ms | CLS máx ${cls} | req/nav ${(reqs / RUNS).toFixed(0)} (prefetch ${(prefetches / RUNS).toFixed(0)}, meta ${(meta / RUNS).toFixed(1)})`,
        );
      }

      // /admin/clientes: las filas no deben prefetchear expedientes ni la
      // exportación (efecto lateral de auditoría por descarga).
      if (routes.includes("/admin/clientes")) {
        Object.assign(net, freshNet(), { paths: {}, prefetchPaths: {} });
        await measure(page, `${BASE_URL}/admin/clientes`);
        await page.waitForNetworkIdle({ idleTime: 600, timeout: 15000 }).catch(() => {});
        const prefetchPaths = Object.keys(net.prefetchPaths).filter((p) =>
          /^\/admin\/clientes\/.+/.test(p),
        );
        const exportHits = net.paths["/admin/clientes/export"] ?? 0;
        clientesCheck.push({
          viewport: viewport.nombre,
          prefetchExpedientes: prefetchPaths.length,
          exportSinClic: exportHits,
        });
        console.log(
          `check clientes: prefetch de expedientes ${prefetchPaths.length}, export sin clic ${exportHits} ${exportHits === 0 && prefetchPaths.length === 0 ? "OK" : "FALLO"}`,
        );
      }
      await page.close();
    }

    // Navegación cliente en ambos contextos: además del tiempo total, medimos
    // el primer feedback visual para detectar el patrón "tuve que tocar dos veces".
    const NAV_MARKERS: Record<string, string> = {
      "/admin/agenda": "Agenda",
      "/admin/mi-dia": "Mi día",
      "/admin/pos": "Cobrar",
      "/admin/caja": "Caja",
    };
    const navRoutes = match(Object.keys(NAV_MARKERS));

    for (const viewport of viewports) {
      const page = await loggedPage(browser, viewport);
      const navNet = freshNet();
      watchRequests(page, navNet);
      console.log(`\n=== Navegación cliente (${viewport.nombre}) ===`);

      const clientSamples: Record<string, number[]> = {};
      const feedbackSamples: Record<string, number[]> = {};
      const clientReqs: Record<string, { req: number; prefetch: number }[]> = {};
      for (const route of navRoutes) {
        clientSamples[route] = [];
        feedbackSamples[route] = [];
        clientReqs[route] = [];
      }

      for (let i = 0; i < RUNS; i++) {
        for (const route of navRoutes) {
          await page.goto(`${BASE_URL}/admin`, { waitUntil: "load", timeout: 60000 });
          // La medición empieza cuando la página ya es interactiva; en dev los
          // chunks de hidratación pueden seguir llegando después de `load`.
          await page.waitForNetworkIdle({ idleTime: 300, timeout: 10000 }).catch(() => {});
          Object.assign(navNet, freshNet(), { paths: {}, prefetchPaths: {} });

          const navSelector = viewport.isMobile
            ? 'nav[aria-label="Accesos rápidos"] a[href]'
            : 'nav[aria-label="Navegación del panel"] a[href]';
          // Las rutas secundarias viven tras "Más" en el tab bar móvil: el
          // sheet se abre fuera del cronómetro — medimos la navegación desde
          // el toque al enlace, que es la acción que dispara el route change.
          const enTabBar = await page.evaluate(
            (sel, p) =>
              [...document.querySelectorAll<HTMLAnchorElement>(sel)].some(
                (a) => new URL(a.href).pathname === p && a.getBoundingClientRect().width > 0,
              ),
            navSelector,
            route,
          );
          if (!enTabBar) {
            await page.click('[data-action-id="nav.mas_abrir"]').catch(() => {});
            await page.waitForSelector(`a[href*="${route}"]`, { visible: true, timeout: 3000 }).catch(() => {});
          }

          const t0 = Date.now();
          const clicked = await clickByHref(page, route, enTabBar ? navSelector : "a[href]");

          const feedback = await page
            .waitForFunction(
              () =>
                Boolean(
                  document.querySelector(".admin-nav-progress") ||
                    document.querySelector('[data-pending="true"]'),
                ),
              { timeout: 1500, polling: 16 },
            )
            .then(() => Date.now() - t0)
            .catch(() => NaN);
          feedbackSamples[route].push(feedback);

          try {
            await page.waitForFunction(
              (h, marker) =>
                location.pathname === h &&
                document.querySelector("main h1")?.textContent?.trim() === marker,
              { timeout: 15000, polling: 100 },
              route,
              NAV_MARKERS[route],
            );
            clientSamples[route].push(Date.now() - t0);
          } catch {
            console.log(`  !! ${route}: clicked=${clicked} url=${page.url()}`);
            clientSamples[route].push(NaN);
          }

          await page.waitForNetworkIdle({ idleTime: 300, timeout: 3000 }).catch(() => {});
          clientReqs[route].push({ req: navNet.total, prefetch: navNet.prefetch });
        }
      }

      for (const [route, samples] of Object.entries(clientSamples)) {
        const ok = samples.filter((v) => Number.isFinite(v));
        const feedbackOk = feedbackSamples[route].filter((v) => Number.isFinite(v));
        const reqs = clientReqs[route];
        const avgReq = reqs.reduce((a, r) => a + r.req, 0) / reqs.length;
        const avgPre = reqs.reduce((a, r) => a + r.prefetch, 0) / reqs.length;
        if (ok.length === 0) {
          navs.push({
            viewport: viewport.nombre,
            ruta: route,
            feedbackP50: feedbackOk.length ? stats(feedbackOk).p50 : null,
            totalP50: null,
            totalP95: null,
            min: null,
            req: avgReq,
            prefetch: avgPre,
            fallos: samples.length,
          });
          console.log(`nav -> ${route.padEnd(20)} FALLO: ${samples.length}/${samples.length} navegaciones sin completar`);
          continue;
        }
        const s = stats(ok);
        const f = feedbackOk.length ? stats(feedbackOk) : null;
        const fallos = samples.length - ok.length;
        navs.push({
          viewport: viewport.nombre,
          ruta: route,
          feedbackP50: f?.p50 ?? null,
          totalP50: s.p50,
          totalP95: s.p95,
          min: s.min,
          req: avgReq,
          prefetch: avgPre,
          fallos,
        });
        console.log(
          `nav -> ${route.padEnd(20)} feedback p50 ${f?.p50 ?? "-"}ms | total p50 ${s.p50}ms (p95 ${s.p95}, min ${s.min}) | req ${avgReq.toFixed(0)} (prefetch ${avgPre.toFixed(0)})${fallos ? ` | ${fallos} fallo(s)` : ""}`,
        );
      }
      await page.close();
    }
  });

  if (flags.json) {
    writeArtifact("perf", {
      generado: new Date().toISOString(),
      runs: RUNS,
      viewports: viewports.map((v) => v.nombre),
      cargas,
      navegacion: navs,
      clientesCheck,
    });
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
