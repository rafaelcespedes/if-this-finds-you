// The whole note configuration, and how it travels in a share link.
// Link format (URL hash, readable where it can be):
//   #seed=quiet-heron-17&style=script&pen=fountain&tip=fine&ink=royal-blue&paper=seyes&size=1.1
//    &o=ne0.12_sl-3&occ=love&amt=1.2&t=<lz-string>   (or s=<sample letter id> while the text is a sample,
//    or k=<lz-string of the ink log> for a letter written in ink; mode=fair when Ink mode is off)
// `o` holds seed-relative offsets with two-letter codes (lib/controls.ts), so the same link always
// writes the same note.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { getStyle } from '@engine';
import { DEFAULT_PAPER, resolvePaper, type PaperId } from './papers';
import { AUTO_INK, DEFAULT_INK, INK_FAMILIES } from './inks';
import { PEN_CHOICES } from './pens';
import { CONTROLS, controlByCode, controlByKey, PEN_SIZES, type PenSize } from './controls';
import { OCCASIONS } from './occasions';
import { decodeMarks, encodeMarks, type Mark } from './doc';
import { randomSampleFor, recentLetters, sampleById, sampleForSeed } from './samples';
// a few dozen first hands, rolled ahead by the app's own sampler (neat, each with its pen, ink and paper): a fresh
// visit opens on one of them at random, with a letter that suits it, at no cost to the first paint
import FIRST_LOOKS from './first-looks.json';
import { decodeInk, INK, inkText } from './ink';
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
  /** while nobody has written: the sample letter the text is (lib/samples.ts); null once the text is yours */
  sample: string | null;
  /** Ink (what's written stays; the writer corrects like a person) or Fair copy (clean editing) */
  mode: 'ink' | 'fair';
  /** Ink mode: the letter's ink log (lib/ink.ts encodeInk), once anything is written in ink; the text follows it */
  inkLog: string | null;
  /** a reply: the found letter this note answers (its id, and the hand, paper, pen and ink it was found in) */
  replyTo: ReplyTo | null;
  /** handwriting marks on the text (lib/doc.ts) */
  marks: Mark[];
  /** the writer signs below the last line */
  signed: boolean;
  /** opened from a shared link: the reader view, where the letter writes itself */
  reader: boolean;
  /** New hand skips the hard-to-read writers (on unless turned off; in links as neat=0) */
  neatOnly: boolean;
}

/** The found letter a reply answers, and the look it was found in. The look came later: links from before it
 * show the writer's natural hand with the pen's own ink. */
export interface ReplyTo {
  id: string;
  seed: string;
  style: string;
  paper: PaperId;
  pen?: string;
  ink?: string;
  tip?: PenSize;
  size?: number;
  offsets?: Record<string, number>;
}

export const DEFAULT_TEXT =
  'Dear Ada,\n\nThe little letters never quite match, and that is the point. ' +
  'Every word I write to you comes out a touch different, the way it would if I sat down with a real pen.\n\n' +
  'See you on Sunday at 7:30. Bring the old maps & a good pen!\n\nYours,\nO.';

const FIRST_SAMPLE = sampleForSeed('quiet-heron-17', 'script');

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
  text: FIRST_SAMPLE?.text ?? DEFAULT_TEXT,
  sample: FIRST_SAMPLE?.id ?? null,
  mode: INK ? 'ink' : 'fair',
  inkLog: null,
  replyTo: null,
  marks: [],
  signed: false,
  reader: false,
  neatOnly: true,
};

export const SIZE_RANGE = { min: 0.7, max: 1.45, step: 0.01 };
export const AMOUNT_RANGE = { min: 0, max: 1.5, step: 0.01 };

const round = (v: number, d: number) => +v.toFixed(d);

/** A letter's length at most (characters): long letters get slow and heavy on a phone, and links get long. */
export const MAX_LETTER = 6000;

/** A short check of a link's letter, so one cut short on its way is noticed (FNV-1a, base 36). */
function check(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Slider offsets as a short code: `pw-4.297_iv0.184` (each control's two-letter code and its offset). */
function encodeOffsets(offsets: Record<string, number>) {
  return Object.entries(offsets)
    .filter(([k, v]) => v && controlByKey(k))
    .map(([k, v]) => controlByKey(k)!.code + round(v, 3))
    .join('_');
}

function decodeOffsets(o: string | null) {
  const out: Record<string, number> = {};
  for (const part of (o || '').split('_')) {
    const c = controlByCode(part.slice(0, 2));
    const v = parseFloat(part.slice(2));
    if (c && Number.isFinite(v)) out[c.key] = clamp(v, -(c.max - c.min), c.max - c.min);
  }
  return out;
}

export function encodeState(s: NoteState): string {
  const q = new URLSearchParams();
  // first: a link cut short on its way (some apps shorten long ones) still opens as a letter to read
  if (s.reader) q.set('read', '1');
  q.set('seed', s.seed);
  q.set('style', s.style);
  if (s.pen !== 'auto') q.set('pen', s.pen);
  if (s.penSize !== 'medium') q.set('tip', s.penSize);
  q.set('ink', s.ink);
  q.set('paper', s.paper);
  if (Math.abs(s.size - 1) > 0.005) q.set('size', String(round(s.size, 2)));
  const o = encodeOffsets(s.offsets);
  if (o) q.set('o', o);
  if (s.occasion) {
    q.set('occ', s.occasion);
    if (Math.abs(s.amount - 1) > 0.005) q.set('amt', String(round(s.amount, 2)));
  }
  const sample = sampleById(s.sample);
  if (INK && s.mode === 'fair') q.set('mode', 'fair');
  if (s.replyTo) {
    // id~seed~style~paper, then the look when it isn't the writer's natural one: pen~ink~tip~size~offsets
    const r = s.replyTo;
    const o = encodeOffsets(r.offsets ?? {});
    const plain = (r.pen ?? 'auto') === 'auto' && (r.ink ?? AUTO_INK) === AUTO_INK && (r.tip ?? 'medium') === 'medium' && Math.abs((r.size ?? 1) - 1) < 0.005 && !o;
    const look = plain ? [] : [r.pen ?? 'auto', r.ink ?? AUTO_INK, r.tip ?? 'medium', String(round(r.size ?? 1, 2)), o];
    q.set('re', [r.id, r.seed, r.style, r.paper, ...look].join('~'));
  }
  if (s.marks.length) q.set('m', encodeMarks(s.marks));
  if (s.signed) q.set('sig', '1');
  if (!s.neatOnly) q.set('neat', '0');
  // last, the letter itself (the long part, so a cut lands here), with its check just before it
  if (s.inkLog) {
    q.set('c', check(s.inkLog));
    q.set('k', compressToEncodedURIComponent(s.inkLog));
  } else if (sample && sample.text === s.text) q.set('s', sample.id);
  else if (s.text !== DEFAULT_TEXT) {
    q.set('c', check(s.text));
    q.set('t', compressToEncodedURIComponent(s.text));
  }
  return q.toString();
}

/**
 * A fresh visit (no link, nothing saved): a writer and a letter of its own, so every visit opens differently.
 * `?repeatable` keeps the fixed first hand, for QA.
 */
export function firstVisitState(): NoteState {
  try { if (new URLSearchParams(location.search).has('repeatable')) return DEFAULT_STATE; } catch { /* no window */ }
  const looks = FIRST_LOOKS as Partial<NoteState>[];
  if (!looks.length) return DEFAULT_STATE;
  const a = new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(a);
  const pick = (i: number) => (a[i] || Math.floor(Math.random() * 2 ** 32)) / 2 ** 32;
  const look = looks[Math.floor(pick(0) * looks.length)];
  const s: NoteState = { ...DEFAULT_STATE, ...look, offsets: { ...(look.offsets ?? {}) } };
  // the letter drawn at random among those that suit the look's hand (not by its seed): every first look opens on
  // its whole pool, so many visitors arriving at once see many different letters
  const letter = randomSampleFor(s.style, pick(1), recentLetters());
  return letter ? { ...s, sample: letter.id, text: letter.text } : s;
}

/** Parse a hash/query string. Anything missing or invalid falls back to the defaults. */
export function decodeState(hash: string, base: NoteState = DEFAULT_STATE): NoteState {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  // from the archive's "Write a reply": a fresh sheet in Ink, in your hand (as the tool would show it), answering
  // the letter in the hand and paper it was read in (`in`; else the current hand). The hash is then rewritten.
  const replyId = q.get('reply');
  if (replyId && sampleById(replyId)) {
    const [seed, style, paper] = (q.get('in') || '').split('~');
    return {
      ...base,
      text: '', sample: null, inkLog: null, marks: [], signed: false, reader: false, mode: INK ? 'ink' : 'fair',
      replyTo: {
        id: replyId,
        seed: seed?.trim() ? seed.trim().slice(0, 64) : base.seed,
        style: style && getStyle(style) ? style : base.style,
        paper: resolvePaper(paper) ?? base.paper,
      },
    };
  }
  const s: NoteState = { ...base, offsets: {}, occasion: null, amount: 1, marks: [], signed: false, reader: false };
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
  // older links name papers from before the stationery set: they redirect
  const paper = resolvePaper(q.get('paper'));
  if (paper) s.paper = paper;
  const size = parseFloat(q.get('size') || '');
  if (Number.isFinite(size)) s.size = clamp(size, SIZE_RANGE.min, SIZE_RANGE.max);
  s.offsets = decodeOffsets(q.get('o'));
  const occ = q.get('occ');
  if (occ && OCCASIONS.some((x) => x.id === occ)) {
    s.occasion = occ;
    const amt = parseFloat(q.get('amt') || '');
    if (Number.isFinite(amt)) s.amount = clamp(amt, AMOUNT_RANGE.min, AMOUNT_RANGE.max);
  }
  const t = q.get('t');
  const named = sampleById(q.get('s'));
  s.mode = q.get('mode') === 'fair' || !INK ? 'fair' : 'ink';
  s.inkLog = null;
  const k = q.get('k');
  const c = q.get('c');
  const log = k ? decompressFromEncodedURIComponent(k) : null;
  const inkDoc = log && (!c || check(log) === c) ? decodeInk(log) : null;
  if (k != null && !inkDoc) {
    // cut short or garbled: nothing to show (the app says so, see linkIssue)
    s.text = '';
    s.sample = null;
  } else if (k && inkDoc) {
    const full = inkText(inkDoc);
    s.sample = null;
    if (full.length <= MAX_LETTER) { s.inkLog = log; s.text = full; }
    // too long to write in ink here: its words, as a fair copy, up to the most a letter holds
    else { s.text = full.slice(0, MAX_LETTER); s.mode = 'fair'; }
  } else if (t != null) {
    const text = decompressFromEncodedURIComponent(t);
    s.text = text && (!c || check(text) === c) ? text.slice(0, MAX_LETTER) : '';
    s.sample = null;
  } else if (named) {
    s.text = named.text;
    s.sample = named.id;
  } else if (seed) {
    // no letter named (a link from before sample letters): the seed picks it, always the same
    const pick = sampleForSeed(s.seed, s.style);
    s.text = pick?.text ?? DEFAULT_TEXT;
    s.sample = pick?.id ?? null;
  }
  const re = (q.get('re') || '').split('~');
  const rePaper = resolvePaper(re[3]);
  s.replyTo = (re.length === 4 || re.length === 9) && sampleById(re[0]) && re[1] && getStyle(re[2]) && rePaper
    ? {
      id: re[0], seed: re[1].slice(0, 64), style: re[2], paper: rePaper,
      ...(re[4] && PEN_CHOICES.some((x) => x.id === re[4]) ? { pen: re[4] } : {}),
      ...(re[5] && (re[5] === AUTO_INK || INK_FAMILIES.some((i) => i.id === re[5])) ? { ink: re[5] } : {}),
      ...(re[6] && PEN_SIZES.some((x) => x.id === re[6]) ? { tip: re[6] as PenSize } : {}),
      ...(Number.isFinite(parseFloat(re[7])) ? { size: clamp(parseFloat(re[7]), SIZE_RANGE.min, SIZE_RANGE.max) } : {}),
      ...(re[8] ? { offsets: decodeOffsets(re[8]) } : {}),
    }
    : null;
  s.marks = decodeMarks(q.get('m'), s.text.length);
  s.signed = q.get('sig') === '1';
  s.reader = q.get('read') === '1';
  s.neatOnly = q.get('neat') !== '0';
  return s;
}

export type LinkIssue = 'incomplete' | 'too-long' | 'unknown-letter' | null;

/** What's wrong with a link, if anything, to say so once (decodeState has already fallen back safely). */
export function linkIssue(hash: string): LinkIssue {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const reply = q.get('reply');
  if (reply != null) return sampleById(reply) ? null : 'unknown-letter';
  const k = q.get('k'), t = q.get('t'), c = q.get('c');
  if (k != null || t != null) {
    const raw = decompressFromEncodedURIComponent((k ?? t)!);
    // '' is a real letter (a fresh sheet: t=Q); null is a link cut short
    if (raw == null || (c && check(raw) !== c)) return 'incomplete';
    const doc = k != null ? decodeInk(raw) : null;
    if (k != null && !doc) return 'incomplete';
    return (doc ? inkText(doc) : raw).length > MAX_LETTER ? 'too-long' : null;
  }
  const named = q.get('s');
  if (named != null && !sampleById(named)) return 'unknown-letter';
  const re = q.get('re');
  if (re != null && !sampleById(re.split('~')[0])) return 'unknown-letter';
  return null;
}

/** The link a recipient opens: the exact note, in the reader view, where it writes itself. */
export function shareUrl(s: NoteState) {
  const u = new URL(window.location.href);
  u.search = ''; // never share preview flags
  u.hash = encodeState({ ...s, reader: true });
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
