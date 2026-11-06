// searches the resting placement of each hand (REST in src/hands/home.ts): every fingertip on its home key with
// relaxed finger shapes, and the keys a row up and a row down still in easy reach (knuckles and middle joints softly
// bent, none folded under). Prints the best placement for each hand.   node scripts/node-ts.mjs scripts/dev/hand-place.ts
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseGlb } from '../../src/hands/glb';
import { rigOf, rigToWorld, fk, contact, anglesOf, solve, DIGITS, type Digit } from '../../src/hands/rig';
import { homeOf, onKey } from '../../src/hands/home';
const ab = (f: string) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const deg = (r: number) => Math.round(r * 57.3);
const ROWS: Record<'L' | 'R', Partial<Record<Digit, [string, string]>>> = {
  L: { 'pinky-finger': ['q', 'Shift'], 'ring-finger': ['w', 'z'], 'middle-finger': ['e', 'x'], 'index-finger': ['r', 'c'] },
  R: { 'index-finger': ['u', 'n'], 'middle-finger': ['i', 'm'], 'ring-finger': ['o', ','], 'pinky-finger': ['p', '.'] },
};
for (const side of ['L', 'R'] as const) {
  const rig = rigOf(parseGlb(ab(`public/hands/${side === 'L' ? 'left' : 'right'}.glb`), side));
  const home = onKey(side === 'L' ? 'd' : 'k');
  const s = side === 'L' ? -1 : 1;
  /** how far the fingertip's last segment points from straight ahead (degrees): 90 is straight down; past that it
   *  hooks back toward the palm */
  const tipAngle = (d: Digit, a: ReturnType<typeof anglesOf>, w: THREE.Matrix4) => {
    const ms = fk(rig, d, a);
    const p0 = new THREE.Vector3().setFromMatrixPosition(ms[ms.length - 2]).applyMatrix4(w), p1 = new THREE.Vector3().setFromMatrixPosition(ms[ms.length - 1]).applyMatrix4(w);
    const v = p1.sub(p0).normalize();
    return Math.atan2(-v.z, v.y) * 57.3;
  };
  const strain = (a: { f0: number; f1: number }) => (a.f0 - 0.3) ** 2 + 0.8 * (a.f1 - 0.45) ** 2 + 6 * Math.max(0, a.f1 - 1.15) ** 2 + 6 * Math.max(0, -0.05 - a.f0) ** 2;
  const evalP = (dx: number, back: number, up: number, yaw: number, pitch: number, log = false) => {
    const pl = { mcp: new THREE.Vector3(home.x + s * dx, home.y - back, up), yaw, pitch, roll: 0.3 };
    const w = rigToWorld(rig, pl);
    let c = 0.012 * (up - 42) ** 2; const parts: string[] = [];
    for (const d of DIGITS) {
      const t = homeOf(side, d);
      const a = anglesOf(d, ...solve(rig, d, t, w));
      const e = contact(rig, d, fk(rig, d, a), w).distanceTo(t);
      const ta = tipAngle(d, a, w);
      c += 4 * e * e + (d === 'thumb' ? 0 : 30 * strain(a) + 0.02 * Math.max(0, ta - 75) ** 2);
      let extra = '';
      for (const k of ROWS[side][d] ?? []) {
        const tk = onKey(k, k === 'Shift' ? 0.62 : 0.5, 0.55, 0);
        const ak = anglesOf(d, ...solve(rig, d, tk, w));
        const ek = contact(rig, d, fk(rig, d, ak), w).distanceTo(tk);
        const tk2 = tipAngle(d, ak, w);
        c += 0.25 * ek * ek + 12 * strain(ak) + 0.01 * Math.max(0, tk2 - 80) ** 2;
        extra += ` ${k}:${deg(ak.f0)}/${deg(ak.f1)}∠${tk2.toFixed(0)}${ek > 1 ? `(e${ek.toFixed(0)})` : ''}`;
      }
      if (log) parts.push(`${d.split('-')[0].slice(0, 5)} ${deg(a.f0)}/${deg(a.f1)}∠${ta.toFixed(0)}${extra}`);
    }
    if (log) console.log(side, JSON.stringify({ out: dx, back, up, yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3) }), 'cost', c.toFixed(1), '|', parts.join(' | '));
    return c;
  };
  let best: number[] = [], bc = Infinity;
  for (const dx of [0, 8, 16]) for (const back of [48, 56, 64, 72]) for (const up of [40, 48, 56, 64]) for (const yaw of [0.1, 0.25]) for (const pitch of [0.1, 0.25, 0.4]) {
    const c = evalP(dx, back, up, yaw, pitch); if (c < bc) { bc = c; best = [dx, back, up, yaw, pitch]; }
  }
  let h = [4, 4, 4, 0.06, 0.06];
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 5; i++) for (const sg of [-1, 1]) {
      const p = best.slice(); p[i] += sg * h[i];
      const c = evalP(p[0], p[1], p[2], p[3], p[4]); if (c < bc) { bc = c; best = p; }
    }
    h = h.map((x) => x / 2);
  }
  evalP(best[0], best[1], best[2], best[3], best[4], true);
}
