#!/usr/bin/env node
// tools/share-image/write-card.mjs — the writing page's link-preview picture (README.md, "The writing page's card").
//
//   (cd tools/smoke && npm ci)                          once: the smoke test's Chrome
//   node tools/share-image/write-card.mjs               → tools/share-image/out/write-card.png (and its crops)
//   node tools/share-image/write-card.mjs --publish     → app/public/brand/share-write.jpg
//
// One line on paper, the wordmark small at its foot: "Paper", Rafael's pick of four on 7 Nov 2026 (Paper, Dark, Typed,
// Slip). The line is real ink, written on /write by Matteo Carver with a medium tip: "The coffee here is terrible", a
// pause for the pen to pass, eight Backspaces, "wonderful." The pen's own SVG (filters, pooled ink and the strike) is
// kept as it was drawn in write-line.svg, cropped to its ink. Painted at twice the size, then stepped down to 1200 × 630.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'out');
const BRAND = path.join(ROOT, 'app', 'public', 'brand');
// a changed picture gets a new name (share-write-2.jpg, …) and write.html follows: previews keep a picture for days
const PUBLISHED = 'share-write.jpg';
const JPEG_Q = 0.86;

const { chromium } = await import(pathToFileURL(path.join(ROOT, 'tools', 'smoke', 'node_modules', 'playwright', 'index.mjs')).href);
const line = fs.readFileSync(path.join(HERE, 'write-line.svg'), 'utf8');
const mark = fs.readFileSync(path.join(BRAND, 'wordmark-5.svg'), 'utf8').replace(/<title>[\s\S]*?<\/title>/, '');
const [, , vw, vh] = line.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const W = 860; // the line's width on the card
const H = Math.round((W * vh) / vw);

const html = `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0 }
  .card { position: relative; width: 1200px; height: 630px; overflow: hidden; background: #f3eee2; color: #1f2a44 }
  /* the paper's tooth: a fine, warm grain multiplied in */
  .grain { position: absolute; inset: 0; opacity: .35; mix-blend-mode: multiply; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .55 0 0 0 0 .5 0 0 0 0 .42 0 0 0 .22 0'/></filter><rect width='300' height='300' filter='url(%23n)'/></svg>") }
  .line { position: absolute; left: ${(1200 - W) / 2}px; top: ${Math.round((630 - 30 - H) / 2)}px; width: ${W}px; height: ${H}px }
  .line svg { width: 100%; height: 100%; display: block; overflow: visible }
  .mark { position: absolute; left: 50%; bottom: 44px; height: 22px; transform: translateX(-50%); opacity: .55 }
  .mark svg { height: 100%; width: auto; display: block }
</style><div class="card"><div class="grain"></div><div class="line">${line}</div><div class="mark">${mark}</div></div>`;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.waitForTimeout(300);
const big = await (await page.$('.card')).screenshot();
fs.writeFileSync(path.join(OUT, 'write-card@2x.png'), big);
// step down to 1200 × 630 in the browser (smooth), as PNG for looking and JPEG for the site
const [png, jpg] = await page.evaluate(async ([src, q]) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, 1200, 630);
  return [c.toDataURL('image/png'), c.toDataURL('image/jpeg', q)];
}, ['data:image/png;base64,' + big.toString('base64'), JPEG_Q]);
const buf = (d) => Buffer.from(d.split(',')[1], 'base64');
fs.writeFileSync(path.join(OUT, 'write-card.png'), buf(png));
console.log(`write-card: 1200×630, jpeg q${JPEG_Q} ${(buf(jpg).length / 1024).toFixed(0)} kB`);
if (process.argv.includes('--publish')) {
  fs.writeFileSync(path.join(BRAND, PUBLISHED), buf(jpg));
  console.log(`published → app/public/brand/${PUBLISHED}`);
}
await browser.close();
