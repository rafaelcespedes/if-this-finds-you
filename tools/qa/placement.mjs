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
  // and on lines that wrap: with what comes next known, a word's first letters already know whether the
  // whole word fits (they go where one pass puts them, and where the thought letters showed them). (Not a
  // word longer than a whole line: split letter by letter, its hyphen may come a letter later.)
  const WRAP = 'Dear Ruth, the garden came up all at once this week and I wanted you to see it before the rain. The beans are tall, the peas are climbing, and the roses are back.';
  const ow = E.inkPage(p, opts); ow.write(WRAP);
  const lw = E.inkPage(p, opts);
  for (let i = 0; i < WRAP.length; i++) lw.write(WRAP[i], { ahead: WRAP.slice(i + 1) });
  const wrapSame = ow.items.map(sig).join('\n') === lw.items.map(sig).join('\n');
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const r = [same(whole, byWord), same(wholeLine, byLetter) && wrapSame, draftOk, frozenOk];
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
// a long letter on sheets of paper (opts.sheet): it carries on onto the next sheet, written word by word
// exactly as in one pass; no line goes past the last baseline, no sheet starts on an empty line, and a
// name never ends up on another sheet than its closing
{
  const para = 'I write to you from the farm, where the wheat is nearly in and the evenings are long and gold. Father is well and sends his love.';
  const LONG = 'Dear Mary,\n\n' + Array(7).fill(para).join('\n\n') + '\n\nYour loving sister,\nAnne\n\nP.S. Do write soon.';
  for (const style of E.styleNames().slice(0, 3)) for (const ruled of [false, true]) {
    const p = E.makeHand('quiet-heron-17', style);
    const xh = E.pageMetrics(p).xh, pitch = ruled ? 3.1 * xh : E.pageMetrics(p).pitch;
    const sheet = { first: 1.2 * pitch, last: 10 * pitch, ink: 10 * pitch + 550, height: 12 * pitch };
    const opts = { maxWidth: 34 * xh, ruled, lineHeight: ruled ? pitch : undefined, sheet, salt: 'qa', complete: true };
    const one = E.inkPage(p, opts); const pg = one.write(LONG);
    const wb = E.inkPage(p, opts); let at = 0;
    for (const w of LONG.match(/[^ \n]+[ \n]*|\n+/g)) { at += w.length; wb.write(w, { ahead: LONG.slice(at) }); }
    const same = one.items.map(sig).join('\n') === wb.items.map(sig).join('\n');
    const L = pg.lineInfo;
    const over = L.filter((ln) => !ln.blank && (ruled && ln.rule != null ? ln.rule : ln.y) - ln.sheet * sheet.height > sheet.last + 0.3 * pitch).length;
    const blankStart = L.filter((ln, i) => i && ln.blank && ln.sheet !== L[i - 1].sheet).length;
    const split = L.filter((ln, i) => i && ln.role === 'signature' && ln.sheet !== L[i - 1].sheet).length;
    const ok = same && pg.sheets > 2 && !over && !blankStart && !split;
    if (!ok) bad++;
    console.log(`${style.padEnd(7)} ${ruled ? 'ruled' : 'plain'} long letter on sheets: ${pg.sheets} sheets; word by word = one pass: ${same}; past the last line ${over}, sheets starting empty ${blankStart}, names split from the closing ${split}${ok ? '' : '  FAIL'}`);
  }
}
console.log(bad ? `${bad} problem(s)` : 'ink placements are frozen and identical however the text arrives');
process.exit(bad ? 1 : 0);
