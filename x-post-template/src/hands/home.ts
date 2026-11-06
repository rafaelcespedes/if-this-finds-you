// Where the hands sit on this keyboard, and which finger types which key (touch typing). World mm (keyboard.ts).
import * as THREE from 'three';
import { keysMm } from '../keyboard';
import type { Digit, Placement, Side } from './rig';

export const KEYS = keysMm();
/** a point on a key, world mm (u, v: where on the key from its left and its top, 0..1; z: height over the key top) */
export function onKey(id: string, u = 0.5, v = 0.55, z = 0) {
  const k = KEYS.get(id)!;
  return new THREE.Vector3(k.x + (u - 0.5) * k.w, k.y - (v - 0.5) * k.h, z);
}

/** each digit's resting key and where on it */
export const HOME: Record<Side, Record<Digit, [string, number, number]>> = {
  L: { 'pinky-finger': ['a', 0.5, 0.55], 'ring-finger': ['s', 0.5, 0.55], 'middle-finger': ['d', 0.5, 0.55], 'index-finger': ['f', 0.5, 0.55], thumb: [' ', 0.1, 0.5] },
  R: { 'index-finger': ['j', 0.5, 0.55], 'middle-finger': ['k', 0.5, 0.55], 'ring-finger': ['l', 0.5, 0.55], 'pinky-finger': ['Enter', 0.18, 0.55], thumb: [' ', 0.52, 0.5] },
};
export const homeOf = (side: Side, d: Digit, z = 0) => { const [id, u, v] = HOME[side][d]; return onKey(id, u, v, z); };

/** the hand at rest: where its middle knuckle is against its home key (out: away from the other hand; back: toward
 *  the typist; up: over the key tops, mm) and how it's turned. Found by scripts/dev/hand-place.ts: every fingertip on
 *  its home key with relaxed finger shapes, the fingertips pointing down rather than hooking back, and the rows above
 *  and below in easy reach. */
export const REST: Record<Side, { out: number; back: number; up: number; yaw: number; pitch: number; roll: number }> = {
  L: { out: 23.75, back: 56, up: 50.25, yaw: 0.152, pitch: 0.434, roll: 0.3 },
  R: { out: 5.75, back: 56.75, up: 54.25, yaw: 0.111, pitch: 0.4, roll: 0.3 },
};
export function homePlacement(side: Side): Placement {
  const home = onKey(side === 'L' ? 'd' : 'k'), r = REST[side];
  return { mcp: new THREE.Vector3(home.x + (side === 'L' ? -r.out : r.out), home.y - r.back, r.up), yaw: r.yaw, pitch: r.pitch, roll: r.roll };
}

/** the finger for each key, and the hand it's on: touch typing for the top and home rows; the bottom row by column,
 *  as anyone types on this keyboard (its bottom row sits most of a key further right than on a real one, so M is
 *  under K: the finger above a key takes it) */
export const FINGER: Record<string, [Side, Digit]> = {
  q: ['L', 'pinky-finger'], a: ['L', 'pinky-finger'], Shift: ['L', 'pinky-finger'],
  w: ['L', 'ring-finger'], s: ['L', 'ring-finger'], z: ['L', 'ring-finger'],
  e: ['L', 'middle-finger'], d: ['L', 'middle-finger'], x: ['L', 'middle-finger'],
  r: ['L', 'index-finger'], f: ['L', 'index-finger'], t: ['L', 'index-finger'], g: ['L', 'index-finger'], c: ['L', 'index-finger'], v: ['L', 'index-finger'],
  y: ['R', 'index-finger'], h: ['R', 'index-finger'], u: ['R', 'index-finger'], j: ['R', 'index-finger'], b: ['R', 'index-finger'], n: ['R', 'index-finger'],
  i: ['R', 'middle-finger'], k: ['R', 'middle-finger'], m: ['R', 'middle-finger'],
  o: ['R', 'ring-finger'], l: ['R', 'ring-finger'], ',': ['R', 'ring-finger'],
  p: ['R', 'pinky-finger'], Enter: ['R', 'pinky-finger'], Backspace: ['R', 'pinky-finger'], '.': ['R', 'pinky-finger'],
  ' ': ['R', 'thumb'], Meta: ['L', 'thumb'],
};
