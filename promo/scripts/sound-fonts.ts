// sound-fonts.ts: the fonts video's sound, from its own timing (src/scene/fontlist-plan.ts), the same kit as the
// launch video's (sound.ts): the nib as the first row writes itself in, a soft tap as each row passes (they run together into a rattle at speed, softening as
// they crowd), air rising with the speed, a low press on the stop, a breath as the camera pulls back, a click on the
// tester's clear button, a key for each letter typed. Writes public/sound-fonts.wav.
//   node scripts/node-ts.mjs scripts/sound-fonts.ts
import fs from 'node:fs';
import path from 'node:path';
import { ROW, SECONDS, STOP_ROW, T, TYPED, rowsAt, rowsPerSecond } from '../src/scene/fontlist-plan';

const RATE = 48000;
const out = process.argv[2] || path.join(process.cwd(), 'public/sound-fonts.wav');
const N = Math.ceil((SECONDS + 0.3) * RATE);
const buf = new Float32Array(N);
let seed = 0x5eed11;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const noise = () => rnd() * 2 - 1;
function biquad(x: Float32Array, type: 'bp' | 'lp' | 'hp', f: number, q: number) {
  const w = (2 * Math.PI * f) / RATE, c = Math.cos(w), a = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; } else { b0 = a; b1 = 0; b2 = -a; }
  const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
const mixAt = (t: number, x: Float32Array, gain = 1) => { const i0 = Math.round(t * RATE); for (let i = 0; i < x.length; i++) { const j = i0 + i; if (j >= 0 && j < N) buf[j] += x[i] * gain; } };
/** a nib (or a key) tapped: a short bright click and a little body */
function tap(gain: number, bright = 2600, body = 150, decay = 0.0035) {
  const len = Math.round(0.05 * RATE), x = new Float32Array(len);
  for (let i = 0; i < len; i++) x[i] = noise() * Math.exp(-i / (decay * RATE));
  biquad(x, 'bp', bright * (0.9 + 0.2 * rnd()), 1.1);
  const f0 = body * (0.85 + 0.3 * rnd());
  for (let i = 0; i < len; i++) x[i] = (x[i] * 2.2 + Math.sin((2 * Math.PI * f0 * i) / RATE) * Math.exp(-i / (0.012 * RATE)) * 0.35) * gain;
  return x;
}
function press(gain: number) {
  const len = Math.round(0.35 * RATE), x = new Float32Array(len);
  for (let i = 0; i < len; i++) { const t = i / RATE; x[i] = Math.sin(2 * Math.PI * (82 - 30 * t) * t) * Math.exp(-t / 0.07) * 0.9 + noise() * Math.exp(-t / 0.006) * 0.5; }
  biquad(x, 'lp', 2200, 0.7);
  for (let i = 0; i < len; i++) x[i] *= gain;
  return x;
}
function air(t0: number, t1: number, shape: (t: number) => { gain: number; cut: number }) {
  const len = Math.max(1, Math.round((t1 - t0) * RATE)), x = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) { const w = noise(); b0 = 0.997 * b0 + 0.029 * w; b1 = 0.985 * b1 + 0.032 * w; b2 = 0.95 * b2 + 0.048 * w; x[i] = b0 + b1 + b2 + 0.02 * w; }
  let y1 = 0;
  for (let s = 0; s < len; s += 512) {
    const { gain, cut } = shape(t0 + s / RATE);
    const k = 1 - Math.exp((-2 * Math.PI * cut) / RATE);
    for (let i = s; i < Math.min(len, s + 512); i++) { y1 += k * (x[i] - y1); x[i] = y1 * gain; }
  }
  mixAt(t0, x);
}

// the first row writing itself in: the nib along the line, in short strokes (a letter's worth each), easing off as
// the write-in settles
{
  const [a, b] = T.write;
  const strokes = 26;
  for (let k = 0; k < strokes; k++) {
    const u = k / strokes, t0 = a + (b - a) * (1 - Math.pow(1 - u, 1.6));
    const dur = 0.035 + 0.03 * rnd();
    const len = Math.round(dur * RATE), x = new Float32Array(len);
    for (let i = 0; i < len; i++) x[i] = noise();
    biquad(x, 'bp', 4200 + 1200 * rnd(), 0.8);
    for (let i = 0; i < len; i++) x[i] *= Math.min(1, i / (0.002 * RATE), (len - i) / (0.004 * RATE)) * 0.3 * (1 - 0.5 * u);
    mixAt(t0, x);
  }
}
// rows passing: a tap each time a row's edge crosses the top of the list
let last = 0;
const dt = 1 / 2000;
for (let t = T.scroll[0]; t <= T.scroll[1] + 0.01; t += dt) {
  const r = Math.floor(rowsAt(t) + 1e-6);
  if (r > last && r <= STOP_ROW) {
    for (let k = last + 1; k <= r; k++) {
      const rate = Math.max(1, rowsPerSecond(t));
      mixAt(t, tap(0.5 * Math.min(1, 1.3 / Math.sqrt(rate / 2)), 2200 + Math.min(1800, rate * 25)));
    }
    last = r;
  }
}
// air with the speed, a press on the stop
const peak = rowsPerSecond(T.peak);
air(T.scroll[0], T.scroll[1] + 0.2, (t) => { const u = Math.min(1, rowsPerSecond(t) / peak); return { gain: 0.32 * u * u, cut: 300 + 6000 * u * u }; });
mixAt(T.scroll[1], press(0.32));
// the pull back: a soft breath
air(T.pull[0], T.pull[1], (t) => { const u = (t - T.pull[0]) / (T.pull[1] - T.pull[0]); const e = Math.sin(Math.PI * u); return { gain: 0.12 * e, cut: 500 + 1500 * e }; });
// the click on the clear button, then a key for each letter (spaces a little lower)
mixAt(T.click, tap(0.55, 3800, 220, 0.0022));
for (let i = 0; i < TYPED.length; i++) {
  const t = T.type[0] + (i / TYPED.length) * (T.type[1] - T.type[0]) - 0.01;
  const space = TYPED[i] === ' ';
  mixAt(t, tap(space ? 0.3 : 0.36, space ? 1800 : 3200 + 400 * rnd(), space ? 120 : 190, 0.0028));
}

let peakAmp = 0;
for (let i = 0; i < N; i++) { buf[i] = Math.tanh(buf[i] * 1.2); peakAmp = Math.max(peakAmp, Math.abs(buf[i])); }
const norm = peakAmp > 0 ? 0.89 / peakAmp : 1;
const pcm = Buffer.alloc(44 + N * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(RATE, 24);
pcm.writeUInt32LE(RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * norm)) * 32767), 44 + i * 2);
fs.writeFileSync(out, pcm);
console.log('wrote', out, (N / RATE).toFixed(2), 's;', STOP_ROW, 'rows;', ROW, 'px rows');
