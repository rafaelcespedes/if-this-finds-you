// Reading the hand models (public/hands/left.glb, right.glb: the WebXR generic hands, MIT, see the LICENSE.md next to
// them). Each is one skinned mesh over WebXR's 25 hand joints, every joint a direct child of the armature, so a joint's
// node transform is its frame in the model's space (metres). Only what the ghost hands need is read: the joints' rest
// frames, the mesh's positions, skin joints and weights, its triangles, and the inverse bind matrices. Works in the
// browser and in Node (an ArrayBuffer in).
import * as THREE from 'three';

export type Side = 'L' | 'R';

export interface HandModel {
  side: Side;
  /** each joint's rest frame in the model's space (metres), by WebXR name */
  rest: Map<string, THREE.Matrix4>;
  /** the skin's joints, in the order JOINTS_0 indexes them */
  jointNames: string[];
  /** inverse bind matrices, one per skin joint */
  ibm: THREE.Matrix4[];
  /** positions (metres), welded: vertices split only for texture seams are one vertex here, so smoothing has no cracks */
  positions: Float32Array;
  skinJoints: Uint8Array;
  skinWeights: Float32Array;
  index: Uint32Array;
}

const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function parseGlb(buf: ArrayBuffer, side: Side): HandModel {
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8; // the BIN chunk's header (length, type) follows the JSON chunk
  const read = (i: number): ArrayLike<number> => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const off = binStart + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const n = a.count * SIZE[a.type];
    const copy = buf.slice(off, off + n * ({ 5126: 4, 5125: 4, 5123: 2, 5121: 1 } as Record<number, number>)[a.componentType]);
    if (a.componentType === 5126) return new Float32Array(copy);
    if (a.componentType === 5125) return new Uint32Array(copy);
    if (a.componentType === 5123) return new Uint16Array(copy);
    return new Uint8Array(copy);
  };
  const rest = new Map<string, THREE.Matrix4>();
  for (const n of json.nodes) {
    if (!n.translation || !n.rotation || String(n.name).startsWith('xr_')) continue;
    rest.set(n.name, new THREE.Matrix4().compose(new THREE.Vector3(...n.translation), new THREE.Quaternion(...n.rotation), new THREE.Vector3(1, 1, 1)));
  }
  const skin = json.skins[0];
  const jointNames: string[] = skin.joints.map((j: number) => json.nodes[j].name);
  const ibmA = read(skin.inverseBindMatrices) as Float32Array;
  const ibm = jointNames.map((_, j) => new THREE.Matrix4().fromArray(ibmA, j * 16));
  const prim = json.meshes[0].primitives[0];
  const P = read(prim.attributes.POSITION) as Float32Array;
  const J = read(prim.attributes.JOINTS_0) as Uint8Array;
  const W = read(prim.attributes.WEIGHTS_0) as Float32Array;
  const I = read(prim.indices);
  // weld: one vertex per position
  const n0 = P.length / 3;
  const remap = new Uint32Array(n0);
  const seen = new Map<string, number>();
  const keep: number[] = [];
  for (let i = 0; i < n0; i++) {
    const key = `${Math.round(P[3 * i] * 1e6)},${Math.round(P[3 * i + 1] * 1e6)},${Math.round(P[3 * i + 2] * 1e6)}`;
    let at = seen.get(key);
    if (at === undefined) { at = keep.length; seen.set(key, at); keep.push(i); }
    remap[i] = at;
  }
  const n = keep.length;
  const positions = new Float32Array(3 * n), skinJoints = new Uint8Array(4 * n), skinWeights = new Float32Array(4 * n);
  keep.forEach((src, i) => {
    for (let c = 0; c < 3; c++) positions[3 * i + c] = P[3 * src + c];
    for (let c = 0; c < 4; c++) { skinJoints[4 * i + c] = J[4 * src + c]; skinWeights[4 * i + c] = W[4 * src + c]; }
  });
  const tris: number[] = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  return { side, rest, jointNames, ibm, positions, skinJoints, skinWeights, index: new Uint32Array(tris) };
}
