import { AxePuppeteer } from "@axe-core/puppeteer";
import puppeteer from "puppeteer";
import { BASE_URL, E2E_EMAIL, login } from "./lib/e2e";

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await login(page, E2E_EMAIL);
  for (const ruta of ["/admin", "/admin/agenda", "/admin/mi-dia", "/admin/pos", "/admin/caja", "/admin/clientes"]) {
    await page.goto(`${BASE_URL}${ruta}`, { waitUntil: "networkidle0", timeout: 60000 });
    const results = await new AxePuppeteer(page).withTags(["wcag2aa"]).analyze();
    const cc = results.violations.find((v) => v.id === "color-contrast");
    console.log(`\n=== ${ruta} ===`);
    for (const node of cc?.nodes ?? []) {
      const detail = node.failureSummary?.split("\n").find((l) => l.includes("contrast ratio")) ?? "";
      console.log("  ", JSON.stringify(node.target), "|", detail);
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
