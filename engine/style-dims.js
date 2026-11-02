// style-dims.js — style dimensions: continuous, correlated traits of a writer that reshape the *movement*
// of whatever skeleton they write with. Every source (Hershey Script, a traced copybook) has one movement;
// these make each writer move through it differently: how decorative, how joined, how spaced, how pointed.
//
//   loops       ascender and descender loops: retraced stems and hooked tails (−1) … as drawn (0) … big loops (+1)
//   leadIns     word-initial entry strokes: none (−1) … long, sometimes curled (+1)
//   endFlicks   word-final exits: blunt stop (−1) … long, sometimes hooked (+1)
//   flourish    capitals: plain (−1) … looped and swashy (+1); always plainer in ALL CAPS, for legibility
//   lifts       pen lifts between letters: fully joined (0) … print-script that rarely joins (1)
//   joinLength  connectors: short and cramped (−1) … long and airy (+1); the advance changes with them
//   angularity  turns: round (−1) … pointed, like Kurrent or angular italic (+1)
//   loopHeight  extenders against the x-height: compact 1:1:1 (−1) … tall 3:2:3, like copperplate (+1)
//   bowls       letter bodies: compressed (−1) … expansive (+1)
//   rhythm      upright and even (−1) … fast and stretched: wider, leaning, uneven (+1); follows Hurry
//
// 0 means "as the source draws it": with every dimension at 0 a glyph is exactly what the skeleton draws.
// A writer's values come from the seed (styleTraits): first a kind of movement (cluster: copperplate-trained,
// print-script, angular...), then correlated personal deviations, nudged by the hand's other traits (a hurried
// writer is faster, a round writer less pointed). PARAMS let the lab, the sampler and the UI drive them.
//
// Research: docs/research/hand-traditions.md §4 (whole-hand traits, bundles), human-feel.md rules 10 (mixed
// joins and lifts, restart gap −0.05…+0.1 x-height, script breaks 10–30%) and 15–17, fonts-study.md §4.
//
// Joins still meet: entry and exit stay on the letter's box edges at the source's join height, and every
// horizontal change moves the box edge with it (see xMap). Deliberate pen lifts are marked on the returned
// variant as `lift: { before, after }`, so QA can tell them from broken joins.
//
// Context: decisions use only ctx { prev, next, index, wordStart, wordEnd } (what layout caches glyphs by).
// A pair's lift is decided from (seed, pair, index), so both letters of the pair agree on it.

import { rng, clamp, lerp, smooth, DEG } from './core.js';
import { addTransform, choose, getStyle } from './glyphs.js';
import * as hand from './hand.js';

// ---------- the dimensions ----------
export const STYLE_DIMS = [
  { key: 'loops', label: 'Loops', min: -1, max: 1, about: 'Ascender and descender loops: plain stems and hooked tails, or big full loops' },
  { key: 'leadIns', label: 'Lead-ins', min: -1, max: 1, about: 'Entry strokes at the start of a word: none, or long and curled' },
  { key: 'endFlicks', label: 'End flicks', min: -1, max: 1, about: 'Exit strokes at the end of a word: a blunt stop, or long and hooked' },
  { key: 'flourish', label: 'Capitals', min: -1, max: 1, about: 'Capital letters: plain, or looped and swashy' },
  { key: 'lifts', label: 'Pen lifts', min: 0, max: 1, about: 'How often the pen lifts between letters: always joined, or print-script' },
  { key: 'joinLength', label: 'Join length', min: -1, max: 1, about: 'Connecting strokes: short and cramped, or long and airy' },
  { key: 'angularity', label: 'Pointed turns', min: -1, max: 1, about: 'Turns at the top and bottom of letters: round, or pointed' },
  { key: 'loopHeight', label: 'Loop height', min: -1, max: 1, about: 'Ascenders and descenders against the x-height: compact, or tall' },
  { key: 'bowls', label: 'Letter width', min: -1, max: 1, about: 'Letter bodies: compressed, or round and expansive' },
  { key: 'rhythm', label: 'Rhythm', min: -1, max: 1, about: 'Upright and even, or fast and stretched (follows Hurry)' },
];
const KEYS = STYLE_DIMS.map((d) => d.key);
const RANGE = Object.fromEntries(STYLE_DIMS.map((d) => [d.key, [d.min, d.max]]));
const NEUTRAL = Object.fromEntries(KEYS.map((k) => [k, 0]));
const PRINT_KEYS = new Set(['angularity', 'loopHeight', 'bowls', 'rhythm']); // what applies to unjoined hands

// ---------- kinds of movement (archetype clusters) ----------
// mu: centre of each dimension. Grounded in hand-traditions.md §4 "Whole-hand traits" and "Which variants
// travel together": looped/unlooped, lead-ins or none, joined/semi-joined/unjoined, round/oval/angular, 1:1:1 to 3:2:3.
export const MOVEMENTS = [
  { id: 'copperplate', label: 'Copperplate-trained', weight: 0.55,
    mu: { loops: 0.75, leadIns: 0.55, endFlicks: 0.35, flourish: 0.85, lifts: 0.03, joinLength: 0.25, angularity: -0.3, loopHeight: 0.75, bowls: -0.25, rhythm: -0.2 } },
  { id: 'business', label: 'Business cursive (Palmer, Zaner-Bloser)', weight: 1.1,
    mu: { loops: 0.35, leadIns: 0.25, endFlicks: 0.3, flourish: 0.25, lifts: 0.12, joinLength: 0.35, angularity: -0.1, loopHeight: 0.3, bowls: -0.2, rhythm: 0.35 } },
  { id: 'round', label: 'Round school hand (French, Hungarian)', weight: 0.9,
    mu: { loops: 0.45, leadIns: 0.65, endFlicks: 0.05, flourish: 0.3, lifts: 0.02, joinLength: -0.4, angularity: -0.75, loopHeight: 0.05, bowls: 0.6, rhythm: -0.55 } },
  { id: 'schoolroom', label: 'Careful schoolroom cursive', weight: 0.8,
    mu: { loops: 0.55, leadIns: 0.45, endFlicks: 0.1, flourish: 0.1, lifts: 0.04, joinLength: -0.15, angularity: -0.4, loopHeight: 0.15, bowls: 0.35, rhythm: -0.8 } },
  { id: 'italic', label: 'Italic, semi-joined', weight: 0.9,
    mu: { loops: -0.85, leadIns: -0.7, endFlicks: -0.1, flourish: -0.55, lifts: 0.4, joinLength: 0.05, angularity: 0.55, loopHeight: -0.4, bowls: -0.45, rhythm: 0.15 } },
  { id: 'printscript', label: 'Print-script that joins now and then', weight: 1,
    mu: { loops: -0.55, leadIns: -0.9, endFlicks: -0.45, flourish: -0.75, lifts: 0.8, joinLength: 0.1, angularity: 0.05, loopHeight: -0.3, bowls: 0.25, rhythm: -0.1 } },
  { id: 'angular', label: 'Angular (Kurrent-schooled)', weight: 0.45,
    mu: { loops: 0.15, leadIns: 0.35, endFlicks: 0.2, flourish: 0.35, lifts: 0.08, joinLength: -0.25, angularity: 0.9, loopHeight: 0.45, bowls: -0.65, rhythm: 0.1 } },
  { id: 'scrawl', label: 'Fast scrawl', weight: 0.8,
    mu: { loops: -0.3, leadIns: -0.55, endFlicks: 0.7, flourish: -0.15, lifts: 0.25, joinLength: 0.75, angularity: 0.35, loopHeight: -0.1, bowls: -0.35, rhythm: 0.85 } },
  { id: 'cramped', label: 'Small and cramped', weight: 0.6,
    mu: { loops: -0.15, leadIns: -0.3, endFlicks: -0.35, flourish: -0.4, lifts: 0.2, joinLength: -0.8, angularity: 0.25, loopHeight: -0.55, bowls: -0.55, rhythm: 0 } },
  { id: 'airy', label: 'Wide and airy', weight: 0.6,
    mu: { loops: 0.2, leadIns: 0.1, endFlicks: 0.45, flourish: 0.25, lifts: 0.1, joinLength: 0.85, angularity: -0.2, loopHeight: 0.2, bowls: 0.5, rhythm: 0.4 } },
];
const MOVEMENT_BY_ID = Object.fromEntries(MOVEMENTS.map((c) => [c.id, c]));
// Where the writer was schooled (letter-variety session's h.schooling) leans the kind of movement too:
// American and French hands loop and lead in, italic and British hands mostly don't (hand-traditions.md §4).
const SCHOOLING_LEAN = {
  american: { business: 2, copperplate: 1.5, schoolroom: 1.3 },
  french: { round: 3, schoolroom: 1.3 },
  continental: { round: 1.5, angular: 1.5, schoolroom: 1.2 },
  british: { italic: 2, printscript: 1.5 },
  italic: { italic: 3, angular: 1.3 },
  polish: { round: 2, schoolroom: 1.5 },
  'latin-american': { business: 1.5, round: 1.5, copperplate: 1.3 },
  'adult-print': { printscript: 3, cramped: 1.3 },
};
// The letter-variety session's writer archetypes (hand.js ARCHETYPES), when present, lean on these kinds.
const ARCHETYPE_LEAN = {
  friend: { business: 1.5, scrawl: 1.2, airy: 1.2 },
  thanks: { copperplate: 2, schoolroom: 2, round: 1.5 },
  architect: { printscript: 3, italic: 1.5 },
  field: { scrawl: 2, cramped: 2 },
  whiteboard: { printscript: 2, airy: 1.5 },
  margin: { scrawl: 1.5, cramped: 1.5 },
  postcard: { cramped: 2, business: 1.3 },
  recipe: { schoolroom: 1.5, round: 1.5 },
  first: { schoolroom: 2.5, round: 1.5 },
  italic: { italic: 4, angular: 1.5 },
  signature: { copperplate: 1.5, scrawl: 2.5, airy: 2 },
  backhand: { round: 1.5, printscript: 1.5 },
};

// Personal deviations from the cluster centre are correlated: decoration travels together (loops, lead-ins,
// capitals), lifting writers drop lead-ins, fast writers have long joins and long flicks.
const RHO = {
  'loops,flourish': 0.4, 'loops,leadIns': 0.3, 'leadIns,flourish': 0.35, 'loops,loopHeight': 0.3,
  'lifts,loops': -0.3, 'lifts,leadIns': -0.35,
  'rhythm,joinLength': 0.4, 'rhythm,endFlicks': 0.35, 'rhythm,angularity': 0.25,
  'bowls,angularity': -0.35, 'bowls,joinLength': 0.2,
};
const CHOL = (() => {
  const n = KEYS.length;
  const R = KEYS.map((a, i) => KEYS.map((b, j) => (i === j ? 1 : RHO[a + ',' + b] ?? RHO[b + ',' + a] ?? 0)));
  const L = R.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = R[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-9)) : s / L[j][j];
  }
  return L;
})();
const SPREAD = { lifts: 0.1, default: 0.3 };
const r2 = (x) => Math.round(x * 100) / 100;
const baseSeed = (seed) => String(seed).split('~')[0];
const familyOf = (style) => { const st = getStyle(style); return (st && st.family) || (style === 'script' ? 'script' : 'print'); };
const connectedStyle = (style) => { const st = getStyle(style); return !!(st && st.connected); };

// Which kind of movement this writer has (for the sampler and the UI's description).
export function movementOf(p) {
  if (p.movement && MOVEMENT_BY_ID[p.movement]) return MOVEMENT_BY_ID[p.movement];
  const st = getStyle(p.style);
  const lean = Object.assign({}, ARCHETYPE_LEAN[p.archetype] || {});
  for (const [k, w] of Object.entries(SCHOOLING_LEAN[p.schooling] || {})) lean[k] = (lean[k] || 1) * w;
  const hint = st && st.tradition && st.tradition.movement; // a traced tradition may name its usual kind
  if (hint && MOVEMENT_BY_ID[hint]) lean[hint] = (lean[hint] || 1) * 3;
  const pool = MOVEMENTS.map((c) => ({ c, weight: c.weight * (lean[c.id] || 1) }));
  return rng('movement:' + baseSeed(p.seed)).weighted(pool).c;
}

// The writer's own values for every dimension: a pure function of the seed and the hand's traits.
// Rounded to 0.01 so they show cleanly on sliders and in shared links.
const TRAITS = new Map();
export function styleTraits(p) {
  const hurry0 = Number.isFinite(p.hurry0) ? p.hurry0 : Number.isFinite(p.hurry) ? p.hurry : null;
  const key = [p.seed, p.style, hurry0, p.roundness, p.neatness0 ?? p.neatness, p.archetype, p.schooling, p.movement].join('|');
  let t = TRAITS.get(key);
  if (t) return t;
  const r = rng('style-dims:' + baseSeed(p.seed));
  const z = KEYS.map(() => r.gauss());
  if (String(p.seed).includes('~')) { const rs = rng('style-dims-sib:' + p.seed); for (let i = 0; i < z.length; i++) z[i] += 0.3 * rs.gauss(); }
  const corr = KEYS.map((_, i) => { let x = 0; for (let j = 0; j <= i; j++) x += CHOL[i][j] * z[j]; return x; });
  const script = familyOf(p.style) === 'script';
  const mv = movementOf(p);
  const neat = Number.isFinite(p.neatness0) ? p.neatness0 : Number.isFinite(p.neatness) ? p.neatness : 0.6;
  const round = Number.isFinite(p.roundness) ? p.roundness : 0.55;
  t = {};
  KEYS.forEach((k, i) => {
    const sp = SPREAD[k] ?? SPREAD.default;
    let v = (script ? mv.mu[k] : 0) + sp * corr[i] * (script ? 1 : 1.2);
    if (k === 'rhythm' && hurry0 != null) v += 1.1 * (hurry0 - 0.45);
    if (k === 'joinLength' && hurry0 != null) v += 0.3 * (hurry0 - 0.45);
    if (k === 'angularity') v -= 0.6 * (round - 0.55);
    if (k === 'flourish') v += 0.35 * (neat - 0.6);
    if (k === 'loops') v += 0.25 * (neat - 0.6);
    if (k === 'lifts') v += -0.15 * (neat - 0.6) + (hurry0 != null ? 0.12 * (hurry0 - 0.45) : 0);
    if (!script && !PRINT_KEYS.has(k)) v = 0;
    t[k] = r2(clamp(v, RANGE[k][0], RANGE[k][1]));
  });
  if (TRAITS.size > 2000) TRAITS.clear();
  TRAITS.set(key, t);
  return t;
}
// The values sit on the hand itself (hand.js addHandTraits runs this last in makeHand), so the UI's sliders and
// the New-hand sampler read each writer's natural values from it.
if (typeof hand.addHandTraits === 'function') hand.addHandTraits((h) => ({ ...styleTraits(h) }));

// Effective values: UI overrides win, then the writer's traits. Moving Hurry away from the writer's own pace
// (hurry0, letter-variety session) speeds the movement up or slows it down.
const DIMS = new Map();
export function styleDims(p) {
  const key = KEYS.map((k) => p[k]).join(',') + '|' + p.seed + '|' + p.style + '|' + p.hurry + '|' + p.hurry0 + '|' + p.roundness + '|' + (p.neatness0 ?? p.neatness) + '|' + p.archetype + '|' + p.schooling + '|' + p.movement;
  let d = DIMS.get(key);
  if (d) return d;
  const need = KEYS.some((k) => !Number.isFinite(p[k]));
  const t = need ? styleTraits(p) : null;
  d = {};
  for (const k of KEYS) d[k] = Number.isFinite(p[k]) ? p[k] : t[k];
  if (Number.isFinite(p.hurry) && Number.isFinite(p.hurry0) && p.hurry !== p.hurry0) d.rhythm += 1.4 * (p.hurry - p.hurry0);
  for (const k of KEYS) d[k] = clamp(d[k], RANGE[k][0], RANGE[k][1]);
  if (familyOf(p.style) !== 'script' || !connectedStyle(p.style)) for (const k of KEYS) if (!PRINT_KEYS.has(k)) d[k] = 0;
  d.neutral = KEYS.every((k) => d[k] === 0);
  if (DIMS.size > 2000) DIMS.clear();
  DIMS.set(key, d);
  return d;
}

export const STYLE_PARAMS = STYLE_DIMS.map((d) => ({
  key: d.key, label: d.label, group: 'Movement', min: d.min, max: d.max, step: 0.01, about: d.about,
  default: (p) => styleTraits(p)[d.key],
}));
export const STYLE_NEUTRAL = NEUTRAL;

// ---------- small helpers ----------
const isLowerCh = (c) => !!c && /^\p{Ll}$/u.test(c);
const isUpperCh = (c) => !!c && /^\p{Lu}$/u.test(c);
const isLetterCh = (c) => isLowerCh(c) || isUpperCh(c);
const baseOf = (c) => (c ? c.normalize('NFD')[0] : c);
const gauss = (key) => rng(key).gauss();
const unit = (key) => rng(key)();
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; // y down: +a turns clockwise on screen
const isDotStroke = (s, m) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of s) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  return Math.max(x1 - x0, y1 - y0) <= 2.6 * (m.base - m.cap) / 21; // same rule as hand.js
};
function lengths(s) { const c = [0]; for (let i = 1; i < s.length; i++) c.push(c[i - 1] + dist(s[i - 1], s[i])); return c; }
// point at arc length L along s (from index a forward), with the index of the segment it falls in
function at(s, cum, L) {
  if (L <= 0) return { q: s[0].slice(), i: 0 };
  for (let i = 1; i < s.length; i++) if (cum[i] >= L) {
    const t = (L - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return { q: lerpP(s[i - 1], s[i], t), i: i - 1 };
  }
  return { q: s[s.length - 1].slice(), i: s.length - 2 };
}
// x where the polyline from index `from` walking toward index `to` first crosses height y (null if never)
function xAt(s, from, to, y) {
  const step = to > from ? 1 : -1;
  for (let i = from; i !== to; i += step) {
    const a = s[i], b = s[i + step];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
    if (a[1] === y) return a[0];
  }
  return null;
}

// Where (as a fraction of its length, from its start) is the polyline part a..b first crossed by the rest of
// the letter? A crossing means the "connector" closes a loop (an e's eye, an l's loop), so it can't be trimmed
// past that point.
function segX(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return -1;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? t : -1;
}
function crossedAt(strokes, si, a, b, fromEnd) {
  const s = strokes[si], cum = lengths(s.slice(a, b + 1)), L = cum[cum.length - 1] || 1;
  let best = fromEnd ? -1 : Infinity;
  for (let i = a; i < b; i++) {
    strokes.forEach((o, oi) => {
      for (let j = 0; j + 1 < o.length; j++) {
        if (oi === si && j >= a - 1 && j <= b) continue; // the part itself and its neighbours
        const t = segX(s[i], s[i + 1], o[j], o[j + 1]);
        if (t < 0) continue;
        const f = (cum[i - a] + t * (cum[i - a + 1] - cum[i - a])) / L;
        if (fromEnd ? f > best : f < best) best = f;
      }
    });
  }
  return best;
}

// ---------- skeleton analysis (cached per variant object) ----------
// entry: the stroke that rises from the letter's left edge to its first top (the joining stroke in),
// exit: the stroke that rises from the last turn to the right edge (the joining stroke out),
// asc / desc: strokes that loop above the x-height / below the baseline.
const ANALYSIS = new WeakMap();
function analyze(v, m) {
  let a = ANALYSIS.get(v);
  if (a && a.m === m) return a;
  const X = m.xHeight, U = m.base - X, A = X - m.cap, D = m.descender - m.base, TOL = 0.02 * U;
  const marks = new Set(v.marks || []);
  const body = [];
  v.s.forEach((s, i) => { if (!marks.has(i) && s.length >= 2 && !isDotStroke(s, m)) body.push(i); });
  let minX = Infinity, maxX = -Infinity, bandMinX = Infinity;
  for (const i of body) for (const q of v.s[i]) {
    if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0];
    if (q[1] >= X - 0.1 * U && q[1] <= m.base + 0.1 * U && q[0] < bandMinX) bandMinX = q[0];
  }
  let entry = null, exit = null;
  if (body.length) {
    const si = body[0], s = v.s[si], q0 = s[0];
    if (q0[0] <= minX + 0.08 * U && q0[1] >= X - 0.25 * U && q0[1] <= m.base + 0.05 * U) {
      // rises to the right up to its first top, and no higher than the x-height (above it is an ascender loop)
      let e = 0;
      while (e + 1 < s.length && s[e + 1][0] >= s[e][0] - TOL && s[e + 1][1] <= s[e][1] + TOL && s[e + 1][1] >= X - 0.1 * U) e++;
      if (e >= 1 && e < s.length - 1 && q0[1] - s[e][1] >= 0.2 * U) {
        const x = crossedAt(v.s, si, 0, e, true); // keep everything from the last crossing on
        entry = { si, e, minKeep: x < 0 ? 0 : Math.min(1, 1 - x + 0.08) };
      }
    }
    let best = null;
    for (const i of body) { const s2 = v.s[i], q = s2[s2.length - 1]; if (!best || q[0] > best.q[0]) best = { si: i, q }; }
    if (best.q[0] >= maxX - 0.08 * U && best.q[1] >= X - 0.35 * U && best.q[1] <= m.base - 0.05 * U) {
      const s2 = v.s[best.si];
      let T = s2.length - 1;
      // walk back while the stroke keeps rising to the right, but not down into a descender loop
      while (T - 1 >= 0 && s2[T - 1][0] <= s2[T][0] + TOL && s2[T - 1][1] >= s2[T][1] - TOL && s2[T - 1][1] <= m.base + 0.1 * U) T--;
      const end = s2[s2.length - 1];
      if (T < s2.length - 1 && (end[0] - s2[T][0] >= 0.2 * U || s2[T][1] - end[1] >= 0.15 * U)) {
        const x = crossedAt(v.s, best.si, T, s2.length - 1, true); // keep everything up to the last crossing
        exit = { si: best.si, T, minKeep: x < 0 ? 0 : Math.min(1, x + 0.08) };
      }
    }
  }
  const asc = [], desc = [];
  for (const i of body) {
    const s = v.s[i];
    let t = 0, b = 0;
    for (let k = 1; k < s.length; k++) { if (s[k][1] < s[t][1]) t = k; if (s[k][1] > s[b][1]) b = k; }
    if (s[t][1] < X - 0.45 * A && t > 0 && t < s.length - 1 && s[t - 1][1] < X && s[t + 1][1] < X) asc.push({ si: i, t });
    if (D > 0 && s[b][1] > m.base + 0.45 * D && b > 0 && b < s.length - 1 && s[b - 1][1] > m.base && s[b + 1][1] > m.base) {
      desc.push({ si: i, b, carriesExit: !!(exit && exit.si === i && exit.T > b) });
    }
  }
  a = { m, body, marks, entry, exit, asc, desc, minX, maxX, bandMinX, U, A, D };
  ANALYSIS.set(v, a);
  return a;
}

// ---------- operators (all work on copies, in source units, y down) ----------

// Loop width about the loop's own spine: w = 0 retraces the stem, 1 = as drawn, > 1 = fuller.
// The downstroke (the stem) moves 30% of the way, the upstroke 70%, so a retraced stem stays near the stem.
function reshapeLoop(s, apex, w, inside, ramp) {
  if (w === 1) return s;
  const out = s.map((q) => q.slice());
  const n = s.length;
  for (let i = 0; i < n; i++) {
    if (i === apex || !inside(s[i][1])) continue;
    const before = i < apex;
    const xo = before ? xAt(s, apex, n - 1, s[i][1]) : xAt(s, apex, 0, s[i][1]);
    if (xo == null) continue;
    const d = s[i][0] - xo; // from the other side of the loop to this point
    out[i][0] = s[i][0] - (1 - w) * d * (before ? 0.7 : 0.3) * ramp(s[i][1]);
  }
  return out;
}
// Ascenders are drawn up then down (the stem is the second side); descenders down then up (the stem is the first).
function reshapeAsc(s, t, w, m) {
  const X = m.xHeight, A = X - m.cap;
  return reshapeLoop(s, t, w, (y) => y < X, (y) => smooth((X - y) / (0.3 * A)));
}
function reshapeDesc(s, b, w, m) {
  const D = m.descender - m.base;
  const out = s.map((q) => q.slice()), n = s.length;
  if (w === 1) return out;
  for (let i = 0; i < n; i++) {
    if (i === b || s[i][1] <= m.base) continue;
    const before = i < b; // before the bottom = the downstroke (the stem); after = the upstroke
    const xo = before ? xAt(s, b, n - 1, s[i][1]) : xAt(s, b, 0, s[i][1]);
    if (xo == null) continue;
    const d = s[i][0] - xo;
    out[i][0] = s[i][0] - (1 - w) * d * (before ? 0.3 : 0.7) * smooth((s[i][1] - m.base) / (0.3 * D));
  }
  return out;
}
// Italic tail: keep the descender, curl a short way round the bottom, lift. Ends the stroke (and any exit).
function hookDesc(s, b, len) {
  const tail = s.slice(b);
  const cum = lengths(tail);
  const end = at(tail, cum, len);
  return [...s.slice(0, b + 1).map((q) => q.slice()), ...tail.slice(1, end.i + 1).map((q) => q.slice()), end.q];
}

// Turns at the top and bottom of strokes: pointed (amt > 0, toward the corner where the tangents meet,
// kept at the turn's own height so the x-height band doesn't move) or rounder (amt < 0, a wider turn).
function reshapeTurns(s, amt, U) {
  if (!amt || s.length < 3) return s;
  const eps = 0.06 * U;
  const turns = [];
  let i = 1;
  while (i < s.length - 1) {
    let j = i;
    while (j + 1 < s.length - 1 && Math.abs(s[j + 1][1] - s[i][1]) <= eps) j++;
    const yi = s[i][1], yp = s[i - 1][1], yn = s[j + 1][1];
    if ((yp > yi + eps && yn > yi + eps) || (yp < yi - eps && yn < yi - eps)) turns.push({ i, j });
    i = j + 1;
  }
  if (!turns.length) return s;
  const cum = lengths(s);
  const out = s.map((q) => q.slice());
  const pos = turns.map((t) => (cum[t.i] + cum[t.j]) / 2);
  turns.forEach((t, k) => {
    const gapL = k ? pos[k] - pos[k - 1] : Infinity, gapR = k < turns.length - 1 ? pos[k + 1] - pos[k] : Infinity;
    let R = (amt > 0 ? 0.32 : 0.42) * U;
    R = Math.min(R, 0.45 * gapL, 0.45 * gapR);
    const L0 = Math.max(0, cum[t.i] - R), L1 = Math.min(cum[s.length - 1], cum[t.j] + R);
    if (L1 - L0 < 0.15 * U) return;
    const pin = at(s, cum, L0), pout = at(s, cum, L1);
    const din = norm([s[pin.i + 1][0] - s[pin.i][0], s[pin.i + 1][1] - s[pin.i][1]]);
    const dout = norm([s[pout.i + 1][0] - s[pout.i][0], s[pout.i + 1][1] - s[pout.i][1]]);
    const turn = Math.acos(clamp(din[0] * dout[0] + din[1] * dout[1], -1, 1));
    if (turn < 60 * DEG) return;
    // corner where the two tangent lines meet
    const den = din[0] * dout[1] - din[1] * dout[0];
    if (Math.abs(den) < 1e-6) return;
    const P = pin.q, Q = pout.q;
    const u = ((Q[0] - P[0]) * dout[1] - (Q[1] - P[1]) * dout[0]) / den;
    if (!(u > 0)) return;
    let ax = 0, ay = 0;
    for (let k2 = t.i; k2 <= t.j; k2++) { ax += s[k2][0]; ay += s[k2][1]; }
    const apexY = ay / (t.j - t.i + 1);
    const lo = Math.min(P[0], Q[0]) - R, hi = Math.max(P[0], Q[0]) + R;
    const C = [clamp(P[0] + din[0] * u, lo, hi), apexY];
    // neighbourhood: real points strictly between the two cut points, by arc length
    const idx = [];
    for (let k2 = pin.i + 1; k2 <= pout.i; k2++) if (cum[k2] > L0 && cum[k2] < L1) idx.push(k2);
    if (!idx.length) return;
    if (amt < 0) {
      // rounder: widen the turn about its apex (sin² falloff, so the stroke's tangents don't kink), height unchanged
      const ax0 = ax / (t.j - t.i + 1), k = -0.45 * amt;
      for (const k2 of idx) {
        const f = (cum[k2] - L0) / (L1 - L0), wv = Math.sin(Math.PI * f) ** 2;
        out[k2] = [s[k2][0] + (s[k2][0] - ax0) * k * wv, s[k2][1]];
      }
      return;
    }
    const l1 = dist(P, C), l2 = dist(C, Q);
    const target = (f) => { const L = f * (l1 + l2); return L <= l1 ? lerpP(P, C, L / Math.max(1e-9, l1)) : lerpP(C, Q, (L - l1) / Math.max(1e-9, l2)); };
    const w = amt;
    const cap = 0.16 * U; // never move a point further than this: small eyes (e, o) must stay open
    for (const k2 of idx) {
      const f = (cum[k2] - L0) / (L1 - L0);
      const g = target(f);
      // never beyond the turn's own height (the x-height band and descender depth stay put)
      const top = s[t.i][1] < (P[1] + Q[1]) / 2;
      const gy = top ? Math.max(g[1], apexY) : Math.min(g[1], apexY);
      let dx = (g[0] - s[k2][0]) * w, dy = (gy - s[k2][1]) * w;
      const dl = Math.hypot(dx, dy);
      if (dl > cap) { dx *= cap / dl; dy *= cap / dl; }
      out[k2] = [s[k2][0] + dx, s[k2][1] + dy];
    }
  });
  return out;
}

// Keep `keep` (0..1) of the stroke's tail after index T (by arc length). Never leaves fewer than 2 points.
function trimTail(s, T, keep, minLen) {
  const tail = s.slice(T);
  const cum = lengths(tail);
  const L = Math.max(minLen, keep * cum[cum.length - 1]);
  if (L >= cum[cum.length - 1]) return s.map((q) => q.slice());
  const e = at(tail, cum, L);
  const head = s.slice(0, T + 1).map((q) => q.slice());
  const out = [...head, ...tail.slice(1, e.i + 1).map((q) => q.slice()), e.q];
  return out.length >= 2 ? out : s.map((q) => q.slice());
}
// Keep `keep` (0..1) of the stroke's head before index e (measured back from e).
function trimHead(s, e, keep, minLen) {
  const head = s.slice(0, e + 1).reverse();
  const cum = lengths(head);
  const L = Math.max(minLen, keep * cum[cum.length - 1]);
  if (L >= cum[cum.length - 1]) return s.map((q) => q.slice());
  const b = at(head, cum, L);
  const kept = [b.q, ...head.slice(1, b.i + 1).map((q) => q.slice())].reverse();
  const out = [...kept, ...s.slice(e + 1).map((q) => q.slice())];
  return out.length >= 2 ? out : s.map((q) => q.slice());
}
// Carry the exit on past its end: `ext` source units, trailing out flatter (toward a gentle rise) as it flies.
function extendTail(s, ext, U) {
  if (ext <= 0.02 * U) return s;
  const n = s.length, E = s[n - 1];
  let d = norm([E[0] - s[n - 2][0], E[1] - s[n - 2][1]]);
  const goal = norm([Math.cos(18 * DEG), -Math.sin(18 * DEG)]);
  const out = s.map((q) => q.slice());
  const k = 5, step = ext / k;
  let q = E;
  for (let i = 0; i < k; i++) { d = norm([d[0] + (goal[0] - d[0]) * 0.35, d[1] + (goal[1] - d[1]) * 0.35]); q = [q[0] + d[0] * step, q[1] + d[1] * step]; out.push(q); }
  return out;
}
// Turn the tip of the exit over to the right and down, like a small wave. (Curling it back up-left would
// close a bowl and make an l read as a b.)
function hookTail(s, size) {
  const n = s.length, E = s[n - 1];
  let d = norm([E[0] - s[n - 2][0], E[1] - s[n - 2][1]]);
  const out = s.map((q) => q.slice());
  let q = E;
  for (const f of [0.36, 0.3, 0.2, 0.14]) { d = rot(d, 32 * DEG); q = [q[0] + d[0] * size * f, q[1] + d[1] * size * f]; out.push(q); }
  return out;
}
// Lengthen the lead-in backward from its start: it starts lower and flatter, never below the baseline.
function extendHead(s, ext, m) {
  const U = m.base - m.xHeight;
  if (ext <= 0.02 * U) return s;
  const S = s[0];
  let b = norm([S[0] - s[1][0], S[1] - s[1][1]]); // backward direction
  const pre = [];
  const k = 5, step = ext / k;
  let q = S;
  for (let i = 0; i < k; i++) {
    b = rot(b, 7 * DEG); // flatter as it goes back
    q = [q[0] + b[0] * step, Math.min(m.base + 0.06 * U, q[1] + b[1] * step)];
    pre.push(q);
  }
  return [...pre.reverse(), ...s.map((p) => p.slice())];
}
// A small counter-clockwise curl in front of the lead-in (the French "hook" start).
function curlHead(s, rc) {
  const S = s[0];
  const d = norm([s[1][0] - S[0], s[1][1] - S[1]]);
  const c = [S[0] + rc * d[1], S[1] - rc * d[0]]; // centre on the visual left of the travel direction
  const th = Math.atan2(S[1] - c[1], S[0] - c[0]);
  const pre = [];
  const k = 6, sweep = 150 * DEG;
  for (let i = k; i >= 1; i--) { const a = th + sweep * i / k; pre.push([c[0] + rc * Math.cos(a), c[1] + rc * Math.sin(a)]); }
  return [...pre, ...s.map((p) => p.slice())];
}

// Capital curls: the compact curl at a stroke's start (up to its first turn) or end (from its last turn),
// scaled about the turn: f < 1 plainer (0 = gone), f > 1 swashier.
function firstTurn(s, fromStart, eps) {
  const n = s.length, idx = (a) => (fromStart ? a : n - 1 - a);
  for (let a = 1; a < n - 1; a++) {
    const yp = s[idx(a - 1)][1], yi = s[idx(a)][1];
    let b = a;
    while (b + 1 < n - 1 && Math.abs(s[idx(b + 1)][1] - yi) <= eps) b++;
    const yn = s[idx(b + 1)][1];
    if ((yp - yi) * (yn - yi) > 0 && Math.abs(yp - yi) > eps && Math.abs(yn - yi) > eps) return idx(a);
    a = b;
  }
  return -1;
}
function curlSpan(s, fromStart, m) {
  if (s.length < 4) return null;
  const k = firstTurn(s, fromStart, 0.04 * (m.base - m.xHeight));
  if (k < 0) return null;
  const part = fromStart ? s.slice(0, k + 1) : s.slice(k);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, turn = 0;
  for (const q of part) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  for (let i = 1; i < part.length - 1; i++) {
    const u = norm([part[i][0] - part[i - 1][0], part[i][1] - part[i - 1][1]]), v = norm([part[i + 1][0] - part[i][0], part[i + 1][1] - part[i][1]]);
    turn += Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
  }
  if (Math.max(x1 - x0, y1 - y0) > 0.45 * (m.base - m.cap) || Math.abs(turn) < 75 * DEG) return null;
  return k;
}
function scaleCurl(s, k, fromStart, f) {
  const P = s[k];
  const inCurl = (i) => (fromStart ? i < k : i > k);
  if (f > 1) { // a bigger curl stays within the stroke's own height (capital tails must not hang lower)
    let y0 = Infinity, y1 = -Infinity;
    for (const q of s) { if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    s.forEach((q, i) => {
      if (!inCurl(i)) return;
      const dy = q[1] - P[1];
      if (dy > 1e-9) f = Math.min(f, (y1 - P[1]) / dy); else if (dy < -1e-9) f = Math.min(f, (y0 - P[1]) / dy);
    });
    f = Math.max(1, f);
  }
  return s.map((q, i) => (inCurl(i) ? [P[0] + (q[0] - P[0]) * f, P[1] + (q[1] - P[1]) * f] : q.slice()));
}

// ---------- decisions between two letters ----------
const DESC_EXIT = new Set([...'fgjpqyzſ']);
const firstTop = (st, U) => { // x where a stroke first stops rising (the top of an entry stroke)
  let t = 0;
  for (let k = 1; k < st.length; k++) { if (st[k][1] < st[t][1] - 1e-9) t = k; else if (st[k][1] > st[t][1] + 0.2 * U) break; }
  return st[t][0];
};
const HIGH_EXIT = new Set([...'bovw']);
const ROUND_ENTRY = new Set([...'acdgoq']);
// How strongly real writers lift between a and b (human-feel.md rule 10, hand-traditions.md §4): after capitals,
// before letters that start at the top of a bowl, after descenders and high exits.
function liftPull(a, b) {
  const A = baseOf(a), B = baseOf(b);
  let pi = 0;
  if (isUpperCh(a)) pi += 0.55;
  if (ROUND_ENTRY.has(B)) pi += 0.3;
  if (DESC_EXIT.has(A)) pi += 0.3;
  else if (HIGH_EXIT.has(A)) pi += 0.15;
  if (A === B) pi -= 0.1; // doubles are written in one movement
  return pi;
}
// Does this writer lift between a and b here? Habitual per pair, with some play per position.
function liftsBetween(p, d, a, b, i) {
  if (!(d.lifts > 0)) return false;
  const P = 1 - Math.pow(1 - clamp(d.lifts, 0, 1), Math.max(0.2, 1 + 2.5 * liftPull(a, b)));
  const z = 0.75 * gauss('lift-pair:' + baseSeed(p.seed) + ':' + a + b) + 0.66 * gauss('lift-at:' + p.seed + ':' + a + b + ':' + i);
  return 1 / (1 + Math.exp(-1.7 * z)) < P;
}
// Spacing around a lift. The hand keeps its rhythm: the next letter's body starts about a print letter-gap
// after this one's body (a habit, about 0.1–0.45 x-height between their extremes), and the pen comes down close to where it lifted
// (human-feel.md rule 10: restart gap −0.05…+0.1 x-height). Both letters of the pair compute the same values.
function liftSpacing(p, d, a, b, i) {
  // a cramped writer lifts into a tight gap, an airy one into a wide one
  const space = clamp(0.3 + 0.08 * gauss('lift-space:' + baseSeed(p.seed)), 0.14, 0.48) * Math.exp(0.35 * d.joinLength);
  const habit = 0.03 + 0.04 * gauss('lift-gap:' + baseSeed(p.seed));
  const at = rng('lift-gap-at:' + p.seed + ':' + a + b + ':' + i);
  return { body: space + 0.06 * at.gauss(), restart: clamp(habit + 0.05 * at.gauss(), -0.05, 0.12) };
}
// Loop width factors for this writer and letter (ascender, descender): retraced/hooked at 0.
function loopWidth(p, d, ch, desc) {
  const on = Math.min(1, 4 * Math.abs(d.loops)); // personal play fades out toward the source's own loops
  const base = desc ? clamp(d.loops + 0.25 * on * gauss('loops-desc:' + baseSeed(p.seed)), -1, 1) : d.loops;
  const fast = Math.max(0, d.rhythm);
  let w = base >= 0 ? 1 + 0.65 * base : 1 + base;
  w *= Math.exp(-0.25 * fast);
  // per letter: the l may loop fuller than the h (a habit, fixed for the writer)
  w *= Math.exp(0.16 * on * gauss('loops-ch:' + baseSeed(p.seed) + ':' + baseOf(ch) + (desc ? 'd' : 'a')));
  return Math.max(LOOP_FLOOR[baseOf(ch)] || 0, w);
}
const HOOK_BELOW = 0.22;
// letters whose loops are what makes them readable keep at least a narrow one
const LOOP_FLOOR = { f: 0.38 };
// cursive r and s are built on their entry stroke (the peak of the r, the point of the s): they keep most of it
const ENTRY_FLOOR = { r: 0.7, s: 0.7 };
// Has the letter (as this writer draws it) lost its exit to a hooked, unlooped descender?
function exitLost(p, d, ch, ctx) {
  if (!isLowerCh(ch) || d.loops === 0 || loopWidth(p, d, ch, true) >= HOOK_BELOW) return false;
  const st = getStyle(p.style);
  const v = choose(p, ch, ctx);
  if (!v || !v.s) return false;
  const m = v.metrics || (st && st.metrics);
  if (!m) return false;
  const a = analyze(v, m);
  return a.desc.some((x) => x.carriesExit);
}

// Some traced letters are completed by the stroke coming in (Sütterlin's e: the join from the previous letter
// draws its eye). Their ink in the x-height band reaches well left of their join point; the pen never lifts into them.
function entryNeedsJoin(p, ch, ctx) {
  if (!isLowerCh(ch)) return false;
  const st = getStyle(p.style);
  const v = choose(p, ch, ctx);
  if (!v || !v.s) return false;
  const m = v.metrics || (st && st.metrics);
  if (!m) return false;
  const a = analyze(v, m);
  return v.l - a.bandMinX > 0.3 * a.U;
}

// ---------- the transform ----------
function styleTransform(p, ch, v, ctx, m) {
  if (!v || !v.s || !m || !isLetterCh(ch)) return v;
  const d = styleDims(p);
  if (d.neutral) return v;
  const lower = isLowerCh(ch), upper = !lower;
  const connected = connectedStyle(p.style) && familyOf(p.style) === 'script';
  const a = analyze(v, m);
  const U = a.U, X = m.xHeight;
  const seedKey = p.seed + ':' + ch + ':' + (ctx ? [ctx.prev, ctx.next, ctx.index].join(',') : 'canon');
  const i0 = ctx && Number.isFinite(ctx.index) ? ctx.index : 0;
  let s = v.s.slice();
  let changed = false;
  const set = (i, ns) => { if (ns !== s[i]) { s[i] = ns; changed = true; } };
  let exitT = a.exit ? a.exit.T : -1; // the exit's turn index, kept current while the same stroke is edited

  // joins on each side (canonical forms, without ctx, are joined on both sides)
  let joinL = false, joinR = false, liftL = false, liftR = false;
  let nextNeedsJoin = false;
  if (connected) {
    joinL = lower && (ctx ? isLetterCh(ctx.prev) : true);
    joinR = ctx ? isLowerCh(ctx.next) : true;
    const selfNeedsJoin = lower && v.l - a.bandMinX > 0.3 * a.U;
    nextNeedsJoin = !!(ctx && joinR && entryNeedsJoin(p, ctx.next, { prev: ch, next: null, index: i0 + 1, wordStart: false, wordEnd: false }));
    if (ctx && joinL && !selfNeedsJoin) liftL = liftsBetween(p, d, ctx.prev, ch, i0 - 1) ||
      exitLost(p, d, ctx.prev, { prev: null, next: ch, index: i0 - 1, wordStart: i0 - 1 === 0, wordEnd: false });
    if (ctx && joinR && !nextNeedsJoin) liftR = liftsBetween(p, d, ch, ctx.next, i0);
  }

  // 1. loops (lowercase): fuller, narrower or retraced; unlooped descenders end in a hook, and the pen lifts
  let exitGone = false;
  if (lower && (d.loops !== 0 || d.rhythm > 0)) {
    for (const L of a.asc) set(L.si, reshapeAsc(s[L.si], L.t, loopWidth(p, d, ch, false), m));
    for (const L of a.desc) {
      const w = loopWidth(p, d, ch, true);
      if (w < HOOK_BELOW && connected && !(L.carriesExit && nextNeedsJoin)) {
        const len = (0.16 + 0.1 * unit('hook:' + baseSeed(p.seed) + ':' + baseOf(ch))) * U;
        set(L.si, hookDesc(s[L.si], L.b, len));
        if (L.carriesExit) exitGone = true;
      } else set(L.si, reshapeDesc(s[L.si], L.b, Math.max(w, HOOK_BELOW), m));
    }
  }
  if (exitGone) liftR = joinR;

  // 2. loop height: extenders against the x-height, bounded by the engine's own extremes so pages don't clip
  if (lower && d.loopHeight !== 0) {
    const asc = Number.isFinite(p.ascender) ? p.ascender : 1.06, xh = Number.isFinite(p.xHeight) ? p.xHeight : 0.5;
    const desc = Number.isFinite(p.descender) ? p.descender : 1;
    const kA = Math.min(Math.exp(0.16 * d.loopHeight), (1.2 - xh) / Math.max(0.1, asc - xh));
    const kD = Math.min(Math.exp(0.18 * d.loopHeight), 1.2 / Math.max(0.5, desc));
    for (const i of a.body) set(i, s[i].map((q) => [q[0], q[1] < X ? X - (X - q[1]) * kA : q[1] > m.base ? m.base + (q[1] - m.base) * kD : q[1]]));
  }

  // 3. turns: pointed or round (capitals a little less, so they stay legible)
  if (d.angularity !== 0) {
    const amt = d.angularity * (upper ? 0.6 : 1);
    for (const i of a.body) set(i, reshapeTurns(s[i], amt, U));
  }

  // 4. capitals: plain or swashy curls. ALL CAPS stay plain; mid-word capitals flourish less.
  let leftEdited = false;
  if (upper) {
    let f = d.flourish;
    const caps = ctx && (isUpperCh(ctx.prev) || isUpperCh(ctx.next));
    if (caps) f = Math.min(f, 0) - 0.35;
    else if (ctx && !ctx.wordStart) f *= 0.6;
    f = clamp(f + 0.12 * Math.min(1, 3 * Math.abs(d.flourish)) * gauss('flourish:' + seedKey), -1, 1);
    if (f !== 0) {
      const fac = f < 0 ? 1 + 0.85 * f : 1 + 0.75 * f;
      for (const i of a.body) {
        let st = s[i];
        const k0 = curlSpan(st, true, m);
        if (k0 != null) st = scaleCurl(st, k0, true, fac);
        if (!(a.exit && a.exit.si === i)) { const k1 = curlSpan(st, false, m); if (k1 != null) st = scaleCurl(st, k1, false, fac); }
        set(i, st);
      }
      leftEdited = true;
    }
  }

  // 5. connectors: lifts inside words, lead-ins at word starts, end flicks at word ends
  const minLen = 0.05 * U;
  const editHead = (si, ns) => { if (a.exit && a.exit.si === si) exitT += ns.length - s[si].length; set(si, ns); };
  let leadEdited = false, flickEdited = false;
  if (connected && a.entry && lower && !joinL && d.leadIns !== 0) {
    const e = a.entry, st = s[e.si];
    const lead = clamp(d.leadIns + 0.15 * Math.min(1, 3 * Math.abs(d.leadIns)) * gauss('lead:' + seedKey), -1, 1);
    if (lead < 0) editHead(e.si, trimHead(st, e.e, Math.max(ENTRY_FLOOR[baseOf(ch)] || 0, e.minKeep, 1 + lead), minLen));
    else {
      const cl = lengths(st.slice(0, e.e + 1));
      let ns = extendHead(st, Math.min(0.9 * cl[cl.length - 1] + 0.3 * U, 0.85 * U) * lead, m);
      const curlRate = clamp(0.1 + 0.25 * gauss('curl-rate:' + baseSeed(p.seed)) + 0.35 * lead, 0, 0.85);
      if (lead > 0.35 && unit('curl:' + seedKey) < curlRate) ns = curlHead(ns, (0.17 + 0.08 * lead) * U);
      editHead(e.si, ns);
    }
    leadEdited = true;
  } else if (connected && a.entry && liftL) {
    const keep = Math.max(ENTRY_FLOOR[baseOf(ch)] || 0, a.entry.minKeep, clamp(0.12 + 0.2 * d.leadIns + 0.08 * gauss('restart:' + seedKey), 0, 0.5));
    editHead(a.entry.si, trimHead(s[a.entry.si], a.entry.e, keep, minLen));
  }
  if (connected && a.exit && !exitGone) {
    const si = a.exit.si;
    // the stub left by a lift; the breve exits of b o v w are part of the letter and stay longer
    const stubFloor = Math.max(HIGH_EXIT.has(baseOf(ch)) ? 0.55 : 0.06, a.exit.minKeep);
    if (liftR) set(si, trimTail(s[si], exitT, clamp(0.3 + 0.22 * d.endFlicks + 0.1 * gauss('stub:' + seedKey), stubFloor, 0.7), minLen));
    else if (!joinR && (d.endFlicks !== 0 || d.rhythm > 0)) {
      const flick = clamp(d.endFlicks + 0.25 * Math.max(0, d.rhythm) + 0.15 * Math.min(1, 3 * Math.abs(d.endFlicks)) * gauss('flick:' + seedKey), -1, 1);
      const st = s[si];
      let ns;
      if (flick < 0) ns = trimTail(st, exitT, Math.max(a.exit.minKeep, 1 + 0.95 * flick), minLen);
      else { const cl = lengths(st.slice(exitT)); ns = extendTail(st, Math.min(0.9 * cl[cl.length - 1], 0.45 * U) * flick, U); }
      const hookRate = clamp(0.1 + 0.18 * gauss('hook-rate:' + baseSeed(p.seed)) + 0.25 * flick, 0, 0.7);
      if (flick > -0.3 && unit('hookflick:' + seedKey) < hookRate) ns = hookTail(ns, (0.2 + 0.1 * Math.max(0, flick)) * U);
      set(si, ns);
      flickEdited = true;
    }
  }

  // box edges follow lead-ins, end flicks and capital swashes (a long stroke takes some of the word space)
  const ink = () => {
    let mn = Infinity, mx = -Infinity;
    for (const i of a.body) for (const q of s[i]) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
    return [mn, mx];
  };
  let l = v.l, r = v.r;
  if (leadEdited || leftEdited) { const mn = ink()[0]; l = mn < l ? l - 0.6 * (l - mn) : leadEdited ? mn : l; }
  if (flickEdited) { const mx = ink()[1]; r = mx > r ? r + 0.8 * (mx - r) : mx; }

  // 6. horizontal rhythm: connectors (joinLength), bodies (bowls), both (rhythm), as one monotone map of x,
  //    so the box edges move with the ink and joins still meet
  const fast = d.rhythm;
  const kJ = connected ? Math.exp(0.45 * d.joinLength + 0.18 * fast) : 1;
  let sB = Math.exp((lower ? 0.16 * d.bowls : 0) + 0.09 * fast);
  if (fast > 0) sB *= Math.exp(0.07 * fast * gauss('uneven:' + seedKey)); // fast hands stretch unevenly
  if (kJ !== 1 || sB !== 1) {
    let xE = a.minX, xX = a.maxX;
    if (connected && a.entry) xE = firstTop(s[a.entry.si], U);
    if (connected && a.exit && !exitGone) xX = s[a.exit.si][Math.min(exitT, s[a.exit.si].length - 1)][0];
    const x0 = Math.min(xE, xX), x1 = Math.max(xE, xX);
    const f = (x) => (x < x0 ? x0 - (x0 - x) * kJ : x > x1 ? x0 + (x1 - x0) * sB + (x - x1) * kJ : x0 + (x - x0) * sB);
    s = s.map((st) => st.map((q) => [f(q[0]), q[1]]));
    l = f(l); r = f(r);
    changed = true;
  }

  // 7. lifts: letters keep a print-like gap between their bodies; the stub and the restart don't collide
  if ((liftR && (a.exit || exitGone)) || (liftL && isLowerCh(ctx.prev))) {
    const [mn, mx] = ink();
    const ex = a.exit && !exitGone ? a.exit.si : -1, en = a.entry ? a.entry.si : -1;
    const eTop = en >= 0 ? (() => { const st = s[en]; let t = 0; for (let k = 1; k < st.length; k++) { if (st[k][1] < st[t][1] - 1e-9) t = k; else if (st[k][1] > st[t][1] + 0.2 * U) break; } return t; })() : -1;
    // the letter's body within the x-height band (leaning ascenders and descenders don't count, as by eye),
    // without the exit stub and the entry tick
    let bL = Infinity, bR = -Infinity;
    for (const i of a.body) s[i].forEach((q, k) => {
      if (i === ex && k > exitT) return;
      if (i === en && k < eTop) return;
      if (q[1] < X - 0.1 * U || q[1] > m.base + 0.05 * U) return;
      if (q[0] < bL) bL = q[0]; if (q[0] > bR) bR = q[0];
    });
    if (!Number.isFinite(bL)) { bL = mn; bR = mx; }
    // gaps are between ink edges, so the pen's width (in source units) is added to the centreline gap
    const pen = Number.isFinite(p.penWidth) ? p.penWidth * (m.base - m.cap) / 700 / Math.max(0.5, p.width || 1) : 0.15 * U;
    if (liftR && (a.exit || exitGone)) {
      const g = liftSpacing(p, d, ch, ctx ? ctx.next : '', i0);
      r = Math.max(bR + 0.5 * (g.body * U + pen), mx + 0.5 * g.restart * U);
    }
    if (liftL && isLowerCh(ctx.prev)) {
      const g = liftSpacing(p, d, ctx.prev, ch, i0 - 1);
      l = Math.min(bL - 0.5 * (g.body * U + pen), mn - 0.5 * g.restart * U);
    }
    changed = true;
  }

  // 8. lean at speed: a little extra slant in the movement itself (joins keep their height, so they still meet)
  if (fast !== 0) {
    const t = Math.tan(3.5 * DEG * fast);
    s = s.map((st) => st.map((q) => [q[0] + (m.base - q[1]) * t, q[1]]));
    changed = true;
  }

  if (!changed) return v;
  const out = { ...v, l, r, s };
  if (liftL || liftR) out.lift = { before: liftL, after: liftR };
  return out;
}

addTransform(styleTransform);
