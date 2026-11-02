// Sample letters (content/sample-texts.json): before anyone writes, each hand writes a short real letter,
// public domain and credited. The array order is the New hand order (content/SAMPLE-TEXTS.md: favourites
// first, then the languages take turns). A New hand steps to the next letter, preferring one whose
// traditions suit the new style; once the note is edited the text is the writer's and stays.
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
  suetterlin: ['sutterlin', 'german-kurrent'],
  arrighi: ['italian-chancery'],
  'quebec-print': ['modern-adult', 'french-school'],
};

const suits = (s: SampleText, style: string) => {
  const want = STYLE_TRADITIONS[style];
  return !want || (s.traditions ?? []).some((t) => want.includes(t));
};

export const sampleById = (id: string | null | undefined) => (id ? SAMPLES.find((s) => s.id === id) : undefined);

/** The first letter a visitor sees. */
export const FIRST_SAMPLE = SAMPLES[0];

/** The next letter in the New hand order that suits the style (the very next one for everyday styles). */
export function nextSample(currentId: string | null, style: string): SampleText | undefined {
  if (!SAMPLES.length) return undefined;
  const i = SAMPLES.findIndex((s) => s.id === currentId);
  for (let d = 1; d <= SAMPLES.length; d++) {
    const s = SAMPLES[(i + d + SAMPLES.length) % SAMPLES.length];
    if (suits(s, style)) return s;
  }
  return SAMPLES[(i + 1 + SAMPLES.length) % SAMPLES.length];
}

/** A letter for a seed with no letter named (an older link): the same seed always gets the same one. */
export function sampleForSeed(seed: string, style: string): SampleText | undefined {
  if (!SAMPLES.length) return undefined;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const pool = SAMPLES.filter((s) => suits(s, style));
  const from = pool.length ? pool : SAMPLES;
  return from[(h >>> 0) % from.length];
}

/** "Words: Emily Dickinson, 1861" (and the translator, when there is one). */
export function sampleCredit(s: SampleText) {
  return `Words: ${s.author}, ${s.year}${s.translator ? `, translated by ${s.translator.name}` : ''}`;
}
