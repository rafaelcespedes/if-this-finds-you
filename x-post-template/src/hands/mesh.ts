// The hands' surface: the model's low-poly skin, posed by its joints on the CPU (linear blend skinning), then smoothed
// with two rounds of Loop subdivision, which rounds off the facets and the pointed fingertips. The subdivision is
// worked out once, as weights over the posed vertices (a stencil per round), so each frame is the same small sums.
import * as THREE from 'three';
import type { HandModel } from './glb';
import { jointsOf, rigToWorld, type Pose, type Rig } from './rig';

/** where the ghost thins into fog, as fractions of the way from the wrist to the knuckles: gone at the first, whole
 *  from the second */
export const FADE: [number, number] = [0.45, 1.0];

interface Stencil { n: number; off: Uint32Array; idx: Uint32Array; w: Float32Array }

/** one round of Loop subdivision of a triangle mesh with n vertices: the new vertices as weights over the old, and the
 *  new triangles (each one split in four). Open edges (the wrist) keep their own curve. */
function loopRound(n: number, tri: Uint32Array): { st: Stencil; tri: Uint32Array } {
  const edgeId = new Map<number, number>();
  const ea: number[] = [], eb: number[] = [], opp: number[][] = [];
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  const edge = (a: number, b: number, c: number) => {
    const k = key(a, b);
    let e = edgeId.get(k);
    if (e === undefined) { e = ea.length; edgeId.set(k, e); ea.push(Math.min(a, b)); eb.push(Math.max(a, b)); opp.push([]); }
    opp[e].push(c);
    return e;
  };
  const fe: number[] = [];
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    fe.push(edge(a, b, c), edge(b, c, a), edge(c, a, b));
  }
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  const bnb: number[][] = Array.from({ length: n }, () => []);
  for (let e = 0; e < ea.length; e++) {
    nb[ea[e]].add(eb[e]); nb[eb[e]].add(ea[e]);
    if (opp[e].length === 1) { bnb[ea[e]].push(eb[e]); bnb[eb[e]].push(ea[e]); }
  }
  const rows: [number, number][][] = [];
  for (let v = 0; v < n; v++) {
    if (bnb[v].length) {
      rows.push(bnb[v].length === 2 ? [[v, 0.75], [bnb[v][0], 0.125], [bnb[v][1], 0.125]] : [[v, 1]]);
      continue;
    }
    const k = nb[v].size;
    if (!k) { rows.push([[v, 1]]); continue; }
    const beta = k === 3 ? 3 / 16 : 3 / (8 * k);
    rows.push([[v, 1 - k * beta], ...[...nb[v]].map((u) => [u, beta] as [number, number])]);
  }
  for (let e = 0; e < ea.length; e++) {
    rows.push(opp[e].length === 2
      ? [[ea[e], 0.375], [eb[e], 0.375], [opp[e][0], 0.125], [opp[e][1], 0.125]]
      : [[ea[e], 0.5], [eb[e], 0.5]]);
  }
  const off = new Uint32Array(rows.length + 1);
  rows.forEach((r, i) => { off[i + 1] = off[i] + r.length; });
  const idx = new Uint32Array(off[rows.length]), w = new Float32Array(off[rows.length]);
  rows.forEach((r, i) => r.forEach(([u, x], j) => { idx[off[i] + j] = u; w[off[i] + j] = x; }));
  const out = new Uint32Array(tri.length * 4);
  for (let t = 0, f = 0; t < tri.length; t += 3, f += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    const ab = n + fe[f], bc = n + fe[f + 1], ca = n + fe[f + 2];
    out.set([a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca], t * 4);
  }
  return { st: { n: rows.length, off, idx, w }, tri: out };
}

function applyStencil(st: Stencil, src: Float32Array, dst: Float32Array) {
  const { off, idx, w } = st;
  for (let i = 0; i < st.n; i++) {
    let x = 0, y = 0, z = 0;
    for (let k = off[i]; k < off[i + 1]; k++) { const u = 3 * idx[k], q = w[k]; x += q * src[u]; y += q * src[u + 1]; z += q * src[u + 2]; }
    dst[3 * i] = x; dst[3 * i + 1] = y; dst[3 * i + 2] = z;
  }
}

export interface HandSurface {
  /** the smoothed mesh's triangles */
  index: Uint32Array;
  /** the smoothed mesh's vertex count */
  count: number;
  /** per vertex, 1 from the knuckles forward, thinning to 0 toward the wrist (the ghost's fog) */
  fade: Float32Array;
  /** pose the hand: fills positions (world mm) and normals of the smoothed mesh */
  pose(p: Pose, positions: Float32Array, normals: Float32Array): void;
}

export function surfaceOf(model: HandModel, rig: Rig, rounds = 2): HandSurface {
  const stencils: Stencil[] = [];
  let tri = model.index, n = model.positions.length / 3;
  for (let r = 0; r < rounds; r++) { const s = loopRound(n, tri); stencils.push(s.st); tri = s.tri; n = s.st.n; }
  const bufs = stencils.map((s) => new Float32Array(3 * s.n));
  const n0 = model.positions.length / 3;
  // the fade: each vertex's distance from the wrist toward the knuckles, in the palm's frame at rest
  let rest: Float32Array = model.positions;
  for (const s of stencils) { const d = new Float32Array(3 * s.n); applyStencil(s, rest, d); rest = d; }
  const toPalm = rig.palm.clone().invert();
  const mcpY = new THREE.Vector3().setFromMatrixPosition(rig.rest.get('middle-finger-phalanx-proximal')!).applyMatrix4(toPalm).y;
  const fade = new Float32Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set(rest[3 * i], rest[3 * i + 1], rest[3 * i + 2]).applyMatrix4(toPalm);
    const u = Math.min(1, Math.max(0, (v.y / mcpY - FADE[0]) / (FADE[1] - FADE[0])));
    fade[i] = u * u * (3 - 2 * u);
  }
  const skinned = new Float32Array(3 * n0);
  const K = new Float32Array(16 * model.jointNames.length);
  const m = new THREE.Matrix4();
  return {
    index: tri,
    count: n,
    fade,
    pose(p, positions, normals) {
      // the skin's matrices: world × joint (posed) × inverse bind
      const W = rigToWorld(rig, p.pl);
      const joints = jointsOf(rig, p.ang);
      model.jointNames.forEach((name, j) => { m.multiplyMatrices(W, joints.get(name)!).multiply(model.ibm[j]); K.set(m.elements, 16 * j); });
      const P = model.positions, J = model.skinJoints, Wt = model.skinWeights;
      for (let i = 0; i < n0; i++) {
        const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
        let ox = 0, oy = 0, oz = 0;
        for (let c = 0; c < 4; c++) {
          const w = Wt[4 * i + c];
          if (!w) continue;
          const e = 16 * J[4 * i + c];
          ox += w * (K[e] * x + K[e + 4] * y + K[e + 8] * z + K[e + 12]);
          oy += w * (K[e + 1] * x + K[e + 5] * y + K[e + 9] * z + K[e + 13]);
          oz += w * (K[e + 2] * x + K[e + 6] * y + K[e + 10] * z + K[e + 14]);
        }
        skinned[3 * i] = ox; skinned[3 * i + 1] = oy; skinned[3 * i + 2] = oz;
      }
      let src: Float32Array = skinned;
      stencils.forEach((s, r) => { const dst = r === stencils.length - 1 ? positions : bufs[r]; applyStencil(s, src, dst); src = dst; });
      vertexNormals(tri, positions, normals);
    },
  };
}

/** smooth normals: each vertex the area-weighted sum of its triangles' normals */
function vertexNormals(tri: Uint32Array, P: Float32Array, N: Float32Array) {
  N.fill(0);
  for (let t = 0; t < tri.length; t += 3) {
    const a = 3 * tri[t], b = 3 * tri[t + 1], c = 3 * tri[t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { N[i] += nx; N[i + 1] += ny; N[i + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
  }
}
