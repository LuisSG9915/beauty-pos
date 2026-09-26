import puppeteer, { type Browser, type Page } from "puppeteer";

import { E2E_EMAIL, login } from "./e2e";

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
  await login(page, email);
  return page;
}
