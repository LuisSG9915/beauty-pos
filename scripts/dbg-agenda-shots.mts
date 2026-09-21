import puppeteer from "puppeteer";
import { BASE_URL, login } from "./lib/e2e";

const shots: [string, string, number, number][] = [
  ["agenda-dia-1440", "/admin/agenda", 1440, 900],
  ["agenda-dia-1366", "/admin/agenda", 1366, 900],
  ["agenda-semana-1440", "/admin/agenda?vista=semana", 1440, 900],
  ["agenda-lista-1440", "/admin/agenda?vista=lista", 1440, 900],
  ["agenda-dia-390", "/admin/agenda", 390, 844],
  ["agenda-dia-768", "/admin/agenda", 768, 1024],
];

const b = await puppeteer.launch({ headless: true });
const p = await b.newPage();
await login(p);
for (const [name, path, w, h] of shots) {
  await p.setViewport({ width: w, height: h });
  await p.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1000));
  await p.screenshot({ path: `/tmp/melena-${name}.png` });
  console.log("ok", name);
}
// Sheet de configuracion
await p.setViewport({ width: 1440, height: 900 });
await p.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
const btn = await p.$('button:has(span), button');
const triggers = await p.$$("button");
for (const t of triggers) {
  const txt = await t.evaluate((el) => el.textContent ?? "");
  if (txt.includes("Configurar agenda")) {
    await t.click();
    break;
  }
}
await new Promise((r) => setTimeout(r, 900));
await p.screenshot({ path: "/tmp/melena-agenda-config.png" });
console.log("ok config");
await b.close();
