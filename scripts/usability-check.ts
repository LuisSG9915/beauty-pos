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
import { createHash } from "node:crypto";
import type { Page } from "puppeteer";

import { loggedPage, pickViewports, withBrowser } from "./lib/browser";
import { checkFlags } from "./lib/cli";
import { withDb } from "./lib/db";
import { clickByHref, clickByText, waitForPath } from "./lib/dom";
import { BASE_URL } from "./lib/e2e";
import { printFindings, writeArtifact, type Finding } from "./lib/report";

// Portal público de reservas de la organización E2E (sucursal principal con
// reservas_online=true). Override: PERF_RESERVA_SLUG=<slug>.
const E2E_RESERVA_SLUG = process.env.PERF_RESERVA_SLUG ?? "estetica-prueba-e2e";

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
  `/reservar/${E2E_RESERVA_SLUG}`,
];

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

const NOTA_PRUEBA = "Cita de prueba del arnés de usabilidad (e2e-usability)";

/**
 * Rutas dinámicas del arnés: el expediente de un cliente y el portal
 * "Mi cita" necesitan un id/token reales. Se resuelven contra la BD E2E; si
 * algo falla o no hay datos, se omiten y el arnés sigue con las estáticas.
 *
 * El token de mi-cita es determinístico (sha256 de un prefijo + citaId, igual
 * que `hashTokenGestion`). La org E2E no tiene citas futuras gestionables, así
 * que el arnés asegura UNA cita de prueba identificable por su nota: la
 * reutiliza si ya existe con nuestro token y solo crea una nueva cuando hace
 * falta. Nunca pisa el token de una cita real.
 *
 * Devuelve también `limpiar()` para borrar al terminar todas las citas de
 * prueba (incluidas huérfanas de corridas anteriores) y dejar la agenda E2E
 * como estaba.
 */
async function rutasDinamicas(): Promise<{ rutas: string[]; limpiar: () => Promise<void> }> {
  const limpiar = async () => {
    try {
      await withDb(async (client) => {
        await client.query(
          `delete from reservas_gestion_tokens t
            using citas c
           where t.cita_id = c.id and c.notas = $1`,
          [NOTA_PRUEBA],
        );
        await client.query(`delete from citas where notas = $1`, [NOTA_PRUEBA]);
      });
    } catch (error) {
      console.warn(`Limpieza de la cita de prueba omitida: ${(error as Error).message}`);
    }
  };

  try {
    const rutas = await withDb(async (client) => {
      const rutas: string[] = [];

      const org = (
        await client.query(`select id from organizaciones where slug = $1`, [E2E_RESERVA_SLUG])
      ).rows[0];
      if (!org) return rutas;

      const cliente = (
        await client.query(
          `select c.id
             from clientes c
            where c.organizacion_id = $1 and c.activo
            order by c.created_at asc
            limit 1`,
          [org.id],
        )
      ).rows[0];
      if (cliente) rutas.push(`/admin/clientes/${cliente.id}`);

      // Igual que `hashTokenGestion`: en BD vive sha256(token claro); el token
      // claro (64 hex, cumple el regex del portal) es determinístico por cita.
      const tokenClaroDe = (citaId: string) =>
        createHash("sha256").update(`e2e-usability:${citaId}`).digest("hex");
      const hashDe = (tokenClaro: string) =>
        createHash("sha256").update(tokenClaro).digest("hex");

      // 1) ¿Ya existe la cita de prueba de una corrida anterior? Se reutiliza
      // si su token está intacto; si quedó con un hash viejo del propio arnés,
      // se corrige (nunca se toca el token de una cita real).
      const previas = (
        await client.query(
          `select ci.id, t.token_hash as "tokenHash"
             from citas ci
             join reservas_gestion_tokens t on t.cita_id = ci.id
            where ci.organizacion_id = $1 and ci.activo and ci.estado in ('pendiente', 'confirmada')
              and ci.fecha_hora >= now() and ci.notas = $2 and t.revocado_at is null
            order by ci.fecha_hora asc
            limit 20`,
          [org.id, NOTA_PRUEBA],
        )
      ).rows;
      const previa = previas.find((cita) => cita.tokenHash === hashDe(tokenClaroDe(cita.id)));
      if (previa) {
        rutas.push(`/mi-cita/${tokenClaroDe(previa.id)}`);
        return rutas;
      }
      const desactualizada = previas.find((cita) => cita.tokenHash === tokenClaroDe(cita.id));
      if (desactualizada) {
        await client.query(
          `update reservas_gestion_tokens set token_hash = $2 where cita_id = $1`,
          [desactualizada.id, hashDe(tokenClaroDe(desactualizada.id))],
        );
        rutas.push(`/mi-cita/${tokenClaroDe(desactualizada.id)}`);
        return rutas;
      }

      // 2) Crear la cita de prueba (mínima, futura y gestionable) con su token.
      const sucursal = (
        await client.query(
          `select id from sucursales
            where organizacion_id = $1 and activo
            order by nombre
            limit 1`,
          [org.id],
        )
      ).rows[0];
      if (!sucursal) return rutas;

      const nueva = (
        await client.query(
          `insert into citas (organizacion_id, sucursal_id, fecha_hora, duracion_minutos, estado, origen, notas)
           values ($1, $2, now() + interval '3 days', 30, 'pendiente', 'panel', $3)
           returning id`,
          [org.id, sucursal.id, NOTA_PRUEBA],
        )
      ).rows[0];
      if (!nueva) return rutas;

      await client.query(
        `insert into reservas_gestion_tokens (organizacion_id, cita_id, token_hash)
         values ($1, $2, $3)
         on conflict (cita_id) do nothing`,
        [org.id, nueva.id, hashDe(tokenClaroDe(nueva.id))],
      );
      rutas.push(`/mi-cita/${tokenClaroDe(nueva.id)}`);
      return rutas;
    });
    return { rutas, limpiar };
  } catch (error) {
    console.warn(`Rutas dinámicas omitidas: ${(error as Error).message}`);
    return { rutas: [], limpiar };
  }
}

const FOLIO_PRUEBA_COMPRA = "E2E-USABILITY";

/**
 * Compra temporal del arnés: `/admin/compras/[id]` necesita una compra real
 * con líneas (la BD E2E no tiene ninguna). Se crea una en borrador con 1
 * renglón identificable por folio y `limpiarComprasDePrueba()` la borra al
 * terminar la corrida.
 */
async function crearCompraDePrueba(): Promise<string[]> {
  try {
    return await withDb(async (client) => {
      const org = (
        await client.query(`select id from organizaciones where slug = $1`, [E2E_RESERVA_SLUG])
      ).rows[0];
      if (!org) return [];

      // Reutiliza la de una corrida anterior que murió sin limpiar.
      const previa = (
        await client.query(
          `select id from compras where organizacion_id = $1 and folio = $2 and activo = true limit 1`,
          [org.id, FOLIO_PRUEBA_COMPRA],
        )
      ).rows[0];
      if (previa) return [`/admin/compras/${previa.id}`];

      const sucursal = (
        await client.query(
          `select id from sucursales where organizacion_id = $1 and activo order by nombre limit 1`,
          [org.id],
        )
      ).rows[0];
      if (!sucursal) return [];

      const compra = (
        await client.query(
          `insert into compras (organizacion_id, sucursal_id, estado, folio, proveedor_texto, total_calculado, activo)
           values ($1, $2, 'borrador', $3, 'Proveedor de prueba', 120.00, true)
           returning id`,
          [org.id, sucursal.id, FOLIO_PRUEBA_COMPRA],
        )
      ).rows[0];
      if (!compra) return [];

      await client.query(
        `insert into detalle_compras (compra_id, organizacion_id, descripcion, cantidad, costo_unitario, importe)
         values ($1, $2, 'Shampoo de prueba (arnés)', 2, 60.00, 120.00)`,
        [compra.id, org.id],
      );
      return [`/admin/compras/${compra.id}`];
    });
  } catch (error) {
    console.warn(`Compra de prueba omitida: ${(error as Error).message}`);
    return [];
  }
}

/** Borra las compras del arnés (y sus líneas) al terminar la corrida. */
async function limpiarComprasDePrueba(): Promise<void> {
  try {
    await withDb(async (client) => {
      await client.query(
        `delete from detalle_compras d
          using compras c
         where d.compra_id = c.id and c.folio = $1`,
        [FOLIO_PRUEBA_COMPRA],
      );
      await client.query(`delete from compras where folio = $1`, [FOLIO_PRUEBA_COMPRA]);
    });
  } catch (error) {
    console.warn(`Limpieza de la compra de prueba omitida: ${(error as Error).message}`);
  }
}

async function axeScan(page: Page, pagina: string, viewport: string): Promise<Finding[]> {
  // `networkidle0` no garantiza que el frame esté listo para inyectar axe tras
  // muchas navegaciones (flake "Page/Frame is not ready"): se reintenta con
  // una espera corta antes de propagar el error.
  let results: Awaited<ReturnType<AxePuppeteer["analyze"]>> | null = null;
  for (let intento = 0; intento < 3; intento++) {
    try {
      results = await new AxePuppeteer(page).withTags(AXE_TAGS).analyze();
      break;
    } catch (error) {
      if (intento === 2) throw error;
      await page
        .waitForFunction(() => document.readyState === "complete", { timeout: 5000 })
        .catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  if (!results) return [];
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
  const { rutas: dinamicas, limpiar } = await rutasDinamicas();
  const comprasDePrueba = await crearCompraDePrueba();
  const todas = [...PAGES, ...dinamicas, ...comprasDePrueba];
  const pages = flags.only.length
    ? todas.filter((p) => flags.only.some((o) => p.includes(o)))
    : todas;
  const viewports = pickViewports(flags.viewports);
  if (viewports.length === 0) {
    throw new Error(`--viewport sin coincidencias: ${flags.viewports.join(", ")} (desktop | movil)`);
  }

  const findings: Finding[] = [];
  const rutas: Array<{ nombre: string; pasos: number; detalle: string }> = [];
  let tactil: { toque: boolean; feedback: boolean; destino: boolean } | null = null;
  let errores = 0;

  try {
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

  } finally {
    await limpiar();
    await limpiarComprasDePrueba();
  }

  errores = printFindings(findings);
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
