#!/usr/bin/env node
// tools/qa/journey.mjs — checks for the writer's journey (engine/corrections.js):
//   - amount 0 is exactly layout() (same items, same SVG)
//   - determinism: same hand + text + amount + draft = byte-identical SVG
//   - the ink log replays to the intended text, for every hand and text
//   - more `amount` only adds mistakes (the ones already there stay)
//   - the writing animation strikes a word after writing it and before the rewrite; overwrites follow
//     the wrong letter; nothing is NaN; hostile input never throws
//   - how many corrections per 100 words, by amount (calibration, printed)
//   node tools/qa/journey.mjs [--root=<checkout>]

import { loadEngine, resolveRoot } from './lib/engine.mjs';

const E = await loadEngine(resolveRoot());
const LETTER = 'Dear Ada,\n\nThe little letters never quite match, and that is the point. ' +
  'Every word I write to you comes out a touch different, the way it would if I sat down with a real pen.\n\n' +
  'See you on Sunday at 7:30. Bring the old maps & a good pen!\n\nYours,\nO.';
const TEXTS = [
  LETTER,
  LETTER + '\n\nP.S. The fox says hello. Bring the blue one if you still have it.',
  'The quick brown fox jumps over the lazy dog. Tomorrow I will receive the necessary letters, and I really hope they arrive.',
  '\n\nleading breaks, trailing ones\n\n',
  'one',
];
const HOSTILE = ['', ' ', '\n\n\n', '   \n  ', 'a'.repeat(400), '😀👍🏽 hello there my friend', 'é à ü', '\t\t', '​‍', 'x\r\ny', '�', 'ﬁ', 'P.S.', 'P.S.\nP.S.'];
const A = ['maple', 'quiet', 'amber', 'salt', 'river', 'paper', 'velvet', 'cedar', 'misty', 'lunar'];
const B = ['river', 'harbor', 'sparrow', 'meadow', 'lantern', 'pebble'];
const seeds = [];
for (const a of A) for (const b of B) seeds.push(`${a}-${b}-${(a.length * 7 + b.length * 3) % 90 + 10}`);
const OPTS = { maxWidth: 12400, lineHeight: 1600, firstBaseline: 950 };
const fails = [];
const fail = (m) => { fails.push(m); if (fails.length < 25) console.log('  ✗ ' + m); };
const svgOf = (p, page) => E.renderSVG(p, page, { width: 720, emPx: 58, strokeIds: true });

let n = 0;
for (const [i, s] of seeds.entries()) {
  const style = i % 2 ? 'print' : 'script';
  const p = E.makeHand(s, style);
  for (const [ti, text] of TEXTS.entries()) {
    // amount 0 = the fair copy, untouched
    if (ti < 2 && i < 20) {
      const j0 = E.writeWithJourney(p, text, OPTS, { amount: 0 });
      if (svgOf(p, j0.page) !== svgOf(p, E.layout(p, text, OPTS))) fail(`${s}/${style} text ${ti}: amount 0 differs from layout()`);
    }
    for (const amount of [undefined, 0.5, 1]) {
      const j = E.writeWithJourney(p, text, OPTS, { amount });
      n++;
      if (!j.ok) fail(`${s}/${style} text ${ti} amount ${amount}: the log replays to something else than the text`);
      const svg = svgOf(p, j.page);
      if (/NaN|Infinity/.test(svg) || !Number.isFinite(j.page.height)) fail(`${s}/${style} text ${ti}: NaN in the page`);
      if (i < 12 && amount === 0.5) {
        const again = E.writeWithJourney(E.makeHand(s, style), text, OPTS, { amount });
        if (svgOf(p, again.page) !== svg) fail(`${s}/${style} text ${ti}: not deterministic`);
        if (JSON.stringify(again.events) !== JSON.stringify(j.events)) fail(`${s}/${style} text ${ti}: events not deterministic`);
      }
      // the animation: a strike after its word's letters, before the next word; an overwrite right after its wrong letter
      if (ti === 0) {
        const tl = E.timeline(j.page);
        const t0 = new Map();
        for (const ev of tl.events) if (!t0.has(ev.item)) t0.set(ev.item, ev.t0);
        j.page.items.forEach((it, k) => {
          if (it.mark === 'strike' || it.mark === 'scribble') {
            const struck = j.page.items.map((x, q) => [x, q]).filter(([x]) => x.fix === it.fix && x.role === 'struck');
            if (struck.some(([, q]) => t0.get(q) > t0.get(k))) fail(`${s}/${style}: a strike is drawn before its word`);
          }
          if (it.role === 'over') {
            const wq = j.page.items.findIndex((x) => x.fix === it.fix && x.role === 'wrong');
            if (!(t0.get(wq) < t0.get(k))) fail(`${s}/${style}: an overwrite comes before its wrong letter`);
          }
        });
      }
    }
  }
}
// The app's render path (live sheets: page.runs drawn with renderRun, inked by createPen + paintPen):
// every correction must leave visible ink there. A bug-only guard (missing ink), not a taste check.
//   - every mark item sits in a run, and renderRun draws a keyed, non-empty path for each of its strokes
//   - every fix leaves its ink: a strike or scribble for struck words, a caret for a forgotten word, a
//     letter written over for an overwrite (in a run too)
//   - the pen inks every mark stroke, and a strike only once the word it crosses out is written
let markChecks = 0;
for (const [i, s] of seeds.slice(0, 24).entries()) {
  const style = i % 2 ? 'print' : 'script';
  const p = E.makeHand(s, style);
  for (const text of [LETTER, TEXTS[1]]) {
    const j = E.writeWithJourney(p, text, OPTS, { amount: 1 });
    const pg = j.page;
    const runOf = new Map();
    for (const r of pg.runs || []) for (let k = r.from; k < r.to; k++) runOf.set(k, r);
    pg.items.forEach((it, k) => {
      if (it.kind !== 'mark' && it.role !== 'over') return;
      markChecks++;
      const r = runOf.get(k);
      if (!r) { fail(`${s}/${style}: ${it.kind === 'mark' ? it.mark : 'overwrite'} ${it.key} is in no run (the app's live sheets would never draw it)`); return; }
      const svg = E.renderRun(p, pg, r, { emPx: 40, strokeKeys: true });
      const drawn = (svg.match(new RegExp(`data-s="${it.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#\\d+"`, 'g')) || []).length;
      if (drawn < it.g.strokes.length || !/ d="M/.test(svg)) fail(`${s}/${style}: ${it.key} drew ${drawn}/${it.g.strokes.length} strokes in renderRun`);
    });
    j.fixes.forEach((f, n) => {
      const mine = pg.items.filter((it) => it.fix === n);
      const want = f.type === 'omit' ? (it) => it.mark === 'caret' : f.how === 'over' ? (it) => it.role === 'over' : (it) => it.mark === 'strike' || it.mark === 'scribble';
      if (!mine.some(want)) fail(`${s}/${style}: fix ${n} (${f.type}/${f.how} "${f.wrote}") left no ${f.type === 'omit' ? 'caret' : f.how === 'over' ? 'overwrite' : 'strike'} on the page`);
    });
    // the pen, as the app runs it: it inks every mark stroke, and a strike after its word
    const pen = E.createPen({ hold: 'word', fast: 12, reducedMotion: false });
    pen.sync(pg, 0);
    const first = new Map(), done = new Map();
    const strokes = pg.items.filter((it) => it.kind === 'glyph' || it.kind === 'mark').flatMap((it) => it.g.strokes.map((_, si) => [it.key, si]));
    for (let t = 0.05; t < 400 && done.size < strokes.length; t += 0.05) {
      const st = pen.at(t);
      for (const [key, si] of strokes) {
        const v = st.ink(key, si), id = key + '#' + si;
        if (v > 0 && !first.has(id)) first.set(id, t);
        if (v >= 1 && !done.has(id)) done.set(id, t);
      }
      if (!st.busy && !st.writing) break;
    }
    for (const it of pg.items) {
      if (it.kind !== 'mark') continue;
      it.g.strokes.forEach((_, si) => { if (!done.has(it.key + '#' + si)) fail(`${s}/${style}: the pen never inks ${it.mark} ${it.key} stroke ${si}`); });
      if ((it.mark === 'strike' || it.mark === 'scribble') && it.fix != null) {
        const struck = pg.items.filter((x) => x.fix === it.fix && x.role === 'struck' && x.kind === 'glyph');
        const t0 = first.get(it.key + '#0');
        const last = Math.max(...struck.flatMap((x) => x.g.strokes.map((_, si) => done.get(x.key + '#' + si) || 0)));
        if (t0 != null && struck.length && t0 < last - 1e-9) fail(`${s}/${style}: ${it.key} is struck before its word is written (${t0.toFixed(2)} s < ${last.toFixed(2)} s)`);
      }
    }
  }
}
console.log(`  app render path: ${markChecks} marks and overwrites drawn in runs and inked by the pen`);

// more amount only adds mistakes
for (const [i, s] of seeds.slice(0, 30).entries()) {
  const p = E.makeHand(s, i % 2 ? 'print' : 'script');
  let prev = new Set();
  for (const amount of [0.1, 0.25, 0.4, 0.6, 0.8, 1]) {
    const now = new Set(E.writeWithJourney(p, LETTER, OPTS, { amount }).fixes.map((f) => f.at + ':' + f.type));
    for (const k of prev) if (!now.has(k)) { fail(`${s}: mistake ${k} at amount < ${amount} vanished at ${amount}`); break; }
    prev = now;
  }
}
// hostile input
for (const style of E.styleNames()) {
  const p = E.makeHand('hostile', style);
  for (const t of HOSTILE) {
    try {
      const j = E.writeWithJourney(p, t, { maxWidth: 4000 }, { amount: 1 });
      const svg = E.renderSVG(p, j.page, { width: 300, emPx: 40 });
      if (/NaN|Infinity/.test(svg) || !j.ok) fail(`${style}: hostile ${JSON.stringify(t).slice(0, 20)} -> NaN or bad replay`);
    } catch (e) { fail(`${style}: hostile ${JSON.stringify(t).slice(0, 20)} threw ${e.message}`); }
  }
}
// calibration: corrections per 100 words, and what kinds
const words = LETTER.split(/\s+/).filter(Boolean).length;
for (const amount of [undefined, 0.25, 0.5, 1]) {
  let total = 0, clean = 0;
  const kinds = {};
  for (const [i, s] of seeds.entries()) {
    const j = E.writeWithJourney(E.makeHand(s, i % 2 ? 'print' : 'script'), LETTER, OPTS, { amount });
    total += j.fixes.length; if (!j.fixes.length) clean++;
    for (const f of j.fixes) { const k = f.type === 'slip' ? (f.how === 'over' ? 'overwrite' : 'slip, struck') : f.type; kinds[k] = (kinds[k] || 0) + 1; }
  }
  console.log(`  amount ${amount == null ? 'natural' : amount}: ${(100 * total / seeds.length / words).toFixed(1)} per 100 words · ${(total / seeds.length).toFixed(1)} per letter · ${clean}/${seeds.length} clean · ` +
    Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', '));
}
console.log(`\n${n} journeys checked. ${fails.length ? `FAIL: ${fails.length} problems` : 'PASS'}`);
process.exit(fails.length ? 1 : 0);
