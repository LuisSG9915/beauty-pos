import puppeteer from "puppeteer";
import { BASE_URL, login } from "./lib/e2e";
const b = await puppeteer.launch({ headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await login(p);
const shots: [string, string, number, number][] = [
  ["agenda-dia-nueva", "/admin/agenda?fecha=2026-09-21", 1440, 900],
  ["agenda-semana-nueva", "/admin/agenda?fecha=2026-09-21&vista=semana", 1440, 900],
  ["agenda-dia-mobile", "/admin/agenda?fecha=2026-09-21", 390, 844],
];
for (const [name, path, w, h] of shots) {
  await p.setViewport({ width: w, height: h });
  await p.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  await p.screenshot({ path: `/tmp/melena-${name}.png` });
  console.log("ok", name);
}
await b.close();
