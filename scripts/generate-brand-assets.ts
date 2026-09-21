/**
 * Genera los assets rasterizados de marca de Melena con Puppeteer:
 *   public/icon.png        512×512 (tile + M editorial)
 *   public/apple-icon.png  180×180 (tile a sangre, requisito iOS)
 *   public/og.png          1200×630 (tarjeta social)
 *   src/app/favicon.ico    PNG 48 dentro de contenedor ICO
 * `public/icon.svg` es estático (serif de sistema) — se edita a mano.
 *
 * Uso: pnpm tsx scripts/generate-brand-assets.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const ROOT = join(__dirname, "..");

const FRAUNCES_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&display=swap');
`;

const TILE_HTML = (size: number, bleed = false) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
${FRAUNCES_CSS}
* { margin: 0; box-sizing: border-box; }
body { width: ${size}px; height: ${size}px; display: grid; place-items: center;
  background: transparent; }
.tile { width: ${size}px; height: ${size}px; border-radius: ${bleed ? 0 : Math.round(size * 0.28)}px;
  background: linear-gradient(135deg, #33243d 0%, #4a3356 100%);
  display: grid; place-items: center; }
.tile span { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 600;
  font-size: ${Math.round(size * 0.58)}px; color: #f4edf8; line-height: 1;
  transform: translateY(${Math.round(size * 0.01)}px); }
</style></head><body><div class="tile"><span>M</span></div></body></html>`;

const OG_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${FRAUNCES_CSS}
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: linear-gradient(140deg, #241e29 0%, #33243d 45%, #4a3356 100%);
  display: grid; place-items: center; font-family: 'Fraunces', Georgia, serif; position: relative; overflow: hidden; }
.arc { position: absolute; border-radius: 50%; border: 1.5px solid rgba(196,168,214,.22); }
.arc.a { width: 900px; height: 900px; right: -320px; top: -320px; }
.arc.b { width: 640px; height: 640px; right: -180px; top: -180px; }
.arc.c { width: 700px; height: 700px; left: -300px; bottom: -340px; }
.center { text-align: center; position: relative; }
.brand { display: flex; align-items: center; justify-content: center; gap: 28px; }
.tile { width: 110px; height: 110px; border-radius: 32px;
  background: linear-gradient(135deg, #4a3356, #6f4b7d);
  display: grid; place-items: center;
  box-shadow: 0 24px 60px rgba(0,0,0,.35); }
.tile span { font-style: italic; font-weight: 600; font-size: 66px; color: #f4edf8; line-height: 1; }
.word { font-style: italic; font-weight: 600; font-size: 118px; color: #f4edf8; letter-spacing: -0.02em; }
.tag { margin-top: 26px; font-family: 'Geist', -apple-system, sans-serif; font-size: 34px; color: #cdbfd6; letter-spacing: .01em; }
.domain { margin-top: 54px; font-family: 'Geist', -apple-system, sans-serif; font-size: 24px;
  color: #9880a8; letter-spacing: .24em; text-transform: uppercase; }
</style></head><body>
<div class="arc a"></div><div class="arc b"></div><div class="arc c"></div>
<div class="center">
  <div class="brand"><div class="tile"><span>M</span></div><div class="word">Melena</div></div>
  <div class="tag">Todo tu salón, bajo control</div>
  <div class="domain">melena.app</div>
</div></body></html>`;

/** Empaqueta un PNG como .ico (los navegadores aceptan PNG embebido). */
function pngToIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

async function shot(page: import("puppeteer").Page, html: string, width: number, height: number): Promise<Buffer> {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load", timeout: 30000 });
  // Si Google Fonts no responde, el render cae a Georgia itálica (fallback).
  await Promise.race([
    page.evaluate(() => document.fonts.ready.then(() => undefined)),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
  return Buffer.from(await page.screenshot({ omitBackground: true }));
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    mkdirSync(join(ROOT, "public"), { recursive: true });
    const icon = await shot(page, TILE_HTML(512), 512, 512);
    writeFileSync(join(ROOT, "public/icon.png"), icon);
    const apple = await shot(page, TILE_HTML(180, true), 180, 180);
    writeFileSync(join(ROOT, "public/apple-icon.png"), apple);
    const og = await shot(page, OG_HTML, 1200, 630);
    writeFileSync(join(ROOT, "public/og.png"), og);
    const favPng = await shot(page, TILE_HTML(48), 48, 48);
    writeFileSync(join(ROOT, "src/app/favicon.ico"), pngToIco(favPng, 48));
    console.log("Assets generados: icon.png, apple-icon.png, og.png, favicon.ico");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
