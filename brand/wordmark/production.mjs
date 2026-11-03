// production.mjs — the chosen logo (#32: Spanish 1776 copybook, seed saffron-pebble-77, fountain pen) as app assets.
// Usage: node brand/wordmark/production.mjs        (then tools in rasterize.py turn the HTML frames into PNG/ICO)
//   app/public/brand/wordmark.svg        stacked "If this finds / you", one colour (currentColor)
//   app/public/brand/wordmark-small.svg  one line "If this finds you", heavier pen, for small headers
//   app/public/brand/favicon.svg         "If" in ink on warm paper, rounded square
//   out/brand-frames/*.html              frames for the PNG/ICO icons and the share image
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { wordmark } from './wordmark.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const pub = path.join(root, 'app/public/brand');
const frames = path.join(root, 'out/brand-frames');
fs.mkdirSync(pub, { recursive: true });
fs.mkdirSync(frames, { recursive: true });

export const PAPER = '#fffdf8';
export const INK = '#1c2233';
const SEED = 'saffron-pebble-77', STYLE = 'spanish-1776';
const hand = (extra = {}) => ({ seed: SEED, style: STYLE, ...extra });

// Exactly option #32 (options.mjs)
export const STACKED = [
  { runs: [{ text: 'If this finds', hand: hand() }] },
  { runs: [{ text: 'you', hand: hand({ salt: 'you' }) }].map((r) => ({ ...r, size: 1.7 })), indent: 1.6, leading: 1.25 },
];
// Small sizes: same writer and letters, one line, "you" still larger, pen ~25% heavier so hairlines survive
const SMALL_PEN = 88;
export const SMALL = [{ runs: [
  { text: 'If this finds', hand: hand({ penWidth: SMALL_PEN }) },
  { text: 'you', hand: hand({ salt: 'you', penWidth: SMALL_PEN }), size: 1.45, gap: 0.2 },
] }];
export const ICON = [{ runs: [{ text: 'If', hand: hand({ salt: 'icon', penWidth: 125 }) }] }];

// ---- clean-up: outlines only, no filters or ink effects, translate baked in, viewBox at 0 0, simplified ----
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r1 = (v) => (Math.round(v * 10) / 10).toString();

// returns { d: [path data per pen-down], box: [x0, y0, x1, y1] }
function outlines(svg, eps) {
  const paths = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  // every ink group is <g transform="translate(tx ty)"> … <path … d="…"/> … </g>; ellipses (ink pools) are dropped
  for (const g of svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)">([\s\S]*?)<\/g><\/g>/g)) {
    const tx = +g[1], ty = +g[2];
    for (const m of g[3].matchAll(/<path[^>]* d="([^"]+)"/g)) {
      const subs = [];
      for (const sp of m[1].split('Z')) {
        const nums = sp.match(/-?\d+(?:\.\d+)?/g);
        if (!nums || nums.length < 6) continue;
        let pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i] + tx, +nums[i + 1] + ty]);
        pts = rdp(pts, eps);                               // open chain: start and end stay, so the loop closes as drawn
        if (pts.length < 3) continue;
        for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        subs.push(pts);
      }
      if (subs.length) paths.push(subs);
    }
  }
  return { paths, box: [x0, y0, x1, y1] };
}
function toSVG({ paths, box }, { pad = 0, label, square = false, bg = null, fill = 'currentColor', size = null }) {
  let [x0, y0, x1, y1] = box;
  let w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad, ox = x0 - pad, oy = y0 - pad;
  if (square) { const s = Math.max(w, h); ox -= (s - w) / 2; oy -= (s - h) / 2; w = h = s; }
  const d = (subs) => subs.map((pts) => 'M' + pts.map(([x, y]) => r1(x - ox) + ' ' + r1(y - oy)).join('L') + 'Z').join('');
  const dims = size ? ` width="${size[0]}" height="${size[1]}"` : '';
  const rect = bg ? `<rect width="${r1(w)}" height="${r1(h)}" rx="${r1(w * 0.22)}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(w)} ${r1(h)}"${dims} role="img" aria-label="${label}">` +
    (label ? `<title>${label}</title>` : '') + rect + `<g fill="${fill}">` + paths.map((s) => `<path d="${d(s)}"/>`).join('') + '</g></svg>';
}

const NAME = 'If This Finds You';
const stacked = outlines(wordmark(STACKED, { ink: 'currentColor', pad: 0 }), 0.3);
const small = outlines(wordmark(SMALL, { ink: 'currentColor', pad: 0 }), 0.3);
const icon = outlines(wordmark(ICON, { ink: 'currentColor', pad: 0 }), 0.3);

const files = {
  'wordmark.svg': toSVG(stacked, { label: NAME, pad: 1 }),
  'wordmark-small.svg': toSVG(small, { label: NAME, pad: 1 }),
};
// favicon: the "If" on paper, inset so it breathes inside the rounded square
{
  const [x0, y0, x1, y1] = icon.box;
  const s = Math.max(x1 - x0, y1 - y0);
  files['favicon.svg'] = toSVG(icon, { label: NAME, square: true, pad: s * 0.1, bg: PAPER, fill: INK });
}
for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(pub, f), s);

// ---- frames for rasterizing (headless Chrome screenshots at exact sizes) ----
const page = (w, h, body, extra = '') => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}${extra}</style>${body}`;
const inline = (svg, css) => svg.replace('<svg ', `<svg style="${css}" `);
// app icons: paper ground, ink "If", no rounding (the OS masks them)
const iconFrame = (px, inset) => page(px, px,
  `<div style="width:${px}px;height:${px}px;background:${PAPER};display:flex;align-items:center;justify-content:center">` +
  inline(toSVG(icon, { label: NAME, square: true, fill: INK }), `width:${Math.round(px * (1 - 2 * inset))}px;height:auto`) + '</div>');
fs.writeFileSync(path.join(frames, 'apple-touch-icon.html'), iconFrame(180, 0.14));
fs.writeFileSync(path.join(frames, 'icon-192.html'), iconFrame(192, 0.14));
fs.writeFileSync(path.join(frames, 'icon-512.html'), iconFrame(512, 0.14));
// favicon rasters: the favicon.svg itself
for (const px of [16, 32, 48]) fs.writeFileSync(path.join(frames, `favicon-${px}.html`), page(px, px, inline(files['favicon.svg'], `width:${px}px;height:${px}px;display:block`)));
// share image
const LINE = 'Real letters by ordinary people, written out by hand.';
fs.writeFileSync(path.join(frames, 'og-image.html'), page(1200, 630,
  `<div class="og">${inline(toSVG(stacked, { label: NAME, fill: INK }), 'width:640px;height:auto;display:block')}` +
  `<p class="line">${LINE}</p><p class="url">ifthisfindsyou.app</p></div>`,
  `@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500&display=block');
   body{background:${PAPER};font-family:'Instrument Sans',system-ui,sans-serif;color:${INK}}
   .og{position:absolute;inset:0;padding:96px 104px;display:flex;flex-direction:column;justify-content:center;gap:0}
   .line{margin:56px 0 0;font-size:34px;line-height:1.3;letter-spacing:-0.005em;color:#2c3550;max-width:22em}
   .url{margin:14px 0 0;font-size:22px;color:#8f8a80;letter-spacing:.01em}`));

// header-size comparison sheet (for checking, not shipped)
const sizes = [24, 28, 32, 36, 48];
fs.writeFileSync(path.join(root, 'out/wm/header-check.html'), page(1100, 760,
  ['#fffdf8|#1c2233', '#1b1d24|#ece5d6'].map((c) => {
    const [bg, fg] = c.split('|');
    return `<div style="background:${bg};color:${fg};padding:16px;display:grid;gap:14px">` + sizes.map((px) =>
      `<div style="display:flex;gap:40px;align-items:center;font:11px system-ui"><span style="width:40px">${px}px</span>` +
      inline(files['wordmark.svg'], `height:${px}px;width:auto`) + inline(files['wordmark-small.svg'], `height:${px}px;width:auto`) + '</div>').join('') + '</div>';
  }).join('') + `<div style="padding:16px;display:flex;gap:16px;align-items:end">${[16, 32, 48, 64].map((px) => inline(files['favicon.svg'], `width:${px}px;height:${px}px`)).join('')}</div>`));

console.log(Object.entries(files).map(([f, s]) => `${f} ${(s.length / 1024).toFixed(1)} KB`).join(' · '));
