/**
 * Genera los assets rasterizados de marca de Melena (Bugambilia viva) con
 * Puppeteer:
 *   public/icon.png        512×512 (tile + M fluida)
 *   public/apple-icon.png  180×180 (tile a sangre, requisito iOS)
 *   public/og.png          1200×630 (tarjeta social)
 *   src/app/favicon.ico    PNG 48 dentro de contenedor ICO
 * `public/icon.svg` es estático y se edita a mano — los paths de la M fluida
 * aquí deben coincidir con él y con src/components/brand-mark.tsx.
 *
 * Uso: pnpm tsx scripts/generate-brand-assets.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const ROOT = join(__dirname, "..");

/** Paleta Bugambilia (espejo de globals.css / brand.ts). */
const TILE_FROM = "#341523";
const TILE_TO = "#a91d5d";
const GLYPH = "#fff7fb";
const OG_BG_FROM = "#1a1117";
const OG_BG_MID = "#341523";
const OG_BG_TO = "#6b1340";
const OG_TEXT = "#faf0f5";
const OG_MUTED = "#d9b7ca";
const OG_FAINT = "#a3698c";

/** M fluida: silueta en dos trazos curvos + pliegue (viewBox 0 0 64 64). */
const M_GLYPH = (size: number, color: string) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M15 48.4C16.7 36.6 18.8 25.9 23 16.2c3.2.8 5.5 8.4 8.9 18.1 3.4-9.7 5.7-17.3 8.9-18.1 4.2 9.7 6.3 20.4 8 32.2h-8.2c-.8-8.6-1.5-15-3.8-21.2-1.6 4.1-3 9.4-4.8 15.1-1.8-5.7-3.2-11-4.8-15.1-2.3 6.2-3 12.6-3.8 21.2H15Z" fill="${color}"/>
  <path d="M24.1 20.8c2.4 1.8 4.1 6.7 5.8 13.1" opacity="0.22" stroke="${color}" stroke-linecap="round" stroke-width="1.8"/>
</svg>`;

const FRAUNCES_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&display=swap');
`;

const TILE_HTML = (size: number, bleed = false) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; box-sizing: border-box; }
body { width: ${size}px; height: ${size}px; display: grid; place-items: center;
  background: transparent; }
.tile { width: ${size}px; height: ${size}px; border-radius: ${bleed ? 0 : Math.round(size * 0.28)}px;
  background: linear-gradient(135deg, ${TILE_FROM} 0%, ${TILE_TO} 100%);
  display: grid; place-items: center; color: ${GLYPH}; }
</style></head><body><div class="tile">${M_GLYPH(Math.round(size * 0.68), GLYPH)}</div></body></html>`;

const OG_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${FRAUNCES_CSS}
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: linear-gradient(140deg, ${OG_BG_FROM} 0%, ${OG_BG_MID} 45%, ${OG_BG_TO} 100%);
  display: grid; place-items: center; font-family: 'Fraunces', Georgia, serif; position: relative; overflow: hidden; }
.arc { position: absolute; border-radius: 50%; border: 1.5px solid rgba(240,100,157,.20); }
.arc.a { width: 900px; height: 900px; right: -320px; top: -320px; }
.arc.b { width: 640px; height: 640px; right: -180px; top: -180px; }
.arc.c { width: 700px; height: 700px; left: -300px; bottom: -340px; }
.center { text-align: center; position: relative; }
.brand { display: flex; align-items: center; justify-content: center; gap: 28px; }
.tile { width: 110px; height: 110px; border-radius: 32px;
  background: linear-gradient(135deg, ${TILE_FROM}, ${TILE_TO});
  display: grid; place-items: center; color: ${GLYPH};
  box-shadow: 0 24px 60px rgba(0,0,0,.35); }
.word { font-style: italic; font-weight: 600; font-size: 118px; color: ${OG_TEXT}; letter-spacing: -0.02em; }
.tag { margin-top: 26px; font-family: 'Geist', -apple-system, sans-serif; font-size: 34px; color: ${OG_MUTED}; letter-spacing: .01em; }
.domain { margin-top: 54px; font-family: 'Geist', -apple-system, sans-serif; font-size: 24px;
  color: ${OG_FAINT}; letter-spacing: .24em; text-transform: uppercase; }
</style></head><body>
<div class="arc a"></div><div class="arc b"></div><div class="arc c"></div>
<div class="center">
  <div class="brand"><div class="tile">${M_GLYPH(75, GLYPH)}</div><div class="word">Melena</div></div>
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
