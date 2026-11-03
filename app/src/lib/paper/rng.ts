// Seeded randomness for paper: the engine's own algorithm (engine/core.js, xmur3 + sfc32), copied so the paper
// painter runs in its worker without loading the handwriting engine. Same seed string, same numbers.
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
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

/** A seeded random number generator: 0 ≤ r() < 1. */
export function rng(seed: string): () => number {
  const h = xmur3(String(seed));
  const r = sfc32(h(), h(), h(), h());
  for (let i = 0; i < 12; i++) r();
  return r;
}
