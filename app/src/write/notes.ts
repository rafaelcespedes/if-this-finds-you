// The writing app's notes: every note kept in this browser (IndexedDB), one record per note, so two tabs never write
// over each other's work (each saves only the note it has open, and tells the other tabs: BroadcastChannel). A note
// is one ink log (lib/ink.ts) in one writer's hand, on one paper, with one pen, as a document keeps its font.
//
//   a note    { id, look, ink, created, at, pinned?, thrown? }   its title is its first line (titleOf)
//   thrown    a thrown-away note stays 30 days (Thrown away), then goes for good
//
// The first version kept a desk and a pile in localStorage (seedhand:write); it's read once into notes and left where
// it was, untouched, in case anything goes wrong.
import LOOKS from '@/lib/first-looks.json';
import type { NoteState } from '@/lib/state';
import type { PaperId } from '@/lib/papers';
import { requestFor } from '@/lib/request';
import { writeInkLetter } from '@/lib/write-live';
import { decodeInk, encodeInk, inkFromText, inkText, newInkDoc, type InkDoc } from '@/lib/ink';
import type { Mark } from '@/lib/doc';

export type Look = { seed: string; style: string; pen: string; penSize: string; ink: string; paper: string; size: number; offsets: Record<string, number> };
export interface Note {
  id: string;
  look: Look;
  /** the note's ink log (encodeInk), or null when nothing is written yet */
  ink: string | null;
  /** when it was started, and last written on (ms) */
  created: number;
  at: number;
  pinned?: boolean;
  /** when it was thrown away (ms); gone for good 30 days later */
  thrown?: number;
  /** how it's written: in ink (the default: corrections show, nothing is erased), or clean (edited freely, like a font) */
  mode?: 'ink' | 'clean';
  /** a clean note's words and their marks (underlined, pressed harder); its ink is set aside */
  text?: string;
  marks?: Mark[];
  /** a clean note's lines as they were set out in ink (titles, lists, ticks): back in ink, lines still saying the same
   *  take their format again */
  lines?: LineFormat[];
  /** made as a fair copy (ms): the pen writes it out when it's first opened */
  fair?: number;
  /** last kept (ms), by any tab: which copy of a note is newer (`at` is when it was last written on) */
  touched?: number;
}
/** a line of a note and how it's set out: title, heading, body, or a list's bullet, number or checkbox (and ticked) */
export type LineFormat = { text: string; as: string; checked?: boolean };
/** a note's lines as ink, each set out as it was (the pen writes them; nothing is struck) */
export function inkFromLines(seed: string, style: string, lines: LineFormat[], salt?: string): InkDoc {
  const doc = newInkDoc(seed, style, salt);
  let prev = 'body';
  lines.forEach((L, i) => {
    if (i) doc.log.push({ t: 'break' });
    const as = L.as || 'body';
    // a list carries on to the next line by itself (and numbers on); a line set out differently says so
    if (as !== prev) doc.log.push({ t: 'line', as });
    if (L.text) doc.log.push({ t: 'write', text: L.text });
    prev = as;
  });
  return doc;
}
export const isClean = (n: Note) => n.mode === 'clean';
/** the note as ink: a clean note's words, written out as ink from here on */
export function asInk(n: Note): Note {
  if (!isClean(n)) return n;
  const t = n.text ?? '';
  // lines that still say what they said in ink take their format again (a title stays a title, a ticked item ticked)
  const saved = [...(n.lines ?? [])];
  const lines: LineFormat[] = t.split('\n').map((text) => {
    const i = saved.findIndex((L) => L.text === text && text.trim());
    const L = i >= 0 ? saved.splice(i, 1)[0] : null;
    return { text, as: L?.as ?? 'body', checked: L?.checked };
  });
  const doc = saved.length === (n.lines ?? []).length && !lines.some((L) => L.as !== 'body')
    ? inkFromText(n.look.seed, n.look.style, t)
    : inkFromLines(n.look.seed, n.look.style, lines);
  doc.salt = n.id.slice(-6); // the same words always come out the same (the library's picture of it too)
  const ticks = lines.flatMap((L, i) => (L.checked ? [i] : []));
  if (ticks.length) pendingTicks.set(n.id, ticks);
  return { ...n, mode: 'ink', ink: t.trim() ? encodeInk(doc) : null, text: undefined, marks: undefined, lines: undefined, at: Date.now() };
}
/** ticks to draw once a note is on the desk (its boxes exist only once the pen has written them) */
export const pendingTicks = new Map<string, number[]>();
/** the note in Clean: its words as they read now (crossings-out tidied away), free to edit */
export function asClean(n: Note, lines?: LineFormat[]): Note {
  if (isClean(n)) return n;
  const text = lines ? lines.map((L) => L.text).join('\n') : noteText(n);
  return { ...n, mode: 'clean', text, marks: [], lines: lines?.some((L) => L.as !== 'body') ? lines : undefined, at: Date.now() };
}

export const THROWN_DAYS = 30;
const DB = 'seedhand-write';
const STORE = 'notes';
const OLD_KEY = 'seedhand:write';
const OPEN_KEY = 'seedhand:write:open';

/** the hands the site opens on (the curated first looks), less pencil: pencil doesn't write in ink */
const WRITABLE = (LOOKS as Look[]).filter((l) => l.pen !== 'pencil');
export const pickLook = (not?: string, sameAs?: Look) => {
  let pool = WRITABLE.filter((l) => l.seed !== not);
  // another writer on the same paper, when there is one: the sheet keeps its size and nothing on the page jumps
  if (sameAs) {
    const same = pool.filter((l) => l.paper === sameAs.paper);
    if (same.length) pool = same;
  }
  return pool[Math.floor(Math.random() * pool.length)];
};
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const blankNote = (look: Look): Note => { const now = Date.now(); return { id: newId(), look, ink: null, created: now, at: now }; };
/** The desk's letter, as a new note (lib/to-notes.ts): its hand and look, and its words written out fresh by the pen
 *  when it opens, as a copy is (none: a blank note in that hand) */
export function noteFromDesk(look: Look, text: string): Note {
  const n = blankNote(look);
  const lines: LineFormat[] = text.split('\n').map((t) => ({ text: t, as: 'body' }));
  if (!lines.some((L) => L.text.trim())) return n;
  return { ...n, ink: encodeInk(inkFromLines(look.seed, look.style, lines)), fair: Date.now() };
}

export function stateOf(l: Look, inkLog: string | null = null): NoteState {
  return {
    seed: l.seed, style: l.style, offsets: l.offsets, pen: l.pen, penSize: l.penSize as NoteState['penSize'], ink: l.ink,
    size: l.size, paper: l.paper as PaperId, occasion: null, amount: 1, text: '', sample: null, mode: 'ink', inkLog,
    replyTo: null, marks: [], signed: false, reader: false, neatOnly: true,
  };
}

// ---------- what a note says ----------
const said = new Map<string, string>();
/** what the note says (struck words left out), as it reads now */
export function noteText(n: Note): string {
  if (isClean(n)) return n.text ?? '';
  if (!n.ink) return '';
  const hit = said.get(n.ink);
  if (hit != null) return hit;
  const doc = decodeInk(n.ink);
  const t = doc ? inkText(doc) : '';
  if (said.size > 400) said.clear();
  said.set(n.ink, t);
  return t;
}
/** what the desk already knows a note says (it reads it as you write): kept, so the library never decodes it again */
export function knowText(ink: string | null, text: string) {
  if (!ink) return;
  if (said.size > 400) said.clear();
  said.set(ink, text);
}
/** its title: the first line, as in Notes */
export function titleOf(n: Note): string {
  const first = noteText(n).split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return first.length > 60 ? first.slice(0, 58).trimEnd() + '…' : first;
}
/** the words after the title, for the library */
export function snippetOf(n: Note): string {
  const lines = noteText(n).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(1).join(' ').slice(0, 120);
}
export const isBlank = (n: Note) => (isClean(n) ? !(n.text ?? '').trim() : !n.ink || !decodeInk(n.ink)?.log.length);
export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}’']+/gu) ?? []).length;

/** a note's first sheet as SVG, written once and kept for the session (the library shows a few at a time) */
const drawn = new Map<string, { svg: string; ink: string }>();
export function noteSvg(n: Note): { svg: string; ink: string } | null {
  // a clean note is drawn as its words in ink (no corrections to show)
  if (isClean(n)) return n.text?.trim() ? noteSvg(asInk({ ...n, id: n.id })) : null;
  if (!n.ink) return null;
  const key = `${n.id}|${n.look.seed}|${n.look.paper}|${n.look.ink}|${n.ink.length}|${n.ink.slice(-24)}`;
  const hit = drawn.get(key);
  if (hit) return hit;
  const req = { ...requestFor(stateOf(n.look, n.ink)), id: 0 };
  if (!req.ink) return null;
  try {
    const res = writeInkLetter(req);
    const out = res.svgs[0] ? { svg: res.svgs[0], ink: req.inkColor } : null;
    if (out) {
      if (drawn.size > 120) drawn.delete(drawn.keys().next().value!);
      drawn.set(key, out);
    }
    return out;
  } catch { return null; }
}

// ---------- the store ----------
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve, reject) => {
    if (!d) { reject(new Error('no store')); return; }
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/** every note, as kept (thrown-away ones past 30 days are let go here) */
export async function readNotes(): Promise<Note[] | null> {
  try {
    const all = ((await tx<Note[]>('readonly', (s) => s.getAll())) ?? []).filter((n) => n && n.id && n.look?.seed);
    const cutoff = Date.now() - THROWN_DAYS * 864e5;
    const gone = all.filter((n) => n.thrown && n.thrown < cutoff);
    if (gone.length) await tx('readwrite', (s) => { for (const n of gone) s.delete(n.id); });
    return all.filter((n) => !gone.includes(n));
  } catch { return null; }
}
/** kept; false when the browser won't (private mode, storage full) */
export async function putNote(n: Note): Promise<boolean> {
  const kept = { ...n, touched: Date.now() };
  try { await tx('readwrite', (s) => s.put(kept)); tell({ kind: 'put', id: n.id, at: kept.touched }); return true; } catch { return false; }
}
export async function deleteNote(id: string): Promise<boolean> {
  try { await tx('readwrite', (s) => s.delete(id)); tell({ kind: 'delete', id }); return true; } catch { return false; }
}
export async function getNote(id: string): Promise<Note | null> {
  try { return (await tx<Note>('readonly', (s) => s.get(id))) ?? null; } catch { return null; }
}

/** the first version's desk and pile, as notes (read once; the old key is left as it was) */
export function oldNotes(): Note[] {
  try {
    const o = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    if (!o) return [];
    const one = (s: { id?: string; look?: Look; ink?: string | null; at?: number }): Note | null =>
      s?.look?.seed ? { id: s.id || newId(), look: s.look, ink: s.ink ?? null, created: s.at || Date.now(), at: s.at || Date.now() } : null;
    if (o.v === 2) return [one(o.cur), ...(Array.isArray(o.pile) ? o.pile.map(one) : [])].filter((n): n is Note => !!n && !isBlank(n));
    if (o.v === 1 && o.look?.seed) return [one({ look: o.look, ink: o.ink })].filter((n): n is Note => !!n && !isBlank(n));
  } catch { /* unreadable: nothing to bring over */ }
  return [];
}
export const MIGRATED_KEY = 'seedhand:write:notes';

/** which note this browser had open last */
export const lastOpen = () => { try { return localStorage.getItem(OPEN_KEY); } catch { return null; } };
export const rememberOpen = (id: string) => { try { localStorage.setItem(OPEN_KEY, id); } catch { /* fine */ } };

// ---------- other tabs ----------
export type NoteNews = { kind: 'put'; id: string; at: number } | { kind: 'delete'; id: string };
let channel: BroadcastChannel | null = null;
try { channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('seedhand:write') : null; } catch { channel = null; }
function tell(m: NoteNews) { try { channel?.postMessage(m); } catch { /* fine */ } }
/** news from the other tabs: a note kept or let go there */
export function listen(fn: (m: NoteNews) => void) {
  if (!channel) return () => {};
  const on = (e: MessageEvent<NoteNews>) => fn(e.data);
  channel.addEventListener('message', on);
  return () => channel?.removeEventListener('message', on);
}

// ---------- the library's order ----------
export type Group = { id: string; label: string; notes: Note[] };
/** Pinned, then Today, Yesterday, Previous 7 days, then by month (as Notes does) */
export function groupNotes(notes: Note[], now = Date.now()): Group[] {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const today = day.getTime(), yesterday = today - 864e5, week = today - 7 * 864e5;
  const groups = new Map<string, Group>();
  const add = (id: string, label: string, n: Note) => { if (!groups.has(id)) groups.set(id, { id, label, notes: [] }); groups.get(id)!.notes.push(n); };
  for (const n of [...notes].sort((a, b) => b.at - a.at)) {
    if (n.pinned) add('pinned', 'Pinned', n);
    else if (n.at >= today) add('today', 'Today', n);
    else if (n.at >= yesterday) add('yesterday', 'Yesterday', n);
    else if (n.at >= week) add('week', 'Previous 7 days', n);
    else {
      const d = new Date(n.at);
      const sameYear = d.getFullYear() === new Date(now).getFullYear();
      add(`m${d.getFullYear()}-${d.getMonth()}`, d.toLocaleDateString(undefined, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' }), n);
    }
  }
  const order = ['pinned', 'today', 'yesterday', 'week'];
  return [...groups.values()].sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return b.notes[0].at - a.notes[0].at;
  });
}
/** "9:41", "Yesterday", "Monday", "3 Nov" */
export function whenOf(at: number, now = Date.now()) {
  const d = new Date(at);
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  if (at >= day.getTime()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (at >= day.getTime() - 864e5) return 'Yesterday';
  if (at >= day.getTime() - 6 * 864e5) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
