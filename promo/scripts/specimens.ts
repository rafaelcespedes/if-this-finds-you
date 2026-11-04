// specimens.ts: hands for the launch thread's favourites. Draws them with the engine's sampler exactly as the Fonts
// page does (sampleLooks, Neat hands only, each page keeping away from the earlier ones), and records everything a
// reader needs to find one again: the seed and school, the pen, tip, ink and paper, the writer the site names, and
// the "Write with it" link the Fonts page gives (fonts.worker.ts entryOf: the tool's state with this hand), here
// with the pangram already on the sheet. Writes src/data/specimens.json; the Specimen composition draws each one writing the pangram.
//   node scripts/node-ts.mjs scripts/specimens.ts [count=120] [set=thread]
import fs from 'node:fs';
import path from 'node:path';
import * as E from '@engine';
import { writerName } from '@/lib/hands';
import { CONTROLS, naturalValue, type PenSize } from '@/lib/controls';
import { DEFAULT_STATE, encodeState } from '@/lib/state';
import { getPaper } from '@/lib/papers';
import { PEN_LABEL, STYLE_LABEL } from '@/fonts/filters';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;
const N = Number(process.argv[2] || 120);
const SET = process.argv[3] || 'thread';
const SITE = 'https://ifthisfindsyou.app/';
const C = { neatOnly: true };
/** what each specimen writes, and what the link opens the tool writing */
export const PANGRAM = 'The quick brown fox jumps over the lazy dog';

const looks: any[] = [];
for (let k = 0; looks.length < N; k++) {
  const r = engine.sampleLooks(k ? `${SET}#${k}` : SET, Math.min(24, N - looks.length), C, { shown: looks });
  if (!r.looks.length) break;
  looks.push(...r.looks);
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
function offsetsOf(params: Record<string, number>, natural: any) {
  const out: Record<string, number> = {};
  for (const c of CONTROLS) {
    const v = params[c.key];
    if (v == null || c.app) continue;
    const off = clamp(v, c.min, c.max) - naturalValue(c, natural);
    if (Math.abs(off) > (c.max - c.min) * 0.002) out[c.key] = +off.toFixed(3);
  }
  return out;
}

const out = looks.map((look, i) => {
  const sheet = getPaper(look.paper);
  const params: Record<string, number> = { ...look.params };
  if (look.inkAge != null) params.inkAge = look.inkAge;
  if (look.inkVariation != null) params.inkVariation = look.inkVariation;
  const natural = engine.makeHand(look.seed, { style: look.style }, { neatOnly: true });
  const size = look.size > 0 ? +Math.min(1.28, Math.max(0.84, look.size / sheet.xh)).toFixed(3) : 1;
  const tool = encodeState({
    ...DEFAULT_STATE, seed: look.seed, style: look.style, pen: look.pen, penSize: (look.tip || 'medium') as PenSize, ink: look.ink,
    paper: sheet.id, size, offsets: offsetsOf(params, natural), neatOnly: true, text: PANGRAM, sample: null, inkLog: null, marks: [],
    replyTo: null, signed: false, reader: false,
  } as any);
  const st = engine.getStyle(look.style) || {};
  return {
    n: i + 1,
    seed: look.seed, style: look.style, family: look.family === 'script' ? 'script' : 'print',
    pen: look.pen, tip: look.tip, ink: look.ink, paper: sheet.id, params,
    legibility: +(+look.legibility).toFixed(3),
    name: writerName(look.seed),
    school: (STYLE_LABEL as Record<string, string>)[look.style] ?? String(st.label ?? look.style),
    penLabel: String((PEN_LABEL as Record<string, string>)[look.pen] ?? look.pen).toLowerCase(),
    kind: look.label ?? '',
    paperName: sheet.name ?? sheet.id,
    link: `${SITE}#${tool}`,
  };
});
const file = path.join(process.cwd(), 'src/data/specimens.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
const by = (k: string) => out.reduce((m: any, l: any) => ((m[l[k]] = (m[l[k]] || 0) + 1), m), {});
console.log(out.length, 'hands →', file, by('family'), by('pen'));
