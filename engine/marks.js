// marks.js — how a writer corrects, and the marks themselves (writing-experience.md §5).
// Shared by Ink mode (sheet.js) and the writer's journey (corrections.js).
//
//   fixHabits(p)          this writer's fixed correction habits (strike style, overwrite rate, caret, ...)
//   coverQuality(a, b)    how well letter b covers letter a when written over it (0 = not a fix people make)
//   strikeItems / overItem / insertionItems / underline / caret / slash / blot / stet: page items built from
//   centerlines run through penOutline(), so marks carry this hand's pen, ink, pressure and kinematics.
//
// Page space: x right, y down, item.y = baseline; inside an item's glyph, y is up (as layout.js).
// Marks are items of kind 'mark' ({ kind, key, g: { contours, strokes }, x, y, line, ev }); every renderer,
// the timeline and the pen draw them like letters, in page order. Letters written as corrections
// (overwrites, insertions) come from layout's writeAt, so they use the same word logic as the text.

import { rng, clamp, lerp, smooth, DEG } from './core.js';
import { markHabits, CAP, UPM } from './hand.js';
import { getStyle } from './glyphs.js';
import { penOutline, getPen, penKey, strokeInk, profileOutline } from './pen.js';
import { lineBaseline, lineAngle, writeAt } from './layout.js';

// ---------- the writer's correction habits ----------
// pens that blot (wet nibs) and pens that run dry; pointed dip pens already run dry in pen.js's inkWalker
const BLOT_P = { fountain: 0.35, pointed: 0.45, italic: 0.3, felt: 0.12, gel: 0.08, ballpoint: 0.05, pencil: 0, classic: 0.08 };
const DRY_P = { ballpoint: 0.32, felt: 0.38, fountain: 0.28, gel: 0.14, italic: 0.16, pointed: 0, pencil: 0, classic: 0.1 };

const habitCache = new WeakMap();
// How this writer corrects (§5.6). Fixed per seed ('fix:' namespace); follows neatness and hurry, so the
// same writer always strikes the same way. `hurry` is read from p when the hand has one.
export function fixHabits(p) {
  let H = habitCache.get(p);
  if (H) return H;
  const r = rng('fix:' + p.seed);
  const u = Array.from({ length: 40 }, () => r()); // drawn up front: overriding one input never reshuffles the rest
  const neat = clamp(p.neatness == null ? 0.6 : p.neatness, 0, 1);
  const hurry = typeof p.hurry === 'number' ? clamp(p.hurry, 0, 1) : clamp(0.62 * (1 - neat) + 0.5 * u[0] - 0.12, 0, 1);
  const st = getStyle(p.style);
  const joined = !!(st && st.connected);
  const tidy = clamp((neat - 0.3) / 0.6 - 0.35 * (hurry - 0.4), 0, 1); // 1 = ruler-straight, 0 = scrawl
  const pick = (x, w) => { let t = 0; for (const k in w) t += w[k]; x *= t; for (const k in w) { x -= w[k]; if (x < 0) return k; } return Object.keys(w)[0]; };
  const strikeW = { line: 0.15 + 1.4 * tidy, double: 0.03 + 0.3 * tidy * tidy, wave: 0.25 * (1 - tidy), loops: (joined ? 0.45 : 0.12) * (1 - tidy), scribble: 0.02 + 0.7 * (1 - tidy) * (1 - tidy) };
  const strike = pick(u[1], strikeW);
  const alt = Object.assign({}, strikeW); delete alt[strike];
  const mixRaw = { slip: 0.4 * (0.5 + u[2]), misspell: 0.24 * (0.5 + u[3]), falseStart: 0.14 * (0.5 + u[4]), omit: 0.11 * (0.5 + u[5]), double: 0.11 * (0.5 + u[6]) };
  let tot = 0; for (const k in mixRaw) tot += mixRaw[k];
  const mix = {}; for (const k in mixRaw) mix[k] = mixRaw[k] / tot;
  const pen = penKey(p);
  H = {
    tidy, hurry, joined,
    strike,                                                         // usual stroke
    strikeAlt: pick(u[7], alt),                                     // for long runs
    scribbleWords: (1 - tidy) * (1 - tidy) * 0.55 * u[8],           // chance a whole word is scribbled out
    overshoot: (lerp(0.3, 0.05, tidy) + 0.06 * (u[9] - 0.5)) * UPM, // past each end of a strike
    rise: lerp(6, 0.6, tidy) * (0.7 + 0.6 * u[10]),                 // degrees: strikes climb a little
    bow: lerp(0.03, 0.004, tidy) * (0.6 + 0.8 * u[11]),             // fraction of the strike's length
    strikeY: 0.47 + 0.1 * (u[12] - 0.5),                            // x-heights above the baseline
    overwrite: clamp(lerp(0.88, 0.25, tidy) + 0.2 * (u[13] - 0.5), 0.1, 0.95), // one-letter slip: write over it?
    overWeight: 1.15 + 0.2 * u[14],                                 // overwrites: wider pen...
    overInk: 1.15 + 0.25 * u[15],                                   // ...more ink...
    overSize: 1.03 + 0.07 * u[16],                                  // ...a touch bigger, to cover
    retrace: lerp(0.6, 0.05, tidy) * u[17] * 1.6,                   // go over the overwrite's main stroke twice
    caret: tidy > 0.6 ? (u[18] < 0.85 ? 'below' : 'above') : tidy > 0.3 ? (u[18] < 0.6 ? 'below' : u[18] < 0.85 ? 'above' : 'slash') : (u[18] < 0.35 ? 'below' : u[18] < 0.7 ? 'above' : 'slash'),
    insertSize: lerp(0.6, 0.76, tidy) + 0.06 * (u[19] - 0.5),      // insertions above the line
    insertSlope: lerp(4, 0.3, tidy) * u[20],                        // degrees, climbing
    underline: u[21] < 0.35 ? 0 : 0.03 + 0.4 * (u[21] - 0.35) ** 2 / 0.42, // emphasis habit: many writers never underline
    underlineSwoosh: tidy < 0.45 || u[22] < 0.2,
    blot: (BLOT_P[pen] || 0) * (0.5 + (1 - tidy)) * u[23],
    dry: (DRY_P[pen] || 0) * (0.3 + 1.0 * u[24]),
    dryLow: 0.38 + 0.2 * u[25],                                     // ink density when it gives out
    dryRetrace: pen === 'ballpoint' || pen === 'gel' ? u[26] < 0.65 : pen === 'felt' ? u[26] < 0.4 : false,
    ps: u[27] < 0.88,                                               // squeezes a P.S. in smaller
    psSize: 0.74 + 0.16 * u[28],
    psTilt: (1 - tidy) * 3.5 * u[29],
    wordStrike: clamp(lerp(0.55, 0.95, tidy) + 0.15 * (u[30] - 0.5), 0, 1), // a fix inside a word: strike the whole word?
    // how this writer scribbles a word out: a temperament (tight zig-zags, big angry blackouts, loopy coils)
    // and how big, dense and wild their scribbles run; every scribble still varies a lot around it
    scribble: {
      kinds: { zigzag: 0.35 + 0.9 * tidy * u[32], blackout: 0.1 + 1.6 * (1 - tidy) * (0.4 + hurry) * u[33], coil: (joined ? 0.55 : 0.15) + 0.5 * u[34] },
      size: 0.85 + 0.25 * (1 - tidy) + 0.2 * u[35],      // height, × the instance's own
      dense: 0.75 + 0.5 * u[36],                          // spacing of the back-and-forth (smaller = denser)
      chaos: clamp(0.25 + 0.6 * (1 - tidy) + 0.3 * (u[37] - 0.5), 0.1, 1), // how much one scribble changes along the way
      lean: (u[38] - 0.5) * 30,                           // degrees: the hand's habitual tilt of the zig-zag
      lift: u[39],                                        // how often a second pass starts with the pen lifted
    },
    mix, pen,
  };
  habitCache.set(p, H);
  return H;
}

// ---------- letters people write over each other ----------
// [wrong, right, how well the right letter covers the wrong one when written over it]
export const COVER = [
  ['c', 'e', 1], ['c', 'o', 1], ['c', 'a', 0.8], ['c', 'd', 0.8], ['c', 'g', 0.7], ['c', 'q', 0.7],
  ['o', 'a', 0.9], ['o', 'd', 0.8], ['o', 'g', 0.7], ['o', 'q', 0.8], ['o', 'b', 0.55], ['e', 'a', 0.6],
  ['a', 'd', 0.8], ['a', 'g', 0.8], ['a', 'q', 0.8], ['u', 'a', 0.5], ['u', 'y', 0.8], ['v', 'y', 0.8],
  ['v', 'w', 0.9], ['u', 'w', 0.6], ['v', 'u', 0.5], ['n', 'm', 1], ['n', 'h', 0.9], ['r', 'n', 0.9],
  ['r', 'm', 0.7], ['i', 'l', 0.6], ['i', 't', 0.8], ['l', 't', 0.8], ['l', 'b', 0.8], ['l', 'k', 0.8],
  ['l', 'h', 0.8], ['l', 'd', 0.6], ['i', 'j', 0.7], ['t', 'f', 0.8], ['l', 'f', 0.6], ['h', 'b', 0.7],
  ['J', 'G', 0.6], ['C', 'G', 1], ['C', 'O', 1], ['C', 'Q', 0.8], ['O', 'Q', 1], ['F', 'E', 1], ['L', 'E', 0.9],
  ['I', 'T', 0.9], ['I', 'L', 0.7], ['P', 'B', 1], ['P', 'R', 1], ['V', 'W', 0.9], ['N', 'M', 0.8], ['I', 'H', 0.6],
  // a small letter where a capital belonged (a sentence start)
  ['t', 'T', 0.8], ['s', 'S', 0.9], ['c', 'C', 1], ['o', 'O', 1], ['w', 'W', 0.9], ['v', 'V', 1],
  ['u', 'U', 0.9], ['x', 'X', 1], ['z', 'Z', 1], ['k', 'K', 0.6], ['p', 'P', 0.7], ['m', 'M', 0.6],
  ['1', '7', 1], ['3', '8', 1], ['1', '4', 0.8], ['0', '8', 0.6], ['5', '6', 0.6], ['6', '8', 0.5],
];
export const COVER_BY_RIGHT = new Map();
const COVER_Q = new Map();
for (const [w, rt, q] of COVER) {
  if (!COVER_BY_RIGHT.has(rt)) COVER_BY_RIGHT.set(rt, []);
  COVER_BY_RIGHT.get(rt).push([w, q]);
  COVER_Q.set(w + rt, q);
}
export const coverQuality = (wrong, right) => COVER_Q.get(wrong + right) || 0;

// ---------- geometry helpers ----------
// ink extent of items in page space (from stroke centerlines)
export function spanOf(items) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of items) {
    if (!it || !it.g) continue;
    for (const st of it.g.strokes) {
      const c = st.center, step = Math.max(1, c.length >> 4);
      for (let i = 0; i < c.length; i += i + step < c.length ? step : Math.max(1, c.length - 1 - i)) {
        const X = it.x + c[i][0], Y = it.y - c[i][1];
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
    }
  }
  return { x0, x1, y0, y1 };
}
// the baseline under a run of items: y(x), through their origins, at their mean angle
export function baselineOf(items) {
  let sx = 0, sy = 0, sr = 0, n = 0;
  for (const it of items) { sx += it.x; sy += it.y; sr += it.rot || 0; n++; }
  const mx = sx / n, my = sy / n, t = Math.tan(sr / n);
  return (x) => my - t * (x - mx);
}
// the same, but on the line's own curve (lines: Map n -> page.lineInfo entry), lifted to where these
// letters actually sit (their word's float)
export function baselineFor(p, run, lines) {
  const ln = lines && run.length && lines.get(run[0].line);
  if (!ln) return baselineOf(run);
  let off = 0;
  for (const it of run) off += it.y - lineBaseline(p, ln, it.x);
  off /= run.length;
  return (x) => lineBaseline(p, ln, x) + off;
}
export const scaleOf = (items) => { let s = 0, n = 0; for (const it of items) if (it.g && it.g.pose) { s += it.g.pose.scale || 1; n++; } return n ? s / n : 1; };
export const rotScale = (a, s) => { const c = Math.cos(a) * s, n = Math.sin(a) * s; return (q) => [c * q[0] - n * q[1], n * q[0] + c * q[1]]; };
export const inkWidth = (p) => p.penWidth * (getPen(p).wScale || 1);

// Run every stroke's centerline through `f` and the pen again (a scaled or rotated glyph keeps this pen's
// width and ink). `extra(strokes)` may add strokes (a retrace).
export function repen(p, g, f, seed, extra) {
  const hab = markHabits(p);
  let src = g.strokes.map((st) => Object.assign({}, st, { center: st.center.map(f) }));
  if (extra) src = extra(src);
  const strokes = [];
  src.forEach((st, i) => {
    const round = st.dot && !(st.mark === 'dot' && hab.dot !== 'dot');
    const c = penOutline(p, st.center, seed + i * 3.1, round ? { dot: true } : undefined);
    if (c) strokes.push(Object.assign({}, st, { contour: c }));
  });
  return Object.assign({}, g, { strokes, contours: strokes.map((s) => s.contour) });
}

// A copy of g with each stroke's ink profile changed by f(profile, strokeIndex) (density, width).
// f returns true when it changed widths (the outline is then rebuilt).
export function reink(p, g, f) {
  const strokes = g.strokes.map((st, si) => {
    const pr0 = strokeInk(p, st);
    if (!pr0) return st;
    const pr = Object.assign({}, pr0, { d: Float64Array.from(pr0.d), w: Float64Array.from(pr0.w) });
    const widened = f(pr, si);
    const contour = widened ? profileOutline(pr) : st.contour.slice();
    contour.ink = pr;
    return Object.assign({}, st, { contour });
  });
  return Object.assign({}, g, { strokes, contours: strokes.map((s) => s.contour) });
}

export const MARK_VARIANT = { id: 'correction', source: { name: 'Correction mark', credit: 'Seedhand engine (writing-experience.md §5)' } };
const POSE0 = { slant: 0, scale: 1, squeeze: 1 };

// One page item made of pen strokes given in page coordinates. ref: the item it belongs with (line,
// para, word, inkIndex, tempo). o: { seed, delayed, tempo, ink (density ×), fix, wk, key, dot (each stroke a dab) }
export function markItem(p, kind, strokesPage, ref, o) {
  const first = strokesPage.find((s) => s.length >= 2);
  if (!first) return null;
  const ox = first[0][0], oy = first[0][1];
  const strokes = [];
  strokesPage.forEach((pts, i) => {
    if (pts.length < 2) return;
    const center = pts.map(([X, Y]) => [X - ox, oy - Y]);
    const c = penOutline(p, center, o.seed + i * 3.1, o.dot ? { dot: true } : undefined);
    if (!c) return;
    if (o.ink) for (let k = 0; k < c.ink.n; k++) c.ink.d[k] *= o.ink;
    strokes.push({ center, contour: c, dot: !!o.dot, mark: kind, delayed: !!o.delayed });
  });
  if (!strokes.length) return null;
  return {
    kind: 'mark', ch: '', x: ox, y: oy, rot: 0,
    g: { advance: 0, contours: strokes.map((s) => s.contour), strokes, variant: MARK_VARIANT, pose: POSE0 },
    charIndex: -1, inkIndex: ref.inkIndex, line: ref.line, para: ref.para, word: ref.word, wk: o.wk || ref.wk, wkey: ref.wkey, // the pen writes a delayed mark once its word is done
    tempo: (ref.tempo || 1) * (o.tempo || 1), role: 'mark', mark: kind, fix: o.fix, key: o.key,
  };
}

// ---------- strike-throughs (§5.1) ----------
// Centerlines over [x0, x1]. base(x) = baseline (page y), h = height above it, xh = x-height here,
// W = pen width. Returns strokes (arrays of page points).
export function strikeStrokes(H, N, how, x0, x1, base, h, xh, W, r) {
  const oL = H.overshoot * (0.5 + 0.8 * r()), oR = H.overshoot * (0.7 + 0.9 * r());
  const xs = x0 - Math.min(oL, 0.6 * xh), xe = x1 + Math.min(oR, 0.9 * xh), L = Math.max(1, xe - xs);
  let tilt = Math.tan((H.rise * (0.6 + 0.8 * r()) + r.gauss() * 1.2) * DEG);
  tilt = clamp(tilt, -0.3 * xh / L, 0.4 * xh / L);           // climbs, but stays in the word
  const bow = (r() < 0.6 ? -1 : 1) * H.bow * L * (0.5 + r());
  const wob = 0.02 * xh * (1 - H.tidy), nOff = r() * 50;
  const mid = (x, dy) => base(x) - h + dy - tilt * (x - xs - L / 2);
  const line = (dy, dTilt, dir) => {
    const n = Math.max(6, Math.ceil(L / 14)), pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = xs + u * L;
      pts.push([x, mid(x, dy) - dTilt * (x - xs - L / 2) - bow * Math.sin(Math.PI * u) + wob * N.n1(u * 3 + nOff)]);
    }
    return dir < 0 ? pts.reverse() : pts;
  };
  switch (how) {
    case 'double': {
      const gap = (0.15 + 0.05 * r()) * xh;
      return [line(0.45 * gap, 0, 1), line(-0.55 * gap, Math.tan(r.gauss() * DEG), -1)];
    }
    case 'wave': {
      const amp = (0.11 + 0.07 * r()) * xh, lam = (0.45 + 0.25 * r()) * xh, ph = r() * 6.28;
      const n = Math.ceil(L / (lam / 12)), pts = [];
      for (let i = 0; i <= n; i++) { const u = i / n, x = xs + u * L; pts.push([x, mid(x, 0) - bow * Math.sin(Math.PI * u) + amp * Math.sin(2 * Math.PI * (x - xs) / lam + ph)]); }
      return [pts];
    }
    case 'loops': {
      // a prolate trochoid, the cursive coil: loops like small e's, taller than wide, overlapping a little
      const adv = (0.36 + 0.12 * r()) * xh, ry = (0.27 + 0.08 * r()) * xh, rx = (0.16 + 0.06 * r()) * xh, rr = adv / (2 * Math.PI);
      const T = (L / adv) * 2 * Math.PI, n = Math.ceil(T / (2 * Math.PI) * 18), pts = [];
      for (let i = 0; i <= n; i++) { const th = T * i / n, x = xs + rr * th + rx * Math.sin(th); pts.push([x, mid(x, 0) + ry * Math.cos(th) * (1 + 0.12 * N.n1(th * 0.4 + nOff))]); }
      return [pts];
    }
    case 'scribble': return scribbleStrokes(H, N, xs, xe, base, xh, W, r, nOff);
    // crossed out again (sheet.js again()): a blackout whatever the writer's usual kind, and 'inkout', the last
    // straw: denser, taller and more passes, until the word is gone under the ink
    // 'scrawl' (level 3): the writer's own scribble, but never a blackout yet, so the word still shows through
    case 'scrawl': case 'blackout': case 'inkout': return scribbleStrokes(H, N, xs, xe, base, xh, W, r, nOff, how);
    default: return [line(0, 0, 1)]; // 'line': one fast, firm stroke, slightly rising
  }
}

// A word scribbled out (Rafael: "when humans are really crossing something out, they get messy with it ...
// it becomes quite tall, there's a lot of overlap, it hides more of the word, and it varies drastically").
// Each scribble is one of the writer's kinds, with its own size, density and wildness around their habit:
//   zigzag    quick back-and-forth, a hair taller than the x-height, one or two passes
//   blackout  big and angry: tall (into ascenders and descenders), dense, three or four overlapping passes
//             at changing slants, back-tracking, heavier ink
//   coil      loopy overlapping loops that grow and shrink, spilling above and below
// Along the way the pitch, the height, the slant of the strokes and the line it follows all drift, passes
// double back, and a pass may start with the pen lifted. The pen model then darkens the turns (slow) and the
// crossings (ink adds up). Returns strokes (page points); .ink and .tempo say how heavy and fast it went.
function scribbleStrokes(H, N, xs, xe, base, xh, W, r, nOff, force) {
  const S = H.scribble || { kinds: { zigzag: 1 }, size: 1, dense: 1, chaos: 0.5, lean: 0, lift: 0.3 };
  let tot = 0;
  for (const k in S.kinds) tot += S.kinds[k];
  let pk = r() * tot, kind = 'zigzag';
  const u0 = pk / (tot || 1);
  for (const k in S.kinds) { pk -= S.kinds[k]; if (pk < 0) { kind = k; break; } }
  // (the roll above is drawn either way, so forcing a kind never reshuffles the rest of this scribble)
  const out = force === 'inkout';
  if (force === 'scrawl') {
    // the writer's kinds without the blackout (drawn from the same roll, so the rest of the scribble is unchanged)
    let t2 = 0;
    for (const k in S.kinds) if (k !== 'blackout') t2 += S.kinds[k];
    let pk2 = u0 * t2;
    kind = 'zigzag';
    for (const k in S.kinds) { if (k === 'blackout') continue; pk2 -= S.kinds[k]; if (pk2 < 0) { kind = k; break; } }
  } else if (force) kind = 'blackout';
  const chaos = clamp(S.chaos + 0.25 * r.gauss(), 0.05, 1.2);
  const L0 = Math.max(1, xe - xs);
  // this one's size and density (a wide per-instance spread around the writer's habit)
  const tall = S.size * (kind === 'blackout' ? 1.35 + 0.6 * r() : kind === 'coil' ? 1.1 + 0.5 * r() : 0.95 + 0.4 * r()) * (out ? 1.15 : 1);
  const half = 0.5 * tall * xh;                                           // half the scribble's height
  const mid0 = (0.45 + 0.12 * r.gauss()) * xh;                            // its middle, above the baseline
  const dx0 = clamp(S.dense * (kind === 'blackout' ? 1.1 + 0.9 * r() : kind === 'coil' ? 2.4 + 1.4 * r() : 1.25 + 1.05 * r()) * W * (out ? 0.7 : 1), (out ? 0.028 : 0.035) * UPM, 0.16 * UPM);
  let passes = kind === 'blackout' ? 3 + (r() < 0.45 ? 1 : 0) : kind === 'coil' ? (r() < 0.35 + 0.3 * chaos ? 2 : 1) : (r() < 0.5 + 0.4 * chaos ? 2 : 1);
  if (out) passes += 1 + (r() < 0.5 ? 1 : 0);                              // inked out: back and forth until it's gone
  passes = Math.max(1, Math.min(passes, Math.floor((out ? 110 : 80) / Math.max(3, L0 / dx0)))); // a long word: fewer passes
  const ex = (0.05 + 0.3 * chaos * r()) * xh * (force ? 0.25 : 1);       // past the word's ends (crossed out again: kept off its neighbours)
  const a0 = xs - ex * r(), b0 = xe + ex * r();
  const drift = (r() - 0.5) * 2 * (2 + 7 * chaos) * DEG;                  // off the line's own angle
  const tiltAt = (x, t) => Math.tan(t) * (x - (a0 + b0) / 2);
  const strokes = [];
  let cur = [];
  let seedK = nOff;
  for (let k = 0; k < passes; k++) {
    // each pass: its own direction, slant, height and line; later passes often shorter, shifted, crossing
    const back = k % 2 === 1;
    const lean0 = (S.lean + (k === 0 ? r.gauss() * 10 : (back ? 1 : -1) * (15 + 30 * r()))) * DEG;
    const ampK = (k === 0 ? 1 : 0.7 + 0.45 * r()) * (kind === 'blackout' ? 1 : 1 - 0.1 * k);
    const dyK = (k === 0 ? 0 : r.gauss() * 0.12) * xh;
    let a = a0 + (k ? 0.18 * r() * L0 : 0), b = b0 - (k ? 0.18 * r() * L0 : 0);
    if (back) [a, b] = [b, a];
    const dir = Math.sign(b - a) || 1;
    const tiltK = drift + (k ? r.gauss() * 4 * chaos * DEG : 0);
    const dxK = dx0 * (0.8 + 0.4 * r());
    const loop = kind === 'coil' ? 0.55 + 0.5 * r() : kind === 'blackout' ? 0.45 * r() : 0.08 + 0.3 * r() * (0.4 + chaos); // curl at the turns
    // turning points: each stroke its own length, spacing and slant; now and then the pen steps back
    const turns = [];
    let x = a, side = r() < 0.5 ? 1 : -1, guard = 0;
    let doubledBack = false;
    while ((dir > 0 ? x < b : x > b) && guard++ < 400) {
      const t = (x - a) / (b - a);
      let step = dxK * Math.exp(0.55 * chaos * r.gauss()) * (0.7 + 0.6 * r());
      if (!doubledBack && t > 0.3 && r() < 0.06 + 0.12 * chaos) { step = -dxK * (2 + 4 * r()); doubledBack = true; } // scrub back over it, once
      x = clamp(x + dir * step, Math.min(a, b) - dxK, Math.max(a, b) + dxK);
      let h = half * ampK * ((k ? 0.55 : 0.7) + (k ? 0.6 : 0.45) * r()); // (the first pass covers the word)
      if (r() < 0.12 + 0.2 * chaos) h *= 1.15 + 0.25 * r();                 // a big angry one
      h = Math.min(h, 1.3 * xh);                                           // into ascenders and descenders, not the next line
      const mid = mid0 + dyK + 0.16 * xh * chaos * N.n1(t * 4 + seedK);     // the scribble wanders up and down
      const lean = clamp(lean0 + r.gauss() * (9 + 18 * chaos) * DEG, -50 * DEG, 50 * DEG); // (past ~50° a stroke lies flat)
      const spill = force ? 0.15 : 0.6;
      const px = clamp(x + side * h * Math.tan(lean), Math.min(a, b) - spill * xh, Math.max(a, b) + spill * xh);
      turns.push([px, clamp(mid + side * h, -1.0 * xh, 2.0 * xh), side, step]); // from descenders to ascenders
      side = -side;
    }
    // through the turning points: rounded turns, curling into loops where this scribble loops
    const pts = [];
    for (let j = 0; j < turns.length; j++) {
      const [px, v, sd] = turns[j];
      const c = loop * dxK * (0.6 + 0.8 * r()) * dir * (kind === 'coil' ? 1 : sd);
      pts.push([px - 0.5 * c, v - sd * 0.12 * Math.abs(c)], [px + 0.5 * c, v - sd * 0.12 * Math.abs(c)]);
    }
    const curve = catmullRom(pts, 7);
    for (const [px, v] of curve) cur.push([px, base(px) - v - tiltAt(px, tiltK)]);
    seedK += 3.7;
    if (k < passes - 1 && r() < S.lift * 0.6) { if (cur.length > 1) strokes.push(cur); cur = []; } // a lift before the next pass
  }
  if (cur.length > 1) strokes.push(cur);
  strokes.ink = (kind === 'blackout' ? 1.15 + 0.2 * r() : 1 + 0.12 * r()) * (out ? 1.12 : 1);
  // crossed out again: the hand goes faster at it (so a held key and the pen keep together)
  strokes.tempo = (kind === 'blackout' ? 3.2 : kind === 'coil' ? 2.4 : 2.8) * (force ? 1.3 : 1);
  strokes.kind = kind;
  return strokes;
}

// Catmull-Rom (uniform) through pts, n samples per segment: a pen's rounded path through its turns. Uniform,
// so it can never fly off: it strays from the points by at most a fraction of their spacing.
function catmullRom(pts0, n) {
  const pts = [];
  for (const q of pts0) { const l = pts[pts.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 2) pts.push(q); }
  if (pts.length < 3) return pts.slice();
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [pts[0]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let j = 1; j <= n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  return out;
}

// Strike glyph items (one stroke set per line). firm: params with the firmer pressure people cross out with.
// Returns { items, start: [x, y] where the pen first touched, ref: last struck item }
export function strikeItems(p, firm, H, struck, how, r, o = {}) {
  const lines = new Map();
  for (const it of struck) { if (!it.g) continue; if (!lines.has(it.line)) lines.set(it.line, []); lines.get(it.line).push(it); }
  const xh0 = p.xHeight * CAP, W = inkWidth(p);
  const items = [];
  let start = null, ref = null, n = 0;
  for (const run of lines.values()) {
    const sp = spanOf(run), base = baselineFor(p, run, o.lines), xh = xh0 * scaleOf(run);
    const small = run.some((it) => /\p{Ll}/u.test(it.ch));
    const h = small ? H.strikeY * xh * (1 + 0.08 * r.gauss()) : 0.45 * CAP * scaleOf(run);
    const strokes = strikeStrokes(H, p.noise, how, sp.x0, sp.x1, base, h, xh, W, r);
    ref = run[run.length - 1];
    const mi = markItem(firm, how === 'scribble' || how === 'scrawl' || how === 'blackout' || how === 'inkout' ? 'scribble' : 'strike', strokes, ref, Object.assign({ delayed: true, tempo: strokes.tempo || 1.25 }, o, { lines: undefined, ink: strokes.ink, seed: (o.seed || 311) + n * 13.7, key: o.key ? o.key + ':' + n : undefined }));
    if (mi && strokes.kind) mi.scribble = strokes.kind;
    if (mi) items.push(mi);
    if (!start) start = strokes[0][0];
    n++;
  }
  return { items, start, ref };
}

// k: underlines already under these words (0 = the first): a second sits clearly below it, a little shorter
export function underlineStrokes(H, x0, x1, base, xh, r, k = 0) {
  let xs = x0 - (0.02 + 0.04 * r()) * UPM, xe = x1 + (0.04 + 0.1 * r()) * UPM;
  if (k) { const cut = 0.1 * k * (xe - xs); xs += cut * (0.3 + 0.4 * r()); xe -= cut * 0.6; }
  const L = Math.max(1, xe - xs);
  const drop = (0.17 + 0.1 * r() + 0.22 * k) * xh, tilt = Math.tan((0.5 + 2.5 * r()) * DEG);
  const n = Math.max(6, Math.ceil(L / 14)), pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = xs + u * L;
    let y = base(x) + drop - tilt * (x - xs) + 0.012 * L * Math.sin(Math.PI * u) * (H.tidy - 0.5);
    if (H.underlineSwoosh) y -= 0.3 * xh * smooth((u - 0.72) / 0.28) * smooth((u - 0.72) / 0.28); // the end flicks up
    pts.push([x, y]);
  }
  return [pts];
}

// ---------- let it stand: stet (Undo on dry ink, sheet.js stet()) ----------
// A crossing-out taken back the way editors and proofreaders always have: a row of dots under the struck word
// and "stet" ("let it stand") in the margin, in this writer's own hand. The dots are the writer's own: round
// dabs, or the little dashes and ticks they dot their i's with. Fixed per seed ('stet:' namespace, so no other
// habit moves); follows how tidy the writer is.
const stetCache = new WeakMap();
export function stetHabits(p) {
  let S = stetCache.get(p);
  if (S) return S;
  const r = rng('stet:' + p.seed);
  const u = Array.from({ length: 8 }, () => r());
  const H = fixHabits(p), dot = markHabits(p).dot;
  S = {
    dot: dot === 'dash' || dot === 'tick' ? dot : 'dot',
    pitch: lerp(0.66, 0.46, H.tidy) * (0.85 + 0.3 * u[0]),        // x-heights from one dot to the next
    uneven: lerp(0.2, 0.06, H.tidy),                               // how unevenly they fall
    drop: 0.26 + 0.1 * u[1],                                       // x-heights under the baseline
    size: clamp(H.insertSize * (0.94 + 0.16 * u[2]), 0.56, 0.84),  // the stet: small, like a word above the line
    gap: 0.55 + 0.45 * u[3],                                       // x-heights clear of where the writing starts
    tilt: (1 - H.tidy) * 5 * (u[4] - 0.4),                         // degrees: a note in the margin sits a little askew
    lead: u[5] < 0.5,                                              // the stet before the dots (else dots first)
  };
  stetCache.set(p, S);
  return S;
}

// One dot (page points, y down) at (x, y) in the writer's habit: a dab, a little dash, or a tick.
function stetDot(p, shape, x, y, xh, r) {
  const seg = (L, a) => { const c = Math.cos(a) * L / 2, s = Math.sin(a) * L / 2; return [[x - c, y + s], [x, y], [x + c, y - s]]; };
  if (shape === 'dash') return seg(0.13 * xh * (0.8 + 0.4 * r()), (14 + 9 * r.gauss()) * DEG);
  if (shape === 'tick') return seg(0.09 * xh * (0.8 + 0.4 * r()), (-55 + 10 * r.gauss()) * DEG);
  return seg(p.penWidth * 0.35 * (p.dotSize || 1), 0.3 + 0.9 * r() + (p.slant || 0) * DEG);
}
// The row of dots under [x0, x1] (a struck word's ink): base(x) = its baseline (page y), `drop` x-heights below.
// Evenly spaced the way a quick hand spaces them, following the line, a dot every `pitch` x-heights.
export function stetDotStrokes(p, S, x0, x1, base, xh, drop, r) {
  const xs = x0 + (0.04 + 0.1 * r()) * xh, xe = x1 - (0.02 + 0.12 * r()) * xh, L = Math.max(0, xe - xs);
  const n = Math.max(2, Math.round(L / (S.pitch * xh)) + 1);
  const tilt = Math.tan(r.gauss() * 1.2 * DEG);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = xs + (i / (n - 1)) * L + r.gauss() * S.uneven * S.pitch * xh;
    out.push(stetDot(p, S.dot, x, base(x) + drop * xh - tilt * (x - xs) + r.gauss() * 0.03 * xh, xh, r));
  }
  return out;
}

// "stet", small, in the margin of the struck word's line: its right end just clear of where the writing starts
// (and left of a ruled margin), on the line's own curve, a little askew. Never on other ink: past anything
// already in the margin there (an earlier stet), and null when the margin has no room for it (the caller writes it
// above the word instead). ln: the line (lineInfo); edge: where its writing starts (page x); rule: a margin rule's
// x, if the paper has one; boxes: the ink boxes on the sheet ([x0, y0, x1, y1]). Returns writeAt's { items, runs }.
export function stetInMargin(p, S, { ln, edge, rule, boxes, xh, size, lean, seed, line, r }) {
  const pad = 0.12 * xh;
  let xr = Math.min(edge - S.gap * xh, rule == null ? Infinity : rule - (0.3 + 0.2 * r()) * xh);
  const angle = (S.tilt + r.gauss() * 0.8) * DEG;
  let s = size;
  for (let tries = 0; tries < 4; tries++) {
    let w = writeAt(p, 'stet', { x: 0, y: 0, angle: angle + lineAngle(p, ln, xr), lean, size: s, seed, line });
    let ext = boxOf(w.items);
    // a narrow margin: the stet a little smaller, never smaller than three quarters of its size
    const room = xr - pad, need = ext.x1 - Math.min(0, ext.x0);
    if (need > room) {
      if (room < 0.75 * need) return null;
      s *= room / need;
      w = writeAt(p, 'stet', { x: 0, y: 0, angle: angle + lineAngle(p, ln, xr), lean, size: s, seed, line });
      ext = boxOf(w.items);
    }
    const x0 = Math.max(pad - Math.min(0, ext.x0), xr - ext.x1 - r() * 0.12 * xh);
    const at = shifted(w, x0, lineBaseline(p, ln, x0));
    const b = boxOf(at.items), m = 0.06 * xh;
    const hit = boxes.filter((q) => q[0] < b.x1 + m && q[2] > b.x0 - m && q[1] < b.y1 + m && q[3] > b.y0 - m);
    if (!hit.length) return at;
    xr = Math.min(...hit.map((q) => q[0])) - 0.35 * xh; // further out, past what's there
  }
  return null;
}

// ‸ in a gap (§5.3): 'below' = a caret standing on the baseline, pointing up at the insertion; 'above' =
// a ∨ between this line and the insertion; 'slash' = one stroke up to it. yIns = the insertion's baseline.
export function caretStrokes(how, cx, base, xh, yIns, r) {
  const w = (0.5 + 0.18 * r()) * xh, j = () => r.gauss() * 0.025 * xh;
  const y0 = base(cx);
  if (how === 'above') {
    const tip = y0 - xh * 1.04, top = Math.min(tip - 0.4 * xh, yIns + 0.08 * xh);
    return [[[cx - w / 2 + j(), top + j()], [cx - w / 4, (top + tip) / 2], [cx + j(), tip], [cx + w / 4, (top + tip) / 2 - 0.03 * xh], [cx + w / 2 + j(), top - 0.05 * xh]]];
  }
  if (how === 'slash') return [[[cx - 0.12 * xh, y0 + 0.2 * xh], [cx + 0.02 * xh, y0 - 0.4 * xh], [cx + 0.16 * xh + j(), Math.max(yIns + 0.1 * xh, y0 - 1.25 * xh)]]];
  const foot = y0 + (0.22 + 0.08 * r()) * xh, apex = y0 - (0.62 + 0.2 * r()) * xh;
  return [[[cx - w / 2 + j(), foot], [cx - w / 4, (foot + apex) / 2 + 0.02 * xh], [cx + j(), apex], [cx + w / 4, (foot + apex) / 2], [cx + w / 2 + j(), foot - 0.03 * xh]]];
}

// a word split with "/" (a space typed inside a word) or a new paragraph marked "//" (Enter mid-text)
export function slashStrokes(kind, cx, base, xh, r) {
  const one = (dx) => [[cx + dx - 0.16 * xh, base(cx) + 0.25 * xh], [cx + dx + 0.18 * xh + r.gauss() * 0.02 * xh, base(cx) - 1.15 * xh]];
  return kind === 'para' ? [one(-0.13 * xh), one(0.13 * xh)] : [one(0)];
}

// a blot where the wet pen rested (§5.5), at page point (X, Y): a lopsided drop with a short tail where
// the nib dragged off, not a round dot (that would read as a full stop)
export function blotItem(p, X, Y, ref, r, seed, o = {}) {
  const pen = getPen(p);
  const W = inkWidth(p);
  const a = (r() * 2 - 1) * 0.9 + (r() < 0.5 ? 0 : Math.PI), L = W * (1.3 + 0.9 * r()), pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8, wob = 0.18 * W * Math.sin(u * 5 + seed);
    pts.push([Math.cos(a) * L * u - Math.sin(a) * wob, Math.sin(a) * L * u + Math.cos(a) * wob]);
  }
  const pr = pen.profile(p, pts, 77 + seed * 5.3, null);
  if (!pr) return null;
  const k = 2.1 + 1.1 * r();
  for (let i = 0; i < pr.n; i++) {
    const u = pr.s[i] / (pr.len || 1);
    pr.w[i] = W * lerp(k, 0.55, smooth(u * 1.3)) * (0.9 + 0.2 * Math.sin(i * 2.3 + seed)); // fat head, thin tail
    pr.d[i] *= 1.5;
  }
  const c = profileOutline(pr);
  c.ink = pr;
  const st = { center: pts, contour: c, dot: false, mark: 'blot', delayed: true };
  return {
    kind: 'mark', ch: '', x: X, y: Y, rot: 0,
    g: { advance: 0, contours: [c], strokes: [st], variant: MARK_VARIANT, pose: POSE0 },
    charIndex: -1, inkIndex: ref.inkIndex, line: ref.line, para: ref.para, word: ref.word, wk: o.wk || ref.wk, wkey: ref.wkey, // the pen writes a delayed mark once its word is done
    tempo: ref.tempo || 1, role: 'mark', mark: 'blot', fix: o.fix, key: o.key,
  };
}

// ---------- writing at a place (layout's writeAt), moved as a block ----------
function shifted(w, dx, dy) {
  const box = (b) => (b ? [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy] : b);
  return {
    items: w.items.map((it) => Object.assign({}, it, { x: it.x + dx, y: it.y + dy, box: box(it.box) })),
    runs: w.runs.map((rn) => Object.assign({}, rn, { x: rn.x + dx, y: rn.y + dy, box: box(rn.box), pid: rn.id + '@' + Math.round(rn.x + dx) + ',' + Math.round(rn.y + dy) })),
    stops: w.stops.map((sp) => Object.assign({}, sp, { x: sp.x + dx, y: sp.y + dy })),
    endX: w.endX + dx,
  };
}
const boxOf = (items) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) if (it.box) { x0 = Math.min(x0, it.box[0]); y0 = Math.min(y0, it.box[1]); x1 = Math.max(x1, it.box[2]); y1 = Math.max(y1, it.box[3]); }
  return { x0, y0, x1, y1 };
};
export const leanOf = (p, it) => { const pose = (it.g && it.g.pose) || {}; return clamp((pose.slant == null ? p.slant || 0 : pose.slant) - (p.slant || 0), -6, 6); };

// ---------- overwrite (§5.2) ----------
// The right letter over the wrong glyph item `wr`: a heavier pen (layout's weight: pen width, and the
// renderers' ink), a touch bigger, centred on the wrong letter's ink and a little off so the old letter
// shows; messy hands go over the main stroke twice. heavy: params with the wider pen (for the retrace).
// Returns { item, runs } (the runs index the item as items[0]).
export function overItem(p, heavy, H, wr, ch, seed, r) {
  const w = writeAt(p, ch, { x: wr.x, y: wr.y, angle: wr.rot || 0, lean: leanOf(p, wr), size: ((wr.g.pose && wr.g.pose.scale) || 1) * H.overSize, weight: H.overWeight, seed, line: wr.line });
  const it0 = w.items.find((it) => it.kind === 'glyph' && it.g);
  if (!it0) return null;
  let g = it0.g, glyph = it0.glyph;
  const main = g.strokes.reduce((b, st, i) => (!st.dot && st.center.length > (b < 0 ? 0 : g.strokes[b].center.length) ? i : b), -1);
  if (main >= 0 && r() < H.retrace) {
    const off = (r() - 0.5) * 0.03 * UPM;
    // the same second pass on the posed letter (renderSVG, canvas) and on its unposed form (run renderers)
    const again = (gg) => {
      if (!gg || !gg.strokes[main]) return gg;
      const st = gg.strokes[main];
      const center = st.center.map((q) => [q[0] + off, q[1] - off * 0.6]);
      const c = penOutline(heavy, center, 501 + main * 3.1);
      if (!c) return gg;
      const strokes = [...gg.strokes.slice(0, main + 1), Object.assign({}, st, { center, contour: c }), ...gg.strokes.slice(main + 1)];
      return Object.assign({}, gg, { strokes, contours: strokes.map((x) => x.contour) });
    };
    g = again(g);
    glyph = again(glyph);
  }
  const a = spanOf([wr]), b = spanOf([Object.assign({}, it0, { g })]);
  const dx = (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2 + r.gauss() * 0.035 * UPM, dy = r.gauss() * 0.012 * UPM;
  const sh = shifted({ items: [Object.assign({}, it0, { g }, glyph ? { glyph } : {})], runs: w.runs, stops: [], endX: w.endX }, dx, dy);
  const item = Object.assign({}, sh.items[0], {
    inkIndex: wr.inkIndex, para: wr.para, word: wr.word, wk: wr.wk, tempo: (wr.tempo || 1) / 1.3, role: 'over', charIndex: -1,
  });
  return { item, runs: sh.runs };
}

// ---------- insertion above the line (§5.3) ----------
// Writes `text` small above the line (layout's writeAt): over a caret in the gap between `left` and
// `right` (glyph items), or centred over the struck run `sub` (a substitution, no caret), or continuing an
// earlier insertion block `cont` (typing on: no new caret). above = items of the line above (for the room
// left); lines = Map n -> lineInfo (the real line curve). Returns { items, runs, stops, block, shift }:
// items = the caret (a mark) and the letters (their charIndex = offset in `shift` + text), runs index the
// letters as items[0..], stops use offsets within the text.
export function insertionItems(p, H, { left, right, sub, cont, above = [], clear, text, seed, maxW, r, ref, lines, caret = true }) {
  if (cont) {
    const lead = cont.space ? ' ' : '';
    const y = cont.yb - Math.tan(cont.slope) * (cont.endX - cont.x0);
    const w = writeAt(p, lead + text, { x: cont.endX, y, angle: cont.slope, lean: cont.lean, size: cont.s, seed, line: cont.line });
    return { items: w.items, runs: w.runs, stops: w.stops.map((sp) => Object.assign({}, sp, { o: sp.o - lead.length })).filter((sp) => sp.o >= 0), shift: lead.length,
      block: Object.assign({}, cont, { endX: w.endX, space: /\s$/.test(text) }) };
  }
  const xh0 = p.xHeight * CAP;
  const anchor = sub && sub.length ? sub : [left];
  const line = anchor[anchor.length - 1].line;
  const onLine = anchor.filter((it) => it.line === line);
  const ls = spanOf(onLine);
  const base = baselineFor(p, onLine, lines);
  const xh = xh0 * scaleOf(onLine);
  let cx;
  if (sub && sub.length) cx = (ls.x0 + ls.x1) / 2;
  else {
    const gx1 = right && right.line === left.line ? spanOf([right]).x0 : Math.min(ls.x1 + 0.3 * UPM, maxW); // at a line end: just after the word
    cx = (ls.x1 + gx1) / 2;
  }
  const lean = leanOf(p, left);
  const slope = (left.rot || 0) + H.insertSlope * DEG * (0.5 + r());
  let s = H.insertSize * scaleOf(onLine);
  const measure = () => writeAt(p, text, { x: 0, y: 0, angle: slope, lean, size: s, seed, line });
  let w = measure(), ext = boxOf(w.items);
  // the room: from this line's x-height (plus a real gap) up to the lowest ink of the line above
  let ceil = 0.04 * UPM;
  const half = w.endX / 2;
  const near = above.filter((it) => (it.kind === 'glyph' || it.kind === 'mark') && it.g && it.x < cx + half + 400 && it.x > cx - half - 900);
  if (near.length) ceil = (near.every((it) => it.box) ? boxOf(near).y1 : spanOf(near).y1) + 0.04 * UPM;
  // (over a struck word, also clear its tall letters: the replacement sits above the whole word; a tier up, over an
  // insertion (`clear`: its letters), clear of all of them near it, tall ones too)
  const clr = clear ? clear.filter((it) => it.box && it.box[2] > cx - half - 200 && it.box[0] < cx + half + 200) : [];
  const floor = Math.min(base(cx) - 1.15 * xh, sub && sub.length ? ls.y0 - 0.12 * xh : Infinity, clr.length ? Math.min(...clr.map((it) => it.box[1])) - 0.12 * xh : Infinity);
  const room = floor - ceil, need = ext.y1 - ext.y0;
  if (need > room && need > 0) { s *= clamp(room / need, 0.72, 1); w = measure(); ext = boxOf(w.items); } // cramped: smaller
  let yb = Math.min(base(cx) - xh * (1.45 + 0.15 * r()), floor - ext.y1);
  if (yb + ext.y0 < ceil) yb = Math.min(ceil - ext.y0, floor - 0.5 * ext.y1); // touch the line above before this one
  const x0 = clamp(cx - w.endX / 2 + r.gauss() * 0.04 * UPM, 0, Math.max(0, maxW - w.endX)); // stays on the paper
  const at = shifted(w, x0, yb + Math.tan(slope) * 0); // writeAt's baseline passes through (0, 0) at `slope`
  const items = [];
  if (caret && !(sub && sub.length)) {
    const c = markItem(p, 'caret', caretStrokes(H.caret, cx, base, xh, yb, r), ref, { seed: 911 + (ref.ev || 0), tempo: 1.1, wk: ref.wk, key: ref.key ? ref.key + ':caret' : undefined });
    if (c) items.push(c);
  }
  items.push(...at.items);
  const block = { endX: at.endX, x0, yb, slope, s, lean, line, space: /\s$/.test(text) };
  return { items, runs: at.runs, stops: at.stops, block, shift: 0, caret: items.length - at.items.length };
}
