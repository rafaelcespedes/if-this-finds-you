// sound.ts: the video's sound, made from the handwriting itself (no music, no samples). Bundled and run by
// scripts/sound.mjs; writes public/sound.wav, which the composition plays from the first frame.
//
// Everything is placed from the same clock the pictures use (src/scene/timeline.ts) and the same pen timeline that
// writes the letter (the engine's timeline() of the letter's layout), so it is in sync by construction:
//   - the flip: every cut is a pen tapped on paper; as the cuts speed up the taps run together into a rattle
//   - the stop: one low, dry press, like a stamp, then silence
//   - the canvas: a breath of air that swells as the camera pulls back, silence on the still beat, a rush on the dive
//   - the letter: the nib scratching along each stroke, louder where the pen moves faster; a small tap each time the
//     marked letters change form
//   - the end card: the title scratched out again, then silence
import fs from 'node:fs';
import path from 'node:path';
import { plan, DEFAULTS } from '../src/scene/timeline';
import { handList } from '../src/scene/hands';
import { letterModel } from '../src/scene/letter';
import { geometry, phrase } from '../src/scene/phrase';
import { BRAND } from '../src/scene/hands';
import { engine, FLIP_INK } from '../src/scene/ink';

const RATE = 48000;
const out = process.argv[2] || path.join(process.cwd(), 'public/sound.wav');
const letterId = process.argv[3] || 'santa-1908-papa';
const landingSeed = process.argv[4] || 'lunar-willow-41';
const landingStyle = process.argv[5] || 'quebec-print';

const P = plan({ ...DEFAULTS, fps: 30 });
const fps = P.s.fps;
const T = (frame: number) => frame / fps;
const beat = 60 / P.s.bpm;
const N = Math.ceil((P.seconds + 0.5) * RATE);
const buf = new Float32Array(N);

// ---------- tools ----------
let seed = 0x2f6b1c3;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const noise = () => rnd() * 2 - 1;

/** RBJ biquad, run over a buffer in place */
function biquad(x: Float32Array, type: 'bp' | 'lp' | 'hp', f: number, q: number) {
  const w = (2 * Math.PI * f) / RATE, c = Math.cos(w), a = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = a; b1 = 0; b2 = -a; }
  const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
const mixAt = (t: number, x: Float32Array, gain = 1) => {
  const i0 = Math.round(t * RATE);
  for (let i = 0; i < x.length; i++) { const j = i0 + i; if (j >= 0 && j < N) buf[j] += x[i] * gain; }
};

/** a nib tapped on paper: a short bright click and a little body from the desk */
function tap(gain: number, bright = 2600) {
  const len = Math.round(0.05 * RATE), x = new Float32Array(len);
  for (let i = 0; i < len; i++) x[i] = noise() * Math.exp(-i / (0.0035 * RATE));
  biquad(x, 'bp', bright * (0.9 + 0.2 * rnd()), 1.1);
  const body = new Float32Array(len);
  const f0 = 150 + 40 * rnd();
  for (let i = 0; i < len; i++) body[i] = Math.sin((2 * Math.PI * f0 * i) / RATE) * Math.exp(-i / (0.012 * RATE)) * 0.35;
  for (let i = 0; i < len; i++) x[i] = (x[i] * 2.2 + body[i]) * gain;
  return x;
}

/** the stop: a low, dry press, like a stamp coming down */
function press(gain: number) {
  const len = Math.round(0.35 * RATE), x = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    x[i] = Math.sin(2 * Math.PI * (82 - 30 * t) * t) * Math.exp(-t / 0.07) * 0.9 + noise() * Math.exp(-t / 0.006) * 0.5;
  }
  biquad(x, 'lp', 2200, 0.7);
  for (let i = 0; i < len; i++) x[i] *= gain;
  return x;
}

/** air: noise shaped over [t0, t1] by a gain curve and a moving lowpass (applied in short blocks) */
function air(t0: number, t1: number, shape: (u: number) => { gain: number; cut: number }) {
  const len = Math.max(1, Math.round((t1 - t0) * RATE)), x = new Float32Array(len);
  // pink-ish noise
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) { const w = noise(); b0 = 0.997 * b0 + 0.029 * w; b1 = 0.985 * b1 + 0.032 * w; b2 = 0.95 * b2 + 0.048 * w; x[i] = b0 + b1 + b2 + 0.02 * w; }
  const block = 512;
  let y1 = 0;
  for (let s = 0; s < len; s += block) {
    const { gain, cut } = shape(s / len);
    const k = 1 - Math.exp((-2 * Math.PI * cut) / RATE);
    for (let i = s; i < Math.min(len, s + block); i++) { y1 += k * (x[i] - y1); x[i] = y1 * gain; }
  }
  mixAt(t0, x);
}

/** the nib along one stroke: friction noise whose loudness follows the pen's speed (arclength per time) */
function scratch(t0: number, dur: number, tn: number[], sn: number[], gain: number) {
  const len = Math.max(8, Math.round(dur * RATE)), x = new Float32Array(len);
  for (let i = 0; i < len; i++) x[i] = noise();
  const hi = biquad(Float32Array.from(x), 'bp', 4200 + 1200 * rnd(), 0.8);
  const lo = biquad(x, 'bp', 900, 1.2);
  // speed from the stroke's own time/arclength tables
  const speedAt = (u: number) => {
    if (!tn || tn.length < 2) return 1;
    let k = 1; while (k < tn.length - 1 && tn[k] < u) k++;
    const dt = tn[k] - tn[k - 1] || 1e-3;
    return (sn[k] - sn[k - 1]) / dt;
  };
  const y = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const edge = Math.min(1, i / (0.002 * RATE), (len - i) / (0.003 * RATE));
    const v = Math.min(2.5, Math.max(0.15, speedAt(u)));
    y[i] = (hi[i] * 1.6 + lo[i] * 0.5) * edge * (0.35 + 0.65 * v / 2.5) * gain;
  }
  mixAt(t0, y);
  mixAt(t0, tap(gain * 0.25, 3400)); // the nib touching down
}

// ---------- 1–2. the flip: a tap on every cut; a press on the stop ----------
const flip = P.sections.find((s) => s.id === 'flip')!;
const land = P.sections.find((s) => s.id === 'land')!;
for (const c of P.cuts) {
  if (c.frame < flip.from || c.frame >= land.from) continue;
  // the taps soften as they crowd together, so the rattle at full speed is no louder than the slow beats
  const rate = fps / Math.max(1, c.gap);                  // taps a second
  const gain = 0.55 * Math.min(1, 1.2 / Math.sqrt(rate / 1.875));
  mixAt(T(c.frame), tap(gain, 2400 + Math.min(1800, rate * 50)));
}
mixAt(T(land.from), press(0.9));

// ---------- 3. the canvas: air swelling out, silence on the still beat, a rush on the dive ----------
const Z = P.zoom;
air(T(Z.from), T(Z.out), (u) => ({ gain: 0.3 * u * u, cut: 250 + 2600 * u * u }));
air(T(Z.hold), T(Z.to), (u) => ({ gain: 0.42 * u ** 1.5, cut: 400 + 7000 * u ** 2 }));

// ---------- 4. the letter: the nib along every stroke; a tap each time the marked letters change ----------
const hands = handList(P.handsNeeded, { seed: landingSeed, style: landingStyle });
const landing = hands[P.landHand];
const m = letterModel(letterId, landing);
const L = P.letter;
const writeSecs = (L.writeTo - L.from) / fps;
const speed = m.tl.duration / Math.max(0.1, writeSecs * 0.9);
for (const e of m.tl.events) {
  scratch(T(L.from) + e.t0 / speed, e.dur / speed, e.tn, e.sn, 0.32);
}
for (const span of L.spans) {
  span.swaps.forEach((f, i) => mixAt(T(f), tap(i === 0 ? 0.42 : 0.24, i === 0 ? 2000 : 3000)));
}

// ---------- 5. the end card: the title scratched out again ----------
const end = P.sections.find((s) => s.id === 'end')!;
{
  const [gr] = phrase([BRAND], geometry(1080), FLIP_INK);
  const items = gr.items.map((it: any, i: number) => ({ ...it, __i: i }));
  const tl = engine.timeline({ items, seed: 'end', xh: gr.p.xHeight * 700 }, { lead: 0 });
  const writeFrames = 1.5 * P.fpb;
  const k = (writeFrames / fps) / tl.duration;
  for (const e of tl.events) scratch(T(end.from) + e.t0 * k, e.dur * k, e.tn, e.sn, 0.3);
}

// ---------- master: a gentle limiter, then 16-bit WAV ----------
let peak = 0;
for (let i = 0; i < N; i++) { buf[i] = Math.tanh(buf[i] * 1.2); peak = Math.max(peak, Math.abs(buf[i])); }
const norm = peak > 0 ? 0.89 / peak : 1;
const pcm = Buffer.alloc(44 + N * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(RATE, 24);
pcm.writeUInt32LE(RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * norm)) * 32767), 44 + i * 2);
fs.writeFileSync(out, pcm);
console.log('wrote', out, (N / RATE).toFixed(2), 's;', m.tl.events.length, 'letter strokes;', P.cuts.length, 'cuts; beat', beat.toFixed(3), 's');
