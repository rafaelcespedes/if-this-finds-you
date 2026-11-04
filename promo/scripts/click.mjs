// click.mjs: a placeholder click track to judge the timing (a short tick on every beat, a higher one on each bar's
// first beat; bars count from the first cut, after the title's two-beat lead-in). Writes public/click-<bpm>.wav.
//   node scripts/click.mjs [bpm=112.5] [seconds=40] [lead-in beats=2]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const bpm = Number(process.argv[2] || 112.5), secs = Number(process.argv[3] || 40), lead = Number(process.argv[4] ?? 2), rate = 48000;
const n = Math.round(secs * rate), data = new Int16Array(n);
const beat = 60 / bpm;
for (let b = 0; b * beat < secs; b++) {
  const t0 = Math.round(b * beat * rate), down = (((b - lead) % 4) + 4) % 4 === 0, f = down ? 1760 : 1175, len = Math.round(0.035 * rate);
  for (let i = 0; i < len && t0 + i < n; i++) {
    const env = Math.exp(-i / (0.008 * rate));
    data[t0 + i] = Math.round(Math.sin((2 * Math.PI * f * i) / rate) * env * (down ? 0.8 : 0.5) * 32767);
  }
}
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
Buffer.from(data.buffer).copy(buf, 44);
fs.writeFileSync(path.join(here, `../public/click-${bpm}.wav`), buf);
console.log('wrote', `public/click-${bpm}.wav`, secs, 's at', bpm, 'bpm');
