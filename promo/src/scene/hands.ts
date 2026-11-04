// The hands the video shows, in order. 0 is the site's wordmark hand (the title is written in it); the flip then
// runs through hands sampled by the engine's own sampler (scripts/sample-hands.mjs → data/hands.json, farthest-point
// picks, so each is clearly different from the last few); the last is the hand it lands on.
import * as E from '@engine';
import { writerName } from '@/lib/hands';
import { STYLE_LABEL, PEN_LABEL } from '@/fonts/filters';
import sampled from '../data/hands.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;

export interface Look {
  seed: string;
  style: string;
  pen?: string;
  tip?: string;
  ink?: string;
  params?: Record<string, number>;
  legibility?: number;
  family?: string;
}

/** The site's wordmark: Québec school print, felt marker, seed linen-thistle-82 (brand/wordmark, option #5). */
export const BRAND: Look = { seed: 'linen-thistle-82', style: 'quebec-print' };

/** Hands the slow beats may use: easy to read, clearly different families. */
const legible = (l: Look) => (l.legibility ?? 1) >= 0.85;

export function handList(count: number, landing: Look): Look[] {
  // the landing hand with its sampled look (pen, ink, values) when it's one of the sampled hands
  const same = (l: Look) => l.seed === landing.seed && l.style === landing.style;
  landing = (sampled as Look[]).find(same) ?? landing;
  const pool = (sampled as Look[]).filter((l) => !same(l));
  // the first slow cuts (one a beat, two a beat) should each read as a font: legible, alternating print and joined
  const slow: Look[] = [];
  const want = ['script', 'print', 'script', 'print', 'script', 'print', 'script', 'print'];
  for (const fam of want) {
    const i = pool.findIndex((l) => legible(l) && l.family === fam && l.style !== BRAND.style);
    if (i >= 0) slow.push(...pool.splice(i, 1));
  }
  const rest = pool;
  const out: Look[] = [BRAND, ...slow, ...rest];
  while (out.length < count - 1) out.push(...rest); // more cuts than sampled hands: go round again
  out.length = count - 1;
  out.push(landing);
  return out;
}

const cache = new Map<string, any>();
/** The engine hand for a look (the same recipe as the Fonts view: the sampler's params over makeHand). */
export function handOf(look: Look, ink?: string) {
  const key = `${look.seed}~${look.style}~${look.pen}~${ink ?? look.ink}`;
  let p = cache.get(key);
  if (!p) {
    const over: Record<string, unknown> = { ...(look.params || {}) };
    if (look.pen) over.pen = look.pen;
    if (look.tip) over.tip = look.tip;
    const i = ink ?? look.ink;
    if (i) over.ink = i;
    p = engine.withOverrides(engine.makeHand(look.seed, { style: look.style }, { neatOnly: true }), over);
    cache.set(key, p);
  }
  return p;
}

/** "Mara Lindqvist · Palmer · fountain pen": the writer the site names for this hand, its school and its pen. */
export function caption(look: Look) {
  const st = engine.getStyle(look.style) || {};
  const school = (STYLE_LABEL as Record<string, string>)[look.style] ?? String(st.label ?? look.style);
  const p = handOf(look);
  const penKey = look.pen ?? p.pen;
  const pen = (PEN_LABEL as Record<string, string>)[penKey] ?? penKey;
  return { name: writerName(look.seed), school, pen: pen ? String(pen).toLowerCase() : '' };
}
