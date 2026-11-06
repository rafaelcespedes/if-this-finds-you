// take.ts: a take from the typing recorder (recorder/, "Typing take … .zip") turned into the video's data. The
// writing is replayed on the video's clock (src/ink-run.ts) exactly as the recorder wrote it (checked), and kept
// with everything else the take has: every key down and up (for the hands), the pointer, the sync beeps, and the
// webcam video.
//   npm run take -- "~/Downloads/Typing take 2026-11-06 at 14.32.zip"
// Writes src/data/take-session.json (the ink-session format, plus `take`) and public/take/face.mp4 (or .webm).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InkRun, type Act } from '../src/ink-run';
import { HAND, PAPER, MEASURE, SALT, PEN_SPEED } from '../src/setup';

/* eslint-disable @typescript-eslint/no-explicit-any */
const arg = process.argv[2];
if (!arg) { console.error('Which take? npm run take -- "path/to/Typing take ….zip"'); process.exit(1); }
const file = path.resolve(arg.replace(/^~(?=\/)/, os.homedir()));

/** the files in a zip (stored, as the recorder writes it) */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip file');
  const n = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('a broken zip file');
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    if (method !== 0) throw new Error(`${name} is compressed: unzip the take with Finder and pass its take.json`);
    const lName = buf.readUInt16LE(local + 26), lExtra = buf.readUInt16LE(local + 28);
    out.set(name, buf.subarray(local + 30 + lName + lExtra, local + 30 + lName + lExtra + size));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const files = file.endsWith('.json')
  ? new Map(fs.readdirSync(path.dirname(file)).map((n) => [n, fs.readFileSync(path.join(path.dirname(file), n))] as [string, Buffer]))
  : unzip(fs.readFileSync(file));
const take = JSON.parse(files.get(file.endsWith('.json') ? path.basename(file) : 'take.json')!.toString('utf8'));

// the take was written with the video's settings of that day: say so if they've changed since
const now = { hand: HAND, paper: PAPER, measure: MEASURE, salt: SALT, penSpeed: PEN_SPEED };
for (const k of Object.keys(now) as (keyof typeof now)[]) {
  if (JSON.stringify(now[k]) !== JSON.stringify(take.settings[k])) console.warn(`! ${k} has changed since the take (src/setup.ts): the writing will differ from what the recorder showed`);
}

const run = new InkRun(take.settings.salt);
run.replay(take.acts as Act[], take.end);
const out = run.result(take.end);
const hash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
const same = out.text === take.check.text && out.events.length === take.check.events && hash(JSON.stringify(out.events)) === take.check.hash;
console.log(same ? 'The writing replays exactly as the recorder wrote it.' : '! The writing replays differently from the recorder.');
if (!same) console.log('  recorder:', JSON.stringify(take.check.text), take.check.events, 'events\n  replay:  ', JSON.stringify(out.text), out.events.length, 'events');

fs.mkdirSync('public/take', { recursive: true });
let face: string | null = null;
if (take.camera?.file && files.has(take.camera.file)) {
  face = `take/${take.camera.file}`;
  fs.writeFileSync(path.join('public', face), files.get(take.camera.file)!);
}
const session = { ...out, take: { made: take.made, go: take.go, end: take.end, beeps: take.beeps, keys: take.keys, pointer: take.pointer, camera: take.camera && { ...take.camera, file: face }, keyboardLayout: take.keyboardLayout, sheetMm: take.sheetMm } };
fs.writeFileSync('src/data/take-session.json', JSON.stringify(session));
const downs = (take.keys as any[]).filter((k) => k.e === 'd' && !k.r).length;
console.log(`${take.end.toFixed(1)} s · ${take.acts.length} things done · ${downs} key presses · ${take.pointer.length} pointer moves · camera: ${face ?? 'none'}`);
console.log('text:', JSON.stringify(out.text));
console.log('wrote src/data/take-session.json');
