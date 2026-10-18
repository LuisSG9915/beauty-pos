import puppeteer, { type Browser, type Page } from "puppeteer";

import { VIEWPORT_BREAKPOINT_PX, VIEWPORT_COOKIE_NAME } from "@/lib/viewport-preference";

import { BASE_URL, E2E_EMAIL, login } from "./e2e";

export type ViewportDef = {
  nombre: string;
  width: number;
  height: number;
  isMobile?: boolean;
  hasTouch?: boolean;
};

/** Contextos reales del salón: escritorio de mostrador y teléfono modesto. */
export const VIEWPORTS: ViewportDef[] = [
  { nombre: "desktop", width: 1366, height: 900 },
  { nombre: "movil", width: 390, height: 844, isMobile: true, hasTouch: true },
];

/** Filtra VIEWPORTS por nombre (--viewport=movil). Lista vacía = todos. */
export function pickViewports(names: string[]): ViewportDef[] {
  if (names.length === 0) return VIEWPORTS;
  return VIEWPORTS.filter((v) => names.includes(v.nombre));
}

/** Lanza Chromium headless, ejecuta `fn` y cierra siempre el browser. */
export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/** Página nueva con viewport aplicado y sesión E2E ya inyectada. */
export async function loggedPage(
  browser: Browser,
  viewport: ViewportDef,
  email = E2E_EMAIL,
): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  // Fija la cookie de layout al ancho del contexto ANTES de navegar: ejercita
  // el camino optimizado (el servidor emite solo el layout visible) sin el
  // reload de corrección del bootstrap, y valida que cada viewport reciba el
  // layout correcto.
  await page.setCookie({
    name: VIEWPORT_COOKIE_NAME,
    value: viewport.width >= VIEWPORT_BREAKPOINT_PX ? "escritorio" : "movil",
    url: BASE_URL,
  });
  await login(page, email);
  return page;
}
