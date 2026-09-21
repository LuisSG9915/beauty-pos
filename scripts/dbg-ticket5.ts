import "dotenv/config";
import puppeteer from "puppeteer";
import { BASE_URL, E2E_EMAIL, login } from "./lib/e2e";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const b = await puppeteer.launch({ headless: true });
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(60_000);
  await p.setViewport({ width: 1440, height: 900 });
  p.on("response", async (res) => {
    const req = res.request();
    if (req.method() === "POST") console.log(`POST ${res.status()} ${res.url().slice(-60)}`);
  });
  await login(p, E2E_EMAIL);
  await p.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
  await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll<HTMLElement>("button[aria-label]")).find((b2) =>
      (b2.getAttribute("aria-label") ?? "").toLowerCase().includes("en proceso"));
    btn?.click();
  });
  await p.waitForSelector('button[aria-label="Cerrar panel"]', { visible: true, timeout: 15000 });
  await sleep(800);
  await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll<HTMLElement>("button")).find((el) => el.textContent?.trim() === "Ver venta");
    t?.click();
  });
  // espera paciente del sheet con diagnóstico cada 5s
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const st = await p.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return dlg ? {
        loading: Boolean(dlg.querySelector('[role="status"]')),
        agregar: dlg.textContent?.includes("Agregar al ticket"),
        error: /No se pudo|No se encontró/.test(dlg.textContent ?? ""),
      } : { dlg: false };
    });
    console.log(`sheet +${(i + 1) * 5}s`, JSON.stringify(st));
    if (st.agregar) break;
  }
  // click en servicio nuevo (no presente en ticket)
  await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll<HTMLElement>('[role="group"][aria-label="Tipo de catálogo"] button')).find((el) => el.textContent?.trim() === "Servicios");
    t?.click();
  });
  await sleep(400);
  const t0 = Date.now();
  const clicked = await p.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Agregar Facial hidratante al ticket"]');
    if (!btn) return "missing";
    if (btn.disabled) return "disabled";
    btn.click(); return "clicked";
  });
  console.log("click Facial:", clicked);
  for (let i = 0; i < 24; i++) {
    await sleep(2500);
    const st = await p.evaluate(() => ({
      facial: Boolean(document.querySelector('[aria-label="Cantidad de Facial hidratante"]')),
      loading: Boolean(document.querySelector('[role="dialog"] [role="status"]')),
      toasts: Array.from(document.querySelectorAll<HTMLElement>("[data-sonner-toast]")).map((t) => t.textContent?.trim()).slice(0, 3),
    }));
    console.log(`+${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(st));
    if (st.facial) { console.log(">>> linea apareció"); break; }
  }
  await p.screenshot({ path: ".smoke-shots/dbg-ticket5.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
