// Prefix stability: appending text never moves or changes words that were already complete.
// Usage: node tools/qa/prefix.mjs [--root=<checkout>]
// For many cut points, layout(text.slice(0, cut)) vs layout(text): every item of a word that ended before
// the cut (a space or newline followed it) must be identical (key, position, angle, outline). Also checks
// that opts.salt gives different letters with the same layout rules.
// Each cut passes the rest as `ahead` (what the writer is about to write): a line's place in the letter (a
// closing drifts right, a P.S. stands apart) is decided as the line begins, from the whole line.
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E = await import(pathToFileURL(path.join(root, 'engine/index.js')).href);
const TEXT = 'Dear Ada,\nI have been meaning to write to you for weeks, but the days keep folding into each other. The tomatoes finally came in!  Supercalifragilisticexpialidocious, said the little kittens.\n\nWith love, always,\nMary\n\nP.S. The cat sends a paw.';
const sig = (it) => [it.key, it.ch, it.x.toFixed(4), it.y.toFixed(4), it.rot, it.g.contours[0] ? it.g.contours[0][0].map((v) => v.toFixed(3)).join(',') : ''].join(';');
let bad = 0;
for (const style of E.styleNames()) for (const mode of ['fair', 'ink']) for (const ruled of [false, true]) {
  const p = E.withOverrides(E.makeHand('quiet-heron-17', style), {});
  const opts = { maxWidth: 7000, firstBaseline: 1100, ruled, lineHeight: ruled ? 1300 : undefined, salt: 'letter-1' };
  if (mode === 'ink') opts.ink = { salt: 'letter-1' };
  const full = E.layout(p, TEXT, opts).items;
  let broken = 0, cuts = 0;
  for (let cut = 1; cut < TEXT.length; cut += 3) {
    const part = E.layout(p, TEXT.slice(0, cut), Object.assign({ ahead: TEXT.slice(cut) }, opts)).items;
    // the prefix's complete words: those whose last letter is followed by a space or newline inside the cut
    for (let i = 0; i < part.length; i++) {
      const it = part[i];
      const end = part.filter((o) => o.wkey === it.wkey).reduce((m, o) => Math.max(m, o.charIndex + o.ch.length), 0);
      if (end >= cut || !/[ \n]/.test(TEXT[end])) continue;
      const twin = full.find((o) => o.key === it.key && o.charIndex === it.charIndex);
      if (!twin || sig(twin) !== sig(it)) broken++;
    }
    cuts++;
  }
  if (broken) bad++;
  console.log(`${style.padEnd(7)} ${mode.padEnd(5)} ${ruled ? 'ruled' : 'plain'}  ${cuts} cut points: ${broken ? broken + ' complete-word letters moved  FAIL' : 'complete words never move'}`);
}
// salt: same hand, two letters, different instances
const p = E.makeHand('quiet-heron-17', 'print');
const a = E.layout(p, 'the garden', { maxWidth: 9000, firstBaseline: 1100, salt: 'one' }).items;
const b = E.layout(p, 'the garden', { maxWidth: 9000, firstBaseline: 1100, salt: 'two' }).items;
const differ = a.filter((it, i) => sig(it) !== sig(b[i])).length;
console.log(`salt: ${differ}/${a.length} letters differ between two letters by the same hand`);
if (differ < a.length * 0.8) bad++;
console.log(bad ? `${bad} problem(s)` : 'prefix-stable; salt gives each letter its own instances');
process.exit(bad ? 1 : 0);
