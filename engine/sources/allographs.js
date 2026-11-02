// sources/allographs.js — alternative letter constructions (allographs) for the two Hershey styles, and the
// schooling bundles that decide which ones a writer uses.
//
// Why: one skeleton per letter made every hand a near-twin of every other (tools/qa/REPORT.md #4). Real
// writers differ most in *construction*: single- or double-storey a and g, crossed 7 and flagged 1, looped
// or plain k, a Greek ε... (docs/research/hand-traditions.md §4). These skeletons are drawn by hand to the
// Hershey styles' metrics, after the traditions named in each credit, and tagged with their §4 allograph.
// Traced copybook styles (other sources/*.js) plug into the same system through their tags.
//
// Coordinates: Hershey source units, y down. Print: baseline 9, x-height -5, cap -12, descender 16.
// Script: baseline 9, x-height 0, cap -12, descender 21; drawn upright here and sheared to Hershey's italic.
// Joined (script) lowercase start at their left edge near the join line (y ≈ 4) and end at their right edge
// rising through it, so joins still meet.
// Import after sources/hershey.js and sources/extras.js.

import { defineStyle, register, amend, variants, getStyle, allographOf, allographChar, defineSchooling, defineAllographAliases, defineContinuum, addAffinity, addContextHabit, addDeriver } from '../glyphs.js';

const credit = (after) => ({ name: 'Seedhand allograph', credit: `Seedhand, after ${after}` });
const SRC = {
  school: credit('20th-century school print hands (hand-traditions.md §4)'),
  adult: credit('present-day adult hands (Copiste d’un jour, CREMMA; hand-traditions.md §4)'),
  continental: credit('continental European school hands (DE, AT, CH, FR, IT, ES)'),
  american: credit('the Palmer Method (1915) and Zaner-Bloser (c.1923) business hands'),
  french: credit('French school hands (Testaments de Poilus; DGESCO 2013 rules)'),
  italic: credit('Italian chancery italic (Arrighi, La Operina, 1522)'),
  polish: credit('Polish school cursive (Prószyński 1906, Szretter 1888)'),
  hershey: { name: 'Derived from Hershey glyphs', credit: 'Seedhand, after Dr. A. V. Hershey (NBS, 1967)' },
};

// ---------- small geometry kit (source units, y down) ----------
const map = (s, f) => s.map((st) => st.map(f));
// y-down arc: angle 0 = right, 90 = down, -90 = up. Decreasing angles run counterclockwise on screen.
const arc = (cx, cy, rx, ry, a0, a1, n = Math.max(4, Math.round(Math.abs(a1 - a0) / 22))) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
};
const join = (...parts) => { const out = []; for (const p of parts) for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.05) out.push(q); } return out; };
const round = (s) => map(s, ([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
const SHEAR = 0.28; // Hershey Simplex Script leans about 15.6°
const shear = (s) => map(s, ([x, y]) => [x + (9 - y) * SHEAR, y]);
const bounds = (s) => { let a = Infinity, b = -Infinity; for (const st of s) for (const [x] of st) { if (x < a) a = x; if (x > b) b = x; } return [a, b]; };
// print glyph: bearings from the ink, with Hershey's typical 3-unit margin
const pg = (s, extra = {}) => { const [a, b] = bounds(s); return { l: Math.floor(a - 3), r: Math.ceil(b + 3), s: round(s), ...extra }; };
// script glyph, drawn upright: sheared, then l = left edge of the ink in the join zone (where the previous letter's
// exit lands), r = the exit tip (the rightmost stroke end rising through the join line), else the zone's right edge + 1
const sg = (s, extra = {}) => {
  const t = shear(s);
  const zone = t.flat().filter(([, y]) => y >= -1 && y <= 9.5);
  const xs = (zone.length ? zone : t.flat()).map(([x]) => x);
  const a = Math.min(...xs), b = Math.max(...xs);
  const ends = t.map((st) => st[st.length - 1]).filter(([, y]) => y > 2 && y < 6);
  const end = ends.sort((p, q) => q[0] - p[0])[0];
  const exits = !extra.noExit && end && end[0] >= b - 0.5;
  return { l: Math.round(a), r: exits ? Math.round(end[0]) : Math.ceil(b + 1), s: round(t), ...extra };
};

// Hershey Simplex Script's skeletons are narrow for their cap height: hands use the joined-hand proportion ranges
// for it. Every other style (Hershey print, traced copybooks) is drawn against the print ranges.
defineStyle('script', { proportions: 'script' });

// ---------------------------------------------------------------------------------------------------------
// PRINT (Hershey Simplex Roman metrics)
// ---------------------------------------------------------------------------------------------------------
const PRINT = {
  a: {
    'a.double-storey': [SRC.school, pg([
      [[-4.4, -2.4], [-3.4, -4.3], [-1, -5.2], [2, -5.1], [4.4, -4], [5.5, -2], [5.6, 1], [5.6, 6.8], [6.3, 8.5], [7.4, 9]],
      join([[5.6, 0.6], [2, 0.6], [-1.6, 1.2], [-4.3, 2.9], [-5.3, 5.4], [-4.5, 7.8], [-2.2, 9.1], [0.9, 9], [3.6, 7.8], [5.6, 5.6]]),
    ])],
  },
  g: {
    'g.double-storey': [SRC.school, pg([
      arc(0, -1, 4.2, 4, -40, -400),
      join([[-1.6, 2.9], [-3.6, 4.4], [-3.7, 6], [-2.1, 7], [1.1, 7.2], [4.6, 7.6], [6.8, 9.4], [7, 12.2], [5.4, 14.9], [1.5, 16.1], [-3, 15.9], [-6, 14.3], [-6.2, 11.7], [-4, 9.8], [-1.2, 8.6]]),
      [[3.3, -3.7], [4.9, -5.1], [7, -5.3]],
    ])],
    'g.looped': [SRC.american, pg([
      [[6, -5], [6, 11], [5.4, 14], [3.6, 15.8], [1, 16.2], [-1.2, 15.2], [-1.6, 13.4], [0.3, 11.4], [3.6, 9.8], [7.6, 8.6]],
      [[6, -2], [4, -4], [2, -5], [-1, -5], [-3, -4], [-5, -2], [-6, 1], [-6, 3], [-5, 6], [-3, 8], [-1, 9], [2, 9], [4, 8], [6, 6]],
    ])],
  },
  e: {
    'e.epsilon': [SRC.adult, pg([
      join([[4.7, -3.2], [2.8, -4.8], [-0.4, -5.2], [-3.3, -4], [-4.2, -1.8], [-2.8, 0.4], [0.6, 1.3]], [[-2.6, 2.1], [-4.8, 4.2], [-4.9, 7], [-2.8, 8.8], [0.6, 9.2], [3.6, 8.2], [5.6, 6.3]]),
    ])],
    'e.looped': [SRC.american, pg([
      [[-5.6, 2.6], [-1, 1.2], [3.2, -0.6], [4.8, -2.6], [3.6, -4.6], [0.8, -5.2], [-2.4, -4.2], [-4.8, -1.4], [-5.5, 2.4], [-4.8, 6], [-2.6, 8.4], [0.6, 9.2], [3.6, 8.4], [5.7, 6.3]],
    ])],
  },
  r: {
    'r.hooked-arm': [SRC.school, pg([
      [[-3, -5], [-3, 9]],
      [[-3, 0.2], [-1.6, -3.2], [0.8, -4.9], [3.4, -5], [5.2, -3.6], [5.8, -1.8]],
    ])],
    'r.flick': [SRC.adult, pg([
      [[-2.8, -5.6], [-2.6, 9]],
      [[-2.7, -2.6], [0.6, -4.6], [5, -6.4]],
    ], { tags: { speed: 'fast' } })],
  },
  s: {
    // word-final s shrinks to a quick, small form (human-feel.md §5)
    's.final': [SRC.adult, pg([
      [[4.6, -0.6], [3.6, -2.2], [1.4, -2.8], [-1.2, -2.6], [-3.4, -1.4], [-3.6, 0.6], [-1.6, 2], [2.4, 3.4], [4.4, 5], [4.6, 7], [3, 8.8], [0, 9.4], [-2.8, 9], [-4.6, 7.6]],
    ], { tags: { position: 'final', speed: 'fast' } })],
  },
  t: {
    't.cross': [SRC.continental, pg([
      [[0, -11], [0, 9]],
      [[-4.2, -4.6], [4.4, -5.2]],
    ])],
    't.right-bar': [SRC.school, pg([
      [[0, -11.5], [0, 5], [1, 8], [3, 9], [5, 9]],
      [[0, -5], [5.6, -5.6]],
    ], { tags: { speed: 'fast' } })],
    't.high-bar': [SRC.adult, pg([
      [[0, -11], [0, 5], [1, 8], [3, 9], [5, 9]],
      [[-3.4, -7.6], [5, -9.4]],
    ])],
  },
  f: {
    'f.italic': [SRC.italic, pg([
      [[5.4, -10.6], [3.6, -12], [1.4, -11.6], [0.4, -9.4], [0, -5], [-0.4, 9], [-0.9, 13], [-2.4, 15.4], [-4.6, 16]],
      [[-3.6, -5], [4.2, -5]],
    ])],
    'f.looped': [SRC.american, pg([
      [[-4, 2.2], [0.8, -4.2], [3.4, -8.6], [4, -11.2], [2.8, -12.6], [0.6, -12.2], [-0.6, -10], [-0.8, -6], [-0.8, 9], [-1.4, 13.2], [-0.6, 15.8], [2, 16.2], [3.6, 14.4], [2.8, 11.6], [0.2, 9.4], [3, 8.4], [5.4, 6.6]],
    ])],
  },
  k: {
    'k.kick': [SRC.school, pg([
      [[-5, -12], [-5, 9]],
      [[5, -5], [-4.4, 2.2], [6, 9]],
    ])],
    'k.looped': [SRC.american, pg([
      [[-8.4, 1.6], [-3.8, -5.4], [-1.8, -9.4], [-2.2, -12], [-4.4, -12.6], [-5.8, -10.8], [-5.8, -4], [-5.8, 9]],
      [[-5.8, 3.6], [-2.4, -2.4], [1.6, -5.2], [4.8, -5], [5.4, -2.6], [3.2, -0.2], [-1.6, 1.4], [1.6, 2.6], [3.6, 5.6], [5, 8.4], [7, 9]],
    ])],
  },
  y: {
    'y.looped': [SRC.american, pg([
      [[-5.5, -5], [-5.5, 2.4], [-4.6, 6.6], [-2.2, 8.7], [0.8, 8.6], [3.6, 6.8], [5.5, 3.2]],
      [[5.5, -5], [5.5, 11.6], [4.6, 14.6], [2.4, 16], [-0.6, 15.8], [-1.8, 14], [-0.4, 11.6], [3, 9.8], [7.2, 8.6]],
    ])],
    'y.hooked': [SRC.school, pg([
      [[-5.5, -5], [-5.5, 2.4], [-4.6, 6.6], [-2.2, 8.7], [0.8, 8.6], [3.6, 6.8], [5.5, 3.2]],
      [[5.5, -5], [5.5, 12], [4.6, 14.8], [2.2, 16.1], [-0.8, 15.8], [-2.8, 14.6]],
    ])],
    'y.stick': [SRC.continental, pg([
      [[-6, -5], [0, 8.6]],
      [[6, -5], [-2.2, 16]],
    ])],
  },
  z: {
    'z.crossed': [SRC.continental, pg([
      [[6, -5], [-5, 9]],
      [[-5, -5], [6, -5]],
      [[-5, 9], [6, 9]],
      [[-3, 2.2], [4, 1.8]],
    ])],
    'z.tailed': [SRC.american, pg([
      [[-5.4, -5], [5.4, -5], [-1.4, 2.8], [1.8, 2.6], [4.8, 4.2], [6, 7.6], [5, 11.6], [1.8, 14.8], [-2.4, 15.8], [-5.2, 14.4]],
    ])],
  },
  l: {
    'l.tailed': [SRC.italic, pg([[[0, -12], [0, 5.6], [0.8, 8.2], [2.6, 9.2], [4.6, 8.4]]])],
    'l.looped': [SRC.american, pg([[[-3.4, 2.4], [1, -5], [2.8, -9.2], [2.2, -12], [-0.4, -12.2], [-1.4, -9.6], [-1.2, 5.6], [-0.4, 8.4], [1.6, 9.2], [3.8, 8.4]]])],
  },
  b: {
    'b.looped': [SRC.american, pg([[[-8.4, 1.6], [-3.8, -5.4], [-2.6, -9.6], [-3.4, -12.2], [-5.4, -12.4], [-6.4, -10.2], [-6.2, -4], [-6, 9]], [[-6, -2], [-4, -4], [-2, -5], [1, -5], [3, -4], [5, -2], [6, 1], [6, 3], [5, 6], [3, 8], [1, 9], [-2, 9], [-4, 8], [-6, 6]]])],
  },
  d: {
    'd.looped': [SRC.american, pg([[[6, -2], [4, -4], [2, -5], [-1, -5], [-3, -4], [-5, -2], [-6, 1], [-6, 3], [-5, 6], [-3, 8], [-1, 9], [2, 9], [4, 8], [6, 6]], [[6.2, -3], [8.6, -8.6], [8.2, -11.8], [6.4, -12.6], [4.8, -11], [5.2, -6], [6, 1], [6.2, 6.6], [7, 8.6], [8.6, 9.2]]])],
  },
  h: {
    'h.looped': [SRC.american, pg([[[-8.4, 1.6], [-3.8, -5.4], [-2.6, -9.6], [-3.4, -12.2], [-5.4, -12.4], [-6.4, -10.2], [-6.2, -4], [-6, 9]], [[-6, -1], [-3, -4], [-1, -5], [2, -5], [4, -4], [5, -1], [5, 9]]])],
  },
  p: {
    'p.tall': [SRC.french, pg([[[-6, -6.8], [-6, 16]], [[-6, -2], [-4, -4], [-2, -5], [1, -5], [3, -4], [5, -2], [6, 1], [6, 3], [5, 6], [3, 8], [1, 9], [-2, 9], [-4, 8], [-6, 6]]])],
  },
  q: {
    'q.tailed': [SRC.polish, pg([[[6, -5], [6, 12.6], [6.6, 15.2], [8.4, 16.2], [10.2, 15.6]], [[6, -2], [4, -4], [2, -5], [-1, -5], [-3, -4], [-5, -2], [-6, 1], [-6, 3], [-5, 6], [-3, 8], [-1, 9], [2, 9], [4, 8], [6, 6]]])],
    'q.crossed': [SRC.continental, pg([[[6, -5], [6, 16]], [[6, -2], [4, -4], [2, -5], [-1, -5], [-3, -4], [-5, -2], [-6, 1], [-6, 3], [-5, 6], [-3, 8], [-1, 9], [2, 9], [4, 8], [6, 6]], [[3.4, 12.2], [8.8, 11.8]]])],
  },
  u: {
    'u.cup': [SRC.italic, pg([[[-5.5, -5], [-5.5, 3], [-4.6, 7], [-2.2, 8.9], [0.8, 8.8], [3.6, 7], [5.5, 3], [5.6, -5]]])],
  },
  w: {
    'w.rounded': [SRC.italic, pg([[[-8, -5], [-7.8, 3], [-6.8, 7.4], [-4.6, 9], [-2.2, 8], [-0.4, 4], [0, -1.2], [0.4, 4], [2.2, 8], [4.6, 9], [6.8, 7.4], [7.8, 3], [8, -5]]])],
  },
  x: {
    'x.arcs': [SRC.adult, pg([
      [[-5.6, -4.4], [-2.6, -4.8], [-0.6, -1.8], [-0.2, 2], [-0.6, 5.8], [-2.6, 8.8], [-5.8, 8.8]],
      [[5.8, -4.6], [2.8, -4.8], [0.8, -1.8], [0.4, 2], [0.8, 5.8], [2.8, 8.8], [6, 8.6]],
    ])],
  },
  2: {
    'two.curly': [SRC.american, pg([[[-6, -7], [-6, -8], [-5, -10], [-4, -11], [-2, -12], [2, -12], [4, -11], [5, -10], [6, -8], [6, -6], [5, -4], [3, -1], [-4.6, 6], [-6.4, 8.2], [-5.4, 9.6], [-3, 8.8], [0, 8.4], [3.4, 9.2], [7, 8.8]]])],
  },
  3: {
    'three.round': [SRC.school, pg([[[-5.6, -9], [-3.6, -11.6], [0, -12.4], [3.6, -11.4], [5, -8.6], [4, -5.6], [0.8, -3.6], [4.6, -2.2], [6.6, 1], [6.4, 5], [4, 8.2], [0.2, 9.3], [-3.6, 8.6], [-6, 6.2]]])],
  },
  8: {
    'eight.stacked': [SRC.adult, pg([arc(0, -7.2, 4.4, 4.6, -90, 270), arc(0, 3.6, 5.8, 5.4, -90, 270)])],
  },
  I: {
    'I.serif': [SRC.continental, pg([[[0, -12], [0, 9]], [[-3.6, -12], [3.6, -12]], [[-3.6, 9], [3.6, 9]]])],
  },
  J: {
    'J.long-top': [SRC.continental, pg([[[-3.6, -12], [7.4, -12]], [[4, -12], [4, 4], [3, 7], [2, 8], [0, 9], [-2, 9], [-4, 8], [-5, 7], [-6, 4], [-6, 2]]])],
  },
  K: {
    'K.kick': [SRC.adult, pg([[[-7, -12], [-7, 9]], [[7, -12], [-6.4, 1.6], [7.6, 9]]])],
  },
  U: {
    'U.stem': [SRC.adult, pg([[[-7, -12], [-7, 3], [-6, 6], [-4, 8], [-1, 9], [1, 9], [4, 8], [6, 6], [7, 3]], [[7, -12], [7, 9]]])],
  },
  W: {
    'W.rounded': [SRC.adult, pg([[[-10, -12], [-9.6, 1], [-8.2, 7.4], [-5.4, 9.2], [-2.6, 7.8], [-0.6, 2], [0, -6], [0.6, 2], [2.6, 7.8], [5.4, 9.2], [8.2, 7.4], [9.6, 1], [10, -12]]])],
  },
  Y: {
    'Y.cup': [SRC.adult, pg([[[-7, -12], [-6.6, -6.4], [-4.4, -2.6], [0, -1.2], [4.4, -2.6], [6.6, -6.4], [7, -12]], [[0, -1.2], [0, 9]]])],
  },
  Z: {
    'Z.crossed': [SRC.continental, pg([[[-7, -12], [7, -12], [-7, 9], [7, 9]], [[-3.6, -1.4], [3.6, -1.4]]])],
  },
  1: {
    'one.plain': [SRC.american, pg([[[0.6, -12], [0.4, 9]]])],
    'one.flag-base': [SRC.school, pg([[[-3.6, -8.4], [-1.4, -9.6], [1, -12], [1, 9]], [[-3.4, 9], [5.4, 9]]])],
    'one.long-flag': [SRC.continental, pg([[[-4.8, -3.8], [-1.6, -7.6], [2, -12.2], [1.8, 9]]])],
  },
  7: {
    'seven.crossed': [SRC.continental, pg([[[-7, -12], [7, -12], [-3, 9]], [[-1.8, -1.4], [5.6, -1.6]]])],
    'seven.serif': [SRC.school, pg([[[-7, -9.2], [-7, -12], [7, -12], [-3, 9]]])],
  },
  4: {
    'four.open': [SRC.school, pg([[[-4.6, -12], [-6.8, 1.6], [8, 1.6]], [[4, -7.6], [4, 9]]])],
  },
  9: {
    'nine.straight': [SRC.continental, pg([join(arc(0, -6, 6.2, 6, -10, -370), [[6, -4.6], [5.8, 2], [5.6, 9]])])],
    'nine.hooked': [SRC.continental, pg([join(arc(0, -6, 6.2, 6, -10, -370), [[6, -4.6], [5.8, 4], [5, 7.6], [2.6, 9.2], [0, 9]])])],
  },
  A: {
    'A.round-top': [SRC.adult, pg([
      [[-7.4, 9], [-7.4, -3], [-6, -8.8], [-3, -11.8], [0.6, -12], [4, -10.4], [6.4, -6], [7.2, 0], [7.2, 9]],
      [[-7.2, 1.6], [7.2, 1.4]],
    ])],
    'A.cursive': [SRC.american, pg([
      join(arc(-0.4, -0.8, 6.6, 9.8, -20, -350), [[6.2, -12.4], [6.2, 5], [6.6, 8], [8, 9.2]]),
    ])],
  },
  E: {
    'E.reversed': [SRC.adult, pg([
      join([[6.4, -9.2], [4.6, -11.6], [0.6, -12.4], [-3.8, -11], [-5.6, -7.6], [-4.2, -4], [-0.2, -2.2], [1.4, -2]], [[-3, -1.4], [-6.2, 1.4], [-6.8, 5.2], [-4.6, 8.4], [-0.6, 9.4], [3.6, 8.8], [6.8, 6.4]]),
    ])],
  },
  G: {
    'G.spur': [SRC.school, pg([
      [[7.4, -8], [5.4, -11.2], [1.6, -12.4], [-2.6, -11.6], [-5.8, -8.6], [-7.2, -3.4], [-6.8, 2.4], [-4.6, 6.8], [-1, 9.2], [3, 9.1], [6, 7.4], [7.6, 4.2]],
      [[1.6, 0.4], [7.6, 0.2], [7.6, 9.6]],
    ])],
    'G.cursive': [SRC.american, pg([
      [[6.2, -8.6], [4.8, -11.6], [1.4, -12.4], [-2.6, -11], [-5.8, -7], [-7, -1.4], [-6, 4.4], [-3.4, 8.2], [0.4, 9.4], [3.6, 8.4], [5.8, 5.2], [6.4, 0.6], [6.2, -2.6], [3.6, -1.2], [1.2, -0.8], [3.4, 0.8], [6.4, 0.6]],
    ])],
  },
  M: {
    'M.splayed': [SRC.adult, pg([[[-9, 9], [-6.2, -12], [0, 4], [6.2, -12], [9, 9]]])],
    'M.rounded': [SRC.adult, pg([
      [[-7.6, -9.6], [-7.6, 9]],
      [[-7.6, -6.6], [-5.6, -11.2], [-2.6, -12.2], [-0.4, -10], [0, -6], [0, 9]],
      [[0, -6.6], [2.2, -11.2], [5.2, -12.2], [7.4, -10], [7.8, -6], [7.8, 9]],
    ])],
    'M.short-middle': [SRC.school, pg([[[-8, 9], [-8, -12], [0, 1.6], [8, -12], [8, 9]]])],
  },
  Q: {
    'Q.tail': [SRC.school, pg([
      [[-2, -12], [-4, -11], [-6, -9], [-7, -7], [-8, -4], [-8, 1], [-7, 4], [-6, 6], [-4, 8], [-2, 9], [2, 9], [4, 8], [6, 6], [7, 4], [8, 1], [8, -4], [7, -7], [6, -9], [4, -11], [2, -12], [-2, -12]],
      [[-1.4, 7.6], [1.6, 10.4], [5.2, 11.4], [9.4, 10.6]],
    ])],
  },
  R: {
    'R.one-stroke': [SRC.school, pg([[[-7, 9], [-7, -12], [2, -12], [5.4, -11], [7, -8.4], [6.6, -5], [4, -2.8], [-6.6, -2], [7.4, 9]]])],
    'R.kicked': [SRC.adult, pg([
      [[-7, -12], [-7, 9]],
      [[-7, -12], [2, -12], [5, -11], [6, -10], [7, -8], [7, -6], [6, -4], [5, -3], [2, -2], [-7, -2]],
      [[0, -2], [3, 0.4], [5, 4.4], [6.6, 8], [9, 9.2]],
    ])],
  },
};

// the Hershey print forms, named
const PRINT_HERSHEY = {
  a: 'a.single-storey', g: 'g.hooked', e: 'e.print', r: 'r.arm', s: 's.print', t: 't.hooked', f: 'f.print', k: 'k.plain',
  y: 'y.straight', z: 'z.plain', 1: 'one.flag', 7: 'seven.plain', 4: 'four.closed', 9: 'nine.curved',
  A: 'A.pointed', E: 'E.print', G: 'G.bar', M: 'M.vertical', Q: 'Q.slash', R: 'R.leg',
  l: 'l.plain', b: 'b.plain', d: 'd.plain', h: 'h.plain', p: 'p.plain', q: 'q.plain', u: 'u.plain', v: 'v.pointed', w: 'w.pointed',
  x: 'x.crossed', 2: 'two.plain', 3: 'three.flat', 8: 'eight.plain', I: 'I.plain', J: 'J.plain', K: 'K.plain', U: 'U.plain',
  W: 'W.pointed', Y: 'Y.plain', Z: 'Z.plain',
};

for (const [ch, forms] of Object.entries(PRINT)) {
  for (const [allograph, [source, g]] of Object.entries(forms)) {
    const { tags, weight, ...sk } = g;
    register('print', ch, { id: allograph, source, ...sk, ...(weight != null ? { weight } : {}), tags: { allograph, ...(tags || {}) } });
  }
}
for (const [ch, allograph] of Object.entries(PRINT_HERSHEY)) amend('print', ch, 'hershey', { tags: { allograph } });

// ---------------------------------------------------------------------------------------------------------
// SCRIPT (Hershey Simplex Script metrics). Drawn upright and sheared by sg(); `it` marks shapes written
// straight in Hershey's italic coordinates (edits of a Hershey script letter).
// ---------------------------------------------------------------------------------------------------------
const it = (s, l, r, extra = {}) => ({ l, r, s: round(s), ...extra });
const SCRIPT = {
  a: {
    'a.double-storey': [SRC.adult, sg([
      [[-2.8, 1.6], [-1.6, 0.2], [0.6, -0.2], [2.6, 0.6], [3.4, 2.4], [3.4, 6.4], [3.8, 8.4], [5.2, 9], [7.2, 8], [8.6, 6], [9.4, 4]],
      [[3.4, 3.8], [0.4, 3.8], [-2.4, 4.6], [-3.8, 6.4], [-3.2, 8.4], [-1, 9.1], [1.6, 8.5], [3.4, 6.8]],
    ], { weight: 0.5 })],
    'a.open': [SRC.adult, sg([
      [[0.6, 0.4], [-1.8, 0.8], [-3.6, 2.6], [-4.2, 5.4], [-3.2, 8.2], [-1, 9.1], [1.2, 8], [2.6, 5], [3.4, 1.8], [3.8, 0], [3.3, 5], [3.4, 7.6], [4.4, 9], [6.2, 8.8], [8, 7], [9.2, 4.2]],
    ], { weight: 0.4, tags: { speed: 'fast' } })],
  },
  g: {
    'g.hooked': [SRC.italic, it([
      [[3, 3], [2, 1], [0, 0], [-2, 0], [-4, 1], [-5, 2], [-6, 4], [-6, 6], [-5, 8], [-3, 9], [-1, 9], [1, 8], [2, 7]],
      [[4, 0], [2, 7], [0, 14], [-1.2, 18], [-2.8, 20.4], [-5, 21], [-6.8, 20]],
    ], -6, 4)],
    'g.double-storey': [SRC.adult, sg([
      arc(0, 3.2, 3.6, 3.2, -40, -400),
      [[-1.4, 6.2], [-3, 7.4], [-2.6, 8.8], [0.4, 9.4], [3.6, 10.2], [5, 12.8], [4, 16.2], [0.4, 18.2], [-3.6, 17.6], [-5.2, 15.2], [-4, 12.2], [-1, 10.4]],
      [[2.8, 0.6], [4.6, -0.6], [6.2, -0.4]],
    ], { weight: 0.25, noExit: true })],
  },
  e: {
    // in a joined hand ε is a word-initial habit: a join into its pinched waist doesn't meet
    'e.epsilon': [SRC.adult, sg([
      [[2.4, 1.8], [1, 0.2], [-1.2, 0.3], [-2.6, 1.9], [-2.4, 3.6], [-0.6, 4.6], [0.6, 4.8], [-1.8, 5.2], [-3.4, 6.6], [-2.8, 8.6], [-0.4, 9.2], [2.2, 8.7], [4.2, 7.2], [6, 4.4]],
    ], { tags: { position: 'initial' } })],
    'e.print': [SRC.school, sg([
      [[-3.2, 4.6], [2.6, 4.6], [2.8, 2.8], [1.6, 0.6], [-0.6, 0], [-2.6, 1.2], [-3.6, 4], [-3.2, 7.2], [-1.4, 8.9], [1.2, 9.1], [3.6, 7.8], [5.8, 4.6]],
    ], { weight: 0.6 })],
  },
  r: {
    'r.knotted': [SRC.french, sg([
      [[-5, 4.4], [-3.4, 2.2], [-1.6, 0], [-0.6, -1], [-1.8, -1.6], [-2.8, -0.6], [-2.2, 0.8], [-0.4, 0.6], [1.6, 0], [2.8, 0.8], [2.8, 3], [2.4, 6.2], [2.6, 8.4], [3.8, 9.1], [5.8, 8.2], [7.4, 4.6]],
    ])],
    'r.arm': [SRC.italic, sg([
      [[-4.8, 4.4], [-3.2, 2], [-1.6, 0], [-1.6, 9], [-1.4, 6], [-0.4, 2.6], [1.4, 0.4], [3.6, -0.2], [5.2, 0.6], [6.4, 2.4], [7, 4]],
    ])],
  },
  s: {
    's.looped': [SRC.french, it([
      [[-4, 4], [-2, 1], [-1, -1], [-1, 1], [1, 4], [2, 6], [2, 8], [0, 9], [-2, 9], [-3.6, 8.2], [-3.2, 7.2], [-1.6, 7.6], [0.6, 8.8], [2.6, 9], [4.4, 8], [5.6, 6.6], [7, 4]],
    ], -4, 7)],
    's.final': [SRC.adult, it([
      [[-4, 4], [-2, 1], [-1, -1], [-1, 1], [1, 4], [2, 6], [2, 8], [0, 9], [-2, 9], [-3.8, 8], [-4.2, 6.6]],
    ], -4, 4, { tags: { position: 'final' } })],
  },
  t: {
    't.short': [SRC.american, sg([
      [[-5, 4.4], [-3, 1.4], [-1, -2.6], [0.2, -6], [-0.2, 0], [-0.4, 6.4], [0.2, 8.6], [1.8, 9.2], [4, 8.2], [6, 4.6]],
      [[-2.8, -3], [2.8, -3]],
    ])],
    't.right-bar': [SRC.school, sg([
      [[-5, 4.4], [-3, 1.4], [-1, -2.6], [0.2, -6], [-0.2, 0], [-0.4, 6.4], [0.2, 8.6], [1.8, 9.2], [4, 8.2], [6, 4.6]],
      [[-0.2, -3], [4.6, -3.6]],
    ], { tags: { speed: 'fast' } })],
    't.looped': [SRC.american, sg([
      [[-5, 4.4], [-2.4, 1], [0.6, -3.4], [2, -6.4], [1.2, -8.2], [-0.8, -8.2], [-2, -6], [-2, 0], [-1.6, 6.4], [-0.8, 8.6], [1.2, 9.2], [3.6, 8.2], [5.8, 4.6]],
      [[-3.6, -3], [2.6, -3]],
    ])],
  },
  f: {
    'f.italic': [SRC.italic, sg([
      [[3.2, -9.2], [2.4, -11.4], [0.8, -12], [-0.4, -10.6], [-0.6, -6], [-0.8, 9], [-1.2, 14], [-2.2, 17.4], [-4, 18.6]],
      [[-4.6, 3.6], [-2.4, 1], [0, 0], [2.6, 0], [4.6, 1], [5.8, 2.8], [6.4, 4.2]],
    ])],
    'f.print': [SRC.school, sg([
      [[3.2, -9.2], [2.4, -11.4], [0.8, -12], [-0.4, -10.6], [-0.6, -6], [-0.6, 9]],
      [[-4.6, 3.6], [-2.4, 1], [0, 0], [2.6, 0], [4.6, 1], [5.8, 2.8], [6.4, 4.2]],
    ], { weight: 0.7 })],
  },
  k: {
    'k.kick': [SRC.american, it([
      [[-5, 4], [-3, 1], [0, -4], [1, -6], [2, -9], [2, -11], [1, -12], [-1, -11], [-2, -9], [-3, -5], [-4, 1], [-5, 9]],
      [[-4.6, 7.2], [-2, 3.2], [1, 0.4], [3, -0.6], [-1.6, 4.2], [0.6, 5.4], [1.8, 8], [3, 9], [4.6, 9], [6.6, 8], [9, 4]],
    ], -5, 9)],
    'k.plain': [SRC.italic, sg([
      [[-5, 4.4], [-3.6, 1.4], [-3, -4], [-3, -12], [-3, 9]],
      [[2.6, 0], [-2.8, 5], [0, 6.2], [1.6, 8.6], [3.2, 9.1], [5.2, 8.2], [7, 4.6]],
    ])],
  },
  y: {
    'y.straight': [SRC.italic, sg([
      [[-5.6, 4.4], [-4.2, 1.4], [-3.4, 0], [-0.4, 9]],
      [[3.4, 0], [-0.4, 9], [-2.2, 15], [-2.8, 19.6]],
    ], { noExit: true, r: 4 })],
    'y.hooked': [SRC.school, it([
      [[-6, 4], [-4, 0], [-6, 6], [-6, 8], [-5, 9], [-3, 9], [-1, 8], [1, 6], [3, 3]],
      [[4, 0], [1.6, 12], [0.4, 17], [-1.4, 20.2], [-3.8, 21], [-5.4, 20]],
    ], -6, 4)],
  },
  z: {
    'z.plain': [SRC.school, sg([
      [[-5.4, 4.4], [-4, 1.4], [-2.6, 0], [2.8, 0.2], [-3, 8.8], [-0.4, 8.2], [2.2, 9.1], [4.4, 8.6], [6.2, 6.2], [7, 4.4]],
    ])],
    'z.crossed': [SRC.continental, sg([
      [[-5.4, 4.4], [-4, 1.4], [-2.6, 0], [2.8, 0.2], [-3, 8.8], [-0.4, 8.2], [2.2, 9.1], [4.4, 8.6], [6.2, 6.2], [7, 4.4]],
      [[-2.2, 4.6], [2.6, 4.2]],
    ])],
  },
  l: {
    'l.plain': [SRC.italic, it([[[-3, 4], [-1.2, 0.8], [1, -5], [3.4, -12], [1.4, -4.6], [-0.8, 3.4], [-1.8, 8], [-1, 9], [0, 9], [2, 8], [3, 7], [5, 4]]], -3, 5)],
  },
  b: {
    'b.plain': [SRC.italic, it([[[-5, 4], [-3.2, 0.6], [-1, -5], [1.6, -12], [-0.2, -5], [-2.8, 3.4], [-3.8, 7.6], [-3, 9], [-2, 9], [0, 8], [2, 6], [3, 3], [3, 0], [4, 4], [5, 5], [7, 5], [9, 4]]], -5, 9)],
  },
  h: {
    'h.plain': [SRC.italic, it([
      [[-5, 4], [-3.2, 0.6], [-1, -5], [1.6, -12], [-0.4, -4.4], [-2.6, 2.6], [-4.4, 8.4], [-5, 9]],
      [[-5, 9], [-4, 6], [-3, 4], [-1, 1], [1, 0], [3, 0], [4, 1], [4, 3], [3, 6], [3, 8], [4, 9], [5, 9], [7, 8], [8, 7], [10, 4]],
    ], -5, 10)],
  },
  d: {
    'd.looped': [SRC.american, it([[[3, 3], [2, 1], [0, 0], [-2, 0], [-4, 1], [-5, 2], [-6, 4], [-6, 6], [-5, 8], [-3, 9], [-1, 9], [1, 8], [2, 6], [6.2, -4], [8.2, -9.4], [8, -12], [6.4, -12.6], [4.8, -11], [3.8, -6], [3.2, 1], [3, 5], [3, 8], [4, 9], [5, 9], [7, 8], [8, 7], [10, 4]]], -6, 10)],
  },
  A: {
    'A.cursive': [SRC.american, sg([
      [[4.2, -8.4], [1.6, -11.6], [-2, -11.4], [-5, -8], [-6.4, -2.4], [-5.8, 3.6], [-3.6, 8], [-0.6, 9.1], [2.2, 7.4], [4, 2.6]],
      [[4.6, -11.8], [4, -2], [4, 6], [4.6, 8.6], [6.2, 9.1], [8.2, 7.8], [9.6, 4.6]],
    ], { weight: 1.4 })],
  },
  M: {
    'M.arched': [SRC.adult, sg([
      [[-8, 9], [-7.4, 2], [-6.2, -6], [-4.6, -11], [-2.6, -12], [-1, -10.4], [-0.8, -6], [-1.2, 9], [-1, 2], [0.4, -8], [2.4, -11.8], [4.4, -12], [5.8, -10], [6, -5], [5.6, 6], [6.2, 8.6], [7.8, 9.1], [9.8, 7.8], [11.2, 4.6]],
    ])],
  },
};
const SCRIPT_HERSHEY = {
  a: 'a.single-storey', g: 'g.looped', e: 'e.looped', r: 'r.peaked', s: 's.pointed', t: 't.tall', f: 'f.looped', k: 'k.looped',
  y: 'y.looped', z: 'z.tailed', A: 'A.looped', E: 'E.reversed', F: 'F.wavy', G: 'G.looped', M: 'M.looped', Q: 'Q.two',
  R: 'R.looped', T: 'T.wavy', I: 'I.looped', l: 'l.looped', b: 'b.looped', h: 'h.looped', d: 'd.plain',
};
for (const [ch, forms] of Object.entries(SCRIPT)) {
  for (const [allograph, [source, g]] of Object.entries(forms)) {
    const { tags, weight, noExit, ...sk } = g;
    register('script', ch, { id: allograph, source, ...sk, ...(weight != null ? { weight } : {}), tags: { allograph, ...(tags || {}) } });
  }
}
for (const [ch, allograph] of Object.entries(SCRIPT_HERSHEY)) amend('script', ch, 'hershey', { tags: { allograph } });
// Simplex Script's looped A reads as S or L, and its Q as a 2 (QA report #7): kept, but rarely chosen
amend('script', 'A', 'hershey', { weight: 0.4 });
amend('script', 'Q', 'hershey', { weight: 0.35 });
amend('script', 'G', 'hershey', { weight: 0.7 });

// Printed capitals for the joined hand: some writers always print capitals, and everyone prints a row of
// them (joined capitals turn ALL CAPS into a scrawl: QA report #7). Sheared to the script's slant.
const shearedFromPrint = (ch) => {
  const v = variants('print', ch).find((x) => x.id === 'hershey') || variants('print', ch)[0];
  return { l: v.l + 1, r: v.r + 2, s: round(shear(v.s)) };
};
const SCRIPT_CAP_PRINT = 0.45;
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  register('script', ch, { id: ch + '.print', source: SRC.hershey, ...shearedFromPrint(ch), weight: SCRIPT_CAP_PRINT, tags: { allograph: ch + '.print', caps: true, lift: true } });
}

// Digits: Hershey's script digits are drawn as double outlines (two pen strokes per line), which a pen model
// turns into doubled lines. Writers' digits are print digits with their slant, so the joined hand uses the
// print digits (and their allographs), sheared. The old ones stay registered for provenance, never chosen.
for (const ch of '0123456789') {
  for (const v of variants('script', ch)) if (v.id === 'hershey') amend('script', ch, 'hershey', { weight: 0, tags: { allograph: 'retired' } });
  for (const v of variants('print', ch)) {
    register('script', ch, { ...v, id: v.id === 'hershey' ? 'print-slanted' : v.id, source: v.id === 'hershey' ? SRC.hershey : v.source, l: v.l + 1, r: v.r + 2, s: round(shear(v.s)) });
  }
}

// Script ^ was an up-arrow and ™ read "Jm" (built from the looped T and M): QA report #7.
amend('script', '^', 'hershey', { weight: 0, tags: { allograph: 'retired' } });
register('script', '^', { id: 'chevron', source: credit('the handwritten caret'), ...sg([[[-4.4, -4.4], [0, -11.6], [4.4, -4.4]]], { noExit: true }) });
{
  const tm = variants('print', '™')[0];
  amend('script', '™', 'hershey', { weight: 0, tags: { allograph: 'retired' } });
  register('script', '™', { id: 'print-slanted', source: SRC.hershey, l: tm.l + 1, r: tm.r + 2, s: round(shear(tm.s)) });
}
// Dashes: Hershey's hyphen is 18 units long, so the derived em dash ran to about 1.5 em in the joined hand.
// A handwritten dash is about the width of an m (em) or an n (en).
for (const style of ['print', 'script']) {
  const k = style === 'script' ? SHEAR : 0;
  const y = style === 'script' ? 2.6 : 0; // on the script's lower x-height, like its letters' joins
  const dash = (half) => ({ l: -half - 3, r: half + 3, s: [[[-half + (9 - y) * k, y], [half + (9 - y) * k, y - 0.3]]] });
  register(style, '—', { id: 'dash.em', source: credit('the handwritten em dash'), ...dash(10.5) });
  register(style, '–', { id: 'dash.en', source: credit('the handwritten en dash'), ...dash(6.5) });
  for (const ch of '—–') amend(style, ch, 'hershey', { weight: 0, tags: { allograph: 'retired' } });
}

// Tall punctuation: Hershey's brackets, bars, slash, # and $ run 1.5 cap heights (y -16..16). By hand they stay
// near the letters, from just over the capitals to just under the baseline, and no longer leave the page.
const SPAN = { '(': [-13.8, 12.4], ')': [-13.8, 12.4], '[': [-13.8, 12.4], ']': [-13.8, 12.4], '{': [-13.8, 12.4], '}': [-13.8, 12.4],
  '|': [-13.8, 12.4], '/': [-13.4, 11.4], '#': [-12.4, 10.4], '$': [-14.2, 11.8] };
for (const style of ['print', 'script']) {
  for (const [ch, [top, bottom]] of Object.entries(SPAN)) {
    const v = variants(style, ch).find((x) => x.id === 'hershey');
    if (!v) continue;
    let y0 = Infinity, y1 = -Infinity;
    for (const st of v.s) for (const [, y] of st) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const k = (bottom - top) / (y1 - y0);
    const sh = style === 'script' ? SHEAR : 0; // keep the slant: shift x with the moved y
    const s2 = map(v.s, ([x, y]) => { const ny = top + (y - y0) * k; return [x + (y - ny) * sh, ny]; });
    register(style, ch, { id: 'hand-height', source: SRC.hershey, l: v.l, r: v.r, s: round(s2) });
    amend(style, ch, 'hershey', { weight: 0, tags: { allograph: 'retired' } });
  }
}

// How common each form is among writers of a style (the Hershey form is 1). Rough shares, tuned by eye on
// contact sheets: rare forms stay rare unless a writer's schooling favours them.
const COMMON = {
  print: {
    'a.double-storey': 0.5, 'g.double-storey': 0.2, 'g.looped': 0.6, 'e.epsilon': 0.35, 'e.looped': 0.5, 'r.hooked-arm': 0.6, 'r.flick': 0.6,
    't.cross': 0.8, 't.right-bar': 0.4, 't.high-bar': 0.5, 'f.italic': 0.6, 'f.looped': 0.35, 'k.kick': 0.9, 'k.looped': 0.4,
    'y.looped': 0.4, 'y.hooked': 0.7, 'y.stick': 0.5, 'z.crossed': 0.5, 'z.tailed': 0.35,
    'one.plain': 0.8, 'one.flag-base': 0.5, 'one.long-flag': 0.4, 'seven.crossed': 0.4, 'seven.serif': 0.3, 'four.open': 0.8,
    'nine.straight': 0.6, 'nine.hooked': 0.4, 'A.round-top': 0.5, 'A.cursive': 0.4, 'E.reversed': 0.4, 'G.spur': 0.5,
    'G.cursive': 0.4, 'M.splayed': 0.6, 'l.tailed': 0.8, 'l.looped': 0.35, 'b.looped': 0.3, 'd.looped': 0.35, 'h.looped': 0.3,
    'q.tailed': 0.5, 'q.crossed': 0.3, 'u.cup': 0.5, 'w.rounded': 0.6, 'x.arcs': 0.35, 'p.tall': 0.3,
    'two.curly': 0.4, 'three.round': 0.9, 'eight.stacked': 0.5, 'I.serif': 0.6, 'J.long-top': 0.4, 'K.kick': 0.8, 'U.stem': 0.5,
    'W.rounded': 0.5, 'Y.cup': 0.5, 'Z.crossed': 0.4, 'M.rounded': 0.4, 'M.short-middle': 0.5, 'Q.tail': 0.7, 'R.one-stroke': 0.6, 'R.kicked': 0.4,
    
  },
  script: {
    'a.double-storey': 0.3, 'a.open': 0.3, 'g.hooked': 0.1, 'g.double-storey': 0.03, 'e.print': 0.4,
    'r.knotted': 0.4, 'r.arm': 0.6, 's.looped': 0.6, 't.short': 1, 't.right-bar': 0.5, 't.looped': 0.6, 't.tall': 0.5,
    'f.italic': 0.6, 'f.print': 0.4, 'k.kick': 0.8, 'k.plain': 0.6, 'y.straight': 0.08, 'y.hooked': 0.12, 'z.plain': 0.6, 'z.crossed': 0.4,
    'A.cursive': 1.4, 'M.arched': 0.8, 'l.plain': 0.35, 'b.plain': 0.3, 'h.plain': 0.3, 'd.looped': 0.5,
  },
};
for (const [style, table] of Object.entries(COMMON)) {
  for (const [allograph, weight] of Object.entries(table)) {
    const ch = allographChar(allograph);
    // the joined hand's digits are the print digits, slanted: same frequencies
    for (const st of style === 'print' && ch >= '0' && ch <= '9' ? ['print', 'script'] : [style]) {
      for (const v of variants(st, ch)) if ((v.tags && v.tags.allograph) === allograph) amend(st, ch, v.id, { weight });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// The §4 short IDs, so traced styles may tag variants either way ('a.1' or 'a.double-storey').
// ---------------------------------------------------------------------------------------------------------
defineAllographAliases({
  'a.1': 'a.double-storey', 'a.2': 'a.single-storey', 'a.3': 'a.open',
  'b.1': 'b.looped', 'b.2': 'b.plain', 'b.3': 'b.closed', 'c.2': 'c.hooked',
  'd.1': 'd.looped', 'd.2': 'd.plain', 'd.3': 'd.curled',
  'e.1': 'e.looped', 'e.2': 'e.epsilon', 'e.3': 'e.angular', 'e.4': 'e.print', 'e.5': 'e.head', 'e.6': 'e.broken',
  'f.1': 'f.looped', 'f.2': 'f.italic', 'f.3': 'f.print', 'f.4': 'f.long-crossed', 'f.5': 'f.mirrored-loop',
  'g.1': 'g.looped', 'g.2': 'g.straight', 'g.3': 'g.hooked', 'g.4': 'g.double-storey',
  'h.1': 'h.looped', 'h.2': 'h.plain', 'h.3': 'h.kurrent', 'i.1': 'i.dot', 'i.2': 'i.tick', 'i.3': 'i.delayed',
  'j.1': 'j.looped', 'j.2': 'j.hooked', 'k.1': 'k.looped', 'k.2': 'k.kick', 'k.3': 'k.plain', 'k.4': 'k.kurrent',
  'l.1': 'l.looped', 'l.2': 'l.plain', 'm.1': 'm.round', 'm.2': 'm.angular', 'm.3': 'm.lead-in', 'm.4': 'm.bar',
  'o.1': 'o.looped', 'o.2': 'o.open', 'o.3': 'o.knotted', 'p.1': 'p.looped', 'p.2': 'p.plain', 'p.3': 'p.tall', 'p.4': 'p.open',
  'q.1': 'q.forward', 'q.2': 'q.crossed', 'q.3': 'q.serif',
  'r.1': 'r.peaked', 'r.2': 'r.knotted', 'r.3': 'r.arm', 'r.4': 'r.angular', 'r.5': 'r.rotunda',
  's.1': 's.pointed', 's.2': 's.print', 's.3': 's.long', 's.4': 's.round-final', 's.5': 's.looped', 's.6': 's.exit',
  't.1': 't.short', 't.2': 't.looped', 't.3': 't.right-bar', 't.4': 't.double-bar', 't.5': 't.loop-mid', 't.6': 't.upstroke',
  'u.1': 'u.plain', 'u.2': 'u.arc', 'v.1': 'v.pointed', 'v.2': 'v.knotted', 'x.1': 'x.crossed', 'x.2': 'x.looped',
  'y.1': 'y.looped', 'y.2': 'y.straight', 'z.1': 'z.plain', 'z.2': 'z.crossed', 'z.3': 'z.tailed', 'z.4': 'z.flat',
  'A.2': 'A.cursive', 'E.1': 'E.reversed', 'F.1': 'F.wavy', 'F.2': 'F.looped', 'I.1': 'I.looped', 'I.2': 'I.serif',
  'J.1': 'J.long-top', 'Q.1': 'Q.two', 'S.2': 'S.spine', 'S.3': 'S.l-shaped', 'Z.1': 'Z.crossed', 'Z.2': 'Z.looped',
  '1.1': 'one.plain', '1.2': 'one.long-flag', '1.3': 'one.flag-base', '2.2': 'two.curly', '3.2': 'three.flat',
  '4.2': 'four.open', '4.3': 'four.flowing', '7.2': 'seven.crossed', '7.3': 'seven.wavy', '9.2': 'nine.hooked', '0.1': 'zero.plain',
});

// ---------------------------------------------------------------------------------------------------------
// Schoolings: where a writer learned, as bundles of forms that travel together (hand-traditions.md §4).
// Multipliers on each form's base weight; forms a style lacks are simply ignored. Weights are rough shares of
// Latin-script writers we want New hand to meet, not census data.
// ---------------------------------------------------------------------------------------------------------
defineSchooling('continental', {
  label: 'Continental European school', region: 'Germany, Austria, Switzerland, Italy, Spain, the Netherlands, the Nordic countries', weight: 2.6,
  prefer: { 'one.long-flag': 9, 'one.flag': 0.4, 'one.plain': 0.2, 'seven.crossed': 9, 'seven.plain': 0.3, 'z.crossed': 2.6, 'four.open': 1.6, 'nine.straight': 1.6, 'k.plain': 1.4, 't.cross': 1.6, 'A.pointed': 1.2,
    'q.crossed': 2, 'Z.crossed': 4, 'I.serif': 2.4, 'J.long-top': 2, 'u.cup': 1.3, 'three.round': 1.3 },
  printCaps: 0.25,
});
defineSchooling('american', {
  label: 'American business hand (Palmer, Zaner-Bloser)', region: 'United States, Canada', weight: 2.2,
  prefer: { 'one.plain': 5, 'one.flag': 1.4, 'one.long-flag': 0.1, 'seven.plain': 5, 'seven.crossed': 0.5, 'r.peaked': 2, 'k.looped': 2, 'k.kick': 1.4, 'y.looped': 1.6, 'f.looped': 2, 'z.tailed': 2.4, 'A.cursive': 3, 'Q.two': 0.8, 'F.wavy': 2, 'T.wavy': 2, 't.short': 1.6, 'e.looped': 1.4, 'g.looped': 1.4,
    'l.looped': 2, 'b.looped': 1.6, 'h.looped': 1.6, 'd.looped': 1.4, 'two.curly': 3, 'q.tailed': 1.3 },
  printCaps: 0.2, traits: { slant: 0.4 },
});
defineSchooling('british', {
  label: 'British and Irish print-first school', region: 'United Kingdom, Ireland, Australia, New Zealand', weight: 1.7,
  prefer: { 'one.plain': 3, 'one.flag': 1.4, 'seven.plain': 2.4, 'e.epsilon': 2, 'k.plain': 1.8, 'f.print': 1.6, 'f.italic': 1.4, 'y.straight': 1.4, 'y.stick': 1.4, 'r.arm': 1.6, 't.cross': 1.4, 'g.hooked': 1.4, 'E.reversed': 1.6,
    'l.tailed': 1.4, 'w.rounded': 1.3, 'u.cup': 1.2 },
  printCaps: 0.5, traits: { slant: -0.2 },
});
defineSchooling('french', {
  label: 'French school hand', region: 'France, Belgium, Québec, francophone Africa', weight: 1.4,
  prefer: { 'one.long-flag': 7, 'one.plain': 0.2, 'seven.crossed': 7, 'seven.plain': 0.3, 'r.knotted': 4, 'z.tailed': 3, 's.looped': 2.6, 'e.looped': 1.6, 'f.looped': 1.8, 'q.forward': 1.2, 'p.tall': 3, 'A.cursive': 1.6, 'l.looped': 1.5, 'b.looped': 1.4 },
  printCaps: 0.15, traits: { slant: -0.8, round: 0.6 },
});
defineSchooling('italic', {
  label: 'Italic school (Italy, Nordic formskrift, Marion Richardson)', region: 'Italy, Norway, Sweden, Iceland, the UK', weight: 1.1,
  prefer: { 'k.plain': 3, 'f.italic': 4, 'y.straight': 2.4, 'y.stick': 2, 'g.hooked': 2.4, 'r.arm': 3, 'one.long-flag': 3, 'seven.crossed': 3, 'z.crossed': 2, 'a.single-storey': 1.4, 't.short': 1.6,
    'l.tailed': 2, 'l.plain': 3, 'b.plain': 3, 'h.plain': 3, 'u.cup': 1.4, 'w.rounded': 1.5 },
  printCaps: 0.35, traits: { slant: 0.3, round: -0.6, width: -0.4 },
});
defineSchooling('polish', {
  label: 'Polish school cursive', region: 'Poland', weight: 0.6,
  prefer: { 'one.long-flag': 6, 'seven.crossed': 6, 'z.crossed': 3, 'g.hooked': 2.4, 'y.hooked': 1.6, 'k.plain': 1.4, 'q.tailed': 2 },
  printCaps: 0.15, traits: { slant: -0.4 },
});
defineSchooling('latin-american', {
  label: 'Latin American school hand', region: 'Mexico, Argentina, Brazil, Cuba, Colombia', weight: 1.1,
  prefer: { 'one.long-flag': 4, 'seven.crossed': 6, 'z.crossed': 1.6, 'A.cursive': 2, 'r.peaked': 1.4, 'f.looped': 1.4, 'e.looped': 1.4 },
  printCaps: 0.2, traits: { slant: 0.4, round: 0.3 },
});
defineSchooling('adult-print', {
  label: 'Present-day adult print', region: 'anywhere: the hand people drift into after school', weight: 1.6,
  prefer: { 'e.epsilon': 1.8, 't.right-bar': 1.6, 't.high-bar': 1.6, 'r.flick': 1.6, 'A.round-top': 1.8, 'M.splayed': 1.6, 'M.rounded': 1.4, 'G.spur': 1.4, 'one.flag-base': 1.5, 'four.open': 1.6, 'y.stick': 1.3, 'a.double-storey': 1.3, 'R.one-stroke': 1.5,
    'u.cup': 1.4, 'w.rounded': 1.4, 'K.kick': 1.4, 'eight.stacked': 1.6, 'Y.cup': 1.4, 'x.arcs': 1.4, 'U.stem': 1.3 },
  printCaps: 0.65, traits: { hurry: 0.3 },
});

// Forms that travel together beyond a single schooling (decided in character order: '1' before '7', 'Z' before 'z')
addAffinity('one.long-flag', 'seven.crossed', 10);   // continental numerals: almost never 1.2 with a plain 7
addAffinity('one.plain', 'seven.plain', 3);
addAffinity('seven.crossed', 'z.crossed', 2.4);
addAffinity('Z.crossed', 'z.crossed', 4);
addAffinity('a.double-storey', 'g.double-storey', 3);
addAffinity('A.cursive', 'a.single-storey', 1.6);
addAffinity('k.looped', 'y.looped', 1.6);
addAffinity('f.italic', 'k.plain', 1.8);
addAffinity('f.looped', 'k.looped', 1.8);
// loops travel together (b d f h k l), and so do plain, italic ascenders
for (const kind of ['looped', 'plain']) {
  const chain = ['b', 'd', 'f', 'h', 'k', 'l'];
  for (let i = 1; i < chain.length; i++) for (let j = 0; j < i; j++) addAffinity(`${chain[j]}.${kind}`, `${chain[i]}.${kind}`, 2.2);
}
addAffinity('W.rounded', 'w.rounded', 2.5);
addAffinity('U.stem', 'u.plain', 1.6);
addAffinity('seven.crossed', 'Z.crossed', 2.2);

// Forms that are one shape drawn further or less: a writer between two schools can sit anywhere along these
// (glyphs.js blending morphs them; different constructions are never morphed)
for (const c of [
  ['one.plain', 'one.flag', 'one.long-flag'], ['r.arm', 'r.hooked-arm', 'r.flick'], ['g.hooked', 'g.looped'],
  ['y.straight', 'y.stick'], ['y.hooked', 'y.looped'], ['l.plain', 'l.tailed'], ['nine.curved', 'nine.straight', 'nine.hooked'],
  ['t.hooked', 't.cross', 't.right-bar', 't.high-bar'], ['t.short', 't.right-bar', 't.tall'], ['e.print', 'e.looped'],
  ['q.plain', 'q.tailed'], ['three.flat', 'three.round'], ['M.vertical', 'M.short-middle'], ['R.leg', 'R.kicked'],
  ['A.pointed', 'A.round-top'], ['W.pointed', 'W.rounded'], ['z.plain', 'z.tailed'], ['s.print', 's.pointed', 's.looped'],
]) defineContinuum(c);

// Second forms picked by context (human-feel.md §5: 3-6 letters per writer, chosen by position and neighbours)
addContextHabit({ ch: 's', when: 'final', forms: ['s.final', 's.round-final', '*'], weight: 2 });
addContextHabit({ ch: 'y', when: 'final', forms: ['y.straight', 'y.hooked', 'y.stick'], weight: 1.6 }); // no join to make: no loop
addContextHabit({ ch: 'g', when: 'final', forms: ['g.hooked', 'g.straight'], weight: 1.4 });
addContextHabit({ ch: 't', when: 'final', forms: ['t.right-bar', 't.high-bar', 't.cross'], weight: 1.2 });
addContextHabit({ ch: 'e', when: 'initial', forms: ['e.epsilon', 'e.print'], weight: 1 });
addContextHabit({ ch: 'r', when: 'initial', forms: ['r.arm', 'r.flick', 'r.hooked-arm', '*'], weight: 0.9 });
addContextHabit({ ch: 'a', when: 'medial', forms: ['a.open'], weight: 0.5 });
addContextHabit({ ch: 'd', when: 'final', forms: ['d.plain', 'd.curled'], weight: 1 });
addContextHabit({ ch: 's', when: 'double', forms: ['s.print', 's.pointed', 's.looped', '*'], weight: 0.8 });
addContextHabit({ ch: 't', when: 'double', forms: ['t.right-bar', 't.cross'], weight: 0.7 });
addContextHabit({ ch: 'f', when: 'double', forms: ['f.print', 'f.italic', '*'], weight: 0.5 });
addContextHabit({ ch: 'k', when: 'initial', forms: ['k.plain', 'k.kick'], weight: 0.4 });
addContextHabit({ ch: 'z', when: 'final', forms: ['z.plain', 'z.tailed'], weight: 0.4 });

// ---------------------------------------------------------------------------------------------------------
// Forms derived from any style's own letter: crossing bars (7, z, Z, q) and a base on the 1. Traced copybooks
// usually have one form per letter; these let a continental writer of any tradition cross their 7 and z.
// Registered the first time a writer uses a style, only where the style lacks that form.
// ---------------------------------------------------------------------------------------------------------
const DERIVED = [
  { ch: '7', allograph: 'seven.crossed', zone: 'cap', at: 0.47, half: 0.24 },
  { ch: 'z', allograph: 'z.crossed', zone: 'x', at: 0.5, half: 0.3 },
  { ch: 'Z', allograph: 'Z.crossed', zone: 'cap', at: 0.5, half: 0.26 },
  { ch: 'q', allograph: 'q.crossed', zone: 'desc', at: 0.45, half: 0.32 },
  { ch: '1', allograph: 'one.flag-base', zone: 'base', half: 0.2 },
];
// x positions where a polyline crosses the horizontal line y
const crossings = (s, y) => {
  const xs = [];
  for (const st of s) for (let i = 1; i < st.length; i++) {
    const [x0, y0] = st[i - 1], [x1, y1] = st[i];
    if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) xs.push(x0 + (x1 - x0) * (y - y0) / (y1 - y0));
  }
  return xs;
};
addDeriver((style) => {
  const st = getStyle(style);
  const m = st.metrics;
  for (const d of DERIVED) {
    const list = variants(style, d.ch);
    if (!list.length || list.some((v) => allographOf(v) === d.allograph)) continue;
    // only from the style's own letter (a borrowed one belongs to another tradition)
    const base = list.find((v) => v.weight !== 0 && !(v.tags && v.tags.position) && !v.borrowedFrom);
    if (!base || !getStyle(style).glyphs.has(d.ch)) continue;
    const mm = base.metrics || m;
    const capH = mm.base - mm.cap;
    let x0 = Infinity, x1 = -Infinity, yTop = Infinity, yLow = -Infinity, xLow = 0;
    for (const s2 of base.s) for (const [x, y] of s2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < yTop) yTop = y; if (y > yLow) { yLow = y; xLow = x; } }
    const W = Math.max(x1 - x0, 0.3 * capH);
    let bar;
    if (d.zone === 'base') {
      const hw = d.half * capH * 1.2;
      bar = [[xLow - hw, mm.base], [xLow + hw, mm.base]];
    } else {
      // across the letter's own height (copybook digits may be short or hang below the line), or its descender
      const y = d.zone === 'desc' ? mm.base + d.at * (mm.descender - mm.base) : yTop + d.at * (Math.min(yLow, mm.base) - yTop);
      const xs = crossings(base.s, y);
      if (!xs.length) continue;
      const cx = (x0 + x1) / 2, x = xs.sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx))[0];
      const hw = d.half * W, tilt = 0.03 * capH;
      bar = [[x - hw, y + tilt], [x + hw, y - tilt]];
    }
    register(style, d.ch, {
      id: d.allograph + '.derived', l: base.l, r: base.r, s: [...base.s, bar], ...(base.metrics ? { metrics: base.metrics } : {}), weight: 0.25,
      source: { name: 'Derived allograph', credit: `Seedhand, derived from this style's own ${d.ch} (${(st.tradition && st.tradition.name) || style}); after ${d.allograph === 'one.flag-base' ? 'print school hands' : 'continental European school hands'}` },
      tags: { allograph: d.allograph },
    });
  }
});

export { PRINT, PRINT_HERSHEY, SCRIPT, SCRIPT_HERSHEY, arc, join, shear, sg, pg, SRC };
