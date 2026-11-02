// tools/qa/lib/util.mjs — small helpers shared by the QA checks: hashing, stats, geometry, a local PRNG.
// Nothing here depends on the engine, so a broken engine can't break the measuring stick.

import crypto from 'node:crypto';

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// ---------- stats ----------
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
export function stats(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { n: v.length, min: v[0], p05: quantile(v, 0.05), p10: quantile(v, 0.1), median: quantile(v, 0.5),
    p90: quantile(v, 0.9), p95: quantile(v, 0.95), max: v[v.length - 1], mean, sd };
}
export const fmt = (x, d = 2) => (Number.isFinite(x) ? (+x).toFixed(d) : String(x));
export function fmtStats(s, d = 2, unit = '') {
  if (!s || !s.n) return 'n=0';
  return `min ${fmt(s.min, d)}${unit} · p10 ${fmt(s.p10, d)} · median ${fmt(s.median, d)} · p90 ${fmt(s.p90, d)} · max ${fmt(s.max, d)}${unit} (n=${s.n})`;
}
// tiny text histogram, for the console and REPORT.md
export function histogram(values, bins = 10, width = 30, lo, hi) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return '';
  lo = lo ?? Math.min(...v); hi = hi ?? Math.max(...v);
  if (hi <= lo) hi = lo + 1;
  const counts = new Array(bins).fill(0);
  for (const x of v) counts[Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / (hi - lo) * bins)))]++;
  const mx = Math.max(...counts);
  return counts.map((c, i) => {
    const a = lo + (hi - lo) * i / bins, b = lo + (hi - lo) * (i + 1) / bins;
    return `  ${fmt(a, 2).padStart(7)}–${fmt(b, 2).padEnd(7)} ${'#'.repeat(Math.round(c / mx * width)).padEnd(width)} ${c}`;
  }).join('\n');
}

// ---------- local PRNG (for picking QA seeds; independent of engine/core.js) ----------
export function mulberry32(seedStr) {
  let h = 2166136261;
  for (const c of String(seedStr)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Lab-style seeds ("maple-river-42"). Same word lists as lab/app.js so seeds look like real ones.
const WORDS_A = ['maple', 'quiet', 'amber', 'salt', 'river', 'paper', 'velvet', 'cedar', 'misty', 'lunar', 'honey', 'wild', 'copper', 'olive', 'north', 'ink', 'soft', 'linen', 'ember', 'fern'];
const WORDS_B = ['river', 'harbor', 'sparrow', 'meadow', 'lantern', 'pebble', 'orchard', 'comet', 'thistle', 'willow', 'canyon', 'heron', 'garden', 'atlas', 'quill', 'moth', 'tide', 'birch', 'kettle', 'fable'];
export function seedList(n, salt, random = false) {
  const r = random ? Math.random : mulberry32('qa-seeds:' + salt);
  const out = new Set();
  while (out.size < n) {
    const a = WORDS_A[Math.floor(r() * WORDS_A.length)], b = WORDS_B[Math.floor(r() * WORDS_B.length)];
    out.add(`${a}-${b}-${10 + Math.floor(r() * 90)}`);
  }
  return [...out];
}

// ---------- geometry ----------
export const isFiniteDeep = (x) => {
  if (typeof x === 'number') return Number.isFinite(x);
  if (Array.isArray(x)) return x.every(isFiniteDeep);
  return true;
};
export function bboxOf(pointLists) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pts of pointLists) for (const q of pts) {
    if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
    if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}
export function polyLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
// distance from a point to a closed polygon's boundary
export function distToPoly(q, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const v = segDist(q[0], q[1], poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (v < d) d = v;
  }
  return d;
}
// Local pen width along a stroke: 2 x distance from the centerline to the outline, sampled every `every` points.
// Pen-model agnostic (only needs center + contour), so it keeps working when new pens land.
export function widthProfile(stroke, every = 3) {
  const out = [];
  const c = stroke.center;
  for (let i = 0; i < c.length; i += every) out.push(2 * distToPoly(c[i], stroke.contour));
  return out;
}
// Rasterise contours (y-up font units) into a w x h boolean grid covering [x0,x0+span] x [y0,y0+span].
// Union of contours (nonzero across contours, even-odd within each) — good enough for shape comparison.
export function rasterize(contours, x0, y0, span, n = 40) {
  const grid = new Uint8Array(n * n);
  for (const poly of contours) {
    for (let row = 0; row < n; row++) {
      const y = y0 + (row + 0.5) * span / n;
      const xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ax, ay] = poly[j], [bx, by] = poly[i];
        if ((ay > y) !== (by > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / span * n - 0.5));
        const c1 = Math.min(n - 1, Math.floor((xs[k + 1] - x0) / span * n - 0.5));
        for (let col = c0; col <= c1; col++) grid[row * n + col] = 1;
      }
    }
  }
  return grid;
}
export function iou(a, b) {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; }
  return u ? i / u : 0;
}

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const cp = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
export const showCh = (ch) => (/^\s$/.test(ch) || ch === ' ' ? cp(ch) : ch);
