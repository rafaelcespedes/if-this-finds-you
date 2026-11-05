#!/usr/bin/env node
// tools/qa/again.mjs — crossing out again (engine/sheet.js again()): Backspace at a struck word goes over it harder,
// a level at a time (a heavier strike, a scribble, inked out), then stops; the text never changes; the log replays
// to the same page; underline ranges skip the spaces at their ends.
//   node tools/qa/again.mjs [dir]   (dir: also write each page's SVG there)
import { loadEngine, resolveRoot } from './lib/engine.mjs';
import fs from 'node:fs';
const E = await loadEngine(resolveRoot());
const OPTS = { maxWidth: 12400, lineHeight: 1600 };
const out = process.argv[2];
for (const [seed, style] of [['tawny-atlas-52', 'adult-fr-2023'], ['quiet-heron-17', 'script'], ['brisk-parcel-92', 'quebec-print']]) {
  const p = E.makeHand(seed, style);
  const doc = E.newInkDoc({ seed, style, salt: 't1' });
  const st = E.replay(p, doc, OPTS);
  let view = E.newView();
  const ed = (at, del, ins, kind) => { const r = E.plan(st, view, { at, del, ins, kind }); view = r.view; E.apply(st, r.events); };
  const pen = () => { const r = E.penStep(st, view, { final: true }); view = r.view; E.apply(st, r.events); };
  let t = 'I miss you terribly and the garden too';
  ed(0, 0, t, 'type'); pen();
  // select "terribly" (mid-text) and delete it
  const a = t.indexOf('terribly');
  ed(a, 8, '', 'delete');
  t = E.viewText(st, view);
  const levels = [];
  for (let k = 0; k < 5; k++) { const r = E.again(st, view, a); if (!r) { levels.push('null'); break; } levels.push(r.level + ':' + r.events.map((e) => e.how).join(',')); view = r.view; E.apply(st, r.events); }
  // at the end: type more, delete the last word at the pen head, then again
  ed(t.length, 0, ' now', 'type'); pen();
  let v2 = E.viewText(st, view);
  for (let k = 0; k < 4; k++) ed(v2.length - k, 1, '', 'delete');
  const rp = E.penStep(st, view, { final: true }); view = rp.view; E.apply(st, rp.events);
  v2 = E.viewText(st, view);
  const end = [];
  for (let k = 0; k < 4; k++) { const r = E.again(st, view, v2.length); if (!r) { end.push('null'); break; } end.push(r.level + ':' + r.events.map((e) => e.how).join(',')); view = r.view; E.apply(st, r.events); }
  // underline "garden"
  const g = v2.indexOf('garden');
  const runs = E.inkIdsIn(st, view, g - 1, g + 7);
  // determinism: replay from encoded log
  const doc2 = E.decodeDoc(E.encodeDoc(st.doc));
  const st2 = E.replay(p, doc2, OPTS);
  const svg1 = E.renderSVG(p, st.page, { width: 900, emPx: 58 }), svg2 = E.renderSVG(p, st2.page, { width: 900, emPx: 58 });
  const ok = levels.slice(0, 4).map((x) => x.split(':')[0]).join() === '2,3,4,4' && end.slice(0, 3).map((x) => x.split(':')[0]).join() === '2,3,4'
    && E.logicalText(st.doc) === 'I miss you  and the garden too ' && svg1 === svg2 && runs.length === 1 && runs[0][1] - runs[0][0] === 5;
  if (!ok) process.exitCode = 1;
  console.log(ok ? '✓' : '✗', seed, style, '| mid:', levels.join(' '), '| end:', end.join(' '), '| text:', JSON.stringify(E.logicalText(st.doc)), '| underline runs', JSON.stringify(runs), '| replay same:', svg1 === svg2, '|', E.transcription(st.doc));
  if (out) fs.writeFileSync(`${out}/again-${seed}.svg`, svg1);
}
