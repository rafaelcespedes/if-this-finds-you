// count-check.ts: do different named seeds really give different hands? Draws random named seeds in each tradition
// (Neat hands only, as the site) and compares their numeric values, rounded.
//   node scripts/node-ts.mjs scripts/count-check.ts [perTradition=1500]
import * as E from '@engine';
import { randomSeed } from '@/lib/hands';
/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;
const N = Number(process.argv[2] || 1500);
let total = 0, dupes = 0, minDiff = Infinity;
for (const style of engine.styleNames() as string[]) {
  const seen = new Map<string, string>();
  const seeds = new Set<string>();
  while (seeds.size < N) seeds.add(randomSeed());
  for (const seed of seeds) {
    const h = engine.makeHand(seed, { style }, { neatOnly: true });
    const nums = Object.entries(h).filter(([, v]) => typeof v === 'number').sort(([a], [b]) => a.localeCompare(b));
    const key = nums.map(([, v]) => (v as number).toFixed(3)).join(',') + '|' + JSON.stringify(h.forms ?? h.allographs ?? '');
    total++;
    if (seen.has(key)) dupes++;
    else seen.set(key, seed);
  }
}
console.log({ handsChecked: total, identical: dupes });
