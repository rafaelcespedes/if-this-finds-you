// layout.js — text -> positioned glyph instances on a page. Pure data, no DOM.
//
// Every occurrence of a letter is its own instance, so no two are alike. Instances are keyed by word
// identity (the word's text, which occurrence of that word it is, and the letter's place in it), not by
// position, so editing one word never re-rolls the letters after it.
// Coordinates: font units (UPM 1000). x grows right, y grows DOWN (page space); `y` is the baseline.
// Glyph contours themselves are y-up, so a renderer draws contour point q at (x + q.x, y - q.y).
// A line's slope and curve are already baked into each glyph's contours (rotated about its origin).
//
// Variation is hierarchical and correlated (docs/research/human-feel.md §4, rules 2, 5, 11–16):
//   writer (seed) -> page -> line -> word -> letter -> stroke
// - Page and line: each line gets its own slope (writer habit + correlated noise), pitch, slight bow,
//   left-margin drift that resets per paragraph, and a ragged end (early breaks, overpacking, squeezing).
// - Word: the whole word leans, grows and sits up or down together. What belongs to the word (its own
//   lean, size, float and letters) is keyed by its identity, so an edit changes only that word. What
//   neighbours share (the line's lean, and a slow drift in height and lean along the line) is keyed by
//   the line and the position on it, so it flows smoothly from word to word.
// - Letter: only a small wobble around the word (makeGlyph's per-instance section).
// One "care" scalar (Neatness) scales every spread together, and care fades over a paragraph.
// No hard rule a real writer doesn't keep (docs/PRINCIPLES.md #1): on ruled paper lines stray off the
// rule and a rule is sometimes skipped; on plain paper the first line, paragraph gaps and pitch vary.
//
// layout() can continue from where an earlier call stopped: pass { start: page.pen }. Everything the
// pen needs to keep writing (line, position, word counts, fatigue) travels in that object, so text
// written earlier never moves (Ink mode's frozen placements). With { ink: { salt } } letters are keyed
// by the order they were written instead of by word text, so a word can be inked in pieces as it's typed.
//
// Typing re-lays the page on every key. Letters, whole words and posed words are cached per hand (keep
// passing the same params object), so a keystroke rebuilds only the edited word; page.runs gives
// renderers stable keys to redraw only what changed, and page.stops gives the editor a caret stop at
// every boundary (editing.js turns them into caret, hit-testing and selection geometry).

import { rng, clamp, smooth, DEG } from './core.js';
import { makeGlyph, markHabits, has, UPM, CAP } from './hand.js';
import { getStyle } from './glyphs.js';

export const MISS_ADVANCE = 560; // fallback; a placeholder takes the width of this hand's 'n'

// Page controls. `default` is the value when the hand doesn't carry the key (1 = this writer's natural amount).
export const PAGE_PARAMS = [
  { key: 'lineWander', label: 'Line wander', group: 'Page', min: 0, max: 2, step: 0.05, format: 'pct', default: 1 },
  { key: 'fatigue', label: 'Tires over a page', group: 'Page', min: 0, max: 2, step: 0.05, format: 'pct', default: 1 },
];

// Neatness is care (rule 16): one number scales all variance. care 1 -> ×0.5, 0.5 -> ×1, 0 -> ×1.5
export const spreadOf = (care) => 0.5 + (1 - clamp(care, 0, 1));

// The writer's page habits, fixed per seed ('page:' namespace). Ranges: human-feel.md §4.1–4.3, §9.
export function pageHabits(p) {
  const r = rng('page:' + p.seed);
  return {
    slope: r.range(-1.0, 1.8),        // degrees, + = lines climb to the right
    slopeSd: r.range(0.4, 0.9),       // line-to-line deviation...
    slopeRho: r.range(0.6, 0.85),      // ...correlated: each line takes the one above as its guide
    pitch: r.range(0.92, 1.12),       // plain paper: line pitch vs the requested one
    pitchCv: r.range(0.03, 0.07),
    bow: r.gauss() * 0.0025,          // sag (+) or arch (−), fraction of line length
    bowSd: r.range(0.0015, 0.004),
    droop: r() < 0.35 ? r.range(0.003, 0.009) : 0, // the line end drops as the hand reaches
    marginSd: r.range(0.003, 0.008),  // left start, fraction of width
    marginDrift: r.range(0, 0.005),   // inward per line, reset per paragraph
    float: r.range(0, 0.05),          // ruled paper: baseline above the rule, in x-heights
    reach: r.range(0.01, 0.06),       // how early a line may give up (fraction of width)
    overpack: r.range(0.25, 0.7),     // chance to run a word past that point
    squeeze: r.range(0.2, 0.8),       // chance to squeeze a word in rather than break
    wordSlantRho: r.range(0.6, 0.8), // (these two are no longer used; kept so the habits after them stay put)
    wordBaseRho: r.range(0.4, 0.6),
    stop: r.range(1.2, 1.55),         // word gap after . ! ?
    pause: r.range(1.05, 1.25),       // word gap after , ; :
    tempo: r.range(0.85, 1.2),        // writing speed (animation)
    // (added later: kept at the end so earlier habits stay the same for every seed)
    pitchXh: r.range(2.6, 3.3),       // plain paper: line pitch in x-heights...
    clear: r.range(1.02, 1.15),       // ...but ascenders and descenders of neighbouring lines rarely meet
    startY: clamp(r.gauss(), -2, 2),  // where the first line starts, around the default
    paraGap: r() < 0.4 ? r.range(0.08, 0.35) : 0, // extra space before a paragraph (plain), in pitches
    skipRule: r() < 0.35 ? r.range(0.1, 0.4) : 0, // ruled: chance to skip a rule before a paragraph
    stray: r.range(0.05, 0.2),        // ruled: chance that a line drifts off its rule
    lineSlantSd: r.range(0.3, 0.7),   // degrees: each line leans a little on its own
  };
}

// The hand's vertical extent and its natural line pitch (font units), for UIs that size paper to a hand.
// ascender / descender: how far ink usually reaches above / below the baseline (lowercase and caps)
export function pageMetrics(p, H = pageHabits(p)) {
  const st = getStyle(p.style);
  const descRatio = st && st.metrics && st.metrics.descRatio != null ? st.metrics.descRatio : 0.33;
  const xh = p.xHeight * CAP, pen = p.penWidth || 50;
  const ascender = Math.max(p.ascender, 1) * CAP + 0.6 * pen;
  const descender = p.descender * CAP * descRatio + 0.8 * pen;
  return {
    xh, ascender, descender,
    pitch: Math.max(H.pitchXh * xh, H.clear * (ascender + descender)),
    firstBaseline: ascender + 0.3 * xh,
  };
}

// ---------- per-hand caches ----------
// Keyed by the params object plus a fingerprint of its values, so a mutated params object never
// returns stale letters. Everything cached is a pure function of its key: cold and warm layouts match.
const handCaches = new WeakMap();
function handCache(p) {
  let fp = '';
  for (const k in p) { const v = p[k]; if (v === null || typeof v !== 'object') fp += k + '=' + v + ';'; }
  let hc = handCaches.get(p);
  if (!hc || hc.fp !== fp) { hc = { fp, fid: hash(fp), glyphs: new Map(), words: new Map(), draws: new Map(), poses: new WeakMap(), boxes: new WeakMap(), series: new Map(), k: null }; handCaches.set(p, hc); }
  if (hc.glyphs.size > 40000) hc.glyphs.clear();
  if (hc.words.size > 8000) hc.words.clear();
  if (hc.draws.size > 20000) hc.draws.clear();
  return hc;
}

// AR(1) along an index (lines): x_k = ρ·x_(k−1) + √(1−ρ²)·z_k, z_k drawn from the index alone.
function series(hc, key, rho, n) {
  let s = hc.series.get(key);
  if (!s) { s = []; hc.series.set(key, s); }
  const sq = Math.sqrt(1 - rho * rho);
  while (s.length <= n) { const k = s.length, z = clamp(rng(key + ':' + k).gauss(), -2.5, 2.5); s.push(k ? rho * s[k - 1] + sq * z : z); }
  return s[n];
}

// ink extent of a glyph along x (glyph space)
function inkX(g) {
  let x0 = Infinity, x1 = -Infinity;
  for (const c of g.contours) for (const q of c) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; }
  return x0 <= x1 ? [x0, x1] : [0, g.advance];
}

// lean (x += y·k) then rotate a finished glyph about its origin (a > 0 = counter-clockwise in y-up
// glyph space = uphill). Pen widths were set before, so a line's lean doesn't fatten the strokes.
// Returns { g, box: [x0, y0, x1, y1] } (glyph space); cached per glyph and pose.
const Q = 1e4; // poses are quantised (1e-4 rad / 1e-4 lean), so a word that didn't move reuses its pose
function pose(hc, g, a, k) {
  let m = hc.poses.get(g);
  if (!m) { m = new Map(); hc.poses.set(g, m); }
  const key = a + ',' + k;
  let r = m.get(key);
  if (r) return r;
  let out = g;
  if (a || k) {
    const c = Math.cos(a), s = Math.sin(a);
    const rot = (q) => { const x = q[0] + q[1] * k; return [c * x - s * q[1], s * x + c * q[1]]; };
    const map = new Map();
    const contours = g.contours.map((poly) => { const t = poly.map(rot); map.set(poly, t); return t; });
    const strokes = g.strokes.map((st) => Object.assign({}, st, { center: st.center.map(rot), contour: map.get(st.contour) || st.contour.map(rot) }));
    out = Object.assign({}, g, { contours, strokes });
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of out.contours) for (const q of c) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  r = { g: out, box: x0 <= x1 ? [x0, y0, x1, y1] : [0, 0, g.advance, 0] };
  m.set(key, r);
  return r;
}

// a letter's own ink box [x0, y0, x1, y1] (glyph space), cached
function glyphBox(hc, g) {
  let b = hc.boxes.get(g);
  if (!b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of g.contours) for (const q of c) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    b = x0 <= x1 ? [x0, y0, x1, y1] : [0, 0, g.advance, 0];
    hc.boxes.set(g, b);
  }
  return b;
}

// a short, stable id for strings (FNV-1a, base 36)
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ---------- line geometry (shared with editing.js and corrections) ----------
// a slow wave along a line (two octaves, phase never on the noise's integer zeros)
const wave = (N, x, ph, L) => 0.7 * N.n1(x / L + ph) + 0.3 * N.n1(x / (0.43 * L) + 1.7 * ph + 0.5);
// Baseline height (page y, down) of a line at x. `line` is a page.lineInfo entry: it carries everything
// (y, x0, x1, slope, bow, droop, drift, phase, wave), so the curve can be rebuilt anywhere.
function baseAt(ln, x, N) {
  const u = clamp((x - ln.x0) / Math.max(1, ln.x1 - ln.x0), 0, 1);
  return ln.y - (x - ln.x0) * Math.tan(ln.slope * DEG) + ln.bow * 4 * u * (1 - u) + ln.droop * smooth((u - 0.55) / 0.45) + ln.drift * N.n1(x / ln.wave + ln.phase);
}
const angleOf = (ln, x, N) => -Math.atan((baseAt(ln, x + 40, N) - baseAt(ln, x - 40, N)) / 80);
// the line's lean plus a slow drift in lean along it (degrees, added to the writer's slant)
const leanOf = (ln, x, N) => ln.lean + ln.flow * wave(N, x, ln.phase + 3.3, 0.8 * ln.wave);

// The curve a line's letters sit on (page y at x), its angle (radians, + = uphill) and its lean
// (degrees on top of the hand's slant). `line` is an entry of page.lineInfo.
export const lineBaseline = (p, line, x) => baseAt(line, x, p.noise);
export const lineAngle = (p, line, x) => angleOf(line, x, p.noise);
export const lineLean = (p, line, x) => leanOf(line, x, p.noise);

// The writer's constants for this hand (cached).
function constants(p, hc) {
  if (hc.k) return hc.k;
  const H = pageHabits(p), M = pageMetrics(p, H);
  const S = 'pg:' + p.seed + ':';
  const pr = rng(S + 'page');
  const care0 = clamp(p.neatness, 0, 1);
  const hyphen = has(p, '-');
  hc.k = {
    H, M, S, xh: M.xh, N: p.noise, care0,
    connected: !!(getStyle(p.style) && getStyle(p.style).connected),
    wander: p.lineWander == null ? 1 : Math.max(0, p.lineWander),
    tire: (p.fatigue == null ? 1 : Math.max(0, p.fatigue)) * (1 - care0), // scaled by (1 − skill)
    marks: markHabits(p),
    spaceAdv: makeGlyph(p, ' ', null).advance * p.wordSpace, // = hand.space
    missAdv: has(p, 'n') ? makeGlyph(p, 'n', null).advance : MISS_ADVANCE,
    hyphen, hyInk: hyphen ? 0.7 * inkX(makeGlyph(p, '-', null))[1] : 0,
    pageSlant: pr.gauss() * 0.5, pageSize: 1 + pr.gauss() * 0.015,
  };
  return hc.k;
}

const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
// graphemes of a word with their offsets (é, flags and emoji sequences are one letter / one caret stop)
const SIMPLE = /^[^\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u0610-\u061a\u064b-\u065f\u0900-\u0dff\u1ab0-\u1aff\u1dc0-\u1dff\u200c\u200d\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f\ud800-\udfff]*$/;
function graphemes(tok, base) {
  const out = [];
  // most words have no combining marks, joiners or surrogates: one letter per code unit
  if (SIMPLE.test(tok)) { for (let i = 0; i < tok.length; i++) out.push([tok[i], base + i]); return out; }
  if (seg) for (const s of seg.segment(tok)) out.push([s.segment, base + s.index]);
  else for (let i = 0; i < tok.length;) { const ch = String.fromCodePoint(tok.codePointAt(i)); out.push([ch, base + i]); i += ch.length; }
  return out;
}

// opts: { maxWidth (font units), lineHeight, firstBaseline, marginLeft (font units, default 0),
//         ruled (bool), start (a page.pen to continue from), ink ({ salt }: Ink mode seeding),
//         salt (another letter by the same hand: different letter instances), size, weight }
// Prefix-stable: with firstBaseline given, appending text never moves or changes complete earlier words
// (only the word still being typed can change). tools/qa/prefix.mjs checks it.
// Plain paper: lineHeight is the mean pitch (default: from the hand, pageMetrics(p).pitch) and each line
//   varies around it. firstBaseline defaults to just below the hand's ascenders; when it's left out the
//   page also moves down if any ink would rise above y = 0.
// Ruled (or grid) paper: baselines sit on rules at firstBaseline + n·lineHeight. Words float a little
//   above the rule or dip just below it, a line now and then strays off its rule, and a rule may be
//   skipped before a paragraph.
// Ink mode ({ ink: { salt } }, usually with start): each letter is keyed by its place in the writing
//   order (pen.glyphs), each word by its first letter, so ink never changes once written. Text that
//   doesn't start with a space continues the word the pen stopped in.
// Text is normalised to NFC first; offsets refer to the NFC text (page.text).
// Returns { items, runs, stops, height, width, lines, misses, lineHeight, rules, ruling, lineInfo, words,
//           ink, pen, text, from, seed, xh, connected }
//   items: { kind: 'glyph', ch, g, x, y, rot, box, key, charIndex, inkIndex, line, para, word, wkey, tempo, synthetic? }
//        | { kind: 'miss',  ch, x, y, advance, box, key, charIndex, line, para, word, wkey }   (a character this hand can't write yet)
//     charIndex = UTF-16 offset of the letter in the text (+ page.from when continuing); a hyphen added
//     at a word break is `synthetic` (not in the text). rot = the line angle baked into g (radians).
//     box = [x0, y0, x1, y1] ink box in page units. key = stable id of this letter (survives edits elsewhere).
//     wkey = the word's identity (text#occurrence, or i<first letter> in Ink mode).
//   runs: [{ id, key, line, from, to, box }] one per word (per line part): items[from..to). id changes
//     only when something in the run would draw differently, so renderers redraw only new ids.
//   stops: [{ o, line, x, y, kind, aff? }] a caret stop for every boundary in the text: before and after
//     each letter, between spaces, at line ends and starts (a wrap has both, aff 'before' / 'after'),
//     and on empty lines. kind: 'glyph' | 'space' | 'lineEnd' | 'lineStart' | 'empty'.
//   lineInfo: per line { n (= item.line), y, x0, x1, slope (deg, + = uphill), lean (deg), flow, bow and
//     droop (font units at the middle / end), drift, phase, wave, edge, rule? }: lineBaseline(p, line, x)
//     rebuilds the curve. rules: ruled baselines used; ruling: { first, pitch } (ruled only).
//   ink: { top, bottom, left, right } of all ink (page units); height covers it.
//   pen: where writing stopped, to continue with layout(p, more, { ...opts, start: page.pen }).
export function layout(p, text, opts = {}) {
  text = String(text).normalize('NFC');
  const hc = handCache(p);
  const K = constants(p, hc);
  const { H, M, S, xh, N, connected, wander, tire, care0, marks, spaceAdv, missAdv, hyphen, hyInk } = K;
  const maxU = opts.maxWidth || 12000;
  const ruled = !!opts.ruled;
  const lineH = opts.lineHeight || M.pitch;
  const pitch = ruled ? lineH : opts.lineHeight ? lineH * H.pitch : lineH;
  const placed = opts.firstBaseline != null;
  const firstY = placed ? opts.firstBaseline : M.firstBaseline;
  const marginL = opts.marginLeft || 0;
  const ink = opts.ink ? { salt: String(opts.ink.salt == null ? (opts.salt == null ? '' : opts.salt) : opts.ink.salt) } : null;
  // salt: a different letter by the same hand gets different letter instances (writing-experience §4.6)
  const salt = opts.salt == null || opts.salt === '' ? '' : String(opts.salt) + '|';
  // size: letters bigger or smaller than the hand's own (insertions above a line); weight: a heavier pen
  // (an overwrite pressed over a wrong letter): pen width × weight, and item.weight for the ink
  const sizeK = opts.size || 1, weight = opts.weight || 1;
  const pw = weight === 1 ? p : Object.assign(Object.create(p), { penWidth: p.penWidth * weight });

  // ----- the pen: everything needed to keep writing (a fresh page, or opts.start) -----
  const pen = opts.start ? JSON.parse(JSON.stringify(opts.start)) : {
    lineNo: -1, line: null, lp: 0, x: 0, wp: 0, wordsBefore: 0, offset: 0, para: -1, words: 0,
    pending: 0, prevEnd: '', seen: {}, glyphs: 0, open: null, endO: null, endX: 0,
  };
  const from = pen.offset;
  const seen = Object.assign(Object.create(null), pen.seen);
  const zOf = (name, key) => clamp(rng(S + name + ':' + key).gauss(), -2.5, 2.5);
  const q = (v, step) => Math.round(v / step) * step; // quantised, so cached letters are reused

  const items = [], runs = [], stops = [], misses = [], lineInfo = [], rules = [];
  let wordsHere = 0;

  // The research ranges are for paper lines ~35 x-heights long. Longer lines (small text in a wide
  // box) keep the same look: angles shrink and curves are capped, so line ends don't wander off.
  const kLen = Math.min(1, Math.pow(36 / (maxU / xh), 0.75));
  const curveU = Math.min(maxU, 36 * xh);
  const ruledSlope = Math.min(0.35, Math.atan(0.08 * xh / maxU) / DEG);
  const baseY = (ln, x) => baseAt(ln, x, N);
  const stop = (o, ln, x, kind, aff) => { const s = { o, line: ln.n, x, y: baseY(ln, x), kind }; if (aff) s.aff = aff; stops.push(s); };

  function newLine(care, paraStart) {
    const prev = pen.line;
    const lineNo = ++pen.lineNo;
    const lr = rng(S + 'line:' + lineNo);
    const ls = wander * (0.6 + 0.8 * (1 - care)); // how much this line wanders
    const z = series(hc, S + 'slope', H.slopeRho, lineNo);
    const ln = {
      n: lineNo,
      // (on ruled paper the rule guides the hand: the whole line stays within ~0.08 x-height of it)
      slope: (ruled ? clamp(0.15 * H.slope + 0.12 * ls * z, -1, 1) * ruledSlope : clamp(H.slope * (0.6 + 0.4 * ls) + H.slopeSd * ls * z, -4, 4) * kLen) * Math.min(1, wander),
      lean: H.lineSlantSd * spreadOf(care) * wander * series(hc, S + 'lslant', 0.6, lineNo),
      flow: 1.1 * spreadOf(care) * Math.min(1.5, wander),
      bow: ruled ? 0 : curveU * (H.bow + H.bowSd * clamp(lr.gauss(), -2.5, 2.5)) * ls,
      droop: ruled ? 0 : curveU * H.droop * ls * (0.4 + lr()),
      drift: xh * (ruled ? 0.04 : 0.045) * ls,
      phase: lineNo * 7.31 + 0.37 + lr() * 0.5, // never on the noise's integer zeros
      wave: 20 * xh,
      // (margins wander like a paper line's: measured on at most ~36 x-heights, so a very wide box
      // doesn't get a proportionally huge indent or early break)
      x0: marginL + curveU * (clamp(H.marginSd * ls * (1 + 0.9 * lr.gauss()), 0, 0.03) + Math.min(0.04, H.marginDrift * wander * pen.lp)),
      x1: maxU,
      edge: maxU - curveU * (H.reach * (0.3 + 0.7 * lr()) * Math.min(1.5, ls) + (prev && prev.packed ? 0.025 : 0)),
      float: 0, y: 0, rule: undefined, count: 0, packed: false,
    };
    if (ruled) {
      // sometimes a rule is skipped before a new paragraph
      const prevRule = prev && prev.rule != null ? Math.round((prev.rule - firstY) / lineH) : -1;
      const skip = paraStart && prev && lr() < H.skipRule * (0.5 + (1 - care)) * Math.min(1, wander) ? 1 : 0;
      ln.rule = firstY + (prevRule + 1 + skip) * lineH;
      // words float a little above the rule; now and then a whole line strays off it
      ln.float = xh * (H.float + 0.025 * ls * series(hc, S + 'float', 0.6, lineNo));
      if (lr() < H.stray * (0.4 + (1 - care)) * Math.min(1.5, wander)) ln.float += xh * (lr() < 0.8 ? lr.range(0.06, 0.16) : -lr.range(0.03, 0.07));
      ln.float = clamp(ln.float, -0.07 * xh, 0.2 * xh);
      ln.y = ln.rule - ln.float;
      rules.push(ln.rule);
    } else if (!prev) {
      ln.y = firstY + (placed ? 0 : 0.12 * xh * H.startY * Math.min(1, wander));
    } else {
      const gap = paraStart ? 1 + H.paraGap * (0.5 + lr()) * Math.min(1, wander) : 1;
      ln.y = prev.y + pitch * (gap + H.pitchCv * Math.min(1.1, ls) * clamp(lr.gauss(), -1.7, 1.7));
      // lines fan, but never close up enough to collide (≥ 86% of the pitch along the line):
      // like a writer, first follow the line above more closely, and only then move down
      const tight = () => Math.min(...[ln.x0, maxU * 0.5, maxU].map((x) => baseY(ln, x) - baseY(prev, x)));
      for (let i = 0; i < 4 && tight() < 0.86 * pitch; i++) {
        ln.slope = (ln.slope + prev.slope) / 2; ln.bow = (ln.bow + prev.bow) / 2; ln.droop = (ln.droop + prev.droop) / 2;
      }
      const t = tight();
      if (t < 0.86 * pitch) ln.y += 0.86 * pitch - t;
    }
    lineInfo.push(ln);
    pen.line = ln;
    pen.x = ln.x0;
    return ln;
  }
  const line = () => pen.line;
  // ink keeps clear of the right edge: a line's tilt and lean push tall or deep strokes sideways
  const padFor = (ln, tilt) => {
    const a = angleOf(ln, maxU, N), k = Math.tan((ln.lean + Math.abs(ln.flow)) * DEG), t = Math.abs(tilt);
    return 0.02 * xh + Math.max(0, k - Math.sin(a - t)) * M.ascender + Math.max(0, Math.sin(a + t) - k) * M.descender;
  };

  // ----- a word's letters (cached per hand + identity + the word's values) -----
  function letter(ch, seedKey, ctx, w) {
    const inst = { seed: seedKey, amount: 1, slant: w.slant, scale: w.scale, care: w.care };
    if (w.squeeze) inst.squeeze = w.squeeze;
    if (ctx && ctx.bar) inst.bar = ctx.bar;
    const ck = ch + '\u0001' + seedKey + '\u0001' + w.slant + '\u0001' + w.scale + '\u0001' + w.care + '\u0001' + (w.squeeze || 1) + '\u0001' + weight + '\u0001' +
      (ctx ? [ctx.prev, ctx.next, ctx.index, ctx.wordStart, ctx.wordEnd, ctx.bar || ''].join('\u0002') : '');
    let g = hc.glyphs.get(ck);
    if (!g) { g = makeGlyph(pw, ch, inst, ctx && { prev: ctx.prev, next: ctx.next, index: ctx.index, wordStart: ctx.wordStart, wordEnd: ctx.wordEnd }); hc.glyphs.set(ck, g); }
    return g;
  }
  // build a word (or the next piece of an open word in Ink mode): glyphs with offsets relative to tokStart
  function shapeWord(chars, w, seedOf, ctxBase) {
    const sigL = clamp(0.1 * spreadOf(w.care), 0.04, 0.15);
    const bars = chars.map(() => null);
    if (marks.shareTT && !ink) for (let i = 0; i + 1 < chars.length; i++) {
      if (chars[i][0] === 't' && chars[i + 1][0] === 't' && !bars[i]) { bars[i] = 'lead'; bars[i + 1] = 'follow'; }
    }
    const glyphs = [];
    let wx = 0, inkR = 0;
    chars.forEach(([ch, rel], wi) => {
      const seedKey = seedOf(wi);
      if (!has(p, ch)) {
        const adv = missAdv * w.scale * (w.squeeze || 1);
        glyphs.push({ miss: ch, rel, dx: wx, advance: adv, ink: [0, adv], seedKey });
        wx += adv; inkR = Math.max(inkR, wx);
        return;
      }
      const ctx = {
        prev: wi ? chars[wi - 1][0] : ctxBase.prev, next: wi + 1 < chars.length ? chars[wi + 1][0] : null,
        index: ctxBase.index + wi, wordStart: ctxBase.index + wi === 0, wordEnd: wi === chars.length - 1 && ctxBase.closed, bar: bars[wi],
      };
      const g = letter(ch, seedKey, ctx, w);
      let gap = 0;
      // (in Ink mode a word may be continued later, so its last letter keeps its gap too: the next piece
      // then lands exactly where it would have if the word had been written in one go)
      if (!connected && (wi + 1 < chars.length || ink)) {
        const z = clamp(rng('sp:' + p.seed + ':' + seedKey).gauss(), -2.5, 2.5);
        // (never closer than 80% of the hand's usual gap, so letters don't collide)
        gap = 2 * p.sidebearing * w.scale * (w.squeeze || 1) * (Math.max(0.8, Math.exp(sigL * z - sigL * sigL / 2)) - 1 + 0.1 * tire * w.prog);
      }
      const gi = inkX(g);
      const bob = connected ? 0 : clamp(rng('bob:' + p.seed + ':' + seedKey).gauss(), -2.5, 2.5);
      glyphs.push({ g, ch, rel, dx: wx, ink: gi, letter: /\p{L}/u.test(ch), bob, seedKey });
      inkR = Math.max(inkR, wx + gi[1]);
      wx += g.advance + gap;
    });
    return { glyphs, wx, ink: inkR };
  }

  // ----- place a shaped word along the current line (breaking it if it can't fit) -----
  // A word is a rigid piece: its letters sit in the word's own frame (origin on the line, turned to the
  // line's angle plus the word's tilt, leaned by the line's lean), so a reflow only moves frames.
  // w: the word's values; sh: its shape; x: where it starts. ctl.frame continues an open word (Ink mode).
  function place(w, sh, x, tokStart, ctl) {
    let tilt = w.tilt;
    // (on ruled paper a word stays near its rule: at most ~0.05 x-height of tilt over a typical word)
    if (ruled) tilt = clamp(tilt, -Math.atan(0.05 / 6), Math.atan(0.05 / 6));
    // a frame for the part of the word that starts at dx = d0, at page x = X on the current line. Its
    // angle and float are read a little way in from the start, never from the word's length, so a word
    // written in pieces (Ink mode) sits exactly where the whole word would
    const frameAt = (X, d0) => {
      const ln = line(), mid = Math.min(X + 1.5 * xh, maxU);
      let lift = w.lift;
      // on ruled paper the whole word floats a little above the rule, or dips just below it
      if (ruled) lift = clamp(baseY(ln, mid) + w.lift, ln.rule - 0.2 * xh, ln.rule + 0.06 * xh) - baseY(ln, mid);
      return {
        X, Y: baseY(ln, X) + lift, d0,
        a: Math.round((angleOf(ln, mid, N) + tilt) * Q) / Q,
        k: Math.round(Math.tan(leanOf(ln, X, N) * DEG) * Q) / Q,
      };
    };
    let f = ctl.frame || frameAt(x, 0);
    let pad = padFor(line(), tilt);
    // only a word that can't fit on this line at all breaks
    let breaks = ctl.mayBreak && f.X + sh.ink - f.d0 > maxU - pad;
    let onLine = ctl.onLine || 0;
    let runFrom = items.length, runFirst = null;
    // page position of a point in the frame (y-up local), with the frame's lean and turn
    const at = (lx, ly) => {
      const c = Math.cos(f.a), s = Math.sin(f.a), u = lx + ly * f.k;
      return [f.X + c * u - s * ly, f.Y - (s * u + c * ly)];
    };
    const closeRun = (hy) => {
      if (items.length === runFrom) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = runFrom; i < items.length; i++) { const bx = items[i].box; if (bx[0] < x0) x0 = bx[0]; if (bx[1] < y0) y0 = bx[1]; if (bx[2] > x1) x1 = bx[2]; if (bx[3] > y1) y1 = bx[3]; }
      // id: what the run looks like in its own frame; pid: that plus where the frame sits
      const id = hash(hc.fid + '|' + [w.key, w.seed, w.slant, w.scale, w.care, w.prog, w.squeeze || 1, f.d0, runFirst, items.length - runFrom, hy ? 1 : 0].join('|'));
      const pid = hash(id + '|' + [f.X.toFixed(2), f.Y.toFixed(2), f.a, f.k].join('|'));
      runs.push({ id, pid, key: w.key, line: line().n, from: runFrom, to: items.length, x: f.X, y: f.Y, a: f.a, k: f.k, box: [x0, y0, x1, y1] });
      runFrom = items.length; runFirst = null;
    };
    const put = (it, glyph, lx, ly, o, kind, extra) => {
      const [px, py] = at(lx, ly);
      const gb = glyph ? glyphBox(hc, glyph) : [0, 0, it.advance, 0.7 * CAP * w.scale];
      // ink box: the glyph's own box, leaned and turned with the frame (a little generous, never tight)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const c = Math.cos(f.a), s = Math.sin(f.a);
      for (const [qx, qy] of [[gb[0], gb[1]], [gb[2], gb[1]], [gb[0], gb[3]], [gb[2], gb[3]]]) {
        const u = qx + qy * f.k, X = px + c * u - s * qy, Y = py - (s * u + c * qy);
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      // glyph + local: the unposed letter and its place in the run (for renderers that draw whole runs)
      const item = Object.assign({ kind, ch: it.miss || it.ch, x: px, y: py, rot: f.a, box: [x0, y0, x1, y1], key: it.seedKey + (extra && extra.synthetic ? ':hy' : ''), charIndex: o, glyph, local: [lx, ly] }, extra);
      if (glyph) {
        const a = f.a, k = f.k;
        // the letter posed on the page is made only when something asks for it
        Object.defineProperty(item, 'g', {
          enumerable: true, configurable: true,
          get() { const g = pose(hc, glyph, a, k).g; Object.defineProperty(this, 'g', { value: g, enumerable: true, writable: true, configurable: true }); return g; },
          set(v) { Object.defineProperty(this, 'g', { value: v, enumerable: true, writable: true, configurable: true }); },
        });
      }
      if (runFirst == null) runFirst = it.seedKey;
      items.push(item);
      return item;
    };
    // the (short) hyphen a writer adds where a word breaks
    const hyGlyph = (it) => letter('-', w.seed + ':hy' + it.seedKey, null, Object.assign({}, w, { squeeze: 0.7 * (w.squeeze || 1) }));
    let prevEndX = ctl.prevEndX == null ? null : ctl.prevEndX; // page x where the letter before ends
    let prevIt = ctl.prevIt || null;
    for (let i = 0; i < sh.glyphs.length; i++) {
      const it = sh.glyphs[i];
      const lx = it.dx - f.d0;
      let gx = f.X + lx;
      // room for a hyphen after this letter, in case the next one has to go to a new line
      const next = sh.glyphs[i + 1];
      let need = it.ink[1];
      if (breaks && next && it.letter && next.letter && hyphen && gx + it.g.advance + 1.2 * hyInk > maxU - pad) {
        need = Math.max(need, it.g.advance + inkX(hyGlyph(next))[1]);
      }
      const o = tokStart + it.rel;
      // a long word is laid in rigid pieces, each sitting on the line where it starts
      if (onLine && lx > 8 * xh && !((breaks || ctl.mustBreak) && gx + need > maxU - pad)) {
        closeRun(false);
        f = frameAt(gx, it.dx);
      }
      if ((breaks || ctl.mustBreak) && onLine && gx + need > maxU - pad) {
        let endL = prevEndX == null ? lx : prevEndX - f.X;
        let hyItem = false;
        if (hyphen && prevIt && prevIt.letter && it.letter) {
          const hg = hyGlyph(it);
          put(Object.assign({}, it, { ch: '-', miss: null }), hg, endL, 0, o, 'glyph', { inkIndex: ctl.inkIndex, line: line().n, para: pen.para, word: w.n, wkey: w.key, tempo: w.tempo, synthetic: true });
          endL += hg.advance; hyItem = true;
        }
        stop(o, line(), f.X + endL, 'lineEnd', 'before');
        closeRun(hyItem);
        newLine(w.care, false);
        pen.lp++;
        pad = padFor(line(), tilt);
        f = frameAt(pen.x, it.dx);
        breaks = f.X + sh.ink - f.d0 > maxU - pad;
        onLine = 0;
        gx = f.X;
        stop(o, line(), gx, 'lineStart', 'after');
      } else if (i === 0 && ctl.wrapped) {
        stop(o, line(), gx, 'lineStart', 'after'); // the word wrapped: its start is also this line's start
      } else {
        // caret stop before this letter: halfway across the gap from the letter before
        stop(o, line(), prevEndX == null ? gx : (prevEndX + gx) / 2, 'glyph');
      }
      // letters don't all sit on the line; joined letters ride a smooth wave instead, so joins still meet
      const ly = it.miss ? 0 : -(connected ? xh * 0.01 * spreadOf(w.care) * N.n1(it.dx / (3.5 * xh) + 13.37 + w.waveZ) : it.bob * xh * 0.008 * spreadOf(w.care));
      const lxNow = it.dx - f.d0;
      if (it.miss) {
        misses.push(it.miss);
        put(it, null, lxNow, ly, o, 'miss', { advance: it.advance, line: line().n, para: pen.para, word: w.n, wkey: w.key });
        prevEndX = f.X + lxNow + it.advance;
      } else {
        // inkIndex: ink density is sampled per word position (see pen.strokeOpacity)
        put(it, it.g, lxNow, ly, o, 'glyph', weight === 1 ? { inkIndex: ctl.inkIndex, line: line().n, para: pen.para, word: w.n, wkey: w.key, tempo: w.tempo }
          : { inkIndex: ctl.inkIndex, line: line().n, para: pen.para, word: w.n, wkey: w.key, tempo: w.tempo, weight });
        prevEndX = f.X + lxNow + it.g.advance;
      }
      prevIt = it;
      onLine++;
    }
    closeRun(false);
    return { endX: f.X + sh.wx - f.d0, frame: f, prevIt: prevIt && { letter: prevIt.letter }, prevEndX, onLine };
  }

  // the values a word shares (lean, size, float, tilt, care, tempo), from its identity
  function wordValues(wkey, seedBase) {
    // ----- care arc over the paragraph (rule 14): careful first lines, then drift -----
    const prog = q(smooth((pen.wp + 0.35 * pen.wordsBefore - 8) / 150), 0.05);
    const fresh = 1 - smooth(pen.wp / 25);
    const care = q(clamp(care0 + 0.12 * (1 - care0) * fresh - 0.3 * tire * prog, 0, 1), 0.025);
    const spread = spreadOf(care);
    // ----- word level (rule 2): the whole word leans, grows and sits together -----
    // (the word's own draws depend only on its identity, so they're cached)
    let z = hc.draws.get(seedBase);
    if (!z) {
      const wr = rng(S + 'word:' + seedBase);
      z = { tilt: wr.gauss(), gap: clamp(wr.gauss(), -2.5, 2.5), u1: wr(), u2: wr(), slant: zOf('slant', seedBase), size: zOf('size', seedBase), base: zOf('base', seedBase), wave: zOf('wave', seedBase) };
      hc.draws.set(seedBase, z);
    }
    return {
      key: wkey, seed: seedBase, n: pen.words++, prog, care,
      slant: q(clamp(K.pageSlant + 1.25 * spread * z.slant, -4, 4), 0.01),
      scale: q(clamp(K.pageSize * (1 + 0.04 * spread * z.size) * (1 + 0.1 * tire * prog), 0.88, 1.16) * sizeK, 0.001),
      lift: xh * 0.006 * (0.35 + 0.65 * spread) * (0.6 + 0.6 * (p.drift == null ? 0.7 : p.drift)) * z.base,
      tilt: clamp(z.tilt * 0.3 * spread, -0.9, 0.9) * DEG, gapZ: z.gap, u1: z.u1, u2: z.u2, waveZ: z.wave,
      tempo: H.tempo * (1 + 0.12 * tire * prog) * (1.15 - 0.3 * care),
    };
  }

  const paras = text.split('\n');
  paras.forEach((para, pi) => {
    // the first piece continues the current line when resuming; every other one starts a paragraph
    const paraStops = stops.length, paraStart = pen.offset, fresh = pi > 0 || !pen.line;
    if (fresh) {
      pen.para++; pen.lp = 0; pen.wordsBefore += pen.wp; pen.wp = 0; pen.pending = 0; pen.prevEnd = ''; pen.open = null;
      newLine(care0, pen.lineNo >= 0);
      pen.endO = null; pen.endX = line().x0;
    }
    const tokens = para.match(/ +|[^ ]+/g) || [];
    let tokOff = 0;
    for (const tok of tokens) {
      const tokStart = pen.offset + tokOff;
      tokOff += tok.length;
      if (tok[0] === ' ') {
        if (pen.pending === 0) pen.spaceFrom = tokStart;
        pen.pending += tok.length; pen.open = null;
        continue;
      }
      const chars = graphemes(tok, 0);
      const inkIndex = tokStart + tok.length;
      // ----- Ink mode: continue the word the pen stopped in -----
      if (ink && pen.open && pen.pending === 0) {
        const o = pen.open;
        const w = o.w;
        const sh = shapeWord(chars, w, (wi) => 'ink:' + ink.salt + ':' + (pen.glyphs + wi), { prev: o.last, index: o.count, closed: false });
        pen.glyphs += chars.length;
        // the new letters continue the word's own frame, right after its last letter
        const sh2 = Object.assign({}, sh, { glyphs: sh.glyphs.map((g) => Object.assign({}, g, { dx: g.dx + o.dx })), ink: sh.ink + o.dx, wx: sh.wx + o.dx });
        const r = place(w, sh2, pen.x, tokStart, { frame: o.frame, mayBreak: true, mustBreak: true, onLine: o.onLine, prevIt: o.prevIt, prevEndX: o.prevEndX, inkIndex });
        o.last = chars[chars.length - 1][0]; o.count += chars.length; o.frame = r.frame; o.prevIt = r.prevIt; o.prevEndX = r.prevEndX; o.onLine = r.onLine; o.dx += sh.wx;
        pen.x = r.endX; pen.endO = tokStart + tok.length; pen.endX = pen.x; pen.prevEnd += tok;
        continue;
      }
      // ----- identity: this word's text and which occurrence of it this is -----
      let wkey, seedOf;
      if (ink) {
        const id0 = pen.glyphs;
        wkey = 'i' + id0;
        seedOf = (wi) => 'ink:' + ink.salt + ':' + (id0 + wi);
        pen.glyphs += chars.length;
      } else {
        const n = seen[tok] = (seen[tok] || 0) + 1;
        wkey = tok + '#' + (n - 1);
        seedOf = (wi) => 'w:' + salt + wkey + ':' + wi;
      }
      wordsHere++;
      const w = wordValues(wkey, ink ? 'ink:' + ink.salt + ':w' + wkey : salt + wkey);
      pen.wp++;
      // whole words are cached (fair copy): same identity and values -> the same letters
      const wck = ink ? null : wkey + '\u0001' + w.slant + '\u0001' + w.scale + '\u0001' + w.care + '\u0001' + w.prog;
      let sh = wck && hc.words.get(wck);
      if (!sh) { sh = shapeWord(chars, w, seedOf, { prev: null, index: 0, closed: !ink }); if (wck) hc.words.set(wck, sh); }
      // ----- word gap: lognormal, wider after punctuation and when tired -----
      const sigW = clamp(0.2 * spreadOf(w.care), 0.08, 0.32);
      const punct = /[.!?]["'’”)]*$/.test(pen.prevEnd) ? H.stop : /[,;:]["'’”)]*$/.test(pen.prevEnd) ? H.pause : 1;
      let gap = pen.pending * spaceAdv * (line().count ? Math.max(0.7, Math.exp(sigW * w.gapZ - sigW * sigW / 2)) * punct * (1 + 0.2 * tire * w.prog) : 1);
      const spaces = pen.pending, spaceFrom = pen.spaceFrom;
      pen.pending = 0; // leading spaces at a paragraph start become its indent
      // ----- line end (rules 11, 12): break early, overpack, or squeeze the last word in -----
      let wrapped = false;
      const lineBefore = line(), endXBefore = pen.endX, endOBefore = pen.endO;
      if (line().count) {
        const pad = padFor(line(), w.tilt);
        const x = pen.x, end = x + gap + sh.wx, inkEnd = x + gap + sh.ink;
        if (end > line().edge || inkEnd > maxU - pad) {
          let fits = inkEnd <= maxU - pad && w.u1 < H.overpack;
          if (!fits && !ink) {
            const room = maxU - pad - x - gap * 0.85;
            // (a squeezed word, counting its own size, stays within 14% of the hand's normal width)
            // (and never by more than 12% of its own width: 5–15% is what writers do)
            const least = Math.max(0.88, Math.min(1, 0.86 / w.scale));
            if (inkEnd > maxU - pad && room / sh.ink >= least && w.u2 < H.squeeze) {
              const w2 = Object.assign({}, w, { squeeze: q(Math.max(least, room / sh.ink * 0.99), 0.001) });
              const sq = shapeWord(chars, w2, seedOf, { prev: null, index: 0, closed: true });
              if (x + gap * 0.85 + sq.ink <= maxU - pad) { sh = sq; Object.assign(w, w2); gap *= 0.85; fits = true; }
            }
          }
          if (fits) line().packed = true;
          else {
            newLine(w.care, false);
            pen.lp++;
            gap = 0; wrapped = true;
          }
        }
      }
      // ----- caret stops for the spaces before this word -----
      if (spaces) {
        if (wrapped) {
          // spaces stay at the end of the line above; the boundary after them is also this line's start
          for (let j = 1; j <= spaces; j++) stop(spaceFrom + j, lineBefore, endXBefore + j * spaceAdv, j === spaces ? 'lineEnd' : 'space', j === spaces ? 'before' : undefined);
        } else {
          const x0 = endOBefore == null ? lineBefore.x0 : endXBefore;
          for (let j = 1; j < spaces; j++) stop(spaceFrom + j, line(), x0 + (pen.x + gap - x0) * j / spaces, 'space');
          if (endOBefore == null) stop(spaceFrom, line(), x0, 'space'); // an indent: the paragraph's own start
        }
      }
      pen.x += gap;
      const r = place(w, sh, pen.x, tokStart, { mayBreak: true, onLine: 0, inkIndex, wrapped });
      // caret stop after the word
      stop(tokStart + tok.length, line(), r.endX, 'glyph');
      pen.x = r.endX; pen.endO = tokStart + tok.length; pen.endX = r.endX;
      line().count++;
      pen.prevEnd = tok;
      if (ink) pen.open = { w, last: chars[chars.length - 1][0], count: chars.length, frame: r.frame, prevIt: r.prevIt, prevEndX: r.prevEndX, onLine: r.onLine, dx: sh.wx };
    }
    // trailing spaces at the end of a paragraph (or of the text so far)
    if (pen.pending) {
      const x0 = pen.endO == null ? line().x0 : pen.endX;
      for (let j = 1; j <= pen.pending; j++) stop(pen.spaceFrom + j, line(), x0 + j * spaceAdv, 'space');
      if (pen.endO == null) stop(pen.spaceFrom, line(), x0, 'space');
      if (pi + 1 < paras.length) pen.pending = 0;
    }
    // an empty paragraph (or empty text) still has a caret stop
    if (fresh && stops.length === paraStops) stop(paraStart, line(), line().x0, 'empty');
    pen.offset += para.length + (pi + 1 < paras.length ? 1 : 0);
  });

  // ----- the page covers all of its ink -----
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  for (const it of items) {
    const b = it.box;
    if (b[1] < top) top = b[1]; if (b[3] > bottom) bottom = b[3]; if (b[0] < left) left = b[0]; if (b[2] > right) right = b[2];
  }
  if (!items.length) { top = firstY - M.ascender; bottom = firstY; left = right = marginL; }
  const margin = 0.15 * xh;
  // a page whose first baseline wasn't given moves down so nothing rises above its top edge
  const shift = !placed && !opts.start && top < margin ? margin - top : 0;
  if (shift) {
    for (const it of items) { it.y += shift; it.box[1] += shift; it.box[3] += shift; }
    for (const r of runs) { r.y += shift; r.box[1] += shift; r.box[3] += shift; }
    for (const s of stops) s.y += shift;
    for (const l of lineInfo) { l.y += shift; if (l.rule != null) l.rule += shift; }
    for (let i = 0; i < rules.length; i++) rules[i] += shift;
    top += shift; bottom += shift;
  }
  stops.sort((a, b) => a.o - b.o || (a.aff === 'before' ? -1 : b.aff === 'before' ? 1 : 0));
  const lastBase = pen.line ? pen.line.y + (ruled ? pen.line.float : 0) : firstY;
  pen.seen = Object.assign({}, seen);
  return {
    items, runs, stops, height: Math.max(bottom + margin, lastBase + M.descender), width: maxU, lines: lineInfo.length, misses, lineHeight: lineH,
    rules, ruling: ruled ? { first: firstY + shift, pitch: lineH } : null,
    lineInfo, words: wordsHere, ink: { top, bottom, left, right }, pen, text, from, seed: p.seed, xh, connected,
  };
}

// A page written in pieces that never move: Ink mode's frozen placements. Committed text is laid out
// once from the pen's position and kept; a draft (the typing the pen hasn't reached) is laid out from
// the same position, so thought letters sit exactly where the ink will go.
//   const sheet = inkPage(p, { maxWidth, firstBaseline, ruled, lineHeight, salt });
//   sheet.write('Dear Ada, ')      // commit: frozen items, returns the new page piece
//   sheet.draft('how are')         // thought letters for typing not yet inked (not committed)
//   sheet.pages / sheet.items / sheet.pen
// Commit whole words where you can: a word split across commits is continued in the same frame, but
// the first piece can't know whether the whole word would have wrapped.
// Pass firstBaseline (the paper's first line): a page written in pieces can't move down afterwards.
export function inkPage(p, opts = {}) {
  const base = Object.assign({}, opts, { ink: { salt: opts.salt == null ? '' : opts.salt } });
  delete base.salt;
  let pen = opts.start || null;
  const pages = [];
  return {
    get pen() { return pen; },
    pages,
    get items() { return pages.flatMap((pg) => pg.items); },
    write(text) { const pg = layout(p, text, Object.assign({}, base, { start: pen })); pages.push(pg); pen = pg.pen; return pg; },
    draft(text) { return layout(p, text, Object.assign({}, base, { start: pen })); },
  };
}

// Letters written at a given place in this hand, for corrections: an insertion above a line (smaller),
// a letter pressed over a wrong one (a little bigger, heavier pen), a word in the margin.
//   writeAt(p, 'very', { x, y, angle, lean, size: 0.7, weight: 1, seed: 'fix:12', line })
// x, y: where the first letter starts, on its baseline (page units); angle: the baseline's turn (radians,
// + = uphill; e.g. lineAngle of the line it belongs to); lean: degrees on top of the hand's slant (lineLean);
// size: letter size (insertions 0.55–0.8, overwrites 1.03–1.12); weight: pen width and ink (overwrites
// 1.2–1.4; items carry .weight); seed: names this writing, so its letters are its own and stay put;
// line: the item.line to report (default -1). Uses the same word logic as layout: gaps, word lean and size,
// letter shapes. Returns { items, runs, stops, endX } (stops use offsets within `text`).
export function writeAt(p, text, opts = {}) {
  const x = opts.x || 0, y = opts.y || 0;
  const line = {
    n: opts.line == null ? -1 : opts.line, y, x0: x, x1: x + 1e6, slope: (opts.angle || 0) / DEG,
    lean: opts.lean || 0, flow: 0, bow: 0, droop: 0, drift: 0, phase: 0.37, wave: 1e4, edge: Infinity,
    float: 0, rule: undefined, count: 0, packed: false,
  };
  const start = {
    lineNo: line.n, line, lp: 0, x, wp: 0, wordsBefore: 0, offset: 0, para: 0, words: 0, pending: 0,
    prevEnd: '', seen: {}, glyphs: 0, open: null, endO: null, endX: x,
  };
  const page = layout(p, String(text), {
    start, maxWidth: x + 1e6, firstBaseline: y, ink: { salt: opts.seed == null ? 'at' : opts.seed },
    size: opts.size, weight: opts.weight,
  });
  return { items: page.items, runs: page.runs, stops: page.stops, endX: page.pen.x };
}
