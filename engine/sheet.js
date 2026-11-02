// sheet.js — Ink mode: typing that behaves like ink (docs/research/writing-experience.md §3–§5).
//
// You edit like a computer user; the writer corrects like a person. Every keystroke becomes intent, and a
// small planner turns it into what this writer would do on paper: strike it through, write a letter over
// another, add a word above the line with a caret, start a fresh sheet. What is written never moves.
//
//   const doc = newInkDoc({ seed, style, salt });          // plain JSON; doc.log is the append-only ink log
//   let sheet = replay(p, doc, layoutOpts);                 // sheet.page renders with renderSVG / renderCanvas
//   let view = newView();                                   // the unwritten text the app keeps between calls
//   ({ events, view } = plan(sheet, view, edit));           // edit = { at, del, ins, kind } on the textarea
//   apply(sheet, events);                                   // appends to doc.log; nothing placed moves
//   ({ events, view } = penStep(sheet, view, { dt, idle })); apply(sheet, events);   // the pen catches up
//   textarea.value === viewText(sheet, view)                // logicalText(sheet.reader) + what isn't written yet
//
// The pen trails the typing (§3.2): typed text waits in `view.tail` (at the end) or `view.mid` (an
// insertion being typed mid-text) until penStep writes it, so most typos are fixed before ink touches
// paper. Backspace on ink at the pen head opens `view.pending`: the pen hovers until a word boundary or
// 1.2 s idle, then the writer overwrites the letter or strikes the word and writes it again.
//
// Placement. Each sheet's main text (everything written at the pen head, struck words included) goes
// through layout() with an explicit firstBaseline; layout is prefix-stable (finished words never move when
// text is appended), so new glyphs take their place from it and placed glyphs are frozen. A word written
// in two goes that then no longer fits keeps its written part, gets a hyphen, and continues on the next
// line. Corrections are placed from the frozen glyphs when their event arrives (marks.js).
//
// Determinism: the same log gives byte-identical pages, live or replayed in one go. Mark randomness:
// 'sheet:' + seed + ':' + salt + ':' + event index; letter instances 'ink:' + salt + ':…'; planner rolls
// 'plan:' + seed + ':' + salt + ':' + event count (new namespaces).

import { rng, clamp, lerp } from './core.js';
import { makeGlyph, withOverrides, has, CAP, UPM } from './hand.js';
import { layout } from './layout.js';
import { createReader } from './inklog.js';
import {
  fixHabits, coverQuality, spanOf, baselineOf, scaleOf, repen, reink, rotScale, markItem, strikeItems,
  underlineStrokes, slashStrokes, blotItem, overItem, insertionItems,
} from './marks.js';

export const INK_VERSION = 'seedhand-ink-1';

export function newInkDoc({ seed, style, overrides, salt, paper, mode } = {}) {
  return { v: 1, ev: INK_VERSION, salt: salt == null ? '' : String(salt), hand: { seed, style, o: overrides }, paper: paper || { kind: 'plain' }, mode: mode || 'ink', log: [] };
}
export const newView = () => ({ tail: '', mid: null, pending: null, budget: 0 });

// ---------- replaying the log onto paper ----------
function createState(p, doc, opts) {
  const lo = Object.assign({}, opts);
  if (lo.firstBaseline == null) lo.firstBaseline = 0.95 * UPM; // explicit, so layout stays prefix-stable
  const st = {
    p, doc, opts: lo, H: fixHabits(p), salt: doc.salt || '',
    reader: createReader(), sheets: [], cur: null, blocks: new Map(), boost: null,
    firm: withOverrides(p, { pressure: clamp((p.pressure || 0.4) * 1.2 + 0.05, 0, 1) }),    // people cross out firmly
    final: null, lcache: new Map(), page: null,
  };
  st.heavy = withOverrides(p, { penWidth: p.penWidth * st.H.overWeight, pressure: clamp((p.pressure || 0.4) + 0.2, 0, 1) });
  newSheet(st, 'first');
  return st;
}
function newStream(s, tag, opts) {
  return { key: s.n + tag, tag, opts, text: '', ids: [], raw: new Map(), shifts: new Map(), last: null, T: null };
}
function newSheet(st, why) {
  const s = { n: st.sheets.length, why, items: [], placed: new Map(), at: new Map() };
  s.main = newStream(s, 'm', st.opts);
  s.ps = null;
  s.stream = s.main;
  st.sheets.push(s);
  st.cur = s;
  st.blocks = new Map();
  return s;
}

// The whole log, from scratch.
export function replay(p, doc, layoutOpts = {}) {
  const st = createState(p, doc, layoutOpts);
  run(st, doc.log || [], 0);
  return finish(st);
}
// New events: appended to doc.log and placed. Returns the same (updated) state.
export function apply(st, events) {
  if (!events || !events.length) return st;
  const ev0 = st.doc.log.length;
  for (const e of events) st.doc.log.push(e);
  run(st, events, ev0);
  return finish(st);
}
// Undo the wet tail (§4.5): drop the newest event and replay.
export function dropLast(st) {
  st.doc.log.pop();
  return replay(st.p, st.doc, st.opts);
}

function run(st, events, ev0) {
  // A write that a later write in this batch continues mid-word gets a layout of its own; every other
  // write reads its places from one layout of the batch's final text (layout is prefix-stable).
  const info = [], texts = new Map(), lastWrite = new Map();
  let si = st.sheets.length - 1, tag = st.cur.stream.tag;
  const textOf = (key) => {
    if (texts.has(key)) return texts.get(key);
    const s = st.sheets[+key.slice(0, -1)];
    const S = s ? (key.endsWith('p') ? s.ps : s.main) : null;
    return S ? S.text : '';
  };
  events.forEach((e, i) => {
    if (e.t === 'sheet') { si++; tag = 'm'; return; }
    if (e.t === 'move') { tag = 'p'; return; }
    if (e.t !== 'write' && e.t !== 'break') return;
    const key = si + tag, text = textOf(key), add = e.t === 'break' ? '\n' : e.text || '';
    const lw = lastWrite.get(key);
    // (a write marked `cont` runs straight on into the next one, no pause: lay the word out whole)
    if (lw != null && !events[lw].cont && text.length && !/\s/.test(text[text.length - 1]) && add && !/\s/.test(add[0])) info[lw].open = true;
    texts.set(key, text + add);
    info[i] = { key, open: false };
    lastWrite.set(key, i);
  });
  st.final = texts;
  st.lcache = new Map();
  events.forEach((e, i) => applyOne(st, e, ev0 + i, info[i]));
  st.final = null;
  st.lcache = new Map();
}

const R0 = (st, ev, k = '') => rng('sheet:' + st.p.seed + ':' + st.salt + ':' + ev + k);
const pushItem = (st, s, it) => {
  it.base = it.role || null; // what it was made as (finish() derives struck / wrong from the text)
  if (it.id != null && !['over', 'retrace', 'hyphen', 'mark'].includes(it.role)) { s.placed.set(it.id, it); s.at.set(it.id, s.items.length); }
  s.items.push(it);
};
const glyphs = (list) => list.filter((it) => it && it.kind === 'glyph' && it.g);
const xhOf = (st) => st.p.xHeight * CAP;

function applyOne(st, e, ev, info) {
  const R = st.reader, s = st.cur, p = st.p, H = st.H;
  const first = R.nextId;
  R.apply(e);
  switch (e.t) {
    case 'write': case 'break':
      writeToStream(st, s, s.stream, e.t === 'break' ? '\n' : e.text || '', first, ev, info);
      break;
    case 'strike': {
      const struck = [];
      for (let id = e.from; id <= e.to; id++) { const it = s.placed.get(id); if (it && it.g && it.g.strokes.length) struck.push(it); }
      if (!struck.length) break;
      const r = R0(st, ev);
      const { items, start, ref } = strikeItems(p, st.firm, H, struck, e.how || H.strike, r, { seed: 311 + ev * 0.77, key: 'e' + ev });
      for (const it of items) pushItem(st, s, Object.assign(it, { ev }));
      if (e.blot && start) { const b = blotItem(p, start[0] - 0.02 * UPM, start[1] + 0.25 * xhOf(st), ref, r, ev, { key: 'e' + ev + ':blot' }); if (b) pushItem(st, s, Object.assign(b, { ev })); }
      break;
    }
    case 'over': {
      const wr = s.placed.get(e.at);
      if (!wr || !wr.g) break;
      const S = streamOf(s, wr), c = wr.written;
      const ctx = { prev: c > 0 ? S.text[c - 1] : null, next: S.text[c + 1] || null, index: 0, wordStart: !(c > 0 && /\S/.test(S.text[c - 1])), wordEnd: !/\S/.test(S.text[c + 1] || ' ') };
      const r = R0(st, ev);
      const it = overItem(p, st.heavy, H, wr, e.ch, ctx, 'ink:' + st.salt + ':o' + ev, r);
      pushItem(st, s, Object.assign(it, { key: 'o' + ev, ev, id: e.at }));
      if (e.blot) {
        const sp = spanOf([wr]);
        const b = blotItem(p, (sp.x0 + sp.x1) / 2 + (r() - 0.3) * 0.15 * UPM, wr.y - (0.2 + 0.5 * r()) * xhOf(st), wr, r, ev, { key: 'o' + ev + ':blot' });
        if (b) pushItem(st, s, Object.assign(b, { ev }));
      }
      break;
    }
    case 'insert': placeInsert(st, s, e, ev, first); break;
    case 'mark': {
      if (e.kind !== 'split' && e.kind !== 'para') break;
      const { left, right } = neighbours(st, s, e.after);
      const a = left || right;
      if (!a) break;
      const r = R0(st, ev);
      const la = spanOf([a]);
      const cx = left && right && right.line === left.line ? (la.x1 + spanOf([right]).x0) / 2 : left ? la.x1 + 0.08 * UPM : la.x0 - 0.08 * UPM;
      const xh = xhOf(st) * scaleOf([a]);
      const mi = markItem(p, e.kind, slashStrokes(e.kind, cx, baselineOf([a]), xh, r), a, { seed: 401 + ev, tempo: 1.2, key: 'e' + ev, wk: 'e' + ev });
      if (mi) pushItem(st, s, Object.assign(mi, { ev }));
      break;
    }
    case 'underline': {
      const run = [];
      for (let id = e.from; id <= e.to; id++) { const it = s.placed.get(id); if (it && it.g && it.g.strokes.length) run.push(it); }
      const byLine = new Map();
      for (const it of run) { if (!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); }
      let n = 0;
      for (const ln of byLine.values()) {
        const r = R0(st, ev, ':' + n);
        const sp = spanOf(ln), xh = xhOf(st) * scaleOf(ln);
        const mi = markItem(st.firm, 'underline', underlineStrokes(H, sp.x0, sp.x1, baselineOf(ln), xh, r), ln[ln.length - 1], { seed: 733 + ev, delayed: true, tempo: 1.3, key: 'e' + ev + ':' + n++ });
        if (mi) pushItem(st, s, Object.assign(mi, { ev }));
      }
      break;
    }
    case 'pen': penEvent(st, s, e, ev); break;
    case 'move': if (e.to === 'ps') startPS(st, s, e, ev); break;
    case 'sheet': newSheet(st, e.why); break;
    default: break;
  }
}
const streamOf = (s, it) => (it.role === 'ps' && s.ps ? s.ps : s.main);

// ---------- the main text: frozen placement ----------
function shiftAt(S, line, c) {
  const list = S.shifts.get(line);
  if (!list) return { dx: 0, dy: 0 };
  let best = null;
  for (const sh of list) if (sh.from <= c) best = sh;
  return best || { dx: 0, dy: 0 };
}
function addShift(S, line, from, dx, dy) {
  if (!S.shifts.has(line)) S.shifts.set(line, []);
  S.shifts.get(line).push({ from, dx, dy });
}
function layoutFor(st, S, info) {
  const text = info && !info.open && st.final && st.final.has(S.key) ? st.final.get(S.key) : S.text;
  const k = S.key + '|' + text;
  let L = st.lcache.get(k);
  if (!L) { L = layout(st.p, text, S.opts); st.lcache.set(k, L); }
  if (!S.last || text.length >= S.lastLen) { S.last = L; S.lastLen = text.length; }
  return L;
}

function writeToStream(st, s, S, text, firstId, ev, info) {
  const start = S.text.length;
  let id = firstId;
  for (const ch of text) { S.ids.push(id); if (ch.length === 2) S.ids.push(-1); id++; }
  S.text += text;
  if (!/\S/.test(text)) return; // spaces and breaks leave no ink
  const L = layoutFor(st, S, info);
  const end = S.text.length;
  const fresh = L.items.filter((it) => it.charIndex >= start && it.charIndex < end);
  if (!fresh.length) return;
  const extra = [];
  // a word written in two goes: did its written part move in this layout?
  if (start > 0 && /\S/.test(S.text[start - 1]) && /\S/.test(S.text[start])) {
    let ko = start - 1;
    while (ko > 0 && !S.raw.has(ko) && /\S/.test(S.text[ko - 1])) ko--;
    const kr = S.raw.get(ko);
    const Lk = kr && L.items.find((it) => it.charIndex === ko && !it.synthetic);
    if (Lk) {
      const sh = shiftAt(S, Lk.line, ko);
      if (Lk.line === kr.line) {
        if (Math.abs(Lk.x + sh.dx - kr.x) > 0.5 || Math.abs(Lk.y + sh.dy - kr.y) > 0.5) addShift(S, Lk.line, start, kr.x - Lk.x, kr.y - Lk.y);
      } else {
        // it no longer fits: the written part stays, a hyphen ends that line, the rest starts the next
        let t0 = start - 1;
        while (t0 > 0 && /\S/.test(S.text[t0 - 1])) t0--;
        const Lt = L.items.find((it) => it.charIndex === t0 && it.line === fresh[0].line);
        const Lf = fresh[0];
        if (Lt) addShift(S, Lf.line, start, Lt.x - Lf.x, Lt.y - Lf.y);
        const k = s.placed.get(S.ids[ko]);
        const hy = k && hyphenAfter(st, k, ev);
        if (hy) extra.push(hy);
      }
    }
  }
  for (const it of extra) pushItem(st, s, it);
  const boost = st.boost;
  for (const it0 of fresh) {
    const c = it0.charIndex;
    const sh = shiftAt(S, it0.line, c);
    const raw = { x: it0.x + sh.dx, y: it0.y + sh.dy, line: it0.line };
    S.raw.set(c, raw);
    const gid = S.ids[c];
    let it = Object.assign({}, it0, { x: raw.x, y: raw.y, id: gid, key: 'g' + gid, ev, written: c, sheet: s.n, wk: S.tag + it0.word });
    if (it0.synthetic) Object.assign(it, { id: undefined, key: 'h' + gid + ':' + c, role: 'hyphen' });
    if (S.T) it = toPS(st, S, it);
    if (boost && it.g && it.g.strokes.length) {
      // fresh ink after the pen ran dry: darker for a couple of words, a fountain pen's first touch pools
      const f = lerp(1.28, 1, clamp(boost.k / 12, 0, 1)), wet = boost.k === 0 && boost.kind === 'fountain';
      it.g = reink(st.p, it.g, (pr, si) => { for (let i = 0; i < pr.n; i++) pr.d[i] *= f * (wet && si === 0 ? 1 + 0.9 * Math.exp(-((pr.s[i] / (0.7 * (pr.w[0] || 30))) ** 2)) : 1); });
      if (++boost.k > 12) st.boost = null;
    }
    pushItem(st, s, it);
  }
}

function hyphenAfter(st, k, ev) {
  const p = st.p;
  if (!has(p, '-')) return null;
  const pose = k.g.pose || {};
  const g = makeGlyph(p, '-', { seed: 'ink:' + st.salt + ':hy' + k.id, amount: 1, scale: 0.85 * (pose.scale || 1) });
  const a = k.rot || 0, adv = k.g.advance || 0;
  const rg = repen(p, g, rotScale(a, 1), 71 + k.id * 0.3);
  return Object.assign({}, k, { ch: '-', g: rg, x: k.x + adv * Math.cos(a), y: k.y - adv * Math.sin(a), id: undefined, key: 'h' + k.id, role: 'hyphen', ev });
}

// ---------- P.S. ----------
function startPS(st, s, e, ev) {
  const r = R0(st, ev);
  const size = e.size || st.H.psSize;
  const ink = spanOf(glyphs(s.items));
  const L = s.main.last;
  const maxW = st.opts.maxWidth || 12000;
  const T = {
    s: size, tilt: st.H.psTilt * (Math.PI / 180) * (0.4 + 0.6 * r()),
    ox: (L && L.lineInfo && L.lineInfo[0] ? L.lineInfo[0].x0 : 0) + r() * 0.3 * UPM,
    oy: (Number.isFinite(ink.y1) ? ink.y1 : st.opts.firstBaseline) + (0.25 + 0.25 * r()) * UPM + st.p.ascender * CAP * size,
    fb: st.opts.firstBaseline,
    line0: 1 + Math.max(-1, ...s.items.map((it) => it.line)),
    para0: 1 + Math.max(-1, ...s.items.map((it) => it.para)),
  };
  s.ps = newStream(s, 'p', Object.assign({}, st.opts, { maxWidth: maxW / size, ruled: false }));
  s.ps.T = T;
  s.stream = s.ps;
}
function toPS(st, S, it) {
  const T = S.T, c = Math.cos(T.tilt), sn = Math.sin(T.tilt);
  const lx = it.x * T.s, ly = (it.y - T.fb) * T.s;
  const o = Object.assign({}, it, { x: T.ox + lx * c + ly * sn, y: T.oy - lx * sn + ly * c, rot: (it.rot || 0) + T.tilt, line: T.line0 + it.line, para: T.para0 + it.para, role: it.role || 'ps', tempo: (it.tempo || 1) * 1.15 });
  if (it.g) o.g = repen(st.p, it.g, rotScale(T.tilt, T.s), 1013 + (it.id || 0) * 1.7);
  return o;
}

// ---------- insertions above the line ----------
// the placed glyphs either side of glyph `after` in reading order (main text, not other insertions)
function neighbours(st, s, after) {
  const recs = st.reader.recs;
  const k = after < 0 ? -1 : recs.indexOf(st.reader.byId.get(after));
  let left = null, right = null;
  for (let i = k; i >= 0 && !left; i--) { const it = s.placed.get(recs[i].id); if (it && it.g && it.g.strokes.length && it.role !== 'insert') left = it; }
  for (let i = k + 1; i < recs.length && !right; i++) { const it = s.placed.get(recs[i].id); if (it && it.g && it.g.strokes.length && it.role !== 'insert') right = it; }
  return { left, right };
}
function placeInsert(st, s, e, ev, firstId) {
  const p = st.p, H = st.H;
  const r = R0(st, ev);
  const maxW = st.opts.maxWidth || 12000;
  const seedOf = (i) => 'ink:' + st.salt + ':' + (firstId + i);
  const cont = st.blocks.get(e.after);
  let res;
  if (cont) res = insertionItems(p, H, { cont, text: e.text, seedOf, maxW, r });
  else {
    let sub = null;
    if (e.over) { sub = []; for (let id = e.over[0]; id <= e.over[1]; id++) { const it = s.placed.get(id); if (it && it.g && it.g.strokes.length) sub.push(it); } }
    let { left, right } = neighbours(st, s, e.after);
    if (sub && sub.length) left = sub[sub.length - 1];
    if (!left && right) left = right; // inserting before everything: over the first word
    if (!left) { // nothing on paper yet to anchor to: write it as plain text at the pen head
      writeToStream(st, s, s.stream, e.text, firstId, ev, null);
      return;
    }
    const ref = { line: left.line, para: left.para, inkIndex: left.inkIndex, word: left.word, wk: 'i' + ev, tempo: (left.tempo || 1) * 1.1, ev, key: 'e' + ev, sheet: s.n };
    const above = s.items.filter((it) => it.line === left.line - 1 && it.role !== 'mark');
    res = insertionItems(p, H, { left, right: right && right !== left ? right : null, sub, above, text: e.text, seedOf, maxW, r, ref });
  }
  let id = firstId;
  const chars = Array.from(e.text);
  let ci = 0;
  for (const it of res.items) {
    if (it.role === 'mark') { pushItem(st, s, Object.assign(it, { ev })); continue; }
    const gid = id + ci++;
    if (it.ch === ' ' || !it.g || !it.g.strokes.length) continue;
    pushItem(st, s, Object.assign(it, { id: gid, key: 'g' + gid, ev, sheet: s.n }));
  }
  st.blocks.delete(e.after);
  st.blocks.set(firstId + chars.length - 1, res.block);
}

// ---------- the pen: dry, retrace, restart (the journey's ink touches) ----------
function penEvent(st, s, e, ev) {
  const p = st.p, H = st.H;
  if (e.kind === 'restart') { st.boost = { k: 0, kind: H.pen }; return; }
  const run = [];
  for (let id = e.from; id <= e.to; id++) { const it = s.placed.get(id); if (it && it.g && it.g.strokes.length) run.push(it); }
  if (e.kind === 'dry') {
    run.forEach((it, k) => {
      const t = run.length > 1 ? k / (run.length - 1) : 1;
      const f = lerp(1, H.dryLow, Math.min(1, t * 1.15) ** 2 * (3 - 2 * Math.min(1, t * 1.15)));
      const g = reink(p, it.g, (pr) => {
        for (let i = 0; i < pr.n; i++) {
          let v = f;
          if (H.pen === 'ballpoint' || H.pen === 'gel') v *= 1 - 0.7 * t * clamp((p.noise.n1(pr.s[i] / 60 + k * 3.7) - 0.15) / 0.3, 0, 1); // skips
          pr.d[i] *= v;
        }
        if (H.pen === 'felt') { for (let i = 0; i < pr.n; i++) pr.w[i] *= 1 - 0.12 * t; return true; } // a drying felt tip narrows
        return false;
      });
      const at = s.at.get(it.id);
      const nu = Object.assign({}, it, { g });
      if (at != null) s.items[at] = nu;
      s.placed.set(it.id, nu);
    });
  } else if (e.kind === 'retrace') {
    const r = R0(st, ev);
    const jx = r.gauss() * 0.01 * UPM, jy = r.gauss() * 0.01 * UPM;
    run.forEach((it, k) => pushItem(st, s, Object.assign({}, it, { g: repen(p, it.g, (q) => [q[0] + jx, q[1] + jy], 811 + k), role: 'retrace', key: 'r' + ev + ':' + it.id, ev, wk: 'r' + ev, tempo: (it.tempo || 1) * 1.15 })));
  }
}

// ---------- the page ----------
function finish(st) {
  const s = st.cur, R = st.reader;
  // what each glyph is now: struck, written over, still standing
  const at = new Map();
  let n = 0;
  for (const r of R.recs) { if (r.struck || r.joined) at.set(r.id, -1); else { at.set(r.id, n); n += (r.over || r.ch).length; } }
  let wordNo = -1, prev = null;
  for (const it of s.items) {
    let role = it.base;
    if (it.id != null && role !== 'mark' && role !== 'over' && role !== 'retrace' && role !== 'hyphen') {
      const rec = R.byId.get(it.id);
      if (rec && rec.struck) role = 'struck';
      else if (rec && rec.over) role = 'wrong';
    }
    if (role) it.role = role; else delete it.role;
    it.at = it.id != null && it.role !== 'mark' ? (at.has(it.id) ? at.get(it.id) : -1) : -1;
    if (it.wk !== prev) { wordNo++; prev = it.wk; }
    it.word = wordNo;
  }
  const L = s.main.last;
  const ink = spanOf(glyphs(s.items));
  const height = Math.max(L ? L.height : 0, Number.isFinite(ink.y1) ? ink.y1 + 0.35 * UPM : 0);
  const misses = (L ? L.misses : []).concat(s.ps && s.ps.last ? s.ps.last.misses : []);
  const base = L || { lineHeight: st.opts.lineHeight || 1.6 * UPM, rules: [], lineInfo: [], xh: xhOf(st), seed: st.p.seed, connected: false };
  st.page = Object.assign({}, base, {
    items: s.items, height, width: st.opts.maxWidth || base.width, lines: 1 + Math.max(-1, ...s.items.map((it) => it.line)),
    words: wordNo + 1, misses, sheet: s.n, sheets: st.sheets.length, seed: st.p.seed,
    full: !!(st.opts.pageHeight && Number.isFinite(ink.y1) && ink.y1 > st.opts.pageHeight),
  });
  return st;
}

// a page for an earlier sheet (drafts set aside by a fresh sheet or a fair copy)
export function sheetPage(st, n) {
  if (n === st.cur.n) return st.page;
  const s = st.sheets[n];
  if (!s) return null;
  const L = s.main.last;
  const ink = spanOf(glyphs(s.items));
  return Object.assign({}, L || {}, { items: s.items, height: Math.max(L ? L.height : 0, Number.isFinite(ink.y1) ? ink.y1 + 0.35 * UPM : 0), sheet: n, seed: st.p.seed });
}

// ---------- the view: what the textarea shows ----------
// logical text (pending deletions taken out) + the insertion being typed (mid) + the unwritten tail.
// units[i] says where character i of that text lives: { k: 'ink', id } | { k: 'mid', j } | { k: 'tail', j }
function viewMap(R, view) {
  const pend = new Set(view.pending ? view.pending.ids : []);
  const units = [];
  let text = '', midStart = -1;
  const put = (str, mk) => { for (let j = 0; j < str.length; j++) units.push(mk(j)); text += str; };
  const putMid = () => { midStart = text.length; put(view.mid.text, (j) => ({ k: 'mid', j })); };
  if (view.mid && view.mid.after < 0) putMid();
  for (const r of R.recs) {
    if (!r.struck && !r.joined && !pend.has(r.id)) put(r.over || r.ch, (j) => ({ k: 'ink', id: r.id, half: j > 0 }));
    if (view.mid && view.mid.after === r.id) putMid();
  }
  if (view.mid && midStart < 0) putMid(); // its anchor was struck away: keep it where it was typed (the end)
  const tailStart = text.length;
  put(view.tail, (j) => ({ k: 'tail', j }));
  return { text, units, tailStart, midStart, midEnd: midStart < 0 ? -1 : midStart + view.mid.text.length };
}
export function viewText(st, view) { return viewMap(st.reader, view || newView()).text; }

const copyView = (v) => ({ tail: v.tail || '', mid: v.mid ? Object.assign({}, v.mid) : null, pending: v.pending ? { ids: v.pending.ids.slice() } : null, budget: v.budget || 0 });
const isLetter = (c) => /^[\p{L}\p{N}'’]$/u.test(c || '');
const cps = (s) => Array.from(s).length;

// group ids into runs of consecutive numbers (a strike covers an id range)
function idRuns(ids) {
  const sorted = ids.slice().sort((a, b) => a - b), runs = [];
  for (const id of sorted) { const r = runs[runs.length - 1]; if (r && id === r[1] + 1) r[1] = id; else runs.push([id, id]); }
  return runs;
}

// ---------- the planner (§3.5): an edit -> what the writer does ----------
// edit: { at, del, ins, kind } on viewText(st, view) (UTF-16 offsets). Pure: returns { events, view }.
export function plan(st, view, edit, opts = {}) {
  const R = st.reader.clone(), H = st.H;
  const events = [];
  let v = copyView(view || newView());
  const emit = (e) => { events.push(e); R.apply(e); };
  const roll = () => rng('plan:' + st.p.seed + ':' + st.salt + ':' + (st.doc.log.length + events.length))();
  const at = edit.at | 0, del = edit.del | 0, ins = edit.ins || '';
  let m = viewMap(R, v);
  const inRange = (u) => u.k;
  // 1. only unwritten text: edit it freely, nothing is ink yet
  const touched = m.units.slice(at, at + del).map(inRange);
  if (at >= m.tailStart && touched.every((k) => k === 'tail')) {
    const o = at - m.tailStart;
    v.tail = v.tail.slice(0, o) + ins + v.tail.slice(o + del);
    return { events, view: v };
  }
  if (v.mid && m.midStart >= 0 && at >= m.midStart && at + del <= m.midEnd && touched.every((k) => k === 'mid')) {
    const o = at - m.midStart;
    v.mid.text = v.mid.text.slice(0, o) + ins + v.mid.text.slice(o + del);
    if (!v.mid.text) v.mid = null;
    return { events, view: v };
  }
  // 2. ink is involved. Settle what's in flight elsewhere first: an insertion being typed, a pending fix
  const units = m.units;
  const inkAfter = units.slice(at + del).some((u) => u.k === 'ink' || u.k === 'mid');
  const headDelete = !inkAfter && touched.includes('ink') && edit.kind !== 'cut';
  if (v.mid) { flushMid(R, v, emit); m = viewMap(R, v); }
  if (v.pending && !headDelete) { resolvePending(st, R, v, emit); m = viewMap(R, v); }
  const ids = [];
  const tailCut = [];
  for (let i = at; i < at + del; i++) {
    const u = m.units[i];
    if (!u) continue;
    if (u.k === 'ink' && !u.half) ids.push(u.id);
    else if (u.k === 'tail') tailCut.push(u.j);
  }
  if (tailCut.length) { const a = Math.min(...tailCut), b = Math.max(...tailCut) + 1; v.tail = v.tail.slice(0, a) + v.tail.slice(b); }
  // 2a. Backspace (or select + type) at the pen head: the pen hovers; resolved by penStep (§3.4)
  if (headDelete && ids.length && ids.length <= 24) {
    v.pending = { ids: ids.concat(v.pending ? v.pending.ids : []) };
    if (ins) v.tail = ins + v.tail;
    return { events, view: v };
  }
  if (ids.length) {
    const visible = m.units.filter((u) => u.k === 'ink' && !u.half).length;
    // 2b. most of the sheet deleted: nobody strikes a whole page. A fresh sheet; what's left gets rewritten
    if (!ins && ids.length >= 8 && ids.length >= 0.6 * visible) {
      const keep = m.text.slice(0, at) + m.text.slice(at + del);
      emit({ t: 'sheet', why: 'fresh' });
      return { events, view: { tail: keep, mid: null, pending: null, budget: v.budget } };
    }
    const old = R.byId.get(ids[0]);
    const one = ids.length === 1 && cps(ins) === 1 && old && isLetter(old.over || old.ch) && isLetter(ins);
    // 2c. one letter for one letter that covers it: written over, heavier (J→G)
    if (one && coverQuality(old.over || old.ch, ins) >= 0.5 && roll() < H.overwrite) { emit({ t: 'over', at: ids[0], ch: ins }); return { events, view: v }; }
    // 2d. struck in place (one stroke per run); a replacement is written above the struck run
    const how = ids.length >= 14 && H.strike === 'loops' ? H.strikeAlt : H.strike;
    for (const [a, b] of idRuns(ids)) emit({ t: 'strike', from: a, to: b, how, why: ins ? 'replaced' : 'deleted' });
    if (ins) v.mid = { after: ids[ids.length - 1], text: ins, over: [Math.min(...ids), Math.max(...ids)] };
    return { events, view: v };
  }
  // 2e. typing in the middle: a split "/", a new-paragraph "//", or an insertion above the line
  if (ins) {
    const prev = at > 0 ? m.units[at - 1] : null, next = m.units[at];
    let after = -1;
    for (let i = at - 1; i >= 0; i--) if (m.units[i].k === 'ink') { after = m.units[i].id; break; }
    const prevCh = at > 0 ? m.text[at - 1] : '', nextCh = m.text[at] || '';
    if (ins === '\n' && prev && prev.k === 'ink') { emit({ t: 'mark', after, kind: 'para' }); return { events, view: v }; }
    if (ins === ' ' && prev && next && prev.k === 'ink' && next.k === 'ink' && isLetter(prevCh) && isLetter(nextCh)) { emit({ t: 'mark', after, kind: 'split' }); return { events, view: v }; }
    v.mid = { after, text: ins };
  }
  return { events, view: v };
}

function flushMid(R, v, emit) {
  if (!v.mid) return;
  if (v.mid.text) emit(Object.assign({ t: 'insert', after: v.mid.after, text: v.mid.text }, v.mid.over ? { over: v.mid.over } : {}));
  v.mid = null;
}

// The writer fixes what was deleted at the pen head (§3.4–3.5): overwrite one letter that the new one
// covers, strike the whole word and write it again, strike just the run and carry on, or (nothing typed
// again) simply strike it.
function resolvePending(st, R, v, emit) {
  const H = st.H;
  const ids = v.pending.ids;
  v.pending = null;
  if (!ids.length) return;
  const roll = (k) => rng('plan:' + st.p.seed + ':' + st.salt + ':' + R.events + ':' + k)();
  const rep = (v.tail.match(/^[\p{L}\p{N}'’]*/u) || [''])[0];
  const old = R.byId.get(ids[0]);
  const how = roll('s') < H.scribbleWords * 0.5 ? 'scribble' : H.strike;
  if (ids.length === 1 && rep && old && isLetter(old.ch)) {
    const ch = Array.from(rep)[0];
    if (coverQuality(old.over || old.ch, ch) >= 0.5 && roll('o') < H.overwrite) {
      emit({ t: 'over', at: ids[0], ch });
      v.tail = v.tail.slice(ch.length);
      return;
    }
  }
  const sorted = ids.slice().sort((a, b) => a - b);
  if (!rep) { for (const [a, b] of idRuns(sorted)) emit({ t: 'strike', from: a, to: b, how, why: 'deleted' }); return; }
  // the letters of the word still standing before the deleted run
  const recs = R.recs;
  let k = recs.indexOf(R.byId.get(sorted[0]));
  const prefix = [];
  for (let i = k - 1; i >= 0; i--) {
    const r = recs[i];
    if (r.struck || r.joined) continue;
    if (!isLetter(r.over || r.ch)) break;
    prefix.unshift(r);
  }
  v.tail = v.tail.slice(rep.length);
  if (!prefix.length || roll('w') < H.wordStrike) {
    // strike the whole word, then write it again after a space (the space is struck with it, so the
    // text reads on cleanly: "~teh~ the")
    const sep = R.nextId;
    emit({ t: 'write', text: ' ' });
    for (const [a, b] of idRuns([...prefix.map((r) => r.id), ...sorted, sep])) emit({ t: 'strike', from: a, to: b, how, why: 'rewritten' });
    emit({ t: 'write', text: prefix.map((r) => r.over || r.ch).join('') + rep });
  } else {
    for (const [a, b] of idRuns(sorted)) emit({ t: 'strike', from: a, to: b, how, why: 'rewritten' });
    emit({ t: 'write', text: rep });
  }
}

// ---------- the pen (§3.2): what can be written now ----------
// opts: { dt (ms since the last step; omit = no speed limit), idle (ms since the last keystroke),
//   forgiving (default true: hold back the last 2 characters until 700 ms idle), touch (hold back the
//   unfinished word until 1.2 s idle: mobile autocorrect), final (write everything now), speed (chars/s) }
// The pen writes at ~2 characters a second and speeds up to ~4× when far behind.
export function penStep(st, view, opts = {}) {
  const R = st.reader.clone();
  const events = [];
  const v = copyView(view || newView());
  const emit = (e) => { events.push(e); R.apply(e); };
  const idle = opts.idle == null ? Infinity : opts.idle;
  const final = !!opts.final;
  // 1. a fix at the pen head: hover until a word boundary or 1.2 s idle
  if (v.pending) {
    const rep = (v.tail.match(/^[\p{L}\p{N}'’]*/u) || [''])[0];
    if (final || v.tail.length > rep.length || idle >= 1200) resolvePending(st, R, v, emit);
    else return { events, view: v };
  }
  // 2. what the pen may write, at handwriting speed
  let allow = Infinity;
  if (opts.dt != null && !final) {
    const behind = cps(v.tail) + (v.mid ? cps(v.mid.text) : 0);
    const speed = (opts.speed || 2) * (1 + Math.min(3, Math.max(0, behind - 6) / 4));
    v.budget = Math.min(8, (v.budget || 0) + opts.dt / 1000 * speed);
    allow = Math.floor(v.budget);
  }
  const ready = (text) => {
    const c = Array.from(text);
    let n = c.length;
    if (!final && opts.forgiving !== false && idle < 700) n = Math.max(0, n - 2);
    if (!final && opts.touch && idle < 1200) { let k = n; while (k > 0 && /\S/.test(c[k - 1])) k--; n = k; }
    n = Math.min(n, allow);
    // a hand writes words: stop at the last word boundary, unless the word is long and the pen idle-free
    if (!final && idle < 700 && n < c.length) {
      let k = n;
      while (k > 0 && /\S/.test(c[k - 1])) k--;
      if (k > 0 || n < 6) n = k;
    }
    return c.slice(0, n).join('');
  };
  if (v.mid && v.mid.text) {
    const chunk = ready(v.mid.text);
    if (chunk) {
      const first = R.nextId;
      emit(Object.assign({ t: 'insert', after: v.mid.after, text: chunk }, v.mid.over ? { over: v.mid.over } : {}));
      allow -= cps(chunk);
      v.budget -= cps(chunk);
      const rest = v.mid.text.slice(chunk.length);
      v.mid = rest ? { after: first + cps(chunk) - 1, text: rest } : null;
    }
  }
  if (v.tail && !v.mid) {
    const chunk = ready(v.tail);
    if (chunk) {
      chunk.split('\n').forEach((part, i) => { if (i) emit({ t: 'break' }); if (part) emit({ t: 'write', text: part }); });
      v.tail = v.tail.slice(chunk.length);
      if (opts.dt != null && !final) v.budget -= cps(chunk);
    }
  }
  return { events, view: v };
}

// ---------- commands ----------
// "Make a fair copy" (§3.3): a fresh sheet with the letter written out cleanly.
export function fairCopy(st) {
  const text = textNow(st);
  const events = [{ t: 'sheet', why: 'fair' }];
  text.split('\n').forEach((part, i) => { if (i) events.push({ t: 'break' }); if (part) events.push({ t: 'write', text: part }); });
  return events;
}
// "Add a P.S." (§3.4): the pen moves below the text; what's typed next is written there, smaller.
export function postScript(st) {
  const text = textNow(st);
  return (text && !text.endsWith('\n') ? [{ t: 'break' }] : []).concat([{ t: 'move', to: 'ps' }]);
}
function textNow(st) { return st.reader.recs.filter((r) => !r.struck && !r.joined).map((r) => r.over || r.ch).join(''); }
