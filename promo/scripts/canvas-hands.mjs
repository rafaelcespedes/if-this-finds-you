// canvas-hands.mjs: the hands of the canvas the camera pulls back into: 4096 different writers, each with the look
// the site's sampler gives that seed (lookOf: school, pen, tip, ink, paper, values), Neat only, print and joined
// at random. Writes src/data/canvas-hands.json (gitignored; `npm run canvas` makes it and the atlas pages).
//   node scripts/canvas-hands.mjs [count=4096]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../engine/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] || 4096);
const r = E.rng('promo-canvas');
const seen = new Set();
const out = [];
while (out.length < N) {
  const seed = E.seedFrom(r) + (r() < 0.5 ? '' : String(Math.floor(r() * 10)));
  if (seen.has(seed)) continue;
  seen.add(seed);
  const fam = r() < 0.5 ? 'print' : 'script';
  const l = E.lookOf(seed, fam, {}, { neatOnly: true });
  out.push({ seed: l.seed, style: l.style, family: l.family, pen: l.pen, tip: l.tip, ink: l.ink, paper: l.paper, params: l.params });
}
fs.writeFileSync(path.join(here, '../src/data/canvas-hands.json'), JSON.stringify(out));
const by = (k) => out.reduce((m, l) => ((m[l[k]] = (m[l[k]] || 0) + 1), m), {});
console.log(out.length, 'hands', by('style'), by('ink'));
