// Variety: do different seeds give clearly different hands?
//
// Each hand gets a feature vector MEASURED from what it draws (not read from its params, because a
// param that doesn't change the drawing doesn't create variety):
//   slant         mean angle of stem centerlines from vertical (l I H h d k b T 1), degrees
//   xHeight       x-height / cap height (tops of x u n v z m vs H E I, centerlines)
//   width         letter proportion: unslanted ink width of n o u a e h / x-height
//   weight        stroke thickness: outline area / centerline length, / cap height
//   contrast      thick/thin: p90 / p10 of local stroke width along the strokes
//   spacing       letter gap: (advance - ink width) / x-height, for n o u a e h
//   wordSpace     measured gap between words in a laid-out line / x-height
//   irregularity  how much each use of a letter differs from the hand's canonical form / x-height
//   variants      which skeleton variant the hand picks for a–z A–Z 0–9 (categorical)
// Distances are in "just noticeable difference" (JND) units: a difference of 1 in a feature is about
// what a designer would just notice side by side. These scales are judgement calls; tune them in JND.
// NN distance < 1.5 = near-twins, 1.5–3 = close cousins, > 3 = clearly different people.

import { varietySeeds } from '../config.mjs';
import { stats, fmt, fmtStats, histogram, bboxOf, polyArea, polyLength, widthProfile } from '../util.mjs';

export const JND = { slant: 3, xHeight: 0.04, width: 0.08, weight: 0.15, contrast: 0.25, spacing: 0.08, wordSpace: 0.25, irregularity: 0.02, variants: 0.1 };
const LOG_FEATURES = new Set(['weight', 'contrast']); // compared as log ratios
const VARIANT_CHARS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];

export function features(E, p) {
  const CAP = E.CAP || 700;
  const tan = Math.tan((p.slant || 0) * Math.PI / 180);
  const canon = new Map();
  const G = (ch) => { if (!canon.has(ch)) canon.set(ch, E.has(p, ch) ? E.makeGlyph(p, ch, null) : null); return canon.get(ch); };
  const centers = (g) => g.strokes.filter((s) => !s.dot).map((s) => s.center);
  const med = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : NaN; };

  let sNum = 0, sDen = 0;
  for (const ch of 'lIHhdkbT1') {
    const g = G(ch); if (!g) continue;
    for (const c of centers(g)) for (let i = 1; i < c.length; i++) {
      const dx = c[i][0] - c[i - 1][0], dy = c[i][1] - c[i - 1][1], L = Math.hypot(dx, dy);
      if (L > 0 && Math.abs(dy) > 1.5 * Math.abs(dx)) { sNum += Math.atan(dx / dy) * L; sDen += L; }
    }
  }
  const slant = sDen ? sNum / sDen * 180 / Math.PI : NaN;
  const top = (ch) => { const g = G(ch); return g ? bboxOf(centers(g)).y1 : NaN; };
  const xh = med([...'xunvzm'].map(top));
  const cap = med([...'HEI'].map(top));
  const probe = [...'nouaeh'].map(G).filter(Boolean);
  const unslantW = (g) => { let a = Infinity, b = -Infinity; for (const c of centers(g)) for (const q of c) { const x = q[0] - q[1] * tan; if (x < a) a = x; if (x > b) b = x; } return b - a; };
  const width = probe.reduce((s, g) => s + unslantW(g), 0) / probe.length / xh;
  let area = 0, len = 0; const widths = [];
  for (const g of probe) for (const s of g.strokes) if (!s.dot) { area += polyArea(s.contour); len += polyLength(s.center); widths.push(...widthProfile(s, 4)); }
  const weight = area / len / CAP;
  widths.sort((a, b) => a - b);
  const contrast = widths[Math.floor(widths.length * 0.9)] / Math.max(1, widths[Math.floor(widths.length * 0.1)]);
  const spacing = probe.reduce((s, g) => s + (g.advance - bboxOf(g.contours).w), 0) / probe.length / xh;
  const page = E.layout(p, 'nn nn nn nn nn nn nn', { maxWidth: 1e6 });
  const gl = page.items.filter((it) => it.kind === 'glyph');
  const gaps = [];
  for (let i = 1; i < gl.length; i++) if (gl[i].charIndex > gl[i - 1].charIndex + 1) gaps.push(gl[i].x - (gl[i - 1].x + gl[i - 1].g.advance));
  const wordSpace = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length) / xh;
  let dev = 0, nDev = 0;
  for (const ch of 'ean') {
    const c0 = G(ch); if (!c0) continue;
    for (let k = 0; k < 3; k++) {
      const g = E.makeGlyph(p, ch, { seed: 'var' + k, amount: 1 });
      g.strokes.forEach((s, si) => {
        const a = s.center, b = c0.strokes[si] && c0.strokes[si].center;
        if (!b) return;
        for (let i = 0; i < a.length; i += 3) { const j = Math.round(i / Math.max(1, a.length - 1) * (b.length - 1)); dev += Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]); nDev++; }
      });
    }
  }
  const irregularity = dev / Math.max(1, nDev) / xh;
  const variants = VARIANT_CHARS.map((ch) => { if (!E.has(p, ch)) return '-'; const v = E.choose(p, ch); return v ? v.id || '?' : '-'; });
  return { slant, xHeight: xh / cap, width, weight, contrast, spacing, wordSpace, irregularity, variants };
}

export function distance(a, b) {
  let s = 0;
  const parts = {};
  for (const k in JND) {
    let d;
    if (k === 'variants') d = a.variants.filter((v, i) => v !== b.variants[i]).length / a.variants.length / JND.variants;
    else if (LOG_FEATURES.has(k)) d = Math.abs(Math.log(a[k] / b[k])) / JND[k];
    else d = Math.abs(a[k] - b[k]) / JND[k];
    if (!Number.isFinite(d)) d = 0;
    parts[k] = d; s += d * d;
  }
  return { d: Math.sqrt(s), parts };
}

export async function run(ctx) {
  const { E } = ctx;
  const problems = [], lines = [], data = {};
  const seeds = varietySeeds(ctx.args.quick ? 60 : 200);
  ctx.shared.closestPairs = {};
  for (const style of E.styleNames()) {
    const F = seeds.map((seed) => ({ seed, f: features(E, E.makeHand(seed, style)) }));
    const D = (data[style] = { features: {} });
    lines.push(`${style}: ${seeds.length} hands`);
    for (const k of Object.keys(JND)) {
      if (k === 'variants') {
        const distinct = new Set(F.map((x) => x.f.variants.join(','))).size;
        const perChar = VARIANT_CHARS.map((_, i) => new Set(F.map((x) => x.f.variants[i])).size);
        const varying = perChar.filter((n) => n > 1).length;
        D.features.variants = { distinctCombos: distinct, charsThatVary: varying };
        lines.push(`    variants      ${varying} of ${VARIANT_CHARS.length} letters/digits differ between hands · ${distinct} distinct combinations`);
        continue;
      }
      const s = stats(F.map((x) => x.f[k]));
      const spread = LOG_FEATURES.has(k) ? Math.log(s.p95 / s.p05) / JND[k] : (s.p95 - s.p05) / JND[k];
      D.features[k] = { ...s, spreadJND: spread };
      lines.push(`    ${k.padEnd(13)} p5 ${fmt(s.p05, 3).padStart(7)} · median ${fmt(s.median, 3).padStart(7)} · p95 ${fmt(s.p95, 3).padStart(7)} · spans ${fmt(spread, 1)} JND`);
    }
    // nearest neighbours
    const nn = [], pairs = [];
    for (let i = 0; i < F.length; i++) {
      let best = { d: Infinity };
      for (let j = 0; j < F.length; j++) if (i !== j) {
        const r = distance(F[i].f, F[j].f);
        if (r.d < best.d) best = { ...r, j };
        if (j > i) pairs.push({ a: F[i].seed, b: F[j].seed, d: r.d, parts: r.parts });
      }
      nn.push(best.d);
    }
    const s = stats(nn);
    const twins = nn.filter((d) => d < 1.5).length / nn.length, cousins = nn.filter((d) => d < 3).length / nn.length;
    D.nn = { ...s, twins, cousins };
    lines.push(`    nearest-neighbour distance (JND): ${fmtStats(s, 2)}`);
    lines.push(`    near-twins (NN < 1.5): ${fmt(twins * 100, 0)}% · close cousins (NN < 3): ${fmt(cousins * 100, 0)}%`);
    lines.push(histogram(nn, 8, 28, 0, Math.max(6, s.max)));
    pairs.sort((x, y) => x.d - y.d);
    const closest = pairs.slice(0, 4);
    ctx.shared.closestPairs[style] = closest.map((x) => [x.a, x.b, x.d]);
    D.closest = closest.map((x) => ({ a: x.a, b: x.b, d: x.d }));
    lines.push(`    closest pairs: ${closest.map((x) => `${x.a} ~ ${x.b} (${fmt(x.d, 2)})`).join(' · ')}`);
    // which features carry the variety (mean |difference| in JND over all pairs)
    const contrib = {};
    for (const x of pairs) for (const k in x.parts) contrib[k] = (contrib[k] || 0) + x.parts[k] / pairs.length;
    lines.push(`    average pairwise difference by feature (JND): ${Object.entries(contrib).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v, 2)}`).join(', ')}`);
    D.contrib = contrib;
    if (twins > 0.05) problems.push({ level: 'warn', msg: `${style}: ${fmt(twins * 100, 0)}% of hands have a near-twin (NN < 1.5 JND); e.g. ${closest[0].a} ~ ${closest[0].b}` });
    if (s.median < 3) problems.push({ level: 'warn', msg: `${style}: median nearest-neighbour distance is ${fmt(s.median, 2)} JND — most hands are close cousins of another hand` });
    if (D.features.variants.charsThatVary === 0) problems.push({ level: 'warn', msg: `${style}: every hand builds every letter the same way (no variant choice) — letter construction never varies` });
  }
  return { id: 'variety', title: 'Variety between hands', lines, problems, data };
}
