// corrections.js — the writer's little journey: the slips a real person makes while writing a note,
// each fixed the way *this* writer fixes things.
//
//   const j = writeWithJourney(p, text, layoutOpts, { amount, seed });
//   renderSVG(p, j.page, ...) / renderCanvas(...) / playSVG(...)   (j.page has layout()'s shape)
//   j.intended    the clean text: what the note says
//   j.transcript  the text with its corrections marked, for screen readers ("I [struck: hpoe] hope")
//   j.events      an append-only ink log (writing-experience.md §4.1) a future Ink mode could replay
//   j.fixes       one entry per correction, in writing order (for summaries and the lab)
//
// What can happen (docs/research/writing-experience.md §2, §5; human-feel.md §4.5, rule 25):
//   slip        a wrong letter: written over in heavier ink (n→m, c→e, J→G), or stopped and struck
//   misspell    the whole word struck through (or scribbled out) and written again after it
//   falseStart  a few letters (often the next word's: writing ahead) struck, then the word begun again
//   omit        a forgotten word, added above the line over a caret ‸, smaller and cramped
//   double      "the the": one copy struck out
//   extras      an emphatic underline, a pen running dry then restarting darker, an ink blot by a
//               correction, a P.S. squeezed in smaller under the signature
// How a writer corrects is a fixed habit (fixHabits), correlated with neatness and hurry: a neat hand
// rules one straight line, a hurried one makes a fast wave, a coil or a scribble.
// Where: longer words, double letters, word endings, later in a line and in a paragraph (tired).
// Legibility first: a struck word is always rewritten in full, an overwrite is only used where the
// right letter covers the wrong one, and the intended text is always recoverable (journeyText).
//
// Correction marks are real pen strokes: centerlines through penOutline(), so they carry the hand's
// pen, ink, pressure and kinematics. They are page items like letters (role: 'mark'), and their
// strokes carry mark: 'strike' | 'scribble' | 'caret' | 'underline' | 'blot', with delayed: true where
// the writer adds them after the word, so animate.js writes them at the right moment.
//
// amount = 0 returns exactly layout()'s page. Deterministic: habits come from 'fix:' + seed, the
// plan and marks from 'journey:' + seed + ':' + draft (new namespaces, see ARCHITECTURE.md).

import { rng, clamp, lerp, smooth, DEG } from './core.js';
import { makeGlyph, withOverrides, has, markHabits, isUpper, isDigit, CAP, UPM } from './hand.js';
import { getStyle } from './glyphs.js';
import { layout } from './layout.js';
import { penOutline, getPen, penKey, strokeInk, profileOutline } from './pen.js';

// ---------- controls ----------
// `natural(p)` gives this hand's own value when the hand doesn't carry the key (the lab reads it).
export const JOURNEY_PARAMS = [
  { key: 'mistakes', label: 'Mistakes', group: 'Journey', min: 0, max: 1, step: 0.01, format: 'pct', default: 0.3, natural: (p) => journeyAmount(p) },
];

// corrections per 100 words at amount 1 (writing-experience.md §2: a first draft has 5–15)
const RATE = 0.38;

// ---------- the writer's correction habits ----------
const STRIKES = ['line', 'double', 'wave', 'loops', 'scribble'];
// pens that blot (wet nibs) and pens that run dry; pointed dip pens already run dry in pen.js's inkWalker
const BLOT_P = { fountain: 0.35, pointed: 0.45, italic: 0.3, felt: 0.12, gel: 0.08, ballpoint: 0.05, pencil: 0, classic: 0.08 };
const DRY_P = { ballpoint: 0.32, felt: 0.38, fountain: 0.28, gel: 0.14, italic: 0.16, pointed: 0, pencil: 0, classic: 0.1 };

const habitCache = new WeakMap();
// How this writer corrects (writing-experience.md §5.6). Fixed per seed; follows neatness and hurry,
// so the same writer always strikes the same way. `hurry` is read from p when the hand has one.
export function fixHabits(p) {
  let H = habitCache.get(p);
  if (H) return H;
  const r = rng('fix:' + p.seed);
  const u = Array.from({ length: 32 }, () => r()); // drawn up front: overriding one input never reshuffles the rest
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
    mix, pen,
  };
  habitCache.set(p, H);
  return H;
}

// This writer's natural amount of mistakes (0..1): careless and hurried hands make more.
export function journeyAmount(p) {
  const H = fixHabits(p);
  const neat = clamp(p.neatness == null ? 0.6 : p.neatness, 0, 1);
  const u = rng('fix:' + p.seed + ':amount')();
  return clamp(0.05 + 0.36 * (1 - neat) + 0.22 * H.hurry + 0.1 * (u - 0.5), 0.03, 0.6);
}

// ---------- letters people confuse ----------
// [wrong, right, how well the right letter covers the wrong one when written over it]
const COVER = [
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
const COVER_BY_RIGHT = new Map();
for (const [w, rt, q] of COVER) { if (!COVER_BY_RIGHT.has(rt)) COVER_BY_RIGHT.set(rt, []); COVER_BY_RIGHT.get(rt).push([w, q]); }
// QWERTY neighbours: the slip a typist's mind makes, used only where the letters get struck
const KEYS = { q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol', a: 'qsz', s: 'adwx', d: 'sfec', f: 'dgrv', g: 'fhtb', h: 'gjyn', j: 'hkum', k: 'jli', l: 'ko', z: 'ax', x: 'zcs', c: 'xvd', v: 'cbf', b: 'vng', n: 'bmh', m: 'nj' };
// small words people leave out (then add above the line) or write twice
const OMIT = new Set(['the', 'a', 'to', 'of', 'and', 'in', 'is', 'it', 'that', 'very', 'not', 'so', 'at', 'on', 'for', 'you', 'just', 'all', 'too', 'really', 'still', 'with', 'my']);
const DOUBLE = new Set(['the', 'a', 'to', 'of', 'and', 'in', 'that', 'i', 'is', 'it', 'you', 'we', 'on', 'at', 'for', 'with']);
const EMPH = new Set(['very', 'really', 'so', 'never', 'always', 'must', 'all', 'love', 'please', 'promise', 'best', 'every', 'not', 'only', 'soon']);
const VOWELS = 'aeiou';
const isLetter = (c) => /\p{L}/u.test(c);
const isLowerL = (c) => /\p{Ll}/u.test(c);

// plausible misspellings of a word (as code points); each { w, weight }
function misspellings(cps) {
  const n = cps.length, s = cps.join(''), out = new Map();
  const add = (arr, wt) => { const w = arr.join(''); if (w !== s && arr.length >= 2) out.set(w, (out.get(w) || 0) + wt); };
  const at = (i, ...ins) => [...cps.slice(0, i), ...ins, ...cps.slice(i + 1)];
  for (let i = 1; i < n; i++) if (cps[i] === cps[i - 1] && isLowerL(cps[i])) add(at(i), 2.4);              // tomorrow → tomorow
  for (let i = 0; i < n - 1; i++) { const ab = cps[i] + cps[i + 1]; if (ab === 'ie' || ab === 'ei') add(at(i, cps[i + 1], cps[i]).filter((_, k) => k !== i + 2), 2.2); } // receive → recieve
  for (let i = 1; i < n - 1; i++) {                                                                       // the → teh, quite → quiet
    if (isLowerL(cps[i]) && isLowerL(cps[i + 1]) && cps[i] !== cps[i + 1]) add([...cps.slice(0, i), cps[i + 1], cps[i], ...cps.slice(i + 2)], i === 1 ? 0.25 : i >= n - 3 ? 0.7 : 0.45);
  }
  const VSWAP = { a: 'e', e: 'a', i: 'e' };
  for (let i = 2; i < n - 1; i++) {                                                                       // separate → seperate
    const alt = VSWAP[cps[i]];
    if (alt && !VOWELS.includes(cps[i - 1]) && !VOWELS.includes(cps[i + 1]) && isLowerL(cps[i - 1]) && isLowerL(cps[i + 1])) add(at(i, alt), 0.8);
  }
  for (let i = 2; i < n - 1; i++) {                                                                       // a consonant doubled: occasion → occassion
    if ('bcdfglmnprst'.includes(cps[i]) && VOWELS.includes(cps[i - 1]) && VOWELS.includes(cps[i + 1])) add(at(i, cps[i], cps[i]), 0.7);
  }
  if (n >= 4 && cps[n - 1] === 'l' && VOWELS.includes(cps[n - 2])) add([...cps, 'l'], 0.7);              // until → untill
  for (let i = 2; i < n - 1; i++) {                                                                       // a cluster loses a letter: friend → frend
    if (isLowerL(cps[i]) && !VOWELS.includes(cps[i]) && !VOWELS.includes(cps[i - 1]) && isLowerL(cps[i - 1]) && cps[i - 1] !== cps[i]) add(at(i).filter((_, k) => k !== i), 0.6);
  }
  if (n >= 5 && cps[n - 1] === 'e' && !VOWELS.includes(cps[n - 2])) add(cps.slice(0, n - 1), 0.5);         // write → writ
  return [...out].map(([w, weight]) => ({ w, weight }));
}

// ---------- the text, as words ----------
function tokenize(text) {
  const paras = text.split('\n');
  const words = [], tokens = [];
  let off = 0;
  paras.forEach((para, pi) => {
    const list = [];
    for (const t of para.match(/ +|[^ ]+/g) || []) {
      const tok = { text: t, start: off, para: pi, space: t[0] === ' ' };
      off += t.length;
      tokens.push(tok);
      if (tok.space) continue;
      const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(t);
      Object.assign(tok, { lead: m[1], core: m[2], trail: m[3], tok: tokens.length - 1 });
      list.push(tok);
    }
    list.forEach((w, i) => { w.inPara = i; w.paraLen = list.length; words.push(w); });
    off += 1; // the '\n'
  });
  const seen = new Map();
  words.forEach((w, i) => {
    w.i = i;
    w.coreStart = w.start + w.lead.length;
    const n = seen.get(w.text) || 0; seen.set(w.text, n + 1);
    w.key = w.text + '#' + n; // which occurrence of this word: stable when other words are edited
  });
  return { paras, words, tokens };
}

// Where each word falls on its line, roughly (a greedy wrap on the hand's own letter widths), so
// mistakes can favour line ends. Only a weight: the real breaks come from layout().
const advCache = new WeakMap();
function estimateLines(p, words, maxW) {
  let cache = advCache.get(p);
  if (!cache) { cache = new Map(); advCache.set(p, cache); }
  const adv = (ch) => {
    let a = cache.get(ch);
    if (a == null) { a = has(p, ch) ? makeGlyph(p, ch, null).advance : 560; cache.set(ch, a); }
    return a;
  };
  const space = (p.space || 300) * (p.wordSpace || 1);
  let line = 0, x = 0, para = -1;
  for (const w of words) {
    if (w.para !== para) { if (para >= 0) line += w.para - para; x = 0; para = w.para; }
    let width = 0;
    for (const ch of w.text) width += adv(ch);
    if (x > 0 && x + space + width > maxW * 0.97) { line++; x = 0; }
    w.linePos = clamp(x / maxW, 0, 1);
    w.estLine = line;
    x += (x > 0 ? space : 0) + width;
  }
  words.forEach((w, i) => { const n = words[i + 1]; w.lineEnd = !n || n.estLine !== w.estLine; });
}

// ---------- planning: which mistakes, where ----------
// Every candidate gets a fixed key u / weight; a candidate happens when key < amount × RATE. So more
// `amount` only ever adds mistakes, and typing elsewhere doesn't reshuffle the ones already made.
function plan(p, H, words, amount, R) {
  const cands = [];
  for (const w of words) {
    const cps = Array.from(w.core);
    const ok = cps.length >= 2 && !/[\uD800-\uDFFF]/.test(w.core) && cps.every((c) => has(p, c));
    const paraProg = w.paraLen > 1 ? w.inPara / (w.paraLen - 1) : 0.5;
    let pos = 0.7 + 0.45 * paraProg + 0.35 * w.linePos;   // tired: later in the paragraph and the line
    if (w.i === 0) pos *= 0.25;                            // the greeting
    if (w.paraLen <= 2) pos *= 0.35;                       // sign-offs and signatures
    const letters = cps.filter(isLetter).length;
    const lenF = clamp((letters - 1.5) / 4.5, 0.25, 1.5);  // longer words go wrong more
    const lc = w.core.toLowerCase();
    const add = (type, weight, extra) => {
      const r = R(type + ':' + w.key);
      const u = r();
      if (weight > 0) cands.push(Object.assign({ type, w, key: u / weight, r }, extra));
    };
    if (ok && letters >= 2) {
      // a slip: one letter becomes a similar-shaped one
      const opts = [];
      cps.forEach((c, i) => {
        for (const [wrong, q] of COVER_BY_RIGHT.get(c) || []) {
          if (!has(p, wrong)) continue;
          let wt = q;
          if (i >= cps.length - 2) wt *= 1.4;                                   // word endings
          if ((i > 0 && cps[i - 1] === c) || cps[i + 1] === c) wt *= 1.5;       // double letters
          if (i === 0) wt *= isUpper(c) ? 0.9 : 0.5;
          opts.push({ i, wrong, q, weight: wt });
        }
      });
      if (opts.length) add('slip', H.mix.slip * lenF * pos * clamp(0.6 + 0.15 * opts.length, 0.6, 1.3), { opts });
    }
    if (ok && letters >= 4 && cps.every((c) => isLetter(c) || c === '\'' || c === '’')) {
      const ms = misspellings(cps);
      if (ms.length) add('misspell', H.mix.misspell * lenF * pos * (/(\p{L})\1/u.test(w.core) || /ie|ei/.test(lc) ? 1.5 : 1), { ms });
    }
    if (ok && letters >= 3) add('falseStart', H.mix.falseStart * lenF * pos);
    if (OMIT.has(lc) && !w.lead && !w.trail && w.inPara > 0 && w.inPara < w.paraLen - 1 && w.estLine > 0 && cps.every((c) => has(p, c))) {
      add('omit', H.mix.omit * pos * 1.4);
    }
    if (DOUBLE.has(lc) && !w.lead && !w.trail && w.inPara > 0 && w.inPara < w.paraLen - 1 && cps.every((c) => has(p, c))) {
      add('double', H.mix.double * pos * (w.lineEnd ? 2.6 : 0.7));
    }
  }
  const thr = amount * RATE;
  cands.sort((a, b) => a.key - b.key || a.w.i - b.w.i);
  const taken = new Set(), fixes = [];
  for (const c of cands) {
    if (c.key >= thr) break;
    const i = c.w.i;
    if (taken.has(i) || taken.has(i - 1) || taken.has(i + 1)) continue; // one fix per word, with a word of room
    const f = detail(p, H, c, words);
    if (!f) continue;
    taken.add(i);
    fixes.push(f);
  }
  fixes.sort((a, b) => a.w.i - b.w.i);
  let scribbles = 0; // a page of black blots reads as noise: after two, the writer uses a lighter stroke
  for (const f of fixes) if (f.how === 'scribble' && ++scribbles > 2) f.how = H.strikeAlt === 'scribble' ? 'wave' : H.strikeAlt;
  return fixes;
}

// Decide exactly what was written and how it gets fixed.
function detail(p, H, c, words) {
  const { w, r } = c;
  const cps = Array.from(w.core);
  const strikeHow = (len) => (r() < H.scribbleWords ? 'scribble' : len >= 8 && r() < 0.35 ? H.strikeAlt : H.strike);
  if (c.type === 'slip') {
    const o = r.weighted(c.opts);
    if (r() < H.overwrite * (o.q >= 0.75 ? 1 : o.q)) {
      return { type: 'slip', how: 'over', w, i: o.i, wrong: o.wrong, right: cps[o.i], blot: r() < H.blot };
    }
    // stopped as soon as the wrong letter was down: strike what's there, start the word again
    let wrong = o.wrong;
    if (r() < 0.45 && cps[o.i + 1] && cps[o.i + 1] !== cps[o.i] && has(p, cps[o.i + 1])) wrong = cps[o.i + 1]; // writing ahead
    const prefix = cps.slice(0, o.i).join('') + wrong;
    return { type: 'slip', how: strikeHow(prefix.length), w, i: o.i, wrong: prefix, blot: r() < H.blot * 0.6 };
  }
  if (c.type === 'misspell') {
    const m = r.weighted(c.ms);
    if (![...m.w].every((ch) => has(p, ch))) return null;
    return { type: 'misspell', how: strikeHow(m.w.length), w, wrong: m.w, blot: r() < H.blot };
  }
  if (c.type === 'falseStart') {
    const next = words[w.i + 1];
    const nc = next && next.para === w.para ? Array.from(next.core) : [];
    let prefix = null, ahead = false;
    if (nc.length >= 2 && nc.slice(0, 2).every(isLetter) && nc.every((ch) => has(p, ch)) && r() < 0.6) {
      // writing ahead: the hand starts the next word before this one
      const k = Math.min(nc.length, 2 + (r() < 0.4 ? 1 : 0));
      const pre = nc.slice(0, k).join('');
      if (!w.core.toLowerCase().startsWith(pre.toLowerCase())) { prefix = pre; ahead = true; }
    }
    if (!prefix) {
      const k = 2 + Math.floor(r() * Math.min(2, Math.max(1, cps.length - 3)));
      const pre = cps.slice(0, k);
      if (isUpper(pre[0]) && has(p, pre[0].toLowerCase()) && r() < 0.5) pre[0] = pre[0].toLowerCase(); // started small, wanted a capital
      else {
        const nb = KEYS[pre[k - 1]];
        const alt = cps[k] && cps[k] !== pre[k - 1] && r() < 0.5 ? cps[k] : nb ? nb[Math.floor(r() * nb.length)] : null;
        if (alt && has(p, alt)) pre[k - 1] = alt;
      }
      if (!pre.every((ch) => has(p, ch)) || !pre.every(isLetter)) return null;
      prefix = pre.join('');
    }
    return { type: 'falseStart', how: strikeHow(2), w, wrong: prefix, ahead, blot: r() < H.blot * 0.5 };
  }
  if (c.type === 'omit') return { type: 'omit', how: H.caret, w };
  if (c.type === 'double') return { type: 'double', how: H.strike === 'scribble' && r() < 0.5 ? 'line' : H.strike, w, second: r() < 0.7 };
  return null;
}

// ---------- geometry helpers (page space: x right, y down; glyphs are y-up) ----------
function spanOf(items) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of items) {
    if (!it.g) continue;
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
function baselineOf(items) {
  let sx = 0, sy = 0, sr = 0, n = 0;
  for (const it of items) { sx += it.x; sy += it.y; sr += it.rot || 0; n++; }
  const mx = sx / n, my = sy / n, t = Math.tan(sr / n);
  return (x) => my - t * (x - mx);
}
const scaleOf = (items) => { let s = 0, n = 0; for (const it of items) if (it.g && it.g.pose) { s += it.g.pose.scale || 1; n++; } return n ? s / n : 1; };

// Run every stroke's centerline through `f` and the pen again (so a scaled or rotated glyph keeps
// this pen's width and ink). `extra(strokes)` may add strokes (a retrace).
function repen(p, g, f, seed, extra) {
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
const rotScale = (a, s) => { const c = Math.cos(a) * s, n = Math.sin(a) * s; return (q) => [c * q[0] - n * q[1], n * q[0] + c * q[1]]; };

// A copy of g with each stroke's ink profile changed by f(profile, strokeIndex) (density, width).
function reink(p, g, f) {
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

const MARK_VARIANT = { id: 'correction', source: { name: 'Correction mark', credit: 'Seedhand engine (writing-experience.md §5)' } };

// one page item made of pen strokes given in page coordinates
function markItem(p, kind, strokesPage, ref, o) {
  const ox = strokesPage[0][0][0], oy = strokesPage[0][0][1];
  const strokes = [];
  strokesPage.forEach((pts, i) => {
    if (pts.length < 2) return;
    const center = pts.map(([X, Y]) => [X - ox, oy - Y]);
    const c = penOutline(o.pen || p, center, o.seed + i * 3.1);
    if (!c) return;
    if (o.ink) for (let k = 0; k < c.ink.n; k++) c.ink.d[k] *= o.ink;
    strokes.push({ center, contour: c, dot: false, mark: kind, delayed: !!o.delayed });
  });
  if (!strokes.length) return null;
  return {
    kind: 'glyph', ch: '', x: ox, y: oy, rot: 0,
    g: { advance: 0, contours: strokes.map((s) => s.contour), strokes, variant: MARK_VARIANT, pose: { slant: 0, scale: 1, squeeze: 1 } },
    charIndex: -1, inkIndex: ref.inkIndex, line: ref.line, para: ref.para, word: ref.word, wk: o.wk || ref.wk,
    tempo: (ref.tempo || 1) * (o.tempo || 1), role: 'mark', mark: kind, fix: o.fix,
  };
}

// ---------- the marks ----------
// Strike-through centerlines over [x0, x1] (writing-experience.md §5.1). base(x) = baseline (page y),
// h = height above it, xh = x-height here, W = pen width. Returns strokes (arrays of page points).
function strikeStrokes(H, N, how, x0, x1, base, h, xh, W, r) {
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
      // a prolate trochoid, the cursive "eeee" coil (loops counter-clockwise, advancing right)
      // loops like small e's: taller than wide, overlapping a little: "eeee"
      const adv = (0.36 + 0.12 * r()) * xh, ry = (0.27 + 0.08 * r()) * xh, rx = (0.16 + 0.06 * r()) * xh, rr = adv / (2 * Math.PI);
      const T = (L / adv) * 2 * Math.PI, n = Math.ceil(T / (2 * Math.PI) * 18), pts = [];
      for (let i = 0; i <= n; i++) { const th = T * i / n, x = xs + rr * th + rx * Math.sin(th); pts.push([x, mid(x, 0) + ry * Math.cos(th) * (1 + 0.12 * N.n1(th * 0.4 + nOff))]); }
      return [pts];
    }
    case 'scribble': {
      // fast zig-zags until the word is gone: right across the word, then back at a slant
      const dx = clamp(2.4 * W, 0.05 * UPM, 0.14 * UPM); // dense enough to hide the word, open enough to read as zig-zags
      const top = -1.02 * xh, bot = 0.1 * xh;
      const pass = (a, b, lean, k) => {
        const half = Math.max(3, Math.round(Math.abs(b - a) / dx)), n = half * 10, pts = [];
        for (let i = 0; i <= n; i++) {
          const th = Math.PI * i / 10, u = i / n;
          const amp = 0.5 * (bot - top) * (0.88 + 0.24 * N.n1(i / 13 + k * 7 + nOff));
          const cy = 0.5 * (top + bot) + 0.06 * xh * N.n1(i / 29 + k * 3);
          const off = amp * Math.cos(th);
          const x = a + (b - a) * u + lean * off;
          pts.push([x, base(x) + cy + off]);
        }
        return pts;
      };
      const lean = Math.tan((20 + 18 * r()) * DEG);
      const s = pass(xs, xe, 0.15, 1).concat(pass(xe, xs, lean, 2).slice(1));
      return [r() < 0.4 * (1 - H.tidy) ? s.concat(pass(xs, xe, -lean * 0.6, 3).slice(1)) : s];
    }
    default: return [line(0, 0, 1)]; // 'line': one fast, firm stroke, slightly rising
  }
}

function underlineStrokes(H, x0, x1, base, xh, r) {
  const xs = x0 - (0.02 + 0.04 * r()) * UPM, xe = x1 + (0.04 + 0.1 * r()) * UPM, L = Math.max(1, xe - xs);
  const drop = (0.17 + 0.1 * r()) * xh, tilt = Math.tan((0.5 + 2.5 * r()) * DEG);
  const n = Math.max(6, Math.ceil(L / 14)), pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = xs + u * L;
    let y = base(x) + drop - tilt * (x - xs) + 0.012 * L * Math.sin(Math.PI * u) * (H.tidy - 0.5);
    if (H.underlineSwoosh) y -= 0.3 * xh * smooth((u - 0.72) / 0.28) * smooth((u - 0.72) / 0.28); // the end flicks up
    pts.push([x, y]);
  }
  return [pts];
}

// ‸ in a gap (writing-experience.md §5.3): 'below' = a caret standing on the baseline, pointing up at
// the insertion; 'above' = a ∨ between this line and the insertion; 'slash' = one stroke up to it.
// yIns = the insertion's baseline (page y) over the gap.
function caretStrokes(how, cx, base, xh, yIns, r) {
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

// a blot where the wet pen rested (writing-experience.md §5.5), at page point (X, Y): a lopsided drop
// with a short tail where the nib dragged off, not a round dot (that would read as a full stop)
function blotItem(p, X, Y, ref, r, fix, wk) {
  const pen = getPen(p);
  const W = p.penWidth * (pen.wScale || 1);
  const a = (r() * 2 - 1) * 0.9 + (r() < 0.5 ? 0 : Math.PI), L = W * (1.3 + 0.9 * r()), pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8, wob = 0.18 * W * Math.sin(u * 5 + fix);
    pts.push([Math.cos(a) * L * u - Math.sin(a) * wob, Math.sin(a) * L * u + Math.cos(a) * wob]);
  }
  const pr = pen.profile(p, pts, 77 + fix * 5.3, null);
  if (!pr) return null;
  const k = 2.1 + 1.1 * r();
  for (let i = 0; i < pr.n; i++) {
    const u = pr.s[i] / (pr.len || 1);
    pr.w[i] = W * lerp(k, 0.55, smooth(u * 1.3)) * (0.9 + 0.2 * Math.sin(i * 2.3 + fix)); // fat head, thin tail
    pr.d[i] *= 1.5;
  }
  const c = profileOutline(pr);
  c.ink = pr;
  const st = { center: pts, contour: c, dot: false, mark: 'blot', delayed: true };
  return {
    kind: 'glyph', ch: '', x: X, y: Y, rot: 0,
    g: { advance: 0, contours: [c], strokes: [st], variant: MARK_VARIANT, pose: { slant: 0, scale: 1, squeeze: 1 } },
    charIndex: -1, inkIndex: ref.inkIndex, line: ref.line, para: ref.para, word: ref.word, wk,
    tempo: ref.tempo || 1, role: 'mark', mark: 'blot', fix,
  };
}

// ---------- the journey ----------
const PS_RE = /^\s*(p\.\s?s\b|ps\b)/i;

// p: hand params; text: what the note says; layoutOpts: as layout() (maxWidth, lineHeight, ruled, ...,
// plus optional pageHeight in font units: a P.S. then squeezes into the room that is left).
// opts: { amount (0..1; default p.mistakes, else journeyAmount(p)), seed (which draft; default '') }
export function writeWithJourney(p, text, layoutOpts = {}, opts = {}) {
  const amount = clamp(opts.amount != null ? +opts.amount : p.mistakes != null ? +p.mistakes : journeyAmount(p), 0, 1);
  const intended = String(text == null ? '' : text).normalize('NFC');
  if (!(amount > 0)) return clean(p, text, layoutOpts, intended, amount);
  const H = fixHabits(p);
  const draft = opts.seed == null ? '' : String(opts.seed);
  const R = (k) => rng('journey:' + p.seed + ':' + draft + ':' + k);
  const maxW = layoutOpts.maxWidth || 12000;

  // ----- split off a trailing P.S. (written smaller, squeezed in at the end) -----
  const paras = intended.split('\n');
  let psAt = -1;
  for (let i = paras.length - 1; i > 0; i--) if (PS_RE.test(paras[i])) { psAt = i; break; }
  if (psAt > 0 && !H.ps) psAt = -1;
  let mainParas = psAt > 0 ? paras.slice(0, psAt) : paras;
  let trailingEmpty = 0;
  if (psAt > 0) while (mainParas.length > 1 && mainParas[mainParas.length - 1].trim() === '') { mainParas = mainParas.slice(0, -1); trailingEmpty++; }
  const mainText = mainParas.join('\n');
  const psStart = psAt > 0 ? paras.slice(0, psAt).join('\n').length + 1 : -1;
  const psText = psAt > 0 ? paras.slice(psAt).join('\n') : '';

  // ----- plan -----
  const { words, tokens } = tokenize(mainText);
  estimateLines(p, words, maxW);
  const fixes = plan(p, H, words, amount, R);
  const fixOf = new Map(fixes.map((f, n) => { f.n = n; return [f.w.i, f]; }));
  // emphasis: underline a word before "!" or a strong little word, where this writer does that
  const under = new Set();
  let lastUnderPara = -1;
  for (const w of words) {
    const lc = w.core.toLowerCase();
    if (fixOf.has(w.i) || w.para === lastUnderPara || !w.core || ![...w.core].every((c) => has(p, c))) continue;
    const strong = /!/.test(w.trail) ? 1 : EMPH.has(lc) ? 0.45 : 0;
    if (strong && R('u:' + w.key)() < H.underline * strong * Math.min(1, 2.5 * amount)) { under.add(w.i); lastUnderPara = w.para; }
  }
  // the pen running dry: a few words fade, then it restarts darker (ballpoints may go over the faint word)
  let dry = null;
  if (words.length >= 14 && R('dry')() < H.dry * Math.min(1, 2 * amount)) {
    const dr = R('dry:where');
    const k = 3 + Math.floor(dr() * 3);
    const a = Math.floor(words.length * (0.35 + 0.4 * dr()));
    if (a + k < words.length) dry = { a, b: a + k, retrace: H.dryRetrace };
  }

  // ----- what was actually written, in the order it was written -----
  const acts = [];
  let wtext = '';
  const wmap = []; // per UTF-16 unit of wtext: { role, at (offset in `intended`, or -1), fix, wi }
  const write = (str, role, at, fix, wi) => {
    if (!str) return;
    const a = { t: 'write', stream: 'main', ws: wtext.length, text: str };
    for (let j = 0; j < str.length; j++) wmap.push({ role, at: at < 0 ? -1 : at + j, fix: fix == null ? -1 : fix, wi: wi == null ? -1 : wi });
    wtext += str;
    a.we = wtext.length;
    acts.push(a);
  };
  const pending = []; // forgotten words, added once the sentence is done
  const flush = () => { while (pending.length) acts.push(pending.shift()); };
  const skipSpace = new Set();
  for (const f of fixes) if (f.type === 'omit') skipSpace.add(f.w.tok + 1); // the forgotten word takes its space with it
  let lastPara = 0, lastSpaceAct = null;
  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti];
    if (t.para !== lastPara) {
      flush();
      for (let k = lastPara; k < t.para; k++) { acts.push({ t: 'break', stream: 'main', ws: wtext.length, we: wtext.length + 1 }); wtext += '\n'; wmap.push({ role: 'break', at: -1, fix: -1, wi: -1 }); }
      lastPara = t.para;
    }
    if (t.space) {
      if (skipSpace.has(ti)) continue;
      write(t.text, 'main', t.start);
      lastSpaceAct = acts[acts.length - 1];
      continue;
    }
    const w = t, f = fixOf.get(w.i);
    if (dry && w.i === dry.b) acts.push({ t: 'pen', kind: 'restart', dry });
    if (!f) {
      write(w.text, 'main', w.start, null, w.i);
      if (under.has(w.i)) acts.push({ t: 'underline', wi: w.i, ws: acts[acts.length - 1].ws + w.lead.length, we: acts[acts.length - 1].ws + w.lead.length + w.core.length });
    } else if (f.type === 'slip' && f.how === 'over') {
      const cps = Array.from(w.core);
      const pre = cps.slice(0, f.i).join(''), post = cps.slice(f.i + 1).join('');
      write(w.lead + pre, 'main', w.start, null, w.i);
      const at = w.coreStart + pre.length;
      write(f.wrong, 'wrong', -1, f.n, w.i);
      const wAt = acts[acts.length - 1].ws;
      acts.push({ t: 'over', fix: f.n, wAt, ch: f.right, at, ctx: { prev: cps[f.i - 1] || null, next: cps[f.i + 1] || null, index: f.i, wordStart: f.i === 0, wordEnd: f.i === cps.length - 1 } });
      write(post + w.trail, 'main', at + f.right.length, null, w.i);
    } else if (f.type === 'omit') {
      pending.push({ t: 'insert', fix: f.n, after: lastSpaceAct, text: w.text + tokens[w.tok + 1].text, at: w.start, w });
    } else if (f.type === 'double') {
      if (f.second) {
        write(w.text, 'main', w.start, null, w.i);
        write(' ' + w.text, 'struck', -1, f.n, w.i);
        const a = acts[acts.length - 1];
        acts.push({ t: 'strike', fix: f.n, how: f.how, ws: a.ws, we: a.we, why: 'doubled' });
      } else {
        write(w.text + ' ', 'struck', -1, f.n, w.i);
        const a = acts[acts.length - 1];
        acts.push({ t: 'strike', fix: f.n, how: f.how, ws: a.ws, we: a.we, why: 'doubled' });
        write(w.text, 'main', w.start, null, w.i);
      }
    } else {
      // misspelt, a slip that was stopped, or a false start: strike what's there, write the word
      write(w.lead, 'main', w.start, null, w.i);
      write(f.wrong + ' ', 'struck', -1, f.n, w.i);
      const a = acts[acts.length - 1];
      acts.push({ t: 'strike', fix: f.n, how: f.how, ws: a.ws, we: a.we, why: f.type === 'misspell' ? 'misspelt' : f.type === 'slip' ? 'slip' : 'false start' });
      write(w.core + w.trail, 'main', w.coreStart, null, w.i);
    }
    if (/[.!?]/.test(w.trail) || w.inPara === w.paraLen - 1) flush();
  }
  flush();
  for (let k = lastPara; k < mainParas.length - 1; k++) { acts.push({ t: 'break', stream: 'main', ws: wtext.length, we: wtext.length + 1 }); wtext += '\n'; wmap.push({ role: 'break', at: -1, fix: -1, wi: -1 }); }
  // the P.S.
  if (psAt > 0) {
    for (let k = 0; k < trailingEmpty + 1; k++) acts.push({ t: 'break', stream: null });
    acts.push({ t: 'move', to: 'ps' });
    const pps = psText.split('\n');
    pps.forEach((ln, k) => {
      if (k) acts.push({ t: 'break', stream: 'ps' });
      if (ln) acts.push({ t: 'write', stream: 'ps', text: ln, ps: true });
    });
  }

  // ----- lay it out, then add the corrections in writing order -----
  const page0 = layout(p, wtext, layoutOpts);
  const actAt = new Int32Array(wtext.length + 1).fill(-1);
  acts.forEach((a, n) => { if (a.stream === 'main' && a.ws != null) for (let o = a.ws; o < a.we; o++) actAt[o] = n; });
  const buckets = acts.map(() => []);
  const byFix = new Map(); // fix -> its struck / wrong items
  const byWord = new Map(); // intended word index -> its written items
  let lastA = 0;
  for (const it0 of page0.items) {
    const c = it0.charIndex;
    let a = c >= 0 && c < wtext.length ? actAt[c] : -1;
    if (a < 0 || it0.synthetic) a = lastA;
    lastA = a;
    const m = c >= 0 && c < wmap.length ? wmap[c] : { role: 'main', at: -1, fix: -1, wi: -1 };
    const it = Object.assign({}, it0, { charIndex: m.at, written: c, wk: 'w' + it0.word });
    if (m.role !== 'main') it.role = it0.synthetic ? 'hyphen' : m.role;
    if (m.fix >= 0) { it.fix = m.fix; if (!byFix.has(m.fix)) byFix.set(m.fix, []); byFix.get(m.fix).push(it); }
    if (m.wi >= 0) { if (!byWord.has(m.wi)) byWord.set(m.wi, []); byWord.get(m.wi).push(it); }
    buckets[a].push(it);
  }
  const xh0 = page0.xh || p.xHeight * CAP;
  const pen = getPen(p);
  const W = p.penWidth * (pen.wScale || 1);
  const firm = withOverrides(p, { pressure: clamp((p.pressure || 0.4) * 1.2 + 0.05, 0, 1) }); // people cross out firmly
  const heavy = withOverrides(p, { penWidth: p.penWidth * H.overWeight, pressure: clamp((p.pressure || 0.4) + 0.2, 0, 1) });
  const out = [];
  const glyphsOf = (list) => list.filter((it) => it.kind === 'glyph' && it.g);
  const lineItems = new Map();
  for (const it of page0.items) { if (!lineItems.has(it.line)) lineItems.set(it.line, []); lineItems.get(it.line).push(it); }
  const psMisses = [];

  acts.forEach((A, n) => {
    if (A.t === 'write' || A.t === 'break') { if (A.stream === 'main') out.push(...buckets[n]); return; }
    if (A.t === 'strike') {
      const struck = glyphsOf((byFix.get(A.fix) || []).filter((it) => it.role === 'struck'));
      if (!struck.length) return;
      const f = fixes[A.fix], r = R('strike:' + f.w.key);
      const lines = new Map();
      for (const it of struck) { if (!lines.has(it.line)) lines.set(it.line, []); lines.get(it.line).push(it); }
      let lastEnd = null;
      for (const run of lines.values()) {
        const sp = spanOf(run), base = baselineOf(run), xh = xh0 * scaleOf(run);
        const small = run.some((it) => /\p{Ll}/u.test(it.ch));
        const h = small ? H.strikeY * xh * (1 + 0.08 * r.gauss()) : 0.45 * CAP * scaleOf(run);
        const strokes = strikeStrokes(H, p.noise, A.how, sp.x0, sp.x1, base, h, xh, W, r);
        const ref = run[run.length - 1];
        const mi = markItem(firm, A.how === 'scribble' ? 'scribble' : 'strike', strokes, ref, { seed: 311 + A.fix * 7.7, delayed: true, fix: A.fix, tempo: A.how === 'scribble' ? 2.6 : 1.25 });
        if (mi) out.push(mi);
        if (!lastEnd) lastEnd = { pt: strokes[0][0], ref };
      }
      if (f.blot && lastEnd) { const b = blotItem(p, lastEnd.pt[0] - 0.02 * UPM, lastEnd.pt[1] + 0.25 * xh0, lastEnd.ref, r, A.fix, lastEnd.ref.wk); if (b) out.push(b); }
      return;
    }
    if (A.t === 'over') {
      const wr = glyphsOf(byFix.get(A.fix) || []).find((it) => it.role === 'wrong');
      if (!wr) return;
      const f = fixes[A.fix], r = R('over:' + f.w.key);
      const pose = wr.g.pose || {};
      const lean = clamp((pose.slant == null ? p.slant || 0 : pose.slant) - (p.slant || 0), -6, 6);
      const g0 = makeGlyph(heavy, A.ch, { seed: 'fix:over:' + p.seed + ':' + f.w.key, amount: 1, slant: lean, scale: (pose.scale || 1) * H.overSize }, A.ctx);
      // retrace: go over the main stroke again, slightly off
      const main = g0.strokes.reduce((b, st, i) => (!st.dot && st.center.length > (b < 0 ? 0 : g0.strokes[b].center.length) ? i : b), -1);
      const again = main >= 0 && r() < H.retrace;
      const off = (r() - 0.5) * 0.03 * UPM;
      let g = repen(heavy, g0, rotScale(wr.rot || 0, 1), 501 + A.fix * 3.3, again ? (src) => {
        const st = src[main];
        const dup = Object.assign({}, st, { center: st.center.map((q) => [q[0] + off, q[1] - off * 0.6]) });
        return [...src.slice(0, main + 1), dup, ...src.slice(main + 1)];
      } : null);
      for (const st of g.strokes) if (st.contour.ink) for (let k = 0; k < st.contour.ink.n; k++) st.contour.ink.d[k] *= H.overInk;
      const a = spanOf([Object.assign({}, wr, { x: 0, y: 0 })]), b = spanOf([{ x: 0, y: 0, g }]);
      const dx = (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2 + r.gauss() * 0.035 * UPM; // a little off, so the old letter shows
      out.push(Object.assign({}, wr, { ch: A.ch, g, x: wr.x + dx, y: wr.y + r.gauss() * 0.012 * UPM, charIndex: A.at, role: 'over', tempo: (wr.tempo || 1) / 1.3, written: undefined }));
      if (f.blot) { const bl = blotItem(p, wr.x + (a.x0 + a.x1) / 2 + (r() - 0.3) * 0.15 * UPM, wr.y - (0.2 + 0.5 * r()) * xh0, wr, r, A.fix, wr.wk); if (bl) out.push(bl); }
      return;
    }
    if (A.t === 'underline') {
      const run = glyphsOf(byWord.get(A.wi) || []).filter((it) => it.written >= A.ws && it.written < A.we);
      if (!run.length) return;
      const r = R('ul:' + A.wi);
      const sp = spanOf(run), base = baselineOf(run), xh = xh0 * scaleOf(run);
      const mi = markItem(firm, 'underline', underlineStrokes(H, sp.x0, sp.x1, base, xh, r), run[run.length - 1], { seed: 733 + A.wi, delayed: true, fix: -1, tempo: 1.3 });
      if (mi) out.push(mi);
      return;
    }
    if (A.t === 'insert') {
      const f = fixes[A.fix], r = R('insert:' + f.w.key);
      // the gap: after the previous word, before the next one
      const prevW = glyphsOf(byWord.get(f.w.i - 1) || []), nextW = glyphsOf(byWord.get(f.w.i + 1) || []);
      if (!prevW.length) return;
      const left = prevW[prevW.length - 1];
      const ls = spanOf(prevW.filter((it) => it.line === left.line));
      const same = nextW.length && nextW[0].line === left.line;
      const gx1 = same ? spanOf(nextW.filter((it) => it.line === left.line)).x0 : Math.min(ls.x1 + 0.3 * UPM, maxW); // at a line end: just after the word
      const cx = (ls.x1 + gx1) / 2;
      const base = baselineOf(prevW.filter((it) => it.line === left.line));
      const xh = xh0 * scaleOf(prevW);
      const ref = Object.assign({}, left, { wk: 'ins' + A.fix });
      // the word, small, above the gap: as big as fits between this line's x-height and the line above
      const chars = Array.from(f.w.text);
      const pose = left.g.pose || {};
      const lean = clamp((pose.slant == null ? p.slant || 0 : pose.slant) - (p.slant || 0), -6, 6);
      const make = (s) => {
        const gl = [];
        let x = 0;
        chars.forEach((ch, i) => {
          const g = makeGlyph(p, ch, { seed: 'fix:ins:' + p.seed + ':' + f.w.key + ':' + i, amount: 1, slant: lean, scale: s, care: clamp((p.neatness || 0.6) - 0.15, 0, 1) },
            { prev: chars[i - 1] || null, next: chars[i + 1] || null, index: i, wordStart: i === 0, wordEnd: i === chars.length - 1 });
          gl.push({ g, dx: x, ch, i });
          x += g.advance;
        });
        return { gl, width: x };
      };
      let s = H.insertSize * scaleOf(prevW);
      let built = make(s);
      const half = built.width / 2;
      // the line above, over this stretch: its lowest ink
      let ceil = 0.04 * UPM; // the top of the page
      const above = (lineItems.get(left.line - 1) || []).filter((it) => it.kind === 'glyph' && it.x < cx + half + 400 && it.x > cx - half - 900);
      if (above.length) ceil = spanOf(above).y1 + 0.04 * UPM;
      // its ink stays clear of this line's x-height, with a real gap; its baseline floats ~1/3 x-height up
      const floor = base(cx) - 1.15 * xh;
      const inkOf = () => spanOf(built.gl.map((q) => ({ x: q.dx, y: 0, g: q.g })));
      let sp2 = inkOf();
      const room = floor - ceil, need = sp2.y1 - sp2.y0;
      if (need > room && need > 0) { s *= clamp(room / need, 0.72, 1); built = make(s); sp2 = inkOf(); } // cramped: smaller
      let yb = Math.min(base(cx) - xh * (1.45 + 0.15 * r()), floor - sp2.y1);
      if (yb + sp2.y0 < ceil) yb = Math.min(ceil - sp2.y0, floor - 0.5 * sp2.y1); // touch the line above before this one
      const slope = (left.rot || 0) + H.insertSlope * DEG * (0.5 + r());
      const x0 = clamp(cx - built.width / 2 + r.gauss() * 0.04 * UPM, 0, maxW - built.width); // stays on the paper
      const items = [];
      const caret = markItem(p, 'caret', caretStrokes(f.how, cx, base, xh, yb, r), ref, { seed: 911 + A.fix, fix: A.fix, tempo: 1.1, wk: 'ins' + A.fix });
      if (caret) items.push(caret);
      built.gl.forEach((q) => {
        const g = repen(p, q.g, rotScale(slope, 1), 613 + A.fix * 2.9 + q.i);
        const gx = x0 + q.dx * Math.cos(slope);
        items.push({
          kind: 'glyph', ch: q.ch, g, x: gx, y: yb - (gx - x0) * Math.tan(slope), rot: slope,
          charIndex: A.at + chars.slice(0, q.i).join('').length, inkIndex: left.inkIndex, line: left.line, para: left.para,
          word: left.word, wk: 'ins' + A.fix, tempo: (left.tempo || 1) * 1.1, role: 'insert', fix: A.fix,
        });
      });
      out.push(...items);
      return;
    }
    if (A.t === 'pen') {
      // the pen gave out on the last few words: a ballpoint writer goes over the faint word again
      const d = A.dry;
      if (!d.retrace) return;
      const last = glyphsOf(byWord.get(d.b - 1) || []);
      const r = R('retrace');
      const jx = r.gauss() * 0.01 * UPM, jy = r.gauss() * 0.01 * UPM;
      const items = last.map((it, k) => Object.assign({}, it, {
        g: repen(p, it.g, (q) => [q[0] + jx, q[1] + jy], 811 + k), role: 'retrace', charIndex: -1, wk: 'rt', tempo: (it.tempo || 1) * 1.15,
      }));
      out.push(...items);
      return;
    }
    if (A.t === 'move') out.push(...psItems());
  });

  // the dry run: fading ink, then a fresh, darker start
  if (dry) {
    const run = [];
    for (let wi = dry.a; wi < dry.b; wi++) run.push(...glyphsOf(byWord.get(wi) || []));
    const kind = H.pen;
    run.forEach((it, k) => {
      const t = run.length > 1 ? k / (run.length - 1) : 1;
      const f = lerp(1, H.dryLow, smooth(t * 1.15));
      it.g = reink(p, it.g, (pr) => {
        for (let i = 0; i < pr.n; i++) {
          let v = f;
          if (kind === 'ballpoint' || kind === 'gel') v *= 1 - 0.7 * t * smooth((p.noise.n1(pr.s[i] / 60 + k * 3.7) - 0.15) / 0.3); // skips
          pr.d[i] *= v;
        }
        if (kind === 'felt') for (let i = 0; i < pr.n; i++) pr.w[i] *= 1 - 0.12 * t; // a drying felt tip narrows
        return kind === 'felt';
      });
    });
    const fresh = [];
    for (let wi = dry.b; wi < Math.min(words.length, dry.b + 2); wi++) fresh.push(...glyphsOf(byWord.get(wi) || []));
    fresh.forEach((it, k) => {
      const f = lerp(1.28, 1.0, fresh.length > 1 ? k / (fresh.length - 1) : 1);
      it.g = reink(p, it.g, (pr, si) => {
        for (let i = 0; i < pr.n; i++) pr.d[i] *= f * (k === 0 && si === 0 && kind === 'fountain' ? 1 + 0.9 * Math.exp(-((pr.s[i] / (0.7 * (pr.w[0] || 30))) ** 2)) : 1);
      });
    });
  }

  function psItems() {
    if (!psText) return [];
    const r = R('ps');
    let s = H.psSize;
    const sub = layout(p, psText, Object.assign({}, layoutOpts, { maxWidth: maxW / s, ruled: false, start: undefined }));
    psMisses.push(...sub.misses);
    const ps = sub.items.filter((it) => it.kind === 'glyph' || it.kind === 'miss');
    if (!ps.length) return [];
    const mainSpan = spanOf(out.filter((it) => it.kind === 'glyph'));
    const sub0 = spanOf(ps);
    const fb = sub.items[0].y;
    const top = fb - sub0.y0, height = sub0.y1 - sub0.y0;
    let gap = (0.25 + 0.25 * r()) * UPM;
    const bottom = layoutOpts.pageHeight || opts.pageHeight;
    if (bottom) {
      const room = bottom - 0.25 * UPM - (mainSpan.y1 + gap);
      if (height * s > room) { gap *= 0.6; s = clamp(s * room / (height * s), 0.55, s); }
    }
    const tilt = H.psTilt * DEG * (0.4 + 0.6 * r());
    const ox = (page0.lineInfo && page0.lineInfo[0] ? page0.lineInfo[0].x0 : 0) + r() * 0.3 * UPM;
    const oy = (Number.isFinite(mainSpan.y1) ? mainSpan.y1 : 0) + gap + top * s;
    const lineBase = 1 + Math.max(-1, ...out.map((it) => it.line));
    const paraBase = 1 + Math.max(-1, ...out.map((it) => it.para));
    const f = rotScale(tilt, s);
    return ps.map((it, k) => {
      const lx = it.x * s, ly = (it.y - fb) * s;
      const X = ox + lx * Math.cos(tilt) + ly * Math.sin(tilt), Y = oy - lx * Math.sin(tilt) + ly * Math.cos(tilt);
      const o = Object.assign({}, it, { x: X, y: Y, rot: (it.rot || 0) + tilt, charIndex: it.charIndex >= 0 ? psStart + it.charIndex : -1, line: lineBase + it.line, para: paraBase + it.para, wk: 'ps' + it.word, role: 'ps', tempo: (it.tempo || 1) * 1.15 });
      if (it.g) o.g = repen(p, it.g, f, 1013 + k * 1.7);
      return o;
    });
  }

  // ----- page: renumber words (the animation groups strokes by contiguous word), size it -----
  let wordNo = -1, prevKey = null;
  for (const it of out) { if (it.wk !== prevKey) { wordNo++; prevKey = it.wk; } it.word = wordNo; delete it.wk; }
  const ink = spanOf(out.filter((it) => it.kind === 'glyph'));
  const page = Object.assign({}, page0, {
    items: out,
    height: Math.max(page0.height, Number.isFinite(ink.y1) ? ink.y1 + 0.3 * UPM : 0, ...out.filter((it) => it.role === 'ps').map((it) => it.y + 0.45 * UPM)),
    lines: 1 + Math.max(-1, ...out.map((it) => it.line)),
    words: wordNo + 1,
    misses: page0.misses.concat(psMisses),
    journey: true,
  });
  if (page0.ink && Number.isFinite(ink.x0)) page.ink = { top: Math.min(page0.ink.top, ink.y0), bottom: Math.max(page0.ink.bottom, ink.y1), left: Math.min(page0.ink.left, ink.x0), right: Math.max(page0.ink.right, ink.x1) };

  // ----- the ink log, its logical text and transcript -----
  const events = inkLog(acts, wtext, fixes, dry, byWord);
  const { text: logical, transcript, summary } = journeyText(events);
  return {
    page, intended, transcript, summary, events, amount, habits: H,
    fixes: fixes.map((f) => ({ type: f.type, how: f.how, word: f.w.core || f.w.text, wrote: f.type === 'slip' && f.how === 'over' ? f.wrong + '→' + f.right : f.type === 'omit' ? '' : f.type === 'double' ? f.w.text : f.wrong, at: f.w.start })),
    extras: { underlines: under.size, dry: !!dry, ps: psAt > 0 },
    ok: logical === intended,
  };
}

// amount 0: the fair copy, exactly as layout() writes it
function clean(p, text, layoutOpts, intended, amount) {
  const page = layout(p, text, layoutOpts);
  const events = intended ? intended.split('\n').flatMap((ln, i) => [...(i ? [{ t: 'break' }] : []), ...(ln ? [{ t: 'write', text: ln }] : [])]) : [];
  return { page, intended, transcript: intended, summary: '', events, amount, habits: fixHabits(p), fixes: [], extras: { underlines: 0, dry: false, ps: false }, ok: true };
}

// Turn the writing actions into the ink log of writing-experience.md §4.1. Glyph ids count every
// character written (spaces too; a break is not a character), in the order they were written.
function inkLog(acts, wtext, fixes, dry, byWord) {
  const ev = [];
  const gidAt = new Map(); // main-stream offset -> glyph id
  let next = 0;
  const pushWrite = (text) => {
    const last = ev[ev.length - 1];
    if (last && last.t === 'write') last.text += text; else ev.push({ t: 'write', text });
  };
  const idRange = (ws, we) => { let a = null, b = null; for (let o = ws; o < we; o++) if (gidAt.has(o)) { if (a == null) a = gidAt.get(o); b = gidAt.get(o); } return [a, b]; };
  const wordRange = (wi) => {
    const its = (byWord.get(wi) || []).filter((it) => it.written != null);
    if (!its.length) return [null, null];
    let a = Infinity, b = -Infinity;
    for (const it of its) { const g = gidAt.get(it.written); if (g != null) { if (g < a) a = g; if (g > b) b = g; } }
    return a <= b ? [a, b] : [null, null];
  };
  for (const A of acts) {
    switch (A.t) {
      case 'write': {
        if (A.stream === 'main') {
          for (let o = A.ws; o < A.we;) { gidAt.set(o, next++); o += wtext.codePointAt(o) > 0xffff ? 2 : 1; }
        } else next += Array.from(A.text).length;
        pushWrite(A.text);
        break;
      }
      case 'break': ev.push({ t: 'break' }); break;
      case 'strike': { const [from, to] = idRange(A.ws, A.we); if (from != null) ev.push({ t: 'strike', from, to, how: A.how, why: A.why }); break; }
      case 'over': { const at = gidAt.get(A.wAt); if (at != null) ev.push({ t: 'over', at, ch: A.ch }); break; }
      case 'underline': { const [from, to] = idRange(A.ws, A.we); if (from != null) ev.push({ t: 'underline', from, to }); break; }
      case 'insert': {
        const after = A.after ? gidAt.get(A.after.we - 1) : null;
        if (after == null) break;
        ev.push({ t: 'insert', after, text: A.text, where: 'above' });
        next += Array.from(A.text).length;
        break;
      }
      case 'pen': {
        const [from] = wordRange(A.dry.a), [, to] = wordRange(A.dry.b - 1);
        if (from != null) ev.push({ t: 'pen', kind: 'dry', from, to });
        if (A.dry.retrace) { const [a, b] = wordRange(A.dry.b - 1); if (a != null) ev.push({ t: 'pen', kind: 'retrace', from: a, to: b }); }
        ev.push({ t: 'pen', kind: 'restart' });
        break;
      }
      case 'move': ev.push({ t: 'move', to: 'ps' }); break;
    }
  }
  void fixes; void dry;
  return ev;
}

// Replay an ink log into what the note says (`text`), the same text with its corrections marked
// (`transcript`, writing-experience.md §4.3), and a one-line `summary` ("2 crossings-out, ...").
// Event types: write, break, strike {from,to,how}, over {at,ch}, insert {after,text}, plus the
// journey's own underline {from,to}, pen {kind: 'dry'|'retrace'|'restart'} and move {to: 'ps'}.
export function journeyText(events) {
  const recs = [];
  const byId = new Map();
  let next = 0;
  const counts = { struck: 0, scribbled: 0, over: 0, inserted: 0, underlined: 0 };
  for (const e of events || []) {
    if (e.t === 'write') for (const ch of e.text) { const r = { id: next++, ch }; recs.push(r); byId.set(r.id, r); }
    else if (e.t === 'break') recs.push({ id: -1, ch: '\n' });
    else if (e.t === 'strike') { for (let i = e.from; i <= e.to; i++) { const r = byId.get(i); if (r) r.struck = e.how || 'line'; } counts[e.how === 'scribble' ? 'scribbled' : 'struck']++; }
    else if (e.t === 'over') { const r = byId.get(e.at); if (r) { r.over = e.ch; counts.over++; } }
    else if (e.t === 'underline') { for (let i = e.from; i <= e.to; i++) { const r = byId.get(i); if (r) r.under = true; } counts.underlined++; }
    else if (e.t === 'insert') {
      const k = recs.indexOf(byId.get(e.after));
      const add = Array.from(e.text, (ch) => { const r = { id: next++, ch, ins: true }; byId.set(r.id, r); return r; });
      recs.splice(k < 0 ? recs.length : k + 1, 0, ...add);
      counts.inserted++;
    }
  }
  const text = recs.filter((r) => !r.struck).map((r) => r.over || r.ch).join('');
  let transcript = '';
  for (let i = 0; i < recs.length;) {
    const r = recs[i];
    const kind = r.struck ? (r.struck === 'scribble' ? 'scribbled out' : 'struck') : r.ins ? 'inserted' : r.under ? 'underlined' : null;
    if (!kind) { transcript += r.over ? `[${r.ch}→${r.over}]` : r.ch; i++; continue; }
    let j = i, s = '';
    const same = (q) => (q.struck ? (q.struck === 'scribble' ? 'scribbled out' : 'struck') : q.ins ? 'inserted' : q.under ? 'underlined' : null) === kind;
    while (j < recs.length && same(recs[j]) && recs[j].ch !== '\n') { s += recs[j].over || recs[j].ch; j++; }
    // a struck or inserted run carries its own space: keep it outside the brackets
    const lead = s.match(/^ */)[0], trail = s.slice(lead.length).match(/ *$/)[0];
    const core = s.trim();
    transcript += core ? lead + `[${kind}: ${core}]` + trail : s;
    i = j;
  }
  const say = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const summary = [say(counts.struck, 'word crossed out', 'words crossed out'), say(counts.scribbled, 'word scribbled out', 'words scribbled out'),
    say(counts.over, 'letter written over', 'letters written over'), say(counts.inserted, 'word added above the line', 'words added above the line'),
    say(counts.underlined, 'underline', 'underlines')].filter(Boolean).join(', ');
  return { text, transcript, summary };
}
