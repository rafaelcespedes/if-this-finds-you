// The found letter a reply answers, in the hand, pen, ink and paper it was found in. Written by the page's
// writer (off the main thread), from the same request the page made while it was being read, so a reply
// started here shows exactly the letter that was on the page; a link writes it again from its look.
import { makeHand, type Hand } from '@engine';
import { effective, effectiveHand } from './params';
import { getPaper, type PaperSpec } from './papers';
import { inkColor } from './inks';
import { requestFor, type Req } from './request';
import { sampleById, type SampleText } from './samples';
import { DEFAULT_STATE, type NoteState, type ReplyTo } from './state';
import type { WriteResult } from './write-protocol';

export interface FoundLetter {
  letter: SampleText;
  paper: PaperSpec;
  /** one SVG per sheet (null while it's being written: the paper shows first) */
  svgs: (string | null)[];
  /** the ink's colour, for the writing's currentColor */
  ink: string;
}

export const foundKey = (r: ReplyTo) => JSON.stringify(r);

/** The note state the found letter was read in (as near as the reply remembers it). */
export function foundState(r: ReplyTo): NoteState | null {
  const letter = sampleById(r.id);
  if (!letter) return null;
  return {
    ...DEFAULT_STATE,
    seed: r.seed, style: r.style, paper: r.paper,
    pen: r.pen ?? 'auto', ink: r.ink ?? DEFAULT_STATE.ink, penSize: r.tip ?? 'medium', size: r.size ?? 1, offsets: r.offsets ?? {},
    text: letter.text, sample: letter.id, inkLog: null, marks: [], signed: false, replyTo: null, occasion: null, reader: false,
  };
}

/** Their hand, as it wrote the letter (for its description). */
export function foundHand(r: ReplyTo): Hand | null {
  const s = foundState(r);
  if (!s) return null;
  const natural = makeHand(s.seed, s.style);
  return effectiveHand(natural, effective(natural, s));
}

export function theirRequest(r: ReplyTo): Req | null {
  const s = foundState(r);
  return s ? requestFor(s) : null;
}

/** What to show: the writing when it's there, else the paper alone. */
export function foundLetter(r: ReplyTo, written: WriteResult | null | undefined): FoundLetter | null {
  const letter = sampleById(r.id);
  if (!letter) return null;
  if (written && written.svgs.length) {
    return { letter, paper: getPaper(written.paper), svgs: written.svgs.map((s) => s || null), ink: written.inkColor };
  }
  return { letter, paper: getPaper(r.paper), svgs: [null], ink: inkColor(r.ink ?? DEFAULT_STATE.ink) };
}
