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
 *   --only=pos           limita las páginas por subcadena (repetible o CSV)
 *   --viewport=movil     corre solo un contexto (desktop | movil)
 *   --json               guarda findings en .artifacts/usability-*.json
 */
import { AxePuppeteer } from "@axe-core/puppeteer";
import type { Page } from "puppeteer";

import { loggedPage, pickViewports, withBrowser } from "./lib/browser";
import { checkFlags } from "./lib/cli";
import { clickByHref, clickByText, waitForPath } from "./lib/dom";
import { BASE_URL } from "./lib/e2e";
import { printFindings, writeArtifact, type Finding } from "./lib/report";

const PAGES = [
  "/admin",
  "/admin/agenda",
  "/admin/mi-dia",
  "/admin/pos",
  "/admin/caja",
  "/admin/clientes",
  "/admin/servicios",
  "/admin/productos",
  "/admin/inventario",
  "/admin/inventario/reabastecer",
  "/admin/compras",
  "/admin/facturacion",
  "/admin/categorias-servicios",
  "/admin/categorias-productos",
  "/admin/unidades-medida",
  "/admin/medios-pago",
  "/admin/impuestos",
  "/admin/promociones",
  "/admin/paquetes",
  "/admin/membresias",
  "/admin/gastos",
  "/admin/comisiones",
  "/admin/reportes",
  "/admin/usuarios",
  "/admin/sucursales",
  "/admin/roles",
  "/admin/auditoria",
  "/admin/suscripcion",
  "/admin/incidentes",
  "/admin/telemetria",
  "/admin/ayuda",
  "/admin/guia",
  "/admin/practica",
  "/admin/ventas",
];

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

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

/**
 * Layout móvil: detecta las fallas que obligan a alejar el zoom o a bajar
 * demasiado antes de operar. En móvil exige página sin desborde horizontal,
 * controles dentro del viewport y tablas anchas reemplazadas por tarjetas.
 */
async function layoutMovilCheck(page: Page, pagina: string, viewport: string): Promise<Finding[]> {
  const reporte = await page.evaluate(() => {
    const findings: { severidad: "error" | "aviso"; detalle: string }[] = [];
    // Visibilidad inlineada (esbuild/tsx renombra helpers internos y el
    // navegador no conoce `__name`); mantener idéntica en ambos filtros.
    const doc = document.documentElement;
    const exceso = doc.scrollWidth - doc.clientWidth;
    if (exceso > 1) {
      findings.push({
        severidad: "error",
        detalle: `la página se desborda ${Math.round(exceso)}px a la derecha (scrollWidth ${doc.scrollWidth} > viewport ${doc.clientWidth})`,
      });
    }

    // Controles interactivos cortados por el borde derecho/izquierdo.
    const cortados = [...document.querySelectorAll<HTMLElement>("main a[href], main button, main input, main select, main textarea")]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (el.closest('[aria-hidden="true"]') || style.clipPath !== "none" || style.clip !== "auto") return false;
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !el.classList.contains("sr-only");
      })
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.left >= -1 && rect.right <= doc.clientWidth + 1) return false;
        // Recortado por un ancestro con scroll propio (tabs, tablas): el
        // control sigue alcanzable desplazando esa región, no es desborde
        // real del viewport.
        let padre = el.parentElement;
        while (padre && padre !== document.body) {
          const estiloPadre = getComputedStyle(padre);
          const desplazable =
            (estiloPadre.overflowX === "auto" || estiloPadre.overflowX === "scroll") &&
            padre.scrollWidth > padre.clientWidth + 4;
          if (desplazable) return false;
          padre = padre.parentElement;
        }
        return true;
      })
      .slice(0, 5)
      .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("placeholder") ?? "?").trim().slice(0, 40));
    for (const etiqueta of cortados) {
      findings.push({
        severidad: "error",
        detalle: `control "${etiqueta || "?"}" queda cortado por el borde del teléfono`,
      });
    }

    // Tabla visible cuyo contenido excede el ancho disponible en móvil.
    // Si existe una alternativa de tarjetas (`hidden md:block`), la tabla
    // ya no es visible y este chequeo no la cuenta.
    const tablaAncha = [...document.querySelectorAll<HTMLElement>("main table")]
      .filter((tabla) => {
        const rect = tabla.getBoundingClientRect();
        const style = getComputedStyle(tabla);
        const contenedor = tabla.parentElement ?? tabla;
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          contenedor.scrollWidth > doc.clientWidth + 4
        );
      })
      .slice(0, 3)
      .map((tabla) => Math.round(tabla.scrollWidth));
    for (const ancho of tablaAncha) {
      findings.push({
        severidad: "error",
        detalle: `tabla de ~${ancho}px visible en ${doc.clientWidth}px sin alternativa móvil (usa filas tipo tarjeta o una región acotada)`,
      });
    }

    // Agenda día: la rejilla debe aparecer en el primer pliegue y tener
    // altura útil, para no exigir bajar antes de poder usarla.
    if (location.pathname === "/admin/agenda") {
      const rejilla = document.querySelector<HTMLElement>("[data-agenda-grid]");
      if (rejilla) {
        const rect = rejilla.getBoundingClientRect();
        const fold = window.innerHeight;
        if (rect.top > fold * 0.65) {
          findings.push({
            severidad: "error",
            detalle: `la rejilla de agenda empieza a ${Math.round(rect.top)}px (${Math.round((rect.top / fold) * 100)}% del pliegue de ${fold}px)`,
          });
        }
        if (rect.height < fold * 0.3) {
          findings.push({
            severidad: "error",
            detalle: `la rejilla mide ${Math.round(rect.height)}px de alto (<30% del pliegue): el desplazamiento interno no alcanza`,
          });
        }
      }
    }
    return findings;
  });
  return reporte.map((f) => ({ pagina, viewport, tipo: "layout-movil" as const, ...f }));
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
        // Contenido oculto para AT (clip/clip-path) o aria-hidden no es un objetivo real.
        if (el.closest('[aria-hidden="true"]')) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (style.clipPath !== "none" || style.clip !== "auto") return false;
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
  const clicked = await clickByText(page, "a", "Nueva cita");
  if (!clicked) return { pasos: -1, detalle: "no se encontró el acceso 'Nueva cita' en el inicio" };
  if (!(await waitForPath(page, "/admin/agenda", 30000))) {
    return { pasos: -1, detalle: "clic en 'Nueva cita' no navegó a /admin/agenda" };
  }
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
  const clicked = await clickByText(page, "a", /^Cobrar/);
  if (!clicked) return { pasos: -1, detalle: "no se encontró el acceso 'Cobrar' en el inicio" };
  if (!(await waitForPath(page, "/admin/pos", 30000))) {
    return { pasos: -1, detalle: "clic en 'Cobrar' no navegó a /admin/pos" };
  }
  return { pasos: 1, detalle: "inicio → Cobrar → POS" };
}

async function main() {
  const flags = checkFlags();
  const pages = flags.only.length
    ? PAGES.filter((p) => flags.only.some((o) => p.includes(o)))
    : PAGES;
  const viewports = pickViewports(flags.viewports);
  if (viewports.length === 0) {
    throw new Error(`--viewport sin coincidencias: ${flags.viewports.join(", ")} (desktop | movil)`);
  }

  const findings: Finding[] = [];
  const rutas: Array<{ nombre: string; pasos: number; detalle: string }> = [];
  let tactil: { toque: boolean; feedback: boolean; destino: boolean } | null = null;

  await withBrowser(async (browser) => {
    for (const viewport of viewports) {
      const page = await loggedPage(browser, viewport);
      console.log(`\n=== ${viewport.nombre} ${viewport.width}x${viewport.height} ===`);

      for (const ruta of pages) {
        await page.goto(`${BASE_URL}${ruta}`, { waitUntil: "networkidle0", timeout: 60000 });
        const hallazgos = [
          ...(await axeScan(page, ruta, viewport.nombre)),
          ...(await accionPrimariaCheck(page, ruta, viewport.nombre)),
          ...(await objetivoTactilCheck(page, ruta, viewport.nombre)),
          ...(viewport.isMobile ? await layoutMovilCheck(page, ruta, viewport.nombre) : []),
        ];
        findings.push(...hallazgos);
        const errores = hallazgos.filter((h) => h.severidad === "error").length;
        console.log(`${ruta.padEnd(18)} ${hallazgos.length === 0 ? "OK" : `${errores} error(es), ${hallazgos.length - errores} aviso(s)`}`);
      }
      await page.close();
    }

    const desktop = viewports.find((v) => v.nombre === "desktop");
    const movil = viewports.find((v) => v.nombre === "movil");

    if (desktop) {
      // Rutas por clics en escritorio.
      const page = await loggedPage(browser, desktop);
      console.log("\n=== Rutas por clics (desktop) ===");
      for (const [nombre, ruta] of [
        ["nueva-cita", rutaNuevaCita],
        ["cobrar", rutaCobrarDesdeInicio],
      ] as const) {
        const resultado = await ruta(page);
        rutas.push({ nombre, ...resultado });
        console.log(`pasos=${resultado.pasos} · ${resultado.detalle}`);
        if (resultado.pasos < 0) {
          findings.push({
            pagina: `ruta:${nombre}`,
            viewport: "desktop",
            tipo: "accion-primaria",
            severidad: "error",
            detalle: resultado.detalle,
          });
        }
      }
      await page.close();
    }

    if (movil) {
      // Caso crítico reportado en móvil: Agenda → Mi día debe responder al
      // primer toque con una señal visible y completar sin segunda activación.
      const mobilePage = await loggedPage(browser, movil);
      console.log("\n=== Recorrido táctil (móvil) ===");
      await mobilePage.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0", timeout: 60000 });
      const tapOk = await clickByHref(mobilePage, "/admin/mi-dia");
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
      tactil = { toque: tapOk, feedback: feedbackOk, destino: completedOk };
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
    }
  });

  const errores = printFindings(findings);
  if (flags.json) {
    writeArtifact("usability", {
      generado: new Date().toISOString(),
      paginas: pages,
      viewports: viewports.map((v) => v.nombre),
      findings,
      rutas,
      tactil,
      errores,
    });
  }
  process.exit(errores > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
