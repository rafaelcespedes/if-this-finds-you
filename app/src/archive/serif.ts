// The letter face: a serif beside Instrument Sans for the letters' own words (titles, the story, the record, the
// text). Four candidates to compare in place, like the logo: ?serif=1…4, kept for the tab, never put into share links.
// Only the chosen face is loaded. All four are under the SIL Open Font License 1.1, self-hosted via @fontsource.

export interface Serif {
  id: '1' | '2' | '3' | '4';
  name: string;
  /** CSS font-family (the @fontsource face name, then fallbacks) */
  family: string;
  /** size relative to the sans at the same nominal size (Instrument Serif runs small and narrow) */
  scale: number;
  /** extra font-variation-settings (Fraunces: the soft, un-wonky cut) */
  variation?: string;
  load: () => Promise<unknown>;
  licence: string;
}

export const SERIFS: Serif[] = [
  {
    id: '1', name: 'Instrument Serif', family: "'Instrument Serif', Georgia, serif", scale: 1.16,
    load: () => Promise.all([import('@fontsource/instrument-serif/400.css'), import('@fontsource/instrument-serif/400-italic.css')]),
    licence: 'SIL OFL 1.1 (Instrument)',
  },
  {
    id: '2', name: 'Newsreader', family: "'Newsreader Variable', Georgia, serif", scale: 1.04,
    load: () => import('@fontsource-variable/newsreader/opsz.css'),
    licence: 'SIL OFL 1.1 (Production Type)',
  },
  {
    id: '3', name: 'Literata', family: "'Literata Variable', Georgia, serif", scale: 0.98,
    load: () => import('@fontsource-variable/literata/opsz.css'),
    licence: 'SIL OFL 1.1 (TypeTogether)',
  },
  {
    id: '4', name: 'Fraunces (soft)', family: "'Fraunces Variable', Georgia, serif", scale: 0.98, variation: "'SOFT' 100, 'WONK' 0",
    load: () => import('@fontsource-variable/fraunces/soft.css'),
    licence: 'SIL OFL 1.1 (Undercase Type)',
  },
];

/** Instrument Serif: the same foundry as the interface's sans, so the natural pair. */
const DEFAULT: Serif['id'] = '1';

function readSerif(): Serif {
  let id: string | null = null;
  try {
    const asked = new URLSearchParams(location.search).get('serif');
    if (asked && SERIFS.some((s) => s.id === asked)) { sessionStorage.setItem('seedhand:serif', asked); id = asked; }
    else id = sessionStorage.getItem('seedhand:serif');
  } catch { /* storage off: the default */ }
  return SERIFS.find((s) => s.id === id) ?? SERIFS.find((s) => s.id === DEFAULT)!;
}

export const SERIF: Serif = typeof location !== 'undefined' ? readSerif() : SERIFS[0];

/** Load the chosen face and point the page's letter font at it (--font-letter, --letter-scale). */
export function applySerif() {
  const root = document.documentElement;
  root.style.setProperty('--font-letter', SERIF.family);
  root.style.setProperty('--letter-scale', String(SERIF.scale));
  root.style.setProperty('--letter-variation', SERIF.variation ?? 'normal');
  root.dataset.serif = SERIF.id;
  return SERIF.load().catch(() => { /* the fallback serif shows */ });
}
