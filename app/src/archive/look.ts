// The hand a letter is written out in. Runs in the card worker (the index) and on the letter page; both give the
// same look for the same letter, so a card and its page match.
//
// - A letter's own hand comes from its id through the engine's sampler (sampleLook), so it never changes. Its
//   era and tradition steer the choice: letters with the oldest spellings only in hands taught before 1700 (as the
//   tool's sample letters), a taught hand from the letter's own tradition where the engine has one, a dip pen
//   before the fountain pen, and plain or laid writing paper before exercise-book rulings and dot grids.
// - A chosen hand (Shuffle, New hand) travels in the URL as `seed~style`, and lookOf() turns it into the very same
//   look anywhere. "Keep this hand" on a letter in its own hand keeps that letter's look (`of:<id>`).
import * as E from '@engine';
import { getStyle, makeHand, withOverrides, type Hand } from '@engine';
import { getPaper, type PaperSpec } from '@/lib/papers';
import { inkColor } from '@/lib/inks';
import { MODELLED_INK, PARAM_KEYS } from '@/lib/engine-features';
import type { ArchiveLetter, Look } from './model';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;
const sampleLook = (opts: Record<string, unknown>) => engine.sampleLook(opts);
const lookOf = (seed: string, style: string, locked: Record<string, string> = {}) => engine.lookOf(seed, style, locked);

/** The engine sampler's papers, as the tool's paper ids (getPaper resolves them if the tool renames its papers). */
const ENGINE_PAPER: Record<string, string> = { plain: 'plain', 'us-ruled': 'college', seyes: 'seyes', 'uk-feint': 'feint', grid: 'squared', dots: 'dots' };

/** Taught hands that suit a letter tradition (content/SAMPLE-TEXTS.md, "Pairing"). Styles the engine lacks drop out. */
const TRADITION_STYLES: Record<string, string[]> = {
  'american-business': ['palmer', 'spencerian'],
  'italian-chancery': ['arrighi'],
  'dutch-running': ['dutch-1618'],
  'spanish-letra-espanola': ['spanish-1776'],
  'german-kurrent': ['suetterlin', 'kurrent-1849'],
  'french-school': ['quebec-print', 'adult-fr-2023'],
  'norwegian-roundhand': ['norwegian-1849'],
  'polish-copperplate': ['polish-1906'],
};

const eraYear = (style: string) => Number(((getStyle(style) as any)?.tradition?.era ?? '').match(/\d{4}/)?.[0] ?? 0);
/** A hand taught before 1700: the only ones that write the oldest spellings. */
export const olderHand = (style: string) => { const y = eraYear(style); return y > 0 && y < 1700; };
/** Hard to read today (Kurrent, Dutch running hand): only for letters that need an older hand. */
const historical = (style: string) => !!engine.isHistorical?.(style) || (getStyle(style) as any)?.tradition?.legibility === 'historical';
const styleExists = (s: string) => !!getStyle(s);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pick = <T,>(list: T[], key: string) => list[hash(key) % list.length];

const OLDER_STYLES = () => (engine.styleNames() as string[]).filter(olderHand);

/** The style a letter's own hand is taught in, or null for the sampler's free choice. */
function styleFor(l: ArchiveLetter): string | null {
  const suited = (l.traditions ?? []).flatMap((t) => TRADITION_STYLES[t] ?? []).filter(styleExists);
  if (l.olderHandsOnly) {
    const old = suited.filter(olderHand);
    return pick(old.length ? old : OLDER_STYLES(), 'old:' + l.id);
  }
  const readable = suited.filter((s) => !historical(s));
  // most letters with a matching tradition get it; a few are written out by someone schooled elsewhere
  if (readable.length && hash('suits:' + l.id) % 10 < 8) return pick(readable, 'style:' + l.id);
  return null;
}

/** What the writer of this period wrote with and on (locks for the sampler). */
function periodLocks(l: ArchiveLetter, style: string | null): Record<string, string> {
  const y = l.year ?? 2000;
  const locks: Record<string, string> = {};
  const r = hash('period:' + l.id) % 100;
  if (y < 1880) locks.pen = style === 'arrighi' ? 'italic' : 'pointed';
  else if (y < 1950) locks.pen = r < 60 ? 'fountain' : 'pointed';
  if (y < 1950) locks.paper = 'plain';
  return locks;
}

/** A letter's own hand: fixed by its id. */
export function letterLook(l: ArchiveLetter): Look {
  if (l.look) return l.look;
  const style = styleFor(l);
  const locks = periodLocks(l, style);
  const family = style ? (getStyle(style) as any)?.family : undefined;
  let look = sampleLook({ entropy: 'letter:' + l.id, locked: locks, ...(family ? { family } : {}) });
  if (style && look.style !== style) look = lookOf(look.seed, style, locks);
  // before 1800 most writing paper was laid
  const laid = locks.paper === 'plain' && (l.year ?? 2000) < 1800;
  return toLook(look, laid ? 'laid' : undefined);
}

/** A chosen hand ("seed~style"), for any letter (letters with the oldest spellings keep an older hand). */
export function handLook(hand: string, l?: ArchiveLetter): Look | null {
  const parsed = parseHand(hand);
  if (!parsed) return null;
  // letters with the oldest spellings keep the writer but take an older hand, with that period's pen and paper
  if (l?.olderHandsOnly && !olderHand(parsed.style)) {
    const style = pick(OLDER_STYLES(), 'old:' + parsed.seed);
    const locks = periodLocks(l, style);
    return toLook(lookOf(parsed.seed, style, locks), l.year != null && l.year < 1800 ? 'laid' : undefined);
  }
  return toLook(lookOf(parsed.seed, parsed.style));
}

/**
 * The look for a letter: its own hand, a chosen hand (`seed~style`), or another letter's own hand (`of:<id>`,
 * "Keep this hand" on a letter shown in its own hand; `find` looks that letter up).
 */
export function lookFor(l: ArchiveLetter, hand?: string | null, find?: (id: string) => ArchiveLetter | undefined): Look {
  if (hand?.startsWith('of:')) {
    const from = find?.(hand.slice(3));
    if (!from) return letterLook(l);
    const own = letterLook(from);
    // letters with the oldest spellings still need an older hand
    return l.olderHandsOnly && !olderHand(own.style) ? handLook(handOf(own), l) ?? letterLook(l) : own;
  }
  return (hand && handLook(hand, l)) || letterLook(l);
}

/** "quiet-heron-17~palmer" → { seed, style } (a family name is fine too: the writer picks a tradition in it). */
export function parseHand(hand: string | null | undefined) {
  const m = (hand ?? '').trim().match(/^([a-z0-9-]{2,48})~([a-z0-9-]{2,32})$/i);
  if (!m) return null;
  const style = m[2].toLowerCase();
  const ok = styleExists(style) || (engine.families?.() as string[] | undefined)?.includes(style);
  return ok ? { seed: m[1].toLowerCase(), style } : null;
}
export const handOf = (look: Pick<Look, 'seed' | 'style'>) => `${look.seed}~${look.style}`;

function toLook(x: any, paper?: string): Look {
  const sheet = getPaper(paper ?? ENGINE_PAPER[x.paper] ?? x.paper ?? 'plain');
  return {
    seed: String(x.seed),
    style: String(x.style ?? makeHand(x.seed, x.family).style),
    pen: x.pen,
    tip: x.tip ?? 'medium',
    ink: x.ink,
    paper: sheet.id,
    // the sampler gives an x-height in mm; the tool's Size is relative to the paper's comfortable x-height. Kept
    // between 0.84x and 1.28x, so every letter stays readable
    size: x.size > 0 ? +Math.min(1.28, Math.max(0.84, x.size / sheet.xh)).toFixed(3) : 1,
    params: { ...(x.params ?? {}), ...(x.inkAge != null ? { inkAge: x.inkAge } : {}), ...(x.inkVariation != null ? { inkVariation: x.inkVariation } : {}) },
  };
}

export interface Rendering {
  p: Hand;
  paper: PaperSpec;
  /** the tool's Size (x-height relative to the paper's) */
  size: number;
  lineSpacing: number;
  /** modelled ink key, or null when the engine paints flat ink */
  inkKey: string | null;
  /** CSS colour for flat ink and UI */
  inkColor: string;
}

/** What the tool's renderer needs for a look: the hand with its pen and values, the paper, the size. */
export function renderingOf(look: Look): Rendering {
  const paper = getPaper(look.paper);
  const overrides: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(look.params)) if (PARAM_KEYS.has(k) && k !== 'size') overrides[k] = v;
  if (PARAM_KEYS.has('pen') && look.pen) overrides.pen = look.pen;
  if (PARAM_KEYS.has('tip') && look.tip) overrides.tip = look.tip;
  if (MODELLED_INK && look.ink) overrides.ink = look.ink;
  const p = withOverrides(makeHand(look.seed, look.style), overrides);
  return { p, paper, size: look.size > 0 ? look.size : 1, lineSpacing: 1, inkKey: MODELLED_INK ? look.ink : null, inkColor: inkColor(look.ink) };
}
