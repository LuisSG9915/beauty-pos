import type { Page } from "puppeteer";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Needle = string | RegExp;

function needleParts(needle: Needle) {
  return needle instanceof RegExp
    ? { text: "", src: needle.source, flags: needle.flags }
    : { text: needle, src: "", flags: "" };
}

/**
 * Click al elemento de `selector` cuyo texto coincide con `needle`.
 * String: primero match exacto del texto recortado, luego "contiene"
 * (insensible a mayúsculas). RegExp: test sobre el textContent.
 * `opts.scope` limita la búsqueda a un subárbol. Devuelve si hubo click.
 */
export async function clickByText(
  page: Page,
  selector: string,
  needle: Needle,
  opts: { scope?: string } = {},
): Promise<boolean> {
  const { text, src, flags } = needleParts(needle);
  return page.evaluate(
    (sel, t, re, fl, scope) => {
      const root = scope ? document.querySelector(scope) : document;
      if (!root) return false;
      const els = [...root.querySelectorAll<HTMLElement>(sel)];
      const target =
        els.find((e) => {
          const s = e.textContent ?? "";
          return re ? new RegExp(re, fl).test(s) : s.trim() === t;
        }) ??
        (!re
          ? els.find((e) => (e.textContent ?? "").toLowerCase().includes(t.toLowerCase()))
          : undefined);
      target?.click();
      return Boolean(target);
    },
    selector,
    text,
    src,
    flags,
    opts.scope ?? null,
  );
}

/** Click al primer enlace visible cuyo pathname coincide con `path`. */
export async function clickByHref(page: Page, path: string, scope = "a[href]"): Promise<boolean> {
  return page.evaluate(
    (p, sel) => {
      const el = [...document.querySelectorAll<HTMLAnchorElement>(sel)].find(
        (a) => new URL(a.href).pathname === p && a.getBoundingClientRect().width > 0,
      );
      el?.click();
      return Boolean(el);
    },
    path,
    scope,
  );
}

/**
 * Espera (sin lanzar) a que el texto de `selector` coincida con `needle`.
 * String = contiene; RegExp = test. Devuelve false si vence el timeout.
 */
export async function waitForText(
  page: Page,
  needle: Needle,
  opts: { selector?: string; timeout?: number } = {},
): Promise<boolean> {
  const { selector = "body", timeout = 15000 } = opts;
  const { text, src, flags } = needleParts(needle);
  return page
    .waitForFunction(
      (sel, t, re, fl) => {
        const s = document.querySelector(sel)?.textContent ?? "";
        return re ? new RegExp(re, fl).test(s) : s.includes(t);
      },
      { timeout, polling: 100 },
      selector,
      text,
      src,
      flags,
    )
    .then(() => true)
    .catch(() => false);
}

/** Espera (sin lanzar) a que location.pathname === path. */
export async function waitForPath(page: Page, path: string, timeout = 15000): Promise<boolean> {
  return page
    .waitForFunction((p) => location.pathname === p, { timeout, polling: 100 }, path)
    .then(() => true)
    .catch(() => false);
}
