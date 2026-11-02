#!/usr/bin/env node
// tools/qa/ink.mjs — checks for Ink mode (engine/sheet.js, inklog.js):
//   - random editing sessions (typing with typos, Backspace, mid-text insertions, select + delete,
//     select + type, Enter and space mid-text, pauses): the textarea text always equals viewText, and at the
//     end logicalText(log) equals it (writing-experience.md §7.5 property test)
//   - nothing already on paper ever moves: every item keeps its position and outline as events arrive
//   - golden replay: replaying the log gives a byte-identical SVG to the live page
//   - share links round-trip; fresh sheet, fair copy and P.S. behave
//   - corrections per 100 words for a typical typist with Forgiving on (target 1–3, §3.6), printed
//   node tools/qa/ink.mjs [--root=<checkout>] [--sessions=N]

import { loadEngine, resolveRoot } from './lib/engine.mjs';

const E = await loadEngine(resolveRoot());
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : d; };
const SESSIONS = arg('sessions', 24);
const LETTER = 'Dear Ada,\n\nThe little letters never quite match, and that is the point. ' +
  'Every word I write to you comes out a touch different, the way it would if I sat down with a real pen.\n\n' +
  'See you on Sunday at 7:30. Bring the old maps & a good pen!\n\nYours,\nO.';
const OPTS = { maxWidth: 12400, lineHeight: 1600 };
const fails = [];
const fail = (m) => { fails.push(m); if (fails.length < 20) console.log('  ✗ ' + m); };

// a tiny deterministic rng for the simulated typist
function prng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const KEYS = 'qwertyuiopasdfghjklzxcvbnm';

function session(seed, style, k, { typo = 0.04, late = 0.35, mid = 0.25 } = {}) {
  const p = E.makeHand(seed, style);
  const doc = E.newInkDoc({ seed, style, salt: 'qa' + k });
  const st = E.replay(p, doc, OPTS);
  let view = E.newView(), value = '', clock = 0, lastKey = 0;
  const r = prng(k * 7919 + seed.length * 31 + (style === 'script' ? 5 : 0));
  const seen = new Map(); // item key -> snapshot
  const snap = (it) => `${it.x.toFixed(3)},${it.y.toFixed(3)},${it.g && it.g.contours[0] ? it.g.contours[0][0].map((v) => v.toFixed(2)).join(',') : ''}`;
  const check = (where) => {
    const vt = E.viewText(st, view);
    if (vt !== value) { fail(`${seed}/${style}#${k} ${where}: view ${JSON.stringify(vt.slice(-40))} vs textarea ${JSON.stringify(value.slice(-40))}`); throw new Error('stop'); }
    for (const it of st.page.items) {
      if (!it.key) continue;
      const s = snap(it), was = seen.get(it.key);
      if (was == null) seen.set(it.key, s);
      else if (was !== s) { fail(`${seed}/${style}#${k} ${where}: item ${it.key} '${it.ch}' moved`); throw new Error('stop'); }
    }
  };
  const edit = (e) => {
    value = value.slice(0, e.at) + (e.ins || '') + value.slice(e.at + (e.del || 0));
    const res = E.plan(st, view, e);
    E.apply(st, res.events); view = res.view;
    check('after ' + e.kind);
    lastKey = clock;
  };
  const tick = (ms) => {
    clock += ms;
    const res = E.penStep(st, view, { dt: ms, idle: clock - lastKey });
    E.apply(st, res.events); view = res.view;
    check('pen');
  };
  const typeChar = (ch) => { edit({ at: value.length, del: 0, ins: ch, kind: 'type' }); tick(120 + 130 * r()); };
  try {
    for (const ch of LETTER) {
      if (/[a-z]/.test(ch) && r() < typo) {
        // a typo: a neighbour key, noticed now (still in the buffer) or a bit later (often on ink)
        typeChar(KEYS[Math.floor(r() * KEYS.length)]);
        if (r() < late) { typeChar(ch === ' ' ? 'x' : 'e'); tick(900 + 900 * r()); edit({ at: value.length - 1, del: 1, kind: 'delete' }); tick(150); }
        edit({ at: value.length - 1, del: 1, kind: 'delete' });
        tick(150);
      }
      typeChar(ch);
      if (r() < 0.02) tick(1500 + 1500 * r()); // a pause to think
      if (r() < mid / 30 && value.length > 40) {
        // go back and change something written earlier
        const kind = r();
        const ws = [...value.matchAll(/\p{L}+/gu)].filter((m) => m.index < value.length - 20);
        const w = ws[Math.floor(r() * ws.length)];
        if (w) {
          if (kind < 0.35) { for (const [j, c] of [...'very '].entries()) edit({ at: w.index + j, del: 0, ins: c, kind: 'type' }); }
          else if (kind < 0.6) edit({ at: w.index, del: w[0].length + 1 <= value.length - w.index ? w[0].length + 1 : w[0].length, kind: 'delete' });
          else if (kind < 0.85) edit({ at: w.index, del: w[0].length, ins: 'grand', kind: 'replace' });
          else if (w[0].length > 3) edit({ at: w.index + 2, del: 0, ins: ' ', kind: 'type' });
          tick(2000);
          tick(2000);
        }
      }
    }
    tick(2500);
    const res = E.penStep(st, view, { final: true });
    E.apply(st, res.events); view = res.view;
    check('final');
    if (E.logicalText(st) !== value) fail(`${seed}/${style}#${k}: the log says ${JSON.stringify(E.logicalText(st).slice(0, 60))}… not the textarea`);
    const live = E.renderSVG(p, st.page, { width: 720, emPx: 58 });
    if (/NaN|Infinity/.test(live)) fail(`${seed}/${style}#${k}: NaN in the page`);
    const again = E.replay(E.makeHand(seed, style), E.decodeDoc(E.encodeDoc(doc)), OPTS);
    if (E.renderSVG(p, again.page, { width: 720, emPx: 58 }) !== live) fail(`${seed}/${style}#${k}: replay differs from the live page`);
    return { doc, st, words: value.split(/\s+/).filter(Boolean).length };
  } catch (e) {
    if (e.message !== 'stop') fail(`${seed}/${style}#${k}: threw ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
    return null;
  }
}

const seeds = ['quiet-heron-17', 'maple-river-42', 'amber-comet-63', 'salt-meadow-21', 'velvet-fable-88', 'north-moth-22'];
let words = 0, marks = 0, done = 0, logs = 0, links = [];
for (let k = 0; k < SESSIONS; k++) {
  const seed = seeds[k % seeds.length], style = k % 2 ? 'print' : 'script';
  const res = session(seed, style, k);
  if (!res) continue;
  done++;
  words += res.words;
  const c = E.inkSummary(res.st);
  marks += res.st.reader.counts.struck + res.st.reader.counts.scribbled + res.st.reader.counts.over;
  logs += res.doc.log.length;
  if (k < 6) links.push((await E.encodeInkLink(res.doc)).length);
  if (k < 6) {
    const back = await E.decodeInkLink(await E.encodeInkLink(res.doc));
    if (JSON.stringify(back.log) !== JSON.stringify(res.doc.log)) fail(`${seed}: share link does not round-trip`);
  }
  void c;
}

// commands
{
  const p = E.makeHand('quiet-heron-17', 'script');
  const doc = E.newInkDoc({ seed: 'quiet-heron-17', style: 'script' });
  const st = E.replay(p, doc, OPTS);
  let view = E.newView();
  let r = E.plan(st, view, { at: 0, del: 0, ins: 'Dear Ada, it was lovely to see you.', kind: 'paste' });
  E.apply(st, r.events); view = r.view;
  r = E.penStep(st, view, { final: true }); E.apply(st, r.events); view = r.view;
  // select all + delete: a fresh sheet, never a page of strikes
  const all = E.viewText(st, view).length;
  r = E.plan(st, view, { at: 0, del: all, ins: '', kind: 'delete' }); E.apply(st, r.events); view = r.view;
  if (!r.events.some((e) => e.t === 'sheet' && e.why === 'fresh') || E.logicalText(st) !== '' || st.page.items.length) fail('select all + delete should start a fresh sheet');
  r = E.plan(st, view, { at: 0, del: 0, ins: 'Dear Ada,\nwe teh best.', kind: 'paste' }); E.apply(st, r.events); view = r.view;
  r = E.penStep(st, view, { final: true }); E.apply(st, r.events); view = r.view;
  const t = E.viewText(st, view), i = t.indexOf('teh');
  r = E.plan(st, view, { at: i, del: 3, ins: 'the', kind: 'replace' }); E.apply(st, r.events); view = r.view;
  r = E.penStep(st, view, { final: true }); E.apply(st, r.events); view = r.view;
  if (E.logicalText(st) !== 'Dear Ada,\nwe the best.') fail('select + type: ' + JSON.stringify(E.logicalText(st)));
  const fair = E.fairCopy(st); E.apply(st, fair);
  if (E.logicalText(st) !== 'Dear Ada,\nwe the best.' || st.page.items.some((it) => it.role === 'mark' || it.role === 'struck')) fail('fair copy should be the clean text on a fresh sheet');
  E.apply(st, E.postScript(st));
  r = E.plan(st, view, { at: E.viewText(st, view).length, del: 0, ins: 'P.S. Bring the maps.', kind: 'type' }); E.apply(st, r.events); view = r.view;
  r = E.penStep(st, view, { final: true }); E.apply(st, r.events); view = r.view;
  if (!st.page.items.some((it) => it.role === 'ps') || E.logicalText(st) !== 'Dear Ada,\nwe the best.\nP.S. Bring the maps.') fail('P.S.: ' + JSON.stringify(E.logicalText(st)));
  // hostile edits never throw
  for (const e of [{ at: 999, del: 5, ins: 'x' }, { at: -3, del: 0, ins: '' }, { at: 0, del: 999, ins: '😀\n\n' }, { at: 2, del: 0, ins: '\n' }, { at: 1, del: 1, ins: ' ' }]) {
    try { const q = E.plan(st, view, e); E.apply(st, q.events); view = q.view; const w = E.penStep(st, view, { final: true }); E.apply(st, w.events); view = w.view; }
    catch (err) { fail('hostile edit ' + JSON.stringify(e) + ' threw ' + err.message); }
  }
  // undo the wet tail
  const n = st.doc.log.length;
  const st2 = E.dropLast(st);
  if (st2.doc.log.length !== n - 1) fail('dropLast should remove one event');
}

console.log(`  ${done}/${SESSIONS} sessions · ${(100 * marks / Math.max(1, words)).toFixed(1)} visible corrections per 100 words (typo rate 4%, 35% noticed late, Forgiving on) · ${(logs / Math.max(1, done)).toFixed(0)} events per letter · share links ${links.join(', ')} chars`);
console.log(`\n${fails.length ? `FAIL: ${fails.length} problems` : 'PASS'}`);
process.exit(fails.length ? 1 : 0);
