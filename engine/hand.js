// hand.js — seed -> a writer, and how that writer draws one letter.
//
// Pipeline per glyph instance:
//   skeleton variant (glyphs.js, chosen per hand)  ->  zone remap (x-height / ascender / descender) + width
//   -> corner-aware smoothing (centripetal Catmull-Rom, optional corner fillets)
//   -> per-letter "quirk" warp (fixed for the hand)  +  per-instance warp & affine (varies each use)
//   -> gentle bow + slow drift along each stroke (no fine wobble)  ->  slant shear + word size
//   -> pen model (pen.js)  ->  filled outline polygons
//
// Everything is deterministic from strings: hand seed, and an instance seed for each use.

import { rng, makeNoise, lerp, clamp, mix, smooth, DEG } from './core.js';
import { choose, getStyle, has as styleHas } from './glyphs.js';
import { penOutline } from './pen.js';

// ---------- the "writer": one consistent set of parameters per seed ----------
// `style` is a user choice (a style name from glyphs.js); everything else comes from the seed.
export function makeHand(seed, style) {
  const r = rng('hand:' + seed);
  const script = style === 'script';
  const h = {
    seed: String(seed),
    style: getStyle(style) ? style : 'print',
    pen: 'auto',
    // --- the exposed controls (UI may override) ---
    neatness: r.range(0.35, 0.85),           // 0 = scrawl, 1 = careful
    slant: r.range(-5, 6) + r() * r() * 16,  // degrees, right-leaning bias
    penWidth: r.range(40, 76),               // font units at UPM 1000
    pressure: r.range(0.1, 0.65),            // stroke contrast: nib / pressure shading
    // --- hidden "personality" ---
    nibAngle: r.range(20, 55),               // degrees (broad-nib model, print)
    xHeight: script ? r.range(0.42, 0.54) : r.range(0.5, 0.68), // fraction of cap height
    ascender: r.range(0.98, 1.16),           // lowercase ascender vs cap height
    descender: r.range(0.8, 1.2),
    width: script ? r.range(0.84, 1.12) : r.range(0.7, 0.96), // horizontal scale of lowercase
    capWidth: 1,                             // set below (correlated with width)
    roundness: r.range(0.15, 1),             // corner softening
    tracking: 0,
    sidebearing: r.range(28, 66),            // print: gap each side of the ink
    space: r.range(230, 360),                // word space (font units)
    strokeShift: r.range(0.6, 1.4),          // how loosely separate strokes land (t-bars, i-dots)
    wordSpace: r.range(0.85, 1.35),
    quirk: r.range(22, 44),                  // amplitude of the fixed per-letter distortion
    quirkScale: r.range(320, 480),           // wavelength of that distortion (long = no wiggles)
    tremor: r.range(0.6, 2.4),               // fine wobble along strokes
    drift: r.range(0.4, 1.0),                // baseline wander
    pressureVar: r.range(0.08, 0.3),
    taperIn: r.range(0.45, 0.85),            // width multiplier at stroke start
    taperOut: r.range(0.3, 0.75),            // width multiplier at stroke end
    dotHeight: r.range(0.35, 0.62),          // where i/j dots sit above x-height
    dotSize: r.range(0.9, 1.35),
  };
  h.capWidth = script ? h.width * r.range(0.92, 1.06) : r.range(0.78, 0.98);
  h.noise = makeNoise('hand:' + seed);
  return h;
}

// Effective params = hand + overrides from the UI.
export function withOverrides(hand, o) {
  const p = Object.assign(Object.create(null), hand);
  if (o) for (const k in o) if (o[k] !== undefined && o[k] !== null) p[k] = o[k];
  return p;
}

export const HAND_PARAMS = [
  { key: 'neatness', label: 'Neatness', group: 'Hand', min: 0, max: 1, step: 0.01, format: 'pct' },
  { key: 'slant', label: 'Slant', group: 'Hand', min: -15, max: 30, step: 0.5, format: 'deg' },
];

// ---------- glyph geometry ----------
export const CAP = 700;            // cap height in font units (UPM 1000)
export const UPM = 1000;

export const isLower = (ch) => ch >= 'a' && ch <= 'z';
export const isUpper = (ch) => ch >= 'A' && ch <= 'Z';
export const isDigit = (ch) => ch >= '0' && ch <= '9';
export const has = (p, ch) => styleHas(p.style, ch);

function zoneY(p, y, lower, m) {
  const S = CAP / (m.base - m.cap);
  if (!lower) return (m.base - y) * S;
  const X = m.xHeight, xhT = p.xHeight * CAP, ascT = p.ascender * CAP;
  if (y >= X && y <= m.base) return (m.base - y) / (m.base - X) * xhT;
  if (y < X) return xhT + (X - y) / (X - m.cap) * (ascT - xhT);
  const descT = p.descender * CAP * m.descRatio;
  return -(y - m.base) / (m.descender - m.base) * descT;
}

// centripetal Catmull-Rom through pts, resampled at ~`step` units
function catmull(pts, step) {
  const n = pts.length;
  if (n < 2) return pts.slice();
  if (n === 2) return lineSample(pts[0], pts[1], step, true);
  const ext = [
    [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]],
    ...pts,
    [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]],
  ];
  const out = [pts[0]];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(1, Math.ceil(d / step));
    const t0 = 0;
    const t1 = t0 + Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 1e-6, 0.5);
    const t2 = t1 + Math.pow(d + 1e-6, 0.5);
    const t3 = t2 + Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) + 1e-6, 0.5);
    for (let j = 1; j <= k; j++) {
      const t = t1 + (t2 - t1) * (j / k);
      const A1 = mix(p0, p1, (t - t0) / (t1 - t0));
      const A2 = mix(p1, p2, (t - t1) / (t2 - t1));
      const A3 = mix(p2, p3, (t - t2) / (t3 - t2));
      const B1 = mix(A1, A2, (t - t0) / (t2 - t0));
      const B2 = mix(A2, A3, (t - t1) / (t3 - t1));
      out.push(mix(B1, B2, (t - t1) / (t2 - t1)));
    }
  }
  return out;
}
function lineSample(a, b, step, includeFirst) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = Math.max(1, Math.ceil(d / step));
  const out = includeFirst ? [a] : [];
  for (let j = 1; j <= k; j++) out.push(mix(a, b, j / k));
  return out;
}
function turnAngle(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (lu < 1e-6 || lv < 1e-6) return 0;
  return Math.acos(clamp((ux * vx + uy * vy) / (lu * lv), -1, 1));
}

// Split a coarse stroke at sharp corners; soften medium corners with a fillet.
// Returns an array of dense polylines.
function smoothStroke(pts, p, step) {
  const q = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = q[q.length - 1], b = pts[i];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5) q.push(b);
  }
  if (q.length < 2) return [q];
  const runs = [];
  let cur = [q[0]];
  const filletR = lerp(0, 46, p.roundness);
  for (let i = 1; i < q.length - 1; i++) {
    const ang = turnAngle(q[i - 1], q[i], q[i + 1]) / DEG;
    if (ang > 118 || (ang > 48 && filletR < 8)) {
      cur.push(q[i]); runs.push(cur); cur = [q[i]];             // hard corner: new pen segment
    } else if (ang > 48) {
      const a = q[i - 1], b = q[i], c = q[i + 1];
      const lin = Math.hypot(b[0] - a[0], b[1] - a[1]), lout = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const r = Math.min(filletR * (ang / 90), lin * 0.42, lout * 0.42);
      cur.push(mix(b, a, r / lin), mix(b, c, r / lout));          // rounded corner
    } else cur.push(q[i]);
  }
  cur.push(q[q.length - 1]);
  runs.push(cur);
  return runs.map((run) => catmull(run, step));
}

// Build the skeleton (in font units) for one glyph instance.
function glyphSkeleton(p, ch, inst, ctx) {
  const st = getStyle(p.style);
  const g = choose(p, ch, ctx);
  const m = g.metrics || st.metrics;
  const S = CAP / (m.base - m.cap);
  const lower = isLower(ch);
  const letter = lower || isUpper(ch);
  const wScale = lower ? p.width : isUpper(ch) ? p.capWidth : isDigit(ch) ? (p.width + 1) / 2 : 0.5 + p.width / 2;
  const L = g.l;
  const step = 7;
  const strokes = [];
  const dots = [];
  for (const s of g.s) {
    const xs = s.map((v) => v[0]), ys = s.map((v) => v[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    if (Math.max(bw, bh) <= 2.6 * (m.base - m.cap) / 21) { // a dot (i, j, period, colon...)
      let Y = zoneY(p, cy, lower, m);
      if (lower && (ch === 'i' || ch === 'j')) Y = p.xHeight * CAP + (p.ascender - p.xHeight) * CAP * p.dotHeight;
      dots.push([(cx - L) * S * wScale, Y]);
      continue;
    }
    const mapped = s.map((v) => [(v[0] - L) * S * wScale, zoneY(p, v[1], lower, m)]);
    for (const run of smoothStroke(mapped, p, step)) strokes.push(run);
  }
  let advance = (g.r - g.l) * S * wScale + (p.tracking || 0);
  if (ch === ' ' || ch === ' ') advance = p.space;
  else if (!st.connected && (strokes.length || dots.length)) {
    // handwriting sits much tighter than the source's bearings: space by the ink, not the box
    let mn = Infinity, mx = -Infinity;
    for (const s of strokes) for (const q of s) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
    for (const q of dots) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
    const sb = p.sidebearing * (letter || isDigit(ch) ? 1 : 0.7) + p.penWidth * 0.5;
    const dx = sb - mn;
    for (const s of strokes) for (const q of s) q[0] += dx;
    for (const q of dots) q[0] += dx;
    advance = mx - mn + 2 * sb;
  }
  return { strokes, dots, advance, letter, lower, variant: g, connected: !!st.connected };
}

// ---------- instance variation + pen ----------
const charKey = (ch) => ch.charCodeAt(0);

// The writer's habits for secondary marks (i/j dots, t/f bars), fixed per seed ('marks:' namespace).
// human-feel.md §4.4 / rule 7: they land late and to the right, at varying height; the dot shape is a habit.
const DOT_SHAPES = [
  { id: 'dot', weight: 0.45 }, { id: 'dash', weight: 0.25 }, { id: 'arc', weight: 0.13 },
  { id: 'tick', weight: 0.12 }, { id: 'circle', weight: 0.05 },
];
const markCache = new WeakMap();
export function markHabits(p) {
  let h = markCache.get(p);
  if (h) return h;
  const r = rng('marks:' + p.seed);
  const st = getStyle(p.style);
  h = {
    dot: r.weighted(DOT_SHAPES).id,
    late: r.range(0.1, 0.45),                          // x-heights right of the stem
    delayed: r() < (st && st.connected ? 0.92 : 0.55), // dotted / crossed after the word (else right away)
    barAngle: r.range(-2, 7),                          // degrees: t-bars tend to rise
    barLen: r.range(0.85, 1.25),
    shareTT: r() < 0.7,                                // one bar across "tt"
  };
  markCache.set(p, h);
  return h;
}

// a t/f crossbar: a later stroke that is long and flat (skeleton space, before any warp)
function isBar(st, xh) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of st) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  return x1 - x0 >= 0.2 * xh && y1 - y0 <= 0.3 * (x1 - x0);
}

// centerline of an i/j dot in the writer's habitual shape, around c (font units, y up)
function dotShape(shape, c, p, xh, r, jit) {
  const j = (s) => 1 + jit * r.gauss() * s;
  const seg = (L, a, n) => {
    const out = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1) - 0.5; out.push([c[0] + Math.cos(a) * L * t, c[1] + Math.sin(a) * L * t]); }
    return out;
  };
  const arc = (R, a0, a1, cy, n) => {
    const out = [];
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / (n - 1); out.push([c[0] + R * Math.cos(a), c[1] + R * (Math.sin(a) - cy)]); }
    return out;
  };
  switch (shape) {
    case 'dash': return seg(0.16 * xh * j(0.15), (22 + jit * r.gauss() * 8) * DEG, 5);
    case 'tick': return seg(0.11 * xh * j(0.15), (-55 + jit * r.gauss() * 10) * DEG, 4);
    case 'arc': return arc(0.09 * xh * j(0.15), Math.PI * 0.85, Math.PI * 0.15, 0.6, 7);
    case 'circle': return arc(0.055 * xh * j(0.12), Math.PI / 2, Math.PI / 2 + 2 * Math.PI + 0.35, 0, 13);
    default: {
      const a = (jit ? r() : 0.5) * 0.9 + 0.3 + (p.slant || 0) * DEG;
      const len = p.penWidth * 0.35 * p.dotSize;
      return [[c[0] - Math.cos(a) * len / 2, c[1] - Math.sin(a) * len / 2], c, [c[0] + Math.cos(a) * len / 2, c[1] + Math.sin(a) * len / 2]];
    }
  }
}

// inst: null -> canonical hand form; or one specific use of the letter:
//   { seed, amount, baseline?,              (seed = identity of this use, amount = 0..1 variation)
//     slant?, scale?, care?, squeeze?, bar? } (from layout: the word's shared lean in degrees and size,
//                                              the care at this point of the page, a line-end squeeze,
//                                              and 'lead' | 'follow' when a "tt" shares one bar)
// ctx (optional, from layout): neighbours/position, passed to the variant chooser.
// Returns { advance, contours, strokes, variant, pose }:
//   contours = filled outline polygons (font units, y up) in drawing order
//   strokes  = [{ center, contour, dot, mark?, delayed? }], one per contour (strokes[i].contour === contours[i]):
//              the pen path behind each contour, for animation. mark = 'dot' | 'bar' on i/j dots and
//              t/f bars; delayed = true when this writer adds them after the word.
//   pose     = { slant, scale, squeeze }: the lean (degrees) and size this use was drawn at (for QA)
export function makeGlyph(p, ch, inst, ctx) {
  const sk = glyphSkeleton(p, ch, inst, ctx);
  const N = p.noise;
  const messy = 1 - clamp(p.neatness, 0, 1);
  const amt = inst ? (inst.amount == null ? 1 : inst.amount) : 0;
  const ir = inst ? rng('inst:' + p.seed + ':' + inst.seed) : null;
  const k = charKey(ch);
  // per-letter quirk offsets (fixed for this hand + letter)
  const qox = k * 3.71 + 11.3, qoy = k * 5.13 + 47.9;
  const qA = p.quirk * (0.55 + 0.75 * messy), qS = p.quirkScale;

  // ----- per-instance variation: this one use of the letter -----
  // Layout passes what the whole word shares (lean, size) and the care at this point of the page; the
  // letter itself varies only a little around that (human-feel.md rule 2). Care = Neatness (rule 16).
  const xh = p.xHeight * CAP;
  const care = inst && inst.care != null ? clamp(inst.care, 0, 1) : 1 - messy;
  const loose = 1 - care;
  const wordSlant = (inst && inst.slant) || 0;
  const scale = (inst && inst.scale) || 1;
  const squeeze = (inst && inst.squeeze) || 1;
  const cxG = sk.advance / 2, cyG = (sk.lower ? p.xHeight : 0.5) * CAP / 2;
  let iox = 0, ioy = 0, iA = 0, rot = 0, sx = 1, sy = 1, dy = 0, sh = 0;
  if (ir) {
    iox = ir() * 200; ioy = ir() * 200 + 300;
    // shape varies freely from use to use; the lean only a little (the word carries most of it)
    const vs = amt * (0.3 + 1.0 * loose), v = amt * (0.2 + 0.9 * loose);
    iA = 16 * vs;
    rot = ir.gauss() * 0.7 * v * DEG;
    sx = 1 + ir.gauss() * 0.035 * vs;
    sy = 1 + ir.gauss() * 0.055 * vs;
    sh = ir.gauss() * 1.1 * v * DEG;
    dy = inst.baseline ? ir.gauss() * 7 * v : 0;
    // legibility guard (rule 23): this use's deformation stays within ~6% of the x-height (RMS)...
    let n = 0, vx = 0, vy = 0;
    for (const st of sk.strokes) for (let i = 0; i < st.length; i += 3) { const X = st[i][0] - cxG, Y = st[i][1] - cyG; vx += X * X; vy += Y * Y; n++; }
    const rx = Math.sqrt(vx / (n || 1)), ry = Math.sqrt(vy / (n || 1));
    const dev = Math.hypot(0.7 * iA, rot * Math.hypot(rx, ry), (sx - 1) * rx, (sy - 1) * ry, Math.tan(sh) * ry);
    if (dev > 0.06 * xh) { const f = 0.06 * xh / dev; iA *= f; rot *= f; sh *= f; sx = 1 + (sx - 1) * f; sy = 1 + (sy - 1) * f; }
    // ...and its lean stays within ±8° of the writer's slant
    const lean = wordSlant + (sh - rot) / DEG;
    if (Math.abs(lean) > 8) sh -= (lean - Math.sign(lean) * 8) * DEG;
  }
  function displace(x, y) {
    let dx = qA * N.n2(x / qS + qox, y / qS + qoy);
    let dyv = qA * N.n2(x / qS + qox + 71.7, y / qS + qoy + 13.1);
    if (iA) {
      // this use's own warp: it changes widths and bulges more than lean (the word carries the lean),
      // and it barely moves the bottoms of letters, which sit on the line
      dx += iA * N.n2(x / 420 + iox, y / 680 + ioy);
      dyv += iA * N.n2(x / 420 + iox + 33.3, y / 420 + ioy + 91.7) * (0.4 + 0.6 * smooth(Math.abs(y) / (0.5 * xh)));
    }
    // instance affine: lean and width about the glyph centre, height from the baseline, a slight turn
    let X = x + dx - cxG, Y = y + dyv;
    X = X * sx + (Y - cyG) * Math.tan(sh); Y = Y * sy - cyG;
    const c = Math.cos(rot), s = Math.sin(rot);
    return [c * X - s * Y + cxG, s * X + c * Y + cyG + dy];
  }
  // connected styles: letters must keep their entry/exit points so joins still meet
  const pin = sk.connected && sk.letter;
  let entry = null, exit = null;
  if (pin) {
    for (const st of sk.strokes) for (const q of st) {
      if (!entry || q[0] < entry[0]) entry = q;
      if (!exit || q[0] > exit[0]) exit = q;
    }
  }
  let dEntry = [0, 0], dExit = [0, 0], dMean = [0, 0];
  if (pin && entry) {
    const a = displace(entry[0], entry[1]), b = displace(exit[0], exit[1]);
    dEntry = [a[0] - entry[0], a[1] - entry[1]]; dExit = [b[0] - exit[0], b[1] - exit[1]];
  } else {
    // keep the glyph centred in its advance (no drift out of the box)
    let n = 0;
    for (const st of sk.strokes) for (let i = 0; i < st.length; i += 4) {
      const d = displace(st[i][0], st[i][1]); dMean[0] += d[0] - st[i][0]; n++;
    }
    if (n) dMean[0] /= n;
  }
  function warp(q) {
    const d = displace(q[0], q[1]);
    let ox = d[0] - q[0], oy = d[1] - q[1];
    if (pin && entry) {
      const t = clamp((q[0] - entry[0]) / Math.max(1, exit[0] - entry[0]), 0, 1);
      ox -= lerp(dEntry[0], dExit[0], t); oy -= lerp(dEntry[1], dExit[1], t);
      // keep a little instance offset on the baseline itself
      oy += inst && inst.baseline ? dy : 0;
    } else ox -= dMean[0];
    return [q[0] + ox, q[1] + oy];
  }

  // last steps for every point: the writer's slant plus the word's lean, then the word's size
  const tanSlant = Math.tan(((p.slant || 0) + wordSlant) * DEG);
  const finish = (q) => [(q[0] + q[1] * tanSlant) * scale * squeeze, q[1] * scale];
  // slow drift only: wobble wavelength >= 0.5 x-height, amplitude 0.3–1.2% of it (rule 8)
  const tremorA = xh * Math.min(0.012, (0.003 + 0.009 * loose) * (p.tremor || 1.5) / 1.5);
  const tremorL = 0.7 * xh;
  const hab = markHabits(p);
  const barLetter = ch === 't' || ch === 'f';
  const contours = [];
  const strokes = [];
  const strokeSeedBase = (inst ? (ir() * 1000) : 0) + k * 17.3;
  sk.strokes.forEach((st, si) => {
    const bar = barLetter && si > 0 && isBar(st, xh);
    if (bar && inst && inst.bar === 'follow') return; // "tt": the first t's bar crosses both
    let pts;
    if (bar) {
      // t/f bars: added late, landing to the right at a varying height and angle (rule 7)
      const mr = rng('mark:' + p.seed + ':' + k + ':' + si + ':' + (inst ? inst.seed : 'canon'));
      const jit = inst ? 1 : 0, spread = 0.4 + loose;
      pts = st.map(warp);
      let x0 = Infinity, x1 = -Infinity;
      for (const q of pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; }
      if (inst && inst.bar === 'lead') { const W = Math.max(1, x1 - x0), f = (W + sk.advance) / W; pts = pts.map((q) => [x0 + (q[0] - x0) * f, q[1]]); x1 = x0 + (x1 - x0) * f; }
      let my = 0;
      for (const q of pts) my += q[1];
      const mx = (x0 + x1) / 2; my /= pts.length;
      const a = (hab.barAngle + jit * mr.gauss() * 3 * spread) * DEG;
      const L = hab.barLen * (1 + jit * mr.gauss() * 0.08 * spread);
      let shift = (hab.delayed ? 1 : 0.4) * hab.late * xh * (0.6 + 0.8 * loose) * (inst ? 1 : 0.6) + jit * mr.gauss() * 0.08 * xh * spread;
      const lift = jit * clamp(mr.gauss() * 0.06 * xh * spread, -0.15 * xh, 0.15 * xh);
      // ...but it still crosses its stem, with some bar on each side, or the t stops reading as a t
      let stemX = null, near = Infinity;
      sk.strokes.forEach((o, oi) => {
        if (oi === si) return;
        for (let i = 0; i < o.length; i += 2) { const q = warp(o[i]), d = Math.abs(q[1] - (my + lift)); if (d < near) { near = d; stemX = q[0]; } }
      });
      if (stemX != null) {
        const half = L * (x1 - x0) / 2;
        shift = clamp(shift, stemX - mx - 0.7 * half, stemX - mx + 0.7 * half);
      }
      const ca = Math.cos(a), sa = Math.sin(a);
      pts = pts.map((q) => {
        const X = (q[0] - mx) * L, Y = q[1] - my;
        return [mx + shift + ca * X - sa * Y, my + lift + sa * X + ca * Y];
      });
    } else {
      let off = [0, 0];
      if (si > 0) {
        const sr = rng('stroke:' + p.seed + ':' + k + ':' + si + ':' + (inst ? inst.seed : 'canon'));
        const m = p.strokeShift * (4 + 14 * loose) * (inst ? 0.6 + 0.6 * amt : 0.7);
        off = [sr.gauss() * m, sr.gauss() * m * 0.6];
      }
      pts = st.map((q) => { const w = warp(q); return [w[0] + off[0], w[1] + off[1]]; });
    }
    // a stroke is a single gesture: it bows gently (one arc), plus a faint, slow drift.
    if (pts.length > 2) {
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const br = rng('bow:' + p.seed + ':' + k + ':' + si + ':' + (inst ? inst.seed : 'canon'));
      const bow = br.gauss() * Math.min(1, total / 500) * (3 + 9 * loose) * (inst ? 1 : 0.5);
      let s = 0; const o = strokeSeedBase + si * 9.7;
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const m = bow * Math.sin(Math.PI * s / total) + tremorA * N.n1(s / tremorL + o);
        out.push([pts[i][0] - ty * m, pts[i][1] + tx * m]);
      }
      pts = out;
    }
    pts = pts.map(finish);
    const c = penOutline(p, pts, strokeSeedBase + si * 3.1);
    if (!c) return;
    contours.push(c);
    strokes.push(bar ? { center: pts, contour: c, dot: false, mark: 'bar', delayed: hab.delayed } : { center: pts, contour: c, dot: false });
  });
  const ij = sk.lower && (ch === 'i' || ch === 'j');
  for (const [di, d] of sk.dots.entries()) {
    const q = warp(d);
    let pts;
    if (ij) {
      // i/j dots: late, to the right, at a varying height, in the writer's habitual shape (rule 7)
      const mr = rng('mark:' + p.seed + ':' + k + ':d' + di + ':' + (inst ? inst.seed : 'canon'));
      const jit = inst ? 1 : 0, spread = 0.4 + loose;
      // (never over a following comma or period, where it would change the punctuation)
      const reach = ctx && ctx.next && !/\p{L}/u.test(ctx.next) ? 0.12 : 0.5;
      const shift = clamp((hab.delayed ? 1 : 0.4) * hab.late * xh * (0.6 + 0.8 * loose) * (inst ? 1 : 0.6) + jit * mr.gauss() * 0.1 * xh * spread, -0.15 * xh, reach * xh);
      const lift = jit * clamp(mr.gauss() * 0.07 * xh * spread, -0.15 * xh, 0.15 * xh);
      pts = dotShape(hab.dot, [q[0] + shift, q[1] + lift], p, xh, mr, jit).map(finish);
    } else {
      pts = dotShape('dot', q, p, xh, ir, ir ? 1 : 0).map(finish);
    }
    const round = !ij || hab.dot === 'dot';
    const c = penOutline(p, pts, 900 + di, round ? { dot: true } : undefined);
    if (!c) continue;
    contours.push(c);
    strokes.push(ij ? { center: pts, contour: c, dot: true, mark: 'dot', delayed: hab.delayed } : { center: pts, contour: c, dot: true });
  }
  return {
    advance: sk.advance * scale * squeeze, contours, strokes, variant: sk.variant,
    pose: { slant: (p.slant || 0) + wordSlant + (sh - rot) / DEG, scale, squeeze },
  };
}
