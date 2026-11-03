// The letter face: a serif beside Atkinson Hyperlegible Next for the letters' own words (titles, the story, the record,
// the text). Piazzolla (Rafael's pick, 3 Nov 2026, docs/research/type-system), and four others to compare in place:
// ?serif=1…5 (1 Newsreader, 2 Source Serif 4, 3 Literata, 4 Fraunces soft, 5 Piazzolla), kept for the tab, never put
// into share links. Only the chosen face is loaded. All five are under the SIL Open Font License 1.1, via @fontsource.

export interface Serif {
  id: '1' | '2' | '3' | '4' | '5';
  name: string;
  /** CSS font-family (the @fontsource face name, then fallbacks) */
  family: string;
  /** size relative to the sans at the same nominal size (each face's x-height differs a little) */
  scale: number;
  /** extra font-variation-settings (Fraunces: the soft, un-wonky cut) */
  variation?: string;
  load: () => Promise<unknown>;
  licence: string;
}

export const SERIFS: Serif[] = [
  {
    id: '1', name: 'Newsreader', family: "'Newsreader Variable', Georgia, serif", scale: 1.04,
    load: () => import('@fontsource-variable/newsreader/opsz.css'),
    licence: 'SIL OFL 1.1 (Production Type)',
  },
  {
    id: '2', name: 'Source Serif 4', family: "'Source Serif 4 Variable', Georgia, serif", scale: 0.98,
    load: () => import('@fontsource-variable/source-serif-4/opsz.css'),
    licence: 'SIL OFL 1.1 (Adobe)',
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
  {
    // x-height 0.478 em against Newsreader's 0.426: 0.94 lands it where the research prototype showed it
    id: '5', name: 'Piazzolla', family: "'Piazzolla Variable', Georgia, serif", scale: 0.94,
    load: () => Promise.all([import('@fontsource-variable/piazzolla/opsz.css'), import('@fontsource-variable/piazzolla/opsz-italic.css')]),
    licence: 'SIL OFL 1.1 (Huerta Tipográfica)',
  },
];

/** Piazzolla: a text face with optical sizes (8–30) and a true italic, rarer than Newsreader, and darker beside ink. */
const DEFAULT: Serif['id'] = '5';

function readSerif(): Serif {
  let id: string | null = null;
  try {
    const asked = new URLSearchParams(location.search).get('serif');
    if (asked && SERIFS.some((s) => s.id === asked)) { sessionStorage.setItem('seedhand:serif', asked); id = asked; }
    else id = sessionStorage.getItem('seedhand:serif');
  } catch { /* storage off: the default */ }
  return SERIFS.find((s) => s.id === id) ?? SERIFS.find((s) => s.id === DEFAULT)!;
}

export const SERIF: Serif = typeof location !== 'undefined' ? readSerif() : SERIFS.find((s) => s.id === DEFAULT)!;

/** Load the chosen face and point the page's letter font at it (--font-letter, --letter-scale). */
export function applySerif() {
  const root = document.documentElement;
  root.style.setProperty('--font-letter', SERIF.family);
  root.style.setProperty('--letter-scale', String(SERIF.scale));
  root.style.setProperty('--letter-variation', SERIF.variation ?? 'normal');
  root.dataset.serif = SERIF.id;
  return SERIF.load().catch(() => { /* the fallback serif shows */ });
}
