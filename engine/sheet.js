// sheet.js — Ink mode: typing that behaves like ink (docs/research/writing-experience.md §3–§5).
//
// You edit like a computer user; the writer corrects like a person. Every keystroke becomes intent, and a
// small planner turns it into what this writer would do on paper: strike it through, write a letter over
// another, add a word above the line with a caret. What is written never moves.
//
//   const doc = newInkDoc({ seed, style, salt });          // plain JSON; doc.log is the append-only ink log
//   let sheet = replay(p, doc, layoutOpts);                 // sheet.page renders with renderSVG / renderCanvas
//   let view = newView();                                   // the unwritten text the app keeps between calls
//   ({ events, view } = plan(sheet, view, edit));           // edit = { at, del, ins, kind } on the textarea
//   apply(sheet, events);                                   // appends to doc.log; nothing placed moves
//   ({ events, view } = penStep(sheet, view, { dt, idle })); apply(sheet, events);   // the pen catches up
//   textarea.value === viewText(sheet, view)                // logicalText(sheet.reader) + what isn't written yet
//   ({ events, view } = stet(sheet, view, at)); apply(sheet, events);   // Undo on dry ink: a crossing-out let stand
//   apply(sheet, [{ t: 'line', as: 'title' }])            // formatting (format.js): the empty line the pen is on set out
//   styleCarry(sheet, events, { lean: 1 })                 //   as a title, heading or list; writes in a style; a
//   apply(sheet, [{ t: 'check', at }, { t: 'highlight', from, to, color }])   //   checklist tick; the highlighter
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
import { inkPage, pageMetrics, writeAt, lineBaseline, lineAngle, lineLean } from './layout.js';
import { createReader } from './inklog.js';
import { hasteStep } from './tempo.js';
import {
  fixHabits, coverQuality, spanOf, baselineFor, scaleOf, repen, reink, markItem, strikeItems,
  underlineStrokes, slashStrokes, blotItem, overItem, insertionItems, stetHabits, stetDotStrokes, stetInMargin, leanOf,
  strikeStrokes, inkWidth,
} from './marks.js';
import { formatHabits, highlightColor, HIGHLIGHTS, styleOf } from './format.js';
import { bulletStrokes, boxStrokes, tickStrokes, untickStrokes, highlightSwipe, titleUnderlineStrokes } from './format-marks.js';

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
  const s = { n: st.sheets.length, why, items: [], placed: new Map(), at: new Map(), runs: [], stopSrc: [], lines: new Map(), rules: [],
    marked: new Set(), boxes: new Map(), highlights: [] }; // (format: list lines with their marker drawn, checklist boxes, highlighter swipes)
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
  st.ahead = aheadFor(doc.log || [], 0, !!doc.complete);
  (doc.log || []).forEach((e, i) => applyOne(st, e, i));
  st.ahead = null;
  return finish(st);
}
// Text that is known in full is laid out knowing what comes next, so layout can set it out as a letter
// (a closing block, a P.S. set apart, a name at the end): a finished letter (doc.complete: the journey,
// which every letter in the app goes through), and a fair copy (the writes its sheet event counts, which
// always arrive together). Each such write gets the rest of its stream's text from the writes after it
// (Map event index -> ahead). Live typing doesn't: what the pen hasn't reached isn't in the log, and a
// replay must equal what was seen.
function aheadFor(events, base, complete) {
  const out = complete ? aheadOf(events) : new Map();
  if (complete) return out;
  events.forEach((e, i) => {
    if (e.t !== 'sheet' || e.why !== 'fair' || !(e.copy > 0)) return;
    const block = events.slice(i + 1, i + 1 + e.copy);
    let rest = '';
    for (let j = block.length - 1; j >= 0; j--) {
      const b = block[j];
      if (b.t !== 'write' && b.t !== 'break') continue;
      out.set(base + i + 1 + j, rest);
      rest = (b.t === 'break' ? '\n' : b.text || '') + rest;
    }
  });
  return out;
}
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
  st.ahead = aheadFor(events, ev0, false);
  events.forEach((e, i) => applyOne(st, e, ev0 + i));
  st.ahead = null;
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
    case 'write': case 'break': {
      let wo = st.ahead && st.ahead.has(ev) ? { ahead: st.ahead.get(ev), complete: true } : e.rest ? { ahead: e.rest } : undefined;
      // the typing's tempo (tempo.js): the words that start in this write are written that way
      if (e.t === 'write' && hasteStep(e.haste)) wo = Object.assign(wo || {}, { haste: hasteStep(e.haste) });
      // the style it was typed in (format.js): the words that start in this write lean in, are pressed harder, bigger
      if (e.t === 'write' && (e.lean || e.weight || (e.size && e.size !== 1))) wo = Object.assign(wo || {}, { style: { lean: e.lean, weight: e.weight, size: e.size } });
      // Return at the end of a title the writer underlines: the pen goes back and underlines it first
      if (e.t === 'break') closeLine(st, s, ev);
      writeToStream(st, s, s.stream, e.t === 'break' ? '\n' : e.text || '', first, ev, wo);
      break;
    }
    // a format for the line the pen is on (format.js): nothing is written on it yet, so it's begun again in it
    case 'line': writeToStream(st, s, s.stream, '', first, ev, { line: e.as || 'body' }); break;
    case 'check': placeCheck(st, s, e, ev); break;
    case 'highlight': placeHighlight(st, s, e, ev); break;
    case 'strike': {
      const struck = placedRun(s, e.from, e.to);
      if (!struck.length) break;
      const r = R0(st, ev);
      // crossed out again (again()): harder each time, with a heavier pen
      const { items, start, ref } = strikeItems(p, (e.lv || 1) >= 2 ? st.heavy : st.firm, H, struck, e.how || H.strike, r, { seed: 311 + ev * 0.77, key: 'e' + ev, lines: s.lines });
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
      // a second underline under the same words is a double underline; a third adds nothing
      let k = 0;
      for (let i = e.from; i <= e.to; i++) { const rec = R.byId.get(i); if (rec && rec.under) k = Math.max(k, rec.under - 1); }
      if (k >= 2) break;
      const byLine = new Map();
      for (const it of placedRun(s, e.from, e.to)) { if (!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); }
      let n = 0;
      for (const ln of byLine.values()) {
        const r = R0(st, ev, ':' + n);
        const sp = spanOf(ln), xh = xhOf(st) * scaleOf(ln);
        const mi = markItem(st.firm, 'underline', underlineStrokes(H, sp.x0, sp.x1, baselineFor(p, ln, s.lines), xh, r, k), ln[ln.length - 1], { seed: 733 + ev, delayed: true, tempo: 1.3, key: 'e' + ev + ':' + n++ });
        if (mi) pushItem(st, s, Object.assign(mi, { ev }));
      }
      break;
    }
    case 'pen': penEvent(st, s, e, ev); break;
    case 'stet': placeStet(st, s, e, ev); break;
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
  // (format) a list line's marker goes in before its first item, so the pen draws it first: how many went in before each
  let shift = null;
  for (let k = 0; k < pg.items.length; k++) {
    const it0 = pg.items[k];
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
    if (S === s.main && !s.marked.has(it.line)) {
      const ln = s.lines.get(it.line);
      if (ln && ln.list) {
        s.marked.add(it.line);
        const n0 = s.items.length;
        placeMarker(st, s, ln, it, ev);
        const added = s.items.length - n0;
        if (added) { if (!shift) shift = new Array(pg.items.length).fill(0); for (let j = k; j < pg.items.length; j++) shift[j] += added; }
      }
    }
    pushItem(st, s, it);
  }
  if (!shift) addRuns(s, pg.runs, base, S.lineBase);
  else for (const rn of pg.runs) s.runs.push(Object.assign({}, rn, { from: rn.from + base + shift[rn.from], to: rn.to + base + shift[rn.to - 1], line: rn.line + S.lineBase }));
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

// ---------- formatting (format.js) ----------
// A list line's marker, drawn with its first word (writeToStream): the writer's own bullet, the number as they write
// it, or a checklist's box. ln: the line (lineInfo: list, item, mark = where the marker starts); it: its first item.
function placeMarker(st, s, ln, it, ev) {
  const m = markerItems(st, s, ln, it, ev);
  const b0 = s.items.length;
  for (const mi of m.items) pushItem(st, s, mi);
  if (m.runs) addRuns(s, m.runs, b0);
  if (m.box && it.id != null) s.boxes.set(it.id, { at: it.id, line: ln.n, para: it.para, box: m.box.box, xh: m.box.xh, ref: m.box.ref });
}
// The marker's items (and runs, and a checklist's box), made and not put down: placeMarker, and draftMarkers (the
// marker of a list item not written yet, shown faint where the pen will draw it)
function markerItems(st, s, ln, it, ev) {
  const p = st.p, F = formatHabits(p), r = R0(st, ev, ':m' + ln.n);
  const x = ln.mark != null ? ln.mark : ln.x0;
  const base = (X) => lineBaseline(p, ln, X);
  const xh = xhOf(st);
  const wk = 'b' + ev + ':' + ln.n;
  const ref = { line: ln.n, para: it.para, word: it.word, inkIndex: it.inkIndex, wk, wkey: wk, tempo: it.tempo };
  if (ln.list === 'number') {
    // the number, written like any word (it isn't in the text: it's the list's, and it never renumbers)
    const w = writeAt(p, ln.item + F.list.number, { x, y: base(x), angle: lineAngle(p, ln, x), lean: lineLean(p, ln, x), size: 1, seed: 'num:' + st.salt + ':' + ev + ':' + ln.n, line: ln.n });
    return { items: w.items.map((li) => Object.assign(li, { ev, sheet: s.n, role: 'marker', charIndex: -1, para: ref.para, inkIndex: ref.inkIndex, word: ref.word, wk, wkey: wk, tempo: ref.tempo })), runs: w.runs };
  }
  const key = 'e' + ev + ':m' + ln.n;
  if (ln.list === 'check') {
    const b = boxStrokes(F, x, base, xh, r);
    const mi = markItem(p, 'box', b.strokes, ref, { seed: 619 + ev * 0.41, tempo: 1.15, key, wk });
    return { items: mi ? [Object.assign(mi, { ev, role: 'marker' })] : [], box: { box: b.box, xh, ref } };
  }
  const mi = markItem(p, 'bullet', bulletStrokes(F, x, base, xh, r), ref, { seed: 613 + ev * 0.37, tempo: 1.2, key, wk, dot: false });
  return { items: mi ? [Object.assign(mi, { ev, role: 'marker' })] : [] };
}
// Return at the end of a title (or heading) the writer underlines: the pen goes back under it, once or twice, before
// the new line. Under the title's own letters, line by line (a long title that ran on is underlined on each line).
function closeLine(st, s, ev) {
  const S = s.stream;
  if (S !== s.main) return;
  const pen = S.ink.pen, ln = pen && pen.line;
  if (!ln || !ln.under) return;
  const R = st.reader, p = st.p;
  const byLine = new Map();
  for (const it of s.items) {
    if (it.kind !== 'glyph' || it.para !== pen.para || it.base != null || !it.g || !it.g.strokes.length || (R.byId.get(it.id) || {}).struck) continue;
    if (!byLine.has(it.line)) byLine.set(it.line, []);
    byLine.get(it.line).push(it);
  }
  let n = 0;
  for (const run of byLine.values()) {
    const sp = spanOf(run), xh = xhOf(st) * scaleOf(run), base = baselineFor(p, run, s.lines);
    for (let k = 0; k < Math.min(2, ln.under); k++) {
      const r = R0(st, ev, ':t' + n);
      const mi = markItem(st.firm, 'underline', titleUnderlineStrokes(st.H, sp.x0, sp.x1, base, xh, r, k), run[run.length - 1], { seed: 739 + ev + n * 3.3, delayed: true, tempo: 1.3, key: 'e' + ev + ':t' + n });
      n++;
      if (mi) pushItem(st, s, Object.assign(mi, { ev }));
    }
  }
}
// A checklist item ticked or unticked (the reader counts: odd is ticked). The pen goes back to the box: a tick, a
// cross or the box filled in, the writer's way; or the item crossed off (it stays in the text). Unticking in ink: the
// tick is scribbled out, and a fresh box drawn beside it in the margin, when there's room (the next tick goes there);
// a crossed-off item gets dots under it instead, the paper's own "let it stand".
function placeCheck(st, s, e, ev) {
  const b = s.boxes.get(e.at);
  if (!b) return;
  const p = st.p, F = formatHabits(p), H = st.H, r = R0(st, ev);
  const on = (st.reader.checks.get(e.at) || 0) % 2 === 1;
  const ln = s.lines.get(b.line);
  const base = ln ? (X) => lineBaseline(p, ln, X) : () => b.box[3];
  const xh = b.xh, key = 'e' + ev;
  const put = (mi) => { if (mi) pushItem(st, s, Object.assign(mi, { ev })); };
  if (F.list.tick === 'strike') {
    const byLine = new Map();
    for (const it of s.items) {
      if (it.kind !== 'glyph' || it.para !== b.para || it.base != null || !it.g || !it.g.strokes.length) continue;
      if (!byLine.has(it.line)) byLine.set(it.line, []);
      byLine.get(it.line).push(it);
    }
    let n = 0;
    for (const run of byLine.values()) {
      const sp = spanOf(run), rb = baselineFor(p, run, s.lines), x = xhOf(st) * scaleOf(run);
      if (on) put(markItem(st.firm, 'strike', strikeStrokes(H, p.noise, 'line', sp.x0, sp.x1, rb, H.strikeY * x, x, inkWidth(p), r), run[run.length - 1], { seed: 641 + ev + n * 7.1, tempo: 1.3, key: key + ':' + n }));
      else {
        const S = stetHabits(p);
        put(markItem(p, 'stet', stetDotStrokes(p, S, sp.x0, sp.x1, rb, x, S.drop + 0.1, r), run[run.length - 1], { seed: 643 + ev + n * 7.1, dot: S.dot === 'dot', tempo: 1.5, key: key + ':' + n }));
      }
      n++;
    }
    return;
  }
  if (on) { put(markItem(st.firm, 'tick', tickStrokes(F, b.box, xh, r), b.ref, { seed: 647 + ev * 0.53, tempo: 1.6, key, wk: 'c' + ev })); return; }
  const sc = untickStrokes(H, p.noise, b.box, base, xh, inkWidth(p), r);
  const mi = markItem(st.firm, 'scribble', sc, b.ref, { seed: 653 + ev * 0.53, ink: sc.ink, tempo: sc.tempo || 2.4, key, wk: 'c' + ev });
  if (mi && sc.kind) mi.scribble = sc.kind;
  put(mi);
  const w = b.box[2] - b.box[0], nx = b.box[0] - w - (0.3 + 0.2 * r()) * xh;
  if (nx >= 0.15 * xh) {
    const nb = boxStrokes(F, nx, base, xh, r);
    put(markItem(p, 'box', nb.strokes, b.ref, { seed: 659 + ev * 0.53, tempo: 1.15, key: key + ':box', wk: 'c' + ev }));
    b.box = nb.box;
  }
}
// A highlighter swiped under those glyphs: one swipe a line, kept beside the ink (page.highlights), never in it.
function placeHighlight(st, s, e, ev) {
  const run = placedRun(s, e.from, e.to).filter((it) => it.kind === 'glyph');
  if (!run.length) return;
  const byLine = new Map();
  for (const it of run) { if (!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); }
  const color = highlightColor(e.color);
  let n = 0;
  for (const ln of byLine.values()) {
    const r = R0(st, ev, ':h' + n++);
    const sp = spanOf(ln), xh = xhOf(st) * scaleOf(ln), base = baselineFor(st.p, ln, s.lines);
    const sw = highlightSwipe(sp.x0, sp.x1, base, xh, r);
    let y0 = Infinity, y1 = -Infinity;
    for (const q of sw.shape) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    s.highlights.push({ ev, color, fill: HIGHLIGHTS[color], line: ln[0].line, shape: sw.shape, streaks: sw.streaks, box: [sw.x0, y0, sw.x1, y1] });
  }
}

// ---------- insertions above the line ----------
// the placed glyphs either side of glyph `after` in reading order (main text, not other insertions; with `ins`, the
// letters of the insertion `after` is in or next to, instead: none past its ends)
function neighbours(st, s, after, ins = false) {
  const recs = st.reader.recs;
  const k = after < 0 ? -1 : recs.indexOf(st.reader.byId.get(after));
  let left = null, right = null;
  const want = (it) => it && it.g && it.g.strokes.length && (ins ? it.base === 'insert' : it.role !== 'insert');
  const stop = (i) => ins && !recs[i].ins;
  for (let i = k; i >= 0 && !left; i--) { if (stop(i)) break; const it = s.placed.get(recs[i].id); if (want(it)) left = it; }
  for (let i = k + 1; i < recs.length && !right; i++) { if (stop(i)) break; const it = s.placed.get(recs[i].id); if (want(it)) right = it; }
  return { left, right };
}
// Where insert event `e` (event index ev) is written: { res (insertionItems' letters, caret mark, stops, block), ref },
// or null when nothing is on paper yet to write it above (it's written at the pen). Used by placeInsert, and by
// draftInsert for the thought letters of an insertion still being typed (the same placement, before it's written).
function insertPlan(st, s, e, ev) {
  const p = st.p, H = st.H;
  const r = R0(st, ev);
  const maxW = st.opts.maxWidth || 12000;
  const seed = 'fix:' + st.salt + ':' + ev;
  const cont = st.blocks.get(e.after);
  if (cont) return { ref: cont.ref, res: insertionItems(p, H, { cont, text: e.text, seed, maxW, r }) };
  if (e.up) {
    // typed inside an insertion already written: above it, a tier up, between its letters (on its own baseline)
    const { left, right } = neighbours(st, s, e.after, true);
    const a = left || right;
    if (a) {
      const ref = { line: a.line, para: a.para, inkIndex: a.inkIndex, word: a.word, wk: 'i' + ev, tempo: (a.tempo || 1) * 1.1, ev, key: 'e' + ev, sheet: s.n };
      const above = s.items.filter((it) => it.line === a.line - 1 && it.role !== 'mark');
      const clear = s.items.filter((it) => it.base === 'insert' && it.line === a.line && it.g && it.g.strokes.length);
      return { ref, res: insertionItems(p, H, { left: a, right: right && right !== a && left ? right : null, above, clear, text: e.text, seed, maxW, r, ref }) };
    }
  }
  let sub = null;
  if (e.over) sub = placedRun(s, e.over[0], e.over[1]);
  let { left, right } = neighbours(st, s, e.after);
  if (sub && sub.length) left = sub[sub.length - 1];
  if (!left && right) left = right; // inserting before everything: over the first word
  if (!left) return null;
  const ref = { line: left.line, para: left.para, inkIndex: left.inkIndex, word: left.word, wk: 'i' + ev, tempo: (left.tempo || 1) * 1.1, ev, key: 'e' + ev, sheet: s.n };
  const above = s.items.filter((it) => it.line === left.line - 1 && it.role !== 'mark');
  return { ref, res: insertionItems(p, H, { left, right: right && right !== left ? right : null, sub, above, text: e.text, seed, maxW, r, ref, lines: s.lines }) };
}
function placeInsert(st, s, e, ev, firstId) {
  const pl = insertPlan(st, s, e, ev);
  if (!pl) { writeToStream(st, s, s.stream, e.text, firstId, ev); return; } // nothing on paper yet: write it at the pen
  const { res, ref } = pl;
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
    // gone over again, harder: a heavier pen, a hair to the right and up, so the word visibly thickens
    const r = R0(st, ev);
    const jx = (0.025 + r.gauss() * 0.008) * UPM, jy = (0.02 + r.gauss() * 0.008) * UPM;
    run.forEach((it, k) => pushItem(st, s, Object.assign({}, it, { g: repen(st.heavy, it.g, (q) => [q[0] + jx, q[1] + jy], 811 + k), role: 'retrace', key: 'r' + ev + ':' + it.key, ev, wk: 'r' + ev, tempo: (it.tempo || 1) * 1.15 })));
  }
}

// ---------- let it stand (stet) ----------
// A crossing-out taken back after its ink dried (stet()): the writer can't lift it, so they do what editors and
// proofreaders do. A row of dots under the struck letters (a row per line, under whatever the crossing-out left
// below the line, clear of the next line), "stet" small in the margin of the word's first line (above the word
// when there's no margin, or no room in it), and where the crossing-out hides the word (scribbled or inked out),
// the word written again small above it, so it can be read. The struck letters never move; they read as text
// again (inklog.js). Everything is seeded by the event's index, like every mark.
const SCRIBBLED = new Set(['scribble', 'scrawl', 'blackout', 'inkout']);
function placeStet(st, s, e, ev) {
  const p = st.p, H = st.H, R = st.reader, S = stetHabits(p);
  const run = placedRun(s, e.from, e.to);
  if (!run.length) return;
  const r = R0(st, ev);
  const boxOfIt = (it) => { if (it.box) return it.box; const q = spanOf([it]); return [q.x0, q.y0, q.x1, q.y1]; };
  const ink = s.items.filter(inky);
  const byLine = new Map();
  for (const it of run) { if (!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); }
  const lines = [...byLine.values()], first = lines[0], last = lines[lines.length - 1];
  // the dots, a row under each line's part of the word
  const dots = [];
  lines.forEach((ln, n) => {
    const sp = spanOf(ln), base = baselineFor(p, ln, s.lines), xh = xhOf(st) * scaleOf(ln), no = ln[0].line;
    // (in x-heights below the baseline) under what's already below the word, a scribble's lower half or an
    // underline; above anything of the next line
    let floor = -Infinity, ceil = Infinity;
    for (const it of ink) {
      const b = boxOfIt(it);
      if (!(b[2] > sp.x0 && b[0] < sp.x1)) continue;
      if (it.line === no) {
        // (a mark's own outline, point by point: its box is only sampled, and a scribble's turns reach past it)
        if (it.kind === 'mark' && it.mark !== 'caret') for (const c of it.g.contours) for (const q of c) { const X = it.x + q[0]; if (X >= sp.x0 && X <= sp.x1) floor = Math.max(floor, (it.y - q[1] - base(X)) / xh); }
        continue;
      }
      const top = (b[1] - base(clamp((b[0] + b[2]) / 2, sp.x0, sp.x1))) / xh;
      if (top > 0.15) ceil = Math.min(ceil, top);
    }
    const drop = clamp(Math.min(Math.max(S.drop, floor + 0.14), ceil - 0.2), 0.12, 1.8);
    const mi = markItem(p, 'stet', stetDotStrokes(p, S, sp.x0, sp.x1, base, xh, drop, r), ln[ln.length - 1],
      { seed: 557 + ev * 0.61, dot: S.dot === 'dot', tempo: 1.5, key: 'e' + ev + ':dots:' + n, wk: 'k' + ev + 'd' });
    if (mi) dots.push(mi);
  });
  // the word again, where the crossing-out hides it
  const recs = [];
  for (let i = e.from; i <= e.to; i++) { const q = R.byId.get(i); if (q) recs.push(q); }
  const seed = 'stet:' + st.salt + ':' + ev, maxW = st.opts.maxWidth || 12000;
  const aboveOf = (ln) => s.items.filter((it) => it.line === ln[0].line - 1 && it.role !== 'mark');
  let again = null;
  if (recs.some((q) => SCRIBBLED.has(q.stetOf))) {
    const word = recs.map((q) => q.over || q.ch).join('').replace(/\s+/g, ' ').trim();
    if (word) again = insertionItems(p, H, { sub: last, left: last[last.length - 1], above: aboveOf(last), text: word, seed: seed + ':w', maxW, r, lines: s.lines, caret: false });
  }
  // "stet": in the margin, left of where the line's writing starts (and of a ruled margin)
  const no = first[0].line, info = s.lines.get(no);
  let note = null;
  if (info) {
    // (the line's own ink: its letters, and the marks on them, a strike's overshoot or a scribble past the word)
    let edge = info.x0;
    for (const it of ink) if (it.line === no && it.role !== 'stet' && it.role !== 'insert') edge = Math.min(edge, boxOfIt(it)[0]);
    const rule = st.opts.marginRule != null && st.opts.marginRule < edge ? st.opts.marginRule : null;
    const boxes = ink.map(boxOfIt);
    if (again) for (const it of again.items) if (it.box) boxes.push(it.box);
    note = stetInMargin(p, S, { ln: info, edge, rule, boxes, xh: xhOf(st) * scaleOf(first), size: S.size * scaleOf(first), lean: leanOf(p, first[0]), seed, line: no, r });
  }
  // no room there: above the word (after the word written again, when it is)
  if (!note) {
    note = again ? insertionItems(p, H, { cont: Object.assign({}, again.block, { space: true }), text: 'stet', seed, maxW, r })
      : insertionItems(p, H, { sub: first, left: first[first.length - 1], above: aboveOf(first), text: 'stet', seed, maxW, r, lines: s.lines, caret: false });
  }
  const ref = first[0];
  const letters = (w, wk) => {
    const base = s.items.length;
    for (const it of w.items) pushItem(st, s, Object.assign(it, { ev, sheet: s.n, role: 'stet', charIndex: -1, para: ref.para, inkIndex: ref.inkIndex, word: ref.word, wk, wkey: wk, tempo: (ref.tempo || 1) * 1.15 }));
    addRuns(s, w.runs, base);
  };
  const putDots = () => { for (const mi of dots) pushItem(st, s, Object.assign(mi, { ev })); };
  // in the order the pen goes: the dots and the stet (some writers write the stet first), then the word again
  if (S.lead) { letters(note, 'k' + ev + 's'); putDots(); } else { putDots(); letters(note, 'k' + ev + 's'); }
  if (again) letters(again, 'k' + ev + 'w');
}

// ---------- the page ----------
// layout()-shaped: items (letters and marks, in writing order), runs (re-indexed), stops (offsets in the
// letter's text as it reads now, so editing.js geometry() gives the caret for the textarea's offsets),
// lineInfo, rules, height, text (logicalText), plus sheet / sheets / full.
function finish(st) {
  const s = st.cur, R = st.reader;
  const at = new Map(), gap = new Map();
  let n = 0, text = '';
  // (gap: a struck glyph -> [the offset of the gap it sits in, its place in reading order])
  R.recs.forEach((r, i) => { if (r.struck || r.joined) { at.set(r.id, -1); if (r.struck && !r.joined) gap.set(r.id, [n, i]); } else { at.set(r.id, n); const c = r.over || r.ch; n += c.length; text += c; } });
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
  st.page = pageOf(st, s, { at, gap, text });
  return st;
}
function pageOf(st, s, live) {
  const R = st.reader;
  const ink = spanOf(s.items.filter(inky));
  const pages = [...s.main.pages, ...(s.ps ? s.ps.pages : [])];
  const last = s.main.pages[s.main.pages.length - 1];
  const stops = live ? liveStops(st, s, live.at) : [];
  const struckStops = live ? struckStopsOf(st, s, live.gap) : [];
  const page = {
    // fresh lists per page, so runChanges(oldPage, newPage) sees what a write added (the item objects
    // themselves are shared: finish() updates their role / at / word as corrections arrive)
    items: s.items.slice(), runs: s.runs.slice(), stops, lineInfo: [...s.lines.values()].sort((a, b) => a.n - b.n), rules: s.rules.slice().sort((a, b) => a - b),
    ruling: last ? last.ruling : undefined, lineHeight: last ? last.lineHeight : st.opts.lineHeight, width: st.opts.maxWidth || (last && last.width),
    height: Math.max(0, ...pages.map((pg) => pg.height || 0), Number.isFinite(ink.y1) ? ink.y1 + 0.35 * UPM : 0),
    ink: Number.isFinite(ink.x0) ? { top: ink.y0, bottom: ink.y1, left: ink.x0, right: ink.x1 } : null,
    lines: 1 + Math.max(-1, ...s.items.map((it) => it.line)), words: 1 + Math.max(-1, ...s.items.map((it) => it.word)),
    misses: pages.flatMap((pg) => pg.misses || []), xh: xhOf(st), connected: !!(last && last.connected), seed: st.p.seed,
    text: live ? live.text : '', sheet: s.n, sheets: st.sheets.length,
    // (with layout's sheets, opts.sheet, writing carries on onto the next sheet: never full)
    full: !!(st.opts.pageHeight && !st.opts.sheet && Number.isFinite(ink.y1) && ink.y1 > st.opts.pageHeight),
    pen: s.stream.ink.pen,
  };
  // (Ink mode: where the caret goes before each crossed-out word, which no offset of the text is inside: see struckStopsOf)
  if (struckStops.length) page.struckStops = struckStops;
  // (format) highlighter swipes, laid under the writing; checklist boxes (their glyph id, line and box, ticked or not)
  if (s.highlights.length) page.highlights = s.highlights.slice();
  if (s.boxes.size) page.boxes = [...s.boxes.values()].map((b) => ({ at: b.at, line: b.line, box: b.box.slice(), checked: (R.checks.get(b.at) || 0) % 2 === 1 }));
  return page;
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

// A crossed-out word has no offset of its own in the text (it's struck out of it): it sits in a gap at one offset, and
// that offset's stop is after it (where the pen carries on, or a replacement goes). Its stop before it, right after what
// precedes it, is kept here: one per gap { o (the gap's offset in the text as it reads now), x, y, line, kind, aff? },
// the stop before the gap's first struck character (a gap of only spaces has nothing to step over: left out), so an
// editor can give a crossed-out word a caret stop on each side.
function struckStopsOf(st, s, gap) {
  const R = st.reader, best = new Map(), inked = new Set();
  for (const src of s.stopSrc) {
    for (const sp of src.stops) {
      let id;
      if (src.ins) { if (sp.o >= src.ins.len) continue; id = src.ins.idAt[sp.o]; }
      else { if (sp.o >= src.S.text.length) continue; id = src.S.ids[sp.o]; }
      const g = id != null && id >= 0 ? gap.get(id) : null;
      const r = g && R.byId.get(id);
      if (!g || !r) continue;
      if (!/\s/.test(r.over || r.ch || '')) inked.add(g[0]);
      const was = best.get(g[0]);
      // the first struck character of the gap; at a soft wrap, its place at the start of the line below
      if (was && (was.i < g[1] || (was.i === g[1] && sp.aff !== 'after'))) continue;
      const line = src.S && src.S.lineBase ? sp.line + src.S.lineBase : sp.line;
      best.set(g[0], { i: g[1], sp: Object.assign({}, sp, { o: g[0], line }) });
    }
  }
  return [...best.values()].map((b) => b.sp).filter((sp) => inked.has(sp.o)).sort((a, b) => a.o - b.o);
}

// Thought letters (§3.2): the text the pen hasn't reached yet (view.tail), laid out from the pen's state
// without committing, so the app can show it faint where it will be written. null when nothing waits.
// Its items' charIndex - page.from = the offset within view.tail.
// opts.haste: the tempo the next word will be written at (tempo.js), so its thought letters sit where its ink will
export function draftPage(st, view, opts) {
  if (!view || !view.tail) return null;
  const S = st.cur.stream;
  const haste = hasteStep(opts && opts.haste);
  // (opts.style: the style the tail is being typed in, format.js, so its thought letters sit where its ink will)
  const o = opts && opts.style ? { style: opts.style } : null;
  if (o && haste) o.haste = haste;
  const pg = o ? S.ink.draft(view.tail, o) : haste ? S.ink.draft(view.tail, { haste }) : S.ink.draft(view.tail);
  if (!S.lineBase) return pg;
  return Object.assign({}, pg, { items: pg.items.map((it) => Object.assign({}, it, { line: it.line + S.lineBase })), stops: pg.stops.map((sp) => Object.assign({}, sp, { line: sp.line + S.lineBase })) });
}

// Thought letters above the line: the insertion being typed mid-text (view.mid), laid out where the pen will write it
// (placeInsert's own placement, with the seeds of the event it will be: the log's next index; a long insertion the pen
// writes in pieces may settle a hair differently), without writing it, so the app can show it faint where it goes.
// null when there's none, or nothing on the paper yet to write it above. { items: its letters (charIndex = the offset
// in view.mid.text), caret: the caret mark the pen will draw under it (null when it carries on an insertion), stops:
// the caret stops (o = the offset in view.mid.text; x, y on the insertion's own baseline), line: the written line it
// goes above, text }
export function draftInsert(st, view) {
  const mid = view && view.mid;
  if (!mid || !mid.text) return null;
  const s = st.cur;
  const pl = insertPlan(st, s, { t: 'insert', after: mid.after, text: mid.text, over: mid.over, up: mid.up }, st.doc.log.length);
  if (!pl) return null;
  const { res, ref } = pl;
  const shift = res.shift || 0;
  const items = [], caret = [];
  for (const it of res.items) {
    // (copies: what layout hands back is never changed by a draft)
    if (it.kind === 'mark') { caret.push(Object.assign({}, it, { ev: st.doc.log.length })); continue; }
    items.push(Object.assign({}, it, { charIndex: it.charIndex - shift, role: 'insert', line: ref.line, para: ref.para, sheet: s.n, wk: ref.wk, wkey: 'ins:' + ref.wk + ':' + it.wkey }));
  }
  const stops = (res.stops || []).map((sp) => Object.assign({}, sp, { line: ref.line }));
  return { items, caret: caret[0] || null, stops, line: ref.line, text: mid.text };
}

// The markers of list items the pen hasn't written yet, made where it will draw them (placeMarker's own, seeded as
// the next event, the write that will start the item), without drawing them: the bullet, number or box of the line
// the pen is on, when it's a list item with nothing written on it yet (only "- " typed, or its words still thought
// letters; not when what's typed next starts a new line), and of the list lines the thought letters reach (`lines`:
// a draft's lineInfo). [] when there are none. Each is a mark item (a number: letters), role 'marker'.
export function draftMarkers(st, view, lines) {
  const s = st.cur, S = s.stream, n0 = st.doc.log.length;
  if (S !== s.main) return [];
  const out = [], seen = new Set();
  const add = (ln, ev) => {
    if (!ln || !ln.list || s.marked.has(ln.n) || seen.has(ln.n)) return;
    seen.add(ln.n);
    const m = markerItems(st, s, ln, { para: 0, word: 0, inkIndex: 0, tempo: 1 }, ev);
    for (const it of m.items) out.push(it);
  };
  // the event each line's first write will be, as the pen hands the tail over: a write per line, a break between
  const pen = S.ink.pen, tail = String((view && view.tail) || '');
  const evs = [];
  let e = n0;
  tail.split('\n').forEach((seg, j) => { if (j) e++; if (seg) evs.push([j, e++]); });
  const at = (j) => { const x = evs.find((v) => v[0] >= j); return x ? x[1] : e; };
  const own = pen && pen.line ? pen.line.n : -1;
  if (pen && pen.line && !tail.startsWith('\n')) add(s.lines.get(own) || pen.line, at(0));
  // (the list lines the thought letters reach, in order: the k-th starts the k-th line after the pen's)
  let k = 0;
  for (const ln of (lines || []).filter((l) => l && l.n > own).sort((a, b) => a.n - b.n)) if (ln.list) add(ln, at(++k));
  return out;
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
  // 1. only unwritten text: edit it freely, nothing is ink yet. (Typing with the caret put before a word crossed out
  // at the end, edit.side 'before': not after it, where the pen carries on, but above the line before it: 2e)
  const touched = m.units.slice(at, at + del).map(inRange);
  const beforeStruck = edit.side === 'before' && !del && !!ins && at === m.tailStart && struckRuns(struckGap(R, m, at)).length > 0;
  // (an insertion being typed comes first: where it ends right where the tail starts, before a word crossed out at the
  // end, typing at its end carries it on)
  if (v.mid && m.midStart >= 0 && at >= m.midStart && at + del <= m.midEnd && touched.every((k) => k === 'mid')) {
    const o = at - m.midStart;
    v.mid.text = v.mid.text.slice(0, o) + ins + v.mid.text.slice(o + del);
    if (!v.mid.text) v.mid = null;
    return { events, view: v };
  }
  if (at >= m.tailStart && touched.every((k) => k === 'tail') && !beforeStruck) {
    const o = at - m.tailStart;
    v.tail = v.tail.slice(0, o) + ins + v.tail.slice(o + del);
    return { events, view: v };
  }
  // 2r. a whole word replaced (a phone's autocorrect, after the pen had written it): the writer fixes
  // the whole word, never a slice of it
  if (edit.kind === 'replace' && (del > 0 || ins)) { // (autocorrect may only add letters: "dont" -> "don't")
    if (v.mid) flushMid(R, v, emit);
    if (v.pending) resolvePending(st, R, v, emit);
    if (replaceWord(R, v, emit, roll, viewMap(R, v), edit, st.H)) return { events, view: v };
    m = viewMap(R, v);
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
    // (2b, a fresh sheet when most of the sheet was deleted, is gone: the old sheet vanished from the desk with it.
    // However much is deleted, it's struck where it stands, like any other deletion, and Undo on the dry crossing-out
    // brings it all back, stet. Starting over is New sheet's job, or Fair copy's.)
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
    // right after an insertion above the line: what's typed carries on writing it, up there (the insertion goes on
    // from where it ends, never on top of it; a space there is a space in it, not a split mark on the line)
    const inserted = !!(prev && prev.k === 'ink' && !prev.half && (R.byId.get(prev.id) || {}).ins);
    if (ins === '\n' && prev && prev.k === 'ink') { emit({ t: 'mark', after, kind: 'para' }); return { events, view: v }; }
    if (!inserted && ins === ' ' && prev && next && prev.k === 'ink' && next.k === 'ink' && isLetter(prevCh) && isLetter(nextCh)) { emit({ t: 'mark', after, kind: 'split' }); return { events, view: v }; }
    // right after a word crossed out, mid-text (where the caret is left): what's typed replaces it, written above it,
    // as select-and-type does (a substitution). At the very end of the writing it's the tail: the pen carries on after
    // it. (edit.side 'before': the caret was put before the struck word, by an arrow key: an insertion there instead)
    if (!inserted && edit.side !== 'before') {
      const run = struckWord(R, m, at);
      if (run) { v.mid = { after: run.to, text: ins, over: [run.from, run.to] }; return { events, view: v }; }
    }
    // inside an insertion already written (or at its start: the caret is up there, before its first letter): the words
    // can't be squeezed in between its letters, so they go above it, a tier up, with a caret mark of their own
    const nextIns = !!(next && next.k === 'ink' && (R.byId.get(next.id) || {}).ins);
    if (nextIns && !(inserted && st.blocks.has(prev.id))) { v.mid = { after, text: ins, up: true }; return { events, view: v }; }
    v.mid = { after, text: ins };
  }
  return { events, view: v };
}

// ---------- struck words in the view ----------
// Struck words aren't in the view text: each sits in a gap between two of its units. The struck recs in the gap at view
// offset k, in reading order; null when there are none, or the gap is next to text the pen hasn't written (or an
// insertion being typed).
function struckGap(R, m, k) {
  const recs = R.recs;
  if (k < 0 || k > m.units.length) return null;
  const prev = k > 0 ? m.units[k - 1] : null, next = m.units[k] || null;
  if ((prev && prev.k !== 'ink') || (next && next.k === 'mid')) return null;
  const i0 = prev ? recs.indexOf(R.byId.get(prev.id)) + 1 : 0;
  const i1 = next && next.k === 'ink' ? recs.indexOf(R.byId.get(next.id)) : recs.length;
  if (i0 < 0 || i1 < 0) return null;
  const out = [];
  for (let i = i0; i < i1; i++) if (recs[i].struck && !recs[i].joined) out.push(recs[i]);
  return out.length ? out : null;
}
// The crossings-out in a gap: runs of recs struck by the same event, in reading order, each with its level. A run of
// only spaces or line breaks has no ink to cross out (nothing would show): it's left out.
const blankRec = (r) => /^\s$/.test(r.over || r.ch || '');
function struckRuns(recs) {
  const runs = [];
  for (const r of recs || []) {
    const last = runs[runs.length - 1];
    if (last && last.sev === r.sev) last.recs.push(r);
    else runs.push({ sev: r.sev, recs: [r] });
  }
  return runs.filter((rn) => rn.recs.some((r) => !blankRec(r))).map((rn) => Object.assign(rn, { level: Math.max(...rn.recs.map((r) => r.lv || 1)) }));
}
// The words crossed out right before the caret at view offset k, mid-text (written text after the caret): the last
// crossing-out in the gap (the words one deletion struck), without the spaces at its ends, as a run of consecutive ids
// { from, to } (a substitution over it covers only it), or null. One that already has words written over it (a
// substitution right after it) is taken: none.
function struckWord(R, m, k) {
  if (k >= m.tailStart) return null;
  const runs = struckRuns(struckGap(R, m, k));
  if (!runs.length) return null;
  const next = m.units[k];
  const nr = next && next.k === 'ink' ? R.byId.get(next.id) : null;
  if (nr && nr.sub) return null;
  const recs = runs[runs.length - 1].recs.slice();
  while (recs.length && blankRec(recs[0])) recs.shift();
  while (recs.length && blankRec(recs[recs.length - 1])) recs.pop();
  const last = idRuns(recs.map((r) => r.id)).pop();
  return last ? { from: last[0], to: last[1] } : null;
}

// A replacement edit arrives as the smallest change ("teh" -> "the" is "eh" -> "he"), so widen it to the
// whole word (or words) it falls in, then do what a person does with a word already in ink:
//   one or two letters changed, same length: write the new letters over the old ones
//   the last word written: strike the whole word (in this writer's style) and write the new one after it
//   a word further back: strike it where it stands and write the new one above it (ink never moves)
// Returns false when the word isn't ink yet (the plain path edits the unwritten text).
function replaceWord(R, v, emit, roll, m, edit, H) {
  const V = m.text, U = m.units;
  const isW = (c) => /[\p{L}\p{N}'’]/u.test(c || '');
  let wa = edit.at, wb = edit.at + edit.del;
  while (wa > 0 && isW(V[wa - 1])) wa--;
  while (wb < V.length && isW(V[wb])) wb++;
  const word = U.slice(wa, wb);
  if (!word.some((u) => u.k === 'ink') || word.some((u) => u.k === 'mid')) return false;
  const newW = V.slice(wa, edit.at) + (edit.ins || '') + V.slice(edit.at + edit.del, wb);
  const inkIds = word.filter((u) => u.k === 'ink' && !u.half).map((u) => u.id);
  const tailPart = word.filter((u) => u.k === 'tail');
  const a = Array.from(V.slice(wa, wb)), b = Array.from(newW);
  if (!tailPart.length && a.length === b.length && b.length === inkIds.length && !/\s/.test(newW)) {
    const diff = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length && diff.length <= 2 && diff.every((i) => isW(b[i]))) {
      for (const i of diff) emit({ t: 'over', at: inkIds[i], ch: b[i] });
      return true;
    }
  }
  const how = roll() < H.scribbleWords * 0.5 ? 'scribble' : H.strike;
  const strike = (ids) => { for (const [x, y] of idRuns(ids)) emit({ t: 'strike', from: x, to: y, how, why: 'replaced' }); };
  // anything written after the word (other than spaces)?
  let k = wb;
  const spaces = [];
  while (k < U.length && U[k].k === 'ink' && /\s/.test(V[k]) && V[k] !== '\n') { if (!U[k].half) spaces.push(U[k].id); k++; }
  const inkAfter = U.slice(k).some((u) => u.k === 'ink' || u.k === 'mid');
  if (inkAfter) {
    strike(inkIds);
    v.mid = { after: inkIds[inkIds.length - 1], text: newW, over: [Math.min(...inkIds), Math.max(...inkIds)] };
    return true;
  }
  // at the pen head. With spaces already written after it, they go with the word and come back after the
  // new one; without, a space is written first, so the new word starts clear of the struck one
  const restTail = v.tail.slice(tailPart.length ? tailPart[tailPart.length - 1].j + 1 : 0);
  if (spaces.length) {
    strike([...inkIds, ...spaces]);
    v.tail = newW + V.slice(wb, k) + restTail;
  } else {
    const sep = R.nextId;
    emit({ t: 'write', text: ' ' });
    strike([...inkIds, sep]);
    v.tail = newW + restTail;
  }
  return true;
}

function flushMid(R, v, emit) {
  if (!v.mid) return;
  if (v.mid.text) emit(Object.assign({ t: 'insert', after: v.mid.after, text: v.mid.text }, v.mid.over ? { over: v.mid.over } : {}, v.mid.up ? { up: true } : {}));
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

// ---------- crossing out again ----------
// Rafael: "when you click delete multiple times or when you hold delete, you get more of a scribble in that
// area. The same way that in real life, when you cross something out, you spend a lot of time scribbling it out."
// Backspace or Delete at a struck run (the caret is where it was: struck words aren't in the view text) goes
// over it again, harder each time: level 2 a second, heavier strike; 3 a scribble; 4 inked out. Each pass is
// its own strike event { lv, why: 'again' }, so it's seeded by its event index (different every time, the same
// on replay) and lifts like any wet ink. Pure, like plan(): returns { events, view, level } (the run's new
// level), no events and level AGAIN_MAX when it's already inked out, or null when no struck run sits at `at`
// or something is in flight there (a fix the pen is hovering over, an insertion being typed).
export const AGAIN_MAX = 4;
// The struck recs at view offset `at` (struck words aren't in the view, so they sit in a gap before it): right at
// the caret, or one space away (a selection taken with the space before it is struck as the word and the space
// after: the caret is left a space short of it). null when there are none. Crossings-out of nothing but spaces are
// left out: a space has no ink, so going over it again would show nothing (the press goes on to the word before).
// opts.side 'before': the caret sits before the struck word of that gap (an arrow key left it there): not at it.
function struckAt(R, m, at, opts = {}) {
  const runAt = (k) => {
    const recs = struckGap(R, m, k);
    const keep = new Set(struckRuns(recs).flatMap((rn) => rn.recs));
    const out = (recs || []).filter((r) => keep.has(r));
    return out.length ? out : null;
  };
  const spaceAt = (k) => { const u = m.units[k]; return !!u && u.k === 'ink' && /^[ \t]$/.test((R.byId.get(u.id) || {}).ch || ''); };
  if (opts.side === 'before') return (spaceAt(at - 1) && runAt(at - 1)) || null;
  return runAt(at) || (spaceAt(at) && runAt(at + 1)) || (spaceAt(at - 1) && runAt(at - 1)) || null;
}
// opts.side 'before': the caret sits before the struck word in its gap (see struckAt).
export function again(st, view, at, opts = {}) {
  const v = copyView(view || newView());
  if (v.pending || v.mid) return null;
  const R = st.reader, m = viewMap(R, v);
  const found = struckAt(R, m, at, opts);
  if (!found) return null;
  // each press goes over what's just before the caret: the last crossing-out there that isn't inked out yet (a word
  // struck after the one beside it was inked out is crossed out harder in its turn). All inked out: it stops there
  const open = struckRuns(found).filter((rn) => rn.level < AGAIN_MAX);
  if (!open.length) return { events: [], view: v, level: AGAIN_MAX };
  const run = open[open.length - 1].recs;
  const level = Math.max(...run.map((r) => r.lv || 1));
  const lv = level + 1, was = run[run.length - 1].struck;
  const scribbled = was === 'scribble' || was === 'blackout';
  // each level the same person, more annoyed: a heavier strike, then their own scribble (the word still shows
  // through), then inked out. A word already scribbled goes to a scrawl, then a blackout, then inked out
  const scrawled = scribbled || was === 'scrawl';
  const how = lv >= 4 ? 'inkout' : lv === 3 ? (scrawled ? 'blackout' : 'scrawl') : scrawled ? 'scrawl' : was === 'double' ? 'wave' : 'double';
  const events = idRuns(run.map((r) => r.id)).map(([a, b]) => ({ t: 'strike', from: a, to: b, how, why: 'again', lv }));
  return { events, view: v, level: lv };
}
// A ghost of the next press: the marks again(st, view, at) would put down, exactly as the pen will draw them (the
// same seeds: the event indexes they'll get next), with nothing put down. Pure, like again(). { items (mark items,
// placed on the page: the app draws them faint), level (the run's level after the press), events } or null when
// there's no struck run there, or it's already inked out.
export function previewAgain(st, view, at) {
  const r = again(st, view, at);
  if (!r || !r.events.length) return null;
  const s = st.cur, ev0 = st.doc.log.length, items = [];
  // (as applyOne places a strike)
  r.events.forEach((e, i) => {
    const ev = ev0 + i, struck = placedRun(s, e.from, e.to);
    if (!struck.length) return;
    const res = strikeItems(st.p, (e.lv || 1) >= 2 ? st.heavy : st.firm, st.H, struck, e.how || st.H.strike, R0(st, ev), { seed: 311 + ev * 0.77, key: 'e' + ev, lines: s.lines });
    for (const it of res.items) items.push(Object.assign(it, { ev }));
  });
  return { items, level: r.level, events: r.events };
}
// ---------- let it stand (stet) ----------
// Undo on dry ink (issue #5). Ink can't be lifted once it's dry, so a crossing-out is taken back the way editors
// always have: dots under the struck word, "stet" ("let it stand") in the margin (placeStet), and the word counts
// again. Backspace on ink is a strike, so this is the paper's own undo for it. Pure, like again(): the struck run at
// view offset `at` (found as again() finds it), and of it only the newest crossing-out: the glyphs its strike
// struck, with every strike the same step made (one selection can strike several runs). `same(ev, newest)` says
// whether strike event `ev` was part of the same step as `newest` (true / false, or null: don't know); by default,
// strikes that follow one another in the log, struck for the same reason. Passes of crossing out harder go with the
// word. Returns { events: one stet per run of ids, view, strikes: the strike events taken back, ids } or null when
// nothing struck sits at `at` or something is in flight there (a fix the pen is hovering over, an insertion).
export function stet(st, view, at, same) {
  const v = copyView(view || newView());
  if (v.pending || v.mid) return null;
  const R = st.reader, m = viewMap(R, v), log = st.doc.log;
  const run = struckAt(R, m, at);
  if (!run) return null;
  const newest = Math.max(...run.map((q) => (q.sev == null ? -1 : q.sev)));
  if (newest < 0) return null;
  const step = (a, b) => {
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) { const x = log[i]; if (!x || x.t !== 'strike' || x.why === 'again' || x.why !== log[newest].why) return false; }
    return true;
  };
  const one = (ev) => { if (ev === newest) return true; const k = same ? same(ev, newest) : null; return k == null ? step(ev, newest) : !!k; };
  const ids = run.filter((q) => q.sev != null && one(q.sev)).map((q) => q.id);
  const strikes = [...new Set(run.filter((q) => ids.includes(q.id)).map((q) => q.sev))].sort((a, b) => a - b);
  return { events: idRuns(ids).map(([a, b]) => ({ t: 'stet', from: a, to: b })), view: v, strikes, ids };
}

// The glyph ids written in [from, to) of the view text (what the textarea shows), for a mark made on a
// selection: an underline, or the words gone over again. Spaces at either end are left out.
export function inkIdsIn(st, view, from, to) {
  const m = viewMap(st.reader, view || newView());
  const ids = [];
  for (let i = Math.max(0, from); i < Math.min(to, m.units.length); i++) { const u = m.units[i]; if (u.k === 'ink' && !u.half) ids.push(u.id); }
  const blank = (id) => /\s/.test((st.reader.byId.get(id) || {}).ch || '');
  while (ids.length && blank(ids[0])) ids.shift();
  while (ids.length && blank(ids[ids.length - 1])) ids.pop();
  return idRuns(ids);
}

// Backspace over a space the pen has written. A space has no ink: a press that only took it would show nothing, and
// leave a crossing-out of nothing behind. So the press goes on to the word before: at the pen head the space goes with
// that word's last letter (they're struck together, as a word is struck with its space); mid-text the space stays, and
// the letter before it is struck. `edit`: the Backspace (one unit of viewText deleted, nothing typed). Returns { edit,
// caret, head }: the edit to plan instead, the view offset the caret is left at (right after what it struck), and
// whether it's at the pen head (the caret is left at the end, as the textarea leaves it); or null when it isn't one
// (not a written space, or no written word before it on its line).
export function backOverSpace(st, view, edit) {
  if (!edit || edit.ins || (edit.del | 0) !== 1) return null;
  const R = st.reader, m = viewMap(R, view || newView());
  const at = edit.at | 0, u = m.units[at];
  const ch = u && u.k === 'ink' && !u.half ? (R.byId.get(u.id) || {}).ch : null;
  if (!ch || !/^[ \t]$/.test(ch)) return null;
  let k = at - 1;
  while (k >= 0 && m.units[k].k === 'ink' && /^[ \t]$/.test(m.text[k])) k--;
  const w = k >= 0 ? m.units[k] : null;
  if (!w || w.k !== 'ink' || /\s/.test(m.text[k])) return null;
  const k0 = w.half ? k - 1 : k; // (both halves of a surrogate pair)
  const head = !m.units.slice(at + 1).some((x) => x.k === 'ink' || x.k === 'mid');
  return { edit: Object.assign({}, edit, { at: k0, del: head ? at + 1 - k0 : k + 1 - k0 }), caret: k0, head };
}

// ---------- the pen (§3.2): what can be written now ----------
// opts: { dt (ms since the last step; omit = no speed limit), idle (ms since the last keystroke),
//   forgiving (default true: hold back the last 2 characters until 700 ms idle), touch (hold back the
//   unfinished word until 1.2 s idle: mobile autocorrect), final (write everything now), speed (chars/s),
//   within (seconds: a copy-out, a paste being written out: everything waiting is written within that long, however
//   much it is; pass what's left of it each step) }
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
    let speed = (opts.speed || 2) * (1 + Math.min(3, Math.max(0, behind - 6) / 4)), most = 8;
    // copying out: as fast as it takes to be done in time (a step's worth may be more than the usual 8 letters)
    if (opts.within > 0) { speed = Math.max(speed, behind / opts.within); most = Math.max(most, Math.ceil(speed * opts.dt / 1000) + 1); }
    v.budget = Math.min(most, (v.budget || 0) + opts.dt / 1000 * speed);
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
      emit(Object.assign({ t: 'insert', after: v.mid.after, text: chunk }, v.mid.over ? { over: v.mid.over } : {}, v.mid.up ? { up: true } : {}));
      allow -= cps(chunk);
      v.budget -= cps(chunk);
      const rest = v.mid.text.slice(chunk.length);
      v.mid = rest ? { after: first + cps(chunk) - 1, text: rest } : null;
    }
  }
  if (v.tail && !v.mid) {
    const chunk = ready(v.tail);
    if (chunk) {
      // a piece that stops inside a word carries the rest of that word (what's typed of it so far), so
      // layout decides the line end on the whole word, where the thought letters showed it. It's kept in
      // the event, so a replay passes the same
      const restWord = /[^\s]$/.test(chunk) ? (v.tail.slice(chunk.length).match(/^[^\s]+/) || [''])[0] : '';
      const parts = chunk.split('\n');
      parts.forEach((part, i) => {
        if (i) emit({ t: 'break' });
        if (part) emit(i === parts.length - 1 && restWord ? { t: 'write', text: part, rest: restWord } : { t: 'write', text: part });
      });
      v.tail = v.tail.slice(chunk.length);
      if (opts.dt != null && !final) v.budget -= cps(chunk);
    }
  }
  return { events, view: v };
}

// ---------- formatting at the pen (format.js) ----------
// The style typing is in goes on the writes the pen makes of it: each write that starts a word carries it (lean,
// weight, size), as a write carries its tempo (tempo.js), so the log keeps it and a replay gives the same page. Mutates
// and returns `events` (not applied yet). A write that only continues a word, or only spaces, carries nothing.
export function styleCarry(st, events, style) {
  const sty = styleOf(style);
  if (!sty || !events) return events;
  let open = !!(st && st.page && st.page.pen && st.page.pen.open);
  for (const e of events) {
    if (!e) continue;
    if (e.t === 'write') {
      const text = String(e.text || '');
      let starts = false, o = open;
      for (const ch of text) { const sp = /\s/.test(ch); if (!sp && !o) { starts = true; break; } o = !sp; }
      if (starts) { if (sty.lean) e.lean = sty.lean; if (sty.weight) e.weight = sty.weight; if (sty.size !== 1) e.size = sty.size; }
      if (text) open = /\S$/.test(text);
    } else if (e.t === 'break' || e.t === 'move' || e.t === 'sheet' || e.t === 'line') open = false;
  }
  return events;
}
// The line the pen is on: its format ('title', 'heading', 'body', 'bullet', 'number', 'check'), the list going on (or
// null), whether nothing is written on it yet and it can still be set out in a format (a `line` event: format), whether
// it's centred and still empty (the pen waits for the whole line: lineHeld), and whether it's the P.S.
export function lineNow(st) {
  const s = st.cur, S = s.stream, pen = S.ink.pen, ln = pen && pen.line;
  const list = pen && pen.list ? pen.list.kind : null;
  return {
    as: ln ? ln.fmt || ln.list || 'body' : (pen && pen.fmt) || list || 'body',
    list,
    format: S === s.main && (!ln || !!pen.restart),
    centre: !!(ln && ln.centre != null && !ln.count && pen.endO == null),
    ps: S !== s.main,
  };
}
// A centred line waits: the pen is at the start of one (a title the writer centres) and the line isn't finished in
// the typing yet (no Return in view.tail), so it can't know how long it will be. The app holds the pen (and writes it
// after a pause anyway); the thought letters show it centred, live, as it's typed.
export function lineHeld(st, view) {
  return lineNow(st).centre && !String((view && view.tail) || '').includes('\n');
}
// The first piece written on a centred line carries the rest of the line as typed (write.rest), so it's centred on
// the whole line, and a replay centres it the same. nextTail: the tail after these events. Mutates `events`.
export function lineCarry(st, events, nextTail) {
  if (!events || !events.length || !lineNow(st).centre) return events;
  const i = events.findIndex((e) => e && (e.t === 'write' || e.t === 'break' || e.t === 'sheet' || e.t === 'move' || e.t === 'line'));
  const e = events[i];
  if (!e || e.t !== 'write' || !/\S/.test(e.text || '')) return events;
  if (events.slice(i + 1).some((x) => x && (x.t === 'break' || x.t === 'sheet' || x.t === 'move'))) return events; // the whole line is here
  const rest = String(nextTail || '').split('\n')[0];
  if (rest.length > String(e.rest || '').length) e.rest = rest;
  return events;
}

// ---------- commands ----------
// "Make a fair copy" (§3.3): a fresh sheet with the letter written out cleanly.
export function fairCopy(st) {
  const text = textNow(st);
  const events = [{ t: 'sheet', why: 'fair' }];
  text.split('\n').forEach((part, i) => { if (i) events.push({ t: 'break' }); if (part) events.push({ t: 'write', text: part }); });
  events[0].copy = events.length - 1; // the copy's own writes: laid out knowing the whole text (aheadFor)
  return events;
}
// "Add a P.S." (§3.4): the pen moves below the text; what's typed next is written there, smaller.
export function postScript(st) {
  const text = textNow(st);
  return (text && !text.endsWith('\n') ? [{ t: 'break' }] : []).concat([{ t: 'move', to: 'ps' }]);
}
function textNow(st) { return st.reader.recs.filter((r) => !r.struck && !r.joined).map((r) => r.over || r.ch).join(''); }
