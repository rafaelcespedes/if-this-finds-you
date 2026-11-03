// New hand rolls the whole look: writer (seed), Print/Joined, pen and tip, ink, paper, size and every
// slider, except what you've locked. The result is plain note state, so a share link captures it.
//
// This is the app's local sampler. The letters session is extending the engine's New-hand sampler
// (engine/sampler.js) to return a complete, correlated configuration with a `locked` option; when it
// exports `sampleLook`, rollLook() hands over to it and only fills in what it doesn't decide.
import * as E from '@engine';
import { makeHand, type Hand } from '@engine';
import { CONTROLS, isShown, naturalValue, type PenSize } from './controls';
import { effective, effectiveHand } from './params';
import { ENGINE_NEAT, MODELLED_INK, NEAT_MIN, handOpts } from './engine-features';
import { pickNewHand, pickSimilarHand } from './hands';
import { AUTO_INK, INK_FAMILIES } from './inks';
import { ALL_PAPERS, isPaperId, paperRollWeight, type PaperId } from './papers';
import { PEN_CHOICES, PENS_LIVE } from './pens';
import { SIZE_RANGE, type NoteState } from './state';
import { clamp } from './utils';
import { sampleForSeed } from './samples';

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

// how often each thing turns up (est.: everyday paper and blue/black inks are the common case; papers carry
// their own weights, lib/papers.ts)
const PEN_WEIGHTS: Record<string, number> = { auto: 18, ballpoint: 26, gel: 16, fountain: 18, pointed: 5, italic: 5, felt: 10, pencil: 10 };
const INK_WEIGHTS: Record<string, number> = { [AUTO_INK]: 28, 'blue-black': 18, 'royal-blue': 14, 'ballpoint-blue': 14, black: 18, sepia: 7, 'iron-gall': 6, red: 3, green: 3 };
const TIP_WEIGHTS: Weighted<PenSize> = [['fine', 28], ['medium', 50], ['bold', 22]];

interface EngineLook {
  seed?: string; style?: string; pen?: string; ink?: string; paper?: string; size?: number; params?: Record<string, number>;
}
type EngineSampler = (opts: { current: { seed: string; style: string }; locked: string[]; variety: number; textLength?: number; neatOnly?: boolean; entropy?: string }) => EngineLook;
const engineSampler = (E as unknown as { sampleLook?: EngineSampler }).sampleLook;
// how easy a hand is to read, 0..1, when the engine has it (it comes with `neatOnly` in its sampler, and NEAT_MIN)
const engineLegibility = ENGINE_NEAT ? (E as unknown as { legibility: (p: Hand) => number }).legibility : undefined;

// Neat hands only, until the engine decides it: writers whose own hand is at least relaxed, and every roll
// kept inside a tidy band on the sliders that make writing hard to read.
const NEAT_WRITER = 0.5;
const NEAT_BANDS: Record<string, [number, number]> = {
  neatness: [0.55, 0.95], hurry: [0, 0.6], mistakes: [0, 0.4], tremor: [0.3, 1.2], fatigue: [0.2, 0.9], lineWander: [0.3, 1.1], drift: [0.2, 0.9],
};

/** Is this hand easy to read? (The engine's score when it has one; else its neatness and hurry.) */
export function isNeat(p: Hand) {
  if (engineLegibility) return engineLegibility(p) >= NEAT_MIN;
  return (p.neatness as number) >= 0.45 && ((p.hurry as number) ?? 0) <= 0.7;
}

export function rollLook(s: NoteState, opts: { variety: number; locked: Set<LockKey> }): Partial<NoteState> {
  const { variety, locked } = opts;
  const sibling = variety <= 20;
  const wild = variety > 70;
  const neat = s.neatOnly;
  // the letter's length, so the sampler leaves out papers too small for it (postcards, cards, an aerogramme)
  // (the sampler is repeatable for the same note; a retry asks it with a different word)
  const ask = (retry = 0) => engineSampler?.({ current: { seed: s.seed, style: s.style }, locked: [...locked], variety, textLength: s.text.length, neatOnly: neat, ...(retry ? { entropy: `neat-${retry}` } : {}) });
  const choose = (fromEngine: EngineLook | undefined) => fromEngine?.seed
    ? { seed: fromEngine.seed, style: fromEngine.style ?? s.style }
    : sibling ? pickSimilarHand({ seed: s.seed, style: s.style }) : pickNewHand({ seed: s.seed, style: s.style }, variety);

  // the writer (neat only: a few more tries for one who writes legibly by nature; the engine's own pick when it decides)
  let fromEngine = ask();
  let who = choose(fromEngine);
  let natural = makeHand(who.seed, who.style, handOpts(s));
  for (let i = 1; neat && !engineLegibility && i <= 8 && (natural.neatness as number) < NEAT_WRITER; i++) {
    fromEngine = ask(i);
    who = choose(fromEngine);
    natural = makeHand(who.seed, who.style, handOpts(s));
  }

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
    // cards and postcards are for short notes, an aerogramme for one sheet's worth
    const n = s.text.length;
    // the sampler's pick when it names one of today's papers and it fits
    const fromEnginePaper = fromEngine?.paper;
    paper = isPaperId(fromEnginePaper) && paperRollWeight(fromEnginePaper, n) > 0
      ? fromEnginePaper
      : pick(ALL_PAPERS.map((p) => [p.id, paperRollWeight(p.id, n)] as [PaperId, number]));
  }
  const size = sibling ? s.size : clamp(fromEngine?.size ?? 1 + gauss() * 0.11, 0.84, Math.min(1.28, SIZE_RANGE.max));

  // every slider: a fresh offset around this writer's natural value, inside a band that stays legible
  const scale = sibling ? 0.35 : wild ? 1.5 : 1;
  let offsets = rollOffsets(natural, who.style, { scale, wild, neat, params: fromEngine?.params });
  // neat only, with the engine judging: the sliders' fresh offsets can still push a neat writer past easy reading
  // (your own slider moves always win, but a roll shouldn't), so smaller swings, then the writer's own hand
  if (neat && engineLegibility) {
    const look = (o: Record<string, number>) => ({ ...s, ...who, pen, penSize, ink, paper, size, offsets: o, occasion: null, amount: 1 });
    const readable = (o: Record<string, number>) => isNeat(effectiveHand(natural, effective(natural, look(o))));
    for (let i = 1; i <= 3 && !readable(offsets); i++) offsets = rollOffsets(natural, who.style, { scale: scale * 0.5 ** i, wild: false, neat, params: undefined });
    if (!readable(offsets)) offsets = {};
  }

  return { ...who, pen, penSize, ink, paper, size, offsets, occasion: null, amount: 1 };
}

function pickInk(pen: string) {
  const options = INK_FAMILIES.filter((f) => !f.pen || f.pen === pen).map((f) => f.id);
  if (MODELLED_INK) options.unshift(AUTO_INK);
  if (pen === 'pencil') return pick(options.map((id) => [id, id === 'graphite' ? 60 : id === AUTO_INK ? 0 : 4] as [string, number]));
  return pick(options.map((id) => [id, INK_WEIGHTS[id] ?? 3] as [string, number]));
}

function rollOffsets(natural: Hand, style: string, o: { scale: number; wild: boolean; neat?: boolean; params?: Record<string, number> }) {
  const connected = !!E.getStyle(style)?.connected;
  const offsets: Record<string, number> = {};
  for (const c of CONTROLS) {
    if (!c.roll || !isShown(c, natural, { connected })) continue;
    const nat = naturalValue(c, natural);
    const span = c.max - c.min;
    const [lo, hi] = o.wild ? [c.min, c.max] : c.roll.band;
    let target = o.params?.[c.key] ?? clamp(nat + gauss() * c.roll.spread * span * o.scale, Math.min(lo, nat), Math.max(hi, nat));
    // neat only: inside the tidy band, even where the writer's own hand is outside it
    const tidy = o.neat && !engineLegibility ? NEAT_BANDS[c.key] : undefined;
    if (tidy) target = clamp(target, tidy[0], tidy[1]);
    const off = target - nat;
    if (Math.abs(off) > span * 0.004) offsets[c.key] = +off.toFixed(4);
  }
  return offsets;
}

/**
 * New hand, and while the note is still a sample letter, the new seed's letter too (lib/samples.ts): before
 * anyone writes, every hand comes with its own text. Once the text is yours, only the look changes.
 */
export function rollHand(s: NoteState, opts: { variety: number; locked: Set<LockKey>; avoid?: ReadonlySet<string> }): Partial<NoteState> {
  const look = rollLook(s, opts);
  if (!s.sample) return look;
  const next = sampleForSeed(look.seed ?? s.seed, look.style ?? s.style, withCurrent(opts.avoid, s.sample));
  return next ? { ...look, sample: next.id, text: next.text, marks: [] } : look;
}

/** A sibling (or any new seed) on an untouched sample letter brings that seed's letter. */
export function withSample(s: NoteState, look: Partial<NoteState>, avoid?: ReadonlySet<string>): Partial<NoteState> {
  if (!s.sample) return look;
  const next = sampleForSeed(look.seed ?? s.seed, look.style ?? s.style, withCurrent(avoid, s.sample));
  return next ? { ...look, sample: next.id, text: next.text, marks: [] } : look;
}

/** the letters to steer clear of: the ones just shown, and the one on the page now */
function withCurrent(avoid: ReadonlySet<string> | undefined, current: string | null) {
  const out = new Set(avoid ?? []);
  if (current) out.add(current);
  return out;
}
