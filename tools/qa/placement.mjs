// Ink mode: frozen placements. Usage: node tools/qa/placement.mjs [--root=<checkout>]
// - text committed in pieces (word by word, and split mid-word) lands where one pass would put it
// - a draft (thought letters) from the pen sits exactly where its commit lands
// - nothing already written moves when more is written
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E = await import(pathToFileURL(path.join(root, 'engine/index.js')).href);
const TEXT = 'Dear Ada,\nI have been meaning to write to you for weeks, but the days keep folding into each other. Supercalifragilisticexpialidocious, little kittens!';
const sig = (it) => [it.key, it.ch, it.x.toFixed(3), it.y.toFixed(3), it.rot].join(';');
let bad = 0;
for (const style of E.styleNames()) for (const ruled of [false, true]) {
  const p = E.withOverrides(E.makeHand('quiet-heron-17', style), {});
  const opts = { maxWidth: 7000, firstBaseline: 1100, ruled, lineHeight: ruled ? 1300 : undefined, salt: 'qa' };
  const one = E.inkPage(p, opts); one.write(TEXT);
  const whole = one.items.map(sig);
  // word by word, each previewed as a draft first
  const wb = E.inkPage(p, opts); let draftOk = true, frozenOk = true;
  const pieces = TEXT.match(/[^ \n]+[ \n]*/g);
  for (const w of pieces) {
    const before = wb.items.map(sig).join('\n');
    const d = wb.draft(w).items.map(sig).join('\n');
    const c = wb.write(w).items.map(sig).join('\n');
    if (d !== c) draftOk = false;
    if (wb.items.slice(0, before ? before.split('\n').length : 0).map(sig).join('\n') !== before) frozenOk = false;
  }
  const byWord = wb.items.map(sig);
  // letter by letter (mid-word splits), on a line that doesn't wrap: a first piece can't know whether
  // the whole word would have wrapped, so only unwrapped text must match exactly
  const LINE = 'Dear Ada, little kittens!';
  const o1 = E.inkPage(p, Object.assign({}, opts, { maxWidth: 40000 })); o1.write(LINE);
  const lb = E.inkPage(p, Object.assign({}, opts, { maxWidth: 40000 }));
  // (each letter written with what comes next: some hands shape a letter by the one after it)
  for (let i = 0; i < LINE.length; i++) lb.write(LINE[i], { ahead: LINE.slice(i + 1) });
  const byLetter = lb.items.map(sig), wholeLine = o1.items.map(sig);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const r = [same(whole, byWord), same(wholeLine, byLetter), draftOk, frozenOk];
  if (r.includes(false)) bad++;
  console.log(`${style.padEnd(7)} ${ruled ? 'ruled' : 'plain'}  word-by-word = one pass: ${r[0]}  letter-by-letter = one pass: ${r[1]}  draft = commit: ${r[2]}  ink never moves: ${r[3]}`);
}
// a whole letter (blank lines, a closing block, the name, a P.S.) written word by word, each piece with
// what the writer is about to write (`ahead`), lands where one pass puts it; and its lines take their
// roles in the letter
const LETTER = 'Dear Mary,\n\nI write to you from the farm, where the wheat is nearly in and the evenings are long.\n\nThe new calf is strong. We named her after you.\n\nYour loving sister,\nAnne\n\nP.S. Do write soon.';
for (const style of E.styleNames().slice(0, 3)) for (const ruled of [false, true]) for (const complete of [false, true]) {
  const p = E.makeHand('quiet-heron-17', style);
  const opts = { maxWidth: 9000, firstBaseline: 1100, ruled, lineHeight: ruled ? 1300 : undefined, salt: 'qa', complete };
  const one = E.inkPage(p, opts); const pg = one.write(LETTER);
  const pieces = LETTER.match(/[^ \n]+[ \n]*|\n+/g);
  const wb = E.inkPage(p, opts);
  let at = 0;
  for (const w of pieces) { at += w.length; wb.write(w, { ahead: LETTER.slice(at) }); }
  const same = one.items.map(sig).join('\n') === wb.items.map(sig).join('\n');
  const roles = [...new Set(pg.lineInfo.map((l) => l.role))];
  const need = ['first', 'para', 'closing', 'signature', 'ps'];
  const ok = same && need.every((r) => roles.includes(r));
  if (!ok) bad++;
  console.log(`${style.padEnd(7)} ${ruled ? 'ruled' : 'plain'} letter${complete ? ' (complete)' : ''}: word by word with what's ahead = one pass: ${same}; roles ${need.filter((r) => !roles.includes(r)).length ? 'MISSING ' + need.filter((r) => !roles.includes(r)).join(', ') : 'all there'}`);
}
console.log(bad ? `${bad} problem(s)` : 'ink placements are frozen and identical however the text arrives');
process.exit(bad ? 1 : 0);
