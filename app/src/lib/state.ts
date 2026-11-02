// The whole note configuration, and how it travels in a share link.
// Link format (in the URL hash, readable where it can be):
//   #seed=quiet-heron-17&style=script&paper=seyes&ink=royal&size=1.1&o=n0.72.s4.5.w50.p0.3&t=<lz-string>
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { getStyle } from '@engine';
import { PAPERS, DEFAULT_PAPER, type PaperId } from './papers';
import { INKS, DEFAULT_INK } from './inks';
import { clamp } from './utils';

export type OverrideKey = 'neatness' | 'slant' | 'penWidth' | 'pressure';
export type Overrides = Partial<Record<OverrideKey, number>>;

export interface NoteState {
  seed: string;
  style: string;
  overrides: Overrides;
  /** writing size, relative to the paper's comfortable size */
  size: number;
  paper: PaperId;
  ink: string;
  text: string;
}

export const DEFAULT_TEXT =
  'Dear Ada,\n\nThe little letters never quite match, and that is the point. ' +
  'Every word I write to you comes out a touch different, the way it would if I sat down with a real pen.\n\n' +
  'See you on Sunday at 7:30. Bring the old maps & a good pen!\n\nYours,\nO.';

export const DEFAULT_STATE: NoteState = {
  seed: 'quiet-heron-17',
  style: 'script',
  overrides: {},
  size: 1,
  paper: DEFAULT_PAPER,
  ink: DEFAULT_INK,
  text: DEFAULT_TEXT,
};

export const SIZE_RANGE = { min: 0.75, max: 1.35, step: 0.01 };

// compact keys for overrides in the link
const OKEYS: Record<OverrideKey, string> = { neatness: 'n', slant: 's', penWidth: 'w', pressure: 'p' };
const OKEYS_REV = Object.fromEntries(Object.entries(OKEYS).map(([k, v]) => [v, k])) as Record<string, OverrideKey>;

const round = (v: number, d: number) => +v.toFixed(d);

export function encodeState(s: NoteState): string {
  const q = new URLSearchParams();
  q.set('seed', s.seed);
  q.set('style', s.style);
  q.set('paper', s.paper);
  q.set('ink', s.ink);
  if (Math.abs(s.size - 1) > 0.005) q.set('size', String(round(s.size, 2)));
  const o = (Object.keys(s.overrides) as OverrideKey[])
    .filter((k) => s.overrides[k] != null)
    .map((k) => OKEYS[k] + round(s.overrides[k]!, 2))
    .join('_');
  if (o) q.set('o', o);
  if (s.text !== DEFAULT_TEXT) q.set('t', compressToEncodedURIComponent(s.text));
  return q.toString();
}

/** Parse a hash/query string. Anything missing or invalid falls back to the defaults. */
export function decodeState(hash: string, base: NoteState = DEFAULT_STATE): NoteState {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const s: NoteState = { ...base, overrides: {} };
  const seed = q.get('seed');
  if (seed && seed.trim()) s.seed = seed.trim().slice(0, 64);
  const style = q.get('style');
  if (style && getStyle(style)) s.style = style;
  const paper = q.get('paper');
  if (paper && PAPERS.some((p) => p.id === paper)) s.paper = paper as PaperId;
  const ink = q.get('ink');
  if (ink && INKS.some((i) => i.id === ink)) s.ink = ink;
  const size = parseFloat(q.get('size') || '');
  if (Number.isFinite(size)) s.size = clamp(size, SIZE_RANGE.min, SIZE_RANGE.max);
  const o = q.get('o');
  if (o) {
    for (const part of o.split('_')) {
      const key = OKEYS_REV[part[0]];
      const v = parseFloat(part.slice(1));
      if (key && Number.isFinite(v)) s.overrides[key] = v;
    }
  }
  const t = q.get('t');
  if (t != null) {
    const text = decompressFromEncodedURIComponent(t);
    if (text != null) s.text = text.slice(0, 20000);
  } else if (seed) {
    s.text = base.text;
  }
  return s;
}

export function shareUrl(s: NoteState) {
  const u = new URL(window.location.href);
  u.hash = encodeState(s);
  return u.toString();
}
