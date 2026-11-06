// Debug: the ghost's fingertips against his, at one take frame.   node scripts/node-ts.mjs scripts/dev/take-check.ts 930
import fs from 'node:fs';
import * as THREE from 'three';
import { parseGlb } from '../../src/hands/glb';
import { DIGITS, contact, fk, rigOf, rigToWorld } from '../../src/hands/rig';
const j = Number(process.argv[2] ?? 930);
const P = JSON.parse(fs.readFileSync('public/take/pose.json', 'utf8'));
const H3 = JSON.parse(fs.readFileSync('src/data/hand-3d.json', 'utf8'));
const glb = (n: string) => { const b = fs.readFileSync(`public/hands/${n}.glb`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const TIP = [4, 8, 12, 16, 20];
(['L', 'R'] as const).forEach((s, si) => {
  const rig = rigOf(parseGlb(glb(s === 'L' ? 'left' : 'right'), s));
  const k = P.scale[s]; rig.units = 1000 * k;
  const r = P.poses[j][si];
  const pl = { mcp: new THREE.Vector3(r[0], r[1], r[2]), yaw: r[3], pitch: r[4], roll: r[5] };
  const W = rigToWorld(rig, pl);
  const mcpW = new THREE.Vector3().setFromMatrixPosition(rig.rest.get('middle-finger-phalanx-proximal')!).applyMatrix4(W);
  const wristW = new THREE.Vector3().setFromMatrixPosition(rig.rest.get('wrist')!).applyMatrix4(W);
  const hd = H3.frames[j - 240].find((h: any) => h.side === s);
  console.log(s, 'ghost mcp', mcpW.toArray().map((v) => v.toFixed(0)).join(','), 'wrist', wristW.toArray().map((v) => v.toFixed(0)).join(','), '| his p0 mcp', hd.p0[9].join(','), 'wrist', hd.p0[0].join(','));
  DIGITS.forEach((d, q) => {
    const o = 6 + 4 * q;
    const ms = fk(rig, d, { a: r[o], f0: r[o + 1], f1: r[o + 2], f2: r[o + 3] });
    const c = contact(rig, d, ms, W);
    console.log('  ', d.padEnd(14), 'ghost', c.toArray().map((v) => v.toFixed(0)).join(','), ' his p0', hd.p0[TIP[q]].map((v: number) => v.toFixed(0)).join(','));
  });
});
