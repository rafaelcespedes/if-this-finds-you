// list-fonts.ts: the hands for the fonts video, drawn as the Fonts page draws a set (the engine's sampleLooks, Neat
// hands only, each page kept away from the earlier ones), each built into its real font for the line the rows show
// (buildFont with `chars`, as fonts.worker.ts fontSpecimen: what you see is what you download). Writes
// public/list-fonts/NNNN.otf and src/data/list-fonts.json (name, the few words about the hand, seed, style, pen).
//   node scripts/node-ts.mjs scripts/list-fonts.ts [count=40] [set=fonts-video] [line]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as E from '@engine';
import { writerName } from '@/lib/hands';
import { STYLE_LABEL, penWords } from '@/fonts/filters';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;
const N = Number(process.argv[2] || 40);
const SET = process.argv[3] || 'fonts-video';
const LINE = process.argv[4] || 'The quick brown fox jumps over the lazy dog';
const require = createRequire(path.resolve('../app/package.json'));
const clipper = require('clipper-lib');

const looks: any[] = [];
for (let k = 0; looks.length < N; k++) {
  const r = engine.sampleLooks(k ? `${SET}#${k}` : SET, Math.min(24, N - looks.length), { neatOnly: true }, { shown: looks });
  if (!r.looks.length) break;
  looks.push(...r.looks);
}
// the Fonts page's words for a school (fonts.worker.ts traditionOf)
const ATTR: Record<string, string> = { print: 'Everyday', script: 'Everyday', 'quebec-print': 'Québec school', 'adult-fr-2023': 'French everyday' };
const traditionOf = (style: string) => ATTR[style] ?? (STYLE_LABEL as Record<string, string>)[style] ?? String(engine.getStyle(style)?.label ?? style);
// the hand exactly as the row draws it (fonts.worker.ts handOf, with the sampler's values, its pen and ink)
const handOf = (l: any) => {
  const over: Record<string, any> = { ...(l.params || {}) };
  if (l.pen) over.pen = l.pen;
  if (l.tip) over.tip = l.tip;
  if (l.ink) over.ink = l.ink;
  return engine.withOverrides(engine.makeHand(l.seed, { style: l.style }, { neatOnly: true }), over);
};
const dir = path.resolve('public/list-fonts');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
// every character the rows show: the line, and the words typed into the tester at the end
const EXTRA = process.argv[5] || 'If this finds you';
const chars = [...new Set([...LINE, ...EXTRA, ' '])];
const out: any[] = [];
const t0 = Date.now();
looks.forEach((l, i) => {
  const name = writerName(l.seed);
  const built = engine.buildFont(null, handOf(l), { chars, ttf: false, name, clipper });
  const file = `${String(i).padStart(4, '0')}.otf`;
  fs.writeFileSync(path.join(dir, file), built.otf);
  const family = l.family === 'script' ? 'script' : 'print';
  out.push({
    n: i + 1, file, name, seed: l.seed, style: l.style, pen: l.pen, tip: l.tip, ink: l.ink,
    words: [family === 'script' ? 'Joined' : 'Print', traditionOf(l.style), penWords(l.pen)].join(' · '),
  });
});
fs.writeFileSync(path.resolve('src/data/list-fonts.json'), JSON.stringify({ line: LINE, hands: out }));
console.log(out.length, 'fonts in', ((Date.now() - t0) / 1000).toFixed(1), 's →', dir);
