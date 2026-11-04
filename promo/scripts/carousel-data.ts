// carousel-data.ts: the carousel letters' captions and alt text (for the review page). Writes out/carousel.json.
//   node scripts/node-ts.mjs scripts/carousel-data.ts
import fs from 'node:fs';
import { CAROUSEL, cardOf } from '../src/scene/carousel';
const cards = CAROUSEL.map((_, i) => {
  const c = cardOf(i);
  const pen = /^[aeiou]/i.test(c.pen) ? `an ${c.pen}` : `a ${c.pen}`;
  return { ...c, n: i + 1, alt: `A letter from ${c.credit}${c.year ? `, ${c.year}` : ''}, copied out by hand in ${c.school} with ${pen}. Seed ${c.seed}.` };
});
fs.writeFileSync('out/carousel.json', JSON.stringify(cards, null, 1));
console.log(cards.map((c) => `${c.n} ${c.id} ${c.seed} ${c.style}`).join('\n'));
