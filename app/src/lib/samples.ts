// Sample letters (content/sample-texts.json): before anyone writes, each hand writes a short real letter,
// public domain and credited. The seed picks the letter (a hash over the enabled letters), so a seed always
// writes the same one and a shared link reproduces it; letters whose traditions suit the hand come first, and
// the oldest spellings (before 1660) only come with historical hands. Once the note is edited, the text is the
// writer's and stays.
import { getStyle } from '@engine';
import raw from '../../../content/sample-texts.json';

export interface SampleText {
  id: string;
  text: string;
  kind: string;
  lang: string;
  title?: string;
  author: string;
  year: number;
  translator?: { name: string };
  source?: { name: string; url: string };
  traditions?: string[];
  enabled?: boolean;
}

export const SAMPLES: SampleText[] = (raw as unknown as SampleText[]).filter((s) => s.enabled !== false && s.text);

/** The engine's styles and the letter traditions that feel at home in them (SAMPLE-TEXTS.md, "Pairing"). */
const STYLE_TRADITIONS: Record<string, string[]> = {
  palmer: ['american-business'],
  spencerian: ['american-business'],
  suetterlin: ['sutterlin', 'german-kurrent'],
  'kurrent-1849': ['german-kurrent'],
  arrighi: ['italian-chancery'],
  'quebec-print': ['modern-adult', 'french-school'],
  'adult-fr-2023': ['french-school', 'modern-adult'],
  'norwegian-1849': ['norwegian-roundhand'],
  'polish-1906': ['polish-copperplate'],
  'spanish-1776': ['spanish-letra-espanola'],
  'dutch-1618': ['dutch-running'],
};

const suits = (s: SampleText, style: string) => {
  const want = STYLE_TRADITIONS[style];
  return !want || (s.traditions ?? []).some((t) => want.includes(t));
};

/**
 * What the first key on an untouched sample letter does:
 *   'reply' - a fresh sheet: the writer starts their own letter, a reply, with the found letter kept one tap away
 *   'onto'  - writes onto the found letter (in Ink: its words are taken as already written, corrections and all)
 */
export const SAMPLE_FIRST_KEY: 'reply' | 'onto' = 'reply';

export const sampleById = (id: string | null | undefined) => (id ? SAMPLES.find((s) => s.id === id) : undefined);

/** A hand taught before 1700 (the engine's tradition era): it may write letters in the oldest spellings. */
function historical(style: string) {
  const era = (getStyle(style) as unknown as { tradition?: { era?: string } } | undefined)?.tradition?.era ?? '';
  const y = Number((era.match(/\d{4}/) || [''])[0]);
  return y > 0 && y < 1700;
}

/**
 * The letter a seed writes, in this style: picked by the seed, so it doesn't change on its own; `avoid` (the
 * letters just shown) moves it on to the next one in the pool, so flipping never brings the same letter back
 * soon. Shared links name the letter, so they never depend on this.
 */
export function sampleForSeed(seed: string, style: string, avoid?: ReadonlySet<string>): SampleText | undefined {
  if (!SAMPLES.length) return undefined;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const old = historical(style);
  const fit = SAMPLES.filter((s) => old || s.year >= 1660);
  const suited = fit.filter((s) => suits(s, style) && STYLE_TRADITIONS[style]);
  // a small pool (a tradition with few letters) still tries the wider collection before repeating
  const pools = [suited, fit, SAMPLES].filter((p) => p.length);
  const start = h >>> 0;
  for (const pool of pools) {
    for (let d = 0; d < pool.length; d++) {
      const s = pool[(start + d) % pool.length];
      if (!avoid?.has(s.id)) return s;
    }
  }
  return pools[0][start % pools[0].length];
}

// ---------- the letters just shown, so New hand and Another letter don't bring them back soon ----------
const RECENT_KEY = 'seedhand:recent-letters';
const RECENT = 10;
let recent: string[] = (() => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((x: unknown) => typeof x === 'string').slice(0, RECENT); } catch { return []; }
})();
export const recentLetters = (): ReadonlySet<string> => new Set(recent);
export function sawLetter(id: string | null | undefined) {
  if (!id || recent[0] === id) return;
  recent = [id, ...recent.filter((x) => x !== id)].slice(0, RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* fine */ }
}

/** "Letter: Kamma Rahbek, 1813" (or "Note: …"; and the translator, when there is one). */
export function sampleCredit(s: SampleText) {
  return `${s.kind === 'note' ? 'Note' : 'Letter'}: ${s.author}, ${s.year}${s.translator ? `, translated by ${s.translator.name}` : ''}`;
}
