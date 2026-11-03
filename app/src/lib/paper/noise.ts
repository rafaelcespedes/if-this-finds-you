// Seeded smooth noise for paper: edges (1D, along a side) and fields (2D, over the sheet). Values 0..1.
import { rng } from '@engine';

const N = 1024;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise along a line: one random value per unit, smoothly joined. */
export function noise1(seed: string) {
  const r = rng('paper-n1:' + seed);
  const v = Float32Array.from({ length: N }, () => r());
  return (x: number) => {
    const i = Math.floor(x);
    const f = smooth(x - i);
    const a = v[((i % N) + N) % N], b = v[(((i + 1) % N) + N) % N];
    return a + (b - a) * f;
  };
}

/** Layered 1D noise: [wavelength (mm), amplitude] octaves, centred on 0 (about ±sum of amplitudes). */
export function fbm1(seed: string, octaves: [number, number][]) {
  const ns = octaves.map((_, i) => noise1(seed + ':' + i));
  return (x: number) => {
    let s = 0;
    for (let i = 0; i < octaves.length; i++) s += (ns[i](x / octaves[i][0]) * 2 - 1) * octaves[i][1];
    return s;
  };
}

/** Value noise on a plane (a 64 x 64 lattice that wraps). */
export function noise2(seed: string) {
  const r = rng('paper-n2:' + seed);
  const S = 64;
  const v = Float32Array.from({ length: S * S }, () => r());
  const at = (x: number, y: number) => v[(((y % S) + S) % S) * S + (((x % S) + S) % S)];
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = smooth(x - xi), w = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}

/** Layered 2D noise in mm: [wavelength (mm), amplitude] octaves, centred on 0. */
export function fbm2(seed: string, octaves: [number, number][]) {
  const ns = octaves.map((_, i) => noise2(seed + ':' + i));
  return (x: number, y: number) => {
    let s = 0;
    for (let i = 0; i < octaves.length; i++) {
      const wl = octaves[i][0];
      // a per-octave offset so the layers don't line up on lattice points
      s += (ns[i](x / wl + i * 17.3, y / wl + i * 31.7) * 2 - 1) * octaves[i][1];
    }
    return s;
  };
}
