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
    if (req.method() === "POST" && res.url().includes("/admin/agenda")) {
      console.log(`POST action ${res.status()} url=${res.url().slice(-40)}`);
    }
  });
  p.on("console", (m) => { if (m.type() === "error") console.log("console-err:", m.text().slice(0, 200)); });
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
  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    const st = await p.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return { dlg: false };
      return {
        dlg: true,
        loading: Boolean(dlg.querySelector('[role="status"]')),
        agregar: dlg.textContent?.includes("Agregar al ticket"),
        error: dlg.textContent?.includes("No se pudo") || dlg.textContent?.includes("No se encontró"),
        txt: dlg.textContent?.replace(/\s+/g, " ").slice(0, 180),
      };
    });
    console.log(`+${(i + 1) * 3}s`, JSON.stringify(st));
    if (st.agregar || st.error) break;
  }
  await p.screenshot({ path: ".smoke-shots/dbg-ticket4.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
