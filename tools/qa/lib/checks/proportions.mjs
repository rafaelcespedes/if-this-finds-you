// Letter proportions: catch letters whose width can only come from a bug, never ugly-but-plausible hands.
//
// Guards the integration bug of 2 Nov 2026: traced joined traditions were drawn with proportion ranges meant for
// another style's skeletons and came out about twice as wide (Sütterlin n at 3.4 x-heights; "never" read "nevr").
// Wide, cramped, overlapping or messy hands are welcome; only absurd values fail: for every style and 24 writers
// at their natural values, a lowercase probe letter must have ink and an advance between 0.05 and 2.6 x-heights
// (m and w 3.8); joined letters carry their connectors, so 3.0 (m and w 4.4). Measured in canonical form between
// two letters. The bug's values were 3.1-4.1 (n) and up to 5.1 (m); long-join hands reach about 2.8.

import { statSeeds } from '../config.mjs';
import { stats, fmt } from '../util.mjs';

const PROBES = 'noeiamw';
const MAX = (ch, joined) => (ch === 'm' || ch === 'w' ? (joined ? 4.4 : 3.8) : joined ? 3.0 : 2.6);
const MIN = 0.05;
const CTX = { prev: 'a', next: 'a', index: 1, wordStart: false, wordEnd: false };

export async function run(ctx) {
  const { E } = ctx;
  const CAP = E.CAP || 700;
  const problems = [], lines = [], data = {};
  const seeds = statSeeds(ctx.args.quick ? 12 : 24);
  for (const style of E.styleNames()) {
    const joined = !!(E.getStyle(style) && E.getStyle(style).connected);
    const vals = Object.fromEntries([...PROBES].map((ch) => [ch, []]));
    const bad = [];
    for (const seed of seeds) {
      const p = E.makeHand(seed, { style });
      for (const ch of PROBES) {
        if (!E.has(p, ch)) continue;
        const g = E.makeGlyph(p, ch, null, CTX);
        const r = g.advance / (p.xHeight * CAP);
        vals[ch].push(r);
        if (!g.contours.length) bad.push(`${seed} '${ch}' has no ink`);
        else if (!(r >= MIN && r <= MAX(ch, joined))) bad.push(`${seed} '${ch}' ${fmt(r, 2)} xh`);
      }
    }
    data[style] = Object.fromEntries(Object.entries(vals).map(([ch, v]) => [ch, stats(v)]));
    lines.push(`${style}: ` + Object.entries(vals).filter(([, v]) => v.length).map(([ch, v]) => {
      const s = stats(v);
      return `${ch} ${fmt(s.p05, 2)}–${fmt(s.median, 2)}–${fmt(s.p95, 2)}`;
    }).join(' · ') + '  (advance in x-heights, p5–median–p95)');
    if (bad.length) problems.push({ level: 'fail', key: `${style}:proportions`, count: bad.length, msg: `${style}: ${bad.length} letters with an absurd width (allowed ${MIN}–${MAX('n', joined)} x-heights, m/w ${MAX('m', joined)}) or no ink: ${bad.slice(0, 8).join('; ')}${bad.length > 8 ? ' …' : ''}` });
  }
  return { id: 'proportions', title: 'Letter proportions (only absurd widths fail)', lines, problems, data };
}
