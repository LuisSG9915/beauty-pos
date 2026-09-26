import "dotenv/config";
import puppeteer from "puppeteer";
import { BASE_URL, E2E_EMAIL, login } from "../lib/e2e";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const b = await puppeteer.launch({ headless: true });
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(60_000);
  await p.setViewport({ width: 1440, height: 900 });
  // Capturar respuestas de server actions (POST a la misma ruta)
  p.on("response", async (res) => {
    const req = res.request();
    if (req.method() === "POST" && res.url().includes("/admin/agenda")) {
      const txt = await res.text().catch(() => "");
      const hasShampoo = txt.includes("SHAMPOO");
      console.log(`POST action ${res.status()} len=${txt.length} shampoo=${hasShampoo}`);
    }
  });
  await login(p, E2E_EMAIL);
  await p.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
  const card = await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll<HTMLElement>("button[aria-label]")).find((b2) =>
      (b2.getAttribute("aria-label") ?? "").toLowerCase().includes("en proceso"));
    if (!btn) return null;
    const l = btn.getAttribute("aria-label"); btn.click(); return l;
  });
  console.log("card:", card);
  await p.waitForSelector('button[aria-label="Cerrar panel"]', { visible: true, timeout: 15000 });
  await sleep(800);
  await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll<HTMLElement>("button")).find((el) => el.textContent?.trim() === "Ver venta");
    t?.click();
  });
  await p.waitForFunction(() => document.body.innerText.includes("Agregar al ticket"), { timeout: 20000, polling: 100 });
  console.log("sheet listo — shampoo qty actual:", await p.evaluate(() => document.querySelector('[aria-label="Cantidad de SHAMPOO REPARADOR"] [aria-live]')?.textContent));
  // click en un servicio nuevo (Facial) para forzar otra mutación + refetch
  await p.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Agregar Facial hidratante al ticket"]')?.click();
  });
  console.log("click Facial enviado");
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    const st = await p.evaluate(() => ({
      facial: Boolean(document.querySelector('[aria-label="Cantidad de Facial hidratante"]')),
      shampooQty: document.querySelector('[aria-label="Cantidad de SHAMPOO REPARADOR"] [aria-live]')?.textContent ?? null,
      toasts: Array.from(document.querySelectorAll<HTMLElement>("[data-sonner-toast]")).map((t) => t.textContent?.trim()).slice(0, 3),
      catalogoVisible: Boolean(document.querySelector('button[aria-label^="Agregar"]')),
    }));
    console.log(`+${(i + 1) * 2.5}s`, JSON.stringify(st));
    if (st.facial) break;
  }
  await p.screenshot({ path: ".smoke-shots/dbg-ticket3.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
