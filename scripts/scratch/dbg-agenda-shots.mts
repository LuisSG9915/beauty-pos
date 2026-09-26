import puppeteer from "puppeteer";
import { BASE_URL, login } from "./lib/e2e";

const shots: [string, string, number, number][] = [
  ["agenda-semana-1440", "/admin/agenda?vista=semana", 1440, 900],
  ["admin-home-1440", "/admin", 1440, 900],
  ["admin-pos-1440", "/admin/pos", 1440, 900],
  ["agenda-dia-390", "/admin/agenda", 390, 844],
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
await b.close();
