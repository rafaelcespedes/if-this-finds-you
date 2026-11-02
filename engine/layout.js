// layout.js — text -> positioned glyph instances on a page. Pure data, no DOM.
//
// Every occurrence of a letter is its own instance (sub-seed = position + char), so no two are alike.
// Coordinates: font units (UPM 1000). x grows right, y grows DOWN (page space); `y` is the baseline.
// Glyph contours themselves are y-up, so a renderer draws contour point q at (x + q.x, y - q.y).
// A line's slope and curve are already baked into each glyph's contours (rotated about its origin).
//
// Variation is hierarchical and correlated (docs/research/human-feel.md §4, rules 2, 5, 11–16):
//   writer (seed) -> page -> line -> word -> letter -> stroke
// - Page and line: each line gets its own slope (writer habit + correlated noise), pitch, slight bow,
//   left-margin drift that resets per paragraph, and a ragged end (early breaks, overpacking, squeezing).
// - Word: the whole word leans, grows and sits up or down together (AR(1) along the text).
// - Letter: only a small wobble around the word (makeGlyph's per-instance section).
// One "care" scalar (Neatness) scales every spread together, and care fades over a paragraph.
// Draws are indexed by position (word number, line number), never by content, so typing at the end
// never changes what is already written.

import { rng, clamp, smooth, DEG } from './core.js';
import { makeGlyph, markHabits, has, UPM, CAP } from './hand.js';
import { getStyle } from './glyphs.js';

export const MISS_ADVANCE = 560;

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
    wordSlantRho: r.range(0.6, 0.8),
    wordBaseRho: r.range(0.4, 0.6),
    stop: r.range(1.2, 1.55),         // word gap after . ! ?
    pause: r.range(1.05, 1.25),       // word gap after , ; :
    tempo: r.range(0.85, 1.2),        // writing speed (animation)
  };
}

// AR(1) along an index: x_k = ρ·x_(k−1) + √(1−ρ²)·z_k, z_k drawn from the index alone.
// Call with non-decreasing k.
function ar(key, rho) {
  const s = Math.sqrt(1 - rho * rho);
  let x = 0, k = -1;
  return (i) => {
    while (k < i) { k++; const z = clamp(rng(key + ':' + k).gauss(), -2.5, 2.5); x = k ? rho * x + s * z : z; }
    return x;
  };
}

// rotate a finished glyph about its origin (a > 0 = counter-clockwise in y-up glyph space = uphill)
function rotateGlyph(g, a) {
  if (Math.abs(a) < 1e-5) return g;
  const c = Math.cos(a), s = Math.sin(a);
  const rot = (q) => [c * q[0] - s * q[1], s * q[0] + c * q[1]];
  const map = new Map();
  const contours = g.contours.map((poly) => { const r = poly.map(rot); map.set(poly, r); return r; });
  const strokes = g.strokes.map((st) => Object.assign({}, st, { center: st.center.map(rot), contour: map.get(st.contour) || st.contour.map(rot) }));
  return Object.assign({}, g, { contours, strokes });
}

// opts: { maxWidth (font units), lineHeight (font units, default 1.6 em),
//         firstBaseline (default 0.95 em), ruled (bool) }
// ruled: lines sit on rules at firstBaseline + n·lineHeight. Pitch is locked to the rules; words float
// 0–8% of the x-height off the rule, and lines still tilt a little.
// Returns { items, height, lines, misses, lineHeight, rules, lineInfo, words, seed, xh, connected }
//   items: { kind: 'glyph', ch, g, x, y, rot, charIndex, inkIndex, line, para, word, tempo }
//        | { kind: 'miss',  ch, x, y, charIndex, line, para, word }   (a character this hand can't write yet)
//   charIndex = UTF-16 offset of the character in `text`; rot = baseline angle baked into g (radians)
//   rules: ruled baselines used (ruled only); lineInfo: per line { y, x0, slope (deg, + = uphill),
//   bow and droop (font units at the line's middle / end), edge (where this line meant to stop) }
export function layout(p, text, opts = {}) {
  const H = pageHabits(p);
  const maxU = opts.maxWidth || 12000;
  const ruled = !!opts.ruled;
  const lineH = opts.lineHeight || 1.6 * UPM;
  const pitch = ruled ? lineH : lineH * H.pitch;
  const firstY = opts.firstBaseline == null ? 0.95 * UPM : opts.firstBaseline;
  const xh = p.xHeight * CAP;
  const N = p.noise;
  const connected = !!(getStyle(p.style) && getStyle(p.style).connected);
  const care0 = clamp(p.neatness, 0, 1);
  const wander = p.lineWander == null ? 1 : Math.max(0, p.lineWander);
  const tire = (p.fatigue == null ? 1 : Math.max(0, p.fatigue)) * (1 - care0); // scaled by (1 − skill)
  const marks = markHabits(p);
  const spaceAdv = makeGlyph(p, ' ', null).advance * p.wordSpace; // = hand.space
  const S = 'pg:' + p.seed + ':';
  const slopeZ = ar(S + 'slope', H.slopeRho);       // per line
  const floatZ = ar(S + 'float', 0.6);              // per line (ruled)
  const slantZ = ar(S + 'wslant', H.wordSlantRho);  // per word
  const sizeZ = ar(S + 'wsize', 0.5);
  const baseZ = ar(S + 'wbase', H.wordBaseRho);
  const pr = rng(S + 'page');
  const pageSlant = pr.gauss() * 0.5, pageSize = 1 + pr.gauss() * 0.015;

  const items = [], misses = [], lineInfo = [], rules = [];
  let lineNo = -1, line = null, maxY = firstY;
  let wordNo = 0, wordsBefore = 0, offset = 0;

  // The research ranges are for paper lines ~35 x-heights long. Longer lines (small text in a wide
  // box) keep the same look: angles shrink and curves are capped, so line ends don't wander off.
  const lineXh = maxU / xh;
  const kLen = Math.min(1, Math.pow(36 / lineXh, 0.75));
  const curveU = Math.min(maxU, 36 * xh);
  // baseline height (page y, down) and angle (y-up, + = uphill) of `ln` at x
  const baseAt = (ln, x) => {
    const u = clamp((x - ln.x0) / Math.max(1, maxU - ln.x0), 0, 1);
    return ln.y - (x - ln.x0) * Math.tan(ln.slope * DEG) + curveU * (ln.bow * 4 * u * (1 - u) + ln.droop * smooth((u - 0.55) / 0.45));
  };
  const ruledSlope = Math.min(0.35, Math.atan(0.08 * xh / maxU) / DEG);
  const angleAt = (ln, x) => -Math.atan((baseAt(ln, x + 40) - baseAt(ln, x - 40)) / 80);

  function newLine(lp, care) {
    const prev = line;
    lineNo++;
    const lr = rng(S + 'line:' + lineNo);
    const ls = wander * (0.6 + 0.8 * (1 - care)); // how much this line wanders
    const z = slopeZ(lineNo);
    const ln = {
      // (on ruled paper the rule guides the hand: the whole line stays within ~0.08 x-height of it)
      slope: (ruled ? clamp(0.15 * H.slope + 0.12 * ls * z, -1, 1) * ruledSlope : clamp(H.slope * (0.6 + 0.4 * ls) + H.slopeSd * ls * z, -4, 4) * kLen) * Math.min(1, wander),
      bow: ruled ? 0 : (H.bow + H.bowSd * clamp(lr.gauss(), -2.5, 2.5)) * ls,
      droop: ruled ? 0 : H.droop * ls * (0.4 + lr()),
      x0: maxU * (clamp(H.marginSd * ls * (1 + 0.9 * lr.gauss()), 0, 0.03) + Math.min(0.04, H.marginDrift * wander * lp)),
      edge: maxU * (1 - H.reach * (0.3 + 0.7 * lr()) * Math.min(1.5, ls) - (prev && prev.packed ? 0.025 : 0)),
      float: ruled ? xh * (H.float + 0.025 * ls * floatZ(lineNo)) : 0,
      y: 0, rule: 0, count: 0, packed: false,
    };
    if (ruled) {
      ln.rule = firstY + lineNo * lineH;
      ln.y = ln.rule - ln.float;
      rules.push(ln.rule);
    } else if (!prev) {
      ln.y = firstY;
      // a climbing first line must not leave the top of the page
      const top = Math.min(baseAt(ln, ln.x0), baseAt(ln, maxU), baseAt(ln, (ln.x0 + maxU) / 2));
      if (top < firstY - 0.1 * xh) ln.y += firstY - 0.1 * xh - top;
    } else {
      ln.y = prev.y + pitch * (1 + H.pitchCv * Math.min(1.1, ls) * clamp(lr.gauss(), -1.7, 1.7));
      // lines fan, but never close up enough to collide (≥ 86% of the pitch along the line):
      // like a writer, first follow the line above more closely, and only then move down
      const tight = () => Math.min(...[ln.x0, maxU * 0.5, maxU].map((x) => baseAt(ln, x) - baseAt(prev, x)));
      for (let i = 0; i < 4 && tight() < 0.86 * pitch; i++) {
        ln.slope = (ln.slope + prev.slope) / 2; ln.bow = (ln.bow + prev.bow) / 2; ln.droop = (ln.droop + prev.droop) / 2;
      }
      const t = tight();
      if (t < 0.86 * pitch) ln.y += 0.86 * pitch - t;
    }
    lineInfo.push({ y: ln.y, x0: ln.x0, slope: ln.slope, bow: ln.bow * curveU, droop: ln.droop * curveU, edge: ln.edge, rule: ruled ? ln.rule : undefined });
    line = ln;
    return ln;
  }

  const paras = String(text).split('\n');
  paras.forEach((para, pi) => {
    let lp = 0, wp = 0;
    newLine(0, care0);
    let x = line.x0;
    let pendingSpaces = 0, prevEnd = '';
    const tokens = para.match(/ +|[^ ]+/g) || [];
    let tokOff = 0;
    for (const tok of tokens) {
      const tokStart = offset + tokOff;
      tokOff += tok.length;
      if (tok[0] === ' ') { pendingSpaces += tok.length; continue; }
      const w = wordNo++;
      // ----- care arc over the paragraph (rule 14): careful first lines, then drift -----
      const prog = smooth((wp + 0.35 * wordsBefore - 8) / 150);
      const fresh = 1 - smooth(wp / 25);
      wp++;
      const care = clamp(care0 + 0.12 * (1 - care0) * fresh - 0.3 * tire * prog, 0, 1);
      const spread = spreadOf(care);
      // ----- word level (rule 2): the whole word leans, grows and sits together -----
      const wr = rng(S + 'word:' + w);
      const slant = clamp(pageSlant + 0.7 * spread * wander * N.n1(w / 11 + 41.3) + 1.4 * spread * slantZ(w), -5, 5);
      const scale = clamp(pageSize * (1 + 0.02 * spread * N.n1(w / 13 + 7.7)) * (1 + 0.04 * spread * sizeZ(w)) * (1 + 0.07 * tire * prog), 0.86, 1.16);
      let lift = xh * 0.024 * (0.35 + 0.65 * spread) * (0.6 + 0.6 * (p.drift == null ? 0.7 : p.drift)) * baseZ(w);
      let tilt = clamp(wr.gauss() * 0.45 * spread, -1.2, 1.2) * DEG;
      const tempo = H.tempo * (1 + 0.12 * tire * prog) * (1.15 - 0.3 * care);
      const chars = [];
      for (let i = 0; i < tok.length;) { const ch = String.fromCodePoint(tok.codePointAt(i)); chars.push([ch, tokStart + i]); i += ch.length; }
      // "tt": one bar across both, where this writer does that (rule 7)
      const bars = chars.map(() => null);
      if (marks.shareTT) for (let i = 0; i + 1 < chars.length; i++) {
        if (chars[i][0] === 't' && chars[i + 1][0] === 't' && !bars[i]) { bars[i] = 'lead'; bars[i + 1] = 'follow'; }
      }
      // ----- build the word's letters; spacing rhythm (rule 13): lognormal letter gaps -----
      const sigL = clamp(0.15 * spread, 0.05, 0.25);
      const build = (squeeze) => {
        const glyphs = [];
        let wx = 0;
        chars.forEach(([ch, ci], wi) => {
          if (!has(p, ch)) {
            // never fall back silently: the renderer shows a placeholder, and we log the miss
            if (!squeeze) misses.push(ch);
            glyphs.push({ miss: ch, dx: wx, charIndex: ci });
            wx += MISS_ADVANCE * scale * (squeeze || 1);
            return;
          }
          const ctx = { prev: wi ? chars[wi - 1][0] : null, next: wi + 1 < chars.length ? chars[wi + 1][0] : null, index: wi, wordStart: wi === 0, wordEnd: wi === chars.length - 1 };
          const inst = { seed: 'live:' + ci + ':' + ch, amount: 1, slant, scale, care };
          if (squeeze) inst.squeeze = squeeze;
          if (bars[wi]) inst.bar = bars[wi];
          const g = makeGlyph(p, ch, inst, ctx);
          let gap = 0;
          if (!connected && wi + 1 < chars.length) {
            const z = clamp(rng('sp:' + p.seed + ':' + ci).gauss(), -2.5, 2.5);
            gap = 2 * p.sidebearing * scale * (squeeze || 1) * (Math.exp(sigL * z - sigL * sigL / 2) - 1 + 0.1 * tire * prog);
          }
          glyphs.push({ g, ch, dx: wx, charIndex: ci });
          wx += g.advance + gap;
        });
        return { glyphs, wx };
      };
      let { glyphs, wx } = build(0);
      // ----- word gap: lognormal, wider after punctuation and when tired -----
      const sigW = clamp(0.2 * spread, 0.08, 0.32);
      const zg = clamp(wr.gauss(), -2.5, 2.5);
      const punct = /[.!?]["'’”)]*$/.test(prevEnd) ? H.stop : /[,;:]["'’”)]*$/.test(prevEnd) ? H.pause : 1;
      let gap = pendingSpaces * spaceAdv * (line.count ? Math.max(0.7, Math.exp(sigW * zg - sigW * sigW / 2)) * punct * (1 + 0.08 * tire * prog) : 1);
      pendingSpaces = 0; // leading spaces at a paragraph start become its indent
      // ----- line end (rules 11, 12): break early, overpack, or squeeze the last word in -----
      if (line.count) {
        const end = x + gap + wx;
        if (end > line.edge) {
          if (end <= maxU && wr() < H.overpack) line.packed = true;
          else {
            const room = maxU - x - gap * 0.85;
            if (end > maxU && room / wx >= 0.86 && wr() < H.squeeze) {
              ({ glyphs, wx } = build(Math.max(0.86, room / wx * 0.995)));
              gap *= 0.85;
              line.packed = true;
            } else {
              newLine(++lp, care);
              x = line.x0;
              gap = 0;
            }
          }
        }
      }
      x += gap;
      // ----- place the word along its line -----
      const wx0 = x;
      // on ruled paper the whole word floats a little above the rule, or dips just below it
      if (ruled) tilt = clamp(tilt, -1, 1) * Math.min(1, Math.atan(0.05 * xh / Math.max(1, wx)) / Math.max(1e-6, Math.abs(tilt)));
      if (ruled) lift = clamp(baseAt(line, x + wx / 2) + lift, line.rule - 0.08 * xh, line.rule + 0.03 * xh) - baseAt(line, x + wx / 2);
      const inkIndex = chars.length ? chars[chars.length - 1][1] + 1 : tokStart;
      for (const it of glyphs) {
        const gx = x + it.dx;
        const bob = connected || it.miss ? 0 : clamp(rng('bob:' + p.seed + ':' + it.charIndex).gauss(), -2.5, 2.5) * xh * 0.015 * spread;
        let gy = baseAt(line, gx) + lift + bob - (gx - wx0) * Math.tan(tilt);
        if (ruled && !connected) gy = clamp(gy, line.rule - 0.11 * xh, line.rule + 0.05 * xh);
        const a = angleAt(line, gx) + tilt;
        if (gy > maxY) maxY = gy;
        if (it.miss) {
          items.push({ kind: 'miss', ch: it.miss, x: gx, y: gy, charIndex: it.charIndex, line: lineNo, para: pi, word: w });
          continue;
        }
        // inkIndex: ink density is sampled per word position (see pen.strokeOpacity)
        items.push({ kind: 'glyph', ch: it.ch, g: rotateGlyph(it.g, a), x: gx, y: gy, rot: a, charIndex: it.charIndex, inkIndex, line: lineNo, para: pi, word: w, tempo });
      }
      x += wx;
      line.count++;
      prevEnd = tok;
    }
    wordsBefore += wp;
    offset += para.length + 1;
  });
  const lastY = ruled ? Math.max(maxY, rules[rules.length - 1]) : maxY;
  return {
    items, height: lastY + 0.45 * UPM, lines: lineNo + 1, misses, lineHeight: lineH, width: maxU,
    rules, lineInfo, words: wordNo, seed: p.seed, xh, connected,
  };
}
