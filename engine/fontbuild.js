// fontbuild.js — every hand becomes a proper, open-source, installable font (docs/FONTS.md has the why).
//
//   const built = buildFont(null, p, { name: 'Yara Rowe', clipper: ClipperLib });   // { otf, ttf, info, ... }
//   const pkg = await buildFontPackage(p, { name: 'Yara Rowe', clipper: ClipperLib }); // { zip, filename, info }
//
// What goes into the font:
// - GF Latin Core (319 characters) in this hand's own letters: its tradition, allographs, blend and style
//   dimensions, drawn by its pen (makeGlyph). Overlapping strokes are merged into clean contours when a polygon
//   clipper is passed in (clipper-lib 6.4.2, `opts.clipper`), then wound the way each format wants.
// - The forms the engine writes a letter in, picked by calt from the neighbours: a joined hand's lowercase letter
//   joined on both sides (the default glyph), at a word start (lead-in), at a word end (end flick), alone, and
//   beside the writer's own pen lifts (read from the engine pair by pair), plus the writer's context habits
//   (a double s, an r after o) and capitals in a row. So joins meet in every app that runs calt, and apps that
//   don't still get joined letters.
// - N samples of each letter (the writer's own per-use variation), cycled by calt so that neighbours never repeat;
//   the space has samples too, so the cycle carries across words and word gaps vary. salt / ss01… reach them by hand.
// - kern from the ink: print hands everywhere, joined hands only where nothing joins.
// - OTF (CFF outlines) and TTF (TrueType outlines), written here (opentype.js is no longer needed: the first
//   argument of buildFont is ignored). Names carry the writer, the licence (SIL OFL 1.1) and the credits; fsType 0
//   (installable); vertical metrics cover every glyph, so descenders and accents never clip.
// Deterministic: the same hand and options give byte-identical files.

import { rng, clamp } from './core.js';
import { makeGlyph, skeleton, has, isLower, isUpper, isDigit, CAP, traditionsOf } from './hand.js';
import { simplify, getPen } from './pen.js';
import { getStyle } from './glyphs.js';
import { styleDims } from './style-dims.js';
import { EXTRAS } from './sources/extras.js';

export const FONT_VERSION = '1.000';
const SITE = 'https://ifthisfindsyou.app';
const PRODUCT = 'If This Finds You';
const FAMILY_PREFIX = 'IfThisFindsYou';

// GF Latin Core (github.com/googlefonts/glyphsets, GF_Latin_Core.nam = tools/qa/data/gf-latin-core.txt): 319 characters
const CORE_RANGES = '20-7e a0-a3 a5 a7-ab ae-b0 b4 b6-b8 ba-bb bf-107 10a-113 116-11b 11e-123 126-127 12a-12b 12e-131 136-137 ' +
  '139-13e 141-148 150-155 158-15b 15e-161 164-165 16a-16b 16e-17e 218-21b 237 2c6-2c7 2d8-2dd 300-304 306-308 30a-30c ' +
  '326-328 1e80-1e85 1e9e 1ef2-1ef3 2013-2014 2018-201a 201c-201e 2022 2026 2039-203a 20ac 2122 2212';
export const GF_LATIN_CORE = (() => {
  const out = [];
  for (const r of CORE_RANGES.split(' ')) {
    const [a, b] = r.split('-').map((h) => parseInt(h, 16));
    for (let c = a; c <= (b || a); c++) out.push(String.fromCodePoint(c));
  }
  return out;
})();

// ---------- glyph names ----------
const AGL = {
  ' ': 'space', '!': 'exclam', '"': 'quotedbl', '#': 'numbersign', '$': 'dollar', '%': 'percent',
  '&': 'ampersand', "'": 'quotesingle', '(': 'parenleft', ')': 'parenright', '*': 'asterisk',
  '+': 'plus', ',': 'comma', '-': 'hyphen', '.': 'period', '/': 'slash', '0': 'zero', '1': 'one',
  '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight',
  '9': 'nine', ':': 'colon', ';': 'semicolon', '<': 'less', '=': 'equal', '>': 'greater',
  '?': 'question', '@': 'at', '[': 'bracketleft', '\\': 'backslash', ']': 'bracketright',
  '^': 'asciicircum', '_': 'underscore', '`': 'grave', '{': 'braceleft', '|': 'bar',
  '}': 'braceright', '~': 'asciitilde',
  '‘': 'quoteleft', '’': 'quoteright', '“': 'quotedblleft', '”': 'quotedblright',
  '–': 'endash', '—': 'emdash', '−': 'minus', '…': 'ellipsis', '•': 'bullet',
  '·': 'periodcentered', '€': 'Euro', '£': 'sterling', '¥': 'yen', '¢': 'cent',
  '©': 'copyright', '®': 'registered', '™': 'trademark', '°': 'degree',
  '×': 'multiply', '÷': 'divide', ' ': 'uni00A0',
};
export const glyphName = (ch) => AGL[ch] || (/^[A-Za-z0-9]$/.test(ch) ? ch : 'uni' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
// form keys: left state (j joined, s word start, l pen lift) + right state (j joined, e word end, l pen lift);
// 'h…' = the writer's context habit (double letter, after a round letter); 'caps' = between capitals
const FORM_NAME = { jj: '', sj: '', je: 'fina', se: 'isol', lj: 'liftl', jl: 'liftr', ll: 'lift', sl: 'init.liftr', le: 'fina.liftl',
  hjj: 'ctx', hje: 'ctx.fina', hjl: 'ctx.liftr', hlj: 'ctx.liftl', hle: 'ctx.fina.liftl', hll: 'ctx.lift', caps: 'caps' };
const formName = (kind, key) => (kind === 'lower' && key === 'sj' ? 'init' : FORM_NAME[key] || '');

// ---------- the plan: which glyphs, in which forms ----------
const kindOf = (ch) => (ch === ' ' ? 'space' : ch === ' ' ? 'nbsp' : /^\p{M}$/u.test(ch) ? 'mark' : isLower(ch) ? 'lower' : isUpper(ch) ? 'upper' : isDigit(ch) ? 'digit' : 'other');
const groupOf = (ch) => { const b = ch.normalize('NFD')[0]; return /^[A-Za-z]$/.test(b) ? b : ch; };
const PREV_PREF = [...'nmuiaehcdlkt'], NEXT_PREF = [...'nmuiaerc'];
const SPACE_SCALE = [1, 0.9, 1.13, 0.96, 1.07, 0.93, 1.1, 1.02];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const consSig = (sk) => { const v = sk.variant || {}; return [v.id, v.blend ? v.blend.to + ':' + v.blend.t : '', v.borrowedFrom || '', sk.strokes.length, sk.dots.length].join('|'); };

// Common words (English, French, Spanish, German, Dutch, Polish), most frequent first. A word comes out exactly as
// it did last time when its letters' steps (plus the space's) add up to a multiple of N, so each writer's steps
// are picked to keep that rare for the words people write most.
const COMMON_WORDS = ('the of and to a in is you that it he was for on are as with his they I at be this have from or one had by ' +
  'word but not what all were we when your can said there use an each which she do how their if will up other about out many then ' +
  'them these so some her would make like him into time has look two more write go see number no way could people my than first ' +
  'water been call who oil its now find long down day did get come made may part dear love letter hope well soon home write back ' +
  'de la que el en y a los se del las un por con no una su para es al lo como le les et des est pas pour qui dans ce il je vous ' +
  'der die und den das ist nicht ich sie es mit dem zu ein van het een niet dat ik nie się jest na że to').split(' ');

function chooseSteps(entries, N, steps, r) {
  if (N < 2 || !steps.length) return;
  const lower = entries.filter((e) => e.kind === 'lower' && /^[a-z]$/.test(e.ch));
  const space = entries.find((e) => e.kind === 'space');
  const spaceSteps = []; for (let c = 1; c < N; c++) spaceSteps.push(c);
  const idx = new Map(lower.map((e, i) => [e.ch, i]));
  const words = COMMON_WORDS.map((w, rank) => ({ ids: [...w.toLowerCase()].map((c) => idx.get(c)), weight: 1 / (rank + 3) })).filter((w) => w.ids.every((i) => i != null));
  let best = null, bestScore = Infinity;
  for (let t = 0; t < 160; t++) {
    const cand = lower.map(() => steps[Math.floor(r() * steps.length)]);
    const cs = spaceSteps[Math.floor(r() * spaceSteps.length)];
    let score = 0;
    for (const w of words) { let d = cs; for (const i of w.ids) d += cand[i]; if (d % N === 0) score += w.weight; }
    if (score < bestScore) { bestScore = score; best = { cand, cs }; }
  }
  lower.forEach((e, i) => { e.step = best.cand[i]; });
  if (space) space.step = best.cs;
  const byBase = new Map(lower.map((e) => [e.ch, e.step]));
  for (const e of entries) {
    if (e.kind === 'space' || (e.kind === 'lower' && /^[a-z]$/.test(e.ch))) continue;
    // accented letters step like their base letter; capitals and digits get their own
    e.step = byBase.get(e.group) || steps[Math.floor(r() * steps.length)];
  }
}

function sig(sk) {
  // a fingerprint of a skeleton: same letter construction, same geometry
  let h = 2166136261 >>> 0;
  const add = (v) => { h = Math.imul(h ^ (Math.round(v * 4) & 0xffff), 16777619) >>> 0; };
  add(sk.advance);
  for (const st of sk.strokes) { add(9999); for (const q of st) { add(q[0]); add(q[1]); } }
  for (const q of sk.dots) { add(7777); add(q[0]); add(q[1]); }
  return h + ':' + sk.strokes.length;
}

function planFont(p, opts) {
  const st = getStyle(p.style);
  const joined = !!(st && st.connected);
  const dims = styleDims(p);
  const liftsOn = joined && dims.lifts > 0;
  const N = clamp(Math.round(opts.alts != null ? opts.alts : joined ? 4 : 5), 1, 8);
  // fewer samples for rarer forms, always a divisor of N (so the cycle never repeats a neighbour): 4 -> 2, 5 -> 1
  let minor = 1;
  for (let d = 2; d <= Math.ceil(N / 2); d++) if (N % d === 0) minor = d;
  if (opts.minorAlts != null && N % opts.minorAlts === 0) minor = opts.minorAlts;
  const H = p.habits || {};
  const chars = [];
  for (const ch of [...(opts.chars || GF_LATIN_CORE), ...(opts.chars ? [] : EXTRAS)]) {
    if (chars.includes(ch)) continue;
    if (ch === ' ' || ch === ' ' || has(p, ch)) chars.push(ch);
  }
  if (!chars.includes(' ')) chars.unshift(' ');
  const kinds = new Map(chars.map((ch) => [ch, kindOf(ch)]));
  const letters = chars.filter((ch) => kinds.get(ch) === 'lower' || kinds.get(ch) === 'upper');
  const lowerGroups = [...new Set(chars.filter((ch) => kinds.get(ch) === 'lower').map(groupOf))];
  const letterGroups = [...new Set(letters.map(groupOf))];

  // the writer's pen lifts, pair by pair (the engine decides; we read its decision for each pair once)
  const liftT = new Map();
  if (liftsOn) {
    // (basic letters only: accented letters follow their base; special letters like æ ß ø always join)
    for (const x of lowerGroups.filter((c) => /^[a-z]$/.test(c))) for (const w of letterGroups.filter((c) => /^[A-Za-z]$/.test(c))) {
      const sk = skeleton(p, x, { prev: w, next: null, index: 1, wordStart: false, wordEnd: true });
      liftT.set(w + x, !!(sk.variant && sk.variant.lift && sk.variant.lift.before));
    }
  }
  const lifts = (w, x) => liftsOn && !!liftT.get(groupOf(w) + groupOf(x));
  const prevCands = (x, lifted) => {
    const out = [];
    for (const w of [...PREV_PREF, ...letterGroups.filter(isLower), ...letterGroups.filter(isUpper)]) {
      if (letterGroups.includes(w) && !out.includes(w) && lifts(w, x) === lifted) out.push(w);
    }
    return out;
  };
  const nextCands = (x, lifted) => {
    const out = [];
    for (const y of [...NEXT_PREF, ...lowerGroups]) if (lowerGroups.includes(y) && !out.includes(y) && lifts(x, y) === lifted) out.push(y);
    return out;
  };

  // The cycle: every letter steps the sample number by its own amount, coprime with N, so a letter never meets
  // itself in the same version (for any form whose count divides N, which is all of them).
  const steps = []; for (let c = 1; c < N; c++) if (gcd(c, N) === 1) steps.push(c);
  const stepR = rng('font-calt:' + p.seed);
  const heavy = liftsOn && dims.lifts >= 0.3; // lifts are everyday for this writer: their forms get every sample
  const entries = []; // one per character: { ch, kind, group, forms: [{ key, prevs, nexts, habit, alias?, alts }] }
  for (const ch of chars) {
    const kind = kinds.get(ch), g = groupOf(ch);
    const basic = /^[A-Za-z]$/.test(ch);
    const forms = [];
    const add = (key, prevs, nexts, habit, alias) => forms.push({ key, prevs, nexts, habit: !!habit, alias: alias || null });
    if (kind === 'lower') {
      const L = [['j', joined ? prevCands(g, false) : ['n']], ['s', [null]]];
      const R = [['j', joined ? nextCands(g, false) : ['n']], ['e', [null]]];
      if (!L[0][1].length) L[0][1] = ['n'];
      if (!R[0][1].length) R[0][1] = ['n'];
      for (const [l, pv] of L) for (const [r, nx] of R) add(l + r, pv, nx);
      if (liftsOn) {
        const lp = prevCands(g, true), ln = nextCands(g, true);
        if (basic) {
          if (lp.length) for (const [r, nx] of R) add('l' + r, lp, nx);
          if (ln.length) for (const [l, pv] of [...L, ...(lp.length ? [['l', lp]] : [])]) add(l + 'l', pv, ln);
        } else {
          // accented and special letters beside a lift reuse their word-start and word-end forms
          if (lp.length) { add('lj', [null], [null], false, 'sj'); add('le', [null], [null], false, 'se'); }
          if (ln.length) { add('jl', [null], [null], false, 'je'); add('sl', [null], [null], false, 'se'); }
          if (lp.length && ln.length) add('ll', [null], [null], false, 'se');
        }
      }
      // context habits that depend on the letter before (positional habits are covered by the forms above)
      const hb = H.context && H.context.get && H.context.get(ch);
      if (hb && (hb.when === 'double' || hb.when === 'after-round')) {
        const ps = (hb.when === 'double' ? [ch] : [...'obpv']).filter((c) => chars.includes(c));
        const RH = R.concat(liftsOn && nextCands(g, true).length ? [['l', nextCands(g, true)]] : []);
        for (const ls of ['j', 'l']) {
          const pv = ps.filter((w) => (ls === 'l') === lifts(w, g));
          if (!pv.length) continue;
          for (const [r, nx] of RH) add('h' + ls + r, pv, nx, true);
        }
      }
    } else if (kind === 'upper') {
      const R = [['j', joined ? nextCands(g, false) : ['n']], ['e', [null]]];
      if (!R[0][1].length) R[0][1] = ['n'];
      for (const [r, nx] of R) add('s' + r, [null], nx);
      if (liftsOn) { const ln = nextCands(g, true); if (ln.length) { if (basic) add('sl', [null], ln); else add('sl', [null], [null], false, 'se'); } }
      add('caps', ['H'], ['H']);
    } else add('', [null], [null]);
    const dflt = kind === 'lower' ? 'jj' : kind === 'upper' ? 'sj' : '';
    forms.sort((a, b) => (a.key === dflt ? -1 : b.key === dflt ? 1 : 0));
    // how many samples each form carries: every everyday form of the basic letters gets all N
    for (const f of forms) {
      let n;
      if (kind === 'nbsp' || kind === 'mark' || kind === 'other') n = 1;
      else if (kind === 'digit' || kind === 'space' || !joined) n = N;
      else if (kind === 'lower') {
        const lift = /l/.test(f.key.replace(/^h/, ''));
        const everyday = /^(jj|sj|je)$/.test(f.key) || (heavy && lift && !f.habit);
        n = basic ? (everyday ? N : minor) : (/^(jj|sj|je)$/.test(f.key) ? minor : 1);
      } else n = basic ? (f.key === 'sj' || f.key === 'se' || (heavy && f.key === 'sl') ? N : minor) : (f.key === 'sj' ? minor : 1);
      f.alts = n;
      // every form that takes part in the cycle has N slots; a slot past its versions shows version (slot mod n),
      // so the cycle's state survives every letter, digit and punctuation mark (a word never locks into one look)
      f.slots = kind === 'mark' ? 1 : N;
    }
    entries.push({ ch, kind, group: g, forms, dflt, step: 1 });
  }
  chooseSteps(entries, N, steps, stepR);
  return { p, joined, liftsOn, dims, N, minor, chars, entries, lifts, kinds, letters };
}

// ---------- outlines ----------
const area = (c) => { let a = 0; for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += (c[j][0] - c[i][0]) * (c[j][1] + c[i][1]); return a / 2; };

function closedSimplify(c, tol) {
  if (c.length < 8 || !(tol > 0)) return c;
  const s = simplify(c.concat([c[0]]), tol);
  s.pop();
  return s;
}
function roundPoly(c) {
  const out = [];
  for (const q of c) {
    const x = Math.round(q[0]), y = Math.round(q[1]);
    const l = out[out.length - 1];
    if (l && l[0] === x && l[1] === y) continue;
    out.push([x, y]);
  }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  // drop straight-through points
  for (let i = 0; out.length > 3 && i < out.length;) {
    const a = out[(i + out.length - 1) % out.length], b = out[i], c2 = out[(i + 1) % out.length];
    if ((b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]) === 0) out.splice(i, 1); else i++;
  }
  return out;
}

// contours (y-up, any winding, overlapping) -> clean polygons: outers counter-clockwise, holes clockwise
function cleanOutline(contours, C, tol) {
  const pre = contours.map((c) => closedSimplify(c, Math.min(0.35, tol))).filter((c) => c.length >= 3);
  let polys;
  if (C) {
    const S = 8;
    const paths = pre.map((c) => c.map((q) => ({ X: Math.round(q[0] * S), Y: Math.round(q[1] * S) })));
    const cpr = new C.Clipper();
    cpr.AddPaths(paths, C.PolyType.ptSubject, true);
    const sol = new C.Paths();
    cpr.Execute(C.ClipType.ctUnion, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    polys = sol.map((path) => path.map((pt) => [pt.X / S, pt.Y / S]));
  } else {
    // no clipper: keep the strokes as they are (overlaps fill under the nonzero rule), all wound the same way
    polys = pre.map((c) => (area(c) < 0 ? c.slice().reverse() : c));
  }
  const out = [];
  for (const c of polys) {
    const r = roundPoly(closedSimplify(c, tol));
    if (r.length >= 3 && Math.abs(area(r)) >= 3) out.push(r);
  }
  return { polys: out, merged: !!C };
}

function bboxOf(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of polys) for (const [x, y] of c) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 0, 0];
}

// ---------- drawing every glyph ----------
function liftState(sk) { const l = (sk.variant && sk.variant.lift) || {}; return [!!l.before, !!l.after]; }

function drawPlan(plan, opts) {
  const { p, joined, liftsOn, N } = plan;
  const C = opts.clipper || null;
  const tol = opts.tolerance != null ? opts.tolerance : 0.75;
  const amount = opts.amount != null ? opts.amount : 1;
  const glyphs = [];  // { name, ch, kind, entry, form, alt, adv, polys, bbox }
  const sources = new Map();
  const noteSource = (ch, v) => {
    if (!v) return;
    if (v.source) sources.set(v.source.name + '\u0001' + v.source.credit, v.source);
    if (v.blend && v.blend.style) {
      const b = getStyle(v.blend.style);
      const bv = b && (b.glyphs.get(ch) || []).find((x) => x.id === v.blend.to);
      if (bv && bv.source) sources.set(bv.source.name + '\u0001' + bv.source.credit, bv.source);
    }
  };
  // a reference width for combining marks (they sit over the letter before them)
  const ref = has(p, 'n') ? makeGlyph(p, 'n', null, { prev: 'n', next: 'n', index: 1 }).advance : 500;
  const spaceAdv = makeGlyph(p, ' ', null).advance * (p.wordSpace || 1);
  let tries = 0, misses = 0;
  const dropped = []; // characters that lost a runaway stroke

  for (const e of plan.entries) {
    // representative contexts: verify each form really is in the state its name says (lifts vary by position)
    const seen = new Map(); // fingerprint -> form key (identical forms share glyphs)
    for (const f of e.forms) {
      f.ctx = [];
      if (f.alias) continue;
      if (e.kind === 'space' || e.kind === 'nbsp' || e.kind === 'mark' || e.kind === 'other' || e.kind === 'digit') continue;
      const wantB = f.key === 'caps' ? false : f.key[f.habit ? 1 : 0] === 'l';
      const wantA = f.key === 'caps' ? false : f.key[f.key.length - 1] === 'l';
      for (let k = 0; k < f.alts; k++) {
        let best = null;
        if (!liftsOn && k > 0) { const c0 = f.ctx[0]; f.ctx.push({ ...c0, index: 1 + k }); continue; }
        for (let m = 0; m < (liftsOn ? 4 : 1); m++) {
          const prev = f.prevs[m % f.prevs.length], next = f.nexts[(m + (m >> 1)) % f.nexts.length];
          const index = 1 + k + m * N;
          const ctx = { prev, next, index, wordStart: prev == null && e.kind !== 'upper' ? true : prev == null, wordEnd: next == null };
          if (f.key === 'caps') { ctx.wordStart = false; ctx.wordEnd = false; }
          const sk = skeleton(p, e.ch, ctx);
          tries++;
          if (!best) best = { ctx, sk };
          if (!liftsOn) break;
          const [b, a] = liftState(sk);
          if (b === wantB && a === wantA) { best = { ctx, sk }; break; }
          if (m === 3) misses++;
        }
        f.ctx.push(best.ctx);
        // print letters only change form when the writer's construction does (a word-final s, an ALL CAPS form);
        // context otherwise only reseeds the jitter, which the samples already carry
        if (k === 0) f.sig = joined ? sig(best.sk) : consSig(best.sk);
      }
      if (seen.has(f.sig)) f.alias = seen.get(f.sig); else seen.set(f.sig, f.key);
    }
    for (const f of e.forms) {
      if (f.alias) continue;
      for (let k = 0; k < f.alts; k++) {
        const base = glyphName(e.ch), fn = formName(e.kind, f.key);
        const name = base + (fn ? '.' + fn : '') + (k ? '.alt' + k : '');
        let adv = 0, polys = [];
        if (e.kind === 'space' || e.kind === 'nbsp') {
          adv = spaceAdv * (e.kind === 'space' ? SPACE_SCALE[k % SPACE_SCALE.length] : 1);
        } else {
          const inst = { seed: 'font:' + k + ':' + e.ch, amount, baseline: !joined };
          const ctx = f.ctx[k] || null;
          const g = makeGlyph(p, e.ch, inst, ctx);
          noteSource(e.ch, g.variant);
          // a stroke far outside any letter's box is an engine bug, never handwriting: leave it out (and say so),
          // so the file stays valid (font coordinates must fit in 16 bits)
          let contours = g.contours.filter((c) => c.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]) && q[0] > -3000 && q[0] < 5000 && q[1] > -2500 && q[1] < 3000));
          if (contours.length < g.contours.length && !dropped.includes(e.ch)) dropped.push(e.ch);
          adv = Number.isFinite(g.advance) ? Math.min(g.advance, 5000) : 0;
          if (e.kind === 'mark') {
            // a combining mark: no width of its own, centred over the letter before it
            const bb = bboxOf(contours);
            const dx = -ref / 2 - (bb[0] + bb[2]) / 2;
            contours = contours.map((c) => c.map((q) => [q[0] + dx, q[1]]));
            adv = 0;
          }
          polys = cleanOutline(contours, C, tol).polys;
        }
        glyphs.push({ name, ch: e.ch, kind: e.kind, entry: e, form: f.key, alt: k, adv: Math.max(0, Math.round(adv)), polys, bbox: bboxOf(polys) });
      }
      const drawnForm = glyphs.slice(glyphs.length - f.alts);
      for (let k = f.alts; k < f.slots; k++) {
        const src = drawnForm[k % f.alts];
        glyphs.push({ ...src, name: src.name.replace(/\.alt\d+$/, '') + '.alt' + k, alt: k, dup: true, dupOf: src.polys.length ? src : null });
      }
    }
  }
  plan.stats = { tries, misses, dropped };
  return { glyphs, sources: [...sources.values()] };
}

// ---------- glyph order, cmap and the lookups' glyph sets ----------
function organise(plan, drawn) {
  // .notdef, then every first sample (alt0) grouped by base letter, then alt1, alt2, ...: the classes the
  // contextual lookups need are then a few contiguous ranges
  const notdef = { name: '.notdef', kind: 'notdef', adv: 500, polys: [
    [[60, 0], [440, 0], [440, 700], [60, 700]], [[100, 40], [100, 660], [400, 660], [400, 40]]] };
  notdef.bbox = bboxOf(notdef.polys);
  const rank = (g) => {
    const k = g.kind;
    return k === 'space' ? 0 : k === 'nbsp' ? 1 : k === 'lower' || k === 'upper' ? 2 : k === 'digit' ? 3 : k === 'other' ? 4 : 5;
  };
  const groupRank = new Map();
  plan.entries.forEach((e, i) => { const key = (e.kind === 'lower' || e.kind === 'upper' ? e.group.toLowerCase() : '') + '\u0001' + e.kind; if (!groupRank.has(key)) groupRank.set(key, i); });
  const gr = (g) => groupRank.get((g.kind === 'lower' || g.kind === 'upper' ? g.entry.group.toLowerCase() : '') + '\u0001' + g.kind);
  const order = drawn.glyphs.map((g, i) => ({ g, i })).sort((a, b) =>
    a.g.alt - b.g.alt || rank(a.g) - rank(b.g) || gr(a.g) - gr(b.g) || a.i - b.i).map((x) => x.g);
  const glyphs = [notdef, ...order];
  glyphs.forEach((g, i) => { g.id = i; });
  const byName = new Map(glyphs.map((g) => [g.name, g]));
  if (byName.size !== glyphs.length) throw new Error('fontbuild: duplicate glyph names');
  // per character: form key -> [gid per alt]; aliases resolve to their target form
  const forms = new Map();
  for (const e of plan.entries) {
    const m = new Map();
    for (const f of e.forms) if (!f.alias) m.set(f.key, []);
    forms.set(e.ch, m);
  }
  for (const g of order) forms.get(g.ch).get(g.form)[g.alt] = g.id;
  for (const e of plan.entries) for (const f of e.forms) if (f.alias) forms.get(e.ch).set(f.key, forms.get(e.ch).get(f.alias));
  const cmap = new Map();
  for (const e of plan.entries) cmap.set(e.ch.codePointAt(0), forms.get(e.ch).get(e.dflt)[0]);
  return { glyphs, forms, cmap };
}

// ---------- OpenType layout tables (GSUB, GPOS, GDEF) ----------
class W {
  constructor(n = 256) { this.b = new Uint8Array(n); this.n = 0; }
  need(k) { if (this.n + k > this.b.length) { let m = this.b.length * 2; while (m < this.n + k) m *= 2; const nb = new Uint8Array(m); nb.set(this.b.subarray(0, this.n)); this.b = nb; } }
  u8(v) { this.need(1); this.b[this.n++] = v & 255; return this; }
  u16(v) { this.need(2); this.b[this.n++] = (v >> 8) & 255; this.b[this.n++] = v & 255; return this; }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { this.need(4); v >>>= 0; this.b[this.n++] = v >>> 24; this.b[this.n++] = (v >>> 16) & 255; this.b[this.n++] = (v >>> 8) & 255; this.b[this.n++] = v & 255; return this; }
  i32(v) { return this.u32(v | 0); }
  fixed(v) { return this.i32(Math.round(v * 65536)); }
  tag(s) { for (let i = 0; i < 4; i++) this.u8(i < s.length ? s.charCodeAt(i) : 32); return this; }
  bytes(a) { this.need(a.length); this.b.set(a, this.n); this.n += a.length; return this; }
  pad4() { while (this.n % 4) this.u8(0); return this; }
  out() { return this.b.slice(0, this.n); }
}
// a layout object: bytes plus 16- or 32-bit links to child objects (offsets from this object's start)
class O extends W {
  constructor() { super(32); this.links = []; }
  off16(c) { this.links.push({ at: this.n, c, size: 2 }); return this.u16(0); }
  off32(c) { this.links.push({ at: this.n, c, size: 4 }); return this.u32(0); }
  offN(c) { return c ? this.off16(c) : this.u16(0); }
}
// pack: a root and everything it reaches by 16-bit links sit together; a 32-bit link starts a new block after
function pack(root) {
  const pos = new Map(), order = [];
  const blocks = [root];
  let at = 0;
  while (blocks.length) {
    const q = [blocks.shift()];
    while (q.length) {
      const o = q.shift();
      if (pos.has(o)) continue;
      pos.set(o, at); order.push(o); at += o.n;
      for (const l of o.links) (l.size === 2 ? q : blocks).push(l.c);
    }
  }
  const out = new Uint8Array(at);
  for (const o of order) {
    const s = pos.get(o);
    out.set(o.b.subarray(0, o.n), s);
    for (const l of o.links) {
      const d = pos.get(l.c) - s;
      if (d < 0 || (l.size === 2 && d > 0xffff)) throw new Error('fontbuild: layout offset overflow');
      if (l.size === 2) { out[s + l.at] = d >> 8; out[s + l.at + 1] = d & 255; } else { out[s + l.at] = d >>> 24; out[s + l.at + 1] = (d >>> 16) & 255; out[s + l.at + 2] = (d >>> 8) & 255; out[s + l.at + 3] = d & 255; }
    }
  }
  return out;
}
const uniqSorted = (a) => [...new Set(a)].sort((x, y) => x - y);
function coverage(gids) {
  const g = uniqSorted(gids);
  const ranges = [];
  for (let i = 0; i < g.length;) { let j = i; while (j + 1 < g.length && g[j + 1] === g[j] + 1) j++; ranges.push([g[i], g[j], i]); i = j + 1; }
  const o = new O();
  if (4 + 2 * g.length <= 4 + 6 * ranges.length) { o.u16(1).u16(g.length); for (const x of g) o.u16(x); } else { o.u16(2).u16(ranges.length); for (const [a, b, i] of ranges) o.u16(a).u16(b).u16(i); }
  o.glyphs = g;
  return o;
}
function classDef(map) { // Map gid -> class (class 0 entries are left out)
  const g = [...map.keys()].filter((k) => map.get(k)).sort((a, b) => a - b);
  const o = new O();
  if (!g.length) return o.u16(2).u16(0);
  const ranges = [];
  for (let i = 0; i < g.length;) { let j = i; while (j + 1 < g.length && g[j + 1] === g[j] + 1 && map.get(g[j + 1]) === map.get(g[i])) j++; ranges.push([g[i], g[j], map.get(g[i])]); i = j + 1; }
  const span = g[g.length - 1] - g[0] + 1;
  if (6 + 2 * span <= 4 + 6 * ranges.length) { o.u16(1).u16(g[0]).u16(span); for (let x = g[0]; x <= g[g.length - 1]; x++) o.u16(map.get(x) || 0); } else { o.u16(2).u16(ranges.length); for (const [a, b, c] of ranges) o.u16(a).u16(b).u16(c); }
  return o;
}
function singleSubst(pairs) { // [[from, to]]
  const m = new Map(); for (const [a, b] of pairs) if (a !== b && !m.has(a)) m.set(a, b);
  const cov = coverage([...m.keys()]);
  const o = new O().u16(2).off16(cov).u16(cov.glyphs.length);
  for (const g of cov.glyphs) o.u16(m.get(g));
  return o;
}
function alternateSubst(pairs) { // [[from, [alts]]]
  const m = new Map(); for (const [a, alts] of pairs) if (alts.length && !m.has(a)) m.set(a, alts);
  const cov = coverage([...m.keys()]);
  const o = new O().u16(1).off16(cov).u16(cov.glyphs.length);
  for (const g of cov.glyphs) { const s = new O().u16(m.get(g).length); for (const a of m.get(g)) s.u16(a); o.off16(s); }
  return o;
}
function chain3(back, input, ahead, records) { // coverage glyph lists; back[0] = the glyph just before
  const o = new O().u16(3).u16(back.length);
  for (const b of back) o.off16(coverage(b));
  o.u16(input.length); for (const c of input) o.off16(coverage(c));
  o.u16(ahead.length); for (const c of ahead) o.off16(coverage(c));
  o.u16(records.length); for (const [si, li] of records) o.u16(si).u16(li);
  return o;
}
function chain2(covGlyphs, backCD, inCD, aheadCD, sets, nInputClasses) { // sets: Map class -> [{ back: [], ahead: [], records }]
  const o = new O().u16(2).off16(coverage(covGlyphs)).off16(classDef(backCD)).off16(classDef(inCD)).off16(classDef(aheadCD));
  o.u16(nInputClasses);
  for (let c = 0; c < nInputClasses; c++) {
    const rules = sets.get(c);
    if (!rules || !rules.length) { o.u16(0); continue; }
    const rs = new O().u16(rules.length);
    for (const r of rules) {
      const ro = new O().u16(r.back.length); for (const x of r.back) ro.u16(x);
      ro.u16(1); // input: just this glyph
      ro.u16(r.ahead.length); for (const x of r.ahead) ro.u16(x);
      ro.u16(r.records.length); for (const [si, li] of r.records) ro.u16(si).u16(li);
      rs.off16(ro);
    }
    o.off16(rs);
  }
  return o;
}
function pairPos2(covGlyphs, cd1, cd2, n1, n2, values) { // values[c1 * n2 + c2] = x advance adjustment
  const o = new O().u16(2).off16(coverage(covGlyphs)).u16(0x0004).u16(0).off16(classDef(cd1)).off16(classDef(cd2)).u16(n1).u16(n2);
  for (let i = 0; i < n1 * n2; i++) o.i16(values[i] || 0);
  return o;
}
// GSUB/GPOS/GDEF header + script, feature and lookup lists. Every subtable goes through an extension
// subtable (32-bit offsets), so big tables never overflow.
function layoutTable(isGpos, features, lookups) {
  const extType = isGpos ? 9 : 7;
  const lookupList = new O().u16(lookups.length);
  for (const lk of lookups) {
    const lo = new O().u16(extType).u16(lk.flag || 0).u16(lk.subtables.length);
    for (const st of lk.subtables) lo.off16(new O().u16(1).u16(lk.type).off32(st));
    lookupList.off16(lo);
  }
  const feats = features.filter((f) => f.lookups.length).sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const featureList = new O().u16(feats.length);
  for (const f of feats) { const fo = new O().u16(0).u16(f.lookups.length); for (const li of uniqSorted(f.lookups)) fo.u16(li); featureList.tag(f.tag).off16(fo); }
  const scriptList = new O().u16(2);
  for (const tag of ['DFLT', 'latn']) {
    const ls = new O().u16(0).u16(0xffff).u16(feats.length); feats.forEach((_, i) => ls.u16(i));
    scriptList.tag(tag).off16(new O().off16(ls).u16(0));
  }
  const root = new O().u16(1).u16(0).off16(scriptList).off16(featureList).off16(lookupList);
  return pack(root);
}

function compileGSUB(plan, org, opts) {
  const { joined, N } = plan;
  const { forms } = org;
  const E = plan.entries;
  const lookups = [];
  const add = (lk) => { lookups.push(lk); return lookups.length - 1; };
  const F = (ch, key) => forms.get(ch).get(key);
  const has0 = (ch, key) => { const x = F(ch, key); return x ? x[0] : null; };
  const all0 = (pred) => { const out = []; for (const e of E) if (pred(e)) for (const [, ids] of forms.get(e.ch)) out.push(ids[0]); return uniqSorted(out); };
  const isL = (e) => e.kind === 'lower', isU = (e) => e.kind === 'upper';
  const letterGlyphs = all0((e) => isL(e) || isU(e));
  const calt = [];
  const nested = [];        // [name, pairs]: single substitutions only reached from contextual rules
  const map = (name, pairs) => { const m = pairs.filter(([a, b]) => a != null && b != null && a !== b); if (m.length) nested.push([name, m]); return m.length ? name : null; };
  const formPairs = (pred, from, to) => {
    const out = [];
    for (const e of E) if (pred(e)) for (let i = 0; i < from.length; i++) { const a = has0(e.ch, from[i]), b = has0(e.ch, to[i]); if (a != null && b != null) out.push([a, b]); }
    return out;
  };
  const NEST = new Map(); // nested name -> lookup index (assigned after the feature lookups)
  const ctxLookups = []; // contextual lookups, built after we know the nested indices: [build(idx)]

  // 1. context habits that depend on the letter before (s after s, r after o)
  const habit = E.filter((e) => isL(e) && e.forms.some((f) => f.habit));
  const toHabit = map('habit', habit.map((e) => [has0(e.ch, 'jj'), has0(e.ch, 'hjj') ?? has0(e.ch, 'hlj')]));
  if (toHabit) ctxLookups.push(() => ({ type: 6, flag: 8, subtables: habit.map((e) => {
    const prevs = [...new Set(e.forms.filter((x) => x.habit).flatMap((x) => x.prevs))];
    return chain3([all0((o) => prevs.includes(o.ch))], [[has0(e.ch, 'jj')]], [], [[0, NEST.get('habit')]]);
  }) }));

  // 2. capitals between capitals (ALL CAPS reads plainer)
  const caps = E.filter((e) => isU(e) && has0(e.ch, 'caps') !== has0(e.ch, 'sj'));
  const toCaps = map('caps', caps.map((e) => [has0(e.ch, 'sj'), has0(e.ch, 'caps')]));
  if (toCaps) ctxLookups.push(() => {
    const upAll = all0(isU), upDef = uniqSorted(E.filter(isU).map((e) => has0(e.ch, 'sj')));
    const inp = caps.map((e) => has0(e.ch, 'sj'));
    return { type: 6, flag: 8, subtables: [chain3([upAll], [inp], [], [[0, NEST.get('caps')]]), chain3([], [inp], [upDef], [[0, NEST.get('caps')]])] };
  });

  // 3. left side of lowercase letters: joined, lifted, or at a word start
  const lowE = E.filter(isL);
  const leftJ = (e) => ['jj', 'hjj'].map((k) => has0(e.ch, k)).filter((x) => x != null);
  const toLeftS = map('left-s', formPairs(isL, ['jj'], ['sj']));
  const toLeftL = map('left-l', formPairs(isL, ['jj', 'hjj'], ['lj', 'hlj']));
  if (toLeftS || toLeftL) ctxLookups.push(() => {
    const subs = [];
    if (toLeftL) {
      // per base letter: the letters this writer lifts after
      const byGroup = new Map();
      for (const e of lowE) { if (!byGroup.has(e.group)) byGroup.set(e.group, []); byGroup.get(e.group).push(e); }
      for (const [g, es] of byGroup) {
        const ws = E.filter((w) => (isL(w) || isU(w)) && plan.lifts(w.ch, g));
        if (!ws.length) continue;
        subs.push(chain3([all0((o) => ws.includes(o))], [uniqSorted(es.flatMap(leftJ))], [], [[0, NEST.get('left-l')]]));
      }
    }
    const inp = uniqSorted(lowE.flatMap(leftJ));
    subs.push(chain3([letterGlyphs], [inp], [], []));                       // after a letter: stays joined
    if (toLeftS) subs.push(chain3([], [uniqSorted(lowE.map((e) => has0(e.ch, 'jj')))], [], [[0, NEST.get('left-s')]]));
    return { type: 6, flag: 8, subtables: subs };
  });

  // 4. right side: joined into the next letter, lifted before it, or at a word end
  const rightFrom = ['jj', 'sj', 'lj', 'hjj', 'hlj'];
  const toRightE = map('right-e', formPairs((e) => isL(e) || (isU(e) && joined), rightFrom, ['je', 'se', 'le', 'hje', 'hle']));
  const toRightL = map('right-l', formPairs((e) => isL(e) || isU(e), rightFrom, ['jl', 'sl', 'll', 'hjl', 'hll']));
  const toRightEp = !joined ? map('right-e-print', formPairs(isL, ['jj', 'sj', 'hjj'], ['je', 'se', 'hje'])) : null;
  if (toRightE || toRightL || toRightEp) ctxLookups.push(() => {
    const inp = uniqSorted(E.filter((e) => isL(e) || (isU(e) && joined)).flatMap((e) => rightFrom.map((k) => has0(e.ch, k)).filter((x) => x != null)));
    const subs = [];
    if (joined) {
      const nextJ = uniqSorted(lowE.flatMap(leftJ));
      const nextL = uniqSorted(lowE.flatMap((e) => ['lj', 'hlj'].map((k) => has0(e.ch, k)).filter((x) => x != null)));
      subs.push(chain3([], [inp], [nextJ], []));
      if (toRightL && nextL.length) subs.push(chain3([], [inp], [nextL], [[0, NEST.get('right-l')]]));
      if (toRightE) subs.push(chain3([], [inp], [], [[0, NEST.get('right-e')]]));
    } else {
      const inpP = uniqSorted(lowE.flatMap((e) => ['jj', 'sj', 'hjj'].map((k) => has0(e.ch, k)).filter((x) => x != null)));
      subs.push(chain3([], [inpP], [letterGlyphs], []));
      subs.push(chain3([], [inpP], [], [[0, NEST.get('right-e-print')]]));
    }
    return { type: 6, flag: 8, subtables: subs };
  });

  // 5. the samples: alt j of every cycling glyph (also ss01…)
  const cyc = []; // [alt0 gid, [gid per alt], step]
  for (const e of E) for (const [, ids] of forms.get(e.ch)) if (ids.length > 1) cyc.push([ids[0], ids, e.step]);
  const cycU = new Map(); for (const c of cyc) cycU.set(c[0], c);
  const cycles = [...cycU.values()];
  const altIdx = [];
  for (let j = 1; j < N; j++) altIdx.push(add({ type: 1, subtables: [singleSubst(cycles.map(([g0, ids]) => [g0, ids[j % ids.length]]))] }));
  // lookup order: the contextual lookups first (they read the first samples), then the samples (ss01…), the cycle,
  // salt, aalt, and last the single substitutions the contextual rules call
  const head = [];
  const nestedBase = ctxLookups.length + altIdx.length + 1 /* cycle */ + 2 /* salt, aalt */;
  nested.forEach(([name], i) => NEST.set(name, nestedBase + i));
  for (const build of ctxLookups) head.push(build());
  const altLookups = lookups.splice(0, lookups.length);
  const ssIdx = altLookups.map((_, i) => head.length + i);
  const all = [...head, ...altLookups];
  // the cycle: each glyph steps the slot by its character's own amount (coprime with N), so neighbours differ
  let cycleIdx = null;
  if (N > 1 && cycles.length && opts.calt !== false) {
    const backCD = new Map(), inCD = new Map();
    for (const [, ids] of cycles) for (let k = 1; k < ids.length; k++) backCD.set(ids[k], k);
    for (const [g0, , s] of cycles) inCD.set(g0, s);
    const sets = new Map();
    for (let c = 1; c < N; c++) {
      const rules = [];
      for (let s = 0; s < N; s++) { const j = (s + c) % N; if (j) rules.push({ back: [s], ahead: [], records: [[0, ssIdx[j - 1]]] }); }
      sets.set(c, rules);
    }
    all.push({ type: 6, flag: 8, subtables: [chain2(cycles.map((c) => c[0]), backCD, inCD, new Map(), sets, N)] });
    cycleIdx = all.length - 1;
  } else all.push({ type: 1, subtables: [singleSubst([])] });
  // salt (the other samples) and aalt (samples and forms), for apps with a glyph palette
  const real = (id) => !org.glyphs[id].dup;
  all.push({ type: 3, subtables: [alternateSubst(cycles.map(([g0, ids]) => [g0, ids.slice(1).filter(real)]))] });
  const saltIdx = all.length - 1;
  const aaltPairs = [];
  for (const e of E) {
    const fm = forms.get(e.ch), d = fm.get(e.dflt);
    if (!d) continue;
    const alts = [];
    for (const [k, ids] of fm) for (let i = 0; i < ids.length; i++) if ((k !== e.dflt || i) && real(ids[i]) && !alts.includes(ids[i]) && ids[i] !== d[0]) alts.push(ids[i]);
    if (alts.length) aaltPairs.push([d[0], alts]);
  }
  all.push({ type: 3, subtables: [alternateSubst(aaltPairs)] });
  const aaltIdx = all.length - 1;
  for (const [, pairs] of nested) all.push({ type: 1, subtables: [singleSubst(pairs)] });
  if (all.length !== nestedBase + nested.length) throw new Error('fontbuild: lookup bookkeeping');

  const ctxIdx = head.map((_, i) => i);
  const features = [
    { tag: 'calt', lookups: opts.calt === false ? [] : [...ctxIdx, ...(cycleIdx != null ? [cycleIdx] : [])] },
    { tag: 'salt', lookups: cycles.length ? [saltIdx] : [] },
    { tag: 'aalt', lookups: aaltPairs.length ? [aaltIdx] : [] },
  ];
  ssIdx.forEach((li, i) => { if (i < 20) features.push({ tag: 'ss' + String(i + 1).padStart(2, '0'), lookups: [li] }); });
  const bytes = layoutTable(false, features, all);
  return { bytes, features: features.filter((f) => f.lookups.length).map((f) => f.tag), lookups: all.length, maxContext: 2 };
}

// ---------- kerning, from the ink ----------
// Each kerning class is a character (all its forms and samples) or, for accented letters, its base letter.
// For a pair, the gap between the left glyph's right edge and the right glyph's left edge is measured band by band
// (only where both have ink, and one band up and down for diagonals). Gaps much wider than the hand's own gap
// between straight letters close a little (T o, V a, r .); ink that would actually touch opens a little.
// Joined hands kern only pairs where nothing joins (punctuation, digits, capitals in a row).
function compileGPOS(plan, org, opts) {
  const { glyphs, forms } = org;
  const E = plan.entries;
  const BANDS = 24;
  let y0 = Infinity, y1 = -Infinity;
  for (const g of glyphs) if (g.polys && g.polys.length) { y0 = Math.min(y0, g.bbox[1]); y1 = Math.max(y1, g.bbox[3]); }
  if (!Number.isFinite(y0)) return null;
  const bh = (y1 - y0) / BANDS;
  const classKey = (e) => (e.kind === 'lower' || e.kind === 'upper' ? (/^[A-Za-z]$/.test(e.group) ? e.group : e.ch) : e.ch);
  const kernable = (e) => e.kind === 'lower' || e.kind === 'upper' || e.kind === 'digit' || e.kind === 'other';
  const classes = new Map(); // key -> { gids, L: right edges per band (ink right of the advance origin), R: left edges }
  const profile = (g) => {
    const R = new Float64Array(BANDS).fill(-Infinity), L = new Float64Array(BANDS).fill(Infinity);
    for (const c of g.polys) for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      const steps = Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / (bh / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        const k = clamp(Math.floor((y - y0) / bh), 0, BANDS - 1);
        if (x > R[k]) R[k] = x; if (x < L[k]) L[k] = x;
      }
    }
    return { R, L };
  };
  for (const e of E) {
    if (!kernable(e)) continue;
    const key = classKey(e);
    if (!classes.has(key)) classes.set(key, { key, kind: e.kind, entries: [], gids: [], right: new Float64Array(BANDS).fill(-Infinity), left: new Float64Array(BANDS).fill(Infinity), adv: [] });
    const c = classes.get(key);
    c.entries.push(e);
    for (const [, ids] of forms.get(e.ch)) for (const id of ids) {
      if (c.gids.includes(id)) continue;
      c.gids.push(id);
      // the base letter's own glyphs define the profile (accents above don't change spacing much)
      if (e.ch !== key && /^[A-Za-z]$/.test(key)) continue;
      const g = glyphs[id];
      if (g.dup) continue; // a slot repeating a version
      const pr = profile(g);
      for (let k = 0; k < BANDS; k++) {
        if (pr.R[k] - g.adv > c.right[k]) c.right[k] = pr.R[k] - g.adv; // ink right of the advance (<= 0 usually)
        if (pr.L[k] < c.left[k]) c.left[k] = pr.L[k];
      }
    }
  }
  const list = [...classes.values()].filter((c) => c.gids.length && c.right.some(Number.isFinite));
  const gap = (A, B) => {
    let m = Infinity;
    for (let k = 0; k < BANDS; k++) {
      if (!Number.isFinite(A.right[k])) continue;
      for (let d = -1; d <= 1; d++) {
        const j = k + d;
        if (j < 0 || j >= BANDS || !Number.isFinite(B.left[j])) continue;
        const g = B.left[j] - A.right[k] - (d ? 0.35 * bh : 0);
        if (g < m) m = g;
      }
    }
    return m;
  };
  // the hand's own gap between plain letters
  const refs = ['n', 'o', 'l', 'i', 'h', 'u', 'm'].map((k) => classes.get(k)).filter(Boolean);
  const gs = [];
  for (const a of refs) for (const b of refs) { const g = gap(a, b); if (Number.isFinite(g)) gs.push(g); }
  gs.sort((a, b) => a - b);
  const g0 = gs.length ? Math.max(20, gs[Math.floor(gs.length / 2)]) : 80;
  const joinsInto = (A, B) => plan.joined && (B.kind === 'lower') && (A.kind === 'lower' || A.kind === 'upper');
  const kerns = new Map();
  let count = 0;
  for (const A of list) for (const B of list) {
    if (joinsInto(A, B)) continue;
    if (plan.joined && A.kind === 'lower' && B.kind === 'upper') continue;
    const g = gap(A, B);
    if (!Number.isFinite(g)) continue;
    let v = 0;
    if (g > 1.6 * g0) v = -Math.min(0.6 * (g - 1.25 * g0), 0.22 * 1000);
    else if (g < -0.1 * g0) v = Math.min(0.3 * g0 - g, 0.15 * 1000);
    v = Math.round(v / 5) * 5;
    if (Math.abs(v) >= 10) { kerns.set(A.key + '\u0001' + B.key, v); count++; }
  }
  if (!count) return { bytes: null, pairs: 0, gap: g0 };
  const lefts = list.filter((A) => list.some((B) => kerns.has(A.key + '\u0001' + B.key)));
  const rights = list.filter((B) => list.some((A) => kerns.has(A.key + '\u0001' + B.key)));
  const cd1 = new Map(), cd2 = new Map();
  lefts.forEach((A, i) => { for (const id of A.gids) cd1.set(id, i + 1); });
  rights.forEach((B, i) => { for (const id of B.gids) cd2.set(id, i + 1); });
  const n1 = lefts.length + 1, n2 = rights.length + 1;
  const values = new Int16Array(n1 * n2);
  lefts.forEach((A, i) => rights.forEach((B, j) => { values[(i + 1) * n2 + j + 1] = kerns.get(A.key + '\u0001' + B.key) || 0; }));
  const sub = pairPos2(lefts.flatMap((A) => A.gids), cd1, cd2, n1, n2, values);
  const bytes = layoutTable(true, [{ tag: 'kern', lookups: [0] }], [{ type: 2, flag: 8, subtables: [sub] }]);
  return { bytes, pairs: count, gap: Math.round(g0) };
}

function compileGDEF(org) {
  const cd = new Map();
  for (const g of org.glyphs) if (g.kind) cd.set(g.id, g.kind === 'mark' ? 3 : g.kind === 'notdef' ? 0 : 1);
  const root = new O().u16(1).u16(0).off16(classDef(cd)).u16(0).u16(0).u16(0);
  return pack(root);
}

// ---------- names, credits and licence ----------
const OFL_URL = 'https://openfontlicense.org';
export const HERSHEY_NOTICE = 'The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S. National Bureau of ' +
  'Standards. The format of the Font data in this distribution was originally created by James Hurt, Cognition, Inc., ' +
  '900 Technology Park Drive, Billerica, MA 01821 (mit-eddie!ci-dandelion!hurt).';
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[æÆ]/g, 'ae').replace(/[œŒ]/g, 'oe')
  .replace(/[øØ]/g, 'o').replace(/[łŁ]/g, 'l').replace(/[ðÐ]/g, 'd').replace(/[þÞ]/g, 'th').replace(/[đĐ]/g, 'd').replace(/[ħĦ]/g, 'h').replace(/ı/g, 'i');
const branded = (s) => String(s).replace(/Seedhand/g, PRODUCT);

// what kind of licence a source's own credit line states
function licenceOf(src) {
  const c = src.credit || '';
  if (/hershey/i.test(src.name + c) && !/after|derived|drawn to/i.test(src.name + c)) return 'hershey';
  if (/CC BY 4\.0/i.test(c)) return 'cc-by-4.0';
  if (/public domain/i.test(c)) return 'public-domain';
  if (/Seedhand/.test(src.name + c)) return 'project';
  return 'other';
}

// A short code for the hand itself, so two hands that share a writer's name (the name comes from the seed alone: the
// same writer in print and in a joined hand, or with another pen) never install as the same font. It is read from
// every value the hand is made of, so the same hand always gets the same code, and any other hand another one.
// Four characters from 31 (no 0/O, 1/I/L): about 920,000 codes for each name.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function stable(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : String(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => k + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
export function handCode(p) {
  const s = stable(p);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h >>>= 0;
  let out = '';
  for (let i = 0; i < 4; i++) { out += CODE_ALPHABET[h % CODE_ALPHABET.length]; h = Math.floor(h / CODE_ALPHABET.length); }
  return out;
}

export function fontNames(p, opts = {}) {
  const writer = opts.name ? String(opts.name).trim() : null;
  const code = handCode(p);
  const fullFamily = opts.family || `${FAMILY_PREFIX} ${writer || ascii(String(p.seed)).replace(/[^A-Za-z0-9]+/g, ' ').trim()} ${code}`;
  // Windows menus want name ID 1 within 31 characters; the full name goes into the typographic family (16)
  let family = fullFamily;
  if (family.length > 31) family = ('ITFY ' + fullFamily.replace(new RegExp('^' + FAMILY_PREFIX + '\\s*'), '')).slice(0, 31).trim();
  const ps = (ascii(fullFamily).replace(/[^A-Za-z0-9]/g, '') || 'IfThisFindsYouHand').slice(0, 54) + '-Regular';
  const file = ascii(fullFamily).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'IfThisFindsYou';
  return { writer, code, fullFamily, family, ps, file };
}

function buildCredits(p, sources) {
  const groups = { hershey: [], 'cc-by-4.0': [], 'public-domain': [], project: [], other: [] };
  const seen = new Set();
  for (const s of sources) {
    // composed letters credit their bases (in the font already) plus the project's conventions: listed once
    const composed = / \+ /.test(s.name);
    const k = composed ? 'project' : licenceOf(s);
    const e = composed ? { name: 'Accented and special letters', credit: `Composed by ${PRODUCT} from each hand's own letters, following the writing conventions collected in the project's research notes (hand-traditions.md §5).` }
      : k === 'project' ? { name: '', credit: branded(s.credit).replace(new RegExp('^' + PRODUCT + ',?\\s*'), '').replace(/^\((.*)\)$/, '$1') }
        : { name: branded(s.name), credit: branded(s.credit), url: s.url };
    const key = k + '|' + e.name + '|' + e.credit;
    if (seen.has(key)) continue;
    seen.add(key);
    groups[k].push(e);
  }
  // the Hershey notice travels with every font: every style's punctuation and symbols derive from it
  return { groups, usesHershey: true, ccBy: groups['cc-by-4.0'].length > 0 };
}

function describe(p, opts, names) {
  const st = getStyle(p.style) || {};
  const joined = !!st.connected;
  // where this writer learned: the tradition (Hershey's two styles stand for no school: their schooling names them)
  const say = (x) => { const s2 = getStyle(x.style); return s2 && s2.tradition && x.style !== 'print' && x.style !== 'script' ? s2.tradition.name : x.label; };
  const [a, b] = traditionsOf(p);
  let school = say(a);
  if (b && say(b) !== say(a)) school += `, with later habits from ${say(b)}`;
  let pen = '';
  try { const pn = getPen(p); pen = pn && (pn.label || pn.name) ? String(pn.label || pn.name).toLowerCase() : ''; } catch (e) { pen = ''; }
  const who = names.writer ? `${names.writer}, a fictional writer` : 'a fictional writer';
  return `The handwriting of ${who} from ${PRODUCT} (${SITE}), made from seed "${p.seed}". ${joined ? 'A joined hand' : 'A print hand'} ` +
    `schooled in ${school}${pen ? `, written with a ${pen}` : ''}. This font carries a few versions of each letter and cycles them as you ` +
    `type (contextual alternates); the website writes every letter fresh.`;
}

// ---------- sfnt writing ----------
function nameTable(records) { // [[nameID, string]] (Windows, Unicode BMP, en-US)
  const recs = records.filter(([, s]) => s != null && s !== '').sort((a, b) => a[0] - b[0]);
  const strs = recs.map(([, s]) => { const w = new W(); for (const ch of String(s)) { const c = ch.codePointAt(0); if (c > 0xffff) { const v = c - 0x10000; w.u16(0xd800 + (v >> 10)).u16(0xdc00 + (v & 1023)); } else w.u16(c); } return w.out(); });
  const w = new W();
  w.u16(0).u16(recs.length).u16(6 + 12 * recs.length);
  let off = 0;
  recs.forEach(([id], i) => { w.u16(3).u16(1).u16(0x409).u16(id).u16(strs[i].length).u16(off); off += strs[i].length; });
  for (const s of strs) w.bytes(s);
  return w.out();
}

function cmapTable(cmap) {
  const codes = [...cmap.keys()].filter((c) => c <= 0xffff).sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < codes.length;) {
    let j = i;
    while (j + 1 < codes.length && codes[j + 1] === codes[j] + 1) j++;
    segs.push(codes.slice(i, j + 1)); i = j + 1;
  }
  const n = segs.length + 1;
  const w = new W();
  const ends = [], starts = [], deltas = [], ranges = [], glyphArr = [];
  segs.forEach((s) => {
    const gid = s.map((c) => cmap.get(c));
    const constant = gid.every((g, k) => g - s[k] === gid[0] - s[0]);
    starts.push(s[0]); ends.push(s[s.length - 1]);
    if (constant) { deltas.push((gid[0] - s[0]) & 0xffff); ranges.push(0); } else {
      deltas.push(0);
      ranges.push(-1 - glyphArr.length); // patched below: offset from this idRangeOffset entry
      glyphArr.push(...gid);
    }
  });
  starts.push(0xffff); ends.push(0xffff); deltas.push(1); ranges.push(0);
  const segX2 = n * 2;
  const searchRange = 2 * Math.pow(2, Math.floor(Math.log2(n)));
  const length = 16 + 8 * n + 2 * glyphArr.length;
  const sub = new W();
  sub.u16(4).u16(length).u16(0).u16(segX2).u16(searchRange).u16(Math.floor(Math.log2(n))).u16(segX2 - searchRange);
  for (const e of ends) sub.u16(e);
  sub.u16(0);
  for (const s of starts) sub.u16(s);
  for (const d of deltas) sub.u16(d);
  ranges.forEach((r, i) => { if (r >= 0) sub.u16(0); else { const idx = -1 - r; sub.u16(2 * (n - i) + 2 * idx); } });
  for (const g of glyphArr) sub.u16(g);
  w.u16(0).u16(2);
  w.u16(0).u16(3).u32(4 + 16);
  w.u16(3).u16(1).u32(4 + 16);
  w.bytes(sub.out());
  return w.out();
}

// CFF (Type 2 charstrings, line segments only)
function cffNumber(w, v) { // DICT integer
  if (v >= -107 && v <= 107) w.u8(v + 139);
  else if (v >= 108 && v <= 1131) { v -= 108; w.u8((v >> 8) + 247).u8(v & 255); } else if (v >= -1131 && v <= -108) { v = -v - 108; w.u8((v >> 8) + 251).u8(v & 255); } else if (v >= -32768 && v <= 32767) w.u8(28).u16(v & 0xffff);
  else w.u8(29).i32(v);
}
function csNumber(w, v) { // charstring integer
  if (v >= -107 && v <= 107) w.u8(v + 139);
  else if (v >= 108 && v <= 1131) { v -= 108; w.u8((v >> 8) + 247).u8(v & 255); } else if (v >= -1131 && v <= -108) { v = -v - 108; w.u8((v >> 8) + 251).u8(v & 255); } else w.u8(28).u16(v & 0xffff);
}
function cffIndex(items) {
  const w = new W();
  w.u16(items.length);
  if (!items.length) return w.out();
  let total = 1; for (const it of items) total += it.length;
  const os = total < 0x100 ? 1 : total < 0x10000 ? 2 : total < 0x1000000 ? 3 : 4;
  w.u8(os);
  const put = (v) => { for (let k = os - 1; k >= 0; k--) w.u8((v >>> (8 * k)) & 255); };
  let o = 1; put(o); for (const it of items) { o += it.length; put(o); }
  for (const it of items) w.bytes(it);
  return w.out();
}
function pathOps(w, polys) { // Type 2 path for polygons, from (0, 0)
  let cx = 0, cy = 0;
  for (const c of polys) {
    csNumber(w, c[0][0] - cx); csNumber(w, c[0][1] - cy); w.u8(21); // rmoveto
    cx = c[0][0]; cy = c[0][1];
    for (let i = 1; i < c.length; i += 24) {
      const n = Math.min(24, c.length - i);
      for (let k = 0; k < n; k++) { const q = c[i + k]; csNumber(w, q[0] - cx); csNumber(w, q[1] - cy); cx = q[0]; cy = q[1]; }
      w.u8(5); // rlineto
    }
  }
}
// a glyph's charstring: its width, then its path (or a call to the local subr holding a path several slots share)
function charstring(g, subrOf, bias) {
  const w = new W();
  if (g.adv) csNumber(w, g.adv);
  const src = g.dupOf || g;
  if (src.polys.length && subrOf.has(src)) { csNumber(w, subrOf.get(src) - bias); w.u8(10); return w.out(); } // callsubr (the subr ends the glyph)
  if (src.polys.length) pathOps(w, src.polys);
  w.u8(14); // endchar
  return w.out();
}
function cffTable(glyphs, meta) {
  const strings = [];
  const sid = (s) => { const i = strings.indexOf(s); if (i >= 0) return 391 + i; strings.push(s); return 390 + strings.length; };
  const sVersion = sid(FONT_VERSION), sNotice = sid(meta.notice.slice(0, 600)), sFull = sid(meta.fullName), sFamily = sid(meta.family), sWeight = sid('Regular');
  const charset = new W().u8(0);
  for (const g of glyphs.slice(1)) charset.u16(sid(g.name));
  const charsetB = charset.out();
  // outlines that several slots show live once, in a local subroutine
  const subrOf = new Map(), subrs = [];
  for (const g of glyphs) if (g.dupOf && !subrOf.has(g.dupOf)) {
    subrOf.set(g.dupOf, subrs.length);
    const w = new W(); pathOps(w, g.dupOf.polys); w.u8(14); subrs.push(w.out());
  }
  const bias = subrs.length < 1240 ? 107 : subrs.length < 33900 ? 1131 : 32768;
  const cs = cffIndex(glyphs.map((g) => charstring(g, subrOf, bias)));
  const subrIdx = subrs.length ? cffIndex(subrs) : new Uint8Array(0);
  const priv = new W(); cffNumber(priv, 0); priv.u8(21); // nominalWidthX 0
  if (subrs.length) { const at = priv.n + 6; priv.u8(29).i32(at); priv.u8(19); } // Subrs, right after this dict
  const privB = priv.out();
  const bb = meta.bbox;
  const top = (o) => { // o: { charset, charStrings, private } offsets
    const w = new W();
    cffNumber(w, sVersion); w.u8(0);
    cffNumber(w, sNotice); w.u8(1);
    cffNumber(w, sFull); w.u8(2);
    cffNumber(w, sFamily); w.u8(3);
    cffNumber(w, sWeight); w.u8(4);
    for (const v of bb) cffNumber(w, v); w.u8(5);
    w.u8(29).i32(o.charset); w.u8(15);
    w.u8(29).i32(o.charStrings); w.u8(17);
    w.u8(29).i32(privB.length); w.u8(29).i32(o.private); w.u8(18);
    return w.out();
  };
  const header = new Uint8Array([1, 0, 4, 4]);
  const nameIdx = cffIndex([new TextEncoder().encode(meta.ps)]);
  const topLen = cffIndex([top({ charset: 0, charStrings: 0, private: 0 })]).length;
  const strIdx = cffIndex(strings.map((s) => new TextEncoder().encode(s)));
  const gsubrs = cffIndex([]);
  const base = header.length + nameIdx.length + topLen + strIdx.length + gsubrs.length;
  const o = { charset: base, charStrings: base + charsetB.length, private: base + charsetB.length + cs.length };
  const topIdx = cffIndex([top(o)]);
  if (topIdx.length !== topLen) throw new Error('fontbuild: CFF top dict size');
  const w = new W(base + charsetB.length + cs.length + privB.length + subrIdx.length);
  w.bytes(header).bytes(nameIdx).bytes(topIdx).bytes(strIdx).bytes(gsubrs).bytes(charsetB).bytes(cs).bytes(privB).bytes(subrIdx);
  return w.out();
}

// TrueType glyf/loca (on-curve points only; a slot repeating a version is a one-component composite of it)
function glyfTables(glyphs) {
  const glyf = new W(1 << 16), loca = [];
  let maxPts = 0, maxCont = 0, comps = 0;
  for (const g of glyphs) {
    loca.push(glyf.n);
    if (g.dupOf) {
      const bb = g.dupOf.bbox;
      glyf.i16(-1).i16(bb[0]).i16(bb[1]).i16(bb[2]).i16(bb[3]);
      glyf.u16(0x0002 | 0x0200).u16(g.dupOf.id).u8(0).u8(0); // ARGS_ARE_XY_VALUES | USE_MY_METRICS, offset 0,0
      glyf.pad4();
      comps = 1;
      continue;
    }
    if (!g.polys.length) continue;
    // TrueType winds outer contours clockwise: the reverse of our y-up counter-clockwise outers
    const cs = g.polys.map((c) => c.slice().reverse());
    const bb = g.bbox;
    glyf.i16(cs.length).i16(bb[0]).i16(bb[1]).i16(bb[2]).i16(bb[3]);
    let n = 0;
    for (const c of cs) { n += c.length; glyf.u16(n - 1); }
    maxPts = Math.max(maxPts, n); maxCont = Math.max(maxCont, cs.length);
    glyf.u16(0); // no instructions
    const flags = [], xs = new W(), ys = new W();
    let px = 0, py = 0, firstPt = true;
    for (const c of cs) for (const [x, y] of c) {
      const dx = x - px, dy = y - py; px = x; py = y;
      let f = 1 | (firstPt && g.overlap ? 0x40 : 0);
      firstPt = false;
      if (dx === 0) f |= 0x10; else if (Math.abs(dx) < 256) { f |= 0x02 | (dx > 0 ? 0x10 : 0); xs.u8(Math.abs(dx)); } else xs.i16(dx);
      if (dy === 0) f |= 0x20; else if (Math.abs(dy) < 256) { f |= 0x04 | (dy > 0 ? 0x20 : 0); ys.u8(Math.abs(dy)); } else ys.i16(dy);
      flags.push(f);
    }
    for (let i = 0; i < flags.length;) {
      let r = 0; while (i + r + 1 < flags.length && flags[i + r + 1] === flags[i] && r < 255) r++;
      if (r > 0) { glyf.u8(flags[i] | 0x08).u8(r); i += r + 1; } else { glyf.u8(flags[i]); i++; }
    }
    glyf.bytes(xs.out()).bytes(ys.out());
    glyf.pad4();
  }
  loca.push(glyf.n);
  const lw = new W(); for (const o of loca) lw.u32(o);
  return { glyf: glyf.out(), loca: lw.out(), maxPts, maxCont, comps };
}

function checksum(b) {
  let s = 0;
  for (let i = 0; i < b.length; i += 4) s = (s + (((b[i] << 24) | ((b[i + 1] || 0) << 16) | ((b[i + 2] || 0) << 8) | (b[i + 3] || 0)) >>> 0)) >>> 0;
  return s;
}
function sfnt(flavor, tables) { // tables: { tag: Uint8Array }
  const tags = Object.keys(tables).sort();
  const n = tags.length;
  const es = Math.floor(Math.log2(n)), sr = 16 * Math.pow(2, es);
  const w = new W();
  w.u32(flavor === 'cff' ? 0x4f54544f : 0x00010000).u16(n).u16(sr).u16(es).u16(n * 16 - sr);
  let off = 12 + 16 * n;
  const at = {};
  for (const t of tags) { at[t] = off; off += (tables[t].length + 3) & ~3; }
  for (const t of tags) w.tag(t).u32(checksum(tables[t])).u32(at[t]).u32(tables[t].length);
  for (const t of tags) { w.bytes(tables[t]); w.pad4(); }
  const out = w.out();
  const adj = (0xb1b0afba - checksum(out)) >>> 0;
  const h = at.head + 8;
  out[h] = adj >>> 24; out[h + 1] = (adj >>> 16) & 255; out[h + 2] = (adj >>> 8) & 255; out[h + 3] = adj & 255;
  return out;
}

const CREATED = Date.UTC(2026, 10, 2) / 1000 + 2082844800; // seconds since 1904 (fixed: same hand, same bytes)
function writeFont(flavor, org, meta, layout) {
  const { glyphs, cmap } = org;
  const nG = glyphs.length;
  const T = {};
  const bb = meta.bbox;
  const head = new W();
  head.u16(1).u16(0).fixed(parseFloat(FONT_VERSION)).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(1000)
    .u32(Math.floor(CREATED / 4294967296)).u32(CREATED >>> 0).u32(Math.floor(CREATED / 4294967296)).u32(CREATED >>> 0)
    .i16(bb[0]).i16(bb[1]).i16(bb[2]).i16(bb[3]).u16(0).u16(8).i16(2).i16(flavor === 'cff' ? 0 : 1).i16(0);
  T.head = head.out();
  let advMax = 0, minL = 32767, minR = 32767, maxExt = -32768, sumAdv = 0, nAdv = 0;
  const hm = new W();
  for (const g of glyphs) {
    const lsb = g.polys.length ? g.bbox[0] : 0;
    hm.u16(g.adv).i16(lsb);
    advMax = Math.max(advMax, g.adv);
    if (g.polys.length) { minL = Math.min(minL, g.bbox[0]); minR = Math.min(minR, g.adv - g.bbox[2]); maxExt = Math.max(maxExt, g.bbox[2]); }
    if (g.adv > 0) { sumAdv += g.adv; nAdv++; }
  }
  T.hmtx = hm.out();
  const rise = meta.slant ? 1000 : 1, run = meta.slant ? Math.round(1000 * Math.tan(meta.slant * Math.PI / 180)) : 0;
  T.hhea = new W().u16(1).u16(0).i16(meta.ascender).i16(meta.descender).i16(0).u16(advMax).i16(minL).i16(minR).i16(maxExt)
    .i16(rise).i16(run).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(nG).out();
  const os2 = new W();
  const xh = meta.xHeight, cap = meta.capHeight;
  os2.u16(4).i16(Math.round(sumAdv / Math.max(1, nAdv))).u16(400).u16(5).u16(0)
    .i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350)
    .i16(Math.max(20, Math.round(meta.stroke))).i16(Math.round(xh * 0.5))
    .i16(10 << 8)
    .bytes(new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    .u32(meta.uni[0]).u32(meta.uni[1]).u32(meta.uni[2]).u32(meta.uni[3])
    .tag('ITFY').u16(0x00c0).u16(meta.firstChar).u16(meta.lastChar)
    .i16(meta.ascender).i16(meta.descender).i16(0).u16(meta.winAscent).u16(meta.winDescent)
    .u32(meta.codepages).u32(0).i16(Math.round(xh)).i16(Math.round(cap)).u16(0).u16(32).u16(meta.maxContext);
  T['OS/2'] = os2.out();
  T.name = meta.nameTable;
  T.cmap = cmapTable(cmap);
  const post = new W().u32(flavor === 'cff' ? 0x00030000 : 0x00020000).fixed(-(meta.slant || 0)).i16(-Math.round(meta.stroke * 1.4) - 60).i16(Math.max(20, Math.round(meta.stroke * 0.6))).u32(0).u32(0).u32(0).u32(0).u32(0);
  if (flavor !== 'cff') {
    post.u16(nG);
    const names = [];
    for (const g of glyphs) { if (g.name === '.notdef') post.u16(0); else { post.u16(258 + names.length); names.push(g.name); } }
    for (const nm of names) { post.u8(nm.length); for (let i = 0; i < nm.length; i++) post.u8(nm.charCodeAt(i)); }
  }
  T.post = post.out();
  if (layout.gsub) T.GSUB = layout.gsub;
  if (layout.gpos) T.GPOS = layout.gpos;
  if (layout.gdef) T.GDEF = layout.gdef;
  if (flavor === 'cff') {
    T.maxp = new W().u32(0x00005000).u16(nG).out();
    T['CFF '] = cffTable(glyphs, meta);
  } else {
    const gl = glyfTables(glyphs);
    T.glyf = gl.glyf; T.loca = gl.loca;
    T.maxp = new W().u32(0x00010000).u16(nG).u16(gl.maxPts).u16(gl.maxCont).u16(gl.comps ? gl.maxPts : 0).u16(gl.comps ? gl.maxCont : 0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(gl.comps).u16(gl.comps).out();
    T.gasp = new W().u16(1).u16(1).u16(0xffff).u16(0x000f).out();
  }
  return sfnt(flavor, T);
}

// OS/2 Unicode ranges and code pages from what the font maps
function unicodeRanges(codes) {
  const r = [0, 0, 0, 0];
  const set = (bit) => { r[bit >> 5] |= (1 << (bit & 31)) >>> 0; };
  for (const c of codes) {
    if (c < 0x80) set(0); else if (c < 0x100) set(1); else if (c < 0x180) set(2); else if (c < 0x250) set(3);
    else if (c >= 0x2b0 && c < 0x300) set(5); else if (c >= 0x300 && c < 0x370) set(6); else if (c >= 0x1e00 && c < 0x1f00) set(29);
    else if (c >= 0x2000 && c < 0x2070) set(31); else if (c >= 0x20a0 && c < 0x20d0) set(33); else if (c >= 0x2100 && c < 0x2150) set(37);
    else if (c >= 0x2200 && c < 0x2300) set(38);
  }
  return r.map((v) => v >>> 0);
}
function codePages(codes) {
  const s = new Set(codes);
  const all = (str) => [...str].every((ch) => s.has(ch.codePointAt(0)));
  let cp = 0;
  if (all('éüñßÆÐ')) cp |= 1 << 0;            // Latin 1
  if (all('ąćęłńśźżčďěňřšťůž')) cp |= 1 << 1; // Latin 2: Eastern Europe
  if (all('ğİıŞş')) cp |= 1 << 4;              // Turkish
  if (all('āčēģīķļņšūž')) cp |= 1 << 7;        // Baltic
  if (all('éüñ')) cp |= 1 << 29;               // Macintosh character set (Roman)
  return cp >>> 0;
}

// ---------- the public API ----------

/**
 * Build the hand's font files.
 * @param _opentype  ignored (kept so older callers' buildFont(opentype, p, opts) still work)
 * @param params     effective hand params (withOverrides(...))
 * @param opts       { name: writer's name, family?, alts: samples per letter (default 4 joined, 5 print), minorAlts: 2,
 *                     clipper: the clipper-lib module (merges overlaps; without it strokes overlap, which renders fine),
 *                     ttf: true, kern: true, calt: true, chars?: [...] (default GF Latin Core), tolerance: 0.75,
 *                     clock?: a function returning milliseconds (the caller's own timer; fills info.ms) }
 * @returns { otf: Uint8Array, ttf: Uint8Array|null, buffer: ArrayBuffer (the .otf), info, names, credits }
 */
export function buildFont(_opentype, params, opts) {
  opts = Object.assign({}, opts || {});
  // timings only when the caller passes a clock (the engine never reads the time itself: output must not depend on it)
  const nowMs = typeof opts.clock === 'function' ? opts.clock : () => 0;
  const p = params;
  const t0 = nowMs();
  const plan = planFont(p, opts);
  const drawn = drawPlan(plan, opts);
  const t1 = nowMs();
  const org = organise(plan, drawn);
  const gsub = compileGSUB(plan, org, opts);
  const gpos = opts.kern === false ? null : compileGPOS(plan, org, opts);
  const gdef = compileGDEF(org);
  const t2 = nowMs();
  const names = fontNames(p, opts);
  const credits = buildCredits(p, drawn.sources);
  // vertical metrics: cover every glyph's ink, so nothing clips (lines come out a little looser than a book face)
  let yMin = 0, yMax = 0, xMin = 0, xMax = 0;
  for (const g of org.glyphs) if (g.polys.length) { xMin = Math.min(xMin, g.bbox[0]); yMin = Math.min(yMin, g.bbox[1]); xMax = Math.max(xMax, g.bbox[2]); yMax = Math.max(yMax, g.bbox[3]); }
  const ascender = Math.max(800, Math.ceil((yMax + 12) / 10) * 10), descender = Math.min(-200, Math.floor((yMin - 12) / 10) * 10);
  const st = getStyle(p.style) || {};
  const built = st.tradition && Number.isFinite(st.tradition.slant) ? st.tradition.slant : p.style === 'script' ? 15 : 0;
  const slantDeg = Math.round(((p.slant || 0) + built) * 10) / 10;
  const codes = [...org.cmap.keys()];
  const desc = describe(p, opts, names);
  const licence = `This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: ${OFL_URL}`;
  const creditLine = [
    credits.usesHershey ? 'Letter skeletons and symbols derive in part from the Hershey fonts. ' + HERSHEY_NOTICE : '',
    credits.ccBy ? 'Includes letter shapes traced from handwriting licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): ' +
      credits.groups['cc-by-4.0'].map((s) => s.credit + (s.url ? ' <' + s.url + '>' : '')).join('; ') + '. Traced and redrawn by a generator; see CREDITS.txt.' : '',
    credits.groups['public-domain'].length ? 'Public-domain models: ' + [...new Set(credits.groups['public-domain'].map((s) => s.name))].join('; ') + '.' : '',
  ].filter(Boolean).join(' ');
  const year = opts.year || 2026;
  const copyright = `Copyright ${year} The ${PRODUCT} Project Authors (${SITE}).`;
  const fullName = names.fullFamily + ' Regular';
  const meta = {
    family: names.family, fullName, ps: names.ps, notice: copyright + ' ' + creditLine,
    bbox: [xMin, yMin, xMax, yMax], ascender, descender, winAscent: Math.max(ascender, yMax), winDescent: Math.max(-descender, -yMin),
    slant: Math.abs(slantDeg) >= 3 ? slantDeg : 0, xHeight: p.xHeight * CAP, capHeight: CAP, stroke: p.penWidth || 50,
    uni: unicodeRanges(codes), codepages: codePages(codes),
    firstChar: Math.min(...codes.filter((c) => c <= 0xffff)), lastChar: Math.min(0xffff, Math.max(...codes)), maxContext: 2,
  };
  meta.nameTable = nameTable([
    [0, copyright + ' ' + (credits.usesHershey ? HERSHEY_NOTICE : '')],
    [1, names.family], [2, 'Regular'],
    [3, `${FONT_VERSION};ITFY;${names.ps};${p.seed}`],
    [4, names.family === names.fullFamily ? fullName : names.family + ' Regular'],
    [5, `Version ${FONT_VERSION}; seed ${p.seed}; ${p.style}`],
    [6, names.ps], [8, PRODUCT], [9, `${PRODUCT}${names.writer ? ` (the hand of ${names.writer}, a fictional writer)` : ''}`],
    [10, desc], [11, SITE], [12, SITE], [13, licence + '\n\n' + creditLine], [14, OFL_URL],
    [16, names.family === names.fullFamily ? null : names.fullFamily], [17, names.family === names.fullFamily ? null : 'Regular'],
    [19, 'If this finds you, write back.'],
  ]);
  for (const g of org.glyphs) g.overlap = !drawn.merged && g.polys.length > 1;
  const layout = { gsub: gsub.bytes, gpos: gpos && gpos.bytes, gdef };
  const otf = writeFont('cff', org, meta, layout);
  const ttf = opts.ttf === false ? null : writeFont('ttf', org, meta, layout);
  const t3 = nowMs();
  const info = {
    family: names.fullFamily, postscript: names.ps, file: names.file, writer: names.writer, seed: p.seed, style: p.style,
    joined: plan.joined, glyphs: org.glyphs.length, characters: plan.chars.length, alternates: plan.N,
    forms: plan.entries.reduce((n, e) => n + e.forms.filter((f) => !f.alias).length, 0),
    lifts: plan.liftsOn, features: gsub.features.concat(gpos && gpos.bytes ? ['kern'] : []), kernPairs: gpos ? gpos.pairs : 0,
    merged: !!opts.clipper, bytes: otf.length, sizes: { otf: otf.length, ttf: ttf ? ttf.length : 0 },
    ascender, descender, ms: { draw: Math.round(t1 - t0), layout: Math.round(t2 - t1), write: Math.round(t3 - t2), total: Math.round(t3 - t0) },
    contextTries: plan.stats.tries, contextMisses: plan.stats.misses, droppedStrokes: plan.stats.dropped,
  };
  return { otf, ttf, buffer: otf.buffer.slice(otf.byteOffset, otf.byteOffset + otf.byteLength), font: null, info, names, credits, meta: { description: desc, copyright, licence, creditLine } };
}

// Re-read the bytes and report what's really in the file (the old opentype.js check still works when it's passed in).
export function verify(opentype, buffer) {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const u16 = (o) => (b[o] << 8) | b[o + 1], u32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  const res = { ok: false, tables: [], glyphs: 0, features: [], outlines: null };
  try {
    const n = u16(4), T = {};
    for (let i = 0; i < n; i++) { const o = 12 + 16 * i; T[tag(o)] = { off: u32(o + 8), len: u32(o + 4 + 8) }; }
    res.tables = Object.keys(T);
    res.outlines = T['CFF '] ? 'cff' : T.glyf ? 'truetype' : null;
    res.glyphs = T.maxp ? u16(T.maxp.off + 4) : 0;
    if (T.GSUB) { const g = T.GSUB.off, fl = g + u16(g + 6), fc = u16(fl); for (let i = 0; i < fc; i++) res.features.push(tag(fl + 2 + 6 * i)); }
    if (T.GPOS) res.features.push('kern');
    res.ok = !!(res.outlines && res.glyphs > 1 && T.cmap && T.name && T.head && T.hhea && T.hmtx && T['OS/2'] && T.post);
    if (opentype && opentype.parse) {
      try { const f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); res.family = f.names.fontFamily && f.names.fontFamily.en; res.opentype = true; } catch (e) { res.opentype = false; res.opentypeError = String(e && e.message || e); }
    }
  } catch (e) { res.ok = false; res.error = String(e && e.message || e); }
  return res;
}

// ---------- the download: a zip with the fonts, README, LICENSE and CREDITS ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function deflateRaw(data) {
  if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined' || typeof Response === 'undefined') return null;
  try {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) { return null; }
}
// files: [{ name, data: Uint8Array | string }] -> zip bytes (deflated where the platform can, fixed dates)
export async function makeZip(files, opts = {}) {
  const enc = new TextEncoder();
  const time = 12 << 11, date = ((2026 - 1980) << 9) | (11 << 5) | 2; // 2 Nov 2026, 12:00 (same input, same bytes)
  const le = () => { const a = []; const o = { u16: (v) => { a.push(v & 255, (v >>> 8) & 255); return o; }, u32: (v) => { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); return o; }, bytes: (b) => { for (const x of b) a.push(x); return o; }, out: () => Uint8Array.from(a) }; return o; };
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const name = enc.encode(f.name);
    const crc = crc32(data);
    let comp = opts.store ? null : await (opts.deflate || deflateRaw)(data);
    let method = 8;
    if (!comp || comp.length >= data.length) { comp = data; method = 0; }
    const h = le().u32(0x04034b50).u16(20).u16(0x0800).u16(method).u16(time).u16(date).u32(crc).u32(comp.length).u32(data.length)
      .u16(name.length).u16(0).bytes(name).out();
    parts.push(h, comp);
    central.push(le().u32(0x02014b50).u16(0x0314).u16(20).u16(0x0800).u16(method).u16(time).u16(date).u32(crc).u32(comp.length)
      .u32(data.length).u16(name.length).u16(0).u16(0).u16(0).u16(0).u32(0o100644 << 16).u32(off).bytes(name).out());
    off += h.length + comp.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = le().u32(0x06054b50).u16(0).u16(0).u16(files.length).u16(files.length).u32(cdSize).u32(off).u16(0).out();
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let at = 0; for (const a of all) { out.set(a, at); at += a.length; }
  return out;
}

const wrap = (text, width = 96) => text.split('\n').map((line) => {
  const m = line.match(/^(\s*(?:- )?)(.*)$/);
  const lead = m[1], pad = ' '.repeat(lead.length);
  const out = []; let cur = lead;
  for (const w of m[2].split(' ')) {
    if (cur.length > lead.length && (cur + ' ' + w).length > width) { out.push(cur); cur = pad + w; } else cur = cur.length > lead.length ? cur + ' ' + w : cur + w;
  }
  out.push(cur);
  return out.join('\n');
}).join('\n');

export function readmeText(built, opts = {}) {
  const { info, names } = built;
  const fam = names.fullFamily;
  const n = info.alternates;
  const files = [`${info.file}-Regular.otf`].concat(built.ttf ? [`${info.file}-Regular.ttf`] : []).concat(opts.woff2 ? [`${info.file}-Regular.woff2`] : []);
  return wrap([
    fam,
    '='.repeat(fam.length),
    '',
    built.meta.description,
    '',
    `Files: ${files.join(', ')}. To install, you only need one: the .otf suits most apps, the .ttf suits older Windows apps.${opts.woff2 ? ' The .woff2 is for websites.' : ''}`,
    '',
    'How to install',
    '--------------',
    '- Mac: double-click the .otf file, then click Install Font (Font Book opens).',
    '- Windows: right-click the .otf (or .ttf) file and choose Install.',
    '- Linux: copy the .otf to ~/.local/share/fonts, then run: fc-cache -f',
    '- Restart any app that was already open, so it sees the new font.',
    `- It appears in font menus as "${names.family}".`,
    '',
    'Making it look handwritten',
    '--------------------------',
    `The font uses contextual alternates. They pick each letter's form from its neighbours${info.joined ? ' (how it joins, and how words start and end)' : ''} and cycle ${n} versions of each letter, so no two neighbours match. Most apps turn them on by default: Pages, TextEdit, Keynote, web browsers, Figma, Affinity and InDesign.`,
    '- Microsoft Word: Format > Font > Advanced, then tick "Use Contextual Alternates".',
    `- Apps that ignore them show one version of each letter${info.joined ? ', still joined' : ''}.`,
    `- Stylistic sets 1 to ${Math.max(1, n - 1)} switch every letter to one of the other versions.`,
    '',
    'An honest note',
    '--------------',
    `On the website every letter is written fresh, so no two are ever quite the same. A font file can only hold a few versions of each letter, so this one cycles ${n} of them. It's the same writer, with a smaller supply of ink.`,
    '',
    'Licence',
    '-------',
    'SIL Open Font License 1.1 (LICENSE.txt). You may use, embed, share and change it, for personal and commercial work. The one thing you cannot do is sell the font file on its own. The letters come from public-domain copybooks, the Hershey fonts and openly licensed handwriting; CREDITS.txt lists every source. Thank you to every writer.',
    '',
    `${PRODUCT}, ${SITE}`,
    '',
  ].join('\n'));
}

export function creditsText(built) {
  const { credits, names } = built;
  const G = credits.groups;
  const lines = [`Credits for ${names.fullFamily}`, '', `${PRODUCT} writes fictional writers' hands from real handwriting traditions. This font's`,
    'letters were generated from the sources below. Every one of them is credited, whether or not its licence asks for it.', ''];
  const block = (title, list, note) => {
    if (!list.length) return;
    lines.push(title, '-'.repeat(title.length));
    if (note) lines.push(note, '');
    for (const s of list) lines.push(`- ${s.name}`, `  ${s.credit}`, ...(s.url ? [`  ${s.url}`] : []));
    lines.push('');
  };
  block('Openly licensed handwriting (CC BY 4.0)', G['cc-by-4.0'],
    'Licence: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/\n' +
    'Changes: letter skeletons were traced from the photographs, then redrawn, varied and outlined by a generator. No endorsement by the writers or the projects is implied. The material is provided as-is, without warranties.');
  block('Public-domain copybooks and models', G['public-domain'], 'No restrictions apply; credited with thanks.');
  lines.push('The Hershey fonts', '-----------------', 'Symbols, punctuation and some letter skeletons derive from the Hershey fonts. Their terms ask that this acknowledgement travels with the data:', '', '  ' + HERSHEY_NOTICE, '',
    'The data may be converted into any format except the original U.S. NTIS one. This font is not in that format.', '');
  if (G.project.length) {
    const t = `Drawn by ${PRODUCT}`;
    lines.push(t, '-'.repeat(t.length), 'Letter forms drawn for the project after real traditions, released with the font under the same licence:', '');
    for (const s of G.project) lines.push(`- ${s.name ? s.name + ': ' : ''}${s.credit}`);
    lines.push('');
  }
  block('Other', G.other);
  lines.push('Full source list and how each one shaped the project: the reference library (docs/ in the project repository).', '');
  return wrap(lines.join('\n'));
}

export function licenceText(year = 2026) {
  return `Copyright ${year} The ${PRODUCT} Project Authors (${SITE})\n\n` + OFL_TEXT;
}

/**
 * The download for one hand: a zip with the .otf, .ttf, README.txt, LICENSE.txt and CREDITS.txt.
 * Same options as buildFont, plus woff2: async (ttfBytes) => woff2Bytes (optional; e.g. wawoff2's compress).
 * @returns Promise<{ zip: Uint8Array, filename, files: [{ name, data }], info }>
 */
export async function buildFontPackage(params, opts = {}) {
  const nowMs = typeof opts.clock === 'function' ? opts.clock : () => 0;
  const t0 = nowMs();
  const built = buildFont(null, params, opts);
  built.p = params;
  const base = built.info.file;
  const dir = base + '/';
  const files = [{ name: `${dir}${base}-Regular.otf`, data: built.otf }];
  if (built.ttf) files.push({ name: `${dir}${base}-Regular.ttf`, data: built.ttf });
  if (opts.woff2 && built.ttf) { try { files.push({ name: `${dir}${base}-Regular.woff2`, data: await opts.woff2(built.ttf) }); } catch (e) { /* optional */ } }
  files.push({ name: `${dir}README.txt`, data: readmeText(built, opts) });
  files.push({ name: `${dir}LICENSE.txt`, data: licenceText(opts.year) });
  files.push({ name: `${dir}CREDITS.txt`, data: creditsText(built) });
  const t1 = nowMs();
  const zip = await makeZip(files, opts);
  const t2 = nowMs();
  const info = { ...built.info, zipBytes: zip.length, ms: { ...built.info.ms, font: built.info.ms.total, zip: Math.round(t2 - t1), total: Math.round(t2 - t0) } };
  return { zip, filename: `${base}.zip`, files, info, built };
}

const OFL_TEXT = `This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) and the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
`;
