import "dotenv/config";
import puppeteer from "puppeteer";
import { BASE_URL, E2E_EMAIL, login } from "../lib/e2e";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const b = await puppeteer.launch({ headless: true });
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(60_000);
  await p.setViewport({ width: 1440, height: 900 });
  p.on("console", (m) => { if (m.type() === "error") console.log("console-err:", m.text().slice(0, 300)); });
  await login(p, E2E_EMAIL);
  await p.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
  const clicked = await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll<HTMLElement>("button[aria-label]")).find((b2) =>
      (b2.getAttribute("aria-label") ?? "").toLowerCase().includes("en proceso"));
    if (!btn) return null;
    const l = btn.getAttribute("aria-label"); btn.click(); return l;
  });
  console.log("card:", clicked);
  await p.waitForSelector('button[aria-label="Cerrar panel"]', { visible: true, timeout: 15000 });
  await sleep(800);
  const accion = await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll<HTMLElement>("button")).find((el) => el.textContent?.trim() === "Cobrar" || el.textContent?.trim() === "Ver venta");
    if (t) { const label = t.textContent?.trim(); t.click(); return label; }
    return null;
  });
  console.log("accion:", accion);
  await p.waitForSelector('[role="dialog"]', { visible: true, timeout: 15000 });
  // observar el contenido del sheet hasta 40s
  for (let i = 0; i < 10; i++) {
    await sleep(4000);
    const st = await p.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return {
        loading: Boolean(dlg?.querySelector('[role="status"]')),
        errorTxt: dlg?.textContent?.includes("No se pudo") ?? null,
        agregar: dlg?.textContent?.includes("Agregar al ticket") ?? null,
        shampoo: Boolean(document.querySelector('[aria-label="Cantidad de SHAMPOO REPARADOR"]')),
        txt: dlg?.textContent?.slice(0, 200),
      };
    });
    console.log(`t+${(i + 1) * 4}s`, JSON.stringify(st));
    if (st.agregar) break;
  }
  await p.screenshot({ path: ".smoke-shots/dbg-ticket.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
