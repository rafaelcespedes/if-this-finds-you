// pen.js — pen models and inks: sweep a pen along a centerline into a filled outline, and say how
// its ink lies on paper.
//
// A pen turns one centerline into a *profile*: the same points with a width and an ink density at
// each one, plus how the stroke starts and ends. The outline (for SVG and the font) is the profile's
// ribbon; the canvas renderer (render-canvas.js) draws the profile itself as a density field.
//
//   PENS[key] = { label, kind, shape: 'disc' | 'nib', ... numbers that tune it }
//   penOutline(p, pts, seedOff, opt) -> closed polygon (font units, y up) with polygon.ink = profile
//   getPen(p) -> the pen this hand writes with ('auto' = the hand's own pen, chosen from its seed)
//   inkModel(p, override?) -> { key, label, rgb, k, fade }  (Beer–Lambert absorption per channel)
//   inkWalker(p) -> (stroke) => { mul, wet, starve }  ink supply along the text (dip pens run dry)
//
// Research behind the numbers: docs/research/human-feel.md §3 and rules 3, 4, 6, 18, 19, 20.
// Deterministic: every random choice comes from rng() with a 'pen:' / 'ink:' / 'dip:' namespace.

import { rng, clamp, lerp, smooth, DEG } from './core.js';
import { kinematics } from './kinematics.js';

const CAP_U = 700; // cap height in font units (= hand.js CAP; not imported, to avoid an import cycle)

// ---------------------------------------------------------------------------------------------
// Inks
// ---------------------------------------------------------------------------------------------
// Swatches are sRGB at ink density 1 on the reference paper below (human-feel.md §3.2). Colour on
// any paper is Beer–Lambert per channel in linear light:  colour = paper · (F + (1−F)·exp(−k·d)),
// where k comes from the swatch and F is a small floor (surface sheen), so even a deep pool of
// black never reaches #000.
export const PAPER_REF = [246, 243, 236];
export const INK_FLOOR = 0.006;

export const INKS = {
  'ballpoint-blue': { label: 'Ballpoint blue', rgb: [38, 48, 132], note: 'violet-leaning, methyl/crystal violet dyes' },
  'royal-blue': { label: 'Royal blue', rgb: [45, 82, 180], note: 'washable fountain-pen blue; fades with age' },
  'blue-black': { label: 'Blue-black', rgb: [35, 50, 80] },
  'iron-gall': { label: 'Iron gall', rgb: [42, 46, 66], ripe: [31, 30, 34], aged: [112, 84, 54], note: 'goes on blue-grey, darkens, browns with age' },
  'sepia': { label: 'Sepia', rgb: [98, 66, 40], note: 'real sepia ink is browner than the #704214 colour name' },
  'black': { label: 'Black', rgb: [38, 38, 46], note: 'never #000' },
  'red': { label: 'Red', rgb: [176, 36, 42] },
  'green': { label: 'Green', rgb: [30, 104, 70] },
  'graphite': { label: 'Graphite (HB)', rgb: [82, 82, 88] },
};

export const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const linToSrgb = (v) => { v = clamp(v, 0, 1); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };

// per-channel absorption k (linear light) so that density 1 on `paper` gives `rgb`
export function absorption(rgb, paper = PAPER_REF) {
  return [0, 1, 2].map((i) => {
    const ratio = srgbToLin(rgb[i]) / Math.max(1e-4, srgbToLin(paper[i]));
    const e = (ratio - INK_FLOOR) / (1 - INK_FLOOR);
    return e >= 1 ? 0 : -Math.log(Math.max(1e-5, e));
  });
}

export function parseColor(c) {
  if (Array.isArray(c) && c.length >= 3) return c.slice(0, 3).map((v) => clamp(Math.round(+v), 0, 255));
  if (typeof c !== 'string') return null;
  let m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^#?([0-9a-f]{3})$/i.exec(c.trim());
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16));
  m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c.trim());
  if (m) return [+m[1], +m[2], +m[3]].map((v) => clamp(v, 0, 255));
  return null;
}

const mixRGB = (a, b, t) => [0, 1, 2].map((i) => lerp(a[i], b[i], t));
const inkCache = new Map();

// The ink this hand writes with. `override` (optional) beats p.ink: a swatch key, '#rrggbb', or [r,g,b].
// Returns null for things Beer–Lambert can't use (e.g. a CSS variable); renderers then fall back to a flat fill.
export function inkModel(p, override) {
  const want = override != null && override !== '' && override !== 'auto' ? override : (p.ink && p.ink !== 'auto' ? p.ink : handInk(p));
  const age = clamp(+p.inkAge || 0, 0, 1);
  const id = (Array.isArray(want) ? want.join(',') : String(want)) + '|' + age.toFixed(3);
  if (inkCache.has(id)) return inkCache.get(id);
  let key = typeof want === 'string' && INKS[want] ? want : null;
  let rgb = key ? INKS[key].rgb : parseColor(want);
  if (!rgb) return null;
  let fade = 1 - 0.22 * age;
  if (key === 'iron-gall') {
    const sw = INKS[key];
    rgb = age < 0.3 ? mixRGB(sw.rgb, sw.ripe, smooth(age / 0.3)) : mixRGB(sw.ripe, sw.aged, smooth((age - 0.3) / 0.7));
    fade = 1 - 0.12 * Math.max(0, age - 0.3);
  } else if (key === 'royal-blue') fade = 1 - 0.45 * age;
  let k = absorption(rgb);
  if (key !== 'iron-gall' && age > 0) { // old dye inks lose saturation as well as strength
    const m = (k[0] + k[1] + k[2]) / 3;
    k = k.map((v) => lerp(v, m, 0.3 * age));
  }
  const model = { key: key || 'custom', label: key ? INKS[key].label : 'Custom', rgb: rgb.map(Math.round), k, fade, floor: INK_FLOOR };
  inkCache.set(id, model);
  return model;
}

// Colour of ink density d over `paper` (sRGB triplet), for flat renderers (SVG).
export function inkRGB(model, d, paper = PAPER_REF) {
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const T = INK_FLOOR + (1 - INK_FLOOR) * Math.exp(-model.k[i] * d * model.fade);
    out[i] = linToSrgb(srgbToLin(paper[i]) * T);
  }
  return out;
}
export const rgbHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------------------------------------
// Pens
// ---------------------------------------------------------------------------------------------
// kind codes are shared with render-canvas.js shaders
export const PEN_KIND = { classic: 0, ballpoint: 1, gel: 2, fountain: 3, pointed: 4, italic: 5, felt: 6, pencil: 7 };

// Numbers: wScale = nominal width / p.penWidth; gamma = density ∝ slowness^gamma; down/up = density
// change on down/up strokes; pool = extra density where the pen rests; hook/blob = share of starts;
// blunt = how often a downward stop stays full-width; cv = slow density noise; rough = max edge
// roughening in CSS px (renderers also cap it at 10% of the stroke width); bleed = felt spread, px.
const SPECS = {
  ballpoint: {
    label: 'Ballpoint', shape: 'disc', wScale: 0.5, minW: 0.5, gamma: 0.14, down: 0.12, up: 0.06, pool: 0.12,
    hook: 0.42, blob: 0.04, blunt: 0.7, cv: 0.07, goop: 0.07, skip: 0.32, drift: 0.05, rough: 0.12, bleed: 0,
    inks: [['ballpoint-blue', 50], ['black', 38], ['blue-black', 5], ['red', 4], ['green', 3]],
  },
  gel: {
    label: 'Gel pen', shape: 'disc', wScale: 0.78, minW: 0.6, gamma: 0.2, down: 0.12, up: 0.06, pool: 0.3,
    hook: 0.38, blob: 0.12, blunt: 0.8, cv: 0.05, goop: 0.02, skip: 0.05, drift: 0.03, rough: 0.1, bleed: 0,
    inks: [['black', 45], ['blue-black', 25], ['royal-blue', 20], ['red', 5], ['green', 5]],
  },
  fountain: {
    label: 'Fountain pen', shape: 'disc', wScale: 0.86, minW: 0.62, gamma: 0.3, down: 0.24, up: 0.12, pool: 0.32,
    hook: 0.4, blob: 0.18, blunt: 1, cv: 0.1, goop: 0, skip: 0, drift: 0.06, rough: 0.22, bleed: 0,
    inks: [['blue-black', 32], ['royal-blue', 30], ['black', 22], ['sepia', 8], ['iron-gall', 6], ['green', 2]],
  },
  pointed: {
    label: 'Dip pen (pointed)', shape: 'disc', wScale: 1, minW: 0.15, gamma: 0.32, down: 0.26, up: 0.14, pool: 0.4,
    hook: 0.32, blob: 0.16, blunt: 0.8, cv: 0.06, goop: 0, skip: 0, drift: 0.04, rough: 0.16, bleed: 0,
    inks: [['black', 40], ['iron-gall', 30], ['sepia', 20], ['blue-black', 10]],
  },
  italic: {
    label: 'Broad / italic nib', shape: 'nib', wScale: 1.3, minW: 0.12, gamma: 0.3, down: 0.14, up: 0.08, pool: 0.26,
    hook: 0.1, blob: 0.1, blunt: 1, cv: 0.08, goop: 0, skip: 0, drift: 0.05, rough: 0.18, bleed: 0,
    inks: [['black', 50], ['sepia', 18], ['blue-black', 17], ['iron-gall', 10], ['red', 5]],
  },
  felt: {
    label: 'Felt-tip / marker', shape: 'disc', wScale: 1.05, minW: 0.8, gamma: 0.22, down: 0.08, up: 0.04, pool: 0.16,
    hook: 0.3, blob: 0.08, blunt: 1.2, cv: 0.06, goop: 0, skip: 0, drift: 0.04, rough: 0.22, bleed: 0.5,
    inks: [['black', 60], ['blue-black', 15], ['royal-blue', 12], ['red', 8], ['green', 5]],
  },
  pencil: {
    label: 'Pencil', shape: 'disc', wScale: 0.72, minW: 0.6, gamma: 0.05, down: 0.32, up: 0.18, pool: 0,
    hook: 0.34, blob: 0, blunt: 0.6, cv: 0.1, goop: 0, skip: 0, drift: 0.1, rough: 0.3, bleed: 0,
    inks: [['graphite', 1]],
  },
};

// weights for the hand's own pen, by style (people write print with ballpoints and markers,
// script with fountain and dip pens more often)
const HAND_PENS = {
  print: [['ballpoint', 34], ['gel', 18], ['felt', 13], ['pencil', 12], ['fountain', 12], ['italic', 7], ['pointed', 4]],
  script: [['ballpoint', 28], ['fountain', 26], ['gel', 14], ['pointed', 14], ['pencil', 8], ['felt', 5], ['italic', 5]],
};
const weighted = (r, list) => r.weighted(list.map(([v, weight]) => ({ v, weight }))).v;

// The pen is part of the writer: derived from the seed (not stored by makeHand), so p.pen = 'auto'
// means "this hand's own pen". Any explicit p.pen overrides it.
export function handPen(p) {
  return weighted(rng('pen:' + p.seed), HAND_PENS[p.style] || HAND_PENS.print);
}
export function penKey(p) {
  const k = p.pen;
  return k && k !== 'auto' && PENS[k] ? k : handPen(p);
}
export function handInk(p) {
  const key = penKey(p);
  if (key === 'classic') return '#1c2233';
  return weighted(rng('ink:' + p.seed + ':' + key), SPECS[key].inks);
}

// ---------- the stroke profile ----------
// Unit direction of the stroke near index i, averaged over ~len font units (forward at the end).
function dirAt(pts, i, len) {
  const n = pts.length;
  let j = i, acc = 0;
  if (i === 0) { while (j < n - 1 && acc < len) { acc += Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]); j++; } }
  else { while (j > 0 && acc < len) { acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); j--; } }
  const a = i === 0 ? pts[0] : pts[j], b = i === 0 ? pts[j] : pts[i];
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

// How the pen was moving in the air just before it touched down (right-handed Latin writing):
// above a downstroke it was rising to the right; before a leftward start (c, o, e) it overshot right.
function arrival(t0) {
  let a;
  if (t0[1] < -0.5) a = [0.55, 0.84];
  else if (t0[0] < -0.4) a = [0.97, 0.24];
  else if (t0[1] > 0.5) a = [0.89, -0.45];
  else a = [0.5, -0.87];
  return a;
}

// Prepend an arrival hook: the pen lands at S − a·L still moving along a, then turns into the stroke.
function withHook(pts, a, L) {
  const n = pts.length;
  let j = 1, acc = 0;
  while (j < n - 1 && acc < 0.6 * L) { acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); j++; }
  if (j >= n - 1 && n > 3) j = Math.max(1, Math.floor(n / 3));
  const S = pts[0], P0 = [S[0] - a[0] * L, S[1] - a[1] * L], P2 = pts[j];
  const k = Math.max(4, Math.ceil(1.6 * L / 6));
  const out = [];
  for (let i = 0; i < k; i++) {
    const t = i / k, u = 1 - t;
    out.push([u * u * P0[0] + 2 * u * t * S[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * S[1] + t * t * P2[1]]);
  }
  for (let i = j; i < n; i++) out.push(pts[i]);
  return out;
}

// Append a flying exit: the pen keeps moving along the exit direction as it lifts.
function withTail(pts, t1, L) {
  const E = pts[pts.length - 1];
  const k = Math.max(2, Math.ceil(L / 7));
  const out = pts.slice();
  for (let i = 1; i <= k; i++) out.push([E[0] + t1[0] * L * i / k, E[1] + t1[1] * L * i / k]);
  return out;
}

// keep a point once the path has moved `step` units since the last kept one (always keep the ends)
function thin(pts, step) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= step) { out.push(pts[i]); acc = 0; }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// add amp·gauss((s − s0)/sig) to arr, touching only the points within 3 sigma (s is increasing)
function bump(arr, s, n, s0, sig, amp) {
  if (!(sig > 0) || !amp) return;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < s0 - 3 * sig) lo = m + 1; else hi = m; }
  for (let i = lo; i < n && s[i] <= s0 + 3 * sig; i++) { const q = (s[i] - s0) / sig; arr[i] += amp * Math.exp(-q * q); }
}

// Build the profile for one stroke. Returns null for degenerate input.
//   { pen, kind, shape, n, x, y, tx, ty, w, d, s, t, aux, hair, start, end, dot, len, wMax, nib? }
//   x,y: centerline (font units, y up) incl. hook/tail; w: full width; d: ink density (1 = swatch);
//   s: arclength; t: time 0..1 (from kinematics); aux: pen extra (dip-pen railroading 0..1);
//   hair: 0..1 how hairline-thin this point is (pointed/italic), used when the pen runs dry.
function strokeProfile(p, pts0, seedOff, opt, key) {
  if (!pts0 || pts0.length < 2) return null;
  const spec = SPECS[key];
  const kind = PEN_KIND[key];
  const dot = !!(opt && opt.dot);
  const N = p.noise;
  const xh = (p.xHeight || 0.5) * CAP_U;
  // skeletons arrive every ~7 units; ~0.035 xh is plenty for width and ink and halves the work
  if (!dot && pts0.length > 6) pts0 = thin(pts0, Math.max(9, 0.033 * xh));
  const c = clamp(p.pressure == null ? 0.4 : p.pressure, 0, 1);
  const fluency = 1 - clamp(p.neatness == null ? 0.6 : p.neatness, 0, 1);
  const r = rng('pen:' + p.seed + ':' + key + ':' + Math.round(seedOff * 997));
  const pw = p.penWidth;
  const W = key === 'ballpoint' ? clamp(pw * spec.wScale, 0.075 * xh, 0.12 * xh) : pw * spec.wScale;
  const nibA = (p.nibAngle == null ? 35 : p.nibAngle) * DEG, cosN = Math.cos(nibA), sinN = Math.sin(nibA);

  // ---- how this stroke starts and ends (rule 6: asymmetric, motion-driven ends)
  let pts = pts0, start = 'plain', end = 'soft', hookLen = 0, tailLen = 0;
  if (dot) { start = end = 'dot'; }
  else {
    const t0 = dirAt(pts, 0, 0.06 * xh), t1 = dirAt(pts, pts.length - 1, 0.06 * xh);
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const u = r(), hookP = spec.hook * (0.45 + 0.9 * fluency);
    if (u < hookP && total > 0.25 * xh) {
      const a = arrival(t0);
      if (a[0] * t0[0] + a[1] * t0[1] < 0.3) { start = 'hook'; hookLen = (0.035 + 0.045 * r()) * xh; }
    } else if (u < hookP + spec.blob) start = 'blob';
    const v = r();
    const up = t1[1] > 0.25 || t1[0] > 0.6, down = t1[1] < -0.5;
    const pFly = up ? 0.8 + 0.15 * fluency : down ? 0.2 + 0.35 * fluency : 0.55 + 0.25 * fluency;
    const pBlunt = (down ? 0.15 : up ? 0 : 0.05) * spec.blunt;
    end = v < pFly ? 'fly' : v < pFly + pBlunt ? 'blunt' : 'soft';
    if (start === 'hook') pts = withHook(pts, arrival(t0), hookLen);
    if (end === 'fly') { tailLen = (0.03 + 0.06 * r()) * xh * (0.6 + fluency); pts = withTail(pts, t1, tailLen); }
  }

  const n = pts.length;
  const kin = kinematics(pts, { xh });
  const s = kin.s, S = s[n - 1] || 1;
  const x = new Float64Array(n), y = new Float64Array(n), tx = new Float64Array(n), ty = new Float64Array(n);
  const w = new Float64Array(n), d = new Float64Array(n), t = new Float64Array(n), aux = new Float64Array(n);
  const hair = kind === PEN_KIND.pointed || kind === PEN_KIND.italic ? new Float64Array(n) : null;
  for (let i = 0; i < n; i++) { x[i] = pts[i][0]; y[i] = pts[i][1]; t[i] = kin.duration > 0 ? kin.t[i] / kin.duration : i / (n - 1); }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l;
  }

  // ---- slowness: where the pen dwells, ink builds up (fountain: ink ∝ (v̄/v)^γ)
  const slow = new Float64Array(n);
  const flyFrom = S - tailLen - 0.08 * xh, hookTo = hookLen * 0.45;
  for (let i = 0; i < n; i++) {
    let vn = kin.vn[i];
    if (end === 'fly' && s[i] > flyFrom) vn = Math.max(vn, lerp(1, 1.35, clamp((s[i] - flyFrom) / (S - flyFrom || 1), 0, 1)));
    if (start === 'hook' && s[i] < hookTo) vn = Math.max(vn, 1.1);
    slow[i] = clamp(1 / Math.max(vn, 1e-3), 0.55, 2.2);
  }

  // ---- width and density, per pen
  const seedN = seedOff * 0.37 + 11.3;
  let wMax = W, wHair = W;
  if (kind === PEN_KIND.pointed) {
    // pressure spreads the tines on downstrokes: spindle-shaped swells, hairlines elsewhere
    const press = 0.35 + 0.65 * c;
    wHair = Math.max(5, 0.16 * pw); wMax = pw * (1.15 + 1.25 * press);
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = smooth((-ty[i] - 0.2) / 0.6);
    // pressure builds and releases over ~0.1 xh, never instantly
    const win = 0.1 * xh;
    let j0 = 0, j1 = 0, acc = 0;
    for (let i = 0; i < n; i++) {
      while (j1 < n && s[j1] <= s[i] + win) { acc += raw[j1]; j1++; }
      while (s[j0] < s[i] - win) { acc -= raw[j0]; j0++; }
      const env = smooth(s[i] / (0.12 * xh)) * smooth((S - s[i]) / (0.16 * xh));
      const sw = (acc / Math.max(1, j1 - j0)) * env * press;
      w[i] = wHair + (wMax - wHair) * sw * (1 + 0.15 * (slow[i] - 1));
      hair[i] = 1 - clamp((w[i] - wHair) / (wMax - wHair), 0, 1);
    }
  } else if (kind === PEN_KIND.italic) {
    // broad nib: the mark is as wide as the nib's projection across the direction of travel
    const nx = Math.cos(nibA), ny = Math.sin(nibA), thin = Math.max(4, 0.12 * pw);
    wHair = thin; wMax = W + thin;
    for (let i = 0; i < n; i++) {
      w[i] = W * Math.abs(tx[i] * ny - ty[i] * nx) + thin;
      hair[i] = 1 - clamp((w[i] - thin) / W, 0, 1);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const dn = clamp(-ty[i], 0, 1), sl = slow[i] - 1;
      let f = 1;
      switch (kind) {
        case PEN_KIND.ballpoint: f = (1 + 0.06 * c * dn) * (1 - 0.03 * clamp(-sl, 0, 1)); break;
        case PEN_KIND.gel: f = 1 + 0.07 * clamp(sl, 0, 1.5); break;
        case PEN_KIND.fountain: f = (0.86 + 0.14 * Math.abs(ty[i] * cosN - tx[i] * sinN)) * (1 + 0.04 * clamp(sl, 0, 1.2) + 0.08 * c * dn); break;
        case PEN_KIND.felt: f = 1 + 0.04 * clamp(sl, 0, 1.2); break;
        case PEN_KIND.pencil: f = 0.92 + 0.16 * c * dn; break;
      }
      w[i] = W * f;
    }
  }
  const wv = kind === PEN_KIND.pointed ? 0.6 : kind === PEN_KIND.ballpoint || kind === PEN_KIND.pencil ? 0.15 : 0.35;
  for (let i = 0; i < n; i++) w[i] *= 1 + wv * (p.pressureVar || 0.15) * N.n1(s[i] / 110 + seedOff);

  // density: slowness, down vs up strokes, hand pressure, slow noise along the stroke
  const base = kind === PEN_KIND.pencil ? 0.62 + 0.45 * c : 0.86 + 0.26 * c;
  for (let i = 0; i < n; i++) {
    const dn = clamp(-ty[i], 0, 1), up = clamp(ty[i], 0, 1);
    d[i] = base * Math.pow(slow[i], spec.gamma) * (1 + spec.down * dn - spec.up * up) * (1 + spec.cv * N.n1(s[i] / (0.5 * xh) + seedN));
  }
  if (kind === PEN_KIND.pointed || kind === PEN_KIND.italic) {
    // hairlines carry less ink than swells (thin film), swells pool a little
    for (let i = 0; i < n; i++) d[i] *= 0.82 + 0.3 * (1 - hair[i]);
  }

  // ---- ends
  const xhs = 0.06 * xh;
  const nibScale = kind === PEN_KIND.italic ? aux : null; // broad nib: lifts shrink the nib's mark (aux)
  for (let i = 0; i < n; i++) {
    const a = s[i], b = S - s[i];
    let fw = 1, fd = 1;
    if (start === 'plain') fw *= lerp(lerp(p.taperIn || 0.65, 1, 0.35), 1, smooth(a / xhs));
    else if (start === 'hook') { const h = 1 - smooth((a - hookLen * 0.5) / (hookLen * 0.6)); fw *= 1 - 0.42 * h; fd *= 1 - 0.3 * h; }
    if (end === 'fly') {
      const L = Math.min(S * 0.45, tailLen + (0.12 + 0.2 * fluency) * xh);
      const e = smooth(b / L);
      fw *= lerp(lerp(0.08, 0.2, p.taperOut || 0.5), 1, e); fd *= lerp(0.55, 1, e);
    } else if (end === 'soft') fw *= lerp(0.82, 1, smooth(b / (0.05 * xh)));
    w[i] *= fw; d[i] *= fd;
    if (nibScale) nibScale[i] = fw;
  }
  // pools where the pen rests: wet pens at a blob start and at stops (≈1.3–1.8× the stroke mean)
  if (spec.pool > 0) {
    const w0 = w[0], w1 = w[n - 1];
    if (start === 'blob') bump(d, s, n, 0, 0.55 * w0, spec.pool);
    if (start === 'plain') bump(d, s, n, 0, 0.5 * w0, spec.pool * 0.3);
    if (end === 'blunt') bump(d, s, n, S, 0.55 * w1, spec.pool * 0.75);
    else if (end === 'soft') bump(d, s, n, S, 0.5 * w1, spec.pool * 0.35);
    if (start === 'blob') { const g = new Float64Array(n); bump(g, s, n, 0, 0.45 * w0, 0.1); for (let i = 0; i < n; i++) w[i] *= 1 + g[i]; }
    // cusps (kinematic speed dips) pool too
    for (const k of kin.splits) bump(d, s, n, s[k], 0.5 * w[k], spec.pool * 0.35);
  }

  // ---- ballpoint defects: goops at some sharp turns, skips on fast light upstrokes (rule 18)
  if (spec.goop > 0) {
    const sites = kin.splits.map((k) => s[k] + 0.25 * w[k]);
    if (start === 'plain') sites.push(0.3 * w[0]);
    for (const sg of sites) {
      if (r() >= spec.goop) continue;
      const amp = 0.9 + 0.8 * r(), sig = (0.3 + 0.2 * r()) * W;
      const g = new Float64Array(n);
      bump(g, s, n, sg, sig, 1);
      for (let i = 0; i < n; i++) if (g[i]) { d[i] += amp * g[i]; w[i] *= 1 + 0.22 * g[i]; }
    }
  }
  if (spec.skip > 0 && !dot && r() < spec.skip * (1.15 - c)) {
    let best = -1, bv = 1.12;
    for (let i = 0; i < n; i++) if (ty[i] > 0.15 && kin.vn[i] > bv && s[i] > 0.1 * S && s[i] < 0.9 * S) { bv = kin.vn[i]; best = i; }
    if (best >= 0) {
      const len = (0.05 + 0.15 * r()) * xh, depth = 0.65 + 0.3 * r();
      for (let i = 0; i < n; i++) {
        const q = Math.abs(s[i] - s[best]) / (len / 2);
        d[i] *= 1 - depth * (1 - smooth((q - 0.6) / 0.6));
      }
    }
  }

  // ---- dip pen: railroading where a wide swell moves fast (two dark rails, starved middle)
  if (kind === PEN_KIND.pointed) {
    for (let i = 0; i < n; i++) aux[i] = clamp((1 - hair[i] - 0.4) * 1.8, 0, 1) * clamp((kin.vn[i] - 0.85) * 1.5, 0, 1);
  }

  // ---- dots: a quick dab, round and a little wetter
  if (dot) {
    const dw = (kind === PEN_KIND.pointed ? 0.55 * wMax : kind === PEN_KIND.italic ? 0.7 * W : 1.1 * W) * (p.dotSize || 1);
    for (let i = 0; i < n; i++) { w[i] = dw; d[i] = base * (kind === PEN_KIND.pencil ? 1.1 : 1.25); if (hair) hair[i] = 0; if (nibScale) aux[i] = 0.7; }
  }

  const minW = Math.max(3, spec.minW * pw * 0.12);
  for (let i = 0; i < n; i++) { if (w[i] < minW && start !== 'dot') w[i] = Math.max(w[i], end === 'fly' && s[i] > S - tailLen - 0.1 * xh ? 2 : minW); if (d[i] < 0) d[i] = 0; }

  return {
    pen: key, kind, shape: spec.shape, n, x, y, tx, ty, w, d, s, t, aux, hair,
    start, end, dot, len: S, wMax, wHair, nib: spec.shape === 'nib' ? [Math.cos(nibA) * W, Math.sin(nibA) * W] : null,
  };
}

// ---------- outlines ----------
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
  const steps = r < 6 ? 3 : 8;
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
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      // distance to the chord (or to the point, when the chord has no length)
      const d = L > 1e-9 ? Math.abs((poly[i][0] - ax) * dy - (poly[i][1] - ay) * dx) / L : Math.hypot(poly[i][0] - ax, poly[i][1] - ay);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return poly.filter((_, i) => keep[i]);
}

// Broad nib: the area swept by the nib edge. Where the stroke turns through the nib's own direction
// the simple left/right ribbon would pinch to nothing while a real nib still covers its length, so
// the stroke is cut there into pieces (each a plain ribbon with flat chisel ends), every piece wound
// the same way, and the pieces are chained into one contour by zero-area bridges (nonzero fill).
function nibOutline(pr) {
  const { n, x, y, tx, ty } = pr;
  const ex = pr.nib[0] / 2, ey = pr.nib[1] / 2, el = Math.hypot(ex, ey) || 1;
  const ux = ex / el, uy = ey / el, qx = -uy, qy = ux;
  if (pr.dot) {
    // a broad-nib dot is a short dab across the nib edge: a parallelogram one nib wide.
    // (Swept along its own path it can run parallel to the edge and vanish into a sliver.)
    const m = (n - 1) >> 1, cx = x[m], cy = y[m];
    const h = Math.max(0.35 * el, 0.5 * (pr.w[m] || 0));
    const a = [cx - ex - qx * h, cy - ey - qy * h], b = [cx + ex - qx * h, cy + ey - qy * h];
    const c = [cx + ex + qx * h, cy + ey + qy * h], d = [cx - ex + qx * h, cy - ey + qy * h];
    const loop = [a, b, c, d];
    let area = 0;
    for (let i = 0, j = 3; i < 4; j = i++) area += (loop[j][0] - loop[i][0]) * (loop[j][1] + loop[i][1]);
    return area > 0 ? loop.reverse() : loop;
  }
  const thin = pr.wHair / 2;
  const side = (i) => tx[i] * uy - ty[i] * ux;      // which way the nib edge faces the motion
  const runs = [];
  let i0 = 0, sg = 0;
  for (let i = 0; i < n; i++) {
    const v = side(i);
    if (Math.abs(v) < 0.03) continue;                // moving along the nib: keep the current piece
    const sv = Math.sign(v);
    if (sg && sv !== sg) { runs.push([i0, i, sg]); i0 = i - 1; }
    sg = sv;
  }
  runs.push([i0, n - 1, sg || 1]);
  const out = [];
  let first = null;
  const starts = [];
  for (const [a, b, sgn] of runs) {
    const L = [], R = [];
    for (let i = a; i <= b; i++) {
      const m = pr.aux ? clamp(pr.aux[i], 0, 1) : 1;  // the nib lifting off at a taper
      const tq = clamp((tx[i] * ux + ty[i] * uy) * 4, -1, 1);
      const ox = (ex * m) * sgn + qx * thin * tq * sgn, oy = (ey * m) * sgn + qy * thin * tq * sgn;
      L.push([x[i] + ox, y[i] + oy]); R.push([x[i] - ox, y[i] - oy]);
    }
    let loop = L.concat(R.reverse());
    let area = 0;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) area += (loop[j][0] - loop[i][0]) * (loop[j][1] + loop[i][1]);
    if (area > 0) loop.reverse();                     // clockwise in y-up, like the round-pen ribbons
    if (!first) first = loop[0];
    starts.push(loop[0]);
    for (const q of loop) out.push(q);
    out.push(loop[0]);                                // close this piece, then bridge to the next
  }
  for (let i = starts.length - 2; i >= 0; i--) out.push(starts[i]); // walk the bridges back
  out.pop();                                          // == out[0]; the contour closes itself
  return out;
}

// The outline polygon of a profile. Disc pens: ribbon with round caps. Broad nib: the centerline
// swept by the nib edge (a line at the nib angle), with flat chisel ends.
export function profileOutline(pr) {
  const { n, x, y, tx, ty, w } = pr;
  if (pr.shape === 'nib') return nibOutline(pr);
  const out = [];
  for (let i = 0; i < n; i++) { const h = w[i] / 2; out.push([x[i] - ty[i] * h, y[i] + tx[i] * h]); }
  capArc(out, [x[n - 1], y[n - 1]], [tx[n - 1], ty[n - 1]], w[n - 1] / 2, false);
  for (let i = n - 1; i >= 0; i--) { const h = w[i] / 2; out.push([x[i] + ty[i] * h, y[i] - tx[i] * h]); }
  capArc(out, [x[0], y[0]], [tx[0], ty[0]], w[0] / 2, true);
  return out;
}

// ---------- 'classic': the original spike model (broad nib for print, pointed pen for script) ----------
function classicProfile(p, pts, seedOff, opt) {
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
  const x = new Float64Array(n), y = new Float64Array(n), tx = new Float64Array(n), ty = new Float64Array(n);
  const w = new Float64Array(n), d = new Float64Array(n), s = new Float64Array(n), t = new Float64Array(n);
  const raw = [];
  for (let i = 0; i < n; i++) {
    x[i] = pts[i][0]; y[i] = pts[i][1]; s[i] = len[i]; t[i] = len[i] / total;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let ux = b[0] - a[0], uy = b[1] - a[1]; const tl = Math.hypot(ux, uy) || 1; ux /= tl; uy /= tl;
    tx[i] = ux; ty[i] = uy;
    let f;
    if (isDot) f = 1.15 * p.dotSize;
    else {
      if (script) f = 1 - 0.55 * c + 1.5 * c * Math.max(0, -uy);
      else f = (1 - 0.85 * c) + 0.95 * c * Math.abs(Math.sin(Math.atan2(uy, ux) - nib));
      const sl = len[i];
      const taper = lerp(p.taperIn, 1, smooth(sl / tin)) * lerp(p.taperOut, 1, smooth((total - sl) / tout));
      f *= taper * (1 + p.pressureVar * N.n1(sl / 110 + seedOff));
    }
    raw.push(Math.max(4, p.penWidth * f));
    d[i] = 0.95;
  }
  for (let i = 0; i < n; i++) w[i] = (raw[Math.max(0, i - 2)] + 2 * raw[Math.max(0, i - 1)] + 3 * raw[i] + 2 * raw[Math.min(n - 1, i + 1)] + raw[Math.min(n - 1, i + 2)]) / 9;
  return { pen: 'classic', kind: 0, shape: 'disc', n, x, y, tx, ty, w, d, s, t, aux: new Float64Array(n), hair: null, start: 'plain', end: 'soft', dot: !!isDot, len: total, wMax: p.penWidth * 2, wHair: 4, nib: null };
}

// ---------- registry ----------
function makePen(key, spec) {
  return Object.assign({ key, kind: PEN_KIND[key] }, spec, {
    profile: (p, pts, seedOff, opt) => strokeProfile(p, pts, seedOff, opt, key),
  });
}
export const PENS = {
  auto: { key: 'auto', label: 'The hand’s own pen' },
  ballpoint: makePen('ballpoint', SPECS.ballpoint),
  gel: makePen('gel', SPECS.gel),
  fountain: makePen('fountain', SPECS.fountain),
  pointed: makePen('pointed', SPECS.pointed),
  italic: makePen('italic', SPECS.italic),
  felt: makePen('felt', SPECS.felt),
  pencil: makePen('pencil', SPECS.pencil),
  classic: { key: 'classic', kind: 0, label: 'Classic (first prototype)', shape: 'disc', rough: 0.25, bleed: 0, drift: 0.05, pool: 0, profile: classicProfile },
};

export const getPen = (p) => PENS[penKey(p)];

// Outline polygon for one stroke; the profile rides along as polygon.ink for the canvas renderer.
export function penOutline(p, pts, seedOff, opt) {
  const pr = getPen(p).profile(p, pts, seedOff || 0, opt);
  if (!pr) return null;
  const poly = profileOutline(pr);
  poly.ink = pr;
  return poly;
}

// The profile behind a stroke from makeGlyph (recomputed if the contour didn't carry one).
export function strokeInk(p, stroke) {
  return (stroke.contour && stroke.contour.ink) || getPen(p).profile(p, stroke.center, 0, stroke.dot ? { dot: true } : null);
}

// ---------- ink supply along the text ----------
// Call once per render; then once per stroke, in drawing order:
//   walk({ item, strokeIndex, wordStart, len, width }) -> { mul, wet, starve }
//   mul: density multiplier; wet: extra pool at the stroke start; starve: 0..1 running dry.
// Dip pens drain a reservoir and re-dip every few letters (preferably at a word start); fountain
// pens are wetter on the first stroke after a pause; a cold ballpoint skips in the first words.
export function inkWalker(p) {
  const pen = getPen(p);
  const kind = pen.kind;
  const N = p.noise;
  const xh = (p.xHeight || 0.5) * CAP_U;
  const dr = rng('dip:' + p.seed);
  const capacity = 4 + 4.5 * dr();                 // letters of ink per dip
  let reservoir = 1, threshold = 0.12 + 0.18 * dr(), words = 0, fresh = true;
  const letterInk = 1.25 * xh * p.penWidth;
  return function walk(q) {
    const it = q.item || {};
    if (q.wordStart && q.strokeIndex === 0) words++;
    let mul = 1 + (pen.drift || 0) * N.n1((it.inkIndex || 0) * 0.23 + 50), wet = 0, starve = 0;
    if (kind === PEN_KIND.pointed) {
      if (q.strokeIndex === 0 && ((q.wordStart && reservoir < threshold) || reservoir < 0.03)) {
        reservoir = 1; fresh = true; threshold = 0.12 + 0.18 * dr();
      }
      if (fresh) { wet = 0.9; fresh = false; }
      mul *= 0.64 + 0.6 * Math.pow(reservoir, 0.6);
      starve = smooth((0.4 - reservoir) / 0.38);
      reservoir = Math.max(0, reservoir - (q.len || 0) * (q.width || p.penWidth) / (letterInk * capacity));
    } else if (kind === PEN_KIND.fountain || kind === PEN_KIND.italic) {
      if (q.wordStart && q.strokeIndex === 0) { wet = 0.35; mul *= 1.05; }
    } else if (kind === PEN_KIND.gel || kind === PEN_KIND.felt) {
      if (q.wordStart && q.strokeIndex === 0) wet = 0.15;
    } else if (kind === PEN_KIND.ballpoint) {
      if (words <= 2) starve = 0.35;               // a cold ball skips for the first words
    }
    return { mul, wet, starve };
  };
}

// ---------- user-facing controls ----------
export const PEN_PARAMS = [
  { key: 'pen', label: 'Pen', group: 'Pen', type: 'select', default: 'auto', options: () => Object.entries(PENS).map(([v, d]) => ({ value: v, label: d.label })) },
  { key: 'penWidth', label: 'Pen width', group: 'Pen', min: 14, max: 110, step: 1, format: 'int' },
  { key: 'pressure', label: 'Pressure', group: 'Pen', min: 0, max: 1, step: 0.01, format: 'pct' },
];
export const INK_PARAMS = [
  { key: 'ink', label: 'Ink', group: 'Ink', type: 'select', default: 'auto', options: () => [{ value: 'auto', label: 'The hand’s own ink' }, ...Object.entries(INKS).map(([v, d]) => ({ value: v, label: d.label }))] },
  { key: 'inkAge', label: 'Ink age', group: 'Ink', min: 0, max: 1, step: 0.01, format: 'pct', default: 0 },
];
