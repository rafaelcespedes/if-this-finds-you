#!/usr/bin/env node
// tools/qa/tempo.mjs — the hand keeps your tempo (engine/tempo.js, issue #4): a fast burst of typing comes out hastier,
// slow, careful typing tidier, against the typist's own average. Checks:
//   - the typist: a burst reads as hasty, slow typing as careful, a steady pace settles back to the usual hand, pauses
//     to think don't count
//   - write.haste round-trips through the compact form and share links; old compact logs decode and re-encode unchanged
//   - a log with haste replays to the same page, byte for byte, and nothing already on paper moves while it's written
//   - old logs are unchanged: no haste is the same page as haste 0 (and, with --against=<checkout of the version before>,
//     the same page that version draws)
//   - a word keeps the haste it started with when it's continued in a later piece
//   - the same sentence typed fast comes out hastier than typed slowly: leaning more, wider, drawn quicker; never extreme
//   node tools/qa/tempo.mjs [--against=<checkout>] [dir]   (dir: also write the fast and slow pages' SVGs there)
import { loadEngine, resolveRoot } from './lib/engine.mjs';
import path from 'node:path';
import fs from 'node:fs';

const E = await loadEngine(resolveRoot());
const againstArg = process.argv.find((a) => a.startsWith('--against='));
const OLD = againstArg ? await loadEngine(path.resolve(againstArg.slice(10))) : null;
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
const OPTS = { maxWidth: 12400, lineHeight: 1600 };
const SVG = { width: 900, emPx: 58 };
const fails = [];
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

// ---------- the typist ----------
{
  const run = (gaps, T = E.newTypist()) => { let t = 1000; E.typistKey(T, t); for (const g of gaps) { t += g; E.typistKey(T, t); } return T; };
  const fast = E.typistHaste(run(Array(30).fill(40)));
  const slow = E.typistHaste(run(Array(30).fill(400)));
  const usual = E.typistHaste(run(Array(30).fill(240)));
  const settled = E.typistHaste(run(Array(600).fill(130)));
  const burst = E.typistHaste(run(Array(8).fill(110), run(Array(200).fill(260))));
  const lull = E.typistHaste(run(Array(8).fill(520), run(Array(200).fill(260))));
  // pauses to think (and two events of one key) aren't tempo: a usual pace with long pauses stays the usual hand
  const paused = E.typistHaste(run(Array.from({ length: 60 }, (_, i) => (i % 6 === 5 ? 4000 : i % 6 === 4 ? 3 : 240))));
  const r = { fast, slow, usual, settled, burst, lull, paused };
  if (fast !== 2 || slow >= 0 || usual !== 0 || settled !== 0 || burst <= 0 || lull >= 0 || paused !== 0) fail('typist: ' + JSON.stringify(r));
  else ok(`typist: 40 ms a key ${fast}, 400 ms ${slow}, 240 ms ${usual}; a steady 130 ms settles to ${settled}; a burst in steady typing ${burst}, a lull ${lull}; pauses don't count (${paused})`);
  if (E.hasteStep(9) !== 2 || E.hasteStep(-7.4) !== -2 || E.hasteStep('x') !== 0 || E.hasteStep(undefined) !== 0 || E.hasteStep(1.4) !== 1) fail('hasteStep should clamp to -2 … 2 whole steps');
}

// ---------- the compact form and share links ----------
{
  const log = [
    { t: 'write', text: 'Dear ', haste: 2 }, { t: 'write', text: 'Ada, ' }, { t: 'write', text: 'it was lov', rest: 'ely', haste: -1 },
    { t: 'write', text: 'ely', cont: true }, { t: 'break' }, { t: 'write', text: 'Yours', haste: -2 }, { t: 'strike', from: 0, to: 3, how: 'line', why: 'deleted' },
  ];
  const doc = Object.assign(E.newInkDoc({ seed: 'quiet-heron-17', style: 'script', salt: 'rt' }), { log });
  const back = E.decodeDoc(E.encodeDoc(doc));
  const linked = await E.decodeInkLink(await E.encodeInkLink(doc));
  if (JSON.stringify(back.log) !== JSON.stringify(log) || JSON.stringify(linked.log) !== JSON.stringify(log)) fail('haste does not round-trip: ' + JSON.stringify(back.log));
  else ok('haste round-trips through the compact form and share links: ' + JSON.stringify(JSON.parse(E.encodeDoc(doc)).l.slice(0, 3)));
  // old compact logs, as the version before wrote them (no haste anywhere)
  const OLD_LOGS = [
    '{"v":1,"ev":"seedhand-ink-1","s":"old1","h":["maple-river-42","print",null],"p":{"kind":"plain"},"m":"ink","l":[["w","Dear "],["w","Ada, "],["w","teh "],["w","garden"],["w"," "],["w","is lovely"],["o",11,"h"],["o",12,"e"],["w"," "],["w","this "],["w","morning."],["b"],["w","Yours"]]}',
    '{"v":1,"ev":"seedhand-ink-1","s":"old2","h":["quiet-heron-17","script",null],"p":{"kind":"plain"},"m":"ink","l":[["w","Dear "],["w","Ada,",1],["w"," it was lov",0,"ely"],["w","ely"],["w"," and "],["x",11,13,"line","deleted"],["w","the sea"],["b"],["w","P"],["v","ps"],["w","Bring maps."]]}',
  ];
  for (const s of OLD_LOGS) {
    const d = E.decodeDoc(s);
    if (d.log.some((e) => 'haste' in e)) fail('an old compact log decoded with a haste');
    if (E.encodeDoc(d) !== s) fail('an old compact log re-encodes differently:\n    ' + E.encodeDoc(d) + '\n    ' + s);
    const p = E.makeHand(d.hand.seed, d.hand.style);
    const a = E.renderSVG(p, E.replay(p, d, OPTS).page, SVG);
    // haste 0 on every write is exactly no haste
    const zero = Object.assign({}, d, { log: d.log.map((e) => (e.t === 'write' ? Object.assign({}, e, { haste: 0 }) : e)) });
    if (E.renderSVG(p, E.replay(p, zero, OPTS).page, SVG) !== a) fail(`${d.salt}: haste 0 draws a different page from no haste`);
    if (OLD) {
      const q = OLD.makeHand(d.hand.seed, d.hand.style);
      if (OLD.renderSVG(q, OLD.replay(q, OLD.decodeDoc(s), OPTS).page, SVG) !== a) fail(`${d.salt}: an old log draws a different page from the version before`);
    }
  }
  if (!fails.length) ok(`old compact logs decode and re-encode unchanged, and draw the same page${OLD ? ' as the version before (--against)' : ' with no haste as with haste 0'}`);
}

// ---------- a typing session, as the app runs it (lib/ink.ts InkSession) ----------
// Keys arrive `gap` ms apart; the pen is stepped between keys (penStep at its own pace) and the tail's tempo kept
// beside the view (hasteCarry), so each write carries the tempo its first new word was typed at.
function session(seed, style, text, gap, { salt = 'tq', typist = E.newTypist() } = {}) {
  const p = E.makeHand(seed, style);
  const doc = E.newInkDoc({ seed, style, salt });
  const st = E.replay(p, doc, OPTS);
  let view = E.newView(), hastes = [], clock = 1000, lastKey = clock;
  const seen = new Map();
  let moved = null;
  const snap = (it) => `${it.x.toFixed(3)},${it.y.toFixed(3)},${it.g && it.g.contours[0] ? it.g.contours[0][0].map((v) => v.toFixed(2)).join(',') : ''}`;
  const check = () => {
    for (const it of st.page.items) {
      if (!it.key) continue;
      const s = snap(it), was = seen.get(it.key);
      if (was == null) seen.set(it.key, s); else if (was !== s && !moved) moved = `${it.key} '${it.ch}'`;
    }
  };
  const go = (r) => {
    hastes = E.hasteCarry(st, r.events, view.tail, hastes, r.view.tail, E.typistHaste(typist));
    view = r.view;
    E.apply(st, r.events);
    check();
  };
  for (const ch of text) {
    E.typistKey(typist, clock, true);
    go(E.plan(st, view, { at: E.viewText(st, view).length, del: 0, ins: ch, kind: 'type' }));
    lastKey = clock;
    // the draft (thought letters) is laid out at the next word's tempo, without ever throwing
    E.draftPage(st, view, { haste: E.hasteNext(st, view.tail, hastes) });
    for (let t = 0; t < gap; t += 130) { clock += Math.min(130, gap - t); go(E.penStep(st, view, { dt: Math.min(130, gap - t), idle: clock - lastKey })); }
  }
  for (let k = 0; k < 40 && view.tail; k++) { clock += 130; go(E.penStep(st, view, { dt: 130, idle: clock - lastKey })); }
  go(E.penStep(st, view, { final: true }));
  return { p, st, doc, moved };
}

// how a page reads: the letters' mean lean (degrees, from their own centrelines), the words' total width (font units),
// the drawn pen's mean tempo, and the hastes its writes carry
function measure(res) {
  const glyphs = res.st.page.items.filter((it) => it.kind === 'glyph' && it.glyph && /\p{L}/u.test(it.ch));
  let lean = 0, n = 0;
  for (const it of glyphs) {
    const pts = it.glyph.strokes.flatMap((s) => s.center);
    if (pts.length < 4) continue;
    const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    let sxy = 0, syy = 0;
    for (const [x, y] of pts) { sxy += (x - mx) * (y - my); syy += (y - my) * (y - my); }
    if (syy > 0) { lean += Math.atan(sxy / syy) * 180 / Math.PI; n++; }
  }
  // each word's own extent (a word written in pieces is still one word: its letters share wk)
  const words = new Map();
  for (const it of glyphs) { const w = words.get(it.wk) || [Infinity, -Infinity]; words.set(it.wk, [Math.min(w[0], it.box[0]), Math.max(w[1], it.box[2])]); }
  const width = [...words.values()].reduce((a, [x0, x1]) => a + (x1 - x0), 0);
  const tempo = glyphs.reduce((a, it) => a + (it.tempo || 1), 0) / Math.max(1, glyphs.length);
  // (the writes that start a word carry its haste; a piece that only continues a word carries none)
  const hastes = res.doc.log.filter((e) => e.t === 'write' && e.haste).map((e) => e.haste);
  return { lean: lean / Math.max(1, n), width, tempo, hastes };
}

// ---------- replays, nothing moves, a word keeps its haste ----------
{
  // a burst in the middle of steady typing: some words hasty, some not, one session per hand
  for (const [seed, style] of [['quiet-heron-17', 'script'], ['maple-river-42', 'print'], ['tawny-atlas-52', 'adult-fr-2023']]) {
    const T = E.newTypist();
    { let t = 0; E.typistKey(T, t); for (let i = 0; i < 120; i++) E.typistKey(T, (t += 250)); } // the typist's usual pace
    const res = session(seed, style, 'Steady words at first, ', 250, { salt: 'mix', typist: T });
    // then a burst, then slow, careful words, on the same sheet (keys continue from the same typist)
    let view = E.newView(), hastes = [], clock = T.last + 50, lastKey = clock;
    const st = res.st;
    const go = (r) => { hastes = E.hasteCarry(st, r.events, view.tail, hastes, r.view.tail, E.typistHaste(T)); view = r.view; E.apply(st, r.events); };
    for (const [text, gap] of [['then a quick excited rush of words ', 45], ['and then slowly, carefully, the end.', 520]]) {
      for (const ch of text) {
        E.typistKey(T, clock, true);
        go(E.plan(st, view, { at: E.viewText(st, view).length, del: 0, ins: ch, kind: 'type' }));
        lastKey = clock;
        for (let t = 0; t < gap; t += 130) { clock += Math.min(130, gap - t); go(E.penStep(st, view, { dt: Math.min(130, gap - t), idle: clock - lastKey })); }
      }
    }
    go(E.penStep(st, view, { final: true }));
    const hs = res.doc.log.filter((e) => e.t === 'write' && e.haste != null).map((e) => e.haste);
    const live = E.renderSVG(res.p, st.page, SVG);
    const again = E.replay(E.makeHand(seed, style), E.decodeDoc(E.encodeDoc(res.doc)), OPTS);
    const same = E.renderSVG(res.p, again.page, SVG) === live;
    if (!same) fail(`${seed}/${style}: the replay differs from the live page`);
    if (res.moved) fail(`${seed}/${style}: ${res.moved} moved after it was written`);
    if (!hs.some((h) => h > 0) || !hs.some((h) => h < 0)) fail(`${seed}/${style}: a burst and a slow end should give hasty and careful words, got ${JSON.stringify(hs)}`);
    if (same && !res.moved) ok(`${seed}/${style}: replays byte for byte, nothing moved; hastes ${hs.join(' ')} (text ${JSON.stringify(E.logicalText(st).slice(-24))})`);
  }
  // a word continued in a later piece keeps the haste it started with: "hel" (hasty) + "lo world" (careful)
  const p = E.makeHand('maple-river-42', 'print');
  const st = E.replay(p, E.newInkDoc({ seed: 'maple-river-42', style: 'print', salt: 'cont' }), OPTS);
  E.apply(st, [{ t: 'write', text: 'hel', rest: 'lo', haste: 2 }, { t: 'write', text: 'lo world', haste: -2 }]);
  const tempos = st.page.items.filter((it) => it.kind === 'glyph').map((it) => it.ch + ':' + it.tempo.toFixed(3));
  const word = (w) => [...new Set(tempos.filter((_, i) => (w === 'hello' ? i < 5 : i >= 5)).map((x) => x.split(':')[1]))];
  if (word('hello').length !== 1 || word('world').length !== 1 || word('hello')[0] === word('world')[0]) fail('a continued word should keep its own haste: ' + tempos.join(' '));
  else ok('a word continued in a later piece keeps the haste it started with');
}

// ---------- fast is hastier than slow, and never extreme ----------
{
  const SENTENCE = 'I can hardly believe it, we are going to the sea on Sunday and I want you to come with us.';
  for (const [seed, style] of [['quiet-heron-17', 'script'], ['maple-river-42', 'print'], ['brisk-parcel-92', 'quebec-print'], ['amber-comet-63', 'palmer'], ['tawny-atlas-52', 'adult-fr-2023']]) {
    const fast = session(seed, style, SENTENCE, 40, { salt: 'same' });
    const slow = session(seed, style, SENTENCE, 400, { salt: 'same' });
    const f = measure(fast), s = measure(slow);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const where = `${seed}/${style}`;
    const line = `lean ${s.lean.toFixed(1)}° → ${f.lean.toFixed(1)}°, width ${(f.width / s.width * 100 - 100).toFixed(1)}% wider, pen ${(f.tempo / s.tempo * 100 - 100).toFixed(0)}% quicker; hastes slow ${mean(s.hastes).toFixed(1)}, fast ${mean(f.hastes).toFixed(1)}`;
    const bad = [];
    if (f.hastes.length < 8 || s.hastes.length < 8 || !f.hastes.every((h) => h > 0) || !s.hastes.every((h) => h < 0)) bad.push('the hastes');
    if (!(f.lean > s.lean + 0.5)) bad.push('the lean');
    if (!(f.width > s.width)) bad.push('the width');
    if (!(f.tempo > s.tempo)) bad.push('the pen');
    // never extreme: the same writer, in a different mood
    if (f.width / s.width > 1.2 || f.lean - s.lean > 6) bad.push('too far apart');
    if (bad.length) fail(`${where}: fast should read hastier than slow (${bad.join(', ')}): ${line}`);
    else ok(`${where}: ${line}`);
    if (out) {
      fs.writeFileSync(`${out}/tempo-${seed}-fast.svg`, E.renderSVG(fast.p, fast.st.page, SVG));
      fs.writeFileSync(`${out}/tempo-${seed}-slow.svg`, E.renderSVG(slow.p, slow.st.page, SVG));
    }
  }
}

console.log(`\n${fails.length ? `FAIL: ${fails.length} problems` : 'PASS'}`);
process.exit(fails.length ? 1 : 0);
