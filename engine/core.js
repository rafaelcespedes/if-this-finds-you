// core.js — shared seeded randomness, smooth noise and small math helpers.
// Everything downstream is deterministic from strings: same seed string, same numbers.

// ---------- seeded randomness ----------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
export function rng(seedStr) {
  const h = xmur3(String(seedStr));
  const r = sfc32(h(), h(), h(), h());
  for (let i = 0; i < 12; i++) r();
  const f = () => r();
  f.range = (a, b) => a + (b - a) * r();
  f.gauss = () => { // approx N(0,1), clipped-ish
    return (r() + r() + r() + r() + r() + r() - 3) / 0.7071;
  };
  f.pick = (arr) => arr[Math.floor(r() * arr.length)];
  // weighted pick: items carry a numeric `weight` (default 1)
  f.weighted = (arr) => {
    let total = 0;
    for (const it of arr) total += it.weight == null ? 1 : it.weight;
    let x = r() * total;
    for (const it of arr) { x -= it.weight == null ? 1 : it.weight; if (x < 0) return it; }
    return arr[arr.length - 1];
  };
  return f;
}

// ---------- smooth noise (gradient noise, 1D + 2D) ----------
export function makeNoise(seedStr) {
  const r = rng('noise:' + seedStr);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const g1 = new Float32Array(256), gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    g1[i] = r() * 2 - 1;
    const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function n1(x) {
    const i = Math.floor(x), f = x - i, u = fade(f);
    const a = g1[perm[i & 255]] * f, b = g1[perm[(i + 1) & 255]] * (f - 1);
    return 2 * (a + (b - a) * u);
  }
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const h = (i, j) => perm[(perm[(xi + i) & 255] + yi + j) & 255];
    const d = (k, dx, dy) => gx[k] * dx + gy[k] * dy;
    const a = d(h(0, 0), xf, yf), b = d(h(1, 0), xf - 1, yf);
    const c = d(h(0, 1), xf, yf - 1), e = d(h(1, 1), xf - 1, yf - 1);
    const ab = a + (b - a) * u, ce = c + (e - c) * u;
    return 1.4 * (ab + (ce - ab) * v);
  }
  return { n1, n2 };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const DEG = Math.PI / 180;
