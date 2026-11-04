// sample-hands.mjs: pick the hands the video flips through, with the site's own sampler (engine/sampler.js
// sampleLooks: farthest-point picks, so each hand is clearly different from the ones before it).
// Sampling ~400 looks takes ~30 s, so the result is cached in src/data/hands.json (the video reads that).
//   node promo/scripts/sample-hands.mjs [count=400] [setSeed=promo]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../engine/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] || 400);
const SET = process.argv[3] || 'promo';
const looks = [];
for (let k = 0; looks.length < N; k++) {
  const r = E.sampleLooks(`${SET}#${k}`, Math.min(200, N - looks.length), {}, { shown: looks });
  if (!r.looks.length) break;
  looks.push(...r.looks);
}
const keep = (l) => ({
  seed: l.seed, style: l.style, family: l.family, pen: l.pen, tip: l.tip, ink: l.ink, paper: l.paper,
  legibility: +(+l.legibility).toFixed(3), params: l.params, label: l.label,
});
const out = looks.map(keep);
fs.writeFileSync(path.join(here, '../src/data/hands.json'), JSON.stringify(out));
const by = (k) => out.reduce((m, l) => ((m[l[k]] = (m[l[k]] || 0) + 1), m), {});
console.log(out.length, 'hands', by('style'), by('pen'));
