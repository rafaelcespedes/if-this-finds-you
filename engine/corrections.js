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
// The journey is an ink log like any other (inklog.js): the planner below decides what was written and
// how it was fixed, and Ink mode (sheet.js) replays that log onto paper. So the marks are real pen strokes
// (marks.js: centerlines through penOutline(), with the hand's pen, ink, pressure and kinematics), page
// items with role 'mark' and strokes marked strike | scribble | caret | underline | blot, delayed where
// the writer adds them after the word, so animate.js writes them at the right moment.
//
// amount = 0 returns exactly layout()'s page. Deterministic: habits come from 'fix:' + seed, the plan
// from 'journey:' + seed + ':' + draft, marks from sheet.js's namespaces (salt 'journey:' + draft).

import { rng, clamp } from './core.js';
import { makeGlyph, has, isUpper, UPM } from './hand.js';
import { layout } from './layout.js';
import { fixHabits, COVER_BY_RIGHT } from './marks.js';
import { replay, INK_VERSION } from './sheet.js';
import { logicalText, transcription, summary } from './inklog.js';

export { fixHabits };

// ---------- controls ----------
// `natural(p)` gives this hand's own value when the hand doesn't carry the key (the lab reads it).
export const JOURNEY_PARAMS = [
  { key: 'mistakes', label: 'Mistakes', group: 'Journey', min: 0, max: 1, step: 0.01, format: 'pct', default: 0.3, natural: (p) => journeyAmount(p) },
];

// corrections per 100 words at amount 1 (writing-experience.md §2: a first draft has 5–15)
const RATE = 0.38;

// This writer's natural amount of mistakes (0..1): careless and hurried hands make more.
export function journeyAmount(p) {
  const H = fixHabits(p);
  const neat = clamp(p.neatness == null ? 0.6 : p.neatness, 0, 1);
  const u = rng('fix:' + p.seed + ':amount')();
  return clamp(0.05 + 0.36 * (1 - neat) + 0.22 * H.hurry + 0.1 * (u - 0.5), 0.03, 0.6);
}

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
    acts.push({ t: 'move', to: 'ps', size: H.psSize });
    const pps = psText.split('\n');
    pps.forEach((ln, k) => {
      if (k) acts.push({ t: 'break', stream: 'ps' });
      if (ln) acts.push({ t: 'write', stream: 'ps', text: ln, ps: true });
    });
  }

  // ----- the log, replayed through Ink mode -----
  const { events, evFix, idFix } = inkLog(acts, wtext, wmap, fixes, dry);
  const doc = { v: 1, ev: INK_VERSION, salt: 'journey:' + draft, hand: { seed: p.seed, style: p.style }, mode: 'ink', log: events };
  let st = replay(p, doc, layoutOpts);
  // a P.S. that would run off the page squeezes into the room left (layoutOpts.pageHeight, font units)
  const bottom = layoutOpts.pageHeight || opts.pageHeight;
  const mv = events.find((e) => e.t === 'move');
  if (bottom && mv) {
    const ps = st.page.items.filter((it) => it.role === 'ps' && it.g);
    const top = Math.min(...ps.map((it) => it.y)) - 0.8 * UPM * mv.size, low = Math.max(...ps.map((it) => it.y)) + 0.3 * UPM * mv.size;
    if (ps.length && low > bottom) {
      mv.size = clamp(mv.size * (bottom - top) / Math.max(1, low - top), 0.55, mv.size);
      st = replay(p, doc, layoutOpts);
    }
  }
  const page = Object.assign({}, st.page, { journey: true });
  // for the UI: charIndex = offset in the intended text (-1: ink that isn't part of it); fix = which mistake
  for (const it of page.items) {
    it.charIndex = it.at == null ? -1 : it.at;
    const f = it.role === 'mark' || it.role === 'over' ? evFix.get(it.ev) : it.id != null ? idFix.get(it.id) : undefined;
    if (f != null) it.fix = f; else delete it.fix;
  }
  const logical = logicalText(events);
  return {
    page, intended, transcript: transcription(events), summary: summary(events), events, amount, habits: H,
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

// Turn the writing actions into an ink log (inklog.js). Glyph ids count every character written, spaces
// and paragraph breaks included, in the order written. Also returns which mistake each mark event and
// each glyph id belongs to (evFix, idFix).
function inkLog(acts, wtext, wmap, fixes, dry) {
  const ev = [], evFix = new Map(), idFix = new Map();
  const gidAt = new Map(); // main-stream offset -> glyph id
  let next = 0;
  const push = (e, fix) => { if (fix != null && fix >= 0) evFix.set(ev.length, fix); ev.push(e); };
  const pushWrite = (text) => {
    const last = ev[ev.length - 1];
    if (last && last.t === 'write') last.text += text; else ev.push({ t: 'write', text });
  };
  const idRange = (ws, we) => { let a = null, b = null; for (let o = ws; o < we; o++) if (gidAt.has(o)) { if (a == null) a = gidAt.get(o); b = gidAt.get(o); } return [a, b]; };
  const wordRange = (wi) => {
    let a = null, b = null;
    for (let o = 0; o < wmap.length; o++) if (wmap[o].wi === wi && gidAt.has(o) && /\S/.test(wtext[o])) { if (a == null) a = gidAt.get(o); b = gidAt.get(o); }
    return [a, b];
  };
  const mark = (from, to, fix) => { if (fix != null && fix >= 0) for (let i = from; i <= to; i++) idFix.set(i, fix); };
  for (const A of acts) {
    switch (A.t) {
      case 'write': {
        if (A.stream === 'main') {
          for (let o = A.ws; o < A.we;) { gidAt.set(o, next++); o += wtext.codePointAt(o) > 0xffff ? 2 : 1; }
        } else next += Array.from(A.text).length;
        pushWrite(A.text);
        break;
      }
      case 'break': if (A.stream === 'main') gidAt.set(A.ws, next); next++; ev.push({ t: 'break' }); break;
      case 'strike': {
        const [from, to] = idRange(A.ws, A.we);
        if (from == null) break;
        const f = fixes[A.fix];
        mark(from, to, A.fix);
        push(Object.assign({ t: 'strike', from, to, how: A.how, why: A.why }, f && f.blot ? { blot: true } : {}), A.fix);
        break;
      }
      case 'over': {
        const at = gidAt.get(A.wAt);
        if (at == null) break;
        const f = fixes[A.fix];
        const last = ev[ev.length - 1];
        if (last && last.t === 'write') last.cont = true; // the word goes on after the overwrite: one word, laid out whole
        mark(at, at, A.fix);
        push(Object.assign({ t: 'over', at, ch: A.ch }, f && f.blot ? { blot: true } : {}), A.fix);
        break;
      }
      case 'underline': { const [from, to] = idRange(A.ws, A.we); if (from != null) push({ t: 'underline', from, to }); break; }
      case 'insert': {
        const after = A.after ? gidAt.get(A.after.we - 1) : null;
        if (after == null) break;
        const n = Array.from(A.text).length;
        mark(next, next + n - 1, A.fix);
        push({ t: 'insert', after, text: A.text }, A.fix);
        next += n;
        break;
      }
      case 'pen': {
        const [from] = wordRange(A.dry.a), [, to] = wordRange(A.dry.b - 1);
        if (from != null && to != null) push({ t: 'pen', kind: 'dry', from, to });
        if (A.dry.retrace) { const [a, b] = wordRange(A.dry.b - 1); if (a != null) push({ t: 'pen', kind: 'retrace', from: a, to: b }); }
        push({ t: 'pen', kind: 'restart' });
        break;
      }
      case 'move': push({ t: 'move', to: 'ps', size: A.size }); break;
    }
  }
  void dry;
  return { events: ev, evFix, idFix };
}

// What an ink log says (`text`), the same text with its corrections marked (`transcript`), and a
// one-line `summary` ("2 words crossed out, 1 letter written over"). See inklog.js.
export function journeyText(events) {
  return { text: logicalText(events), transcript: transcription(events), summary: summary(events) };
}
