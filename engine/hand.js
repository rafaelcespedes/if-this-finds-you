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
import { choose, transform, getStyle, has as styleHas, stylesInFamily, styleNames, families, isHistorical, makeHabits, pickSchooling, getSchooling, schoolingNames } from './glyphs.js';
import { penOutline, handSize } from './pen.js';

// ---------- the "writer": one consistent set of parameters per seed ----------
// Other modules add seeded traits to every hand (e.g. style dimensions): fn(h) -> { key: value, ... }.
// fn must be deterministic from h (seed, style, existing traits) and use its own rng namespace.
// They run last in makeHand, so they see the tradition, archetype, traits and letters.
const HAND_TRAITS = [];
export function addHandTraits(fn) { HAND_TRAITS.push(fn); }

//
// A writer is built in the order real handwriting is (docs/research/hand-traditions.md "Summary"):
//   1. tradition: a style within the requested family (print / script), i.e. the copybook they learned from
//   2. archetype: what kind of writer (fonts-study.md §6), which sets the centre of their traits
//   3. correlated traits: a fast writer is more slanted, wider and sloppier (controls-and-feel.md §5.2)
//   4. letters: schooling bundle + personal quirks + context forms (glyphs.js makeHabits)
//   5. small independent personal noise
// Seeds: 'maple-river-42' is one writer; 'maple-river-42~3' is a sibling of it (same schooling, archetype
// and most letters, nearby traits), which is what the sampler's Sibling variety hands out.

export const baseSeed = (seed) => String(seed).split('~')[0];
const isSibling = (seed) => String(seed).includes('~');

// Twelve archetypes (fonts-study.md §6). mu: centre of the latent traits in σ units; drift-free defaults elsewhere.
//   hurry: speed; neat: care; xh: x-height (proportion); slant; width; weight: pen weight; round: roundness
export const ARCHETYPES = [
  { id: 'friend', label: 'Letter to a friend', weight: 1.4, mu: { hurry: 0.4, neat: 0, xh: 0, slant: 0.4, width: 0, weight: 0, round: 0.2 } },
  { id: 'thanks', label: 'Thank-you card', weight: 1, mu: { hurry: -0.6, neat: 1.2, xh: 0.6, slant: 0, width: 0.2, weight: 0, round: 0.4 }, also: { tremor: -0.4 } },
  { id: 'architect', label: 'Architect’s notes', weight: 0.8, mu: { hurry: -0.3, neat: 1.4, xh: 1, slant: -1.2, width: 0.9, weight: -0.7, round: -1.3 }, also: { pressure: -0.25, sidebearing: 0.8 } },
  { id: 'field', label: 'Field journal', weight: 1, mu: { hurry: 0.7, neat: -0.8, xh: -1, slant: 0.3, width: -0.5, weight: -0.3, round: 0 }, also: { sidebearing: -0.7, drift: 0.4 } },
  { id: 'whiteboard', label: 'Whiteboard draft', weight: 0.8, mu: { hurry: 0.2, neat: -0.2, xh: 0.4, slant: -0.4, width: 0.7, weight: 1.7, round: 0.3 } },
  { id: 'margin', label: 'Margin notes', weight: 0.9, mu: { hurry: 1, neat: -0.6, xh: 0.6, slant: 0.2, width: 0.3, weight: 0.5, round: 0 } },
  { id: 'postcard', label: 'Postcard', weight: 1, mu: { hurry: 0.3, neat: 0, xh: -0.8, slant: 0.4, width: -1.3, weight: 0, round: 0 }, also: { sidebearing: -0.6 } },
  { id: 'recipe', label: 'Recipe card', weight: 0.9, mu: { hurry: -0.2, neat: 0.2, xh: -0.2, slant: 1.6, width: 0, weight: 0, round: 0.4 }, also: { tremor: 1.2 } },
  { id: 'first', label: 'First letters', weight: 0.6, mu: { hurry: -1.1, neat: -1.3, xh: 1.3, slant: -0.6, width: 0.9, weight: 0.8, round: 0.8 }, also: { pressure: 0.3 } },
  { id: 'italic', label: 'Italic hand', weight: 0.7, mu: { hurry: -0.5, neat: 1.4, xh: -0.2, slant: 0.5, width: -0.7, weight: 0.5, round: -0.9 }, also: { pressure: 0.35 } },
  { id: 'signature', label: 'Signature', weight: 0.6, mu: { hurry: 1.8, neat: -1.3, xh: 0, slant: 1.6, width: 0.9, weight: 0, round: 0 } },
  { id: 'backhand', label: 'Backhand diary', weight: 0.7, mu: { hurry: 0, neat: 0.2, xh: -0.8, slant: -2.4, width: -0.2, weight: -0.4, round: 0.8 }, also: { pressure: -0.15 } },
];
export const archetypeOf = (seed) => rng('archetype:' + baseSeed(seed)).weighted(ARCHETYPES);

// Latent traits, correlated (controls-and-feel.md §5.2): a Gaussian copula through a Cholesky factor.
const LATENT = ['hurry', 'neat', 'xh', 'slant', 'width', 'weight', 'round'];
const RHO = { 'hurry,neat': -0.5, 'hurry,slant': 0.5, 'hurry,width': 0.3, 'hurry,weight': -0.2, 'xh,round': 0.35, 'xh,weight': 0.2, 'slant,round': -0.25 };
const CHOL = (() => {
  const n = LATENT.length, R = LATENT.map((a, i) => LATENT.map((b, j) => (i === j ? 1 : RHO[a + ',' + b] ?? RHO[b + ',' + a] ?? 0)));
  const L = R.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = R[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
  }
  return L;
})();
const SPREAD = 0.8;    // spread within an archetype, in σ
const LIMIT = 2.6;     // hard clip on any latent trait, in σ

// The writer's latent traits (σ units, before mapping to engine params). Pure function of the seed.
// shift: { latent: σ } from the writer's schooling (a French-schooled hand is upright and round).
export function latentOf(seed, shift = {}) {
  const base = baseSeed(seed);
  const arch = archetypeOf(seed);
  const r = rng('latent:' + base);
  let z = LATENT.map(() => r.gauss());
  if (isSibling(seed)) { const rs = rng('sibling:' + seed); z = z.map((v) => v + 0.3 * rs.gauss()); }
  const out = {};
  LATENT.forEach((k, i) => {
    let x = 0;
    for (let j = 0; j <= i; j++) x += CHOL[i][j] * z[j];
    out[k] = clamp(arch.mu[k] + (shift[k] || 0) + SPREAD * x, -LIMIT, LIMIT);
  });
  return out;
}

// Which style (tradition) a writer of this family learned. Historical traditions only when asked for by name.
export function pickStyle(seed, family, opts = {}) {
  const pool = stylesInFamily(family).filter((n) => opts.historical || !isHistorical(n)).map((n) => ({ n, weight: getStyle(n).weight ?? 1 }));
  if (!pool.length) return stylesInFamily(family)[0] || styleNames()[0];
  if (pool.length === 1) return pool[0].n;
  return rng('tradition:' + baseSeed(seed) + ':' + family).weighted(pool).n;
}

// makeHand(seed, styleOrFamily, opts)
//   styleOrFamily: 'print' | 'script' (a family: the writer's tradition is drawn from it), a style name
//   (that exact tradition), or { family?, style?, historical? }. Defaults to the print family.
//   Families are matched before style names, so makeHand(seed, 'print') may pick any print tradition.
export function makeHand(seed, styleOrFamily, opts = {}) {
  let req = typeof styleOrFamily === 'object' && styleOrFamily ? { ...styleOrFamily } : { name: styleOrFamily };
  req = { ...opts, ...req };
  let style;
  if (req.style && getStyle(req.style)) style = req.style;
  else {
    const name = req.family || req.name;
    if (name && families().includes(name)) style = pickStyle(seed, name, req);
    else if (name && getStyle(name)) style = name;
    else style = pickStyle(seed, 'print', req);
  }
  const st = getStyle(style);
  const family = st.family || 'print';
  const script = family === 'script';
  const base = baseSeed(seed);
  const arch = archetypeOf(seed);
  const schooling = pickSchooling(base, style);
  const L = latentOf(seed, (getSchooling(schooling) || {}).traits);
  const also = arch.also || {};
  const r = rng('hand:' + base);                          // personal traits a sibling keeps
  const rs = isSibling(seed) ? rng('hand-sib:' + seed) : r; // ...and nudges
  const nudge = (v, k) => (rs === r ? v : v * (1 + 0.06 * rs.gauss() * k));
  const g = () => r.gauss();
  // S-curves instead of hard clamps, so extreme writers thin out instead of piling up at a limit
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const hurry = sig(-0.3 + 1.05 * L.hurry);
  // x-height and width ranges are calibrated to the skeletons a style was drawn against: Hershey script's are
  // narrow for their cap height, so the joined-hand ranges widen them; every other style so far (Hershey print
  // and the traced copybooks) was drawn against the print ranges, and gets those whatever its family
  // (st.proportions: 'print' | 'script'). Giving a traced joined copybook the script ranges drew it ~1.45x too wide.
  const sr = (st.proportions || 'print') === 'script';
  const xHeight = sr ? clamp(0.48 + 0.058 * L.xh, 0.36, 0.62) : clamp(0.6 + 0.072 * L.xh, 0.42, 0.78);
  const width = sr ? clamp(0.98 + 0.1 * L.width, 0.72, 1.24) : clamp(0.84 + 0.095 * L.width, 0.6, 1.08);
  // stroke width / x-height stays within 0.06-0.22 (legibility, §5.2 step 6)
  const xhU = xHeight * CAP;
  // a traced tradition with its own slant built in (tradition.slant) centres the writer on it; Hershey's styles
  // carry little: print is upright, script already leans about 15°
  const slantCentre = st.tradition && Number.isFinite(st.tradition.slant) ? 0 : script ? 1.5 : 5;
  const penWidth = clamp(56 + 13 * L.weight + 4 * g(), Math.max(16, 0.06 * xhU), Math.min(104, 0.22 * xhU));
  const h = {
    seed: String(seed),
    style,
    family,
    tradition: st.tradition ? st.tradition.name : style,
    archetype: arch.id,
    pen: 'auto', tip: 'auto', ink: 'auto', inkVariation: 0.4, inkAge: 0, // pen & ink controls (pen.js resolves 'auto')
    // --- the exposed controls (UI may override) ---
    neatness: 0.2 + 0.77 * sig(0.35 + 0.95 * L.neat),       // 0 = scrawl, 1 = careful (natural 0.24-0.95; the slider goes lower)
    hurry,                                                  // 0 = calm, 1 = rushed (macro, see care())
    slant: clamp(slantCentre + 6.5 * L.slant, -15, 28),    // degrees, added to the skeleton's own slant
    penWidth,                                               // font units at UPM 1000
    pressure: 0.95 * sig(-0.4 + 1.05 * g() + 2.6 * (also.pressure || 0)), // stroke contrast
    // --- hidden "personality" ---
    nibAngle: r.range(20, 55),                              // degrees (broad-nib model, print)
    xHeight,                                                // fraction of cap height
    ascender: nudge(r.range(0.98, 1.16), 0.3),              // lowercase ascender vs cap height
    descender: nudge(r.range(0.8, 1.2), 0.3),
    width,                                                  // horizontal scale of lowercase
    capWidth: 1,                                            // set below (correlated with width)
    roundness: sig(0.2 + 1.1 * L.round),                     // corner softening
    tracking: 0,
    sidebearing: clamp(44 + 14 * g() + 10 * (also.sidebearing || 0) + 5 * L.hurry, 16, 86), // print: gap each side of the ink
    space: xhU * clamp(0.8 + 0.13 * g() + 0.06 * L.hurry, 0.5, 1.2), // word space (font units), about an x-height
    strokeShift: clamp(1 + 0.22 * g() + 0.2 * L.hurry, 0.45, 1.8), // how loosely separate strokes land (t-bars, i-dots)
    wordSpace: clamp(1.06 + 0.08 * g(), 0.88, 1.25),
    quirk: clamp(33 + 6 * g() - 3 * L.neat, 18, 50),         // amplitude of the fixed per-letter distortion
    quirkScale: r.range(320, 480),                           // wavelength of that distortion (long = no wiggles)
    tremor: clamp(1.4 + 0.45 * g() + 0.8 * (also.tremor || 0), 0.4, 3.2), // fine wobble along strokes
    drift: clamp(0.7 + 0.16 * g() + 0.25 * (also.drift || 0), 0.3, 1.1), // baseline wander
    pressureVar: r.range(0.08, 0.3),
    taperIn: r.range(0.45, 0.85),                            // width multiplier at stroke start
    taperOut: clamp(r.range(0.36, 0.78) - 0.12 * hurry, 0.25, 0.8), // width multiplier at stroke end (fast = flying)
    dotHeight: r.range(0.35, 0.62),                          // where i/j dots sit above x-height
    dotSize: r.range(0.9, 1.35),
  };
  h.capWidth = sr ? h.width * r.range(0.92, 1.06) : clamp(r.range(0.8, 0.98) * (0.86 + 0.16 * h.width / 0.84), 0.66, 1.06);
  h.hurry0 = h.hurry;          // the seed's own pace and care: the Hurry and Neatness sliders act relative to them
  h.neatness0 = h.neatness;
  // letters: schooling, quirks, context forms (siblings share the base seed's letters, and re-roll a few)
  // a second school, mixed in later (glyphs.js blendWith): another schooling, and another tradition of the same
  // family when there is one. About half of writers have none to speak of; the rest anywhere up to 60%.
  const rb = rng('blend:' + base);
  const sch2pool = schoolingNames().filter((n) => n !== schooling).map((n) => ({ n, weight: (getSchooling(n).weight || 1) * ((getSchooling(n).families || [family]).includes(family) ? 1 : 0) }));
  const schooling2 = sch2pool.length ? rb.weighted(sch2pool).n : schooling;
  const others = stylesInFamily(family).filter((n) => n !== style && !isHistorical(n));
  const style2 = others.length && rb() < 0.6 ? others[Math.floor(rb() * others.length)] : style;
  h.blend = rb() < 0.45 ? 0 : +(0.15 + 0.85 * rb()).toFixed(3);   // "Mixed schooling": 0 = one school only
  h.habits = makeHabits(base, style, { hurry: h.hurry, neatness: h.neatness }, { schooling, sibling: isSibling(seed) ? String(seed) : null, second: { style: style2, schooling: schooling2 } });
  h.schooling = schooling;
  h.traditions = traditionsOf(h);
  // page habits (layout.js reads them; own namespace so nothing above moves): loose writers wander more
  const rp = rng('page-traits:' + base);
  h.lineWander = clamp(1 + 0.3 * (0.6 - h.neatness) + 0.15 * rp.gauss(), 0.7, 1.3);
  h.fatigue = clamp(1 + 0.25 * (0.6 - h.neatness) + 0.15 * rp.gauss(), 0.7, 1.3);
  h.noise = makeNoise('hand:' + seed);
  h.size = handSize(h);   // x-height in mm (pen.js; own 'size:' namespace, nothing above moves)
  h.addedTraits = [];
  for (const fn of HAND_TRAITS) { const t = fn(h) || {}; Object.assign(h, t); h.addedTraits.push(...Object.keys(t)); }
  return h;
}

// Where this writer learned, for the UI and the provenance card:
// [{ style, tradition, schooling, label, weight }, ...] (first school first) and a sentence.
export function traditionsOf(p) {
  const H = p.habits || {};
  const w2 = 0.6 * clamp(p.blend == null ? 0 : p.blend, 0, 1);
  const entry = (style, schooling, weight) => {
    const st = getStyle(style), sc = getSchooling(schooling);
    return { style, tradition: st && st.tradition ? st.tradition.name : style, schooling, label: sc ? sc.label : schooling, weight: +weight.toFixed(2) };
  };
  const list = [entry(p.style, p.schooling || H.schooling, 1 - w2)];
  if (H.second && w2 > 0) list.push(entry(H.second.style, H.second.schooling, w2));
  return list;
}
export function describeTraditions(p) {
  const [a, b] = traditionsOf(p);
  // Hershey's styles stand for no school of their own, so the schooling names them; a traced tradition names
  // itself (and its schooling only when the style doesn't fix one)
  const name = (x) => {
    const st = getStyle(x.style);
    if (!st || !st.tradition || x.style === 'print' || x.style === 'script') return x.label;
    return st.tradition.schooling ? x.tradition : `${x.tradition}, ${x.label}`;
  };
  if (!b) return `Schooled in: ${name(a)}.`;
  return `Schooled in: ${name(a)}. Later habits: ${name(b)} (${Math.round(b.weight * 100)}%).`;
}

// How careful the writing is right now: Neatness, lowered by hurrying beyond the writer's own pace.
export const hurryDelta = (p) => (p.hurry == null ? 0 : p.hurry - (p.hurry0 == null ? p.hurry : p.hurry0));
export const care = (p) => clamp((p.neatness == null ? 0.6 : p.neatness) - 0.3 * hurryDelta(p), 0, 1);
// How much less careful than the writer's own habit (negative = more careful). Fatigue and carelessness make
// letters sprawl wider and spacing looser (human-feel.md §4.3), so the sliders move these too.
const careDrop = (p) => (p.neatness0 == null ? 0 : clamp(p.neatness0, 0, 1) - care(p));

// Effective params = hand + overrides from the UI.
export function withOverrides(hand, o) {
  const p = Object.assign(Object.create(null), hand);
  if (o) for (const k in o) if (o[k] !== undefined && o[k] !== null) p[k] = o[k];
  return p;
}

export const HAND_PARAMS = [
  { key: 'neatness', label: 'Neatness', group: 'Hand', min: 0, max: 1, step: 0.01, format: 'pct' },
  { key: 'hurry', label: 'Hurry', group: 'Hand', min: 0, max: 1, step: 0.01, format: 'pct' },
  { key: 'blend', label: 'Mixed schooling', group: 'Hand', min: 0, max: 1, step: 0.01, format: 'pct' },
  { key: 'slant', label: 'Slant', group: 'Hand', min: -15, max: 30, step: 0.5, format: 'deg' },
];

// ---------- glyph geometry ----------
export const CAP = 700;            // cap height in font units (UPM 1000)
export const UPM = 1000;

// Unicode case, so é ß ł Æ get letter proportions (accents session, hook 1)
export const isLower = (ch) => /^\p{Ll}$/u.test(ch);
export const isUpper = (ch) => /^\p{Lu}$/u.test(ch);
export const isDigit = (ch) => ch >= '0' && ch <= '9';
export const has = (p, ch) => styleHas(p.style, ch);

// p: anything with { xHeight, ascender, descender } (the hand, or the hand with one letter's own proportions)
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

// Split a coarse stroke only where the pen reverses (a cusp, > 150°): everywhere else one pen movement keeps
// going, so corners are rounded (by the writer's roundness, more when the writing is loose) instead of cut into
// separately tapered pieces, which left needle spikes (QA report #3). Sharper corners get tighter fillets.
// Returns dense polylines. Pieces of one movement carry run.joinInto (continues into the next piece) and
// run.joinFrom (continues the previous piece): pens should not taper there, and the pieces must not drift apart
// (the names pen.js's { continuesFrom, continuesInto } option and the pens session's makeGlyph wiring use).
function smoothStroke(pts, p, step, messy = 0) {
  const q = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = q[q.length - 1], b = pts[i];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5) q.push(b);
  }
  if (q.length < 2) return [q];
  const runs = [];
  let cur = [q[0]];
  const filletR = lerp(3, 46, clamp(p.roundness, 0, 1)) * (0.85 + 0.5 * messy);
  for (let i = 1; i < q.length - 1; i++) {
    const ang = turnAngle(q[i - 1], q[i], q[i + 1]) / DEG;
    if (ang > 150) {
      cur.push(q[i]); runs.push(cur); cur = [q[i]];             // the pen turns back: new piece, same movement
    } else if (ang > 48) {
      const a = q[i - 1], b = q[i], c = q[i + 1];
      const lin = Math.hypot(b[0] - a[0], b[1] - a[1]), lout = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const k = ang <= 100 ? ang / 90 : 0.15 + 0.95 * (150 - ang) / 50;
      const r = Math.min(filletR * k, lin * 0.42, lout * 0.42);
      cur.push(mix(b, a, r / lin), mix(b, c, r / lout));          // rounded corner
    } else cur.push(q[i]);
  }
  cur.push(q[q.length - 1]);
  runs.push(cur);
  const out = runs.map((run) => catmull(run, step));
  out.forEach((run, i) => { run.joinFrom = i > 0; run.joinInto = i < out.length - 1; });
  return out;
}

// Hershey draws a retraced minim (script n, m, u, i...) as two strokes: one ends on the baseline, the next starts
// back up on it, or just past the end of the first, heading the other way. A pen does that in one movement with
// a cusp, so join them (smoothStroke then splits at the cusp and marks the pieces as continuous).
function retraces(a, b) {
  if (a.length < 2 || b.length < 2) return false;
  const E = a[a.length - 1], P = a[a.length - 2], Q = b[0];
  const dEQ = Math.hypot(Q[0] - E[0], Q[1] - E[1]);
  if (dEQ < 0.3 || dEQ > 5.5) return false;
  const ux = E[0] - P[0], uy = E[1] - P[1], ul = Math.hypot(ux, uy) || 1;
  const vx = b[1][0] - Q[0], vy = b[1][1] - Q[1], vl = Math.hypot(vx, vy) || 1;
  if ((ux * vx + uy * vy) / (ul * vl) > -0.3) return false;      // b must set off back the way a came
  // Q lies on a's last stretch, or just ahead of its end
  const ahead = ((Q[0] - E[0]) * ux + (Q[1] - E[1]) * uy) / ul;
  const side = Math.abs((Q[0] - E[0]) * uy - (Q[1] - E[1]) * ux) / ul;
  if (ahead > 0 && ahead < 3.6 && side < 1.6) return true;
  for (let i = a.length - 1; i > 0; i--) {
    const [x0, y0] = a[i - 1], [x1, y1] = a[i];
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((Q[0] - x0) * dx + (Q[1] - y0) * dy) / L2, 0, 1);
    if (Math.hypot(Q[0] - x0 - t * dx, Q[1] - y0 - t * dy) < 1.05) return true;
    if (Math.hypot(x1 - E[0], y1 - E[1]) > 6) break;
  }
  return false;
}

// A writer's fixed habits of proportion for one letter: this 'a' a little big, that 'k' leaning more.
// Careful writers keep them tiny; loose writers vary a lot (Neatness, human-feel.md rule 16).
function letterQuirk(p, ch, messy) {
  const r = rng('letter:' + p.seed + ':' + ch.normalize('NFD')[0]); // é keeps this writer's e
  const c = (v) => clamp(v, -2.2, 2.2);
  const a = c(r.gauss()), b = c(r.gauss()), d = c(r.gauss());
  return { sy: 1 + a * (0.01 + 0.06 * messy), sx: 1 + b * (0.012 + 0.07 * messy), tan: Math.tan(d * (0.4 + 4.6 * messy) * DEG) };
}

const isApostrophe = (ch) => ch === "'" || ch === '’';
const isLetterCh = (c) => !!c && /\p{L}/u.test(c);

// Build the skeleton (in font units) for one glyph instance.
// Returns { strokes, dots, advance, letter, lower, variant, connected, joins, strokeMarks, dotMarks }; strokes
// are dense polylines in drawing order, with joinFrom / joinInto on the pieces of one pen movement (see
// smoothStroke). strokeMarks[i] / dotMarks[i]: the variant's mark entry ({ kind, role, dot }) for strokes that
// are accents or bars written after the letter (variant.marks, from sources/accents.js), else null.
function glyphSkeleton(p, ch, inst, ctx) {
  const st = getStyle(p.style);
  const g = transform(p, ch, choose(p, ch, ctx), ctx); // the writer's form, then this hand's style dimensions
  const m = g.metrics || st.metrics;
  const S = CAP / (m.base - m.cap);
  const lower = isLower(ch);
  const letter = lower || isUpper(ch);
  const joins = !!st.connected && letter && !(g.tags && g.tags.lift); // joined to its neighbours: keep the box
  const messy = 1 - care(p);
  const hd = hurryDelta(p);
  // the writer's own proportions for this letter (letters and digits; punctuation keeps the style's)
  const lq = letter || isDigit(ch) ? letterQuirk(p, ch, messy) : { sx: 1, sy: 1, tan: 0 };
  const dc = p.neatness0 == null ? 0 : careDrop(p);
  // a letter borrowed from another tradition is written at this hand's proportions (by the two traditions'
  // typical letter widths), not at the lender's: a narrow chancery o doesn't belong in a round Sütterlin hand
  const kStyle = g.borrowedFrom ? Math.pow(styleMedian(p.style) / styleMedian(g.borrowedFrom), 0.85) : 1;
  const wBase = (lower ? p.width : isUpper(ch) ? p.capWidth : isDigit(ch) ? (p.width + 1) / 2 : 0.5 + p.width / 2) * (1 + 0.1 * hd) * (1 + 0.14 * dc) * kStyle;
  const wScale = wBase * (joins ? 1 : lq.sx);
  const zp = lower ? { xHeight: p.xHeight * lq.sy, ascender: p.ascender, descender: p.descender } : p;
  const ys = lower ? 1 : 1 + (lq.sy - 1) * 0.6;            // capitals and digits: scale about the baseline
  // per-letter lean about the middle, and the Hurry slider's extra slant about the baseline (like p.slant)
  const yc = 0.5 * (lower ? p.xHeight : 1) * CAP;
  const hurryTan = Math.tan(8 * hd * DEG);
  const place = (x, y) => [x + (y - yc) * lq.tan + y * hurryTan, y];
  // variant.marks: source strokes that are marks (accents, bars), written after the letter; entries are stroke
  // indices, or { i, kind, dot } objects
  const markOf = new Map((g.marks || []).map((mk) => (typeof mk === 'number' ? [mk, { i: mk }] : [mk.i, mk])));
  // A joined letter keeps its entry and exit exactly where the plain form has them, so joins still meet:
  // its quirks fade out towards both ends (the same pinning makeGlyph uses for per-use variation).
  let pinQ = null;
  if (joins && (lq.sx !== 1 || lq.sy !== 1 || lq.tan)) {
    const plain = (v) => [(v[0] - g.l) * S * wBase + zoneY(p, v[1], lower, m) * hurryTan, zoneY(p, v[1], lower, m)];
    let e0 = null, e1 = null;
    g.s.forEach((s, i) => { if (!markOf.has(i)) for (const v of s) { if (!e0 || v[0] < e0[0]) e0 = v; if (!e1 || v[0] > e1[0]) e1 = v; } });
    const quirky = (v) => { const y = zoneY(zp, v[1], lower, m); return place((v[0] - g.l) * S * wBase * lq.sx, y); };
    const a0 = plain(e0), a1 = plain(e1), b0 = quirky(e0), b1 = quirky(e1);
    pinQ = { x0: a0[0], x1: a1[0], d0: [b0[0] - a0[0], b0[1] - a0[1]], d1: [b1[0] - a1[0], b1[1] - a1[1]], sx: lq.sx };
  }
  const mapPt = (v) => {
    const y = zoneY(zp, v[1], lower, m) * ys;
    if (!pinQ) return place((v[0] - g.l) * S * wScale, y);
    const q = place((v[0] - g.l) * S * wBase * pinQ.sx, y);
    const t = clamp(((v[0] - g.l) * S * wBase - pinQ.x0) / Math.max(1, pinQ.x1 - pinQ.x0), 0, 1);
    return [q[0] - lerp(pinQ.d0[0], pinQ.d1[0], t), q[1] - lerp(pinQ.d0[1], pinQ.d1[1], t)];
  };
  const L = g.l;
  const step = 7;
  const strokes = [];
  const dots = [];
  const loose = !joins && messy > 0 && (letter || isDigit(ch)); // stroke ends land loosely (unjoined letters and digits)
  const strokeMarks = [], dotMarks = [];
  const src = []; // [points, mark]: retraced Hershey minims joined into one movement (never across a mark)
  g.s.forEach((s, i) => {
    const mk = markOf.get(i) || null, prev = src[src.length - 1];
    if (prev && !mk && !prev[1] && retraces(prev[0], s)) prev[0] = prev[0].concat(s); else src.push([s, mk]);
  });
  src.forEach(([s, mk], si) => {
    const xs = s.map((v) => v[0]), ysrc = s.map((v) => v[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ysrc) - Math.min(...ysrc);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ysrc) + Math.min(...ysrc)) / 2;
    if (mk && mk.dot != null ? mk.dot : Math.max(bw, bh) <= 2.6 * (m.base - m.cap) / 21) { // a dot (i, j, period, colon...)
      let Y = zoneY(zp, cy, lower, m) * ys;
      if (lower && !mk && (ch === 'i' || ch === 'j')) Y = p.xHeight * CAP + (p.ascender - p.xHeight) * CAP * p.dotHeight;
      dots.push(pinQ ? [mapPt([cx, cy])[0], Y] : place((cx - L) * S * wScale, Y));
      dotMarks.push(mk);
      return;
    }
    let mapped = s.map(mapPt);
    if (loose && !mk && mapped.length > 1) mapped = loosenEnds(mapped, rng('ends:' + p.seed + ':' + ch + ':' + si), (0.008 + 0.055 * messy) * p.xHeight * CAP);
    for (const run of smoothStroke(mapped, p, step, messy)) { strokes.push(run); strokeMarks.push(mk); }
  });
  let advance = (g.r - g.l) * S * wScale + (p.tracking || 0);
  if (lower && joins && advance > 0) {
    // a joined letter's box must hold its ink, or the next letter lands on top of it (a bug: a reshaped skeleton
    // whose box edges moved past its strokes). Nudge the ink back inside and widen the box to fit.
    if (strokes.length) {
      const xhU = p.xHeight * CAP;
      let mn = Infinity, mx = -Infinity;
      for (const s2 of strokes) for (const q of s2) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
      if (mn < -0.2 * xhU) { const dx = -mn - 0.05 * xhU; for (const s2 of strokes) for (const q of s2) q[0] += dx; for (const q of dots) q[0] += dx; mx += dx; advance += dx; }
      if (advance < mx - 0.1 * xhU) advance = mx - 0.05 * xhU;
    }
  }
  if (ch === ' ' || ch === ' ') advance = p.space;
  else if (st.connected && isApostrophe(ch) && ctx && isLetterCh(ctx.prev) && isLetterCh(ctx.next) && (strokes.length || dots.length)) {
    // inside a joined word (don't, it's) the apostrophe floats over the join instead of breaking it (QA report #6)
    let mn = Infinity, mx = -Infinity;
    for (const s of strokes) for (const q of s) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
    const dx = -(mn + mx) / 2;
    for (const s of strokes) for (const q of s) q[0] += dx;
    for (const q of dots) q[0] += dx;
    advance = 4;
  } else if (!joins && (strokes.length || dots.length)) {
    // handwriting sits much tighter than the source's bearings: space by the ink, not the box. Joined hands do
    // this too for everything that doesn't join (digits, punctuation, printed capitals): QA report #6.
    // Lowercase are spaced by their body: descender tails and flicks tuck under the neighbours, as written,
    // by up to a quarter of an x-height.
    const xhU = p.xHeight * CAP, tuck = lower ? 0.25 * xhU : 0;
    const inBody = lower ? (q) => q[1] > -0.12 * xhU && q[1] < 1.08 * xhU : () => true;
    let mn = Infinity, mx = -Infinity, mnAll = Infinity, mxAll = -Infinity;
    for (const s of strokes) for (const q of s) {
      if (q[0] < mnAll) mnAll = q[0]; if (q[0] > mxAll) mxAll = q[0];
      if (inBody(q)) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
    }
    for (const q of dots) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; if (q[0] < mnAll) mnAll = q[0]; if (q[0] > mxAll) mxAll = q[0]; }
    if (!Number.isFinite(mn)) { mn = mnAll; mx = mxAll; }
    mn = Math.min(mn, mnAll + tuck); mx = Math.max(mx, mxAll - tuck);
    const sb = p.sidebearing * (letter || isDigit(ch) ? 1 : 0.7) * clamp(1 + 0.45 * dc, 0.6, 1.6) + p.penWidth * 0.5;
    const dx = sb - mn;
    for (const s of strokes) for (const q of s) q[0] += dx;
    for (const q of dots) q[0] += dx;
    advance = mx - mn + 2 * sb;
  }
  return { strokes, dots, advance, letter, lower, variant: g, connected: !!st.connected, joins, strokeMarks, dotMarks };
}

// A tradition's typical small-letter advance as a fraction of its cap height (its own drawing, nothing borrowed)
function styleMedian(name) {
  const st = getStyle(name);
  if (!st) return 0.8;
  if (st.widthMedian == null) {
    const m = st.metrics, ws = [];
    for (const ch of 'noua eh c m'.replace(/ /g, '')) {
      const v = (st.glyphs.get(ch) || []).find((x) => x.weight !== 0 && !(x.tags && x.tags.position) && !x.borrowedFrom);
      if (!v) continue;
      const mm = v.metrics || m;
      ws.push((v.r - v.l) / (mm.base - mm.cap) / (ch === 'm' ? 1.5 : 1));
    }
    ws.sort((a, b) => a - b);
    st.widthMedian = ws.length ? ws[Math.floor(ws.length / 2)] : 0.8;
  }
  return st.widthMedian;
}

// The canonical skeleton of ch for this hand (before per-use variation, slant and pen), for tools and tests.
export const skeleton = (p, ch, ctx) => glyphSkeleton(p, ch, null, ctx);

// Loose writing overshoots or stops short of where a stroke should end: a bowl that doesn't quite close,
// a crossbar that runs on. amt: typical size in font units.
function loosenEnds(pts, r, amt) {
  const out = pts.map((q) => q.slice());
  for (const end of [0, 1]) {
    const e = clamp(r.gauss(), -2.2, 2.2) * amt;
    const i = end ? out.length - 1 : 0, j = end ? out.length - 2 : 1;
    const dx = out[i][0] - out[j][0], dy = out[i][1] - out[j][1], d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const k = e > 0 ? e / d : Math.max(e / d, -0.45);
    const q = [out[i][0] + dx * k, out[i][1] + dy * k];
    if (e > 0) { if (end) out.push(q); else out.unshift(q); } else out[i] = q;
  }
  return out;
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
//              the pen path behind each contour, for animation. mark = 'dot' | 'bar' | 'accent' on i/j dots,
//              t/f bars and accent strokes (variant.marks); delayed = true when this writer adds them after the word.
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
    const accent = !bar && !!(sk.strokeMarks && sk.strokeMarks[si]); // accents and other variant.marks
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
        // accents are added late too, landing a little to the right
        if (accent) off[0] += (hab.delayed ? 1 : 0.4) * hab.late * xh * 0.3 * (inst ? 1 : 0.6);
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
    if (bar) strokes.push({ center: pts, contour: c, dot: false, mark: 'bar', delayed: hab.delayed });
    else if (sk.strokeMarks[si]) strokes.push({ center: pts, contour: c, dot: false, mark: 'accent', delayed: hab.delayed });
    else strokes.push({ center: pts, contour: c, dot: false });
  });
  const ij = sk.lower && (ch === 'i' || ch === 'j');
  for (const [di, d] of sk.dots.entries()) {
    const q = warp(d);
    const accent = !!(sk.dotMarks && sk.dotMarks[di]); // e.g. the two dots of an umlaut
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
    } else if (accent) {
      // accent dots land a little loosely too, but stay over their letter
      const mr = rng('mark:' + p.seed + ':' + k + ':d' + di + ':' + (inst ? inst.seed : 'canon'));
      const jit = inst ? 1 : 0;
      const shift = (hab.delayed ? 1 : 0.4) * hab.late * xh * 0.3 * (inst ? 1 : 0.6) + jit * mr.gauss() * 0.04 * xh * (0.4 + loose);
      pts = dotShape('dot', [q[0] + shift, q[1] + jit * mr.gauss() * 0.03 * xh], p, xh, ir, ir ? 1 : 0).map(finish);
    } else {
      pts = dotShape('dot', q, p, xh, ir, ir ? 1 : 0).map(finish);
    }
    const round = !ij || hab.dot === 'dot';
    const c = penOutline(p, pts, 900 + di, round ? { dot: true } : undefined);
    if (!c) continue;
    contours.push(c);
    if (ij) strokes.push({ center: pts, contour: c, dot: true, mark: 'dot', delayed: hab.delayed });
    else if (sk.dotMarks[di]) strokes.push({ center: pts, contour: c, dot: true, mark: 'accent', delayed: hab.delayed });
    else strokes.push({ center: pts, contour: c, dot: true });
  }
  return {
    advance: sk.advance * scale * squeeze, contours, strokes, variant: sk.variant,
    pose: { slant: (p.slant || 0) + wordSlant + (sh - rot) / DEG, scale, squeeze },
  };
}
