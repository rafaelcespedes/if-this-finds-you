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
