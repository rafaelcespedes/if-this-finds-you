// Typing latency in the engine: what one keystroke costs on a long letter.
// Usage: node tools/qa/typing.mjs [--root=<checkout>] [--words=250]
// Lays out the letter once (warm), then times single-character edits: typing at the end, typing in the
// middle of the first paragraph, and deleting a character. Reports the engine's whole keystroke: layout,
// which word runs changed (runChanges), drawing only those (renderRun), and the caret geometry.
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const root = path.resolve(arg('root', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')));
const E = await import(pathToFileURL(path.join(root, 'engine/index.js')).href);
const WORDS = +arg('words', 250);
const SRC = 'I have been meaning to write to you for weeks, but the days keep folding into each other and the garden takes whatever time is left. The tomatoes finally came in, far too many of them, so I have been giving bags away to anyone who stands still long enough. Yesterday the postman took two. The old maps are still in the blue box under the stairs, and I think you should have them, since you were always the one who knew how to read them properly.';
const words = SRC.split(' ');
let text = 'Dear Ada,\n';
for (let i = 0; i < WORDS; i++) text += words[i % words.length] + (i % 60 === 59 ? '\n' : ' ');
text = text.trimEnd();
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const W = 720 / (58 / 1000);
for (const style of E.styleNames()) {
  const p = E.withOverrides(E.makeHand('quiet-heron-17', style), {});
  const t0 = performance.now(); let page = E.layout(p, text, { maxWidth: W }); const cold = performance.now() - t0;
  const run = (label, edit) => {
    const ts = [], all = []; let cur = text, runs = [], moved = [];
    for (let k = 0; k < 12; k++) {
      const next = edit(cur, k);
      const a = performance.now(); const pg = E.layout(p, next, { maxWidth: W }); const b = performance.now();
      ts.push(b - a);
      if (E.runChanges && E.renderRun) {
        const c = E.runChanges(page, pg);
        for (const r of c.add) E.renderRun(p, pg, r, { emPx: 58 });
        if (E.geometry) E.geometry(p, pg).caretAt(next.length);
        all.push(performance.now() - a);
        runs.push(c.add.length); moved.push(c.move.length);
      }
      page = pg; cur = next;
    }
    console.log(`${style.padEnd(7)} ${label.padEnd(24)} layout median ${med(ts).toFixed(1)} ms (max ${Math.max(...ts).toFixed(1)})` +
      (all.length ? ` · whole keystroke median ${med(all).toFixed(1)} ms (max ${Math.max(...all).toFixed(1)}) · words redrawn ${med(runs)}, moved ${med(moved)}` : ''));
  };
  console.log(`${style.padEnd(7)} ${WORDS} words, ${text.length} chars · cold layout ${cold.toFixed(0)} ms`);
  E.layout(p, text, { maxWidth: W }); page = E.layout(p, text, { maxWidth: W });
  run('type at the end', (s, k) => s + 'abcdefghijkl'[k]);
  const mid = text.indexOf('garden') + 3;
  run('type mid-paragraph', (s, k) => s.slice(0, mid + k) + 'x' + s.slice(mid + k));
  run('backspace mid-paragraph', (s) => s.slice(0, mid) + s.slice(mid + 1));
}
