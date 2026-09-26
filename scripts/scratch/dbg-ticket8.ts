import "dotenv/config";
import puppeteer from "puppeteer";
import { BASE_URL, E2E_EMAIL, login } from "./lib/e2e";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const b = await puppeteer.launch({ headless: true });
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(60_000);
  await p.setViewport({ width: 1440, height: 900 });
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
  // espera paciente
  const tOpen = Date.now();
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    const ok = await p.evaluate(() => document.body.innerText.includes("Agregar al ticket"));
    if (ok) break;
  }
  console.log(`sheet cargó en ${((Date.now() - tOpen) / 1000).toFixed(0)}s`);
  // agregar servicio nuevo
  const clickRes = await p.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Agregar Manicure gel al ticket"]');
    if (!btn) return "missing"; if (btn.disabled) return "disabled"; btn.click(); return "clicked";
  });
  console.log("click Manicure:", clickRes);
  const t0 = Date.now();
  for (let i = 0; i < 45; i++) {
    await sleep(3000);
    const st = await p.evaluate(() => ({
      mani: Boolean(document.querySelector('[aria-label="Cantidad de Manicure gel"]')),
      facialQty: document.querySelector('[aria-label="Cantidad de Facial hidratante"] [aria-live]')?.textContent ?? null,
      loading: Boolean(document.querySelector('[role="dialog"] [role="status"]')),
    }));
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`+${el}s`, JSON.stringify(st));
    if (st.mani) { console.log(`>>> Manicure apareció a los ${el}s`); break; }
  }
  await p.screenshot({ path: ".smoke-shots/dbg-ticket8.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
