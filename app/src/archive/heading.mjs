// heading.mjs: "All letters" in the logo's hand (#5: Québec school print, felt marker, seed linen-thistle-82), as a
// clean one-colour SVG (currentColor), the same way brand/wordmark/production.mjs makes wordmark-5.svg.
// Usage: node app/src/archive/heading.mjs   → app/src/archive/all-letters.svg
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { wordmark } from '../../../brand/wordmark/wordmark.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEXT = 'All letters';
const hand = { seed: 'linen-thistle-82', style: 'quebec-print' };

// outlines only (no filters or ink effects), translate baked in, simplified (as production.mjs)
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
function outlines(svg, eps) {
  const paths = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)">([\s\S]*?)<\/g><\/g>/g)) {
    const tx = +g[1], ty = +g[2];
    for (const m of g[3].matchAll(/<path[^>]* d="([^"]+)"/g)) {
      const subs = [];
      for (const sp of m[1].split('Z')) {
        const nums = sp.match(/-?\d+(?:\.\d+)?/g);
        if (!nums || nums.length < 6) continue;
        let pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i] + tx, +nums[i + 1] + ty]);
        pts = rdp(pts, eps);
        if (pts.length < 3) continue;
        for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        subs.push(pts);
      }
      if (subs.length) paths.push(subs);
    }
  }
  return { paths, box: [x0, y0, x1, y1] };
}
const { paths, box } = outlines(wordmark([{ runs: [{ text: TEXT, hand }] }], { ink: 'currentColor', pad: 0 }), 0.3);
const pad = 1;
const [x0, y0, x1, y1] = box;
const w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad, ox = x0 - pad, oy = y0 - pad;
const d = (subs) => subs.map((pts) => 'M' + pts.map(([x, y]) => r1(x - ox) + ' ' + r1(y - oy)).join('L') + 'Z').join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(w)} ${r1(h)}" aria-hidden="true"><g fill="currentColor">` +
  paths.map((s) => `<path d="${d(s)}"/>`).join('') + '</g></svg>\n';
fs.writeFileSync(path.join(here, 'all-letters.svg'), svg);
console.log('all-letters.svg', `${r1(w)} x ${r1(h)}`, `${(svg.length / 1024).toFixed(1)} KB`);
