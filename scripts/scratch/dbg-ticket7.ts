import "dotenv/config";
import puppeteer from "puppeteer";
import { BASE_URL, E2E_EMAIL, login } from "../lib/e2e";

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
      console.log(`POST#${postN} ${res.status()} len=${body.length} body=${body.slice(0, 300)}`);
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
  for (let i = 0; i < 15; i++) {
    await sleep(4000);
    const st = await p.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return dlg ? {
        agregar: dlg.textContent?.includes("Agregar al ticket"),
        txt: dlg.textContent?.replace(/\s+/g, " ").slice(0, 220),
      } : { dlg: false };
    });
    console.log(`+${(i + 1) * 4}s`, JSON.stringify(st));
    if (st.agregar) break;
  }
  await p.screenshot({ path: ".smoke-shots/dbg-ticket7.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
