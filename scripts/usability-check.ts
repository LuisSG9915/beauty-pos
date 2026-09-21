/**
 * Arnés de usabilidad automatizada para el público objetivo (baja
 * alfabetización digital, móvil primero).
 *
 * Verifica, en escritorio y móvil:
 *  1. axe-core WCAG 2.2 A/AA por página.
 *  2. Heurística de acción primaria: los elementos marcados con
 *     `data-action-clave="1"` deben ser visibles y de tamaño táctil.
 *  3. Tamaño de objetivo: controles interactivos ≥ 24px (WCAG 2.2 AA) y
 *     advertencia cuando < 44px en zonas táctiles.
 *  4. Rutas por clics: pasos para llegar a tareas frecuentes.
 *
 * No sustituye pruebas moderadas con usuarios reales; es la línea base
 * automatizada del plan de simplificación.
 *
 * Uso: pnpm tsx scripts/usability-check.ts  (con `pnpm dev` corriendo)
 */
import { AxePuppeteer } from "@axe-core/puppeteer";
import puppeteer, { type Page } from "puppeteer";

import { BASE_URL, E2E_EMAIL, login } from "./lib/e2e";

const VIEWPORTS = [
  { nombre: "desktop", width: 1366, height: 900 },
  { nombre: "movil", width: 390, height: 844, isMobile: true, hasTouch: true },
];

const PAGES = [
  "/admin",
  "/admin/agenda",
  "/admin/mi-dia",
  "/admin/pos",
  "/admin/caja",
  "/admin/clientes",
];

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

type Finding = {
  pagina: string;
  viewport: string;
  tipo: "axe" | "accion-primaria" | "objetivo-tactil";
  severidad: "error" | "aviso";
  detalle: string;
};

async function axeScan(page: Page, pagina: string, viewport: string): Promise<Finding[]> {
  const results = await new AxePuppeteer(page).withTags(AXE_TAGS).analyze();
  return results.violations.map((violation) => ({
    pagina,
    viewport,
    tipo: "axe" as const,
    severidad: (violation.impact === "critical" || violation.impact === "serious" ? "error" : "aviso") as "error" | "aviso",
    detalle: `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.length} nodo(s)`,
  }));
}

async function accionPrimariaCheck(page: Page, pagina: string, viewport: string): Promise<Finding[]> {
  const reporte = await page.evaluate(() => {
    const fold = window.innerHeight;
    const items = [...document.querySelectorAll<HTMLElement>('[data-action-clave="1"]')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-action-id") ?? el.textContent?.trim().slice(0, 40) ?? "?",
          aboveFold: rect.top < fold,
          alto: Math.round(rect.height),
        };
      });
    return { fold, items };
  });

  const findings: Finding[] = [];
  if (reporte.items.length === 0) {
    findings.push({
      pagina,
      viewport,
      tipo: "accion-primaria",
      severidad: "aviso",
      detalle: "Sin acción marcada con data-action-clave (¿falta marcar la acción principal?)",
    });
  }
  for (const item of reporte.items) {
    if (item.alto < 40) {
      findings.push({
        pagina,
        viewport,
        tipo: "accion-primaria",
        severidad: "error",
        detalle: `Acción "${item.id}" mide ${item.alto}px de alto (<40px táctil)`,
      });
    }
    if (!item.aboveFold) {
      findings.push({
        pagina,
        viewport,
        tipo: "accion-primaria",
        severidad: "aviso",
        detalle: `Acción "${item.id}" queda bajo el pliegue (${reporte.fold}px)`,
      });
    }
  }
  return findings;
}

async function objetivoTactilCheck(page: Page, pagina: string, viewport: string): Promise<Finding[]> {
  const pequenos = await page.evaluate(() => {
    const selector = "main a[href], main button, main input, main select, main textarea, nav a, nav button";
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => {
        // Controles dentro de <label>: el objetivo real es la etiqueta completa.
        if (el.closest("label")) return false;
        // Input sr-only dentro de un botón (p. ej. dropzone): el botón es el objetivo.
        if (el.classList.contains("sr-only") && el.closest("button")) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((el) => ({
        etiqueta: (el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("placeholder") ?? "?").trim().slice(0, 40),
        alto: Math.round(el.getBoundingClientRect().height),
      }))
      .filter((el) => el.alto < 24);
  });
  return pequenos.map((el) => ({
    pagina,
    viewport,
    tipo: "objetivo-tactil" as const,
    severidad: "error" as const,
    detalle: `"${el.etiqueta}" mide ${el.alto}px (<24px mínimo WCAG 2.2)`,
  }));
}

/** Cuenta clics reales hasta completar micro-tareas frecuentes. */
async function rutaNuevaCita(page: Page): Promise<{ pasos: number; detalle: string }> {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle0", timeout: 60000 });
  // Paso 1: clic en "Nueva cita" del inicio → debe abrir el diálogo.
  const clicked = await page.evaluate(() => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find(
      (a) => a.textContent?.includes("Nueva cita"),
    );
    link?.click();
    return Boolean(link);
  });
  if (!clicked) return { pasos: -1, detalle: "no se encontró el acceso 'Nueva cita' en el inicio" };
  await page.waitForFunction(() => location.pathname === "/admin/agenda", { timeout: 30000, polling: 100 });
  const dialogoAbierto = await page
    .waitForSelector('[role="dialog"]', { visible: true, timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  return {
    pasos: 1,
    detalle: dialogoAbierto ? "inicio → Nueva cita → formulario abierto" : "el diálogo no abrió con ?nueva=1",
  };
}

async function rutaCobrarDesdeInicio(page: Page): Promise<{ pasos: number; detalle: string }> {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle0", timeout: 60000 });
  const clicked = await page.evaluate(() => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find(
      (a) => a.textContent?.trim().startsWith("Cobrar"),
    );
    link?.click();
    return Boolean(link);
  });
  if (!clicked) return { pasos: -1, detalle: "no se encontró el acceso 'Cobrar' en el inicio" };
  await page.waitForFunction(() => location.pathname === "/admin/pos", { timeout: 30000, polling: 100 });
  return { pasos: 1, detalle: "inicio → Cobrar → POS" };
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const findings: Finding[] = [];

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await login(page, E2E_EMAIL);
    console.log(`\n=== ${viewport.nombre} ${viewport.width}x${viewport.height} ===`);

    for (const ruta of PAGES) {
      await page.goto(`${BASE_URL}${ruta}`, { waitUntil: "networkidle0", timeout: 60000 });
      const hallazgos = [
        ...(await axeScan(page, ruta, viewport.nombre)),
        ...(await accionPrimariaCheck(page, ruta, viewport.nombre)),
        ...(await objetivoTactilCheck(page, ruta, viewport.nombre)),
      ];
      findings.push(...hallazgos);
      const errores = hallazgos.filter((h) => h.severidad === "error").length;
      console.log(`${ruta.padEnd(18)} ${hallazgos.length === 0 ? "OK" : `${errores} error(es), ${hallazgos.length - errores} aviso(s)`}`);
    }
    await page.close();
  }

  // Rutas por clics en escritorio.
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[0]);
  await login(page, E2E_EMAIL);
  console.log("\n=== Rutas por clics (desktop) ===");
  for (const ruta of [rutaNuevaCita, rutaCobrarDesdeInicio]) {
    const resultado = await ruta(page);
    console.log(`pasos=${resultado.pasos} · ${resultado.detalle}`);
  }
  await page.close();

  // Caso crítico reportado en móvil: Agenda → Mi día debe responder al primer
  // toque con una señal visible y completar sin una segunda activación.
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport(VIEWPORTS[1]);
  await login(mobilePage, E2E_EMAIL);
  console.log("\n=== Recorrido táctil (móvil) ===");
  await mobilePage.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0", timeout: 60000 });
  const tapOk = await mobilePage.evaluate(() => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find(
      (a) =>
        new URL(a.href).pathname === "/admin/mi-dia" &&
        a.getBoundingClientRect().width > 0,
    );
    link?.click();
    return Boolean(link);
  });
  const feedbackOk = tapOk
    ? await mobilePage
        .waitForFunction(
          () =>
            Boolean(
              document.querySelector(".admin-nav-progress") ||
                document.querySelector('[data-pending="true"]'),
            ),
          { timeout: 1500, polling: 16 },
        )
        .then(() => true)
        .catch(() => false)
    : false;
  const completedOk = tapOk
    ? await mobilePage
        .waitForFunction(
          () =>
            location.pathname === "/admin/mi-dia" &&
            document.querySelector("main h1")?.textContent?.trim() === "Mi día",
          { timeout: 15000, polling: 100 },
        )
        .then(() => true)
        .catch(() => false)
    : false;
  console.log(
    `Agenda → Mi día: toque=${tapOk ? "OK" : "FALLO"}, feedback=${feedbackOk ? "OK" : "FALLO"}, destino=${completedOk ? "OK" : "FALLO"}`,
  );
  if (!tapOk || !feedbackOk || !completedOk) {
    findings.push({
      pagina: "/admin/agenda → /admin/mi-dia",
      viewport: "movil",
      tipo: "accion-primaria",
      severidad: "error",
      detalle: `un toque no produjo navegación confirmada (toque=${tapOk}, feedback=${feedbackOk}, destino=${completedOk})`,
    });
  }
  await mobilePage.close();

  const errores = findings.filter((f) => f.severidad === "error");
  const avisos = findings.filter((f) => f.severidad === "aviso");
  console.log(`\n=== Resumen: ${errores.length} errores, ${avisos.length} avisos ===`);
  for (const f of findings) {
    console.log(`[${f.severidad}] ${f.viewport} ${f.pagina} ${f.tipo}: ${f.detalle}`);
  }

  await browser.close();
  process.exit(errores.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
