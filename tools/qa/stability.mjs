// Edit stability: does editing one word leave the rest of the page's letters alone?
// Usage: node tools/qa/stability.mjs [--root=<checkout>]
// For a typo, an inserted word and a deleted word, counts the later words whose letters are unchanged
// (line pose removed) and the largest change among the rest. Also checks that layout(A + B) equals
// layout(A) continued with layout(B, { start: pageA.pen }).
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E = await import(pathToFileURL(path.join(root, 'engine/index.js')).href);

const TEXT = 'I have been meaning to write to you for weeks, but the days keep folding into each other and the garden takes whatever time is left. The tomatoes finally came in, far too many of them, so I have been giving bags away to anyone who stands still long enough.';
const EDITS = [['typo inside a word', TEXT.replace('meaning', 'meaming')], ['insert a word', TEXT.replace('meaning', 'very meaning')], ['delete a word', TEXT.replace('far too many', 'too many')]];
const W = 13000;
// letter shape without the line's pose (rotation and lean), in glyph units
function shape(it, lean) {
  const c = Math.cos(-it.rot), s = Math.sin(-it.rot), k = Math.tan((lean[it.line] || 0) * Math.PI / 180);
  return it.g.strokes.flatMap((st) => st.center.map((q) => { const x = c * q[0] - s * q[1], y = s * q[0] + c * q[1]; return [x - y * k, y]; }));
}
const byWord = (page) => {
  const m = new Map();
  for (const it of page.items) if (it.kind === 'glyph' && !it.synthetic) { if (!m.has(it.wkey)) m.set(it.wkey, []); m.get(it.wkey).push(it); }
  return m;
};
let bad = 0;
for (const style of E.styleNames()) {
  const p = E.makeHand('maple-river-42', style);
  const xh = p.xHeight * E.CAP;
  const A = E.layout(p, TEXT, { maxWidth: W });
  const leanA = Object.fromEntries(A.lineInfo.map((l) => [l.n, l.lean]));
  for (const [label, edited] of EDITS) {
    const B = E.layout(p, edited, { maxWidth: W });
    const leanB = Object.fromEntries(B.lineInfo.map((l) => [l.n, l.lean]));
    const wa = byWord(A), wb = byWord(B);
    let same = 0, moved = 0, worst = 0;
    const ka = [...wa.keys()], kb = [...wb.keys()];
    let first = 0;
    while (first < ka.length && ka[first] === kb[first]) first++; // where the edit is
    for (const key of ka.slice(first)) {
      const its = wa.get(key), o = wb.get(key);
      if (!o) continue; // the edited word itself
      const a = its.flatMap((it) => shape(it, leanA)), b = o.flatMap((it) => shape(it, leanB));
      let d = a.length === b.length ? 0 : Infinity;
      for (let i = 0; i < a.length && d < Infinity; i++) d = Math.max(d, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]));
      if (d < 0.05) same++; else { moved++; worst = Math.max(worst, d); }
    }
    const ok = worst / xh < 0.06;
    if (!ok) bad++;
    console.log(`${style.padEnd(7)} ${label.padEnd(19)} later words: ${same} identical, ${moved} nudged (largest ${(worst / xh * 100).toFixed(1)}% x-height)${ok ? '' : '  FAIL (> 6%)'}`);
  }
  const cut = TEXT.indexOf(' The tomatoes');
  const pos = (it) => [it.ch, it.x.toFixed(3), it.y.toFixed(3), it.g.contours.length].join(';');
  const a = E.layout(p, TEXT.slice(0, cut), { maxWidth: W });
  const b = E.layout(p, TEXT.slice(cut), { maxWidth: W, start: a.pen });
  const same = [...a.items, ...b.items].map(pos).join('\n') === A.items.map(pos).join('\n');
  if (!same) bad++;
  console.log(`${style.padEnd(7)} resume from page.pen     ${same ? 'identical to one pass' : 'DIFFERENT  FAIL'}`);
}
console.log(bad ? `${bad} problem(s)` : 'edits stay local; resuming matches one pass');
process.exit(bad ? 1 : 0);
