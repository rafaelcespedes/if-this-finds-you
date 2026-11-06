// take-pose.ts: Rafael's tracked hands (src/data/hand-3d.json, from scripts/hands-3d.py) as the ghost hands' motion,
// frame by frame on the take's clock: src/data/take-pose.json, in the format the video reads (as hand-pose.json).
//   npm run take:pose
//
// From above, what shows is where each hand is, which way it points, and where each fingertip is. So each frame:
// the hand's middle knuckle goes where his is and turns the way his does (its tilt kept to a resting hand's), and each
// finger is bent (rig.ts's joints) so its tip lands where his fingertip is, as low as a relaxed finger hangs. When he
// presses a key, the finger that pressed it (seen in the video) goes down on the key where he hit it, and the hand
// moves the last few millimetres if the finger can't reach. The ghost hands are scaled to his. Gaps where the phone
// lost a hand: short ones are bridged, long ones send the hand off the bottom of the picture and back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { parseGlb } from '../src/hands/glb';
import { DIGITS, anglesOf, contact, fk, rigOf, rigToWorld, type Digit, type Placement, type Rig, type Side } from '../src/hands/rig';
import { REST } from '../src/hands/home';
import { MAC_KEY } from '../src/macbook';

/* eslint-disable @typescript-eslint/no-explicit-any */
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const H3 = JSON.parse(fs.readFileSync(path.join(root, 'src/data/hand-3d.json'), 'utf8'));
const TAKE = JSON.parse(fs.readFileSync(path.join(root, 'src/data/take-session.json'), 'utf8')).take;
const FPS = 30;
const C = new THREE.Vector3(...(H3.camera.C as [number, number, number]));
const OFF = Math.round(H3.offset * FPS); // take frame = video frame + OFF
const N = Math.ceil((TAKE.end + 1) * FPS);
const TIP: Record<Digit, number> = { thumb: 4, 'index-finger': 8, 'middle-finger': 12, 'ring-finger': 16, 'pinky-finger': 20 };
const DIGIT_OF: Record<number, Digit> = { 4: 'thumb', 8: 'index-finger', 12: 'middle-finger', 16: 'ring-finger', 20: 'pinky-finger' };

const glb = (n: string) => { const b = fs.readFileSync(path.join(root, `public/hands/${n}.glb`)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const rigs: Record<Side, Rig> = { L: rigOf(parseGlb(glb('left'), 'L')), R: rigOf(parseGlb(glb('right'), 'R')) };

// ---------- where his points are ----------
/** the video's frames of a hand: its 21 points where their rays meet the key tops' plane */
const seen: Record<Side, (number[][] | null)[]> = { L: [], R: [] };
for (const s of ['L', 'R'] as const) seen[s] = (H3.frames as any[][]).map((f) => f.find((h) => h.side === s)?.p0 ?? null);
/** a point of the picture at height z (mm over the key tops), along its ray from the lens */
const atZ = (p0: number[], z: number) => new THREE.Vector3(C.x + (p0[0] - C.x) * (1 - z / C.z), C.y + (p0[1] - C.y) * (1 - z / C.z), z);

// ---------- the ghost hands, his size ----------
const pos = (rig: Rig, n: string) => new THREE.Vector3().setFromMatrixPosition(rig.rest.get(n)!).multiplyScalar(1000);
const scale = {} as Record<Side, number>;
for (const s of ['L', 'R'] as const) {
  const rig = rigs[s];
  const rigW = pos(rig, 'index-finger-phalanx-proximal').distanceTo(pos(rig, 'pinky-finger-phalanx-proximal'));
  const ws = seen[s].filter(Boolean).map((p) => atZ(p![5], REST[s].up).distanceTo(atZ(p![17], REST[s].up))).sort((a, b) => a - b);
  const k = Math.min(1.25, Math.max(0.9, ws[Math.floor(ws.length / 2)] / rigW));
  scale[s] = k;
  rig.units = 1000 * k;
  rig.pad = Object.fromEntries(Object.entries(rig.pad).map(([d, v]) => [d, v * k])) as Rig['pad'];
  rig.tipExtra = Object.fromEntries(Object.entries(rig.tipExtra).map(([d, v]) => [d, v * k])) as Rig['tipExtra'];
  console.log(`${s} hand: his knuckles ${ws[Math.floor(ws.length / 2)].toFixed(0)} mm across, the ghost's ${rigW.toFixed(0)}: scaled ${k.toFixed(2)}`);
}
const pressDepth = 1.4;

// ---------- the presses: which finger, where on the key ----------
interface Press { side: Side; digit: Digit; t0: number; t1: number; code: string; at: THREE.Vector3 }
const presses: Press[] = (H3.presses as any[]).filter((p) => p.miss < 10).map((p) => {
  const k = MAC_KEY.get(p.code)!;
  const m = 2.5;
  const x = Math.min(k.x + k.w / 2 - m, Math.max(k.x - k.w / 2 + m, p.at[0]));
  const y = Math.min(k.y + k.h / 2 - m, Math.max(k.y - k.h / 2 + m, p.at[1]));
  return { side: p.side, digit: DIGIT_OF[p.tip], t0: p.t0, t1: Math.max(p.t1, p.t0 + 0.06), code: p.code, at: new THREE.Vector3(x, y, -pressDepth) };
});
const smooth = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };
/** how much a press holds its finger on its key at t (0..1) */
const holdOf = (p: Press, t: number) => smooth((t - (p.t0 - 0.09)) / 0.09) * (1 - smooth((t - p.t1) / 0.08));

// ---------- a finger onto a point ----------
// (rig.ts's IK, with the height left loose: a fingertip seen from above can be anywhere along its ray, so it lands
// where his is across the keyboard and hangs as low as a relaxed finger does, never into the keys)
const RANGE: Record<'finger' | 'thumb', [number, number][]> = {
  finger: [[-0.45, 0.45], [-0.45, 1.45], [0, 1.85]],
  thumb: [[-1.2, 1.2], [-1.2, 1.2], [-0.3, 1.2]],
};
function costFn(rig: Rig, d: Digit, target: THREE.Vector3, world: THREE.Matrix4, wz: number) {
  const ms = (d === 'thumb' ? [0, 0, 0, 0] : [0, 0, 0, 0, 0]).map(() => new THREE.Matrix4());
  const c = new THREE.Vector3();
  const thumb = d === 'thumb';
  return (x: number, y: number, z: number) => {
    fk(rig, d, anglesOf(d, x, y, z), ms);
    contact(rig, d, ms, world, c);
    const dx = c.x - target.x, dy = c.y - target.y, dz = c.z - target.z;
    const under = Math.min(0, c.z + pressDepth + 0.2);
    return dx * dx + dy * dy + wz * dz * dz + 400 * under * under + 3 * x * x + (thumb ? 0 : 1.2 * (y - 0.35) * (y - 0.35));
  };
}
function ik(rig: Rig, d: Digit, target: THREE.Vector3, world: THREE.Matrix4, wz: number, start: [number, number, number] | null): [number, number, number] {
  const R = RANGE[d === 'thumb' ? 'thumb' : 'finger'];
  const cost = costFn(rig, d, target, world, wz);
  const clampR = (v: number, i: number) => Math.min(R[i][1], Math.max(R[i][0], v));
  let best: [number, number, number] = [0, 0.35, 0.6], bc = Infinity;
  let h: number[];
  if (!start) {
    const steps = [8, 10, 10];
    for (let i = 0; i <= steps[0]; i++) for (let j = 0; j <= steps[1]; j++) for (let k = 0; k <= steps[2]; k++) {
      const x = R[0][0] + ((R[0][1] - R[0][0]) * i) / steps[0], y = R[1][0] + ((R[1][1] - R[1][0]) * j) / steps[1], z = R[2][0] + ((R[2][1] - R[2][0]) * k) / steps[2];
      const v = cost(x, y, z); if (v < bc) { bc = v; best = [x, y, z]; }
    }
    h = R.map(([a, b], i) => (b - a) / steps[i]);
  } else {
    best = start.map(clampR) as [number, number, number]; bc = cost(...best);
    h = [0.08, 0.08, 0.08];
  }
  for (let round = 0; round < 8; round++) {
    const b0 = best.slice();
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
      const x = clampR(b0[0] + (h[0] * i) / 2, 0), y = clampR(b0[1] + (h[1] * j) / 2, 1), z = clampR(b0[2] + (h[2] * k) / 2, 2);
      const v = cost(x, y, z); if (v < bc) { bc = v; best = [x, y, z]; }
    }
    h = h.map((q) => q / 2);
  }
  return best;
}
const tipAt = (rig: Rig, d: Digit, a3: [number, number, number], world: THREE.Matrix4) => contact(rig, d, fk(rig, d, anglesOf(d, ...a3)), world);

// ---------- each frame ----------
/** a hand's placement from his points: the middle knuckle where his is (at a resting hand's height), turned the way
 *  his hand points (wrist to middle knuckle, from above); tilted as a resting hand */
function placementOf(s: Side, p0: number[][]): Placement {
  const r = REST[s], k = scale[s];
  const up = r.up * k;
  const mcp = atZ(p0[9], up);
  const wrist = atZ(p0[0], Math.max(5, up - 92 * k * Math.sin(r.pitch)));
  const f = mcp.clone().sub(wrist);
  const sgn = s === 'L' ? -1 : 1;
  const phi = Math.atan2(-f.x, f.y);
  return { mcp, yaw: phi / sgn, pitch: r.pitch, roll: r.roll };
}
type Row = number[]; // the 26 numbers of a hand's pose (as hand-pose.json)
const rowOf = (pl: Placement, ang: Record<Digit, [number, number, number]>): Row => [pl.mcp.x, pl.mcp.y, pl.mcp.z, pl.yaw, pl.pitch, pl.roll, ...DIGITS.flatMap((d) => { const a = anglesOf(d, ...ang[d]); return [a.a, a.f0, a.f1, a.f2]; })];

/** the hand's extra move around each press (mm), when the finger couldn't quite reach: found by the first pass */
const shiftOf = new Map<Press, THREE.Vector3>();
function handShift(s: Side, t: number) {
  const v = new THREE.Vector3(); let sum = 0;
  for (const p of presses) {
    if (p.side !== s || !shiftOf.has(p)) continue;
    const w = smooth((t - (p.t0 - 0.25)) / 0.2) * (1 - smooth((t - p.t1 - 0.05) / 0.25));
    if (w <= 0) continue;
    v.addScaledVector(shiftOf.get(p)!, w); sum += w;
  }
  return sum > 1 ? v.divideScalar(sum) : v;
}

function solveAll(pass: number) {
  const rows: Record<Side, (Row | null)[]> = { L: new Array(N).fill(null), R: new Array(N).fill(null) };
  let worst = 0;
  for (const s of ['L', 'R'] as const) {
    const rig = rigs[s];
    let last: Record<Digit, [number, number, number]> | null = null;
    for (let j = 0; j < N; j++) {
      const i = j - OFF;
      const p0 = i >= 0 && i < seen[s].length ? seen[s][i] : null;
      if (!p0) { last = null; continue; }
      const t = j / FPS;
      const pl = placementOf(s, p0);
      pl.mcp.add(handShift(s, t));
      const world = rigToWorld(rig, pl);
      const ang = {} as Record<Digit, [number, number, number]>;
      for (const d of DIGITS) {
        const thumb = d === 'thumb';
        let target = atZ(p0[TIP[d]], thumb ? 9 : 6);
        target.z = thumb ? 8 : 4;
        let wz = 0.06;
        const pr = presses.filter((p) => p.side === s && p.digit === d).map((p) => [p, holdOf(p, t)] as const).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1])[0];
        if (pr) { target = target.clone().lerp(pr[0].at, pr[1]); wz = wz + (1 - wz) * pr[1]; }
        ang[d] = ik(rig, d, target, world, wz, last?.[d] ?? null);
        if (pr && pr[1] > 0.99) {
          const miss = pr[0].at.clone().sub(tipAt(rig, d, ang[d], world));
          if (pass === 0 && miss.length() > 1.2 && Math.abs(t - pr[0].t0 - 0.02) < 0.5 / FPS) shiftOf.set(pr[0], miss.clone().add(handShift(s, t)));
          if (pass === 1) worst = Math.max(worst, miss.length());
        }
      }
      last = ang;
      rows[s][j] = rowOf(pl, ang);
    }
  }
  return { rows, worst };
}

console.log('solving the fingers (first pass)…');
solveAll(0);
console.log(`${shiftOf.size} of ${presses.length} presses needed the hand moved a little; solving again…`);
const { rows, worst } = solveAll(1);
console.log(`every press lands within ${worst.toFixed(1)} mm of where he hit the key`);

// ---------- gaps, then a little smoothing ----------
const OUT_Y = 300; // mm: how far toward the typist a hand goes when the phone lost it (off the picture)
const lerpRow = (a: Row, b: Row, u: number) => a.map((v, i) => v + (b[i] - v) * u);
const out: Record<Side, Row[]> = { L: [], R: [] };
for (const s of ['L', 'R'] as const) {
  const r = rows[s];
  const firstSeen = r.findIndex(Boolean);
  const home: Row = r[firstSeen]!;
  for (let j = 0; j < N; j++) {
    if (r[j]) { out[s].push(r[j]!); continue; }
    let a = j; while (a >= 0 && !r[a]) a--;
    let b = j; while (b < N && !r[b]) b++;
    const A = a >= 0 ? r[a]! : null, B = b < N ? r[b]! : null;
    const base = A && B ? lerpRow(A, B, (j - a) / (b - a)) : (A ?? B ?? home).slice();
    const run = (b < N ? b : Infinity) - (a >= 0 ? a : -Infinity);
    const edge = Math.min(a >= 0 ? j - a : Infinity, b < N ? b - j : Infinity);
    const u = run <= 9 ? 0 : smooth(edge / 12);
    base[1] -= OUT_Y * u;
    out[s].push(base);
  }
}
const SIGMA = 0.8;
const kern = [-2, -1, 0, 1, 2].map((x) => Math.exp(-0.5 * (x / SIGMA) ** 2));
const smoothed = (s: Side) => out[s].map((_, j) => {
  let w = 0; const acc = new Array(26).fill(0);
  kern.forEach((kw, q) => { const r = out[s][Math.min(N - 1, Math.max(0, j + q - 2))]; for (let i = 0; i < 26; i++) acc[i] += kw * r[i]; w += kw; });
  return acc.map((v) => Math.round((v / w) * 1e4) / 1e4);
});
const L = smoothed('L'), R = smoothed('R');
// every key down and up, from the take's log (the keyboard's keys go down exactly then)
const keys = (TAKE.keys as any[]).filter((k) => k.e === 'd' && !k.r).map((k) => {
  const up = (TAKE.keys as any[]).find((u) => u.e === 'u' && u.code === k.code && u.t > k.t);
  return { code: k.code, t0: k.t, t1: up ? up.t : k.t + 0.1 };
});
// for the video (src/TakeHands.tsx), with the take's writing beside it: both stay out of git, like the take
fs.mkdirSync(path.join(root, 'public/take'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/take/pose.json'), JSON.stringify({ fps: FPS, frames: N, scale, poses: L.map((l, j) => [l, R[j]]), keys }));
fs.copyFileSync(path.join(root, 'src/data/take-session.json'), path.join(root, 'public/take/session.json'));
console.log('wrote public/take/pose.json (and session.json)');
