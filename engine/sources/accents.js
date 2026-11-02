// sources/accents.js — GF Latin Core for every style: accented letters, special letters, extra punctuation.
//
// Nothing here is a fixed glyph. One composer builds, for any style (including traced styles added later):
//  - Accented letters (é ü ł ő ș ...) = the hand's own base letter + a handwritten mark. The character is
//    NFD-decomposed, the base letter's actual ink is measured, and each mark is written as a quick flick
//    above / below / beside it: lifted above that ink, offset along the style's lean, drifting a little to
//    the right, sized from the writer's x-height. Language conventions from docs/research/hand-traditions.md §5:
//    the Polish ł bar on top, the Czech háček written beside ď ť ľ Ľ, an open Hungarian double acute (ő ű),
//    i and j losing their dot under a mark (í ï ı ȷ, but Turkish İ and į keep it), Romanian comma below (ș ț)
//    kept apart from the cedilla (ş ţ ç), Latvian commas (ķ ļ ņ ŗ, and ģ above), capitals keeping their
//    marks inside the line where possible.
//  - Special letters (ß ẞ Æ æ Œ œ Ø ø Ð ð Þ þ Đ đ Ħ ħ ı ȷ ł Ł) derived from the style's own letters, except
//    ß ẞ § ¶, which are drawn here (print and script designs) and fitted to the style.
//  - Punctuation and marks: ¡ ¿ « » ‹ › ‚ „ § ¶ ª º, the spacing accents (´ ¨ ¯ ¸ ˆ ˇ ˘ ˙ ˚ ˛ ˜ ˝) and the
//    combining marks typed on their own.
//
// Marks are a few *intentions* with per-writer angle, size and offset (hand-traditions §5): each writer
// (seed, namespace 'accents:') has habits: acute angle, umlaut as dots / dash / ticks, háček as a v or a
// swoosh, wave or flat tilde, hook or comma cedilla, how high and how far right marks land.
//
// Engine hooks this module relies on (glyphs.js / hand.js):
//  - choose(p, ch, ctx) returns `variant.resolve(p, ctx)`: each composed letter is built for the actual
//    writer (their own base letter variant, their mark habits, their proportions). The variant's own
//    `s` is the same letter built for an average writer of the style (used by tools that list variants).
//  - `variant.marks` = indices of the strokes in `s` that are marks: makeGlyph flags them `mark: true`
//    (written after the letter). `markKinds` (same order) says which mark each one is: 'acute', 'caron',
//    'lslash'... The engine still reads any tiny stroke as a dot, so marks that aren't dots are kept larger
//    than its dot size, and joined letters pin entry/exit on all strokes, so marks stay inside them.
//  - isLower / isUpper are Unicode-aware (é, ß, Æ get letter proportions); this module follows them.
// The zone remap below mirrors hand.js glyphSkeleton (zoneY + width scale): change them together.

import { addComposer, variants, choose, getStyle } from '../glyphs.js';
import { rng, clamp } from '../core.js';
import { makeHand, isLower, isUpper, isDigit, CAP } from '../hand.js';

const DEG = Math.PI / 180;

// ---------- provenance ----------
const SEEDHAND = 'Seedhand (hand-authored; conventions in docs/research/hand-traditions.md §5)';
const CONVENTIONS = {
  pl: { note: 'Polish ł bar and ogonek', credit: 'Wikipedia: Ł; Primarium (Poland)', url: 'https://en.wikipedia.org/wiki/%C5%81' },
  cs: { note: 'háček written beside ď ť ľ Ľ', credit: 'Filip Blažek, quoted on TypeDrawers', url: 'https://typedrawers.com/discussion/comment/38318' },
  hu: { note: 'open Hungarian double acute', credit: 'TypeDrawers (unverified in a Hungarian school source)', url: 'https://typedrawers.com/discussion/comment/43154' },
  ro: { note: 'Romanian comma below, not cedilla', credit: 'Wikipedia: Romanian alphabet', url: 'https://en.wikipedia.org/wiki/Romanian_alphabet' },
  tr: { note: 'Turkish dotted İ and dotless ı', credit: 'Primarium (Turkey)', url: 'https://primarium.info/countries/turkey/' },
  de: { note: 'umlaut as dots, ticks or a dash; ß', credit: 'COERLL German pronunciation guide; BYU Script Tutorial', url: 'https://coerll.utexas.edu/dib/pho.php?k=2' },
  lv: { note: 'Latvian comma accents (ģ above)', credit: 'typographic convention (handwriting unverified)' },
  is: { note: 'Icelandic ð and þ derived from d and p', credit: 'hand-traditions.md §5' },
  no: { note: 'ø slash written top-right to bottom-left, overshooting', credit: 'Wikipedia: Double acute (Nordic hands)', url: 'https://en.wikipedia.org/wiki/Double_acute_accent' },
};
const CONVENTION_OF = {
  'ł': 'pl', 'Ł': 'pl', 'ą': 'pl', 'Ą': 'pl', 'ę': 'pl', 'Ę': 'pl', 'ď': 'cs', 'ť': 'cs', 'ľ': 'cs', 'Ľ': 'cs', 'Ď': 'cs', 'Ť': 'cs',
  'ő': 'hu', 'ű': 'hu', 'Ő': 'hu', 'Ű': 'hu', 'ș': 'ro', 'ț': 'ro', 'Ș': 'ro', 'Ț': 'ro', 'ı': 'tr', 'İ': 'tr', 'ğ': 'tr', 'Ğ': 'tr',
  'ä': 'de', 'ö': 'de', 'ü': 'de', 'Ä': 'de', 'Ö': 'de', 'Ü': 'de', 'ß': 'de', 'ẞ': 'de',
  'ģ': 'lv', 'Ģ': 'lv', 'ķ': 'lv', 'Ķ': 'lv', 'ļ': 'lv', 'Ļ': 'lv', 'ņ': 'lv', 'Ņ': 'lv', 'ŗ': 'lv', 'Ŗ': 'lv',
  'ð': 'is', 'Ð': 'is', 'þ': 'is', 'Þ': 'is', 'ø': 'no', 'Ø': 'no',
};
function sourceFor(ch, bases, what) {
  const c = CONVENTIONS[CONVENTION_OF[ch]];
  const b = bases.filter(Boolean).map((v) => v.source).filter((s, i, a) => s && a.findIndex((t) => t && t.name === s.name) === i);
  const name = b.length ? `${b.map((s) => s.name).join(' + ')} + ${what}` : what;
  const credit = [...b.map((s) => s.credit), SEEDHAND, c ? `${c.note}: ${c.credit}` : null].filter(Boolean).join('; ');
  const url = (c && c.url) || (b[0] && b[0].url);
  return url ? { name, credit, url } : { name, credit };
}

// ---------- small geometry (layout units: font units, y up) ----------
const shift = (s, dx, dy) => s.map((q) => [q[0] + dx, q[1] + dy]);
function bbox(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
// points along the strokes at <= step spacing (so averages are weighted by ink length)
function dense(strokes, step) {
  const out = [];
  for (const s of strokes) {
    if (s.length === 1) { out.push(s[0]); continue; }
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
  }
  return out;
}
// x where the strokes cross height Y
function crossings(strokes, Y) {
  const xs = [];
  for (const s of strokes) for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i];
    if ((a[1] - Y) * (b[1] - Y) > 0 || a[1] === b[1]) continue;
    xs.push(a[0] + (b[0] - a[0]) * (Y - a[1]) / (b[1] - a[1]));
  }
  return xs.sort((p, q) => p - q);
}
const rotPts = (s, deg, cx, cy) => {
  const a = deg * DEG, c = Math.cos(a), n = Math.sin(a);
  return s.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * n, cy + (x - cx) * n + (y - cy) * c]);
};
// near-vertical runs (stems) of consecutive points, longest first: { si, i0, i1, top, bot, len, xAt(Y) }
function stems(strokes, lean, minLen) {
  const runs = [];
  strokes.forEach((s, si) => {
    let i0 = null, dir = 0;
    const close = (i1) => {
      if (i0 != null && i1 > i0) {
        const a = s[i0], b = s[i1], len = Math.abs(b[1] - a[1]);
        if (len >= minLen) {
          const top = a[1] > b[1] ? a : b, bot = a[1] > b[1] ? b : a, pts = s.slice(i0, i1 + 1);
          runs.push({ si, i0, i1, top, bot, len, xAt: (Y) => { const c = crossings([pts], Y); return c.length ? c[0] : top[0] + (Y - top[1]) * lean; } });
        }
      }
      i0 = null;
    };
    for (let i = 1; i < s.length; i++) {
      const dy = s[i][1] - s[i - 1][1], dx = s[i][0] - s[i - 1][0] - lean * dy;
      const vert = Math.abs(dy) > 1e-6 && Math.abs(dx) <= 0.45 * Math.abs(dy);
      if (vert && i0 != null && Math.sign(dy) === dir) continue;
      close(i - 1);
      if (vert) { i0 = i - 1; dir = Math.sign(dy); }
    }
    close(s.length - 1);
  });
  return runs.sort((p, q) => q.len - p.len);
}

// ---------- the engine's zone remap, mirrored (hand.js glyphSkeleton: zoneY + width scale) ----------
// mode: how glyphSkeleton treats a character: 'lower' | 'upper' | 'digit' | 'other' (punctuation, marks)
const modeOf = (ch) => (isLower(ch) ? 'lower' : isUpper(ch) ? 'upper' : isDigit(ch) ? 'digit' : 'other');
function frame(P, m, mode) {
  const S = CAP / (m.base - m.cap);
  const w = mode === 'lower' ? P.width : mode === 'upper' ? P.capWidth : mode === 'digit' ? (P.width + 1) / 2 : 0.5 + P.width / 2;
  const X = m.xHeight, xhT = P.xHeight * CAP, ascT = P.ascender * CAP, descT = P.descender * CAP * m.descRatio;
  const lower = mode === 'lower';
  return {
    S, w, dotT: 2.6 * (m.base - m.cap) / 21,
    fx: (x, l) => (x - l) * S * w,
    ix: (x, l) => l + x / (S * w),
    fy: (y) => !lower ? (m.base - y) * S
      : y >= X && y <= m.base ? (m.base - y) / (m.base - X) * xhT
        : y < X ? xhT + (X - y) / (X - m.cap) * (ascT - xhT)
          : -(y - m.base) / (m.descender - m.base) * descT,
    iy: (Y) => !lower ? m.base - Y / S
      : Y >= 0 && Y <= xhT ? m.base - Y / xhT * (m.base - X)
        : Y > xhT ? X - (Y - xhT) / (ascT - xhT) * (X - m.cap)
          : m.base - Y / descT * (m.descender - m.base),
  };
}

// ---------- who is writing ----------
// The average writer of a style (used when the engine can't tell the composer who is writing).
const NOMINAL = new Map();
const NUM_KEYS = ['xHeight', 'ascender', 'descender', 'width', 'capWidth', 'dotHeight', 'penWidth', 'neatness', 'sidebearing', 'strokeShift'];
function nominal(style) {
  if (NOMINAL.has(style)) return NOMINAL.get(style);
  const P = { seed: 'accents-nominal', style, nominal: true };
  for (const k of NUM_KEYS) P[k] = 0;
  const n = 32;
  for (let i = 0; i < n; i++) { const h = makeHand('accents-nominal-' + i, style); for (const k of NUM_KEYS) P[k] += h[k] / n; }
  NOMINAL.set(style, P);
  return P;
}

// A writer's accent habits: fixed per seed. Correlated with Neatness (fast hands flatten and merge marks)
// and with the family (joined hands write the háček as a swoosh more often).
const NOMINAL_HABITS = {
  size: 1, len: 0.34, acute: 46, grave: 50, lift: 1, gap: 0.14, drift: 0.05, umlaut: 'dots', umlautW: 0.27,
  hacek: 'v', beside: 'hacek', tilde: 'wave', circRound: 0.3, cedilla: 'hook', ring: 0.21, ringOpen: 0.08,
  lbar: null, lbarWave: false, ordUnderline: true, dblOpen: 0.4,
};
function habitsFor(P, fam) {
  if (P.nominal) return { ...NOMINAL_HABITS, lbar: fam === 'script' ? 'top' : 'mid', hacek: fam === 'script' ? 'swoosh' : 'v' };
  const r = rng('accents:' + P.seed);
  const fast = 1 - clamp(P.neatness == null ? 0.6 : P.neatness, 0, 1);
  const script = fam === 'script';
  const pick = (opts) => r.weighted(opts.map(([id, weight]) => ({ id, weight: Math.max(0.001, weight) }))).id;
  const acute = clamp(r.range(30, 62) + r.gauss() * 8 * fast, 20, 74);
  return {
    size: r.range(0.88, 1.14),
    len: r.range(0.3, 0.39) * (1 - 0.12 * fast),
    acute,
    grave: clamp(acute + r.range(-8, 14), 22, 78),             // fast hands: acute and grave converge
    lift: r.range(0.78, 1.12),                                  // how high marks float, vs this writer's i-dots
    gap: r.range(0.1, 0.19),
    drift: r.range(0, 0.09) + 0.06 * fast,                      // marks land to the right, in the writing direction
    umlaut: pick([['dots', 0.64 - 0.2 * fast], ['dash', 0.18 + 0.25 * fast], ['ticks', 0.18]]),
    umlautW: r.range(0.22, 0.31),
    hacek: pick([['v', script ? 0.3 : 0.55], ['swoosh', script ? 0.7 : 0.45]]),
    beside: pick([['hacek', 0.72], ['apostrophe', 0.28]]),     // ď ť ľ: the ordinary háček beside, or a print apostrophe
    tilde: pick([['wave', 0.75 - 0.3 * fast], ['flat', 0.25 + 0.3 * fast]]),
    circRound: clamp(r.range(0, 1) + (script ? 0.25 : 0), 0, 1),
    cedilla: pick([['hook', 0.68], ['comma', 0.32]]),
    ring: r.range(0.17, 0.24),
    ringOpen: r.range(0, 0.22),
    lbar: pick([['top', script ? 0.8 : 0.3], ['mid', script ? 0.2 : 0.7]]),
    lbarWave: r() < 0.3,
    ordUnderline: r() < 0.6,
    dblOpen: r.range(0.36, 0.46),
  };
}

// Caches are keyed by the writer's values, not the params object: UIs make a new object on every redraw.
const HAND_KEYS = ['seed', 'xHeight', 'ascender', 'descender', 'width', 'capWidth', 'dotHeight', 'penWidth', 'neatness', 'strokeShift'];
const handKey = (P) => HAND_KEYS.map((k) => (typeof P[k] === 'number' ? P[k].toFixed(5) : String(P[k]))).join('|');
function bounded(map, max) { if (map.size > max) map.clear(); return map; }

// ---------- per-style measurements (in layout units, for a given writer P) ----------
const STYLE_CACHE = new Map(); // style|writer -> info
function styleInfo(style, P) {
  const key = style + '|' + handKey(P);
  let info = STYLE_CACHE.get(key);
  if (info) return info;
  const st = getStyle(style);
  const xh = P.xHeight * CAP;
  // the style's own lean (x per unit of height), measured on its upright strokes
  let up = 0, right = 0;
  for (const ch of 'lhkbdtILHT1') {
    const v = variants(style, ch)[0];
    if (!v) continue;
    const F = frame(P, v.metrics || st.metrics, modeOf(ch));
    for (const s of v.s) for (let i = 1; i < s.length; i++) {
      const dx = (s[i][0] - s[i - 1][0]) * F.S * F.w, dy = F.fy(s[i][1]) - F.fy(s[i - 1][1]);
      if (Math.abs(dy) < 0.04 * xh || Math.abs(dx) > 0.7 * Math.abs(dy)) continue;
      up += Math.abs(dy); right += dy > 0 ? dx : -dx;
    }
  }
  info = { lean: up ? right / up : 0, fam: st.family || (st.connected ? 'script' : 'print'), connected: !!st.connected };
  bounded(STYLE_CACHE, 2000).set(key, info);
  return info;
}

// ---------- a work piece: strokes in layout units, x measured from the source's left bearing ----------
// { strokes, roles: per stroke null | { kind, role, dot, soft }, adv, l, m, dotIdx }
function work(B, ch, opts = {}) {
  const v = B.pick(ch);
  if (!v) return null;
  const m = v.metrics || B.st.metrics;
  const F = frame(B.P, m, opts.mode || modeOf(ch));
  const strokes = [], roles = [], dotIdx = [];
  for (const s of v.s) {
    const xs = s.map((q) => q[0]), ys = s.map((q) => q[1]);
    const small = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) <= F.dotT;
    const above = (Math.max(...ys) + Math.min(...ys)) / 2 < m.xHeight;
    if (small && above && opts.dropDots) continue; // ı ȷ: the dot goes
    if (small) dotIdx.push(strokes.length);
    strokes.push(s.map((q) => [F.fx(q[0], v.l), F.fy(q[1])]));
    roles.push(null);
  }
  return { strokes, roles, dotIdx, adv: (v.r - v.l) * F.S * F.w, l: v.l, m, variant: v };
}
const ink = (W, onlyLetter = true) => W.strokes.filter((s, i) => !onlyLetter || !W.roles[i]);

// the tail a joined letter leaves on (from its lowest point to the exit), as [strokeIndex, fromIndex]
function exitTail(W) {
  let best = null;
  W.strokes.forEach((s, si) => { if (!W.roles[si]) s.forEach((q, i) => { if (!best || q[0] > best.q[0]) best = { q, si, i }; }); });
  if (!best) return null;
  const s = W.strokes[best.si];
  let i = best.i;
  while (i > 0 && s[i - 1][1] <= s[i][1] + 1e-6) i--;
  return { si: best.si, from: i, to: best.i };
}
function stretchExit(W, dx) {
  const t = exitTail(W);
  if (!t || dx <= 0) return;
  const s = W.strokes[t.si];
  let total = 0;
  for (let i = t.from + 1; i <= t.to; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  let acc = 0;
  for (let i = t.from + 1; i < s.length; i++) {
    if (i <= t.to) acc += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    s[i] = [s[i][0] + dx * (i <= t.to ? acc / (total || 1) : 1), s[i][1]];
  }
  W.adv += dx;
}

// ---------- the marks ----------
// Mark space: units of the writer's x-height, y up. Above-marks sit on y = 0 and are centred on x = 0;
// below-marks hang from (0, 0). Each stroke is written in the direction a hand writes it (top first for
// flicks), so the pen tapers the right way and the animation runs naturally.
// a quick straight-ish stroke, written top first; ang = degrees from horizontal (> 0: top on the right,
// like an acute; < 0: top on the left, like a grave)
function flick(len, ang, bend = 0.05) {
  const a = Math.abs(ang) * DEG, d = ang < 0 ? -1 : 1, c = Math.cos(a), s = Math.sin(a);
  const top = [d * c * len / 2, s * len], bot = [-d * c * len / 2, 0];
  const mid = [(top[0] + bot[0]) / 2 - d * s * bend * len, (top[1] + bot[1]) / 2 + c * bend * len];
  return [top, mid, bot];
}
const dotAt = (x, y) => ({ pts: [[x, y], [x + 0.002, y]], dot: true });
function markShape(kind, H, fam, k, B) {
  const script = fam === 'script';
  switch (kind) {
    case 'acute': return { strokes: [{ pts: flick(H.len * k, H.acute) }] };
    case 'grave': return { strokes: [{ pts: flick(H.len * k * 0.94, -H.grave) }] };
    case 'circumflex': {
      const w = 0.4 * k, h = (script ? 0.2 : 0.18) * k, r = H.circRound;
      const pts = r > 0.4
        ? [[-w / 2, 0], [-w * 0.24, h * 0.72], [-w * 0.06, h * 0.98], [w * 0.08, h * 0.97], [w * 0.26, h * 0.7], [w / 2, -0.01 * k]]
        : [[-w / 2, 0], [0, h], [w / 2, -0.01 * k]];
      return { strokes: [{ pts }] };
    }
    case 'caron': {
      if (H.hacek === 'swoosh') {
        const w = 0.36 * k, h = 0.17 * k;
        return { strokes: [{ pts: [[-w / 2, h * 0.78], [-w * 0.24, h * 0.14], [w * 0.02, 0], [w * 0.28, h * 0.36], [w / 2, h * 1.06]] }] };
      }
      const w = 0.34 * k, h = 0.19 * k;
      return { strokes: [{ pts: [[-w / 2, h], [-0.02 * k, 0], [w / 2, h * 1.04]] }] };
    }
    case 'breve': {
      const w = 0.34 * k, h = 0.15 * k;
      return { strokes: [{ pts: [[-w / 2, h], [-w * 0.36, h * 0.32], [0, 0], [w * 0.36, h * 0.34], [w / 2, h * 1.02]] }] };
    }
    case 'macron': { const w = 0.38 * k; return { strokes: [{ pts: [[-w / 2, 0], [0, 0.012 * k], [w / 2, 0.025 * k]] }] }; }
    case 'dieresis': {
      // the two dots run together: a short, slightly wavy, rising stroke (shorter than a macron)
      if (H.umlaut === 'dash') { const w = 0.27 * k; return { strokes: [{ pts: [[-w / 2, 0], [-w / 6, 0.045 * k], [w / 6, 0.025 * k], [w / 2, 0.075 * k]] }] }; }
      const d = H.umlautW * k * (B && B.narrow ? 0.8 : 1);
      if (H.umlaut === 'ticks') {
        const t = (x) => ({ pts: [[x + 0.025 * k, 0.13 * k], [x - 0.01 * k, 0]], soft: true });
        return { strokes: [t(-d / 2), t(d / 2)] };
      }
      return { strokes: [dotAt(-d / 2, 0.03 * k), dotAt(d / 2, 0.03 * k)] };
    }
    case 'ring': {
      const d = H.ring * k, pts = [];
      const a0 = 100, sweep = 360 * (1 - H.ringOpen) + 30, n = 12;
      for (let i = 0; i <= n; i++) { const a = (a0 + sweep * i / n) * DEG; pts.push([d / 2 * Math.cos(a) * 0.95, d / 2 + d / 2 * Math.sin(a)]); }
      return { strokes: [{ pts }] };
    }
    case 'tilde': {
      const w = 0.42 * k;
      if (H.tilde === 'flat') return { strokes: [{ pts: [[-w / 2, 0], [-w * 0.16, 0.05 * k], [w * 0.16, 0.02 * k], [w / 2, 0.06 * k]] }] };
      const h = 0.12 * k;
      return { strokes: [{ pts: [[-w / 2, h * 0.1], [-w * 0.26, h], [-w * 0.02, h * 0.55], [w * 0.22, 0], [w / 2, h * 0.88]] }] };
    }
    case 'doubleacute': {
      // two strokes, steeper and spread wider than an umlaut (Hungarian ő ű stay distinct from ö ü)
      const ang = Math.min(78, H.acute + 14), len = H.len * k * 0.88, d = H.dblOpen * k;
      return { strokes: [{ pts: shift(flick(len, ang + 8), -d / 2, 0) }, { pts: shift(flick(len, ang - 6), d / 2, 0) }] };
    }
    case 'dot': return { strokes: [dotAt(0, 0.03 * k)] };
    case 'turnedcomma': { // Latvian ģ
      const c = B.comma(0.3 * k);
      return { strokes: c.map((pts) => ({ pts: rotPts(pts, 180, 0, -0.15 * k).map(([x, y]) => [x, y + 0.3 * k]) })) };
    }
    // below the letter, hanging from (0, 0)
    case 'cedilla': {
      if (H.cedilla === 'comma') return { strokes: B.comma(0.27 * k).map((pts) => ({ pts: shift(pts, 0, -0.03 * k) })) };
      // attached, curling right and back left (ç ş ţ): unlike the Romanian comma, which stands apart
      return { strokes: [{ pts: [[0, 0.04 * k], [0.02 * k, -0.07 * k], [0.12 * k, -0.11 * k], [0.17 * k, -0.19 * k], [0.12 * k, -0.27 * k], [0, -0.3 * k], [-0.09 * k, -0.27 * k]] }] };
    }
    // a separate written comma, a little below the letter (ș ț ķ ļ ņ): pressed head, tail down-left
    case 'commabelow': return { strokes: [{ pts: [[0.035 * k, 0], [0.04 * k, -0.05 * k], [0.015 * k, -0.13 * k], [-0.05 * k, -0.24 * k]] }], apart: true };
    case 'ogonek': return { strokes: [{ pts: [[0, 0.03 * k], [-0.07 * k, -0.09 * k], [-0.08 * k, -0.2 * k], [-0.02 * k, -0.28 * k], [0.08 * k, -0.3 * k], [0.15 * k, -0.26 * k]] }] };
    case 'dotbelow': return { strokes: [dotAt(0, 0)], apart: true };
    default: return null;
  }
}
const ABOVE = { 0x300: 'grave', 0x301: 'acute', 0x302: 'circumflex', 0x303: 'tilde', 0x304: 'macron', 0x306: 'breve', 0x307: 'dot', 0x308: 'dieresis', 0x30a: 'ring', 0x30b: 'doubleacute', 0x30c: 'caron' };
const BELOW = { 0x323: 'dotbelow', 0x326: 'commabelow', 0x327: 'cedilla', 0x328: 'ogonek' };
const SPACING = { '´': 'acute', '¨': 'dieresis', '¯': 'macron', '¸': 'cedilla', 'ˆ': 'circumflex', 'ˇ': 'caron', '˘': 'breve', '˙': 'dot', '˚': 'ring', '˛': 'ogonek', '˜': 'tilde', '˝': 'doubleacute' };

// the style's own comma, as strokes of height h (x-heights), top-centre at (0, 0)
function commaOf(B, h) {
  const W = work(B, ',', { mode: 'other' });
  if (!W) return [[[0.02, 0], [0, -h * 0.5], [-0.05, -h]]];
  const b = bbox(W.strokes), s = h * B.xh / b.h;
  // centre on the comma's head (its top fifth), not its tail
  const head = dense(W.strokes, 3).filter((q) => q[1] >= b.y1 - b.h * 0.25);
  const hx = head.reduce((a, q) => a + q[0], 0) / head.length;
  return W.strokes.map((st) => st.map(([x, y]) => [(x - hx) * s / B.xh, (y - b.y1) * s / B.xh]));
}

// ---------- composing ----------
// Place a mark (mark-space strokes) into layout units around (x, y), scaled by the x-height.
function placeMark(B, W, shape, x, y, kind, role) {
  for (const st of shape.strokes) {
    W.strokes.push(st.pts.map(([u, v]) => [x + u * B.xh + B.lean * v * B.xh, y + v * B.xh]));
    W.roles.push({ kind, role, dot: !!st.dot, soft: !!st.soft });
  }
}
function markBox(shape) { return bbox(shape.strokes.map((s) => s.pts)); }

// marks above: measure the base letter's ink, lift the mark above it (to about this writer's i-dot
// height on x-height letters), follow the style's lean, drift a little right, keep capitals inside the line.
// centreline, layout units: leaves room below the page top (950) for half a pen and the engine's per-use
// stretch of the whole letter, which grows with messiness (hand.js instance affine)
const TOP_BUDGET = 830, TOP_MESSY = 90;
function addAbove(B, W, kinds, isCap) {
  const pts = dense(ink(W), B.xh * 0.04);
  if (!pts.length) return;
  const maxY = Math.max(...pts.map((q) => q[1]));
  const band = pts.filter((q) => q[1] >= maxY - (isCap ? 0.22 : 0.3) * B.xh);
  // centre of the letter's top, measured along the style's lean so a slanted body still counts as one column
  const ax = band.reduce((a, q) => a + q[0] - B.lean * (q[1] - maxY), 0) / band.length;
  // open-topped letters (u U V H) carry the mark over the gap: look for the top across the whole top band
  const bandW = Math.max(...band.map((q) => q[0] - B.lean * (q[1] - maxY))) - Math.min(...band.map((q) => q[0] - B.lean * (q[1] - maxY)));
  const body = pts.filter((q) => q[1] >= 0.2 * B.xh);
  const bodyW = body.length ? Math.max(...body.map((q) => q[0] - B.lean * q[1])) - Math.min(...body.map((q) => q[0] - B.lean * q[1])) : B.xh;
  B.narrow = bodyW < 0.32 * B.xh;
  let yBottom = null;
  kinds.forEach((kind, n) => {
    let k = B.H.size * (isCap ? 0.84 : 1) * (n ? 0.86 : 1);
    // a heavy pen needs a longer flick to stay a flick
    if (kind === 'acute' || kind === 'grave') k = Math.max(k, 1.3 * B.P.penWidth / (B.xh * B.H.len));
    let shape = markShape(kind, B.H, B.fam, k, B);
    let box = markBox(shape);
    const near = (cx, half) => {
      const w = pts.filter((q) => Math.abs(q[0] - B.lean * (q[1] - maxY) - cx) <= half);
      return w.length ? Math.max(...w.map((q) => q[1])) : maxY;
    };
    let cx = ax + B.H.drift * B.xh * (isCap ? 0.6 : 1);
    const top = yBottom == null ? near(cx, Math.max((box.w / 2 + 0.08) * B.xh, 0.55 * bandW)) : yBottom;
    // clear of the ink by at least a pen width (each stroke carries half a pen of thickness)
    // (plus room for the engine's loose landing of separate strokes, hand.js strokeShift)
    const clear = (yBottom == null ? 0.8 : 0.7) * B.P.penWidth + 0.03 * B.xh + B.jitter;
    const gap = Math.max(yBottom == null ? B.H.gap * B.xh * (isCap ? 0.62 : 1) : 0.06 * B.xh, clear);
    let y = top + gap;
    if (!isCap && yBottom == null && top < B.xhT + 0.25 * B.xh) {
      // x-height letters: the mark floats where this writer puts i-dots
      const dotY = B.xhT + (B.ascT - B.xhT) * B.P.dotHeight * B.H.lift;
      y = Math.max(y, dotY - box.h * B.xh / 2);
    }
    // keep inside the line: tighten the gap (never below the pen clearance), then shrink the mark,
    // then (tall lowercase like ĺ) slide it right of the stem
    let over = y + box.h * B.xh - B.top;
    if (over > 0) { const g = Math.min(over, y - (top + clear)); if (g > 0) { y -= g; over -= g; } }
    // capitals: a smaller mark first (people write small accents on capitals), then tuck it in a little
    if (over > 0 && isCap) {
      const f = Math.max(0.6, (B.top - y) / (box.h * B.xh));
      shape = markShape(kind, B.H, B.fam, k * f, B); box = markBox(shape); over = y + box.h * B.xh - B.top;
    }
    const minClear = 0.62 * B.P.penWidth + 0.02 * B.xh + 0.5 * B.jitter;
    if (over > 0 && isCap) { const g = Math.min(over, y - (top + minClear)); if (g > 0) { y -= g; over -= g; } }
    if (over > 0 && !isCap) {
      y = B.top - box.h * B.xh;
      // (measured along the lean from the letter's top, the same frame the mark is placed in below)
      // (any ink within pen clearance below the lowered mark counts; measured along the lean from the
      // letter's top, the same frame the mark is placed in below)
      const right = Math.max(...pts.filter((q) => q[1] >= y - clear).map((q) => q[0] - B.lean * (q[1] - maxY)));
      cx = Math.max(cx, right + (box.w / 2 + 0.06) * B.xh + 0.7 * B.P.penWidth + B.jitter / 0.6);
    }
    placeMark(B, W, shape, cx + B.lean * (y - maxY), y, kind, 'above');
    yBottom = y + box.h * B.xh;
  });
}

// marks below: the cedilla / comma hangs from the bottom centre, the ogonek from the bottom right
function addBelow(B, W, kind) {
  const pts = dense(ink(W), B.xh * 0.04);
  if (!pts.length) return;
  const minY = Math.min(...pts.map((q) => q[1]));
  const band = pts.filter((q) => q[1] <= minY + 0.1 * B.xh);
  let x;
  if (kind === 'ogonek') {
    const xs = band.map((q) => q[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    x = x1 - 0.15 * (x1 - x0);
  } else x = band.reduce((a, q) => a + q[0], 0) / band.length;
  const shape = markShape(kind, B.H, B.fam, B.H.size, B);
  // the comma and dot below stand apart from the letter: clear of the pen and the strokes' loose landing
  const y = shape.apart ? minY - (0.75 * B.P.penWidth + 0.04 * B.xh + B.jitter) : minY;
  placeMark(B, W, shape, x, y, kind, 'below');
}

// ď ť ľ Ľ: the háček written beside the ascender (Czech and Slovak hands), or a print apostrophe
function addBeside(B, W) {
  const pts = dense(ink(W), B.xh * 0.04);
  const maxY = Math.max(...pts.map((q) => q[1]));
  const right = Math.max(...pts.filter((q) => q[1] >= maxY - 0.3 * B.xh).map((q) => q[0] - B.lean * (q[1] - maxY)));
  const k = B.H.size * 0.86;
  const shape = B.H.beside === 'apostrophe'
    ? { strokes: B.comma(0.34 * k).map((p) => ({ pts: shift(p, 0, 0.34 * k) })) }
    : markShape('caron', B.H, B.fam, k, B);
  const box = markBox(shape);
  // just right of the stem, its top a little below the stem's top, inside the line
  const yb = Math.min(maxY - box.h * B.xh * 0.7, B.top - box.h * B.xh);
  const n0 = W.strokes.length;
  // sideways the engine shifts separate strokes more than up and down (jitter is the vertical share, 0.6)
  const gapX = 0.6 * B.P.penWidth + 0.05 * B.xh + 0.8 * B.jitter / 0.6;
  placeMark(B, W, shape, right + gapX - box.x0 * B.xh + B.lean * (yb - maxY), yb - box.y0 * B.xh, 'caron', 'beside');
  if (B.connected) {
    // a joined hand leaves room for the háček: the exit stroke runs on past it
    const markRight = bbox(W.strokes.slice(n0)).x1;
    const t = exitTail(W);
    if (t) stretchExit(W, markRight + 0.12 * B.xh - W.strokes[t.si][t.to][0]);
  }
}

// a bar across a stem (ł Ł đ ð Đ ħ Ħ): centre (x, y), length L (layout units), angle (deg), maybe wavy
function addBar(B, W, x, y, L, ang, kind, wave) {
  const a = ang * DEG, c = Math.cos(a), s = Math.sin(a);
  const pts = wave
    ? [[-0.5, 0], [-0.2, 0.04], [0.15, -0.02], [0.5, 0.02]].map(([u, v]) => [x + (u * c - v * s) * L, y + (u * s + v * c) * L])
    : [[-0.5, 0], [0, 0.006], [0.5, 0]].map(([u, v]) => [x + (u * c - v * s) * L, y + (u * s + v * c) * L]);
  W.strokes.push(pts);
  W.roles.push({ kind, role: 'bar', dot: false, soft: false });
}

// Joined letters must keep their entry and exit as the leftmost / rightmost ink, or joins break
// (hand.js pins them on every stroke). A mark sticking out on the right lengthens the exit stroke instead,
// the way a writer leaves room for it; one sticking out on the left moves right.
function keepInsideJoins(B, W) {
  if (!B.connected) return;
  const base = ink(W);
  if (!base.length) return;
  const bb = bbox(base);
  let need = 0;
  W.strokes.forEach((s, i) => {
    const r = W.roles[i];
    if (!r || r.dot) return;
    const b = bbox([s]);
    if (b.x0 < bb.x0 + 0.02 * B.xh) W.strokes[i] = shift(s, bb.x0 + 0.02 * B.xh - b.x0, 0);
    need = Math.max(need, bbox([W.strokes[i]]).x1 + 0.06 * B.xh - bb.x1);
  });
  if (need <= 0) return;
  const t = exitTail(W);
  if (t) { stretchExit(W, need); return; }
  W.strokes.forEach((s, i) => { const r = W.roles[i]; if (r && !r.dot) W.strokes[i] = shift(s, -need, 0); });
}

// An accented letter: NFD base + marks.
function composeAccented(B, ch) {
  const nfd = [...ch.normalize('NFD')];
  if (nfd.length < 2) return null;
  let base = nfd[0];
  const marks = nfd.slice(1).map((c) => ({ cp: c.codePointAt(0) }));
  for (const mk of marks) {
    mk.kind = ABOVE[mk.cp] || BELOW[mk.cp];
    if (!mk.kind) return null; // a mark we don't draw yet (Vietnamese horn, ...)
    mk.pos = ABOVE[mk.cp] ? 'above' : 'below';
  }
  // conventions
  const lowerBase = base.toLowerCase();
  for (const mk of marks) {
    if (mk.kind === 'cedilla' && 'gklnr'.includes(lowerBase)) {
      // Latvian / Livonian: the "cedilla" letters are written with a comma (ģ: a turned comma above)
      if (base === 'g') { mk.kind = 'turnedcomma'; mk.pos = 'above'; } else mk.kind = 'commabelow';
    }
    if (mk.kind === 'caron' && (base === 'd' || base === 't' || base === 'l' || base === 'L')) mk.pos = 'beside';
  }
  const hasAbove = marks.some((mk) => mk.pos === 'above');
  // i and j lose their dot under a mark above (í ï î; Turkish İ is a capital, į keeps its dot)
  if (hasAbove && (base === 'i' || base === 'j')) base = base === 'i' ? 'ı' : 'ȷ';
  const W = work(B, base);
  if (!W) return null;
  if ((base === 'i' || base === 'j') && W.dotIdx.length) placeIDot(B, W);
  const isCap = /\p{Lu}/u.test(base);
  const above = marks.filter((mk) => mk.pos === 'above').map((mk) => mk.kind);
  if (above.length) addAbove(B, W, above, isCap);
  for (const mk of marks) if (mk.pos === 'below') addBelow(B, W, mk.kind);
  if (marks.some((mk) => mk.pos === 'beside')) addBeside(B, W);
  keepInsideJoins(B, W);
  return { W, bases: [W.variant], what: 'handwritten accent' };
}
// į: the kept dot goes where this writer dots an i
function placeIDot(B, W) {
  const stem = W.strokes.filter((_, i) => !W.dotIdx.includes(i));
  const top = bbox(stem);
  const dotY = B.xhT + (B.ascT - B.xhT) * B.P.dotHeight;
  for (const i of W.dotIdx) {
    const b = bbox([W.strokes[i]]);
    W.strokes[i] = shift(W.strokes[i], top.x1 - (top.x1 - top.x0) * 0.35 + B.lean * (dotY - top.y1) - b.cx, dotY - b.cy);
  }
}

// ---------- special letters, derived from the style's own letters ----------
function stemCross(W, Y, which = 'mean') {
  const xs = crossings(ink(W), Y);
  if (!xs.length) return null;
  return which === 'left' ? xs[0] : which === 'right' ? xs[xs.length - 1] : xs.reduce((a, b) => a + b, 0) / xs.length;
}
const SPECIAL = {
  'ı': (B) => dotless(B, 'i'),
  'ȷ': (B) => dotless(B, 'j'),
  'ł': (B) => {
    const W = work(B, 'l');
    if (!W) return null;
    if (B.H.lbar === 'top') {
      // Polish cursive: no top loop, and a horizontal (straight or slightly wavy) bar sitting on top of the
      // letter, not crossing the stem, which would read as t (Wikipedia: Ł)
      collapseLoop(W, B.xhT + 0.05 * B.xh);
      const tb = bbox(ink(W));
      let tp = null;
      for (const st of ink(W)) for (const q of st) if (!tp || q[1] > tp[1]) tp = q;
      const y = Math.min(tb.y1 + 0.45 * B.P.penWidth + 0.02 * B.xh, B.top);
      addBar(B, W, tp[0] + B.lean * (y - tp[1]) + 0.06 * B.xh, y, 0.5 * B.xh * B.H.size, 1, 'lslash', B.H.lbarWave);
    } else {
      // print ł: the stroke crosses the stem near its middle at 20–45° (Wikipedia: Ł)
      const top = bbox(ink(W)).y1, y = 0.56 * top;
      const x = stemCross(W, y) ?? 0;
      addBar(B, W, x + 0.02 * B.xh, y, 0.5 * B.xh * B.H.size, 28, 'lslash', false);
    }
    keepInsideJoins(B, W);
    return { W, bases: [W.variant], what: 'Polish ł bar' };
  },
  'Ł': (B) => {
    const W = work(B, 'L');
    if (!W) return null;
    const y = 0.42 * bbox(ink(W)).y1;
    const x = stemCross(W, y, 'left') ?? 0;
    // cursive: horizontal through the middle, like £; print: crossing at 20–45° (Wikipedia: Ł)
    addBar(B, W, x + 0.06 * B.xh, y, 0.56 * B.xh * B.H.size, B.fam === 'script' ? 2 : 24, 'lslash', false);
    keepInsideJoins(B, W);
    return { W, bases: [W.variant], what: 'Polish Ł bar' };
  },
  'đ': (B) => crossedAscender(B, 'd', 0, 'dcroat'),
  'ð': (B) => crossedAscender(B, 'd', 24, 'eth'),
  'ħ': (B) => crossedAscender(B, 'h', 0, 'hbar'),
  'Đ': (B) => barredD(B),
  'Ð': (B) => barredD(B),
  'Ħ': (B) => {
    const W = work(B, 'H');
    if (!W) return null;
    const capTop = bbox(ink(W)).y1, y = 0.73 * capTop;
    const ss = stems(ink(W), B.lean, 0.35 * capTop).filter((r) => r.top[1] >= y && r.bot[1] <= y);
    let x0, x1;
    if (ss.length >= 2) { const xs = ss.map((r) => r.xAt(y)).sort((a, b) => a - b); x0 = xs[0]; x1 = xs[xs.length - 1]; }
    else { const xs = crossings(ink(W), y); if (xs.length < 2) return null; x0 = xs[0]; x1 = xs[xs.length - 1]; }
    addBar(B, W, (x0 + x1) / 2, y, x1 - x0 + 0.26 * B.xh, 0, 'hbar', false);
    keepInsideJoins(B, W);
    return { W, bases: [W.variant], what: 'bar' };
  },
  'ø': (B) => slashed(B, 'o'),
  'Ø': (B) => slashed(B, 'O'),
  'æ': (B) => pair(B, 'a', 'e'),
  'œ': (B) => pair(B, 'o', 'e'),
  'Æ': (B) => capAE(B) || pair(B, 'A', 'E'),
  'Œ': (B) => pair(B, 'O', 'E', true),
  'þ': (B) => thorn(B),
  'Þ': (B) => capThorn(B),
  'ß': (B) => authored(B, 'ß'),
  'ẞ': (B) => authored(B, 'ẞ'),
  // punctuation
  '‚': (B) => { const W = work(B, ',', { mode: 'other' }); return W && { W, bases: [W.variant], what: 'low quote' }; },
  '„': (B) => doubled(B, ','),
  '‹': (B) => chevrons(B, '<', 1),
  '›': (B) => chevrons(B, '>', 1),
  '«': (B) => chevrons(B, '<', 2),
  '»': (B) => chevrons(B, '>', 2),
  '¡': (B) => inverted(B, '!'),
  '¿': (B) => inverted(B, '?'),
  'ª': (B) => ordinal(B, 'a'),
  'º': (B) => ordinal(B, 'o'),
  '§': (B) => authored(B, '§'),
  '¶': (B) => authored(B, '¶'),
};

function dotless(B, base) {
  const W = work(B, base, { dropDots: true });
  return W && { W, bases: [W.variant], what: 'without its dot' };
}
// a looped ascender pulled in to a near-retrace (Polish cursive ł has no top loop)
function collapseLoop(W, fromY) {
  const src = ink(W).map((s) => s.slice());
  W.strokes = W.strokes.map((s, i) => W.roles[i] ? s : s.map(([x, y]) => {
    if (y < fromY) return [x, y];
    const xs = crossings(src, y);
    if (xs.length < 2) return [x, y];
    const mid = (xs[0] + xs[xs.length - 1]) / 2, t = Math.min(1, (y - fromY) / 40);
    return [x + (mid + (x - mid) * 0.3 - x) * t, y];
  }));
}
function crossedAscender(B, base, ang, kind) {
  const W = work(B, base);
  if (!W) return null;
  const top = bbox(ink(W)).y1;
  const y = B.xhT + (kind === 'eth' ? 0.5 : 0.56) * (top - B.xhT);
  const x = stemCross(W, y);
  if (x == null) return null;
  addBar(B, W, x + 0.03 * B.xh, y, (kind === 'eth' ? 0.42 : 0.46) * B.xh * B.H.size, ang, kind, false);
  keepInsideJoins(B, W);
  return { W, bases: [W.variant], what: kind === 'eth' ? 'crossed ascender (eth)' : 'crossed ascender' };
}
function barredD(B) {
  const W = work(B, 'D');
  if (!W) return null;
  const y = 0.45 * bbox(ink(W)).y1;
  const x = stemCross(W, y, 'left');
  if (x == null) return null;
  addBar(B, W, x + 0.03 * B.xh, y, 0.46 * B.xh * B.H.size, 3, 'dcroat', false);
  keepInsideJoins(B, W);
  return { W, bases: [W.variant], what: 'crossed stem' };
}
// the bowl without the tail a joined letter leaves on
function bowlBox(B, W) {
  if (!B.connected) return bbox(ink(W));
  const t = exitTail(W);
  const pts = [];
  W.strokes.forEach((s, si) => { if (!W.roles[si]) s.forEach((q, i) => { if (!t || si !== t.si || i <= t.from) pts.push(q); }); });
  return bbox([pts]);
}
function slashed(B, base) {
  const W = work(B, base);
  if (!W) return null;
  const b = bowlBox(B, W), o = 0.1 * B.xh, ox = 0.07 * B.xh;
  // written after the o, top-right to bottom-left, overshooting the bowl
  W.strokes.push([[b.x1 + ox, b.y1 + o], [(b.x0 + b.x1) / 2 + 0.01 * B.xh, b.cy], [b.x0 - ox, b.y0 - o]]);
  W.roles.push({ kind: 'slash', role: 'bar', dot: false, soft: false });
  keepInsideJoins(B, W);
  return { W, bases: [W.variant], what: 'slash' };
}
function append(W, V, dx) {
  for (let i = 0; i < V.strokes.length; i++) { W.strokes.push(shift(V.strokes[i], dx, 0)); W.roles.push(V.roles[i]); }
}
// æ œ Œ: two letters written as one, the second overlapping the first
function pair(B, a, b, capStem) {
  const A = work(B, a), E = work(B, b);
  if (!A || !E) return null;
  let dx;
  if (B.connected) dx = A.adv - 0.22 * B.xh;
  else if (capStem) {
    const st = stems(E.strokes, B.lean, 0.5 * bbox(E.strokes).h);
    const ex = st.length ? Math.min(...st.slice(0, 2).map((r) => r.xAt(r.top[1]))) : bbox(E.strokes).x0;
    dx = bbox(A.strokes).x1 - 0.02 * B.xh - ex;
  } else dx = bbox(A.strokes).x1 - 0.03 * B.xh - bbox(E.strokes).x0;
  append(A, E, dx);
  A.adv = Math.max(A.adv, dx + E.adv);
  return { W: A, bases: [A.variant, E.variant], what: 'ligature' };
}
// the parts of a stroke left of x (cut exactly at x)
function clipRight(s, x) {
  const out = [];
  let cur = [];
  for (let i = 0; i < s.length; i++) {
    const q = s[i], inside = q[0] <= x;
    if (i) {
      const p = s[i - 1], pin = p[0] <= x;
      if (pin !== inside) { const t = (x - p[0]) / (q[0] - p[0]); cur.push([x, p[1] + (q[1] - p[1]) * t]); }
      if (pin && !inside) { if (cur.length >= 2) out.push(cur); cur = []; }
    }
    if (inside) cur.push(q);
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}
// print Æ: the A's right leg becomes the E's stem
function capAE(B) {
  if (B.connected) return null;
  const A = work(B, 'A'), E = work(B, 'E');
  if (!A || !E) return null;
  const ab = bbox(A.strokes);
  let apex = null;
  for (const s of A.strokes) for (const q of s) if (!apex || q[1] > apex[1]) apex = q;
  const leg = A.strokes.findIndex((s) => {
    const b = bbox([s]);
    return b.h > 0.7 * ab.h && b.x0 >= apex[0] - 0.05 * B.xh && b.x1 > apex[0] + 0.2 * B.xh;
  });
  const st = stems(E.strokes, B.lean, 0.6 * bbox(E.strokes).h)[0];
  if (leg < 0 || !st) return null;
  const strokes = [];
  A.strokes.forEach((s, i) => {
    if (i === leg) return;
    if (bbox([s]).h < 0.15 * ab.h) strokes.push(...clipRight(s, apex[0])); // the crossbar stops at the new stem
    else strokes.push(s);
  });
  A.strokes = strokes; A.roles = strokes.map(() => null);
  const dx = apex[0] - st.xAt(st.top[1]);
  append(A, E, dx);
  A.adv = Math.max(A.adv, dx + E.adv);
  return { W: A, bases: [A.variant, E.variant], what: 'ligature' };
}
// þ: p with its stem carried up to the ascender (a narrow loop when the stem starts mid-stroke)
function thorn(B) {
  const W = work(B, 'p');
  if (!W) return null;
  const st = stems(ink(W), B.lean, 0.5 * B.xh).sort((r, q) => r.bot[1] - q.bot[1])[0];
  if (!st) return null;
  const s = W.strokes[st.si];
  const ti = st.top === s[st.i0] ? st.i0 : st.i1;
  const T = s[ti], H = B.ascT - T[1];
  if (H <= 0) return { W, bases: [W.variant], what: 'ascender' };
  const A = [T[0] + B.lean * H, B.ascT];
  if (ti === 0 || ti === s.length - 1) {
    const ext = [A, [T[0] + B.lean * H * 0.5, T[1] + H * 0.5]];
    W.strokes[st.si] = ti === 0 ? [...ext, ...s] : [...s, ...ext.reverse()];
  } else {
    const w = 0.07 * B.xh;
    const loop = [[T[0] + B.lean * H * 0.45 + w, T[1] + H * 0.45], [A[0] + w * 0.4, A[1] - 0.02 * B.xh], A, [A[0] - w * 0.6, A[1] - 0.04 * B.xh], [T[0] + B.lean * H * 0.4 - w * 0.5, T[1] + H * 0.4]];
    W.strokes[st.si] = [...s.slice(0, ti + 1), ...loop, ...s.slice(ti)];
  }
  return { W, bases: [W.variant], what: 'ascender (thorn)' };
}
// Þ: P with its bowl lowered to the middle of the stem
function capThorn(B) {
  const W = work(B, 'P');
  if (!W) return null;
  const b = bbox(W.strokes), d = 0.21 * b.h;
  const st = stems(W.strokes, B.lean, 0.5 * b.h)[0];
  if (!st) return null;
  const out = [];
  W.strokes.forEach((s, si) => {
    if (si === st.si && st.i0 === 0 && st.i1 === s.length - 1) { out.push(s); return; }
    if (si !== st.si) { out.push(shift(s, 0, -d)); return; }
    // stem and bowl in one stroke: split at the top, lower the bowl part
    let ti = 0;
    s.forEach((q, i) => { if (q[1] > s[ti][1]) ti = i; });
    out.push(s.slice(0, ti + 1));
    out.push(shift(s.slice(ti), 0, -d));
  });
  W.strokes = out; W.roles = out.map(() => null);
  return { W, bases: [W.variant], what: 'thorn' };
}
// „ : two of the style's commas
function doubled(B, c) {
  const W = work(B, c, { mode: 'other' });
  if (!W) return null;
  const b = bbox(W.strokes), dx = b.w + 0.12 * B.xh;
  const base = W.strokes.map((s) => s.slice()), roles = W.roles.slice();
  W.strokes = []; W.roles = [];
  append(W, { strokes: base, roles }, 0);
  append(W, { strokes: base, roles }, dx);
  W.adv += dx;
  return { W, bases: [W.variant], what: 'doubled' };
}
// ‹ › « »: the style's own < > made small and set at mid x-height
function chevrons(B, c, n) {
  const W = work(B, c, { mode: 'other' });
  if (!W) return null;
  const b = bbox(W.strokes), h = 0.5 * B.xh, sy = h / b.h, sx = sy * 0.78;
  const one = W.strokes.map((s) => s.map(([x, y]) => [(x - b.x0) * sx, (y - b.cy) * sy + 0.47 * B.xhT]));
  const ow = b.w * sx, gap = 0.1 * B.xh, sb = 0.12 * B.xh;
  W.strokes = []; W.roles = [];
  for (let i = 0; i < n; i++) append(W, { strokes: one, roles: one.map(() => null) }, sb + i * (ow * 0.62 + gap));
  W.adv = sb * 2 + ow + (n - 1) * (ow * 0.62 + gap);
  return { W, bases: [W.variant], what: 'angle quote' };
}
// ¡ ¿: turned, written top-down, dipping below the baseline
function inverted(B, c) {
  const W = work(B, c, { mode: 'other' });
  if (!W) return null;
  const b = bbox(W.strokes);
  W.strokes = W.strokes.map((s) => rotPts(s, 180, b.cx, b.cy).map(([x, y]) => [x, y - 0.24 * CAP]).reverse());
  return { W, bases: [W.variant], what: 'turned' };
}
// ª º: a small raised a / o, underlined by some writers
function ordinal(B, c) {
  const W = work(B, c);
  if (!W) return null;
  if (B.connected) { // drop the joining tail
    const t = exitTail(W);
    if (t) W.strokes[t.si] = W.strokes[t.si].slice(0, Math.max(2, t.from + 1));
  }
  const b = bbox(W.strokes), s = 0.55, top = 0.97 * CAP;
  W.strokes = W.strokes.map((st) => st.map(([x, y]) => [(x - b.x0) * s + 0.1 * B.xh, (y - b.y1) * s + top]));
  const nb = bbox(W.strokes);
  W.adv = nb.x1 + 0.14 * B.xh;
  if (B.H.ordUnderline) {
    W.strokes.push([[nb.x0 - 0.02 * B.xh, nb.y0 - 0.1 * B.xh], [nb.x1 + 0.04 * B.xh, nb.y0 - 0.09 * B.xh]]);
    W.roles.push({ kind: 'underline', role: 'bar', dot: false, soft: false });
  }
  return { W, bases: [W.variant], what: 'ordinal indicator' };
}

// ---------- hand-authored skeletons (ß ẞ § ¶), fitted to the style ----------
// Units: x in x-heights; y: 0 baseline, 1 x-height, 2 ascender top, -1 descender (lowercase), or for
// non-letters y in cap heights (0 baseline, 1 cap). One design per family; the style's lean is added.
const AUTHORED = {
  print: {
    'ß': [[[0.02, -0.02], [0.0, 1.0], [0.03, 1.55], [0.14, 1.88], [0.36, 2.0], [0.58, 1.92], [0.68, 1.7], [0.6, 1.46], [0.36, 1.32], [0.62, 1.2], [0.8, 0.92], [0.82, 0.48], [0.66, 0.13], [0.42, 0.0], [0.2, 0.05]]],
    'ẞ': [[[0.02, -0.01], [0.02, 0.62], [0.06, 0.86], [0.2, 0.98], [0.42, 1.0], [0.72, 0.99], [0.42, 0.66], [0.66, 0.6], [0.8, 0.44], [0.8, 0.2], [0.64, 0.04], [0.42, -0.01], [0.24, 0.03]]],
    '§': [[[0.3, 0.88], [0.2, 0.98], [0.02, 1.0], [-0.13, 0.92], [-0.15, 0.78], [-0.02, 0.68], [0.2, 0.6], [0.31, 0.47], [0.24, 0.34], [0.1, 0.29]],
      [[-0.06, 0.6], [-0.18, 0.5], [-0.14, 0.37], [0.04, 0.28], [0.24, 0.19], [0.3, 0.05], [0.18, -0.06], [0.0, -0.08], [-0.15, -0.01]]],
    '¶': [[[0.32, 1.0], [0.04, 1.0], [-0.13, 0.94], [-0.21, 0.82], [-0.18, 0.68], [-0.04, 0.6], [0.14, 0.58]], [[0.14, 1.0], [0.14, -0.1]], [[0.29, 1.0], [0.29, -0.1]]],
  },
  script: {
    'ß': [[[-0.12, 0.0], [-0.03, 0.62], [0.02, 1.4], [0.12, 1.82], [0.32, 2.0], [0.56, 1.94], [0.66, 1.72], [0.56, 1.48], [0.3, 1.34], [0.6, 1.22], [0.8, 0.95], [0.82, 0.5], [0.64, 0.12], [0.36, -0.01], [0.12, 0.06], [0.06, 0.18]]],
    'ẞ': [[[0.0, -0.01], [0.0, 0.6], [0.06, 0.88], [0.22, 0.99], [0.44, 1.0], [0.7, 0.97], [0.4, 0.66], [0.66, 0.58], [0.8, 0.4], [0.78, 0.16], [0.6, 0.02], [0.36, -0.01], [0.16, 0.06]]],
    '§': [[[0.28, 0.9], [0.18, 0.99], [0.0, 1.0], [-0.14, 0.9], [-0.12, 0.76], [0.04, 0.67], [0.24, 0.57], [0.3, 0.44], [0.2, 0.33], [0.02, 0.3], [-0.14, 0.38], [-0.16, 0.5], [-0.02, 0.6]],
      [[0.06, 0.3], [0.24, 0.2], [0.3, 0.06], [0.2, -0.05], [0.02, -0.08], [-0.14, 0.0]]],
    '¶': [[[0.3, 1.0], [0.02, 0.99], [-0.15, 0.92], [-0.22, 0.79], [-0.17, 0.66], [-0.02, 0.59], [0.13, 0.58]], [[0.13, 1.0], [0.11, -0.1]], [[0.28, 1.0], [0.26, -0.1]]],
  },
};
function authored(B, ch) {
  const design = (AUTHORED[B.fam] || AUTHORED.print)[ch];
  if (!design) return null;
  const mode = modeOf(ch);
  const N = nominal(B.style);
  let fx, fy;
  if (ch === 'ß') {
    const ux = B.xh * B.P.width / (N.width || B.P.width);
    fx = (x) => x * ux;
    fy = (y) => (y <= 1 ? y * B.xhT : B.xhT + (y - 1) * (B.ascT - B.xhT));
  } else if (ch === 'ẞ') {
    const ux = 0.62 * CAP * B.P.capWidth / (N.capWidth || B.P.capWidth);
    fx = (x) => x * ux; fy = (y) => y * CAP;
  } else {
    const ux = 0.62 * CAP * (0.5 + B.P.width / 2) / (0.5 + (N.width || B.P.width) / 2);
    fx = (x) => x * ux; fy = (y) => y * CAP;
  }
  let strokes = design.map((s) => s.map(([x, y]) => { const Y = fy(y); return [fx(x) + B.lean * Y, Y]; }));
  const b = bbox(strokes), sb = 0.1 * B.xh;
  strokes = strokes.map((s) => shift(s, sb - b.x0, 0));
  const W = { strokes, roles: strokes.map(() => null), dotIdx: [], adv: b.w + 2 * sb, l: 0, m: B.st.metrics, variant: null, mode };
  return { W, bases: [], what: ch === 'ß' || ch === 'ẞ' ? 'sharp s (B-like Latin-hand form)' : 'hand-authored skeleton' };
}

// a spacing accent or a combining mark typed on its own: the mark where it would sit over a lowercase letter
function loneMark(B, kind) {
  const W = { strokes: [], roles: [], dotIdx: [], adv: 0, l: 0, m: B.st.metrics, variant: null };
  const shape = markShape(kind, B.H, B.fam, B.H.size, B);
  const box = markBox(shape);
  const below = kind === 'cedilla' || kind === 'ogonek' || kind === 'commabelow' || kind === 'dotbelow';
  const y = below ? 0 : Math.max(B.xhT + B.H.gap * B.xh, B.xhT + (B.ascT - B.xhT) * B.P.dotHeight - box.h * B.xh / 2);
  const sb = 0.12 * B.xh;
  placeMark(B, W, shape, sb - box.x0 * B.xh, y, kind, below ? 'below' : 'above');
  const b = bbox(W.strokes);
  W.strokes = W.strokes.map((s) => shift(s, sb - b.x0, 0));
  W.adv = b.w + 2 * sb;
  // the strokes are the glyph here, not marks on a letter (kept big enough not to read as dots, not listed as marks)
  return { W, bases: [], what: 'accent mark', lone: true };
}

// ---------- back to the style's source units ----------
function toVariant(B, ch, built, id) {
  const { W } = built;
  const v0 = W.variant || {};
  const l = W.l, m = W.m;
  const F = frame(B.P, m, modeOf(ch));
  const s = W.strokes.map((st) => st.map(([x, y]) => [F.ix(x, l), F.iy(y)]));
  const marks = [], markKinds = [];
  s.forEach((st, i) => {
    const r = W.roles[i];
    if (!r) return;
    if (!built.lone) { marks.push(i); markKinds.push(r.kind); }
    if (r.dot || r.soft) return;
    // the engine draws any stroke smaller than this as a dot: keep the other marks bigger
    const b = bbox([st]), big = Math.max(b.w, b.h);
    if (big <= F.dotT * 1.12) {
      const f = F.dotT * 1.18 / Math.max(big, 1e-6);
      s[i] = st.map(([x, y]) => [b.cx + (x - b.cx) * f, b.cy + (y - b.cy) * f]);
    }
  });
  const r = l + W.adv / (F.S * F.w);
  const out = { id, source: sourceFor(ch, built.bases, built.what), l, r, s };
  if (marks.length) { out.marks = marks; out.markKinds = markKinds; }
  if (W.m !== B.st.metrics) out.metrics = W.m;
  if (v0.weight != null) out.weight = v0.weight;
  if (v0.tags) out.tags = v0.tags;
  return out;
}

// ---------- the composer ----------
function supported(ch) {
  if (SPECIAL[ch] || SPACING[ch]) return true;
  const cp = ch.codePointAt(0);
  if (ch.length === 1 && (ABOVE[cp] || BELOW[cp])) return true;
  const nfd = [...ch.normalize('NFD')];
  return nfd.length > 1 && nfd.slice(1).every((c) => ABOVE[c.codePointAt(0)] || BELOW[c.codePointAt(0)]);
}
function build(style, ch, P, pick) {
  const st = getStyle(style);
  const info = styleInfo(style, P);
  const B = {
    style, st, P, pick, fam: info.fam, connected: info.connected, lean: info.lean,
    xh: P.xHeight * CAP, xhT: P.xHeight * CAP, ascT: P.ascender * CAP,
    H: habitsFor(P, info.fam),
  };
  B.comma = (h) => commaOf(B, h);
  B.top = TOP_BUDGET - TOP_MESSY * (1 - clamp(P.neatness == null ? 0.6 : P.neatness, 0, 1));
  // how far the engine may shift a separate stroke vertically (hand.js: strokeShift * (6 + 22 * messy) * 0.6)
  B.jitter = 1.3 * (P.strokeShift == null ? 1 : P.strokeShift) * (6 + 22 * (1 - clamp(P.neatness == null ? 0.6 : P.neatness, 0, 1))) * 0.6;
  const cp = ch.codePointAt(0);
  if (SPECIAL[ch]) return SPECIAL[ch](B);
  if (SPACING[ch]) return loneMark(B, SPACING[ch]);
  if (ch.length === 1 && (ABOVE[cp] || BELOW[cp])) return loneMark(B, ABOVE[cp] || BELOW[cp]);
  return composeAccented(B, ch);
}

const BUILT = new Map(); // style|writer|char|base variant -> each writer's composed letter
function composer(style, ch) {
  if (!supported(ch) || !getStyle(style)) return null;
  const P0 = nominal(style);
  // the base letter(s) this character is built on; the static list has one variant per base variant
  const nfd = [...ch.normalize('NFD')];
  const lead = SPECIAL[ch] || SPACING[ch] || nfd.length < 2 ? null : nfd[0];
  const baseList = lead ? variants(style, lead) : [null];
  if (lead && !baseList.length) return null;
  const out = [];
  baseList.forEach((bv, k) => {
    const pick = (c) => (c === lead && bv ? bv : variants(style, c)[0]);
    let built;
    try { built = build(style, ch, P0, pick); } catch (e) { built = null; }
    if (!built) return;
    const v = toVariant({ P: P0, st: getStyle(style) }, ch, built, bv && baseList.length > 1 ? 'composed.' + bv.id : 'composed');
    // each writer gets the letter built from their own base letter and habits (choose() calls this)
    v.resolve = (p, ctx) => {
      if (!p || p.style !== style) return v;
      const chosen = new Map();
      const pickP = (c) => { if (!chosen.has(c)) chosen.set(c, choose(p, c, ctx)); return chosen.get(c); };
      const bv2 = lead ? pickP(lead) : null;
      const key = style + '|' + handKey(p) + '|' + ch + '|' + (bv2 ? (bv2.borrowedFrom || '') + ':' + bv2.id : '');
      if (BUILT.has(key)) return BUILT.get(key);
      let b2 = null;
      try { b2 = build(style, ch, p, pickP); } catch (e) { b2 = null; }
      const rv = b2 ? toVariant({ P: p, st: getStyle(style) }, ch, b2, v.id) : v;
      bounded(BUILT, 20000).set(key, rv);
      return rv;
    };
    out.push(v);
  });
  return out.length ? out : null;
}
addComposer(composer);
