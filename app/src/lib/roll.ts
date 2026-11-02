// New hand rolls the whole look: writer (seed), Print/Joined, pen and tip, ink, paper, size and every
// slider, except what you've locked. The result is plain note state, so a share link captures it.
//
// This is the app's local sampler. The letters session is extending the engine's New-hand sampler
// (engine/sampler.js) to return a complete, correlated configuration with a `locked` option; when it
// exports `sampleLook`, rollLook() hands over to it and only fills in what it doesn't decide.
import * as E from '@engine';
import { makeHand, type Hand } from '@engine';
import { CONTROLS, isShown, naturalValue, type PenSize } from './controls';
import { MODELLED_INK } from './engine-features';
import { pickNewHand, pickSimilarHand } from './hands';
import { AUTO_INK, INK_FAMILIES } from './inks';
import { PAPERS, type PaperId } from './papers';
import { PEN_CHOICES, PENS_LIVE } from './pens';
import { SIZE_RANGE, type NoteState } from './state';
import { clamp } from './utils';

export type LockKey = 'pen' | 'ink' | 'paper';

type Weighted<T> = [T, number][];

function rand() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
function gauss() {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rand();
  return (s - 3) / 0.7071;
}
function pick<T>(list: Weighted<T>): T {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let x = rand() * total;
  for (const [v, w] of list) { x -= w; if (x < 0) return v; }
  return list[list.length - 1][0];
}

// how often each thing turns up (est.: everyday paper and blue/black inks are the common case)
const PAPER_WEIGHTS: Record<PaperId, number> = { plain: 18, laid: 13, college: 14, seyes: 11, feint: 12, squared: 10, dots: 12, postcard: 8 };
const PEN_WEIGHTS: Record<string, number> = { auto: 18, ballpoint: 26, gel: 16, fountain: 18, felt: 10, pencil: 10 };
const INK_WEIGHTS: Record<string, number> = { [AUTO_INK]: 28, 'blue-black': 18, 'royal-blue': 14, 'ballpoint-blue': 14, black: 18, sepia: 7, 'iron-gall': 6, red: 3, green: 3 };
const TIP_WEIGHTS: Weighted<PenSize> = [['fine', 28], ['medium', 50], ['bold', 22]];

interface EngineLook {
  seed?: string; style?: string; pen?: string; ink?: string; paper?: string; size?: number; params?: Record<string, number>;
}
type EngineSampler = (opts: { current: { seed: string; style: string }; locked: string[]; variety: number }) => EngineLook;
const engineSampler = (E as unknown as { sampleLook?: EngineSampler }).sampleLook;

export function rollLook(s: NoteState, opts: { variety: number; locked: Set<LockKey> }): Partial<NoteState> {
  const { variety, locked } = opts;
  const sibling = variety <= 20;
  const wild = variety > 70;
  const fromEngine = engineSampler?.({ current: { seed: s.seed, style: s.style }, locked: [...locked], variety });

  // the writer
  const who = fromEngine?.seed
    ? { seed: fromEngine.seed, style: fromEngine.style ?? s.style }
    : sibling ? pickSimilarHand({ seed: s.seed, style: s.style }) : pickNewHand({ seed: s.seed, style: s.style }, variety);
  const natural = makeHand(who.seed, who.style);

  // with what, on what (siblings keep the look; locks always win)
  let pen = s.pen;
  let penSize = s.penSize;
  if (!locked.has('pen') && !sibling) {
    if (fromEngine?.pen) pen = fromEngine.pen;
    else if (PENS_LIVE) pen = pick(PEN_CHOICES.map((p) => [p.id, PEN_WEIGHTS[p.id] ?? 5] as [string, number]));
    penSize = pick(TIP_WEIGHTS);
  }
  let ink = s.ink;
  if (!locked.has('ink') && !sibling) {
    if (fromEngine?.ink) ink = fromEngine.ink;
    else ink = pickInk(pen);
  } else if (!INK_FAMILIES.some((f) => f.id === ink && (!f.pen || f.pen === pen)) && ink !== AUTO_INK) {
    ink = pickInk(pen); // e.g. graphite kept after the pencil was swapped out
  }
  let paper = s.paper;
  if (!locked.has('paper') && !sibling) {
    const fromEngineOk = fromEngine?.paper && PAPERS.some((p) => p.id === fromEngine.paper);
    // postcards are for short notes
    const long = s.text.length > 360;
    paper = fromEngineOk ? (fromEngine!.paper as PaperId) : pick(PAPERS.map((p) => [p.id, p.id === 'postcard' && long ? 0 : PAPER_WEIGHTS[p.id]] as [PaperId, number]));
  }
  const size = sibling ? s.size : clamp(fromEngine?.size ?? 1 + gauss() * 0.11, 0.84, Math.min(1.28, SIZE_RANGE.max));

  // every slider: a fresh offset around this writer's natural value, inside a band that stays legible
  const offsets = rollOffsets(natural, who.style, { scale: sibling ? 0.35 : wild ? 1.5 : 1, wild, params: fromEngine?.params });

  return { ...who, pen, penSize, ink, paper, size, offsets, occasion: null, amount: 1 };
}

function pickInk(pen: string) {
  const options = INK_FAMILIES.filter((f) => !f.pen || f.pen === pen).map((f) => f.id);
  if (MODELLED_INK) options.unshift(AUTO_INK);
  if (pen === 'pencil') return pick(options.map((id) => [id, id === 'graphite' ? 60 : id === AUTO_INK ? 0 : 4] as [string, number]));
  return pick(options.map((id) => [id, INK_WEIGHTS[id] ?? 3] as [string, number]));
}

function rollOffsets(natural: Hand, style: string, o: { scale: number; wild: boolean; params?: Record<string, number> }) {
  const connected = !!E.getStyle(style)?.connected;
  const offsets: Record<string, number> = {};
  for (const c of CONTROLS) {
    if (!c.roll || !isShown(c, natural, { connected })) continue;
    const nat = naturalValue(c, natural);
    const span = c.max - c.min;
    const [lo, hi] = o.wild ? [c.min, c.max] : c.roll.band;
    const target = o.params?.[c.key] ?? clamp(nat + gauss() * c.roll.spread * span * o.scale, Math.min(lo, nat), Math.max(hi, nat));
    const off = target - nat;
    if (Math.abs(off) > span * 0.004) offsets[c.key] = +off.toFixed(4);
  }
  return offsets;
}
