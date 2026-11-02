// render-canvas.js — a laid-out page -> pixels, with ink as a density field (the live renderer).
//
//   const stats = renderCanvas(canvas, p, page, { width: 720, emPx: 58, paper: 'ruled' });
//
// How it works (docs/research/human-feel.md §3.3, option 3):
//  1. Every stroke's profile (pen.js: centerline + width + ink density per point, with pools, hooks,
//     flying exits, skips...) becomes a chain of short segments, each drawn as a round capsule (or a
//     broad-nib parallelogram) in device pixels.
//  2. Strokes go into *layers*. Inside a layer, overlapping segments of one pen-down (and strokes that
//     continue each other: corners, script joins) merge with MAX blending: ink is laid once, not twice.
//     Strokes that cross each other go to different layers, which are *added*: crossings darken.
//  3. Each layer is resolved into ink density with the pen's cross-profile (fountain edge rings,
//     ballpoint striations, dip-pen railroading, felt bleed, pencil grain), then summed.
//  4. Final pass: colour = paper · (F + (1−F)·exp(−k·density)) per channel in linear light
//     (Beer–Lambert, k from the ink swatch), with paper grain that shows through light ink only.
//
// WebGL2 + EXT_color_buffer_float, in ONE shared offscreen context; the result is copied into the
// caller's canvas with a 2D drawImage, so any number of canvases can render (no context limit).
// Without WebGL2 it falls back to flat Beer–Lambert fills in Canvas 2D.
// Browser only (nothing runs at import time, so Node can still import the engine).
// Deterministic: no Math.random; GPU noise is a hash of the pixel position.

import { UPM } from './hand.js';
import { getPen, strokeInk, inkModel, inkWalker, inkRGB, rgbHex, srgbToLin, parseColor, penWidthUnits, continuesStroke, PEN_KIND } from './pen.js';

// Paper presets. Colours are sRGB. `lines` draws printed rules under the ink (ink multiplies over them).
export const PAPERS = {
  plain: { label: 'Plain', color: [252, 250, 245], grain: 1 },
  ruled: { label: 'Ruled', color: [252, 250, 245], grain: 1, lines: { kind: 'ruled', color: [176, 198, 226], margin: 0, marginColor: [226, 150, 150] } },
  grid: { label: 'Grid', color: [252, 251, 247], grain: 1, lines: { kind: 'grid', color: [190, 208, 222], spacing: 20 } },
  cream: { label: 'Cream laid', color: [246, 240, 226], grain: 1.4 },
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const FPI = 14; // floats per segment instance

// ---------------------------------------------------------------------------------------------
// shaders
// ---------------------------------------------------------------------------------------------
const NOISE = `
uint hash2(uvec2 v){ v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; return v.x ^ v.y; }
float h21(vec2 p){ return float(hash2(uvec2(ivec2(floor(p)) + 65536))) * (1.0 / 4294967295.0); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
// paper tooth: fibres slightly stretched along x; ~[0,1], mean 0.5
float grain(vec2 p){ vec2 q = p * vec2(0.62, 0.9);
  return 0.5 * vnoise(q) + 0.3 * vnoise(q * 2.3 + 17.0) + 0.2 * vnoise(q * 5.1 + 41.0); }
`;

const SEG_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aSeg;   // x0 y0 x1 y1   (device px, y down)
layout(location=2) in vec4 aRD;    // r0 r1 d0 d1   (half width px, density)
layout(location=3) in vec4 aSA;    // s0 s1 a0 a1   (arclength px, pen aux)
layout(location=4) in vec2 aSeed;  // per-stroke noise seed, ink shade (0..1)
uniform vec2 uView; uniform float uPad; uniform int uShape; uniform vec2 uNib;
out vec2 vP; flat out vec4 vSeg; flat out vec4 vRD; flat out vec4 vSA; flat out vec2 vSeed;
void main(){
  vec2 a = aSeg.xy, b = aSeg.zw, ab = b - a; float L = length(ab);
  vec2 t = L > 1e-4 ? ab / L : vec2(1.0, 0.0), n = vec2(-t.y, t.x);
  float R = max(aRD.x, aRD.y) + uPad;
  vec2 pos;
  if (uShape == 0) pos = mix(a - t * R, b + t * R, aCorner.x * 0.5 + 0.5) + n * (aCorner.y * R);
  else { vec2 e = abs(uNib); vec2 lo = min(a, b) - e - vec2(R), hi = max(a, b) + e + vec2(R); pos = mix(lo, hi, aCorner * 0.5 + 0.5); }
  vP = pos; vSeg = aSeg; vRD = aRD; vSA = aSA; vSeed = aSeed;
  vec2 c = pos / uView * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const SEG_FS = `#version 300 es
precision highp float; precision highp int;
in vec2 vP; flat in vec4 vSeg; flat in vec4 vRD; flat in vec4 vSA; flat in vec2 vSeed;
uniform float uPad; uniform int uShape; uniform vec2 uNib; uniform int uKind;
layout(location=0) out vec4 o;
layout(location=1) out vec4 o2;   // the stroke's place in the ink's colour family
${NOISE}
float cross2(vec2 a, vec2 b){ return a.x * b.y - a.y * b.x; }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
float sdQuad(vec2 p, vec2 A, vec2 B, vec2 C, vec2 D){
  float d = min(min(sdSeg(p, A, B), sdSeg(p, B, C)), min(sdSeg(p, C, D), sdSeg(p, D, A)));
  float c1 = cross2(B - A, p - A), c2 = cross2(C - B, p - B), c3 = cross2(D - C, p - C), c4 = cross2(A - D, p - D);
  bool inside = (c1 >= 0.0 && c2 >= 0.0 && c3 >= 0.0 && c4 >= 0.0) || (c1 <= 0.0 && c2 <= 0.0 && c3 <= 0.0 && c4 <= 0.0);
  return inside ? -d : d;
}
void main(){
  vec2 a = vSeg.xy, b = vSeg.zw, ba = b - a; float L2 = max(dot(ba, ba), 1e-6);
  float hr = dot(vP - a, ba) / L2, h = clamp(hr, 0.0, 1.0);
  float r = mix(vRD.x, vRD.y, h), d = mix(vRD.z, vRD.w, h), aux0 = mix(vSA.z, vSA.w, h);
  float dist = length(vP - (a + ba * h));
  float sdf, hw;
  if (uShape == 0) { sdf = dist - r; hw = r; }
  else {
    vec2 e = uNib * 0.5 * clamp(aux0, 0.0, 1.0);
    sdf = sdQuad(vP, a - e, b - e, b + e, a + e) - r;
    vec2 tn = ba / sqrt(L2);
    hw = abs(cross2(tn, e)) + r;
  }
  if (sdf > uPad) discard;
  float s = mix(vSA.x, vSA.y, h), aux = mix(vSA.z, vSA.w, h);
  float tex = -1.0;
  if (uKind == 4) tex = aux;                                  // dip pen: railroading
  else if ((uKind == 1 || uKind == 7) && hr > -0.02 && hr < 1.02) {
    float u = sign(cross2(ba, vP - a)) * dist / max(r, 0.35); // across the stroke, -1..1
    float rr = max(r, 0.6);
    float sd = vSeed.x;
    if (uKind == 1) tex = 0.6 * vnoise(vec2(u * 6.0 + sd * 7.31, s / (rr * 9.0) + sd * 3.1))
                        + 0.4 * vnoise(vec2(u * 13.0 + sd * 1.7, s / (rr * 4.0) + 11.0));  // ballpoint striations
    else tex = vnoise(vec2(u * 4.0 + sd * 5.3, s / (rr * 1.6)));                         // pencil drag
  }
  o = vec4(hw, d, -sdf, tex);
  o2 = vec4(vSeed.y, 0.0, 0.0, 1.0);
}`;

const FULL_VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const RESOLVE_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uLayer; uniform sampler2D uShade; uniform vec3 uKA, uKB;
uniform int uKind; uniform float uH, uDpr, uGrainPx, uRough, uBleed, uPress, uRing, uRingPool;
layout(location=0) out vec4 o;
${NOISE}
void main(){
  vec4 L = texelFetch(uLayer, ivec2(gl_FragCoord.xy), 0);
  float depth = L.z;
  if (depth < -500.0) discard;
  float hw = max(L.x, 0.05), d = max(L.y, 0.0), tex = L.w;
  vec2 pc = vec2(gl_FragCoord.x, uH - gl_FragCoord.y) / uDpr;   // CSS px, y down
  vec2 pg = pc / uGrainPx;
  float rough = min(uRough * uDpr, 0.2 * hw);                 // edges move ≤ 10% of the width
  depth += rough * (vnoise(pg * 1.7 + 5.3) * 2.0 - 1.0);
  float cov = clamp(depth + 0.5, 0.0, 1.0);
  float e = clamp(1.0 - depth / hw, 0.0, 1.0);                // 0 centre .. 1 edge
  float k = 1.0;
  if (uKind == 2 || uKind == 3 || uKind == 4 || uKind == 5) {   // liquid ink dries darker at the rim
    float ring = uRing + uRingPool * clamp(d - 1.0, 0.0, 1.0);
    k *= 1.0 + ring * smoothstep(0.5, 0.95, e);
  }
  if (uKind == 4) k *= 1.0 - 0.5 * clamp(tex, 0.0, 1.0) * (1.0 - smoothstep(0.3, 0.8, e));
  if (uKind == 1) {
    k *= 1.0 + 0.08 * smoothstep(0.65, 1.0, e);                // paste gathers at the edges
    if (tex >= 0.0) {                                           // fine light streaks, more where the line is thin
      float thr = 0.36 - 0.22 * clamp(d, 0.0, 1.4) + 0.1 * (1.0 - uPress);
      k *= 1.0 - 0.5 * (1.0 - smoothstep(thr - 0.06, thr + 0.06, tex));
    }
    // a skip: the ball stops rolling and the line breaks up along the paper's tooth (dots of full ink)
    float starve = 1.0 - smoothstep(0.3, 0.75, d);
    if (starve > 0.0) {
      float g = grain(pg * 1.7 + 3.0);
      k *= mix(1.0, smoothstep(0.62 - 0.45 * d, 0.72 - 0.45 * d, g), starve);
      d = mix(d, 0.85, starve * 0.75);
    }
  }
  if (uKind == 6) {                                             // felt: soft bleed into the fibres
    float bl = uBleed * uDpr + 0.5;
    float fe = (vnoise(pg * 1.1 + 9.1) - 0.5) * bl * 0.6;
    cov = smoothstep(-bl, bl * 0.7, depth + fe);
    k *= 1.0 - 0.15 * e * e;
  }
  if (uKind == 7) {                                             // graphite catches the paper's peaks first
    float g = grain(pg * 1.3);
    float lv = clamp(d, 0.0, 1.3);
    float dep = smoothstep(1.0 - lv - 0.3, 1.0 - lv + 0.15, g);
    k *= mix(0.3, 1.0, dep) * (0.86 + 0.28 * (tex >= 0.0 ? tex : 0.5));
    k *= 1.0 - 0.3 * smoothstep(0.55, 1.0, e);
  }
  // optical density per channel: this stroke's density × its own absorption (its shade of the ink)
  float sh = texelFetch(uShade, ivec2(gl_FragCoord.xy), 0).r;
  o = vec4(cov * d * k * mix(uKA, uKB, sh), 0.0);
}`;

const FINAL_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uAccum; uniform sampler2D uTex;
uniform ivec2 uOrigin; uniform float uH, uDpr, uGrainPx;
uniform vec3 uPaper, uK; uniform float uFloor, uFade, uGrainPaper, uGrainInk; uniform int uKind;  // uK: mid-family absorption
uniform int uLines; uniform vec2 uLineStep, uLineOff; uniform vec3 uLineCol, uMarginCol; uniform float uMarginX;
uniform int uTexOn; uniform vec2 uTexSize; uniform int uTransparent;
layout(location=0) out vec4 o;
${NOISE}
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 v){ v = clamp(v, 0.0, 1.0); return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v)); }
float rule(float x, float step0, float off, float dpr){
  if (step0 <= 0.0) return 0.0;
  float dd = abs(x - (off + step0 * floor((x - off) / step0 + 0.5))) * dpr;
  return clamp(0.5 * dpr + 0.5 - dd, 0.0, 1.0);
}
void main(){
  ivec2 ip = ivec2(gl_FragCoord.xy) - uOrigin;
  vec3 OD = max(texelFetch(uAccum, ip, 0).rgb, vec3(0.0));     // optical density per channel
  float D = dot(OD, vec3(1.0)) / max(dot(uK, vec3(1.0)), 1e-4); // ≈ ink density
  vec2 pc = vec2(float(ip.x) + 0.5, uH - float(ip.y) - 0.5) / uDpr;
  float g = grain(pc / uGrainPx);
  float f = 1.0 - uGrainInk * (1.0 - g) * 2.0 * (1.0 - smoothstep(0.12, 0.9, D)); // grain shows through light ink only
  if (uKind == 7) f *= D > 1e-4 ? 1.6 * (1.0 - exp(-D * f / 1.6)) / (D * f) : 1.0; // graphite saturates
  D *= f * uFade;
  vec3 T = uFloor + (1.0 - uFloor) * exp(-OD * f * uFade);
  vec3 paper = vec3(1.0);
  if (uTransparent == 0) {
    paper = uPaper;
    if (uTexOn == 1) paper = toLin(texture(uTex, pc / uTexSize).rgb);
    paper *= 1.0 + uGrainPaper * (g - 0.5) * (0.35 + 0.65 * exp(-1.5 * D));
    float ln = 0.0;
    if (uLines == 1 || uLines == 2) ln = rule(pc.y, uLineStep.y, uLineOff.y, uDpr);
    if (uLines == 2) ln = max(ln, rule(pc.x, uLineStep.x, uLineOff.x, uDpr));
    paper *= mix(vec3(1.0), uLineCol, ln * 0.9);
    if (uMarginX > 0.0) paper *= mix(vec3(1.0), uMarginCol, clamp(0.5 * uDpr + 0.5 - abs(pc.x - uMarginX) * uDpr, 0.0, 1.0) * 0.9);
  }
  vec3 c = toSrgb(paper * T);
  c += (h21(gl_FragCoord.xy * 1.37 + 3.1) - 0.5) / 255.0;                    // dither: no banding in light washes
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------------------------------------
// the shared GL context
// ---------------------------------------------------------------------------------------------
let GPU = null;     // { gl, canvas, ... } once created
let GPU_FAILED = false;

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    return sh;
  };
  const pr = gl.createProgram();
  gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(pr));
  const u = {};
  const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(pr, i); u[info.name] = gl.getUniformLocation(pr, info.name); }
  return { pr, u };
}

function gpu() {
  if (GPU) return GPU;
  if (GPU_FAILED || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) { GPU_FAILED = true; return null; }
    const G = { gl, canvas, texW: 0, texH: 0, inst: null, instCap: 0 };
    G.seg = compile(gl, SEG_VS, SEG_FS);
    G.resolve = compile(gl, FULL_VS, RESOLVE_FS);
    G.final = compile(gl, FULL_VS, FINAL_FS);
    G.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    // unit quad for the instanced segments
    G.vao = gl.createVertexArray();
    gl.bindVertexArray(G.vao);
    const corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    G.ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, G.ibuf);
    for (let l = 1; l <= 4; l++) { gl.enableVertexAttribArray(l); gl.vertexAttribDivisor(l, 1); }
    G.emptyVao = gl.createVertexArray();
    gl.bindVertexArray(null);
    G.layerTex = gl.createTexture(); G.shadeTex = gl.createTexture(); G.accumTex = gl.createTexture(); G.paperTex = gl.createTexture();
    G.layerFbo = gl.createFramebuffer(); G.accumFbo = gl.createFramebuffer();
    G.paperSrc = null;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); GPU = null; });
    GPU = G;
    return G;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[seedhand] WebGL2 ink renderer unavailable, using flat fills:', e.message);
    GPU_FAILED = true;
    return null;
  }
}

function ensureTargets(G, w, h) {
  const gl = G.gl;
  if (G.canvas.width < w || G.canvas.height < h) {
    G.canvas.width = Math.max(G.canvas.width, w); G.canvas.height = Math.max(G.canvas.height, h);
  }
  if (G.texW >= w && G.texH >= h) return;
  G.texW = Math.max(G.texW, w); G.texH = Math.max(G.texH, h);
  for (const [tex, fbo] of [[G.layerTex, G.layerFbo], [G.accumTex, G.accumFbo]]) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, G.texW, G.texH, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }
  // the layer's second target: each stroke's shade (8 bits is plenty), MAX-blended like the rest
  gl.bindTexture(gl.TEXTURE_2D, G.shadeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, G.texW, G.texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.layerFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, G.shadeTex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ---------------------------------------------------------------------------------------------
// geometry: profiles -> segment instances, sorted into layers
// ---------------------------------------------------------------------------------------------
const MAX_LAYERS = 10;
const CELL = 32; // px, spatial hash for layer conflicts

class Layers {
  constructor() { this.L = []; }
  reset() { for (const l of this.L) { l.n = 0; l.grid.clear(); l.x0 = l.y0 = Infinity; l.x1 = l.y1 = -Infinity; } this.used = 0; }
  layer(i) {
    while (this.L.length <= i) this.L.push({ data: new Float32Array(FPI * 4096), n: 0, grid: new Map(), x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    return this.L[i];
  }
  conflict(i, b, chain) {
    const l = this.layer(i);
    const cx0 = Math.floor(b[0] / CELL), cy0 = Math.floor(b[1] / CELL), cx1 = Math.floor(b[2] / CELL), cy1 = Math.floor(b[3] / CELL);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const list = l.grid.get(cx + cy * 65536);
      if (!list) continue;
      for (const e of list) if (e.chain !== chain && e.b[0] < b[2] && e.b[2] > b[0] && e.b[1] < b[3] && e.b[3] > b[1]) return true;
    }
    return false;
  }
  pick(b, chain, prefer) {
    if (prefer >= 0 && !this.conflict(prefer, b, chain)) return prefer;
    for (let i = 0; i < MAX_LAYERS; i++) if (i !== prefer && !this.conflict(i, b, chain)) return i;
    return MAX_LAYERS - 1;
  }
  add(i, b, chain, seg, count) {
    const l = this.layer(i);
    const e = { b, chain };
    const cx0 = Math.floor(b[0] / CELL), cy0 = Math.floor(b[1] / CELL), cx1 = Math.floor(b[2] / CELL), cy1 = Math.floor(b[3] / CELL);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cx + cy * 65536;
      const list = l.grid.get(key);
      if (list) list.push(e); else l.grid.set(key, [e]);
    }
    const need = (l.n + count) * FPI;
    if (need > l.data.length) { const nd = new Float32Array(Math.max(need, l.data.length * 2)); nd.set(l.data.subarray(0, l.n * FPI)); l.data = nd; }
    l.data.set(seg.subarray(0, count * FPI), l.n * FPI);
    l.n += count;
    if (b[0] < l.x0) l.x0 = b[0]; if (b[1] < l.y0) l.y0 = b[1]; if (b[2] > l.x1) l.x1 = b[2]; if (b[3] > l.y1) l.y1 = b[3];
    if (i + 1 > this.used) this.used = i + 1;
  }
}
const LAYERS = new Layers();
let SCR = new Float32Array(FPI * 1024); // one stroke's segments

function buildGeometry(p, page, pen, k, opts, pad) {
  const walk = inkWalker(p);
  const kind = pen.kind;
  // which profile points become segment ends: at least minSeg apart; on straight, even runs up to
  // maxSeg apart (a point is kept early when the direction turns > ~5° or width/ink change)
  const minSeg = opts.minSegment || 1.4, maxSeg = 6, minSeg2 = minSeg * minSeg, maxSeg2 = maxSeg * maxSeg;
  const poolAmp = (pen.pool || 0) * 1.5;
  const nib = pen.shape === 'nib';
  LAYERS.reset();
  let prevInk = null, prev = null, chain = 0, strokes = 0, segs = 0;
  for (const it of page.items) {
    if (it.kind !== 'glyph' || !it.g) { prev = null; continue; }
    const wordStart = it.inkIndex !== prevInk;
    prevInk = it.inkIndex;
    const ox = it.x * k, oy = it.y * k;
    const sts = it.g.strokes;
    for (let si = 0; si < sts.length; si++) {
      const pr = strokeInk(p, sts[si]);
      if (!pr || pr.n < 2) continue;
      const frac = opts.reveal ? opts.reveal(it, si) : 1;
      if (!(frac > 0)) { prev = null; continue; }
      const n = pr.n, X = pr.x, Y = pr.y, Wd = pr.w, Dn = pr.d, Sx = pr.s, Tt = pr.t, Ax = pr.aux, Hr = pr.hair;
      let wsum = 0; for (let i = 0; i < n; i++) wsum += Wd[i];
      const ink = walk({ item: it, strokeIndex: si, wordStart, len: pr.len, width: wsum / n, dot: pr.dot });
      const seed = ((it.charIndex * 7 + si * 13) % 997) / 997 * 61.7;
      const shade = ink.shade == null ? 0.5 : ink.shade;
      const w0 = Wd[0];
      // the points we keep, in device px
      if (SCR.length < (n + 2) * FPI) SCR = new Float32Array((n + 2) * FPI * 2);
      let cnt = 0;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      let lx = 0, ly = 0, lr = 0, ld = 0, ls = 0, la = 0, have = false;
      const emit = (x, y, r, d, s, a) => {
        if (have) {
          const o = cnt * FPI;
          SCR[o] = lx; SCR[o + 1] = ly; SCR[o + 2] = x; SCR[o + 3] = y;
          SCR[o + 4] = lr; SCR[o + 5] = r; SCR[o + 6] = ld; SCR[o + 7] = d;
          SCR[o + 8] = ls; SCR[o + 9] = s; SCR[o + 10] = la; SCR[o + 11] = a; SCR[o + 12] = seed; SCR[o + 13] = shade;
          cnt++;
        }
        const R = r + pad;
        if (x - R < bx0) bx0 = x - R; if (y - R < by0) by0 = y - R; if (x + R > bx1) bx1 = x + R; if (y + R > by1) by1 = y + R;
        lx = x; ly = y; lr = r; ld = d; ls = s; la = a; have = true;
      };
      let vd = 0, va = 0;
      const val = (i) => { // density and aux at point i, with this stroke's ink supply applied
        let d = Dn[i] * ink.mul;
        if (ink.wet && poolAmp) { const q = Sx[i] / (0.6 * w0); d += ink.wet * poolAmp * Math.exp(-q * q); }
        let a = Ax[i];
        if (ink.starve) {
          if (kind === PEN_KIND.pointed && Hr) { d *= 1 - 0.45 * ink.starve * Hr[i]; a = Math.min(1, a + 0.45 * ink.starve * (1 - Hr[i])); }
          else if (kind === PEN_KIND.ballpoint) d *= 1 - 0.3 * ink.starve;
        }
        vd = d; va = a;
      };
      const rad = nib ? (i) => pr.wHair * k / 2 : (i) => Wd[i] * k / 2;
      let pkx = 0, pky = 0, pk = 0;
      const TX = pr.tx, TY = pr.ty;
      for (let i = 0; i < n; i++) {
        let x = ox + X[i] * k, y = oy - Y[i] * k;
        let t = Tt[i];
        if (frac < 1 && t > frac) {
          // partial stroke (write-on animation): stop between i-1 and i
          const t0 = Tt[i - 1], u = t > t0 ? (frac - t0) / (t - t0) : 0;
          const xa = ox + X[i - 1] * k, ya = oy - Y[i - 1] * k;
          val(i - 1); const da = vd, aa = va; val(i);
          emit(xa + (x - xa) * u, ya + (y - ya) * u, rad(i - 1) + (rad(i) - rad(i - 1)) * u, da + (vd - da) * u, (Sx[i - 1] + (Sx[i] - Sx[i - 1]) * u) * k, aa + (va - aa) * u);
          break;
        }
        if (i > 0 && i < n - 1) {
          const ddx = x - pkx, ddy = y - pky, d2 = ddx * ddx + ddy * ddy;
          if (d2 < minSeg2) continue;
          if (d2 < maxSeg2 && TX[i] * TX[pk] + TY[i] * TY[pk] > 0.996 &&
            Math.abs(Wd[i] - Wd[pk]) < 0.08 * Wd[pk] && Math.abs(Dn[i] - Dn[pk]) < 0.06 && Math.abs(Ax[i] - Ax[pk]) < 0.1) continue;
        }
        val(i);
        emit(x, y, rad(i), vd, Sx[i] * k, va);
        pkx = x; pky = y; pk = i;
      }
      if (cnt === 0 && have) { // a single kept point: draw it as a zero-length segment
        const o = 0; SCR[o] = lx; SCR[o + 1] = ly; SCR[o + 2] = lx; SCR[o + 3] = ly; SCR[o + 4] = lr; SCR[o + 5] = lr;
        SCR[o + 6] = ld; SCR[o + 7] = ld; SCR[o + 8] = ls; SCR[o + 9] = ls; SCR[o + 10] = la; SCR[o + 11] = la; SCR[o + 12] = seed; SCR[o + 13] = shade; cnt = 1;
      }
      if (!cnt) continue;
      // does this stroke continue the previous one (corner piece, retrace, script join)? then same chain
      if (!(prev && continuesStroke(prev.pr, prev.ix, prev.iy, pr, it.x, it.y))) chain++;
      const b = [bx0, by0, bx1, by1];
      const L = LAYERS.pick(b, chain, prev && prev.chain === chain ? prev.layer : -1);
      LAYERS.add(L, b, chain, SCR, cnt);
      prev = { pr, ix: it.x, iy: it.y, chain, layer: L };
      strokes++; segs += cnt;
    }
  }
  return { strokes, segs, layers: LAYERS.used };
}

// ---------------------------------------------------------------------------------------------
// paper
// ---------------------------------------------------------------------------------------------
function resolvePaper(opt, page, sc, emPx) {
  let P = typeof opt === 'string' ? PAPERS[opt] || PAPERS.plain : opt || PAPERS.plain;
  if (P.preset && PAPERS[P.preset]) P = Object.assign({}, PAPERS[P.preset], P);
  const color = parseColor(P.color) || PAPERS.plain.color;
  const lines = P.lines || null;
  const lh = (page.lineHeight || 1.6 * UPM) * sc;
  const out = {
    transparent: !!P.transparent,
    lin: color.map(srgbToLin), rgb: color,
    grain: P.grain == null ? 1 : +P.grain,
    texture: P.texture || null, textureScale: P.textureScale || 1,
    lines: 0, step: [0, 0], off: [0, 0], lineLin: [1, 1, 1], marginX: 0, marginLin: [1, 1, 1],
  };
  if (lines && (lines.kind === 'ruled' || lines.kind === 'grid')) {
    const lc = parseColor(lines.color) || [176, 198, 226];
    out.lineLin = lc.map((c, i) => srgbToLin(c) / Math.max(1e-3, out.lin[i]));
    if (lines.kind === 'ruled') {
      out.lines = 1;
      out.step = [0, lines.spacing || lh];
      out.off = [0, lines.offset != null ? lines.offset : (page.firstBaseline != null ? page.firstBaseline : 0.95 * UPM) * sc];
    } else {
      out.lines = 2;
      const g = lines.spacing || Math.max(8, Math.round(emPx * 0.33));
      out.step = [g, g];
      out.off = lines.offset != null ? [lines.offset, lines.offset] : [0, 0];
    }
    if (lines.margin) {
      out.marginX = lines.margin;
      const mc = parseColor(lines.marginColor) || [226, 150, 150];
      out.marginLin = mc.map((c, i) => srgbToLin(c) / Math.max(1e-3, out.lin[i]));
    }
  }
  return out;
}

function uploadPaperTexture(G, src) {
  const gl = G.gl;
  gl.bindTexture(gl.TEXTURE_2D, G.paperTex);
  if (G.paperSrc !== src) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    G.paperSrc = src;
  }
}

// ---------------------------------------------------------------------------------------------
// public: renderCanvas
// ---------------------------------------------------------------------------------------------
// canvas: an HTMLCanvasElement (or OffscreenCanvas) used only with renderCanvas (it takes a '2d' context).
// p: hand params; page: result of layout().
// opts: {
//   width: CSS px (required), emPx: px per em (required), height?: CSS px (default from the page),
//   dpr?: device pixel ratio (default window.devicePixelRatio),
//   ink?: swatch key | '#rrggbb' | [r,g,b]   (default: p.ink, or the hand's own ink),
//   paper?: 'plain' | 'ruled' | 'grid' | 'cream' | { color, grain, texture, textureScale,
//           lines: { kind: 'ruled'|'grid', spacing, offset, color, margin, marginColor }, transparent },
//   reveal?: (item, strokeIndex) => 0..1   (write-on: how much of each stroke, by pen time),
//   style?: false to leave canvas.style alone }
// Returns { ms, geometryMs, gpuMs, strokes, segments, layers, width, height, dpr, pen, ink, misses, fallback }
export function renderCanvas(canvas, p, page, opts = {}) {
  const t0 = now();
  const emPx = opts.emPx;
  const sc = emPx / UPM;
  const W = Math.max(1, Math.round(opts.width));
  const H = Math.max(1, Math.ceil(opts.height || page.height * sc));
  let dpr = opts.dpr || (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1;
  const G = gpu();
  if (G) dpr = Math.min(dpr, G.maxTex / Math.max(W, H));
  const pw = Math.max(1, Math.round(W * dpr)), ph = Math.max(1, Math.round(H * dpr));
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  if (canvas.style && opts.style !== false) {
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  const pen = getPen(p);
  const ink = inkModel(p, opts.ink) || inkModel(p);
  const paper = resolvePaper(opts.paper, page, sc, emPx);
  if (canvas.style && opts.style !== false) canvas.style.mixBlendMode = paper.transparent ? 'multiply' : '';
  const ctx = canvas.getContext('2d');
  const stats = { pen: pen.key, ink: ink.key, width: pw, height: ph, dpr, misses: [] };

  if (!G) {
    fallback2D(ctx, p, page, pen, ink, paper, sc * dpr);
    stats.fallback = true;
  } else {
    const gl = G.gl;
    const k = sc * dpr;
    const rough = paper.transparent ? 0 : (pen.rough || 0) * (0.6 + 0.4 * paper.grain);
    const bleed = pen.bleed || 0;
    const pad = 0.75 + rough * dpr + bleed * dpr * 1.2;
    const geo = buildGeometry(p, page, pen, k, opts, pad);
    const t1 = now();
    stats.geometryMs = t1 - t0;
    ensureTargets(G, pw, ph);
    // upload all layers back to back
    let total = 0;
    for (let i = 0; i < LAYERS.used; i++) total += LAYERS.L[i].n;
    if (G.instCap < total * FPI) { G.instCap = Math.max(total * FPI, G.instCap * 2, FPI * 8192); G.inst = new Float32Array(G.instCap); }
    let off = 0;
    const starts = [];
    for (let i = 0; i < LAYERS.used; i++) { const l = LAYERS.L[i]; starts.push(off); G.inst.set(l.data.subarray(0, l.n * FPI), off * FPI); off += l.n; }
    gl.bindBuffer(gl.ARRAY_BUFFER, G.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, G.inst, gl.DYNAMIC_DRAW, 0, Math.max(FPI, total * FPI));

    const grainPx = Math.min(2.5, Math.max(0.75, emPx / 58));
    // clear the accumulator
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.accumFbo);
    gl.viewport(0, 0, pw, ph);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.enable(gl.BLEND);
    for (let li = 0; li < LAYERS.used; li++) {
      const l = LAYERS.L[li];
      if (!l.n) continue;
      // scissor to this layer's ink (GL rows count from the bottom)
      const sx = Math.max(0, Math.floor(l.x0) - 2), sy = Math.max(0, Math.floor(l.y0) - 2);
      const ex = Math.min(pw, Math.ceil(l.x1) + 2), ey = Math.min(ph, Math.ceil(l.y1) + 2);
      if (ex <= sx || ey <= sy) continue;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(sx, ph - ey, ex - sx, ey - sy);
      // 1. segments -> layer (MAX: one pen-down lays its ink once)
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.layerFbo);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, -1000, -1]);
      gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
      gl.blendEquation(gl.MAX);
      gl.useProgram(G.seg.pr);
      const u = G.seg.u;
      gl.uniform2f(u.uView, pw, ph);
      gl.uniform1f(u.uPad, pad);
      gl.uniform1i(u.uShape, pen.shape === 'nib' ? 1 : 0);
      const nibW = penWidthUnits(p) * k, na = (p.nibAngle == null ? 35 : p.nibAngle) * Math.PI / 180;
      gl.uniform2f(u.uNib, Math.cos(na) * nibW, -Math.sin(na) * nibW); // y down
      gl.uniform1i(u.uKind, pen.kind);
      gl.bindVertexArray(G.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.ibuf);
      const stride = FPI * 4, base = starts[li] * stride;
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, base);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, base + 16);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, base + 32);
      gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, base + 48);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, l.n);
      // 2. layer -> ink density, added into the accumulator (crossings darken)
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.accumFbo);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(G.resolve.pr);
      const r = G.resolve.u;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.shadeTex);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.layerTex);
      gl.uniform1i(r.uLayer, 0); gl.uniform1i(r.uShade, 1);
      gl.uniform3fv(r.uKA, ink.kA); gl.uniform3fv(r.uKB, ink.kB);
      gl.uniform1i(r.uKind, pen.kind);
      gl.uniform1f(r.uH, ph); gl.uniform1f(r.uDpr, dpr); gl.uniform1f(r.uGrainPx, grainPx);
      gl.uniform1f(r.uRough, rough); gl.uniform1f(r.uBleed, bleed);
      gl.uniform1f(r.uPress, Math.min(1, Math.max(0, p.pressure)));
      gl.uniform1f(r.uRing, { 2: 0.03, 3: 0.14, 4: 0.08, 5: 0.1 }[pen.kind] || 0);
      gl.uniform1f(r.uRingPool, { 2: 0.1, 3: 0.4, 4: 0.25, 5: 0.25 }[pen.kind] || 0);
      gl.bindVertexArray(G.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    // 3. density -> colour (Beer–Lambert) over paper
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const oy = G.canvas.height - ph;
    gl.viewport(0, oy, pw, ph);
    gl.useProgram(G.final.pr);
    const f = G.final.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.accumTex);
    gl.uniform1i(f.uAccum, 0);
    gl.uniform2i(f.uOrigin, 0, oy);
    gl.uniform1f(f.uH, ph); gl.uniform1f(f.uDpr, dpr); gl.uniform1f(f.uGrainPx, grainPx);
    gl.uniform3fv(f.uPaper, paper.lin);
    gl.uniform3fv(f.uK, ink.k);
    gl.uniform1f(f.uFloor, ink.floor); gl.uniform1f(f.uFade, ink.fade);
    gl.uniform1f(f.uGrainPaper, paper.transparent ? 0 : 0.055 * paper.grain);
    gl.uniform1f(f.uGrainInk, paper.transparent ? 0 : 0.1 * paper.grain);
    gl.uniform1i(f.uKind, pen.kind);
    gl.uniform1i(f.uLines, paper.lines);
    gl.uniform2f(f.uLineStep, paper.step[0], paper.step[1]);
    gl.uniform2f(f.uLineOff, paper.off[0], paper.off[1]);
    gl.uniform3fv(f.uLineCol, paper.lineLin);
    gl.uniform3fv(f.uMarginCol, paper.marginLin);
    gl.uniform1f(f.uMarginX, paper.marginX);
    gl.uniform1i(f.uTransparent, paper.transparent ? 1 : 0);
    if (paper.texture) {
      gl.activeTexture(gl.TEXTURE1);
      uploadPaperTexture(G, paper.texture);
      gl.uniform1i(f.uTex, 1); gl.uniform1i(f.uTexOn, 1);
      gl.uniform2f(f.uTexSize, (paper.texture.width || 256) * paper.textureScale, (paper.texture.height || 256) * paper.textureScale);
      gl.activeTexture(gl.TEXTURE0);
    } else gl.uniform1i(f.uTexOn, 0);
    gl.bindVertexArray(G.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(G.canvas, 0, 0, pw, ph, 0, 0, pw, ph);
    ctx.restore();
    stats.gpuMs = now() - t1;
    Object.assign(stats, { strokes: geo.strokes, segments: geo.segs, layers: geo.layers });
  }
  // characters this hand can't write yet: a pencil placeholder (as in renderSVG)
  const misses = page.items.filter((it) => it.kind === 'miss');
  if (misses.length) {
    ctx.save();
    ctx.fillStyle = 'rgba(165,159,146,0.75)';
    ctx.textAlign = 'center';
    ctx.font = `italic ${(0.62 * emPx * dpr).toFixed(1)}px "Segoe Print","Bradley Hand","Comic Sans MS",cursive`;
    for (const it of misses) {
      const x = (it.x + 280) * sc, y = it.y * sc;
      ctx.fillText(it.ch, x * dpr, y * dpr);
      stats.misses.push({ ch: it.ch, x, y, size: 0.62 * emPx });
    }
    ctx.restore();
  }
  stats.ms = now() - t0;
  return stats;
}

// Canvas 2D fallback: paper + every stroke filled flat with its Beer–Lambert colour.
function fallback2D(ctx, p, page, pen, ink, paper, k) {
  const c = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (paper.transparent) ctx.clearRect(0, 0, c.width, c.height);
  else { ctx.fillStyle = rgbHex(paper.rgb); ctx.fillRect(0, 0, c.width, c.height); }
  ctx.globalCompositeOperation = 'multiply';
  const walk = inkWalker(p);
  let prevInk = null;
  for (const it of page.items) {
    if (it.kind !== 'glyph') continue;
    const wordStart = it.inkIndex !== prevInk; prevInk = it.inkIndex;
    it.g.strokes.forEach((st, si) => {
      const pr = strokeInk(p, st);
      if (!pr) return;
      let dm = 0; for (let i = 0; i < pr.n; i++) dm += pr.d[i]; dm /= pr.n;
      const s = walk({ item: it, strokeIndex: si, wordStart, len: pr.len, width: pr.w[pr.n >> 1], dot: pr.dot });
      ctx.fillStyle = rgbHex(inkRGB(ink, dm * s.mul, [255, 255, 255], s.shade));
      ctx.beginPath();
      const poly = st.contour;
      ctx.moveTo((it.x + poly[0][0]) * k, (it.y - poly[0][1]) * k);
      for (let i = 1; i < poly.length; i++) ctx.lineTo((it.x + poly[i][0]) * k, (it.y - poly[i][1]) * k);
      ctx.closePath();
      ctx.fill();
    });
  }
  ctx.restore();
}

// Create the shared context and compile the shaders ahead of the first render (~0.3 s once).
// Call it when the app loads. Returns false when only the flat 2D fallback is available.
export function warmCanvas() { return !!gpu(); }

// debugging / QA only: the shared GL state (null until the first render), and the CPU half of a
// render (profiles -> layered segment instances) so it can be timed in Node.
export const _gpu = () => GPU;
export function _geometry(p, page, { emPx, dpr = 2 } = {}) {
  const pen = getPen(p);
  return buildGeometry(p, page, pen, emPx / UPM * dpr, {}, 0.75 + (pen.rough || 0) * dpr + (pen.bleed || 0) * dpr * 1.2);
}
