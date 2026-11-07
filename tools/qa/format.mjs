#!/usr/bin/env node
// tools/qa/format.mjs — formatting by hand (engine/format.js, format-marks.js; sheet.js `line`, `check`, `highlight`
// events; write.lean / weight / size). Checks:
//   - each feature round-trips through the compact form and share links; old compact logs decode and re-encode unchanged
//   - old logs are unchanged: they draw the same page (with --against=<checkout of the version before>, the same page
//     that version draws, including a log with an old fresh sheet from a big deletion)
//   - a typing session with formatting (styles switched on and off, titles, headings, lists, ticks, highlights) replays
//     to the same page, byte for byte, and nothing already on paper moves while it's written
//   - style: leaning in leans further and narrower, pressing harder is wider with more ink, size is bigger; a word keeps
//     the style it started in
//   - titles and headings come out as each writer sets them out (bigger, and underlined once or twice at Return, in
//     capitals, or centred), for several writers; lists: the writer's own marker before each item's first word, lines
//     that run on hang under it, numbers that never renumber, boxes that tick and untick; the highlighter under the words
//   - the big deletion: most of a sheet deleted is struck where it stands (nothing vanishes), and stet brings it back
//   - the writing page's session (app/src/lib/ink.ts, loaded through Vite when app/node_modules is installed): the
//     shorthand, setRole, setStyle, style() at the caret, lists, ticks, the highlighter
//   node tools/qa/format.mjs [--against=<checkout>] [dir]   (dir: also write each writer's page as SVG there)
import { loadEngine, resolveRoot } from './lib/engine.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const E = await loadEngine(resolveRoot());
const againstArg = process.argv.find((a) => a.startsWith('--against='));
const OLD = againstArg ? await loadEngine(path.resolve(againstArg.slice(10))) : null;
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
const OPTS = { maxWidth: 12400, lineHeight: 1600 };
const SVG = { width: 900, emPx: 58 };
const fails = [];
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);
// (between them, every title habit, bullet, box and tick)
const WRITERS = [['quiet-heron-17', 'script'], ['maple-river-42', 'print'], ['amber-comet-63', 'palmer'], ['salt-meadow-21', 'print'], ['plum-harbor-64', 'print'],
  ['tawny-atlas-52', 'adult-fr-2023'], ['velvet-fable-88', 'script']];

// ---------- the compact form and share links ----------
{
  const log = [
    { t: 'line', as: 'title' }, { t: 'write', text: 'Trip', haste: 1 }, { t: 'break' },
    { t: 'write', text: 'Dear ', lean: 1 }, { t: 'write', text: 'Ada, ', weight: 2, size: 1.3 }, { t: 'write', text: 'it', haste: -1, lean: 2, weight: 1, size: 0.85 },
    { t: 'break' }, { t: 'line', as: 'check' }, { t: 'write', text: 'Maps' }, { t: 'check', at: 13 }, { t: 'check', at: 0 },
    { t: 'highlight', from: 5, to: 9, color: 'pink' }, { t: 'highlight', from: 0, to: 0 }, { t: 'line', as: 'body' }, { t: 'line', as: 'number' }, { t: 'stet', from: 0, to: 0 },
  ];
  const doc = Object.assign(E.newInkDoc({ seed: 'quiet-heron-17', style: 'script', salt: 'rt' }), { log });
  const back = E.decodeDoc(E.encodeDoc(doc));
  const linked = await E.decodeInkLink(await E.encodeInkLink(doc));
  const want = JSON.stringify(log);
  if (JSON.stringify(back.log) !== want || JSON.stringify(linked.log) !== want) fail('formats do not round-trip: ' + JSON.stringify(back.log));
  else ok('styles, line formats, ticks and highlights round-trip through the compact form and share links: ' + JSON.stringify(JSON.parse(E.encodeDoc(doc)).l.slice(3, 9)));
  const OLD_LOGS = [
    '{"v":1,"ev":"seedhand-ink-1","s":"old1","h":["maple-river-42","print",null],"p":{"kind":"plain"},"m":"ink","l":[["w","Dear "],["w","Ada, "],["w","teh "],["w","garden"],["w"," "],["w","is lovely"],["o",11,"h"],["o",12,"e"],["w"," "],["w","this "],["w","morning."],["b"],["w","Yours"]]}',
    '{"v":1,"ev":"seedhand-ink-1","s":"old2","h":["quiet-heron-17","script",null],"p":{"kind":"plain"},"m":"ink","l":[["w","Dear "],["w","Ada,",1],["w"," it was lov",0,"ely"],["w","ely"],["w"," and "],["x",11,13,"line","deleted"],["w","the sea"],["b"],["w","P"],["v","ps"],["w","Bring maps."]]}',
    '{"v":1,"ev":"seedhand-ink-1","s":"old3","h":["amber-comet-63","palmer",null],"p":{"kind":"plain"},"m":"ink","l":[["w","Hello there my dear wonderful world",0,null,2],["b"],["w","and more",0,null,-1],["u",6,10],["p","retrace",12,15],["x",0,4,"wave","deleted"],["r",0,4],["s","fresh"],["w","Hello "],["b"],["b"],["w","again."]]}',
  ];
  const before = fails.length;
  for (const s of OLD_LOGS) {
    const d = E.decodeDoc(s);
    if (E.encodeDoc(d) !== s) fail('an old compact log re-encodes differently:\n    ' + E.encodeDoc(d) + '\n    ' + s);
    if (d.log.some((e) => 'lean' in e || 'weight' in e || ('size' in e && e.t === 'write'))) fail('an old compact log decoded with a style');
    const p = E.makeHand(d.hand.seed, d.hand.style);
    const a = E.renderSVG(p, E.replay(p, d, OPTS).page, SVG);
    // a plain style on every write is exactly no style
    const plain = Object.assign({}, d, { log: d.log.map((e) => (e.t === 'write' ? Object.assign({}, e, { lean: 0, weight: 0, size: 1 }) : e)) });
    if (E.renderSVG(p, E.replay(p, plain, OPTS).page, SVG) !== a) fail(`${d.salt}: a plain style draws a different page from no style`);
    if (OLD) {
      const q = OLD.makeHand(d.hand.seed, d.hand.style);
      if (OLD.renderSVG(q, OLD.replay(q, OLD.decodeDoc(s), OPTS).page, SVG) !== a) fail(`${d.salt}: an old log draws a different page from the version before`);
    }
  }
  if (fails.length === before) ok(`old compact logs decode and re-encode unchanged, and draw the same page${OLD ? ' as the version before (--against)' : ' with a plain style as with none'}`);
}

// ---------- old logs, as the version before wrote them while typing (no formats), draw the same page ----------
if (OLD) {
  const before = fails.length;
  const LETTER = 'Dear Ada,\n\nThe little letters never quite match, and that is the point. Every word comes out a touch different.\n\nYours,\nO.';
  let n = 0;
  for (const [seed, style] of WRITERS.slice(0, 4)) {
    const q = OLD.makeHand(seed, style);
    const doc = OLD.newInkDoc({ seed, style, salt: 'old' });
    const st = OLD.replay(q, doc, OPTS);
    let view = OLD.newView(), clock = 0, last = 0, value = '';
    const go = (r) => { OLD.apply(st, r.events); view = r.view; };
    for (const ch of LETTER) {
      value += ch;
      go(OLD.plan(st, view, { at: value.length - 1, del: 0, ins: ch, kind: 'type' }));
      last = clock;
      clock += 160; go(OLD.penStep(st, view, { dt: 160, idle: clock - last }));
    }
    go(OLD.penStep(st, view, { final: true }));
    // a big deletion, as the version before planned it (a fresh sheet), then typing
    go(OLD.plan(st, view, { at: 4, del: value.length - 4, ins: '', kind: 'delete' }));
    go(OLD.plan(st, view, { at: OLD.viewText(st, view).length, del: 0, ins: ' again', kind: 'type' }));
    go(OLD.penStep(st, view, { final: true }));
    const s = OLD.encodeDoc(doc), p = E.makeHand(seed, style);
    const a = OLD.renderSVG(q, OLD.replay(q, OLD.decodeDoc(s), OPTS).page, SVG), b = E.renderSVG(p, E.replay(p, E.decodeDoc(s), OPTS).page, SVG);
    if (a !== b) fail(`${seed}/${style}: a log the version before wrote draws differently now`);
    if (!doc.log.some((e) => e.t === 'sheet')) fail(`${seed}/${style}: expected the old planner's fresh sheet in this log`);
    for (let k = 0; k < (OLD.sheetPage(st, 0) ? 1 : 0); k++) {
      const pa = OLD.sheetPage(OLD.replay(q, OLD.decodeDoc(s), OPTS), 0), pb = E.sheetPage(E.replay(p, E.decodeDoc(s), OPTS), 0);
      if (OLD.renderSVG(q, pa, SVG) !== E.renderSVG(p, pb, SVG)) fail(`${seed}/${style}: its earlier sheet draws differently now`);
    }
    n++;
  }
  if (fails.length === before) ok(`${n} letters typed with the version before (one with its old fresh sheet) draw the same pages, both sheets`);
}

// ---------- a typing session with formatting, as the app runs it (lib/ink.ts InkSession) ----------
// Keys arrive `gap` ms apart and the pen is stepped between them (penStep at its own pace); the writes carry the typing's
// style (styleCarry) and a centred line's first piece the rest of its line (lineCarry); the pen waits on a centred line
// until it's finished (lineHeld) or a pause. A style change, a line format: everything typed is written first.
function session(seed, style, steps, { salt = 'fq', gap = 140 } = {}) {
  const p = E.makeHand(seed, style);
  const doc = E.newInkDoc({ seed, style, salt });
  const st = E.replay(p, doc, OPTS);
  let view = E.newView(), clock = 1000, lastKey = clock, sty = null, moved = null;
  const seen = new Map();
  const snap = (it) => `${it.x.toFixed(3)},${it.y.toFixed(3)},${it.g && it.g.contours[0] ? it.g.contours[0][0].map((v) => v.toFixed(2)).join(',') : ''}`;
  const check = () => {
    for (const it of st.page.items) {
      if (!it.key) continue;
      const s = snap(it), was = seen.get(it.key);
      if (was == null) seen.set(it.key, s); else if (was !== s && !moved) moved = `${it.key} '${it.ch}'`;
    }
  };
  const go = (r) => {
    if (sty) E.styleCarry(st, r.events, sty);
    E.lineCarry(st, r.events, r.view.tail);
    view = r.view;
    E.apply(st, r.events);
    check();
  };
  const flush = () => go(E.penStep(st, view, { final: true }));
  for (const step of steps) {
    if (typeof step === 'string') {
      for (const ch of step) {
        go(E.plan(st, view, { at: E.viewText(st, view).length, del: 0, ins: ch, kind: 'type' }));
        lastKey = clock;
        E.draftPage(st, view, { style: sty }); // the thought letters, in the style, never throw
        for (let t = 0; t < gap; t += 130) {
          clock += Math.min(130, gap - t);
          if (E.lineHeld(st, view) && clock - lastKey < 1600) continue;
          go(E.penStep(st, view, { dt: Math.min(130, gap - t), idle: clock - lastKey }));
        }
      }
    } else if ('style' in step) { flush(); sty = step.style && (step.style.lean || step.style.weight || (step.style.size && step.style.size !== 1)) ? step.style : null; }
    else if (step.line) { flush(); if (E.lineNow(st).format) go({ events: [{ t: 'line', as: step.line }], view }); }
    else if (step.check != null) { const b = (st.page.boxes || [])[step.check]; if (b) go({ events: [{ t: 'check', at: b.at }], view }); }
    else if (step.highlight) {
      flush();
      const t = E.viewText(st, view), i = t.indexOf(step.highlight[0]);
      if (i >= 0) go({ events: E.inkIdsIn(st, view, i, i + step.highlight[0].length).map(([a, b]) => ({ t: 'highlight', from: a, to: b, color: step.highlight[1] })), view });
    } else if (step.pause) { clock += step.pause; go(E.penStep(st, view, { dt: step.pause, idle: clock - lastKey })); }
  }
  for (let k = 0; k < 60 && (view.tail || view.pending); k++) { clock += 130; go(E.penStep(st, view, { dt: 130, idle: clock - lastKey })); }
  flush();
  return { p, st, doc, moved, view };
}
const SCRIPT = [
  { line: 'title' }, 'Summer plans\n', 'We leave on Friday, and this time ', { style: { lean: 1 } }, 'nothing ', { style: null }, 'is ',
  { style: { weight: 1 } }, 'forgotten', { style: null }, ', not even the ', { style: { size: 1.35 } }, 'big ', { style: null }, 'map.\n',
  { line: 'heading' }, 'To pack\n', { line: 'bullet' }, 'Maps\n', 'A good pen and a long list of things to bring with us on the way\n', { line: 'body' },
  'And to do:\n', { line: 'check' }, 'Tickets\n', 'Sun hat\n', 'Call Ada', { check: 0 }, { check: 1 }, { check: 1 }, '\n', { line: 'number' }, 'First\n', 'Second',
  { highlight: ['this time', 'yellow'] }, { highlight: ['To pack', 'pink'] },
];

const glyphsOf = (st, pred) => st.page.items.filter((it) => it.kind === 'glyph' && it.g && pred(it));
const lineOf = (st, n) => st.page.lineInfo.find((l) => l.n === n);
const sc = (it) => (it.g && it.g.pose && it.g.pose.scale) || 1;
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
// a letter's lean (degrees): the slant its pose was made at (the hand's own, plus its word's)
const leanOf = (it) => (it.g && it.g.pose && Number.isFinite(it.g.pose.slant) ? it.g.pose.slant : null);
// a letter's line width: its outline's area over its centreline's length
function lineWidth(it) {
  let area = 0, len = 0;
  for (const s of it.g.strokes) {
    const c = s.contour || [];
    for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length]; area += a[0] * b[1] - b[0] * a[1]; }
    for (let i = 1; i < s.center.length; i++) len += Math.hypot(s.center[i][0] - s.center[i - 1][0], s.center[i][1] - s.center[i - 1][1]);
  }
  return len ? Math.abs(area) / 2 / len : 0;
}
const wordOf = (st, text) => {
  // the glyph items of the first occurrence of `text` in the letter (by glyph id, through the reader)
  const recs = st.reader.recs.filter((r) => !r.struck && !r.joined);
  const t = recs.map((r) => r.over || r.ch).join(''), i = t.indexOf(text);
  if (i < 0) return [];
  const ids = new Set(recs.slice(i, i + text.length).map((r) => r.id));
  return st.page.items.filter((it) => it.kind === 'glyph' && ids.has(it.id) && it.role !== 'insert');
};

const habits = new Map();
for (const [seed, style] of WRITERS) {
  const where = `${seed}/${style}`;
  const res = session(seed, style, SCRIPT, { salt: 'fmt' });
  const { st, p, doc } = res;
  const F = E.formatHabits(p);
  habits.set(seed, F);
  const bad = [];
  // ----- replays byte for byte, nothing moved, the text reads as typed -----
  const live = E.renderSVG(p, st.page, SVG);
  const again = E.replay(E.makeHand(seed, style), E.decodeDoc(E.encodeDoc(doc)), OPTS);
  if (E.renderSVG(p, again.page, SVG) !== live) bad.push('the replay differs from the live page');
  if (res.moved) bad.push(`${res.moved} moved after it was written`);
  if (/NaN|Infinity/.test(live)) bad.push('NaN in the page');
  const text = E.logicalText(st);
  const want = 'Summer plans\nWe leave on Friday, and this time nothing is forgotten, not even the big map.\nTo pack\nMaps\nA good pen and a long list of things to bring with us on the way\nAnd to do:\nTickets\nSun hat\nCall Ada\nFirst\nSecond';
  if (text !== want) bad.push('the letter reads ' + JSON.stringify(text));
  // ----- style -----
  const body = wordOf(st, 'Friday'), lean = wordOf(st, 'nothing'), press = wordOf(st, 'forgotten'), big = wordOf(st, 'big');
  const leanD = mean(lean.map(leanOf).filter((v) => v != null)) - mean(body.map(leanOf).filter((v) => v != null));
  if (!(leanD > 5 && leanD < 16)) bad.push(`lean: leaning in should lean about 10° further, got ${leanD.toFixed(1)}°`);
  if (!press.every((it) => it.weight > 1) || !press.length) bad.push('pressed harder: its letters should carry more ink');
  const pw = (its) => mean(its.map(lineWidth));
  if (!(pw(press) > pw(body) * 1.12)) bad.push(`pressed harder: a wider line (${pw(press).toFixed(0)} vs ${pw(body).toFixed(0)})`);
  if (!(mean(big.map(sc)) > mean(body.map(sc)) * 1.25)) bad.push('size: the big word should be bigger');
  if (wordOf(st, 'is').some((it) => it.style) || body.some((it) => it.style)) bad.push('words typed with no style carry one');
  // ----- the title and the heading -----
  const title = wordOf(st, 'Summer plans'), heading = wordOf(st, 'To pack');
  const tLine = lineOf(st, title[0].line), hLine = lineOf(st, heading[0].line);
  if (tLine.role !== 'title' || hLine.role !== 'heading') bad.push(`line roles ${tLine.role} / ${hLine.role}`);
  const ts = mean(title.map(sc)), hs = mean(heading.map(sc)), bs = mean(body.map(sc));
  if (!(ts > bs * 1.25 && hs > bs * 1.08 && ts > hs)) bad.push(`sizes: title ${ts.toFixed(2)}, heading ${hs.toFixed(2)}, body ${bs.toFixed(2)}`);
  const marksUnder = (line) => st.page.items.filter((it) => it.kind === 'mark' && it.mark === 'underline' && it.line === line).length;
  const how = F.title.how;
  if (how === 'under1' || how === 'under2') {
    if (marksUnder(tLine.n) !== (how === 'under2' ? 2 : 1)) bad.push(`the title should be underlined ${how === 'under2' ? 'twice' : 'once'}, got ${marksUnder(tLine.n)}`);
    if (marksUnder(hLine.n) !== 1) bad.push(`the heading should be underlined once, got ${marksUnder(hLine.n)}`);
  } else if (marksUnder(tLine.n)) bad.push('a title the writer doesn\'t underline is underlined');
  if (how === 'caps' && !title.filter((it) => /\p{L}/u.test(it.ch)).every((it) => it.ch === it.ch.toUpperCase())) bad.push('the title should be in capitals: ' + title.map((it) => it.ch).join(''));
  if (how !== 'caps' && title.some((it) => it.ch === 'U')) bad.push('the title is in capitals, not this writer\'s habit');
  const span = (its) => { const x0 = Math.min(...its.map((i) => i.box[0])), x1 = Math.max(...its.map((i) => i.box[2])); return [x0, x1]; };
  const [t0, t1] = span(title), centre = (t0 + t1) / 2 - OPTS.maxWidth / 2;
  if (how === 'centre' && Math.abs(centre) > 0.12 * OPTS.maxWidth) bad.push(`the title should be centred (off by ${centre.toFixed(0)})`);
  if (how !== 'centre' && t0 > 0.2 * OPTS.maxWidth) bad.push('the title should start at the margin');
  // ----- lists -----
  const markers = st.page.items.filter((it) => it.role === 'marker');
  const itemLines = st.page.lineInfo.filter((l) => l.list);
  const kinds = itemLines.map((l) => l.list).join(' ');
  if (kinds !== 'bullet bullet check check check number number') bad.push('list lines: ' + kinds);
  for (const l of itemLines) {
    const first = st.page.items.findIndex((it) => it.kind === 'glyph' && it.line === l.n && it.role == null);
    const mk = st.page.items.findIndex((it) => it.role === 'marker' && it.line === l.n);
    if (mk < 0 || mk > first) { bad.push(`item line ${l.n} (${l.list}): no marker before its first word`); continue; }
    const mx = Math.max(...st.page.items.filter((it) => it.role === 'marker' && it.line === l.n).map((it) => (it.box ? it.box[2] : it.x)));
    if (st.page.items[first].box[0] < mx - 0.1 * st.page.xh) bad.push(`item line ${l.n}: the words start over the marker`);
  }
  const long = wordOf(st, 'A good pen and a long list of things to bring with us on the way');
  const runOn = [...new Set(long.map((it) => it.line))];
  if (runOn.length < 2) bad.push('the long item should run on to a second line');
  else {
    const x0 = Math.min(...long.filter((it) => it.line === runOn[0]).map((it) => it.box[0])), x1 = Math.min(...long.filter((it) => it.line === runOn[1]).map((it) => it.box[0]));
    if (Math.abs(x1 - x0) > 0.9 * st.page.xh) bad.push(`its second line should hang under its first word (${(Math.abs(x1 - x0) / st.page.xh).toFixed(2)} x-heights off)`);
  }
  const nums = itemLines.filter((l) => l.list === 'number').map((l) => markers.filter((m) => m.line === l.n && m.kind === 'glyph').map((m) => m.ch).join(''));
  if (nums.join(' ') !== `1${F.list.number} 2${F.list.number}`) bad.push('numbers: ' + nums.join(' '));
  // ----- checklist: ticked, unticked -----
  const boxes = st.page.boxes || [];
  if (boxes.length !== 3) bad.push(`checklist: ${boxes.length} boxes`);
  else if (!(boxes[0].checked && !boxes[1].checked && !boxes[2].checked)) bad.push('checklist: ticks ' + boxes.map((b) => b.checked).join(' '));
  const tickMarks = st.page.items.filter((it) => it.kind === 'mark' && (it.mark === 'tick' || (F.list.tick === 'strike' && it.mark === 'strike')));
  if (!tickMarks.length) bad.push('checklist: no tick drawn');
  if (F.list.tick !== 'strike' && !st.page.items.some((it) => it.kind === 'mark' && it.mark === 'scribble' && it.key && it.key.startsWith('e'))) bad.push('checklist: unticking should scribble the tick out');
  // ----- highlights -----
  const hl = st.page.highlights || [];
  const hw = wordOf(st, 'this time');
  if (hl.length < 2 || hl[0].color !== 'yellow' || hl[hl.length - 1].color !== 'pink') bad.push('highlights: ' + hl.map((h) => h.color).join(' '));
  else {
    // every letter highlighted sits inside a swipe of its line, across and up and down
    const under = (it) => { const cx = (it.box[0] + it.box[2]) / 2; return hl.some((h) => h.line === it.line && h.box[0] <= cx && h.box[2] >= cx && h.box[1] < it.y - 0.6 * st.page.xh && h.box[3] > it.y); };
    if (!hw.filter((it) => /\S/.test(it.ch)).every(under)) bad.push('the highlight should cover its words');
    if (live.indexOf('class="highlights"') > live.indexOf('data-ink')) bad.push('the highlight should be drawn under the ink');
  }
  if (bad.length) fail(`${where}: ${bad.join('; ')}`);
  else ok(`${where}: title ${how} (×${(ts / bs).toFixed(2)}), heading ×${(hs / bs).toFixed(2)}; bullet ${F.list.bullet}, numbers ${nums.join(' ')}, box ${F.list.box}, ticks with a ${F.list.tick}; lean +${leanD.toFixed(1)}°; replays byte for byte, nothing moved`);
  if (out) fs.writeFileSync(`${out}/format-${seed}.svg`, live);
}
{
  const hows = new Set([...habits.values()].map((F) => F.title.how)), bullets = new Set([...habits.values()].map((F) => F.list.bullet));
  if (hows.size < 3 || bullets.size < 3) fail(`writers should set titles and lists out differently: titles ${[...hows]}, bullets ${[...bullets]}`);
  else ok(`writers differ: titles ${[...hows].join(', ')}; bullets ${[...bullets].join(', ')}`);
  // over many writers, every habit turns up
  const all = { how: new Set(), bullet: new Set(), box: new Set(), tick: new Set() };
  for (let i = 0; i < 80; i++) { const F = E.formatHabits(E.makeHand('w' + i + '-q', 'print')); all.how.add(F.title.how); all.bullet.add(F.list.bullet); all.box.add(F.list.box); all.tick.add(F.list.tick); }
  if (all.how.size < 4 || all.bullet.size < 4 || all.box.size < 3 || all.tick.size < 4) fail('some habit never turns up: ' + JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, [...v]]))));
  else ok('over 80 writers every habit turns up (4 titles, 4 bullets, 3 boxes, 4 ticks)');
}

// ---------- a word keeps the style it started in; a line already in ink takes no format ----------
{
  const p = E.makeHand('maple-river-42', 'print');
  const st = E.replay(p, E.newInkDoc({ seed: 'maple-river-42', style: 'print', salt: 'keep' }), OPTS);
  E.apply(st, [{ t: 'write', text: 'hel', rest: 'lo' }, { t: 'write', text: 'lo world', lean: 1 }]);
  const its = st.page.items.filter((it) => it.kind === 'glyph');
  if (its.slice(0, 5).some((it) => it.style) || !its.slice(6).every((it) => it.style && it.style.lean === 1)) fail('a continued word should keep its own style: ' + its.map((it) => it.ch + (it.style ? '*' : '')).join(''));
  else ok('a word continued in a later piece keeps the style it started in');
  const n = st.page.lineInfo.length;
  if (E.lineNow(st).format) fail('a line with ink on it should not take a format');
  E.apply(st, [{ t: 'break' }]);
  if (!E.lineNow(st).format) fail('an empty line should take a format');
  E.apply(st, [{ t: 'line', as: 'title' }, { t: 'line', as: 'bullet' }, { t: 'line', as: 'heading' }]);
  if (E.lineNow(st).as !== 'heading' || st.page.lineInfo.length !== n + 1) fail(`an empty line set out three times should be one heading line, got ${E.lineNow(st).as}, ${st.page.lineInfo.length - n} lines`);
  else ok('an empty line can be set out again and again (one line, the last format); a line with ink on it can\'t');
}

// ---------- the big deletion: struck where it stands, and stet brings it back ----------
{
  for (const [seed, style] of WRITERS.slice(0, 3)) {
    const p = E.makeHand(seed, style);
    const st = E.replay(p, E.newInkDoc({ seed, style, salt: 'big' }), OPTS);
    let view = E.newView();
    const go = (r) => { E.apply(st, r.events); view = r.view; };
    go(E.plan(st, view, { at: 0, del: 0, ins: 'Hello there my dear wonderful world,\nand everything in it.', kind: 'paste' }));
    go(E.penStep(st, view, { final: true }));
    const glyphs = st.page.items.filter((it) => it.kind === 'glyph').length;
    const t = E.viewText(st, view);
    const r = E.plan(st, view, { at: 6, del: t.length - 6, ins: '', kind: 'delete' });
    go(r);
    const bad = [];
    if (r.events.some((e) => e.t === 'sheet')) bad.push('a fresh sheet');
    if (!r.events.length || !r.events.every((e) => e.t === 'strike')) bad.push('events ' + r.events.map((e) => e.t).join(' '));
    if (st.page.items.filter((it) => it.kind === 'glyph').length !== glyphs) bad.push('letters vanished');
    if (E.logicalText(st) !== 'Hello ') bad.push('the letter reads ' + JSON.stringify(E.logicalText(st)));
    // select all + type: struck, and the new words written after it
    const all = E.viewText(st, view).length;
    go(E.plan(st, view, { at: 0, del: all, ins: '', kind: 'delete' }));
    go(E.plan(st, view, { at: 0, del: 0, ins: 'Fresh start', kind: 'type' }));
    go(E.penStep(st, view, { final: true }));
    if (st.sheets.length !== 1 || st.page.items.filter((it) => it.kind === 'glyph').length < glyphs) bad.push('select all + type should keep everything on the sheet');
    if (E.logicalText(st) !== 'Fresh start') bad.push('after select all + type the letter reads ' + JSON.stringify(E.logicalText(st)));
    // Undo on the dry crossing-out: stet, and the words count again
    const s = E.stet(st, view, 0);
    if (!s || !s.events.length) bad.push('stet found nothing to let stand');
    else { go(s); if (!E.logicalText(st).startsWith('Hello')) bad.push('after stet the letter reads ' + JSON.stringify(E.logicalText(st).slice(0, 40))); }
    if (bad.length) fail(`${seed}/${style}: the big deletion: ${bad.join('; ')}`);
    else ok(`${seed}/${style}: deleting most of the sheet strikes it where it stands (${r.events.length} strikes, nothing vanished); stet brings it back`);
  }
}

// ---------- the writing page's session (app/src/lib/ink.ts InkSession), through Vite, when app/ is installed ----------
{
  const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app');
  const vite = path.join(app, 'node_modules/vite/dist/node/index.js');
  if (!fs.existsSync(vite)) console.log('  · the session checks need app/node_modules (npm ci in app/): skipped');
  else {
    const { createServer } = await import(pathToFileURL(vite).href);
    const server = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
    try {
      const I = await server.ssrLoadModule('/src/lib/ink.ts');
      const A = await server.ssrLoadModule('@engine');
      const { getPaper } = await server.ssrLoadModule('/src/lib/papers.ts');
      const bad = [];
      const p = A.makeHand('maple-river-42', 'print'), paper = getPaper('plain');
      const opts = I.inkOpts(p, paper, 1, 1).layout;
      const s = new I.InkSession(p, I.newInkDoc('maple-river-42', 'print', 'ss'), opts, false, null);
      const type = (t) => { for (const ch of t) s.edit({ at: s.text().length, del: 0, ins: ch, kind: 'type', t: 0, source: 'paper' }); };
      type('# ');
      if (s.text() !== '' || s.style().role !== 'title') bad.push('"# " should make a title, unwritten');
      type('Plans\n'); s.flush();
      if (s.style().role !== 'body' || s.style(2).role !== 'title') bad.push('roles at the caret: ' + s.style().role + ' / ' + s.style(2).role);
      if (s.setRole('heading', 2) !== false) bad.push('a line in ink took a format');
      type('We go '); s.setStyle({ lean: 1 }); type('soon'); s.setStyle({ lean: 0, weight: 1 }); type(' now'); s.setStyle({ weight: 0 }); s.flush();
      const ws = s.doc.log.filter((e) => e.t === 'write').map((e) => [e.text, e.lean || 0, e.weight || 0]);
      if (!ws.some(([t, l]) => t.includes('soon') && l === 1) || !ws.some(([t, , w]) => t.includes('now') && w === 1) || ws.some(([t, l, w]) => t.includes('We') && (l || w))) bad.push('styles on writes: ' + JSON.stringify(ws));
      if (s.style(s.text().indexOf('soon') + 2).lean !== 1 || s.style(s.text().indexOf('now') + 1).weight !== 1) bad.push('style() at a word');
      type('\n[] Milk\nEggs\n\n');
      if (s.style().list !== null || !/Milk\nEggs\n$/.test(s.text())) bad.push('Return on an empty item should end the list: ' + JSON.stringify(s.text().slice(-12)));
      const eggs = s.text().split('\n').indexOf('Eggs');
      if (!s.toggleCheck(eggs) || !s.checks().find((c) => c.line === eggs)?.checked || s.checks().length !== 2) bad.push('ticking: ' + JSON.stringify(s.checks()));
      if (!s.liftMark() || s.checks().find((c) => c.line === eggs)?.checked) bad.push('a wet tick should lift');
      type('1. One\nTwo\n\n');
      if (!s.setRole('heading') || s.style().role !== 'heading') bad.push('setRole on an empty line');
      type('Notes'); s.flush();
      const hi = s.text().indexOf('We go');
      if (!s.highlight(hi, hi + 5, 'green') || I.inkHighlights(I.inkLive(p, s.page, paper, 1, 1)).filter(Boolean).length !== 1) bad.push('highlight');
      const again = A.replay(p, A.decodeDoc(A.encodeDoc(s.doc)), opts);
      if (A.renderSVG(p, again.page, SVG) !== A.renderSVG(p, s.page, SVG)) bad.push('the session should replay byte for byte');
      if (s.text() !== 'Plans\nWe go soon now\nMilk\nEggs\nOne\nTwo\nNotes') bad.push('text ' + JSON.stringify(s.text()));
      if (bad.length) fail('the session (lib/ink.ts): ' + bad.join('; '));
      else ok('the session (lib/ink.ts): shorthand, setRole, setStyle and style(), lists ended by Return, ticks that lift while wet, the highlighter; replays byte for byte');
    } finally { await server.close(); }
  }
}

console.log(`\n${fails.length ? `FAIL: ${fails.length} problems` : 'PASS'}`);
process.exit(fails.length ? 1 : 0);
