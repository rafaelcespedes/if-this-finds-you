// pen.js — pen models: sweep a pen along a centerline into a filled outline, plus how its ink looks.
//
// A pen is { label, outline(p, pts, seedOff, opt) -> polygon, svgDefs?(p, ctx), strokeOpacity?(p, ctx) }.
// Hands pick a pen with p.pen (default 'auto'). Outlines are closed polygons in font units, y up.

import { rng, clamp, lerp, smooth, DEG } from './core.js';

// ---------- 'auto': broad nib for print, pointed pen for script (the original spike model) ----------
function autoOutline(p, pts, seedOff, opt) {
  const n = pts.length;
  if (n < 2) return null;
  const N = p.noise;
  const isDot = opt && opt.dot;
  const len = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len[n - 1] || 1;
  const tin = Math.min(70, total * 0.3), tout = Math.min(120, total * 0.4);
  const c = clamp(p.pressure, 0, 1);
  const nib = p.nibAngle * DEG;
  const script = p.style === 'script';
  const tang = [], w = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    tang.push([tx, ty]);
    let f;
    if (isDot) f = 1.15 * p.dotSize;
    else {
      if (script) f = 1 - 0.55 * c + 1.5 * c * Math.max(0, -ty);   // pointed pen: swell on downstrokes
      else f = (1 - 0.85 * c) + 0.95 * c * Math.abs(Math.sin(Math.atan2(ty, tx) - nib)); // broad nib
      const s = len[i];
      const taper = lerp(p.taperIn, 1, smooth(s / tin)) * lerp(p.taperOut, 1, smooth((total - s) / tout));
      f *= taper * (1 + p.pressureVar * N.n1(s / 110 + seedOff));
    }
    w.push(Math.max(4, p.penWidth * f));
  }
  // soften width changes (nib model flips at corners)
  const ws = w.map((_, i) => (w[Math.max(0, i - 2)] + 2 * w[Math.max(0, i - 1)] + 3 * w[i] + 2 * w[Math.min(n - 1, i + 1)] + w[Math.min(n - 1, i + 2)]) / 9);
  return ribbon(pts, tang, ws);
}

// Offset a centerline by half-widths on both sides and close it with round caps.
export function ribbon(pts, tang, ws) {
  const n = pts.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tang[i], h = ws[i] / 2;
    left.push([pts[i][0] - ty * h, pts[i][1] + tx * h]);
    right.push([pts[i][0] + ty * h, pts[i][1] - tx * h]);
  }
  const poly = [];
  for (const q of left) poly.push(q);
  capArc(poly, pts[n - 1], tang[n - 1], ws[n - 1] / 2, false);
  for (let i = n - 1; i >= 0; i--) poly.push(right[i]);
  capArc(poly, pts[0], tang[0], ws[0] / 2, true);
  return poly;
}
export function capArc(poly, c, t, r, start) {
  // from +n through +t (end) / -t (start) to -n ... sweeping clockwise in y-up
  const a0 = start ? Math.atan2(-t[0], t[1]) : Math.atan2(t[0], -t[1]);
  const steps = 8;
  for (let j = 1; j < steps; j++) {
    const a = a0 - Math.PI * (j / steps);
    poly.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
}

// Ramer–Douglas–Peucker on a closed polygon (for compact font outlines)
export function simplify(poly, tol) {
  if (poly.length < 8) return poly;
  const keep = new Uint8Array(poly.length);
  keep[0] = 1; keep[poly.length - 1] = 1;
  const stack = [[0, poly.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const ax = poly[a][0], ay = poly[a][1], bx = poly[b][0], by = poly[b][1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((poly[i][0] - ax) * dy - (poly[i][1] - ay) * dx) / L;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return poly.filter((_, i) => keep[i]);
}

// ---------- ink appearance (SVG) ----------
// Default ink: a faint fractal-noise displacement roughens edges; density drifts slowly along the
// text (pen running dry / re-inked) and varies a little per stroke, so crossings build up.
function autoSvgDefs(p, ctx) {
  const scale = Math.min(1.6, 0.5 + ctx.emPx / 70).toFixed(2);
  return {
    defs: `<filter id="inkEdge" x="-2%" y="-2%" width="104%" height="104%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7"/>` +
      `<feDisplacementMap in="SourceGraphic" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`,
    groupAttrs: 'filter="url(#inkEdge)"',
  };
}
function autoStrokeOpacity(p, ctx) {
  // ctx: { inkIndex, strokeIndex }
  const N = p.noise;
  return Math.min(1, 0.9 + 0.05 * N.n1(ctx.inkIndex * 0.23 + 50) + 0.04 * rng('ink:' + ctx.inkIndex + ':' + ctx.strokeIndex)());
}

export const PENS = {
  auto: { label: 'Natural', outline: autoOutline, svgDefs: autoSvgDefs, strokeOpacity: autoStrokeOpacity },
};

export const getPen = (p) => PENS[p.pen] || PENS.auto;
export const penOutline = (p, pts, seedOff, opt) => getPen(p).outline(p, pts, seedOff, opt);

export const PEN_PARAMS = [
  { key: 'pen', label: 'Pen', group: 'Pen', type: 'select', options: () => Object.entries(PENS).map(([v, d]) => ({ value: v, label: d.label })) },
  { key: 'penWidth', label: 'Pen width', group: 'Pen', min: 14, max: 110, step: 1, format: 'int' },
  { key: 'pressure', label: 'Pressure', group: 'Pen', min: 0, max: 1, step: 0.01, format: 'pct' },
];
