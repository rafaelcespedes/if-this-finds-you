#!/usr/bin/env node
// tools/qa/stet.mjs — Undo on dry ink (engine/sheet.js stet()): a crossing-out let stand, with dots under the word and
// "stet" in the margin. For three hands, a word crossed out (and crossed out harder, up to inked out) is let stand:
//   - the word is back in the letter's text, and the transcription says it was restored
//   - nothing already on the paper moves, and the new ink touches no other ink
//   - the log round-trips through the compact form and replays to the same page, byte for byte
//   - only the newest crossing-out comes back (not an older one in the same place), with every strike of its step
//   - logs from before stet (tools/qa/data/stet-old-logs.json, made by the engine before it) still decode to the same
//     compact form and replay to the same pages
//   node tools/qa/stet.mjs [dir]       (dir: also write each page's SVG there)
//   node tools/qa/stet.mjs --update    (the old logs' pages measured again: only when the engine's drawing changes on
//                                       purpose; say why in the commit)
import { loadEngine, resolveRoot, QA_DIR } from './lib/engine.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const E = await loadEngine(resolveRoot());
const args = process.argv.slice(2);
const update = args.includes('--update');
const out = args.find((a) => !a.startsWith('--'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const SVG = { width: 900, emPx: 58 };
let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };

function session(seed, style, opts, salt) {
  const p = E.makeHand(seed, style);
  const st = E.replay(p, E.newInkDoc({ seed, style, salt }), opts);
  const S = { p, st, view: E.newView(), step: [] };
  // each edit's events are one step (InkSession tells them apart by when the ink went down)
  const put = S.put = (events) => { const n = st.doc.log.length; E.apply(st, events); while (S.step.length < st.doc.log.length) S.step.push(n); };
  S.ed = (at, del, ins, kind) => { const r = E.plan(st, S.view, { at, del, ins, kind }); S.view = r.view; put(r.events); };
  S.same = (ev, newest) => S.step[ev] === S.step[newest];
  S.pen = () => { const r = E.penStep(st, S.view, { final: true }); S.view = r.view; put(r.events); };
  S.text = () => E.viewText(st, S.view);
  return S;
}
const snap = (it) => `${it.x.toFixed(3)},${it.y.toFixed(3)},${it.g && it.g.contours[0] ? it.g.contours[0][0].map((v) => v.toFixed(2)).join(',') : ''}`;
const boxOf = (it) => it.box;
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

const TEXT = 'Dear Ada, the figs are ripe and nobody picks them. I miss you terribly and the garden too. Write soon.';
const HANDS = [['tawny-atlas-52', 'adult-fr-2023'], ['quiet-heron-17', 'script'], ['brisk-parcel-92', 'quebec-print']];
const MARGIN = { maxWidth: 9000, lineHeight: 1500, marginLeft: 1700, firstBaseline: 2600 };
const BARE = { maxWidth: 12400, lineHeight: 1600 };
for (const [seed, style] of HANDS) {
  const said = [];
  for (const [name, opts] of [['margin', MARGIN], ['no margin', BARE]]) {
    for (const lv of [1, 2, 3, 4]) {
      const where = `${seed} ${name} level ${lv}`;
      const S = session(seed, style, opts, 's' + lv);
      const { st, p } = S;
      S.ed(0, 0, TEXT, 'type'); S.pen();
      const a = TEXT.indexOf('terribly');
      S.ed(a, 8, '', 'delete');
      for (let k = 1; k < lv; k++) { const r = E.again(st, S.view, a); S.view = r.view; S.put(r.events); }
      const before = new Map(st.page.items.filter((it) => it.key).map((it) => [it.key, snap(it)]));
      const n0 = st.page.items.length;
      const r = E.stet(st, S.view, a);
      if (!r || !r.events.length || r.events.some((e) => e.t !== 'stet')) { fail(`${where}: no stet`); continue; }
      S.view = r.view;
      S.put(r.events);
      // the word is back
      if (E.logicalText(st.doc) !== TEXT) fail(`${where}: the letter says ${JSON.stringify(E.logicalText(st.doc))}`);
      if (S.text() !== TEXT) fail(`${where}: the text box would read ${JSON.stringify(S.text())}`);
      if (!E.transcription(st.doc).includes('[restored: terribly]')) fail(`${where}: transcription ${JSON.stringify(E.transcription(st.doc))}`);
      // nothing already on the paper moves
      for (const it of st.page.items.slice(0, n0)) if (it.key && before.get(it.key) !== snap(it)) fail(`${where}: ${it.key} '${it.ch}' moved`);
      // the new ink: a row of dots, "stet" (and the word again, where it was scribbled or inked out), on no other ink
      const added = st.page.items.slice(n0);
      const dots = added.filter((it) => it.kind === 'mark' && it.mark === 'stet');
      const letters = added.filter((it) => it.kind === 'glyph' && it.role === 'stet').map((it) => it.ch).join('');
      const hidden = lv >= 3;
      const want = hidden ? ['stetterribly', 'terriblystet'] : 'stet';
      if (!dots.length || dots[0].g.strokes.length < 3) fail(`${where}: no row of dots`);
      if (Array.isArray(want) ? !want.includes(letters) : letters !== want) fail(`${where}: wrote ${JSON.stringify(letters)}`);
      const note = added.filter((it) => it.kind === 'glyph' && it.wk.endsWith('s'));
      if (opts === MARGIN) {
        const lineInk = st.page.items.slice(0, n0).filter((it) => it.line === note[0].line && it.box);
        const x0 = Math.min(...lineInk.map((it) => it.box[0]));
        if (note.some((it) => it.box[2] > x0)) fail(`${where}: the stet isn't in the margin`);
        for (const it of note) for (const o of st.page.items.slice(0, n0)) if (o.box && overlap(boxOf(it), o.box)) fail(`${where}: the stet's '${it.ch}' is on ${o.key}`);
      }
      // round trip and replay
      const enc = E.encodeDoc(st.doc);
      const doc2 = E.decodeDoc(enc);
      if (JSON.stringify(doc2.log) !== JSON.stringify(st.doc.log) || E.encodeDoc(doc2) !== enc || !enc.includes('["r",')) fail(`${where}: the compact form doesn't round-trip`);
      const svg = E.renderSVG(p, st.page, SVG);
      if (E.renderSVG(p, E.replay(E.makeHand(seed, style), doc2, opts).page, SVG) !== svg) fail(`${where}: replay differs from the live page`);
      if (/NaN|Infinity/.test(svg)) fail(`${where}: NaN in the page`);
      // without the stet, the log gives the page it gave before (the stet changed nothing else)
      const without = Object.assign({}, st.doc, { log: st.doc.log.filter((e) => e.t !== 'stet') });
      const page0 = E.replay(E.makeHand(seed, style), without, opts).page;
      if (page0.items.length !== n0 || page0.items.some((it, i) => it.key && snap(it) !== before.get(it.key))) fail(`${where}: the log without its stet draws a different page`);
      // crossed out again after (redo): struck again, and crossing it out harder starts over
      const b = S.text().indexOf('terribly');
      S.ed(b, 8, '', 'delete');
      const ag = E.again(st, S.view, b);
      if (E.logicalText(st.doc) === TEXT || !ag || ag.level !== 2) fail(`${where}: struck again after the stet: ${JSON.stringify(E.logicalText(st.doc))}, level ${ag && ag.level}`);
      if (out) fs.writeFileSync(`${out}/stet-${seed}-${name.replace(' ', '-')}-${lv}.svg`, svg);
      if (opts === MARGIN) said.push(`level ${lv}: ${dots[0].g.strokes.length} dots, ${JSON.stringify(letters)}`);
    }
  }
  // at the pen head: the last word Backspaced away, struck by the pen; let stand
  {
    const S = session(seed, style, MARGIN, 'h');
    S.ed(0, 0, 'See you on Sunday', 'type'); S.pen();
    for (let k = 0; k < 6; k++) S.ed(S.text().length - 1, 1, '', 'delete');
    S.pen();
    const r = E.stet(S.st, S.view, S.text().length);
    if (!r) fail(`${seed} pen head: no stet`);
    else { S.view = r.view; E.apply(S.st, r.events); }
    if (E.logicalText(S.st.doc) !== 'See you on Sunday') fail(`${seed} pen head: the letter says ${JSON.stringify(E.logicalText(S.st.doc))}`);
  }
  // only the newest crossing-out: "terribly" struck, then "you" next to it, in two steps; one stet brings back "you"
  // (told the steps apart, as InkSession does from when the ink went down), the next brings back "terribly"
  {
    const S = session(seed, style, MARGIN, 'n');
    S.ed(0, 0, TEXT, 'type'); S.pen();
    S.ed(TEXT.indexOf('terribly'), 8, '', 'delete');
    const y = S.text().indexOf('you ');
    S.ed(y, 4, '', 'delete');
    let r = E.stet(S.st, S.view, y, S.same);
    S.view = r.view; E.apply(S.st, r.events);
    if (E.logicalText(S.st.doc) !== TEXT.replace('terribly', '')) fail(`${seed} newest only: ${JSON.stringify(E.logicalText(S.st.doc))}`);
    r = E.stet(S.st, S.view, S.text().indexOf('you ') + 4, S.same);
    if (r) { S.view = r.view; E.apply(S.st, r.events); }
    if (E.logicalText(S.st.doc) !== TEXT) fail(`${seed} then the older: ${JSON.stringify(E.logicalText(S.st.doc))}`);
  }
  // one step that struck two runs (a selection across a word struck before): both come back, the older word stays struck
  {
    const S = session(seed, style, MARGIN, 'r');
    S.ed(0, 0, 'I miss you very terribly much.', 'type'); S.pen();
    S.ed(S.text().indexOf('very'), 4, '', 'delete');
    const t = S.text(), i = t.indexOf('you'), j = t.indexOf('much');
    S.ed(i, j - i, '', 'delete'); // "you  terribly " across the struck "very": two strikes, one step
    const r = E.stet(S.st, S.view, i, S.same);
    if (!r || r.strikes.length !== 2) fail(`${seed} two runs: ${r ? r.strikes.length : 'no'} strikes let stand`);
    else { S.view = r.view; E.apply(S.st, r.events); }
    if (E.logicalText(S.st.doc) !== 'I miss you  terribly much.') fail(`${seed} two runs: ${JSON.stringify(E.logicalText(S.st.doc))}`);
  }
  // glyph 0 alone: its compact form loses its zeros (["r"]) and still decodes
  {
    const S = session(seed, style, BARE, 'z');
    S.ed(0, 0, 'I am here.', 'type'); S.pen();
    S.ed(0, 1, '', 'delete');
    const r = E.stet(S.st, S.view, 0);
    if (!r) fail(`${seed} first letter: no stet`);
    else E.apply(S.st, r.events);
    const back = E.decodeDoc(E.encodeDoc(S.st.doc));
    if (JSON.stringify(back.log) !== JSON.stringify(S.st.doc.log) || E.logicalText(back) !== 'I am here.') fail(`${seed} first letter: ${JSON.stringify(back.log.slice(-1))}`);
  }
  console.log(fails ? '✗' : '✓', seed, style, '|', said.join(' · '));
}

// nothing to let stand: a word that isn't struck, or something in flight there
{
  const S = session('quiet-heron-17', 'script', BARE, 'x');
  S.ed(0, 0, 'Nothing struck here.', 'type'); S.pen();
  if (E.stet(S.st, S.view, 8)) fail('a stet where nothing is struck');
}

// logs from before stet: the same compact form, the same pages
{
  const file = path.join(QA_DIR, 'data', 'stet-old-logs.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let same = 0;
  for (const l of data.logs) {
    const doc = E.decodeDoc(l.doc);
    if (E.encodeDoc(doc) !== l.doc) fail(`old log ${l.seed}: the compact form changed`);
    if (E.logicalText(doc) !== l.text) fail(`old log ${l.seed}: the letter says ${JSON.stringify(E.logicalText(doc))}`);
    const p = E.makeHand(l.seed, l.style);
    const h = sha(E.renderSVG(p, E.replay(p, doc, l.opts).page, SVG));
    if (update) l.svg = h;
    else if (h !== l.svg) fail(`old log ${l.seed} (${JSON.stringify(l.opts)}): replays to a different page`);
    else same++;
  }
  if (update) { fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n'); console.log(`  old logs: ${data.logs.length} pages measured again`); }
  else console.log(`  old logs: ${same}/${data.logs.length} replay to the same page as before stet`);
}

console.log(`\n${fails ? `FAIL: ${fails} problems` : 'PASS'}`);
process.exit(fails ? 1 : 0);
