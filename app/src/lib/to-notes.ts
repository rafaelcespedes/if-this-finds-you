// Keep writing in Notes (Rafael, 8 Nov): the letter on the desk, carried to the notes app as a new note in the same
// hand, on the same paper, with the same pen and ink, its words written out by the pen as Notes opens it.
//
// The desk puts what goes across in this browser's storage just before the link is followed (a click, a middle click,
// a click with a key held for a new tab), and Notes takes it on arrival at /notes?from=desk, once. Never in the
// address: a letter's words don't belong in a link, a history or a server's log. The desk keeps its letter.
//
// A note writes with a pen of its own: the desk's "their own pen and ink" are named (the hand's, from its seed), and a
// pencil, which Notes doesn't offer, becomes the hand's own pen.
import { handInk, penKey } from '@engine';
import type { Look } from '@/write/notes';
import { handOpts } from './engine-features';
import { decodeInk, inkText } from './ink';
import { NOTES_URL } from './places';
import { handFor } from './request';
import type { NoteState } from './state';

const KEY = 'seedhand:notes:from-desk';
/** how long what the desk put across waits for Notes to take it */
const FRESH_MS = 10 * 60_000;

export type FromDesk = { look: Look; text: string; at: number };

/** the address the desk's link goes to */
export const NOTES_FROM_DESK = `${NOTES_URL}?from=desk`;

/** The desk's look as a note's: every pen and ink named. */
export function deskLook(s: NoteState): Look {
  const natural = handFor(s.seed, s.style, handOpts(s));
  const own = penKey({ ...natural, pen: 'auto' });
  let pen = s.pen === 'auto' ? own : s.pen;
  if (pen === 'pencil') pen = own === 'pencil' ? 'ballpoint' : own;
  const ink = s.ink === 'auto' || s.ink === 'graphite' || s.pen === 'pencil' ? handInk({ ...natural, pen }) : s.ink;
  return { seed: s.seed, style: s.style, pen, penSize: s.penSize, ink, paper: s.paper, size: s.size, offsets: { ...s.offsets } };
}

/** What the desk's letter says, when it's yours (a found letter's words stay on the desk): in ink, as the ink log
 *  reads now (struck words left out; the text only catches up with it now and then), otherwise its text. */
export function deskWords(s: NoteState) {
  if (s.sample) return '';
  const doc = s.inkLog ? decodeInk(s.inkLog) : null;
  return (doc ? inkText(doc) : s.text).replace(/\s+$/, '');
}

/** Just before the link is followed: the desk's hand and words, put across for Notes. */
export function sendToNotes(s: NoteState) {
  try {
    const d: FromDesk = { look: deskLook(s), text: deskWords(s), at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* storage off: Notes opens as it was */ }
}

/** Notes, arriving from the desk: what it put across (taken once), or null. */
export function takeFromDesk(): FromDesk | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const d = JSON.parse(raw) as FromDesk;
    if (!d?.look?.seed || !d.look.style || typeof d.text !== 'string' || !(Date.now() - d.at < FRESH_MS)) return null;
    return d;
  } catch {
    return null;
  }
}
