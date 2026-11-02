// Letter proportions: no tradition, writer or movement setting may make small letters absurdly wide or narrow.
//
// Guards the integration bug of 2 Nov 2026: traced joined traditions came out about twice as wide as their
// x-height ("never" read "nevr", words ran together). For every style, 24 writers at their natural values, plus
// the extremes below, each lowercase probe letter's advance is measured in
// x-heights (canonical form, between two letters, so joined letters carry their connectors).
// FAIL when a natural writer leaves the band. Then the widest and narrowest of 200 writers get every Hand and
// Movement control pushed to its wide or narrow end; those fail only far outside the band (×1.25 / ×0.6).

import { statSeeds, varietySeeds } from '../config.mjs';
import { stats, fmt } from '../util.mjs';

// advance / x-height bands per letter; joined hands include their entry and exit connectors
export const BANDS = {
  print: { n: [0.5, 1.7], o: [0.4, 1.6], e: [0.4, 1.6], i: [0.08, 1.0], m: [0.9, 2.6] },
  script: { n: [0.7, 2.1], o: [0.45, 2.0], e: [0.4, 1.8], i: [0.25, 1.5], m: [1.1, 3.0] },
};
const RATIO = [0.55, 2.2]; // n / o: one letter must not balloon while its neighbours stay put
const CTX = { prev: 'a', next: 'a', index: 1, wordStart: false, wordEnd: false };

export async function run(ctx) {
  const { E } = ctx;
  const CAP = E.CAP || 700;
  const problems = [], lines = [], data = {};
  const seeds = statSeeds(ctx.args.quick ? 12 : 24);
  for (const style of E.styleNames()) {
    const st = E.getStyle(style);
    const fam = st && st.family === 'script' ? 'script' : 'print';
    const band = BANDS[fam];
    const ratio = (p, ch) => E.makeGlyph(p, ch, null, CTX).advance / (p.xHeight * CAP);
    const vals = Object.fromEntries(Object.keys(band).map((ch) => [ch, []]));
    const out = [], extreme = [];
    for (const seed of seeds) {
      const p = E.makeHand(seed, { style });
      for (const ch of Object.keys(band)) {
        if (!E.has(p, ch)) continue;
        const r = ratio(p, ch);
        vals[ch].push(r);
        if (!(r >= band[ch][0] && r <= band[ch][1])) out.push(`${seed} '${ch}' ${fmt(r, 2)} xh`);
      }
      if (E.has(p, 'n') && E.has(p, 'o')) {
        const k = ratio(p, 'n') / ratio(p, 'o');
        if (!(k >= RATIO[0] && k <= RATIO[1])) out.push(`${seed} n/o ${fmt(k, 2)}`);
      }
    }
    // the widest and narrowest natural writers (of 200), with every user control at its wide / narrow end
    const pool = (ctx.shared.propPool = ctx.shared.propPool || varietySeeds(200));
    const shape = (s) => { const h = E.makeHand(s, { style }); return h.width / h.xHeight; };
    const ranked = pool.map((s) => [s, shape(s)]).sort((a, b) => a[1] - b[1]);
    const ctl = (E.PARAMS || []).filter((d) => d.type !== 'select' && (d.group === 'Movement' || d.group === 'Hand') && d.key !== 'slant');
    const toward = (wide) => Object.fromEntries(ctl.map((d) => [d.key, d.key === 'neatness' ? (wide ? d.min : d.max) : wide ? d.max : d.min]));
    for (const [label, seed, o] of [['wide', ranked[ranked.length - 1][0], toward(true)], ['narrow', ranked[0][0], toward(false)]]) {
      const p = E.withOverrides(E.makeHand(seed, { style }), o);
      for (const ch of Object.keys(band)) {
        if (!E.has(p, ch)) continue;
        const r = ratio(p, ch), [lo, hi] = band[ch];
        if (r > hi * 1.25 || r < lo * 0.6) extreme.push(`${label} ${seed} '${ch}' ${fmt(r, 2)} xh`);
      }
    }
    data[style] = Object.fromEntries(Object.entries(vals).map(([ch, v]) => [ch, stats(v)]));
    lines.push(`${style} (${fam}): ` + Object.entries(vals).filter(([, v]) => v.length).map(([ch, v]) => {
      const s = stats(v);
      return `${ch} ${fmt(s.p05, 2)}–${fmt(s.median, 2)}–${fmt(s.p95, 2)}`;
    }).join(' · ') + '  (p5–median–p95, x-heights)');
    if (out.length) problems.push({ level: 'fail', key: `${style}:proportions`, count: out.length, msg: `${style}: ${out.length} letters outside the ${fam} width band: ${out.slice(0, 8).join('; ')}${out.length > 8 ? ' …' : ''}` });
    if (extreme.length) problems.push({ level: 'fail', key: `${style}:proportions-extreme`, count: extreme.length, msg: `${style}: control extremes make letters far too wide or narrow: ${extreme.slice(0, 6).join('; ')}` });
  }
  return { id: 'proportions', title: 'Letter proportions (advance per x-height)', lines, problems, data };
}
