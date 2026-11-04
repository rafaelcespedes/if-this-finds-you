// count-hands.ts: how many hands the site can draw, from the engine's and the app's own lists (for the launch thread).
//   node scripts/node-ts.mjs scripts/count-hands.ts
import * as E from '@engine';
import fs from 'node:fs';
import path from 'node:path';
import { PEN_CHOICES } from '@/lib/pens';
import { INK_FAMILIES } from '@/lib/inks';
import { PAPERS } from '@/lib/papers';
import { CONTROLS } from '@/lib/controls';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;
const src = fs.readFileSync(path.resolve('../app/src/lib/hands.ts'), 'utf8');
const list = (name: string) => {
  const m = src.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
  return m ? (m[1].match(/'[^']+'/g) ?? []).length : 0;
};
const adj = list('ADJECTIVES'), noun = list('NOUNS');
const styles = engine.styleNames() as string[];
const pens = (PEN_CHOICES as any[]).filter((p) => (p.id ?? p) !== 'auto');
const inks = (INK_FAMILIES as any[]).flatMap((f: any) => f.inks ?? f.swatches ?? f.members ?? [f]);
const papers = Array.isArray(PAPERS) ? PAPERS : Object.values(PAPERS as any);
const sliders = (CONTROLS as any[]).filter((c) => !c.app);
const seeds = adj * noun * 90;
console.log(JSON.stringify({
  adjectives: adj, nouns: noun, numbers: 90, namedSeeds: seeds,
  traditions: styles.length, styleIds: styles,
  pens: pens.length, penIds: pens.map((p: any) => p.id ?? p),
  inks: inks.length, papers: papers.length,
  sliders: sliders.length, sliderKeys: sliders.map((c: any) => c.key),
  hands: seeds * styles.length,
  configurations: seeds * styles.length * pens.length * inks.length * papers.length,
}, null, 1));
