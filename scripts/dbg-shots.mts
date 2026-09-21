import puppeteer from "puppeteer";
const BASE = "http://localhost:3000";
const shots: [string, string, number, number][] = [
  ["landing", "/", 1440, 900],
  ["landing-mobile", "/", 390, 844],
  ["precios", "/precios", 1440, 900],
  ["login", "/login", 1440, 900],
];
const b = await puppeteer.launch({ headless: true });
const p = await b.newPage();
for (const [name, path, w, h] of shots) {
  await p.setViewport({ width: w, height: h });
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `/tmp/melena-${name}.png` });
  console.log("ok", name);
}
await b.close();
