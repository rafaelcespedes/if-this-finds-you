// kinematics.js — give a pen stroke a time axis: where the pen is fast, where it slows.
//
// Real writing is a time signal (docs/research/human-feel.md §1, rule 1):
//  - speed follows curvature: v = K·κ^(−β), β ≈ 1/3 (the "two-thirds power law")
//  - the pen dips in speed at sharp turns, which split a stroke into ~100 ms sub-strokes
//  - each sub-stroke is lopsided: a quick rise and a long tail (lognormal-like)
//  - isochrony: longer sub-strokes are faster, so duration grows sub-linearly with length
// Consumers: pen.js (ink density follows slowness), animate.js (write-on timing).
// Pure and deterministic; no randomness here (callers add their own).

import { clamp } from './core.js';

// pts: centerline [[x,y],...] in font units. opts: { xh (x-height, font units), beta, dip }
// Returns { s, t, v, vn, kappa, splits, duration }
//   s: arclength at each point; t: seconds at each point; v: speed (font units/s)
//   vn: speed normalised to the stroke mean (≈1 on average; <1 = slow = more ink)
//   kappa: curvature (1/units); splits: point indices of speed dips (sharp turns)
export function kinematics(pts, opts = {}) {
  const n = pts.length;
  const xh = opts.xh || 400;
  const beta = opts.beta == null ? 0.33 : opts.beta;
  const dipDepth = opts.dip == null ? 0.6 : opts.dip;
  const s = new Float64Array(n), kappa = new Float64Array(n), v = new Float64Array(n), t = new Float64Array(n), vn = new Float64Array(n);
  if (n < 2) return { s, t, v, vn: vn.fill(1), kappa, splits: [], duration: 0 };
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const total = s[n - 1] || 1;

  // discrete curvature: turning angle over local arclength, lightly smoothed
  const raw = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1];
    const bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) continue;
    const ang = Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1));
    raw[i] = ang / ((la + lb) / 2);
  }
  raw[0] = raw[1]; raw[n - 1] = raw[n - 2];
  const kMin = 1 / (2 * xh), kMax = 1 / (0.04 * xh);
  for (let i = 0; i < n; i++) {
    const a = raw[Math.max(0, i - 1)], b = raw[i], c = raw[Math.min(n - 1, i + 1)];
    kappa[i] = clamp((a + 2 * b + c) / 4, kMin, kMax);
  }

  // sharp turns = local curvature maxima above a threshold -> speed dips / sub-stroke splits
  const kSplit = 1 / (0.12 * xh);
  const splits = [];
  for (let i = 2; i < n - 2; i++) {
    if (kappa[i] >= kSplit && kappa[i] >= kappa[i - 1] && kappa[i] > kappa[i + 1]) {
      if (!splits.length || s[i] - s[splits[splits.length - 1]] > 0.15 * xh) splits.push(i);
    }
  }

  // power law, then shape each sub-stroke: quick rise, long tail, never fully stopped mid-stroke
  for (let i = 0; i < n; i++) v[i] = Math.pow(kappa[i], -beta);
  const bounds = [0, ...splits, n - 1];
  for (let b = 0; b < bounds.length - 1; b++) {
    const i0 = bounds[b], i1 = bounds[b + 1];
    const s0 = s[i0], len = Math.max(1e-6, s[i1] - s0);
    const startFloor = b === 0 ? 0.12 : 1 - dipDepth;           // pen lands from rest; mid-stroke dips are partial
    const endFloor = b === bounds.length - 2 ? 0.18 : 1 - dipDepth;
    const last = b === bounds.length - 2;
    for (let i = i0; i < i1 + (last ? 1 : 0); i++) { // a split point belongs to the sub-stroke it starts
      const u = (s[i] - s0) / len;
      const rise = startFloor + (1 - startFloor) * smoothstep(u / 0.22);       // fast acceleration
      const fall = endFloor + (1 - endFloor) * smoothstep((1 - u) / 0.45);     // long deceleration
      v[i] *= Math.min(rise, fall);
    }
  }

  // isochrony: a sub-stroke lasts ~100 ms × (length / x-height)^0.4, whatever its geometry
  for (let b = 0; b < bounds.length - 1; b++) {
    const i0 = bounds[b], i1 = bounds[b + 1];
    let raw = 0;
    for (let i = i0 + 1; i <= i1; i++) raw += (s[i] - s[i - 1]) / Math.max(1e-6, (v[i] + v[i - 1]) / 2);
    const target = 0.1 * Math.pow(Math.max(0.05, (s[i1] - s[i0]) / xh), 0.4);
    const k = raw > 0 ? raw / target : 1;
    const last = b === bounds.length - 2;
    for (let i = i0; i < i1 + (last ? 1 : 0); i++) v[i] *= k;
  }
  for (let i = 1; i < n; i++) t[i] = t[i - 1] + (s[i] - s[i - 1]) / Math.max(1e-6, (v[i] + v[i - 1]) / 2);
  const mean = total / Math.max(1e-6, t[n - 1]);
  for (let i = 0; i < n; i++) vn[i] = v[i] / mean;
  return { s, t, v, vn, kappa, splits, duration: t[n - 1] };
}

function smoothstep(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
