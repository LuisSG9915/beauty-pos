import puppeteer from "puppeteer";
import { BASE_URL, login } from "./lib/e2e";
const shots: [string, string, number, number][] = [
  ["admin-dashboard", "/admin", 1440, 900],
  ["admin-clientes", "/admin/clientes", 1440, 900],
  ["admin-clientes-mobile", "/admin/clientes", 390, 844],
  ["admin-agenda", "/admin/agenda", 1440, 900],
];
const b = await puppeteer.launch({ headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await login(p);
for (const [name, path, w, h] of shots) {
  await p.setViewport({ width: w, height: h });
  await p.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  await p.screenshot({ path: `/tmp/melena-${name}.png` });
  console.log("ok", name);
}
// Sheet de nuevo cliente
await p.setViewport({ width: 1440, height: 900 });
await p.goto(`${BASE_URL}/admin/clientes?nuevo=1`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: "/tmp/melena-clientes-nuevo.png" });
console.log("ok nuevo");
await b.close();
