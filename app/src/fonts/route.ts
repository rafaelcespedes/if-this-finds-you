// The Fonts view's state, all of it in the URL so a set can be shared and comes back the same:
//   /fonts?set=k7f2q&f=script&t=palmer.spencerian&n=careful&s=forward&p=fountain&any=1&line=pangram&text=…&size=56&show=live&view=saved
// `set` and the filters decide which hands; `any=1` is Neat hands only switched off; line, text, size and show are
// how the specimens are written. Defaults are left out.
import { NO_FILTERS, readFilters, writeFilters, type Catalogue, type Filters } from './filters';
import type { Mode } from './protocol';

/** What every row writes: the set's letter opening (default), a preset, the writer's own name, or your words. */
export type Line = 'letter' | 'pangram' | 'alphabet' | 'figures' | 'name' | 'own';
export const LINES: { id: Line; label: string; text?: string }[] = [
  { id: 'letter', label: 'A letter’s opening' },
  { id: 'pangram', label: 'Every letter', text: 'Jack, my dear, I wove six quilts for the big zoo prize. Write back soon!' },
  { id: 'alphabet', label: 'Alphabet', text: 'Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz' },
  { id: 'figures', label: 'Figures', text: '0 1 2 3 4 5 6 7 8 9 · 12 March 1923 · £4.50 & 7 o’clock' },
  { id: 'name', label: 'Their name' },
];
/** Until a set's letter arrives (and if the library is missing). */
export const FALLBACK_TEXT = 'Dear, dear Friend, Can you guess how happy I am?';

export interface FontsRoute {
  set: string;
  filters: Filters;
  neatOnly: boolean;
  line: Line;
  /** your own words (line = own) */
  text: string;
  /** px per em; 0 = the default for the screen */
  size: number;
  mode: Mode;
  view: 'set' | 'saved';
}

/** As a font first: it shows what you download; the live hand is a click away. */
export const DEFAULT_MODE: Mode = 'font';
export const SIZE = { min: 24, max: 128, step: 1 };
export const defaultSize = (narrow: boolean) => (narrow ? 40 : 60);
/** How many hands a set holds (24: under a second to draw, and it divides by 2, 3, 4 and 6 if a grid comes later). */
export const SET_COUNT = 24;

export const newSetSeed = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0].toString(36).slice(0, 6).padStart(5, '0');
};

export function readRoute(search: string, cat?: Catalogue): FontsRoute {
  const q = new URLSearchParams(search);
  const set = (q.get('set') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  const size = Number(q.get('size'));
  const text = (q.get('text') ?? '').slice(0, 160);
  const asked = q.get('line') as Line | null;
  const line: Line = text ? 'own' : asked && LINES.some((l) => l.id === asked) ? asked : 'letter';
  return {
    set,
    filters: readFilters(q, cat),
    neatOnly: q.get('any') !== '1',
    line,
    text,
    size: Number.isFinite(size) && size >= SIZE.min && size <= SIZE.max ? Math.round(size) : 0,
    mode: q.get('show') === 'live' ? 'live' : DEFAULT_MODE,
    view: q.get('view') === 'saved' ? 'saved' : 'set',
  };
}

/** The URL for a state (keeps any other params on the page, like ?logo= or ?look=). */
export function routeSearch(r: FontsRoute, base = location.search) {
  const q = new URLSearchParams(base);
  q.set('set', r.set);
  writeFilters(q, r.filters);
  if (!r.neatOnly) q.set('any', '1'); else q.delete('any');
  if (r.line === 'own' && r.text) { q.set('text', r.text); q.delete('line'); }
  else { q.delete('text'); if (r.line !== 'letter' && r.line !== 'own') q.set('line', r.line); else q.delete('line'); }
  if (r.size) q.set('size', String(r.size)); else q.delete('size');
  if (r.mode !== DEFAULT_MODE) q.set('show', r.mode); else q.delete('show');
  if (r.view === 'saved') q.set('view', 'saved'); else q.delete('view');
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const EMPTY_ROUTE: FontsRoute = { set: '', filters: NO_FILTERS, neatOnly: true, line: 'letter', text: '', size: 0, mode: DEFAULT_MODE, view: 'set' };
