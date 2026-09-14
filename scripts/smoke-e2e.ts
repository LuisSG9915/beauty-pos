import "dotenv/config";

import puppeteer from "puppeteer";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL;
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const OUT_DIR = ".smoke-shots";

if (!EMAIL || !PASSWORD) {
  console.error("Faltan BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD en .env");
  process.exit(1);
}
const email = EMAIL as string;
const password = PASSWORD as string;

const pages = [
  { name: "admin", path: "/admin" },
  { name: "agenda-dia", path: "/admin/agenda" },
  { name: "agenda-semana", path: "/admin/agenda?vista=semana" },
  { name: "agenda-lista", path: "/admin/agenda?vista=lista" },
  { name: "pos", path: "/admin/pos" },
  { name: "inventario", path: "/admin/inventario" },
  { name: "clientes", path: "/admin/clientes" },
  { name: "servicios", path: "/admin/servicios" },
];

async function main() {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err: unknown) =>
    consoleErrors.push(`pageerror: ${err instanceof Error ? err.message : String(err)}`),
  );

  // Login
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log(`Tras login: ${page.url()}`);
  await page.screenshot({ path: `${OUT_DIR}/00-after-login.png`, fullPage: true });

  for (const target of pages) {
    try {
      const response = await page.goto(`${BASE_URL}${target.path}`, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      const status = response?.status() ?? "?";
      const title = await page.title();
      await page.screenshot({ path: `${OUT_DIR}/${target.name}.png`, fullPage: true });
      console.log(`${status} ${target.path} — "${title}"`);
    } catch (error) {
      console.log(`FALLO ${target.path} — ${error instanceof Error ? error.message : error}`);
    }
  }

  // Vista móvil de agenda
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
  await page.screenshot({ path: `${OUT_DIR}/agenda-mobile.png`, fullPage: true });
  console.log("mobile agenda capturada");

  if (consoleErrors.length > 0) {
    console.log("\n--- Errores de consola ---");
    for (const err of consoleErrors) console.log(`  ${err}`);
  } else {
    console.log("\nSin errores de consola.");
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
