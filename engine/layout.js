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
// pen needs to keep writing (line, position, word counts, fatigue) travels in that object.

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

// AR(1) along an index (lines): x_k = ρ·x_(k−1) + √(1−ρ²)·z_k, z_k drawn from the index alone.
// Call with non-decreasing k.
function ar(key, rho) {
  const s = Math.sqrt(1 - rho * rho);
  let x = 0, k = -1;
  return (i) => {
    while (k < i) { k++; const z = clamp(rng(key + ':' + k).gauss(), -2.5, 2.5); x = k ? rho * x + s * z : z; }
    return x;
  };
}

// lean (x += y·k) then rotate a finished glyph about its origin (a > 0 = counter-clockwise in y-up
// glyph space = uphill). Pen widths were set before, so a line's lean doesn't fatten the strokes.
function poseGlyph(g, a, k) {
  if (Math.abs(a) < 1e-5 && Math.abs(k) < 1e-5) return g;
  const c = Math.cos(a), s = Math.sin(a);
  const rot = (q) => { const x = q[0] + q[1] * k; return [c * x - s * q[1], s * x + c * q[1]]; };
  const map = new Map();
  const contours = g.contours.map((poly) => { const r = poly.map(rot); map.set(poly, r); return r; });
  const strokes = g.strokes.map((st) => Object.assign({}, st, { center: st.center.map(rot), contour: map.get(st.contour) || st.contour.map(rot) }));
  return Object.assign({}, g, { contours, strokes });
}

// ink extent of a glyph along x (glyph space)
function inkX(g) {
  let x0 = Infinity, x1 = -Infinity;
  for (const c of g.contours) for (const q of c) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; }
  return x0 <= x1 ? [x0, x1] : [0, g.advance];
}

// Finished glyph instances, reused while the hand and the instance stay the same (typing re-lays the
// page on every key, but only the edited word needs new letters). Keyed by the params object plus a
// fingerprint of its values, so a mutated params object never returns stale letters.
const glyphCaches = new WeakMap();
function glyphCache(p) {
  let fp = '';
  for (const k in p) { const v = p[k]; if (v === null || typeof v !== 'object') fp += k + '=' + v + ';'; }
  let byP = glyphCaches.get(p);
  if (!byP || byP.fp !== fp) { byP = { fp, map: new Map() }; glyphCaches.set(p, byP); }
  if (byP.map.size > 20000) byP.map.clear();
  return byP.map;
}


// opts: { maxWidth (font units), lineHeight, firstBaseline, marginLeft (font units, default 0),
//         ruled (bool), start (a page.pen to continue from) }
// Plain paper: lineHeight is the mean pitch (default: from the hand, pageMetrics(p).pitch) and each line
//   varies around it. firstBaseline defaults to just below the hand's ascenders; when it's left out the
//   page also moves down if any ink would rise above y = 0.
// Ruled (or grid) paper: baselines sit on rules at firstBaseline + n·lineHeight. Words float a little
//   above the rule or dip just below it, a line now and then strays off its rule, and a rule may be
//   skipped before a paragraph.
// Text is normalised to NFC first.
// Returns { items, height, width, lines, misses, lineHeight, rules, lineInfo, words, ink, pen, seed, xh, connected }
//   items: { kind: 'glyph', ch, g, x, y, rot, charIndex, inkIndex, line, para, word, wkey, tempo, synthetic? }
//        | { kind: 'miss',  ch, x, y, advance, charIndex, line, para, word, wkey }   (a character this hand can't write yet)
//   charIndex = UTF-16 offset in the NFC text (a hyphen added at a word break is `synthetic`);
//   rot = baseline angle baked into g (radians); wkey = the word's identity (text#occurrence)
//   rules: ruled baselines used; ruling: { first, pitch } of the paper's rules (ruled only); lineInfo: per line { n (= item.line), y, x0, slope (deg, + = uphill),
//   lean (deg, the line's own; words also drift around it), bow and droop (font units at the line's middle / end), edge (where it meant to stop), rule? }
//   ink: { top, bottom, left, right } of all ink (page units); height covers it
//   pen: where writing stopped, to continue with layout(p, more, { ...opts, start: page.pen })
export function layout(p, text, opts = {}) {
  text = String(text).normalize('NFC');
  const H = pageHabits(p);
  const M = pageMetrics(p, H);
  const maxU = opts.maxWidth || 12000;
  const ruled = !!opts.ruled;
  const lineH = opts.lineHeight || M.pitch;
  const pitch = ruled ? lineH : opts.lineHeight ? lineH * H.pitch : lineH;
  const placed = opts.firstBaseline != null;
  const xh = M.xh;
  const firstY = placed ? opts.firstBaseline : M.firstBaseline;
  const marginL = opts.marginLeft || 0;
  const N = p.noise;
  const connected = !!(getStyle(p.style) && getStyle(p.style).connected);
  const care0 = clamp(p.neatness, 0, 1);
  const wander = p.lineWander == null ? 1 : Math.max(0, p.lineWander);
  const tire = (p.fatigue == null ? 1 : Math.max(0, p.fatigue)) * (1 - care0); // scaled by (1 − skill)
  const marks = markHabits(p);
  const cache = glyphCache(p);
  const spaceAdv = makeGlyph(p, ' ', null).advance * p.wordSpace; // = hand.space
  const missAdv = has(p, 'n') ? makeGlyph(p, 'n', null).advance : MISS_ADVANCE;
  const hyphen = has(p, '-');
  const hyInk = hyphen ? 0.7 * inkX(makeGlyph(p, '-', null))[1] : 0;
  const S = 'pg:' + p.seed + ':';
  const slopeZ = ar(S + 'slope', H.slopeRho);   // per line
  const floatZ = ar(S + 'float', 0.6);          // per line (ruled)
  const lslantZ = ar(S + 'lslant', 0.6);        // per line
  const pr = rng(S + 'page');
  const pageSlant = pr.gauss() * 0.5, pageSize = 1 + pr.gauss() * 0.015;

  // ----- the pen: everything needed to keep writing (a fresh page, or opts.start) -----
  const pen = opts.start ? JSON.parse(JSON.stringify(opts.start)) : {
    lineNo: -1, line: null, lp: 0, x: 0, wp: 0, wordsBefore: 0, offset: 0, para: -1, words: 0,
    pending: 0, prevEnd: '', seen: {},
  };
  const seen = Object.assign(Object.create(null), pen.seen);

  // a word's own draws, keyed by its identity
  const zOf = (name, key) => clamp(rng(S + name + ':' + key).gauss(), -2.5, 2.5);
  // a slow wave along a line (two octaves, phase never on the noise's integer zeros)
  const wave = (x, ph, L) => 0.7 * N.n1(x / L + ph) + 0.3 * N.n1(x / (0.43 * L) + 1.7 * ph + 0.5);
  const q = (v, step) => Math.round(v / step) * step; // quantised, so cached letters are reused

  const items = [], misses = [], lineInfo = [], rules = [];
  let wordsHere = 0;

  // The research ranges are for paper lines ~35 x-heights long. Longer lines (small text in a wide
  // box) keep the same look: angles shrink and curves are capped, so line ends don't wander off.
  const lineXh = maxU / xh;
  const kLen = Math.min(1, Math.pow(36 / lineXh, 0.75));
  const curveU = Math.min(maxU, 36 * xh);
  const ruledSlope = Math.min(0.35, Math.atan(0.08 * xh / maxU) / DEG);
  // baseline height (page y, down) of `ln` at x: slope, bow, droop, and a slow drift along the line
  const baseAt = (ln, x) => {
    const u = clamp((x - ln.x0) / Math.max(1, maxU - ln.x0), 0, 1);
    const drift = ln.drift * N.n1(x / (20 * xh) + ln.phase);
    return ln.y - (x - ln.x0) * Math.tan(ln.slope * DEG) + curveU * (ln.bow * 4 * u * (1 - u) + ln.droop * smooth((u - 0.55) / 0.45)) + drift;
  };
  const angleAt = (ln, x) => -Math.atan((baseAt(ln, x + 40) - baseAt(ln, x - 40)) / 80);
  // the line's lean plus a slow drift in lean along it (degrees, added to the writer's slant)
  const leanAt = (ln, x) => ln.lean + ln.flow * wave(x, ln.phase + 3.3, 16 * xh);

  function newLine(care, paraStart) {
    const prev = pen.line;
    const lineNo = ++pen.lineNo;
    const lr = rng(S + 'line:' + lineNo);
    const ls = wander * (0.6 + 0.8 * (1 - care)); // how much this line wanders
    const z = slopeZ(lineNo);
    const ln = {
      // (on ruled paper the rule guides the hand: the whole line stays within ~0.08 x-height of it)
      slope: (ruled ? clamp(0.15 * H.slope + 0.12 * ls * z, -1, 1) * ruledSlope : clamp(H.slope * (0.6 + 0.4 * ls) + H.slopeSd * ls * z, -4, 4) * kLen) * Math.min(1, wander),
      lean: H.lineSlantSd * spreadOf(care) * wander * lslantZ(lineNo),
      flow: 1.1 * spreadOf(care) * Math.min(1.5, wander),
      bow: ruled ? 0 : (H.bow + H.bowSd * clamp(lr.gauss(), -2.5, 2.5)) * ls,
      droop: ruled ? 0 : H.droop * ls * (0.4 + lr()),
      drift: xh * (ruled ? 0.04 : 0.045) * ls,
      phase: lineNo * 7.31 + 0.37 + lr() * 0.5, // never on the noise's integer zeros
      x0: marginL + maxU * (clamp(H.marginSd * ls * (1 + 0.9 * lr.gauss()), 0, 0.03) + Math.min(0.04, H.marginDrift * wander * pen.lp)),
      edge: maxU * (1 - H.reach * (0.3 + 0.7 * lr()) * Math.min(1.5, ls) - (prev && prev.packed ? 0.025 : 0)),
      float: 0, y: 0, rule: 0, count: 0, packed: false,
    };
    if (ruled) {
      // sometimes a rule is skipped before a new paragraph
      const prevRule = prev ? Math.round((prev.rule - firstY) / lineH) : -1;
      const skip = paraStart && prev && lr() < H.skipRule * (0.5 + (1 - care)) * Math.min(1, wander) ? 1 : 0;
      ln.rule = firstY + (prevRule + 1 + skip) * lineH;
      // words float a little above the rule; now and then a whole line strays off it
      ln.float = xh * (H.float + 0.025 * ls * floatZ(lineNo));
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
      const tight = () => Math.min(...[ln.x0, maxU * 0.5, maxU].map((x) => baseAt(ln, x) - baseAt(prev, x)));
      for (let i = 0; i < 4 && tight() < 0.86 * pitch; i++) {
        ln.slope = (ln.slope + prev.slope) / 2; ln.bow = (ln.bow + prev.bow) / 2; ln.droop = (ln.droop + prev.droop) / 2;
      }
      const t = tight();
      if (t < 0.86 * pitch) ln.y += 0.86 * pitch - t;
    }
    lineInfo.push({ n: lineNo, y: ln.y, x0: ln.x0, slope: ln.slope, lean: ln.lean, bow: ln.bow * curveU, droop: ln.droop * curveU, edge: ln.edge, rule: ruled ? ln.rule : undefined });
    pen.line = ln;
    pen.x = ln.x0;
    return ln;
  }

  const paras = text.split('\n');
  paras.forEach((para, pi) => {
    // the first piece continues the current line when resuming; every other one starts a paragraph
    if (pi > 0 || !pen.line) {
      pen.para++; pen.lp = 0; pen.wordsBefore += pen.wp; pen.wp = 0; pen.pending = 0; pen.prevEnd = '';
      newLine(care0, pen.lineNo >= 0);
    }
    const line = () => pen.line;
    const tokens = para.match(/ +|[^ ]+/g) || [];
    let tokOff = 0;
    for (const tok of tokens) {
      const tokStart = pen.offset + tokOff;
      tokOff += tok.length;
      if (tok[0] === ' ') { pen.pending += tok.length; continue; }
      // ----- identity: this word's text and which occurrence of it this is -----
      const n = seen[tok] = (seen[tok] || 0) + 1;
      const wkey = tok + '#' + (n - 1);
      const w = pen.words++;
      wordsHere++;
      // ----- care arc over the paragraph (rule 14): careful first lines, then drift -----
      const prog = q(smooth((pen.wp + 0.35 * pen.wordsBefore - 8) / 150), 0.05);
      const fresh = 1 - smooth(pen.wp / 25);
      pen.wp++;
      const care = q(clamp(care0 + 0.12 * (1 - care0) * fresh - 0.3 * tire * prog, 0, 1), 0.025);
      const spread = spreadOf(care);
      // ----- word level (rule 2): the whole word leans, grows and sits together -----
      const wr = rng(S + 'word:' + wkey);
      const slant = q(clamp(pageSlant + 1.25 * spread * zOf('slant', wkey), -4, 4), 0.01);
      const scale = q(clamp(pageSize * (1 + 0.04 * spread * zOf('size', wkey)) * (1 + 0.1 * tire * prog), 0.88, 1.16), 0.001);
      let lift = xh * 0.006 * (0.35 + 0.65 * spread) * (0.6 + 0.6 * (p.drift == null ? 0.7 : p.drift)) * zOf('base', wkey);
      let tilt = clamp(wr.gauss() * 0.3 * spread, -0.9, 0.9) * DEG;
      const tempo = H.tempo * (1 + 0.12 * tire * prog) * (1.15 - 0.3 * care);
      const chars = [];
      for (let i = 0; i < tok.length;) { const ch = String.fromCodePoint(tok.codePointAt(i)); chars.push([ch, tokStart + i]); i += ch.length; }
      // "tt": one bar across both, where this writer does that (rule 7)
      const bars = chars.map(() => null);
      if (marks.shareTT) for (let i = 0; i + 1 < chars.length; i++) {
        if (chars[i][0] === 't' && chars[i + 1][0] === 't' && !bars[i]) { bars[i] = 'lead'; bars[i + 1] = 'follow'; }
      }
      // ----- build the word's letters; spacing rhythm (rule 13): lognormal letter gaps -----
      const sigL = clamp(0.1 * spread, 0.04, 0.15);
      const letter = (ch, seedKey, wi, ctx, squeeze, bar) => {
        const inst = { seed: seedKey, amount: 1, slant, scale, care };
        if (squeeze) inst.squeeze = squeeze;
        if (bar) inst.bar = bar;
        const ck = ch + '\u0001' + seedKey + '\u0001' + slant + '\u0001' + scale + '\u0001' + care + '\u0001' + (squeeze || 1) + '\u0001' + (bar || '') + '\u0001' +
          (ctx ? [ctx.prev, ctx.next, ctx.index, ctx.wordStart, ctx.wordEnd].join('\u0002') : '');
        let g = cache.get(ck);
        if (!g) { g = makeGlyph(p, ch, inst, ctx); cache.set(ck, g); }
        return g;
      };
      const build = (squeeze) => {
        const glyphs = [];
        let wx = 0, ink = 0;
        chars.forEach(([ch, ci], wi) => {
          if (!has(p, ch)) {
            // never fall back silently: the renderer shows a placeholder, and we log the miss
            if (!squeeze) misses.push(ch);
            const adv = missAdv * scale * (squeeze || 1);
            glyphs.push({ miss: ch, dx: wx, advance: adv, ink: [0, adv], charIndex: ci });
            wx += adv; ink = Math.max(ink, wx);
            return;
          }
          const ctx = { prev: wi ? chars[wi - 1][0] : null, next: wi + 1 < chars.length ? chars[wi + 1][0] : null, index: wi, wordStart: wi === 0, wordEnd: wi === chars.length - 1 };
          const g = letter(ch, 'w:' + wkey + ':' + wi, wi, ctx, squeeze, bars[wi]);
          let gap = 0;
          if (!connected && wi + 1 < chars.length) {
            const z = clamp(rng('sp:' + p.seed + ':' + wkey + ':' + wi).gauss(), -2.5, 2.5);
            // (never closer than 80% of the hand's usual gap, so letters don't collide)
            gap = 2 * p.sidebearing * scale * (squeeze || 1) * (Math.max(0.8, Math.exp(sigL * z - sigL * sigL / 2)) - 1 + 0.1 * tire * prog);
          }
          const gi = inkX(g);
          glyphs.push({ g, ch, dx: wx, ink: gi, charIndex: ci, letter: /\p{L}/u.test(ch) });
          ink = Math.max(ink, wx + gi[1]);
          wx += g.advance + gap;
        });
        return { glyphs, wx, ink };
      };
      let { glyphs, wx, ink } = build(0);
      // ink keeps clear of the right edge: a line's tilt and lean push tall or deep strokes sideways
      const padFor = (ln) => {
        const a = angleAt(ln, maxU), k = Math.tan((ln.lean + Math.abs(ln.flow)) * DEG), t = Math.abs(tilt);
        return 0.02 * xh + Math.max(0, k - Math.sin(a - t)) * M.ascender + Math.max(0, Math.sin(a + t) - k) * M.descender;
      };
      let pad = padFor(line());
      // ----- word gap: lognormal, wider after punctuation and when tired -----
      const sigW = clamp(0.2 * spread, 0.08, 0.32);
      const zg = clamp(wr.gauss(), -2.5, 2.5);
      const punct = /[.!?]["'’”)]*$/.test(pen.prevEnd) ? H.stop : /[,;:]["'’”)]*$/.test(pen.prevEnd) ? H.pause : 1;
      let gap = pen.pending * spaceAdv * (line().count ? Math.max(0.7, Math.exp(sigW * zg - sigW * sigW / 2)) * punct * (1 + 0.2 * tire * prog) : 1);
      pen.pending = 0; // leading spaces at a paragraph start become its indent
      // ----- line end (rules 11, 12): break early, overpack, or squeeze the last word in -----
      if (line().count) {
        const x = pen.x, end = x + gap + wx, inkEnd = x + gap + ink;
        if (end > line().edge || inkEnd > maxU - pad) {
          let fits = inkEnd <= maxU - pad && wr() < H.overpack;
          if (!fits) {
            const room = maxU - pad - x - gap * 0.85;
            // (a squeezed word, counting its own size, stays within 14% of the hand's normal width)
            const least = Math.min(1, 0.86 / scale);
            if (inkEnd > maxU - pad && room / ink >= least && wr() < H.squeeze) {
              const sq = build(q(Math.max(least, room / ink * 0.99), 0.001));
              if (x + gap * 0.85 + sq.ink <= maxU - pad) { ({ glyphs, wx, ink } = sq); gap *= 0.85; fits = true; }
            }
          }
          if (fits) line().packed = true;
          else {
            newLine(care, false);
            pen.lp++;
            gap = 0;
            pad = padFor(line());
          }
        }
      }
      pen.x += gap;
      // ----- place the word along its line; a word wider than the line breaks, with a hyphen between letters -----
      let wx0 = pen.x, base = pen.x; // base: page x of the word's dx = 0 on this line
      if (ruled) tilt = clamp(tilt, -1, 1) * Math.min(1, Math.atan(0.05 * xh / Math.max(1, ink)) / Math.max(1e-6, Math.abs(tilt)));
      const settle = () => {
        // on ruled paper the whole word floats a little above the rule, or dips just below it
        if (!ruled) return lift;
        const mid = base + Math.min(ink, maxU - base) / 2;
        return clamp(baseAt(line(), mid) + lift, line().rule - 0.2 * xh, line().rule + 0.06 * xh) - baseAt(line(), mid);
      };
      let wlift = settle();
      let onLine = 0;
      // only a word that can't fit on this line at all breaks
      let breaks = pen.x + ink > maxU - pad;
      const inkIndex = chars.length ? chars[chars.length - 1][1] + 1 : tokStart;
      const hyGlyph = (i) => letter('-', 'w:' + wkey + ':hy' + i, 0, null, 0.7); // the (short) hyphen before glyph i
      for (let i = 0; i < glyphs.length; i++) {
        const it = glyphs[i];
        let gx = base + it.dx;
        // room for a hyphen after this letter, in case the next one has to go to a new line
        const next = glyphs[i + 1];
        let need = it.ink[1];
        if (next && it.letter && next.letter && hyphen && gx + it.g.advance + 1.2 * hyInk > maxU - pad) {
          need = Math.max(need, it.g.advance + inkX(hyGlyph(i + 1))[1]);
        }
        if (breaks && onLine && gx + need > maxU - pad) {
          const prevIt = glyphs[i - 1];
          if (hyphen && prevIt.letter && it.letter) {
            const hg = hyGlyph(i);
            const hx = base + prevIt.dx + (prevIt.g ? prevIt.g.advance : prevIt.advance);
            const hy = baseAt(line(), hx) + wlift;
            items.push({ kind: 'glyph', ch: '-', g: poseGlyph(hg, angleAt(line(), hx), Math.tan(leanAt(line(), hx) * DEG)), x: hx, y: hy, rot: angleAt(line(), hx), charIndex: prevIt.charIndex, inkIndex, line: pen.lineNo, para: pen.para, word: w, wkey, tempo, synthetic: true });
          }
          newLine(care, false);
          pen.lp++;
          pad = padFor(line());
          base = pen.x - it.dx; wx0 = pen.x; gx = pen.x; onLine = 0;
          breaks = base + ink > maxU - pad;
          wlift = settle();
        }
        const ln = line();
        let bob = 0;
        if (!it.miss) {
          // letters don't all sit on the line; joined letters ride a smooth wave instead, so joins still meet
          bob = connected
            ? xh * 0.01 * spread * N.n1(gx / (3.5 * xh) + 13.37 + zOf('wave', wkey))
            : clamp(rng('bob:' + p.seed + ':' + wkey + ':' + i).gauss(), -2.5, 2.5) * xh * 0.008 * spread;
        }
        let gy = baseAt(ln, gx) + wlift + bob - (gx - wx0) * Math.tan(tilt);
        if (ruled && !connected) gy = clamp(gy, ln.rule - 0.22 * xh, ln.rule + 0.08 * xh);
        const a = angleAt(ln, gx) + tilt;
        if (it.miss) {
          items.push({ kind: 'miss', ch: it.miss, x: gx, y: gy, advance: it.advance, charIndex: it.charIndex, line: pen.lineNo, para: pen.para, word: w, wkey });
        } else {
          // inkIndex: ink density is sampled per word position (see pen.strokeOpacity)
          items.push({ kind: 'glyph', ch: it.ch, g: poseGlyph(it.g, a, Math.tan(leanAt(ln, wx0) * DEG)), x: gx, y: gy, rot: a, charIndex: it.charIndex, inkIndex, line: pen.lineNo, para: pen.para, word: w, wkey, tempo });
        }
        onLine++;
      }
      pen.x = base + wx;
      line().count++;
      pen.prevEnd = tok;
    }
    pen.offset += para.length + (pi + 1 < paras.length ? 1 : 0);
  });

  // ----- the page covers all of its ink -----
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  for (const it of items) {
    if (it.kind !== 'glyph') { top = Math.min(top, it.y - 0.7 * CAP); bottom = Math.max(bottom, it.y); continue; }
    for (const c of it.g.contours) for (const v of c) {
      const X = it.x + v[0], Y = it.y - v[1];
      if (Y < top) top = Y; if (Y > bottom) bottom = Y; if (X < left) left = X; if (X > right) right = X;
    }
  }
  if (!items.length) { top = firstY - M.ascender; bottom = firstY; left = right = marginL; }
  const margin = 0.15 * xh;
  // a page whose first baseline wasn't given moves down so nothing rises above its top edge
  const shift = !placed && !opts.start && top < margin ? margin - top : 0;
  if (shift) {
    for (const it of items) it.y += shift;
    for (const l of lineInfo) { l.y += shift; if (l.rule != null) l.rule += shift; }
    for (let i = 0; i < rules.length; i++) rules[i] += shift;
    if (pen.line) { pen.line.y += shift; pen.line.rule += shift; }
    top += shift; bottom += shift;
  }
  const lastBase = pen.line ? pen.line.y + (ruled ? pen.line.float : 0) : firstY;
  pen.seen = Object.assign({}, seen);
  return {
    items, height: Math.max(bottom + margin, lastBase + M.descender), width: maxU, lines: lineInfo.length, misses, lineHeight: lineH,
    rules, ruling: ruled ? { first: firstY + shift, pitch: lineH } : null,
    lineInfo, words: wordsHere, ink: { top, bottom, left, right }, pen, seed: p.seed, xh, connected,
  };
}
