// Records the ghost hands' motion for the recorded session: every frame, where each hand is and every joint's angle,
// written to src/data/hand-pose.json (the video only reads it back). Run it after `npm run session`, whenever the
// keystrokes change:   npm run hands
//
// The fingertips' paths come from src/hands/plan.ts. Here each hand follows its busy fingers on a spring (so it lags
// and settles), breathes a little, and each finger's joints are solved onto its path, starting from the last frame's
// answer so a moving finger moves smoothly. Then every key a finger couldn't quite reach from where the spring left
// the hand gets a little extra move of the hand around that moment, and the whole motion is recorded again (a few
// rounds, until every press lands).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import session from '../src/data/ink-session.json';
import { parseGlb } from '../src/hands/glb';
import { DIGITS, anglesOf, contact, fk, refine, rigOf, rigToWorld, solve, type Digit, type Side } from '../src/hands/rig';
import { homePlacement } from '../src/hands/home';
import { REACH, Typist, type Press } from '../src/hands/plan';

const here = path.dirname(fileURLToPath(import.meta.url));
const glb = (n: string) => { const b = fs.readFileSync(path.join(here, `../public/hands/${n}.glb`)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const S = session as unknown as { fps: number; frames: unknown[]; keys: { t: number; key: string }[] };
const rigs = { L: rigOf(parseGlb(glb('left'), 'L')), R: rigOf(parseGlb(glb('right'), 'R')) };
const typist = new Typist(S.keys);
const err = (side: Side, d: Digit, a3: [number, number, number], target: THREE.Vector3, world: THREE.Matrix4) =>
  contact(rigs[side], d, fk(rigs[side], d, anglesOf(d, ...a3)), world).distanceTo(target);

/** a finger shape that reads as relaxed: the knuckle neither bent back nor folded under, the middle joint softly bent,
 *  the fingertip pointing down or forward (not hooked back toward the palm) */
function comfy(side: Side, d: Digit, a3: [number, number, number], world: THREE.Matrix4) {
  const ms = fk(rigs[side], d, anglesOf(d, ...a3));
  const v = new THREE.Vector3().setFromMatrixPosition(ms[ms.length - 1]).applyMatrix4(world).sub(new THREE.Vector3().setFromMatrixPosition(ms[ms.length - 2]).applyMatrix4(world));
  const tip = Math.atan2(-v.z, v.y) * 57.3;
  return a3[1] > -0.2 && a3[1] < 1.15 && a3[2] > 0.02 && a3[2] < 1.3 && tip < 105;
}
// each press: where its hand must be for the finger to reach comfortably (from home: at least REACH of the reach,
// further if the finger would strain). Presses down together on one hand (Shift and its letter, ⌘ and its key) share
// one placement that suits both.
const placeFor = (ps: Press[]) => {
  const side = ps[0].side, rig = rigs[side];
  const ok = (off: THREE.Vector3) => {
    const pl = homePlacement(side); pl.mcp.add(off);
    const world = rigToWorld(rig, pl);
    return ps.every((p) => { const a3 = solve(rig, p.digit, typist.strikeOf(p), world); return err(side, p.digit, a3, typist.strikeOf(p), world) < 0.6 && (p.digit === 'thumb' || comfy(side, p.digit, a3, world)); });
  };
  const dir = ps.reduce((v, p) => v.add(typist.reachOf(p).multiplyScalar(REACH[p.digit])), new THREE.Vector3()).divideScalar(ps.length);
  for (let s = 0; s < 30; s += 1) {
    const off = dir.lengthSq() > 0.25 ? dir.clone().normalize().multiplyScalar(dir.length() + s) : new THREE.Vector3();
    if (ok(off)) return off;
    // or a little to one side
    for (const side2 of [-1, 1]) { const o2 = off.clone().add(new THREE.Vector3(-dir.y, dir.x, 0).normalize().multiplyScalar(side2 * Math.min(8, s))); if (dir.lengthSq() > 0.25 && ok(o2)) return o2; }
  }
  return dir;
};
for (const p of typist.presses) {
  if (typist.need.has(p)) continue;
  const together = typist.presses.filter((q) => q.side === p.side && q.t0 < p.t1 && q.t1 > p.t0);
  const off = placeFor(together);
  for (const q of together) typist.need.set(q, off.clone());
}

/** the hand's spring: how quickly it follows its fingers (rad/s; critically damped) */
const OMEGA = 22;
const N = S.frames.length, fps = S.fps, SUB = 8;
const smooth = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };
interface Take { frames: number[][][]; miss: Map<Press, { m: number; r: THREE.Vector3 }>; strained: Set<Press>; idleMiss: number }
function record(): Take {
  const spring = { L: { x: new THREE.Vector3(), v: new THREE.Vector3() }, R: { x: new THREE.Vector3(), v: new THREE.Vector3() } };
  const last: Record<Side, Partial<Record<Digit, [number, number, number]>>> = { L: {}, R: {} };
  const round = (v: number, k = 1000) => Math.round(v * k) / k;
  const frames: number[][][] = [];
  const miss = new Map<Press, { m: number; r: THREE.Vector3 }>();
  const strained = new Set<Press>();
  let idleMiss = 0;
  for (let f = 0; f < N; f++) {
    const t = f / fps;
    const out: number[][] = [];
    for (const side of ['L', 'R'] as const) {
      const sp = spring[side];
      // the spring, stepped finely up to this frame
      for (let k = 1; k <= SUB; k++) {
        const tt = t - (SUB - k) / (fps * SUB);
        const target = typist.handPull(side, tt);
        const dt = f === 0 ? 0 : 1 / (fps * SUB);
        const a = target.sub(sp.x).multiplyScalar(OMEGA * OMEGA).addScaledVector(sp.v, -2 * OMEGA);
        sp.v.addScaledVector(a, dt);
        sp.x.addScaledVector(sp.v, dt);
      }
      const shift = sp.x.clone();
      const pl = homePlacement(side);
      // breathing: a slow drift of a millimetre or so, each hand on its own rhythm
      const ph = side === 'L' ? 0 : 2.1;
      pl.mcp.add(shift).add(new THREE.Vector3(0.35 * Math.sin(t * 1.3 + ph), 0.5 * Math.sin(t * 0.9 + ph * 1.7), 0.8 * Math.sin(t * 1.7 + ph)));
      // the hand turns a touch toward where it's reaching, and rises a little as it does
      const away = Math.hypot(shift.x, shift.y);
      pl.yaw += (side === 'L' ? -1 : 1) * 0.0045 * shift.x;
      pl.mcp.z += 0.12 * away;
      const world = rigToWorld(rigs[side], pl);
      // an idle finger keeps its place in the hand: its home point carried from the hand's home to where it is now
      const carry = world.clone().multiply(rigToWorld(rigs[side], homePlacement(side)).invert());
      const ride = (p: THREE.Vector3) => p.applyMatrix4(carry);
      const row = [pl.mcp.x, pl.mcp.y, pl.mcp.z, pl.yaw, pl.pitch, pl.roll].map((v) => round(v));
      for (const d of DIGITS) {
        const { p: target, busy } = typist.fingertip(side, d, t, ride, away);
        const prev = last[side][d];
        let a3 = prev ? refine(rigs[side], d, target, world, prev, [0.03, 0.03, 0.03]) : solve(rigs[side], d, target, world);
        // a jump the walk can't follow: search the whole range again, but take a different shape only if it's much
        // closer (a finger that flips its shape between two frames pops)
        const e = err(side, d, a3, target, world);
        if (!prev || e > 3) { const g = solve(rigs[side], d, target, world); if (!prev || err(side, d, g, target, world) < e - 2) a3 = g; }
        last[side][d] = a3;
        const m = err(side, d, a3, target, world);
        for (const p of typist.presses) {
          if (p.side !== side || p.digit !== d || t < p.t0 || t > p.t1) continue;
          const c = contact(rigs[side], d, fk(rigs[side], d, anglesOf(d, ...a3)), world);
          const r = target.clone().sub(c);
          if (!miss.has(p) || miss.get(p)!.m < m) miss.set(p, { m, r });
          if (d !== 'thumb' && !comfy(side, d, a3, world)) strained.add(p);
        }
        if (busy < 0.5) idleMiss = Math.max(idleMiss, m);
        const ang = anglesOf(d, ...a3);
        row.push(round(ang.a, 10000), round(ang.f0, 10000), round(ang.f1, 10000), round(ang.f2, 10000));
      }
      out.push(row);
    }
    frames.push(out);
  }
  return { frames, miss, strained, idleMiss };
}

let take = record();
for (let round = 1; round <= 8; round++) {
  // off its key: a fingertip more than 2 mm from where it aims (a key is 15 mm across); a thumb off the space bar
  const bad = [...take.miss].filter(([p, x]) => x.m > (p.key === ' ' ? 4 : 2));
  const strained = [...take.strained].filter((p) => typist.reachOf(p).length() > 2);
  console.log(`round ${round}: ${bad.length} presses off their key (worst ${Math.max(0, ...bad.map(([, x]) => x.m)).toFixed(1)} mm), ${strained.length} with the finger strained`);
  if (!bad.length && !strained.length) break;
  // move the hand's aim for a press by what its finger missed (a little more, so it settles into reach), and a little
  // further toward a key its finger strains for; presses down together move together
  const moved = new Set<Press>();
  for (const [p, x] of bad) { const together = typist.presses.filter((q) => q.side === p.side && q.t0 < p.t1 && q.t1 > p.t0); for (const q of together) if (!moved.has(q)) { typist.need.get(q)!.addScaledVector(x.r, 1.0 / together.length + 0.15); moved.add(q); } }
  for (const p of strained) if (!moved.has(p)) typist.need.get(p)!.addScaledVector(typist.reachOf(p).normalize(), 2);
  take = record();
}
for (const [p, x] of take.miss) if (x.m > (p.key === ' ' ? 4 : 2)) console.log(`  ${p.t0.toFixed(2)} s ${JSON.stringify(p.key)} (${p.side} ${p.digit}) still off by ${x.m.toFixed(1)} mm`);
for (const p of take.strained) console.log(`  ${p.t0.toFixed(2)} s ${JSON.stringify(p.key)} (${p.side} ${p.digit}) strained`);
if (process.env.HANDS_DEBUG) for (const p of typist.presses) console.log(`  ${p.t0.toFixed(2)} ${JSON.stringify(p.key).padEnd(12)} ${p.side} ${p.digit.padEnd(14)} hand moved ${typist.need.get(p)!.length().toFixed(0).padStart(3)} mm`);
console.log(`idle fingers strayed up to ${take.idleMiss.toFixed(1)} mm from their paths`);

// de-pop: wherever a joint still turns more than POP in one frame, ease that digit over the frames around it
const POP = 0.3;
let pops = 0;
for (let side = 0; side < 2; side++) for (let j = 0; j < 5; j++) {
  for (let f = 1; f < N; f++) {
    const a = take.frames[f - 1][side], b = take.frames[f][side];
    let worstD = 0;
    for (let k = 0; k < 4; k++) worstD = Math.max(worstD, Math.abs(b[6 + 4 * j + k] - a[6 + 4 * j + k]));
    if (worstD <= POP) continue;
    pops++;
    const f0 = Math.max(0, f - 4), f1 = Math.min(N - 1, f + 3);
    for (let g = f0 + 1; g < f1; g++) {
      const u = (g - f0) / (f1 - f0), e = u * u * (3 - 2 * u);
      for (let k = 0; k < 4; k++) { const c = 6 + 4 * j + k; take.frames[g][side][c] = Math.round((take.frames[f0][side][c] * (1 - e) + take.frames[f1][side][c] * e) * 10000) / 10000; }
    }
  }
}
console.log(`${pops} pops eased`);
const file = path.join(here, '../src/data/hand-pose.json');
const r3 = (v: number) => Math.round(v * 1000) / 1000;
fs.writeFileSync(file, JSON.stringify({
  fps, frames: N,
  // each frame: [left, right], each hand [knuckle x, y, z (mm), yaw, pitch, roll, then per digit (thumb, index, middle,
  // ring, pinky) its spread and its three joints' bends (radians)]
  poses: take.frames,
  presses: typist.presses.map((p) => ({ key: p.key, side: p.side, digit: p.digit, t0: r3(p.t0), t1: r3(p.t1) })),
}));
console.log(`${N} frames, ${typist.presses.length} presses → ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
