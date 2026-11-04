#!/usr/bin/env node
// tools/share-image/render.mjs — remakes the link-preview picture (README.md).
//
//   (cd app && npm install) && (cd tools/smoke && npm ci)      once: the app's Vite and the smoke test's Chrome
//   node tools/share-image/render.mjs                           every composition → tools/share-image/out/
//   node tools/share-image/render.mjs fan --publish             the site's picture → app/public/brand/share-2.jpg (Rafael's pick, 4 Nov)
//   node tools/share-image/render.mjs --contact                 the candidate letters side by side → out/contact.png
//   node tools/share-image/render.mjs --crops                   also the crops link previews make → out/<name>-crops.png
//   node tools/share-image/render.mjs pile fan close --compare  the named ones side by side, to choose → out/compare.png
//
// It starts the app's own Vite (app/vite.config.ts: the same engine, aliases and letters as the site) with this
// folder as its root, opens index.html in Chrome, and saves what pile.ts paints. Same letters, same hands, same
// picture every time: everything is seeded by the letters' ids.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const APP = path.join(ROOT, 'app');
const OUT = path.join(HERE, 'out');
const BRAND = path.join(APP, 'public', 'brand');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const names = args.filter((a) => !a.startsWith('--'));
// The picture's file. A changed picture gets a new name (share-3.jpg, …) and the pages' og:image / twitter:image follow:
// link previews keep a picture by its address for days. share.jpg ("A tight pile") was live for a few hours on 4 Nov.
const PUBLISHED = 'share-2.jpg';
const COMPARE_TITLES = { pile: 'A tight pile', fan: 'A scattered fan', close: 'Close up' };
const JPEG_Q = Number((args.find((a) => a.startsWith('--q=')) ?? '--q=0.86').slice(4));

const { createServer } = await import(pathToFileURL(path.join(APP, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
const { chromium } = await import(pathToFileURL(path.join(ROOT, 'tools', 'smoke', 'node_modules', 'playwright', 'index.mjs')).href);

fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({
  configFile: path.join(APP, 'vite.config.ts'),
  root: HERE,
  logLevel: 'warn',
  server: { port: 0, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: flag('--contact') ? 1900 : 1300, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.error('  page:', m.text()); });
page.on('pageerror', (e) => console.error('  page error:', e.message));

try {
  if (flag('--contact')) {
    await page.goto(url + '?c=contact', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shareReady === true, null, { timeout: 180_000 });
    const file = path.join(OUT, 'contact.png');
    await page.screenshot({ path: file, fullPage: true });
    console.log('contact sheet →', path.relative(ROOT, file));
  } else {
    await page.goto(url + '?auto=0', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__share, null, { timeout: 60_000 });
    const all = await page.evaluate(() => window.__share.names());
    const want = names.length ? names : all.filter((n) => n !== 'test');
    const made = [];
    for (const name of want) {
      const t0 = Date.now();
      const r = await page.evaluate(([n, q]) => window.__share.render(n, { jpeg: q }), [name, JPEG_Q]);
      const png = Buffer.from(r.png, 'base64');
      const jpg = Buffer.from(r.jpg, 'base64');
      fs.writeFileSync(path.join(OUT, `${name}.png`), png);
      fs.writeFileSync(path.join(OUT, `${name}.jpg`), jpg);
      console.log(`${name}: ${r.width}×${r.height}, png ${(png.length / 1024).toFixed(0)} kB, jpeg q${JPEG_Q} ${(jpg.length / 1024).toFixed(0)} kB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      for (const s of r.sheets) console.log(`  ${s.id.padEnd(28)} ${s.paper.padEnd(16)} ${s.hand}`);
      made.push({ name, jpg });
      if (flag('--crops')) await crops(name, jpg);
      if (flag('--publish')) {
        // the one every page's og:image and twitter:image name (app/*.html); a new picture under a new name busts
        // the link-preview caches (X, Slack, WhatsApp keep a picture for days)
        const file = path.join(BRAND, PUBLISHED);
        fs.writeFileSync(file, jpg);
        console.log('  published →', path.relative(ROOT, file));
      }
    }
    if (flag('--compare')) await compare(made);
  }
} finally {
  await browser.close();
  await server.close();
}

/**
 * How link previews crop a 1200×630 picture, side by side: the whole card (X, Slack, Discord, LinkedIn, iMessage's
 * large card, WhatsApp's large card), a centred square (WhatsApp's and iMessage's small thumbnail, some crawlers),
 * and a centred 2:1 strip (X on narrow screens). Drawn in the page so no image library is needed.
 */
async function crops(name, jpg) {
  const data = 'data:image/jpeg;base64,' + jpg.toString('base64');
  const b64 = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.width, H = img.height;
    const pad = 24, label = 22;
    const sq = H; // the centred square, full height
    const strip = { w: W, h: Math.round(W / 2) };
    const thumb = 120; // WhatsApp's small square, at its real size
    const cw = pad + W + pad + sq + pad, ch = pad + label + H + pad + label + strip.h + pad;
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#1e2733';
    g.font = '13px system-ui, sans-serif';
    const cap = (s, x, y) => g.fillText(s, x, y);
    cap('Whole card 1.91:1 (X, Slack, Discord, LinkedIn, iMessage and WhatsApp large)', pad, pad + 14);
    g.drawImage(img, pad, pad + label);
    cap('Centred square (small thumbnails)', pad + W + pad, pad + 14);
    g.drawImage(img, (W - sq) / 2, 0, sq, sq, pad + W + pad, pad + label, sq, sq);
    const y2 = pad + label + H + pad;
    cap('Centred 2:1 strip', pad, y2 + 14);
    g.drawImage(img, 0, (H - strip.h) / 2, W, strip.h, pad, y2 + label, W, strip.h);
    cap('Small square at 120 px', pad + W + pad, y2 + 14);
    g.drawImage(img, (W - sq) / 2, 0, sq, sq, pad + W + pad, y2 + label, thumb, thumb);
    return c.toDataURL('image/png').split(',')[1];
  }, data);
  const file = path.join(OUT, `${name}-crops.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('  crops →', path.relative(ROOT, file));
}

/** The named pictures one under another, each with its small square thumbnail beside it, lettered A, B, C. */
async function compare(made) {
  const items = made.map((m, i) => ({ label: `${String.fromCharCode(65 + i)}`, title: COMPARE_TITLES[m.name] ?? m.name, src: 'data:image/jpeg;base64,' + m.jpg.toString('base64') }));
  const b64 = await page.evaluate(async (items) => {
    const imgs = await Promise.all(items.map(async (it) => { const im = new Image(); im.src = it.src; await im.decode(); return im; }));
    const cw = 900, chh = Math.round((cw * 630) / 1200), sq = chh, small = 110;
    const pad = 32, gap = 24, head = 58;
    const W = pad + cw + gap + sq + gap + small + pad;
    const rowH = head + chh;
    const H = pad + items.length * rowH + (items.length - 1) * 40 + pad;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    items.forEach((it, i) => {
      const y = pad + i * (rowH + 40);
      const im = imgs[i];
      g.fillStyle = '#1e2733';
      g.font = '600 22px system-ui, sans-serif';
      g.fillText(`${it.label}   ${it.title}`, pad, y + 22);
      g.font = '13px system-ui, sans-serif';
      g.fillStyle = '#6c685f';
      g.fillText('As most apps show it (X, iMessage, Slack, LinkedIn, Discord)', pad, y + head - 8);
      g.fillText('Cropped to a square (WhatsApp, small cards)', pad + cw + gap, y + head - 8);
      g.fillText('Tiny', pad + cw + gap + sq + gap, y + head - 8);
      g.drawImage(im, pad, y + head, cw, chh);
      const s = im.height;
      g.drawImage(im, (im.width - s) / 2, 0, s, s, pad + cw + gap, y + head, sq, sq);
      g.drawImage(im, (im.width - s) / 2, 0, s, s, pad + cw + gap + sq + gap, y + head, small, small);
      g.strokeStyle = 'rgba(30,39,51,.15)';
      g.strokeRect(pad + 0.5, y + head + 0.5, cw - 1, chh - 1);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, items);
  const file = path.join(OUT, 'compare.png');
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('comparison →', path.relative(ROOT, file));
}
