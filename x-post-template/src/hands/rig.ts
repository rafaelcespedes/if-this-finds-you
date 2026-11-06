// The hands' skeleton: WebXR's 25 joints, placed over the keyboard and posed so each fingertip lands where it should.
// World units are millimetres: x right, y forward (up the screen), z up (toward the camera), the key tops at z = 0.
// A pose is a placement (where the hand is: its middle knuckle, and how it's turned) and, for each digit, four
// angles; forward kinematics turns that into every joint's frame, and the mesh follows the joints (mesh.ts).
import * as THREE from 'three';
import type { HandModel, Side } from './glb';

export type { Side };
export const DIGITS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'] as const;
export type Digit = (typeof DIGITS)[number];
export const chainOf = (d: Digit) => d === 'thumb'
  ? ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']
  : [`${d}-metacarpal`, `${d}-phalanx-proximal`, `${d}-phalanx-intermediate`, `${d}-phalanx-distal`, `${d}-tip`];

export interface Rig {
  side: Side;
  /** joint frames in the model's space (WebXR: -Z along the bone, +Y out of the back of the hand) */
  rest: Map<string, THREE.Matrix4>;
  /** mm per model unit */
  units: number;
  /** each fingertip's pad radius, mm */
  pad: Record<Digit, number>;
  /** how far the flesh runs past the tip joint, mm */
  tipExtra: Record<Digit, number>;
  /** the palm's frame in the model's space: X right (palm down), Y toward the fingers, Z out of the back */
  palm: THREE.Matrix4;
  /** which sign of rotation about a joint's X curls the digit toward the palm */
  flex: Record<Digit, number>;
}

// measured on the WebXR generic hand (its fingertips' flesh beyond the tip joints, and the pads' radii)
const TIP_EXTRA: Record<Digit, number> = { thumb: 9.9, 'index-finger': 11.1, 'middle-finger': 12.6, 'ring-finger': 11.6, 'pinky-finger': 9.6 };
const PAD: Record<Digit, number> = { thumb: 8.5, 'index-finger': 7.0, 'middle-finger': 7.2, 'ring-finger': 6.8, 'pinky-finger': 6.2 };

export function rigOf(m: HandModel): Rig {
  const palm = palmFrame(m.side, m.rest);
  return { side: m.side, rest: m.rest, units: 1000, palm, pad: PAD, tipExtra: TIP_EXTRA, flex: findFlex(m.rest, palm) };
}

function palmFrame(side: Side, rest: Map<string, THREE.Matrix4>) {
  const p = (n: string) => new THREE.Vector3().setFromMatrixPosition(rest.get(n)!);
  const o = p('wrist');
  const fwd = p('middle-finger-phalanx-proximal').sub(o).normalize();
  const across = p('pinky-finger-phalanx-proximal').sub(p('index-finger-phalanx-proximal'));
  if (side === 'L') across.negate(); // palm down, "right" is toward the pinky on a right hand, the index on a left
  const x = across.sub(fwd.clone().multiplyScalar(across.dot(fwd))).normalize();
  const z = new THREE.Vector3().crossVectors(x, fwd).normalize();
  return new THREE.Matrix4().makeBasis(x, fwd, z).setPosition(o);
}

// ---------- forward kinematics of one digit ----------
/** a = spread at the first joint (about its Y), f0..f2 = flexion at the three joints */
export interface Angles { a: number; f0: number; f1: number; f2: number }
const _r = new THREE.Matrix4();
interface Chain { names: string[]; rels: THREE.Matrix4[] }
const chains = new WeakMap<Map<string, THREE.Matrix4>, Partial<Record<Digit, Chain>>>();
function chainFor(rest: Map<string, THREE.Matrix4>, d: Digit): Chain {
  let c = chains.get(rest);
  if (!c) { c = {}; chains.set(rest, c); }
  if (!c[d]) {
    const names = chainOf(d);
    c[d] = { names, rels: names.map((n, i) => (i ? rest.get(names[i - 1])!.clone().invert().multiply(rest.get(n)!) : new THREE.Matrix4())) };
  }
  return c[d]!;
}
/** each joint of the digit (model space) for these angles: a finger bends at its knuckle, middle and end joints (the
 *  metacarpal stays in the palm); the thumb at its base (CMC), knuckle and end joint */
export function fk(rig: Pick<Rig, 'rest' | 'flex'>, d: Digit, ang: Angles, out?: THREE.Matrix4[]): THREE.Matrix4[] {
  const { names, rels } = chainFor(rig.rest, d);
  const s = rig.flex[d];
  const res = out ?? names.map(() => new THREE.Matrix4());
  const k = d === 'thumb' ? 0 : 1;
  res[0].copy(rig.rest.get(names[0])!);
  const flexes = [ang.f0, ang.f1, ang.f2];
  for (let i = k, j = 0; i < names.length; i++, j++) {
    if (i > 0) res[i].multiplyMatrices(res[i - 1], rels[i]);
    if (j === 0) { _r.makeRotationY(ang.a); res[i].multiply(_r); }
    if (j < 3) { _r.makeRotationX(s * flexes[j]); res[i].multiply(_r); }
  }
  return res;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
/** the point of the fingertip that touches a key (world mm): the lowest point of the digit's rounded end */
export function contact(rig: Rig, d: Digit, ms: THREE.Matrix4[], world: THREE.Matrix4, out = new THREE.Vector3()) {
  const n = ms.length;
  _v.setFromMatrixPosition(ms[n - 2]).applyMatrix4(world);
  _w.setFromMatrixPosition(ms[n - 1]).applyMatrix4(world);
  _u.copy(_w).sub(_v).normalize();
  const r = rig.pad[d];
  out.copy(_w).addScaledVector(_u, rig.tipExtra[d] - r);
  out.z -= r;
  return out;
}

function findFlex(rest: Map<string, THREE.Matrix4>, palm: THREE.Matrix4): Record<Digit, number> {
  const out = {} as Record<Digit, number>;
  const inv = palm.clone().invert();
  const probe = { rest, flex: { thumb: 1, 'index-finger': 1, 'middle-finger': 1, 'ring-finger': 1, 'pinky-finger': 1 } as Record<Digit, number> };
  for (const d of DIGITS) {
    const ms = fk(probe, d, { a: 0, f0: 0, f1: 0.6, f2: 0.6 });
    const tip = new THREE.Vector3().setFromMatrixPosition(ms[ms.length - 1]).applyMatrix4(inv);
    const rest0 = new THREE.Vector3().setFromMatrixPosition(rest.get(chainOf(d).at(-1)!)!).applyMatrix4(inv);
    out[d] = tip.z < rest0.z ? 1 : -1;
  }
  return out;
}

// ---------- inverse kinematics: a fingertip onto a point ----------
// Three free angles (spread, knuckle, middle joint; the end joint follows the middle one as real fingers do) for the
// three coordinates of the target. Among near-equal answers the natural one wins: little spread, a softly bent
// knuckle. `solve` searches the whole range (coarse to fine); `refine` walks from a nearby answer (the last frame's),
// so a moving finger moves smoothly.
const RANGE: Record<'finger' | 'thumb', [number, number][]> = {
  finger: [[-0.45, 0.45], [-0.35, 1.45], [0, 1.85]],
  thumb: [[-1.2, 1.2], [-1.2, 1.2], [-0.3, 1.2]],
};
const angles3 = (d: Digit, x: number, y: number, z: number): Angles => d === 'thumb' ? { a: x, f0: y, f1: z, f2: 0.75 * z } : { a: x, f0: y, f1: z, f2: 0.62 * z };
function costFn(rig: Rig, d: Digit, target: THREE.Vector3, world: THREE.Matrix4) {
  const ms = chainOf(d).map(() => new THREE.Matrix4());
  const c = new THREE.Vector3();
  const thumb = d === 'thumb';
  return (x: number, y: number, z: number) => {
    fk(rig, d, angles3(d, x, y, z), ms);
    contact(rig, d, ms, world, c);
    return c.distanceToSquared(target) + 3 * (x * x) + (thumb ? 0 : 1 * (y - 0.35) * (y - 0.35));
  };
}
export function solve(rig: Rig, d: Digit, target: THREE.Vector3, world: THREE.Matrix4): [number, number, number] {
  const R = RANGE[d === 'thumb' ? 'thumb' : 'finger'];
  const cost = costFn(rig, d, target, world);
  let best = [0, 0, 0], bc = Infinity;
  const steps = [9, 11, 11];
  for (let i = 0; i <= steps[0]; i++) for (let j = 0; j <= steps[1]; j++) for (let k = 0; k <= steps[2]; k++) {
    const x = R[0][0] + ((R[0][1] - R[0][0]) * i) / steps[0], y = R[1][0] + ((R[1][1] - R[1][0]) * j) / steps[1], z = R[2][0] + ((R[2][1] - R[2][0]) * k) / steps[2];
    const v = cost(x, y, z); if (v < bc) { bc = v; best = [x, y, z]; }
  }
  return refine(rig, d, target, world, best as [number, number, number], R.map(([a, b], i) => (b - a) / steps[i]));
}
export function refine(rig: Rig, d: Digit, target: THREE.Vector3, world: THREE.Matrix4, start: [number, number, number], step: number[] = [0.04, 0.04, 0.04]): [number, number, number] {
  const R = RANGE[d === 'thumb' ? 'thumb' : 'finger'];
  const cost = costFn(rig, d, target, world);
  const clampR = (v: number, i: number) => Math.min(R[i][1], Math.max(R[i][0], v));
  let best = start.map(clampR) as [number, number, number], bc = cost(...best);
  let h = step.slice();
  for (let round = 0; round < 9; round++) {
    const b0 = best.slice();
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
      const x = clampR(b0[0] + (h[0] * i) / 2, 0), y = clampR(b0[1] + (h[1] * j) / 2, 1), z = clampR(b0[2] + (h[2] * k) / 2, 2);
      const v = cost(x, y, z); if (v < bc) { bc = v; best = [x, y, z]; }
    }
    h = h.map((q) => q / 2);
  }
  return best;
}
export const anglesOf = angles3;

// ---------- placing a hand ----------
/** where a hand is: its middle knuckle (world mm), and how it's turned (radians): yaw about the vertical (toward the
 *  other hand), pitch (fingers down), roll (the thumb side up) */
export interface Placement { mcp: THREE.Vector3; yaw: number; pitch: number; roll: number }
/** model space → world (mm) for a placement */
export function rigToWorld(rig: Rig, pl: Placement) {
  const s = rig.side === 'L' ? -1 : 1;
  const R = new THREE.Matrix4().makeRotationZ(s * pl.yaw).multiply(new THREE.Matrix4().makeRotationX(pl.pitch)).multiply(new THREE.Matrix4().makeRotationY(s * pl.roll));
  const S = new THREE.Matrix4().makeScale(rig.units, rig.units, rig.units);
  const base = R.clone().multiply(S).multiply(rig.palm.clone().invert());
  const at = new THREE.Vector3().setFromMatrixPosition(rig.rest.get('middle-finger-phalanx-proximal')!).applyMatrix4(base);
  return new THREE.Matrix4().makeTranslation(pl.mcp.x - at.x, pl.mcp.y - at.y, pl.mcp.z - at.z).multiply(base);
}

/** a hand's pose: its placement and each digit's angles */
export interface Pose { pl: Placement; ang: Record<Digit, Angles> }
/** every joint's frame (model space) for a pose, by name */
export function jointsOf(rig: Rig, ang: Record<Digit, Angles>): Map<string, THREE.Matrix4> {
  const joints = new Map<string, THREE.Matrix4>();
  joints.set('wrist', rig.rest.get('wrist')!.clone());
  for (const d of DIGITS) {
    const ms = fk(rig, d, ang[d]);
    chainOf(d).forEach((n, i) => joints.set(n, ms[i]));
  }
  return joints;
}
