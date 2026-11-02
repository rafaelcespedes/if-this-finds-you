// The whole note configuration, and how it travels in a share link.
// Link format (URL hash, readable where it can be):
//   #seed=quiet-heron-17&style=script&pen=fountain&tip=fine&ink=royal-blue&paper=seyes&size=1.1
//    &o=ne0.12_sl-3&occ=love&amt=1.2&t=<lz-string>
// `o` holds seed-relative offsets with two-letter codes (lib/controls.ts), so the same link always
// writes the same note.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { getStyle } from '@engine';
import { PAPERS, DEFAULT_PAPER, type PaperId } from './papers';
import { AUTO_INK, DEFAULT_INK, INK_FAMILIES } from './inks';
import { PEN_CHOICES } from './pens';
import { CONTROLS, controlByCode, controlByKey, PEN_SIZES, type PenSize } from './controls';
import { OCCASIONS } from './occasions';
import { clamp } from './utils';

export interface NoteState {
  seed: string;
  style: string;
  /** seed-relative offsets, by control key */
  offsets: Record<string, number>;
  pen: string;
  penSize: PenSize;
  ink: string;
  /** writing size, relative to the paper's comfortable size */
  size: number;
  paper: PaperId;
  occasion: string | null;
  /** occasion amount, 0..1.5 */
  amount: number;
  text: string;
}

export const DEFAULT_TEXT =
  'Dear Ada,\n\nThe little letters never quite match, and that is the point. ' +
  'Every word I write to you comes out a touch different, the way it would if I sat down with a real pen.\n\n' +
  'See you on Sunday at 7:30. Bring the old maps & a good pen!\n\nYours,\nO.';

export const DEFAULT_STATE: NoteState = {
  seed: 'quiet-heron-17',
  style: 'script',
  offsets: {},
  pen: 'auto',
  penSize: 'medium',
  ink: DEFAULT_INK,
  size: 1,
  paper: DEFAULT_PAPER,
  occasion: null,
  amount: 1,
  text: DEFAULT_TEXT,
};

export const SIZE_RANGE = { min: 0.7, max: 1.45, step: 0.01 };
export const AMOUNT_RANGE = { min: 0, max: 1.5, step: 0.01 };

const round = (v: number, d: number) => +v.toFixed(d);

export function encodeState(s: NoteState): string {
  const q = new URLSearchParams();
  q.set('seed', s.seed);
  q.set('style', s.style);
  if (s.pen !== 'auto') q.set('pen', s.pen);
  if (s.penSize !== 'medium') q.set('tip', s.penSize);
  q.set('ink', s.ink);
  q.set('paper', s.paper);
  if (Math.abs(s.size - 1) > 0.005) q.set('size', String(round(s.size, 2)));
  const o = Object.entries(s.offsets)
    .filter(([k, v]) => v && controlByKey(k))
    .map(([k, v]) => controlByKey(k)!.code + round(v, 3))
    .join('_');
  if (o) q.set('o', o);
  if (s.occasion) {
    q.set('occ', s.occasion);
    if (Math.abs(s.amount - 1) > 0.005) q.set('amt', String(round(s.amount, 2)));
  }
  if (s.text !== DEFAULT_TEXT) q.set('t', compressToEncodedURIComponent(s.text));
  return q.toString();
}

/** Parse a hash/query string. Anything missing or invalid falls back to the defaults. */
export function decodeState(hash: string, base: NoteState = DEFAULT_STATE): NoteState {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const s: NoteState = { ...base, offsets: {}, occasion: null, amount: 1 };
  const seed = q.get('seed');
  if (seed && seed.trim()) s.seed = seed.trim().slice(0, 64);
  const style = q.get('style');
  if (style && getStyle(style)) s.style = style;
  const pen = q.get('pen');
  if (pen && PEN_CHOICES.some((p) => p.id === pen)) s.pen = pen;
  const tip = q.get('tip');
  if (tip && PEN_SIZES.some((p) => p.id === tip)) s.penSize = tip as PenSize;
  const ink = q.get('ink');
  if (ink && (ink === AUTO_INK || INK_FAMILIES.some((i) => i.id === ink))) s.ink = ink;
  const paper = q.get('paper');
  if (paper && PAPERS.some((p) => p.id === paper)) s.paper = paper as PaperId;
  const size = parseFloat(q.get('size') || '');
  if (Number.isFinite(size)) s.size = clamp(size, SIZE_RANGE.min, SIZE_RANGE.max);
  const o = q.get('o');
  if (o) {
    for (const part of o.split('_')) {
      const c = controlByCode(part.slice(0, 2));
      const v = parseFloat(part.slice(2));
      if (c && Number.isFinite(v)) s.offsets[c.key] = clamp(v, -(c.max - c.min), c.max - c.min);
    }
  }
  const occ = q.get('occ');
  if (occ && OCCASIONS.some((x) => x.id === occ)) {
    s.occasion = occ;
    const amt = parseFloat(q.get('amt') || '');
    if (Number.isFinite(amt)) s.amount = clamp(amt, AMOUNT_RANGE.min, AMOUNT_RANGE.max);
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
  u.search = ''; // never share preview flags
  u.hash = encodeState(s);
  return u.toString();
}

/** Offsets that survive a new hand: How and With-what controls keep yours, Who controls reset. */
export function offsetsForNewHand(offsets: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(offsets)) {
    const c = CONTROLS.find((x) => x.key === k);
    if (c && c.zone !== 'who') out[k] = v;
  }
  return out;
}
