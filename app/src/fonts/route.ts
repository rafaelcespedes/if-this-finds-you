// The Fonts view's state, all of it in the URL so a set can be shared and comes back the same:
//   /fonts?set=k7f2q&f=script&t=palmer.spencerian&n=careful&s=slight&p=fountain&any=1&text=…&size=72&show=ink&view=saved
// `set` and the filters decide which hands; `any=1` is Neat hands only switched off; text, size and show are how the
// specimens are written. Defaults are left out.
import { NO_FILTERS, readFilters, writeFilters, type Catalogue, type Filters } from './filters';
import type { Mode } from './protocol';

export interface FontsRoute {
  set: string;
  filters: Filters;
  neatOnly: boolean;
  /** the visitor's own preview text, or '' for the default line */
  text: string;
  /** px per em; 0 = the default for the screen */
  size: number;
  mode: Mode;
  view: 'set' | 'saved';
}

/** The line every hand writes until you type your own: every letter of the alphabet, as a short note. */
export const DEFAULT_TEXT = 'Dear Jo, the quick brown fox jumps over the lazy dog.';
/** Plain first: it shows the font as it downloads; ink on paper is a click away. */
export const DEFAULT_MODE: Mode = 'plain';
export const SIZE = { min: 28, max: 144, step: 1 };
export const defaultSize = (narrow: boolean) => (narrow ? 44 : 72);
/** How many hands a set holds. */
export const SET_COUNT = 20;

export const newSetSeed = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0].toString(36).slice(0, 6).padStart(5, '0');
};

export function readRoute(search: string, cat?: Catalogue): FontsRoute {
  const q = new URLSearchParams(search);
  const set = (q.get('set') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  const size = Number(q.get('size'));
  return {
    set,
    filters: readFilters(q, cat),
    neatOnly: q.get('any') !== '1',
    text: (q.get('text') ?? '').slice(0, 160),
    size: Number.isFinite(size) && size >= SIZE.min && size <= SIZE.max ? Math.round(size) : 0,
    mode: q.get('show') === 'ink' ? 'ink' : q.get('show') === 'plain' ? 'plain' : DEFAULT_MODE,
    view: q.get('view') === 'saved' ? 'saved' : 'set',
  };
}

/** The URL for a state (keeps any other params on the page, like ?logo= or ?toolbar=). */
export function routeSearch(r: FontsRoute, base = location.search) {
  const q = new URLSearchParams(base);
  q.set('set', r.set);
  writeFilters(q, r.filters);
  if (!r.neatOnly) q.set('any', '1'); else q.delete('any');
  if (r.text && r.text !== DEFAULT_TEXT) q.set('text', r.text); else q.delete('text');
  if (r.size) q.set('size', String(r.size)); else q.delete('size');
  if (r.mode !== DEFAULT_MODE) q.set('show', r.mode); else q.delete('show');
  if (r.view === 'saved') q.set('view', 'saved'); else q.delete('view');
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const EMPTY_ROUTE: FontsRoute = { set: '', filters: NO_FILTERS, neatOnly: true, text: '', size: 0, mode: DEFAULT_MODE, view: 'set' };
