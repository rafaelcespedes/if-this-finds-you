// Editor geometry checks: every offset has a caret, clicks land where the caret is, selections cover
// what they should. Usage: node tools/qa/editing.mjs [--root=<checkout>]
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E = await import(pathToFileURL(path.join(root, 'engine/index.js')).href);
const TEXTS = [
  'Dear Ada,\n\n  I have been meaning to write to you for weeks, but the days keep folding into each other.  \nSee you at 7:30 — bring the old maps & a good pen!\n',
  'Supercalifragilisticexpialidocious and a flag 🇫🇷 and an emoji 👩‍👩‍👧 here.',
  '',
  '\n\n',
];
let bad = 0;
const fail = (m) => { bad++; if (bad < 12) console.log('  FAIL ' + m); };
for (const style of E.styleNames()) for (const seed of ['maple-river-42', 'quiet-heron-17']) for (const slant of [null, 25]) for (const ruled of [false, true]) {
  const p = E.withOverrides(E.makeHand(seed, style), slant == null ? {} : { slant });
  for (const text of TEXTS) {
    const opts = { maxWidth: 6000, ruled, lineHeight: ruled ? 1300 : undefined, firstBaseline: ruled ? 1100 : undefined };
    const page = E.layout(p, text, opts);
    const geo = E.geometry(p, page);
    const T = page.text;
    // every grapheme boundary has a caret
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const bounds = new Set([0, T.length]);
    for (const s of seg.segment(T)) bounds.add(s.index);
    const have = new Set(geo.stops.map((s) => s.o));
    for (const o of bounds) if (!have.has(o)) fail(`${style} ${seed} ${JSON.stringify(text).slice(0, 20)}: no caret stop at ${o}`);
    for (const s of geo.stops) if (!bounds.has(s.o)) fail(`${style}: stop at ${s.o} is inside a grapheme`);
    // clicking along a caret (foot, middle, near the top) lands on that caret's offset
    let miss = 0, n = 0;
    for (const s of geo.stops) {
      const c = geo.caretAt(s.o, s.aff || 'after');
      for (const f of [0.1, 0.5, 0.85]) {
        const x = c.bottom[0] + (c.top[0] - c.bottom[0]) * f, y = c.bottom[1] + (c.top[1] - c.bottom[1]) * f;
        const h = geo.hitTest(x, y);
        n++;
        if (h.offset !== s.o) { const alt = geo.stops.filter((t) => t.line === s.line && Math.abs(t.x - s.x) < 1); if (!alt.some((t) => t.o === h.offset)) miss++; }
      }
    }
    if (miss) fail(`${style} ${seed} slant ${slant} ${ruled ? 'ruled' : 'plain'} ${JSON.stringify(text).slice(0, 20)}: ${miss}/${n} clicks on a caret landed elsewhere`);
    // a click on the tip of any letter (ascenders and descenders included) stays on that letter's line
    let wrongLine = 0;
    for (const it of page.items) {
      if (it.synthetic) continue;
      for (const [x, y] of [[(it.box[0] + it.box[2]) / 2, it.box[1] + 0.05 * (it.box[3] - it.box[1])], [(it.box[0] + it.box[2]) / 2, it.box[3] - 0.05 * (it.box[3] - it.box[1])]]) {
        if (geo.hitTest(x, y).line !== it.line) wrongLine++;
      }
    }
    if (wrongLine > page.items.length * 2 * 0.02) fail(`${style} ${seed} slant ${slant} ${ruled ? 'ruled' : 'plain'}: ${wrongLine}/${page.items.length * 2} clicks on letter tips went to another line`);
    // a full selection covers every written line with letters
    if (T.trim()) {
      const sel = geo.selection(0, T.length);
      const lettered = new Set(page.items.map((it) => it.line));
      for (const l of lettered) if (!sel.some((r) => r.line === l)) fail(`${style}: select-all misses line ${l}`);
    }
  }
}
console.log(bad ? `${bad} problem(s)` : 'carets at every boundary; clicks land on the caret; selections cover every line');
process.exit(bad ? 1 : 0);
