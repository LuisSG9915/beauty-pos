import "dotenv/config";
import puppeteer from "puppeteer";
import pg from "pg";
import { BASE_URL, E2E_EMAIL, login } from "./lib/e2e";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ORG = "652c172c-bf32-4b9c-90d1-006eded7ff56";

async function main() {
  // crea una cita fresca E2E por SQL para aislar el escenario
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const suc = (await c.query("SELECT id FROM sucursales WHERE organizacion_id=$1 AND activo ORDER BY nombre LIMIT 1", [ORG])).rows[0].id;
  const srv = (await c.query("SELECT id, precio_base::text FROM servicios WHERE organizacion_id=$1 AND nombre='CORTE DE DAMA'", [ORG])).rows[0];
  const cita = (await c.query(
    `INSERT INTO citas (organizacion_id, sucursal_id, fecha_hora, duracion_minutos, estado, origen, notas, total_estimado)
     VALUES ($1,$2, (now() AT TIME ZONE 'America/Monterrey')::date + interval '2 days' + interval '9 hours', 60, 'confirmada', 'panel', 'E2E-DBG-ADDLINE', $3)
     RETURNING id`, [ORG, suc, srv.precio_base])).rows[0].id;
  console.log("cita dbg:", cita);
  await c.end();

  const b = await puppeteer.launch({ headless: true });
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(60_000);
  await p.setViewport({ width: 1440, height: 900 });
  p.on("console", (m) => { if (m.type() === "error") console.log("console-err:", m.text().slice(0, 200)); });
  p.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
  await login(p, E2E_EMAIL);
  const fecha = new Date(Date.now() + 2 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
  await p.goto(`${BASE_URL}/admin/agenda?fecha=${fecha}`, { waitUntil: "networkidle0" });
  await sleep(1000);
  const card = await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll<HTMLElement>("button[aria-label]")).find((b2) =>
      (b2.getAttribute("aria-label") ?? "").toLowerCase().includes("walk-in"));
    if (!btn) return null;
    const l = btn.getAttribute("aria-label"); btn.click(); return l;
  });
  console.log("card:", card);
  await p.waitForSelector('button[aria-label="Cerrar panel"]', { visible: true, timeout: 15000 });
  await sleep(800);
  await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll<HTMLElement>("button")).find((el) => el.textContent?.trim() === "Cobrar" || el.textContent?.trim() === "Ver venta");
    t?.click();
  });
  await p.waitForFunction(() => document.body.innerText.includes("Agregar al ticket"), { timeout: 20000, polling: 100 });
  console.log("sheet listo");
  await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll<HTMLElement>('[role="group"][aria-label="Tipo de catálogo"] button')).find((el) => el.textContent?.trim() === "Productos");
    t?.click();
  });
  await sleep(500);
  const t0 = Date.now();
  await p.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Agregar SHAMPOO REPARADOR al ticket"]')?.click();
  });
  console.log("click enviado");
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const st = await p.evaluate(() => ({
      linea: Boolean(document.querySelector('[aria-label="Cantidad de SHAMPOO REPARADOR"]')),
      toasts: Array.from(document.querySelectorAll<HTMLElement>("[data-sonner-toast], [role='status']")).map((t) => t.textContent?.trim()).filter(Boolean).slice(0, 4),
      disabled: (document.querySelector('button[aria-label="Agregar SHAMPOO REPARADOR al ticket"]') as HTMLButtonElement)?.disabled ?? "gone",
    }));
    console.log(`+${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(st));
    if (st.linea) break;
  }
  await p.screenshot({ path: ".smoke-shots/dbg-ticket2.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
