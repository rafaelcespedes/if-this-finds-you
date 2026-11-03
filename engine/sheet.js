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
// Placement. Each sheet's main text (everything written at the pen head, struck words included) is written
// by layout's inkPage: every write continues from the pen state, letters keyed by writing order, so it
// lands exactly where one pass would and nothing written ever moves; a word continued after a pause that
// no longer fits gets a hyphen and carries on, on the next line. Corrections are placed from the frozen
// letters when their event arrives (marks.js): marks are items of kind 'mark', overwrites and insertions
// are written with layout's writeAt on the line's own curve (lineBaseline).
//
// Determinism: the same log gives byte-identical pages, live or replayed in one go. Mark randomness:
// 'sheet:' + seed + ':' + salt + ':' + event index; letter instances 'ink:' + salt + ':…'; planner rolls
// 'plan:' + seed + ':' + salt + ':' + event count (new namespaces).

import { rng, clamp, lerp } from './core.js';
import { withOverrides, CAP, UPM } from './hand.js';
import { inkPage, pageMetrics } from './layout.js';
import { createReader } from './inklog.js';
import {
  fixHabits, coverQuality, spanOf, baselineFor, scaleOf, repen, reink, markItem, strikeItems,
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
  delete lo.start; delete lo.ink;
  // explicit, so nothing written ever moves (a page written in pieces can't move down afterwards)
  if (lo.firstBaseline == null) lo.firstBaseline = pageMetrics(p).firstBaseline;
  const st = {
    p, doc, opts: lo, H: fixHabits(p), salt: doc.salt || '',
    reader: createReader(), sheets: [], cur: null, blocks: new Map(), boost: null,
    firm: withOverrides(p, { pressure: clamp((p.pressure || 0.4) * 1.2 + 0.05, 0, 1) }),    // people cross out firmly
    page: null,
  };
  st.heavy = withOverrides(p, { penWidth: p.penWidth * st.H.overWeight, pressure: clamp((p.pressure || 0.4) + 0.2, 0, 1) });
  newSheet(st, 'first');
  return st;
}
// A stream is text written in order at one pen head (the sheet's main text, or its P.S.), placed by
// layout's inkPage: each write continues from where the pen stopped, keyed by writing order, so it lands
// exactly where one pass would and nothing already written moves (a continued word that no longer fits
// gets a hyphen and carries on, on the next line).
function newStream(st, s, tag, opts, lineBase = 0, paraBase = 0) {
  return { tag, text: '', ids: [], ink: inkPage(st.p, Object.assign({}, opts, { salt: st.salt + (tag === 'p' ? ':ps' : '') })), pages: [], lineBase, paraBase };
}
function newSheet(st, why) {
  const s = { n: st.sheets.length, why, items: [], placed: new Map(), at: new Map(), runs: [], stopSrc: [], lines: new Map(), rules: [] };
  s.main = newStream(st, s, 'm', st.opts);
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
  if (doc.complete) st.ahead = aheadOf(doc.log || []);
  (doc.log || []).forEach((e, i) => applyOne(st, e, i));
  st.ahead = null;
  return finish(st);
}
// A finished letter (doc.complete: the journey, which every letter in the app goes through) is laid out
// knowing what comes next, so layout can set it out as a letter (a closing block, a P.S. set apart, a
// name at the end): for each write, the rest of its stream's text from the later writes. Live Ink mode
// doesn't pass this: what the pen hasn't reached isn't in the log, and a replay must equal what was seen.
function aheadOf(log) {
  const out = new Map(), streams = new Map();
  let sheet = 0, tag = 'm';
  log.forEach((e, i) => {
    if (e.t === 'sheet') { sheet++; tag = 'm'; return; }
    if (e.t === 'move' && e.to === 'ps') { tag = 'p'; return; }
    if (e.t !== 'write' && e.t !== 'break') return;
    const k = sheet + tag;
    if (!streams.has(k)) streams.set(k, []);
    streams.get(k).push([i, e.t === 'break' ? '\n' : e.text || '']);
  });
  for (const list of streams.values()) {
    let rest = '';
    for (let j = list.length - 1; j >= 0; j--) { out.set(list[j][0], rest); rest = list[j][1] + rest; }
  }
  return out;
}
// New events: appended to doc.log and placed. Returns the same (updated) state.
export function apply(st, events) {
  if (!events || !events.length) return st;
  const ev0 = st.doc.log.length;
  for (const e of events) st.doc.log.push(e);
  events.forEach((e, i) => applyOne(st, e, ev0 + i));
  return finish(st);
}
// Undo the wet tail (§4.5): drop the newest event and replay.
export function dropLast(st) {
  st.doc.log.pop();
  return replay(st.p, st.doc, st.opts);
}

const R0 = (st, ev, k = '') => rng('sheet:' + st.p.seed + ':' + st.salt + ':' + ev + k);
const NOT_PLACED = new Set(['over', 'retrace', 'hyphen', 'mark']);
const pushItem = (st, s, it) => {
  it.base = it.role || null; // what it was made as (finish() derives struck / wrong from the text)
  if (it.id != null && !NOT_PLACED.has(it.role)) { s.placed.set(it.id, it); s.at.set(it.id, s.items.length); }
  if (it.kind === 'mark') s.runs.push(markRun(it, s.items.length));
  s.items.push(it);
};
// A correction mark is a run of its own (one item, frame at the mark's origin, no turn or lean), so run
// renderers (renderRun / runChanges / the pen's paintPen) draw, ink and animate it like a word. Its id
// changes only when its drawing does (a hash of its key and centerlines); pid also says where it sits.
function markRun(it, i) {
  let h = 2166136261;
  const mix = (v) => { h ^= v; h = Math.imul(h, 16777619); };
  for (const ch of String(it.key)) mix(ch.charCodeAt(0));
  for (const st of it.g.strokes) for (const q of st.center) { mix(Math.round(q[0]) | 0); mix(Math.round(q[1]) | 0); }
  const sp = spanOf([it]), pad = st0pad(it);
  it.box = [sp.x0 - pad, sp.y0 - pad, sp.x1 + pad, sp.y1 + pad];
  const id = 'mark:' + (h >>> 0).toString(36);
  return { id, pid: id + '@' + Math.round(it.x) + ',' + Math.round(it.y), key: it.key, line: it.line, from: i, to: i + 1, x: it.x, y: it.y, a: 0, k: 0, box: it.box.slice(), mark: true };
}
// half the widest pen width in a mark (its outline reaches that far past the centerline)
const st0pad = (it) => { let w = 0; for (const st of it.g.strokes) { const pr = st.contour && st.contour.ink; if (pr) for (let k = 0; k < pr.n; k++) w = Math.max(w, pr.w[k]); } return w / 2 + 2; };
// runs from a write, re-indexed to where its items landed in the sheet
const addRuns = (s, runs, base, lineBase = 0) => { for (const rn of runs) s.runs.push(Object.assign({}, rn, { from: rn.from + base, to: rn.to + base, line: rn.line + lineBase })); };
const inky = (it) => it && (it.kind === 'glyph' || it.kind === 'mark') && it.g;
const xhOf = (st) => st.p.xHeight * CAP;
const placedRun = (s, from, to) => { const out = []; for (let id = from; id <= to; id++) { const it = s.placed.get(id); if (it && it.g && it.g.strokes.length) out.push(it); } return out; };

function applyOne(st, e, ev) {
  const R = st.reader, s = st.cur, p = st.p, H = st.H;
  const first = R.nextId;
  R.apply(e);
  switch (e.t) {
    case 'write': case 'break':
      writeToStream(st, s, s.stream, e.t === 'break' ? '\n' : e.text || '', first, ev, st.ahead ? { ahead: st.ahead.get(ev) || '', complete: true } : undefined);
      break;
    case 'strike': {
      const struck = placedRun(s, e.from, e.to);
      if (!struck.length) break;
      const r = R0(st, ev);
      const { items, start, ref } = strikeItems(p, st.firm, H, struck, e.how || H.strike, r, { seed: 311 + ev * 0.77, key: 'e' + ev, lines: s.lines });
      for (const it of items) pushItem(st, s, Object.assign(it, { ev }));
      if (e.blot && start) { const b = blotItem(p, start[0] - 0.02 * UPM, start[1] + 0.25 * xhOf(st), ref, r, ev, { key: 'e' + ev + ':blot' }); if (b) pushItem(st, s, Object.assign(b, { ev })); }
      break;
    }
    case 'over': {
      const wr = s.placed.get(e.at);
      if (!wr || !wr.g) break;
      const r = R0(st, ev);
      const res = overItem(p, st.heavy, H, wr, e.ch, 'fix:' + st.salt + ':' + ev, r);
      if (!res) break;
      const base = s.items.length;
      pushItem(st, s, Object.assign(res.item, { ev, id: e.at, sheet: s.n }));
      addRuns(s, res.runs, base);
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
      const mi = markItem(p, e.kind, slashStrokes(e.kind, cx, baselineFor(p, [a], s.lines), xh, r), a, { seed: 401 + ev, tempo: 1.2, key: 'e' + ev, wk: 'e' + ev });
      if (mi) pushItem(st, s, Object.assign(mi, { ev }));
      break;
    }
    case 'underline': {
      const byLine = new Map();
      for (const it of placedRun(s, e.from, e.to)) { if (!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); }
      let n = 0;
      for (const ln of byLine.values()) {
        const r = R0(st, ev, ':' + n);
        const sp = spanOf(ln), xh = xhOf(st) * scaleOf(ln);
        const mi = markItem(st.firm, 'underline', underlineStrokes(H, sp.x0, sp.x1, baselineFor(p, ln, s.lines), xh, r), ln[ln.length - 1], { seed: 733 + ev, delayed: true, tempo: 1.3, key: 'e' + ev + ':' + n++ });
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

// ---------- the text: written where the pen is ----------
function writeToStream(st, s, S, text, firstId, ev, wopts) {
  let id = firstId;
  for (const ch of text) { S.ids.push(id); if (ch.length === 2) S.ids.push(-1); id++; }
  S.text += text;
  const pg = wopts ? S.ink.write(text, wopts) : S.ink.write(text);
  S.pages.push(pg);
  for (const ln of pg.lineInfo) s.lines.set(ln.n + S.lineBase, S.lineBase ? Object.assign({}, ln, { n: ln.n + S.lineBase }) : ln);
  if (pg.rules) for (const y of pg.rules) if (!s.rules.includes(y)) s.rules.push(y);
  s.stopSrc.push({ S, stops: pg.stops });
  const base = s.items.length;
  const boost = st.boost;
  for (const it0 of pg.items) {
    const c = it0.charIndex;
    const gid = it0.synthetic ? undefined : S.ids[c];
    const it = Object.assign({}, it0, { id: gid, ev, written: c, sheet: s.n, wk: S.tag + it0.word, key: S.tag === 'p' ? 'ps:' + it0.key : it0.key });
    if (S.lineBase) Object.assign(it, { line: it0.line + S.lineBase, para: it0.para + S.paraBase });
    if (it0.synthetic) it.role = 'hyphen';
    else if (S.tag === 'p') it.role = 'ps';
    if (boost && it.g && it.g.strokes.length) {
      // fresh ink after the pen ran dry: darker for a couple of words, a fountain pen's first touch pools
      const f = lerp(1.28, 1, clamp(boost.k / 12, 0, 1)), wet = boost.k === 0 && boost.kind === 'fountain';
      const darker = (pr, si) => { for (let i = 0; i < pr.n; i++) pr.d[i] *= f * (wet && si === 0 ? 1 + 0.9 * Math.exp(-((pr.s[i] / (0.7 * (pr.w[0] || 30))) ** 2)) : 1); };
      it.g = reink(st.p, it.g, darker);
      if (it.glyph) it.glyph = reink(st.p, it.glyph, darker); // run renderers draw the unposed letter
      if (++boost.k > 12) st.boost = null;
    }
    pushItem(st, s, it);
  }
  addRuns(s, pg.runs, base, S.lineBase);
}

// ---------- P.S. ----------
// The pen moves below the text and writes smaller (layout's size), a little in from the margin.
function startPS(st, s, e, ev) {
  const r = R0(st, ev);
  const size = e.size || st.H.psSize;
  const ink = spanOf(s.items.filter(inky));
  const l0 = s.lines.get(0);
  const pitch = st.opts.lineHeight || pageMetrics(st.p).pitch;
  const opts = Object.assign({}, st.opts, {
    ruled: false, size, lineHeight: pitch * size, marginLeft: (l0 ? l0.x0 : 0) + r() * 0.3 * UPM,
    firstBaseline: (Number.isFinite(ink.y1) ? ink.y1 : st.opts.firstBaseline) + (0.25 + 0.25 * r()) * UPM + st.p.ascender * CAP * size,
  });
  const lineBase = 1 + Math.max(-1, ...s.items.map((it) => it.line)), paraBase = 1 + Math.max(-1, ...s.items.map((it) => it.para || 0));
  s.ps = newStream(st, s, 'p', opts, lineBase, paraBase);
  s.stream = s.ps;
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
  const seed = 'fix:' + st.salt + ':' + ev;
  const cont = st.blocks.get(e.after);
  let res, ref;
  if (cont) { ref = cont.ref; res = insertionItems(p, H, { cont, text: e.text, seed, maxW, r }); }
  else {
    let sub = null;
    if (e.over) sub = placedRun(s, e.over[0], e.over[1]);
    let { left, right } = neighbours(st, s, e.after);
    if (sub && sub.length) left = sub[sub.length - 1];
    if (!left && right) left = right; // inserting before everything: over the first word
    if (!left) { writeToStream(st, s, s.stream, e.text, firstId, ev); return; } // nothing on paper yet: write it at the pen
    ref = { line: left.line, para: left.para, inkIndex: left.inkIndex, word: left.word, wk: 'i' + ev, tempo: (left.tempo || 1) * 1.1, ev, key: 'e' + ev, sheet: s.n };
    const above = s.items.filter((it) => it.line === left.line - 1 && it.role !== 'mark');
    res = insertionItems(p, H, { left, right: right && right !== left ? right : null, sub, above, text: e.text, seed, maxW, r, ref, lines: s.lines });
  }
  // utf-16 offset in the text -> glyph id (each code point took the next id)
  const idAt = [];
  let id = firstId;
  for (const ch of e.text) { idAt.push(id); if (ch.length === 2) idAt.push(id); id++; }
  res.items.forEach((it) => {
    if (it.kind === 'mark') { pushItem(st, s, Object.assign(it, { ev })); return; }
    const o = it.charIndex - (res.shift || 0);
    pushItem(st, s, Object.assign(it, {
      id: idAt[o], ev, sheet: s.n, role: 'insert', line: ref.line, para: ref.para, inkIndex: ref.inkIndex, word: ref.word, wk: ref.wk, tempo: ref.tempo,
    }));
  });
  const firstLetter = s.items.length - res.items.filter((it) => it.kind !== 'mark').length;
  addRuns(s, res.runs, firstLetter);
  s.stopSrc.push({ ins: { idAt, len: e.text.length }, stops: res.stops });
  st.blocks.delete(e.after);
  st.blocks.set(firstId + Array.from(e.text).length - 1, Object.assign({}, res.block, { ref }));
}

// ---------- the pen: dry, retrace, restart (the journey's ink touches) ----------
function penEvent(st, s, e, ev) {
  const p = st.p, H = st.H;
  if (e.kind === 'restart') { st.boost = { k: 0, kind: H.pen }; return; }
  const run = placedRun(s, e.from, e.to);
  if (e.kind === 'dry') {
    run.forEach((it, k) => {
      const t = run.length > 1 ? k / (run.length - 1) : 1;
      const f = lerp(1, H.dryLow, Math.min(1, t * 1.15) ** 2 * (3 - 2 * Math.min(1, t * 1.15)));
      const fade = (pr) => {
        for (let i = 0; i < pr.n; i++) {
          let v = f;
          if (H.pen === 'ballpoint' || H.pen === 'gel') v *= 1 - 0.7 * t * clamp((p.noise.n1(pr.s[i] / 60 + k * 3.7) - 0.15) / 0.3, 0, 1); // skips
          pr.d[i] *= v;
        }
        if (H.pen === 'felt') { for (let i = 0; i < pr.n; i++) pr.w[i] *= 1 - 0.12 * t; return true; } // a drying felt tip narrows
        return false;
      };
      const at = s.at.get(it.id);
      // the posed letter (renderSVG, canvas) and its unposed form (run renderers) fade alike
      const nu = Object.assign({}, it, { g: reink(p, it.g, fade), faint: true }, it.glyph ? { glyph: reink(p, it.glyph, fade) } : {});
      if (at != null) s.items[at] = nu;
      s.placed.set(it.id, nu);
    });
  } else if (e.kind === 'retrace') {
    const r = R0(st, ev);
    const jx = r.gauss() * 0.01 * UPM, jy = r.gauss() * 0.01 * UPM;
    run.forEach((it, k) => pushItem(st, s, Object.assign({}, it, { g: repen(p, it.g, (q) => [q[0] + jx, q[1] + jy], 811 + k), role: 'retrace', key: 'r' + ev + ':' + it.key, ev, wk: 'r' + ev, tempo: (it.tempo || 1) * 1.15 })));
  }
}

// ---------- the page ----------
// layout()-shaped: items (letters and marks, in writing order), runs (re-indexed), stops (offsets in the
// letter's text as it reads now, so editing.js geometry() gives the caret for the textarea's offsets),
// lineInfo, rules, height, text (logicalText), plus sheet / sheets / full.
function finish(st) {
  const s = st.cur, R = st.reader;
  const at = new Map();
  let n = 0, text = '';
  for (const r of R.recs) { if (r.struck || r.joined) at.set(r.id, -1); else { at.set(r.id, n); const c = r.over || r.ch; n += c.length; text += c; } }
  let wordNo = -1, prev = null;
  for (const it of s.items) {
    let role = it.base;
    if (it.id != null && !NOT_PLACED.has(role) && role !== 'insert' && role !== 'ps') {
      const rec = R.byId.get(it.id);
      if (rec && rec.struck) role = 'struck';
      else if (rec && rec.over) role = 'wrong';
    } else if (it.id != null && (role === 'insert' || role === 'ps')) {
      const rec = R.byId.get(it.id);
      if (rec && rec.struck) role = 'struck';
    }
    if (role) it.role = role; else delete it.role;
    it.at = it.id != null && it.kind !== 'mark' && it.role !== 'hyphen' ? (at.has(it.id) ? at.get(it.id) : -1) : -1;
    if (it.wk !== prev) { wordNo++; prev = it.wk; }
    it.word = wordNo;
  }
  st.page = pageOf(st, s, { at, text });
  return st;
}
function pageOf(st, s, live) {
  const R = st.reader;
  const ink = spanOf(s.items.filter(inky));
  const pages = [...s.main.pages, ...(s.ps ? s.ps.pages : [])];
  const last = s.main.pages[s.main.pages.length - 1];
  const stops = live ? liveStops(st, s, live.at) : [];
  return {
    // fresh lists per page, so runChanges(oldPage, newPage) sees what a write added (the item objects
    // themselves are shared: finish() updates their role / at / word as corrections arrive)
    items: s.items.slice(), runs: s.runs.slice(), stops, lineInfo: [...s.lines.values()].sort((a, b) => a.n - b.n), rules: s.rules.slice().sort((a, b) => a - b),
    ruling: last ? last.ruling : undefined, lineHeight: last ? last.lineHeight : st.opts.lineHeight, width: st.opts.maxWidth || (last && last.width),
    height: Math.max(0, ...pages.map((pg) => pg.height || 0), Number.isFinite(ink.y1) ? ink.y1 + 0.35 * UPM : 0),
    ink: Number.isFinite(ink.x0) ? { top: ink.y0, bottom: ink.y1, left: ink.x0, right: ink.x1 } : null,
    lines: 1 + Math.max(-1, ...s.items.map((it) => it.line)), words: 1 + Math.max(-1, ...s.items.map((it) => it.word)),
    misses: pages.flatMap((pg) => pg.misses || []), xh: xhOf(st), connected: !!(last && last.connected), seed: st.p.seed,
    text: live ? live.text : '', sheet: s.n, sheets: st.sheets.length,
    full: !!(st.opts.pageHeight && Number.isFinite(ink.y1) && ink.y1 > st.opts.pageHeight),
    pen: s.stream.ink.pen,
  };
  void R;
}
// layout's caret stops (offsets in what was written) -> offsets in the text as it reads now; stops of
// struck text are dropped. A later stop wins for the same offset and side (as geometry() does).
function liveStops(st, s, at) {
  const R = st.reader;
  const after = (id) => { const r = R.byId.get(id); return at.get(id) + ((r && (r.over || r.ch)) || '').length; };
  const out = new Map();
  for (const src of s.stopSrc) {
    for (const sp of src.stops) {
      let o = -1;
      if (src.ins) {
        if (sp.o < src.ins.len) { const id = src.ins.idAt[sp.o]; if (at.get(id) >= 0) o = at.get(id); }
        else { const id = src.ins.idAt[src.ins.len - 1]; if (at.get(id) >= 0) o = after(id); }
      } else {
        const S = src.S;
        if (sp.o < S.text.length) { const id = S.ids[sp.o]; if (id >= 0 && at.get(id) >= 0) o = at.get(id); }
        else {
          let k = S.text.length - 1;
          while (k >= 0 && !(S.ids[k] >= 0 && at.get(S.ids[k]) >= 0)) k--;
          o = k >= 0 ? after(S.ids[k]) : 0;
        }
      }
      if (o < 0) continue;
      const line = src.S && src.S.lineBase ? sp.line + src.S.lineBase : sp.line;
      out.set(o + (sp.aff || ''), Object.assign({}, sp, { o, line }));
    }
  }
  return [...out.values()].sort((a, b) => a.o - b.o || (a.aff === 'before' ? -1 : b.aff === 'before' ? 1 : 0));
}

// Thought letters (§3.2): the text the pen hasn't reached yet (view.tail), laid out from the pen's state
// without committing, so the app can show it faint where it will be written. null when nothing waits.
// Its items' charIndex - page.from = the offset within view.tail.
export function draftPage(st, view) {
  if (!view || !view.tail) return null;
  const S = st.cur.stream;
  const pg = S.ink.draft(view.tail);
  if (!S.lineBase) return pg;
  return Object.assign({}, pg, { items: pg.items.map((it) => Object.assign({}, it, { line: it.line + S.lineBase })), stops: pg.stops.map((sp) => Object.assign({}, sp, { line: sp.line + S.lineBase })) });
}

// a page for an earlier sheet (drafts set aside by a fresh sheet or a fair copy)
export function sheetPage(st, n) {
  if (n === st.cur.n) return st.page;
  const s = st.sheets[n];
  return s ? pageOf(st, s, null) : null;
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
