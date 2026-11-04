// letters-list.ts: every letter with the hand, pen and paper the site writes it in (archive/look letterLook).
//   node scripts/node-ts.mjs scripts/letters-list.ts > out/letters.tsv
import letters from '../../content/sample-texts.json';
import { letterLook } from '@/archive/look';
/* eslint-disable @typescript-eslint/no-explicit-any */
for (const l of letters as any[]) {
  if (l.enabled === false || !l.text) continue;
  let look: any = {};
  try { look = letterLook(l); } catch (e) { look = { seed: 'ERR' }; }
  const first = String(l.text).replace(/\s+/g, ' ').slice(0, 90);
  console.log([l.id, l.year, l.lang, look.style, look.pen, look.ink, look.paper, look.seed, String(l.author ?? '').slice(0, 30), String(l.recipient ?? '').slice(0, 24), l.text.length, first].join('\t'));
}
