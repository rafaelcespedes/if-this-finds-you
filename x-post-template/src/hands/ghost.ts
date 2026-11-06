// The ghost: hands made of frosted glass, part liquid, part fog. Each pixel of the hand shows what's under it (the
// keys, the paper), blurred like frost and bent along the surface like water, lifted toward white where the glass is
// thick, with a bright liquid rim where the surface turns away and a soft highlight from the light. The hand thins into
// fog from the knuckles back to the wrist, so the forearm never has to show.
import * as THREE from 'three';

export interface GhostLook {
  /** how far the glass bends what's under it, mm (at its edges; less where it faces the camera) */
  refract: number;
  /** the frost: how blurred what's under it is, mm */
  frost: number;
  /** milkiness: how far toward white, 0..1 */
  milk: number;
  /** the bright rim, 0..1 */
  rim: number;
  /** the highlight, 0..1 */
  spec: number;
  /** the thin shade inside the outline, 0..1 */
  edge: number;
  /** the whole hand's opacity */
  opacity: number;
}
export const GHOST: GhostLook = { refract: 4.2, frost: 2.2, milk: 0.1, rim: 0.6, spec: 0.22, edge: 0.16, opacity: 0.94 };

const vert = /* glsl */ `
attribute float fade;
varying vec3 vPos;
varying vec3 vNormal;
varying float vFade;
void main() {
  vPos = position;
  vNormal = normal;
  vFade = fade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform sampler2D under;
uniform sampler2D underBlur;
uniform sampler2D shade;
uniform float shadeK;
uniform vec2 res;
uniform float pxPerMm;
uniform vec3 camPos;
uniform float refract, milk, rim, spec, opacity, edge, fogPx, fogFrom;
varying vec3 vPos;
varying vec3 vNormal;
varying float vFade;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(camPos - vPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 1.6);
  vec2 uv = gl_FragCoord.xy / res;
  // what's under the glass, bent along the surface's slope as seen from the camera (more toward the edges), frosted,
  // with the hands' own shadow on it
  vec2 off = N.xy * refract * pxPerMm / res * (0.25 + 0.75 * fres);
  vec3 frosted = texture2D(underBlur, uv - off).rgb;
  vec3 sharp = texture2D(under, uv - 1.5 * off).rgb;
  vec3 col = mix(frosted, sharp, 0.3 * fres);
  col *= 1.0 - 0.8 * shadeK * texture2D(shade, uv - off).r;
  // milky where the glass is thick (facing the camera), clearer toward the edges
  col = mix(col, vec3(0.975, 0.978, 0.985), milk * (0.3 + 0.7 * ndv));
  // form: a soft key light from the top left, a little in front
  vec3 L = normalize(vec3(-0.4, 0.55, 0.75));
  col *= 0.91 + 0.09 * clamp(dot(N, L), 0.0, 1.0);
  // the edge: a thin shade just inside the outline (so white glass reads on white keys), then the liquid rim
  float band = smoothstep(0.18, 0.5, fres) * (1.0 - smoothstep(0.55, 0.9, fres));
  col *= 1.0 - edge * band;
  col = mix(col, vec3(1.0), rim * smoothstep(0.62, 0.98, fres));
  // the highlights: a sharp glint and a broad sheen
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  col += spec * (0.35 * pow(nh, 36.0) + 0.1 * pow(nh, 6.0));
  // the fog: thinning toward the wrist, and gone before the frame's bottom edge (no cut-off arms)
  float a = opacity * vFade * smoothstep(0.0, fogPx, gl_FragCoord.y - fogFrom);
  gl_FragColor = vec4(col * a, a);
}`;

export function ghostMaterial(o: Partial<GhostLook> = {}) {
  const look = { ...GHOST, ...o };
  const m = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      under: { value: null }, underBlur: { value: null }, shade: { value: null }, shadeK: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, pxPerMm: { value: 4 },
      camPos: { value: new THREE.Vector3() },
      refract: { value: look.refract }, milk: { value: look.milk }, rim: { value: look.rim }, spec: { value: look.spec }, edge: { value: look.edge }, opacity: { value: look.opacity },
      fogPx: { value: 150 }, fogFrom: { value: 0 },
    },
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
  });
  return Object.assign(m, { look });
}

/** the hands' depth only (drawn first, so the glass shows just its nearest surface) */
export function depthMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }', colorWrite: false, depthWrite: true });
}
