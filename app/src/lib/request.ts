// The note state -> what the writer is asked to write. One function for the page on screen and for the
// hands fetched ahead of time, so a prefetched result matches the page's request exactly (same JSON key).
import { makeHand, type Hand } from '@engine';
import { writerName } from './hands';
import { inkColor } from './inks';
import { effective, type Effective } from './params';
import type { NoteState } from './state';
import type { WriteRequest } from './write-protocol';
import { INK } from './ink';

export type Req = Omit<WriteRequest, 'id'>;

export function requestFor(s: NoteState, natural: Hand = makeHand(s.seed, s.style), eff: Effective = effective(natural, s)): Req {
  return {
    seed: s.seed, style: s.style, overrides: eff.overrides, text: s.text, paper: s.paper,
    size: eff.size, lineSpacing: eff.lineSpacing, inkKey: eff.inkKey, inkColor: inkColor(s.ink),
    marks: s.marks, signed: s.signed, writerName: writerName(s.seed),
    // an empty page shows where the writing goes, in the hand, in faint graphite
    placeholder: placeholderFor(s.paper),
    // Ink mode: the page is the ink log, replayed (left out otherwise, so fair requests keep their keys)
    ink: inkOn(s) && s.inkLog ? s.inkLog : undefined,
  };
}

/** The look of a request, coarsely: who writes, on what, with what. A change here is a new look (it may fade). */
export function lookOf(r: Pick<Req, 'seed' | 'style' | 'paper' | 'overrides' | 'inkKey' | 'inkColor'>) {
  return [r.seed, r.style, r.paper, r.overrides.pen ?? '', r.overrides.tip ?? '', r.inkKey ?? '', r.inkColor].join('|');
}

/** What the writer pencils in on an empty page: a salutation on letter paper, the date in a notebook. */
export function placeholderFor(paper: string) {
  if (!paper.startsWith('notebook')) return 'Dear …,';
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return 'Dear …,';
  }
}

/** Ink mode is on for this note: the engine has it, the note is in Ink, and the pen isn't a pencil (pencil
 * erases: until the engine has Pencil mode, a pencil edits like a fair copy). */
export const inkOn = (s: Pick<NoteState, 'mode' | 'pen'>) => INK && s.mode === 'ink' && s.pen !== 'pencil';
