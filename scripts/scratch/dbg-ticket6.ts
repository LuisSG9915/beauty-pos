import "dotenv/config";
import puppeteer from "puppeteer";
import { BASE_URL, E2E_EMAIL, login } from "./lib/e2e";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const b = await puppeteer.launch({ headless: true });
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(60_000);
  await p.setViewport({ width: 1440, height: 900 });
  let postN = 0;
  p.on("response", async (res) => {
    const req = res.request();
    if (req.method() === "POST" && res.url().includes("/admin/agenda")) {
      postN++;
      const body = await res.text().catch(() => "<err>");
      const hasFacial = body.includes("Facial");
      const hasShampoo = body.includes("SHAMPOO");
      // cantidad del shampoo en el payload
      const qtyMatch = body.match(/SHAMPOO[^"]*"[^}]*?"cantidad":(\d+)/) ?? body.match(/"cantidad":(\d+)[^}]*SHAMPOO/);
      console.log(`POST#${postN} ${res.status()} len=${body.length} facial=${hasFacial} shampoo=${hasShampoo} qtyMatch=${qtyMatch?.[1]}`);
    }
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
  await p.waitForFunction(() => document.body.innerText.includes("Agregar al ticket"), { timeout: 45000, polling: 100 });
  console.log("sheet listo, shampoo qty visible:", await p.evaluate(() => document.querySelector('[aria-label="Cantidad de SHAMPOO REPARADOR"] [aria-live]')?.textContent));
  // agregar Manicure (servicio no presente)
  await p.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Agregar Manicure gel al ticket"]')?.click();
  });
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const st = await p.evaluate(() => ({
      mani: Boolean(document.querySelector('[aria-label="Cantidad de Manicure gel"]')),
      facial: document.querySelector('[aria-label="Cantidad de Facial hidratante"] [aria-live]')?.textContent ?? null,
      loading: Boolean(document.querySelector('[role="dialog"] [role="status"]')),
    }));
    console.log(`+${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(st));
    if (st.mani) { console.log(">>> Manicure apareció"); break; }
  }
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
