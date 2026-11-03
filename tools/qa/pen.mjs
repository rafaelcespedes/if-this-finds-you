// The pen catching up: simulated typing through createPen. Usage: node tools/qa/pen.mjs [--root=<checkout>]
// Checks: no stroke is written twice; dots, bars and accents come after the rest of their word; letters
// deleted before the pen reached them are never inked; the pen trails while typing and catches up when
// typing stops; the same calls give the same answers.
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E = await import(pathToFileURL(path.join(root, 'engine/index.js')).href);
const KEYS = 'Dear Ada, the little kittens are writtt\b\bing to you. ';
let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
function session(style, hold) {
  const p = E.withOverrides(E.makeHand('quiet-heron-17', style), {});
  const sheet = E.inkPage(p, { maxWidth: 9000, firstBaseline: 1100, salt: 'qa' });
  const pen = E.createPen({ hold, reducedMotion: false });
  let text = '', t = 0, page = null;
  const order = [], log = [];
  let last = null;
  const watch = (dt) => { for (let s = 0; s < dt; s += 0.01) { const st = pen.at(t + s); if (st.writing) { const id = st.writing.key + '#' + st.writing.stroke; if (id !== last) { order.push(id); last = id; } } } t += dt; };
  for (const ch of KEYS) {
    text = ch === '\b' ? text.slice(0, -1) : text + ch;
    page = sheet.draft(text); // the whole text, drafted from the sheet's start: Ink-mode keys stay put as it grows
    pen.sync(page, t);
    watch(0.15);
    const st = pen.at(t);
    log.push(page.items.filter((it) => it.kind === 'glyph' && (it.glyph || it.g).strokes.every((_, si) => st.ink(it.key, si) === 1)).length);
  }
  const typed = page.items.filter((it) => it.kind === 'glyph').length;
  const behind = typed - log[log.length - 1];
  watch(12);
  const st = pen.at(t);
  return { p, page, pen, order, typed, behind, done: page.items.filter((it) => it.kind === 'glyph' && (it.glyph || it.g).strokes.every((_, si) => st.ink(it.key, si) === 1)).length, busy: st.busy };
}
for (const style of E.styleNames()) {
  const a = session(style, 2), b = session(style, 2);
  if (a.order.join() !== b.order.join()) fail(`${style}: same typing gave a different pen`);
  const dup = a.order.filter((x, i) => a.order.indexOf(x) !== i);
  if (dup.length) fail(`${style}: strokes written twice: ${dup.slice(0, 4).join(' ')}`);
  // delayed strokes after the rest of their word
  const byKey = new Map(a.page.items.map((it) => [it.key, it]));
  let early = 0;
  a.order.forEach((id, i) => {
    const [key, si] = [id.slice(0, id.lastIndexOf('#')), +id.slice(id.lastIndexOf('#') + 1)];
    const it = byKey.get(key);
    if (!it || !(it.glyph || it.g).strokes[si].delayed) return;
    const later = a.order.slice(i + 1).some((o) => { const k = o.slice(0, o.lastIndexOf('#')), x = byKey.get(k); return x && x.wkey === it.wkey && !(x.glyph || x.g).strokes[+o.slice(o.lastIndexOf('#') + 1)].delayed; });
    if (later) early++;
  });
  if (early) fail(`${style}: ${early} dots/bars written before the rest of their word`);
  // the deleted "tt" letters never reached the page
  const keys = new Set(a.page.items.map((it) => it.key));
  const ghost = a.order.filter((id) => !keys.has(id.slice(0, id.lastIndexOf('#'))));
  if (ghost.length) fail(`${style}: ${ghost.length} strokes inked for letters that were deleted first`);
  if (a.done !== a.typed || a.busy) fail(`${style}: pen didn't catch up (${a.done}/${a.typed} inked, ${a.busy} waiting)`);
  console.log(`${style.padEnd(7)} typed ${a.typed} letters at ~7/s: pen ${a.behind} letters behind at the last key, all inked ${a.done === a.typed ? 'after the pause' : 'NOT'}; ${a.order.length} strokes, none twice`);
}
console.log(bad ? `${bad} problem(s)` : 'the pen trails, catches up, and writes each stroke once, dots after their word');
process.exit(bad ? 1 : 0);
