// The writing page's sheets: the one on the desk and the pile of earlier ones, kept in this browser only.
// Each sheet is its own ink log (lib/ink.ts) and its own writer; nothing leaves the device.
import LOOKS from '@/lib/first-looks.json';
import type { NoteState } from '@/lib/state';
import type { PaperId } from '@/lib/papers';
import { requestFor } from '@/lib/request';
import { writeInkLetter } from '@/lib/write-live';
import { decodeInk, inkText } from '@/lib/ink';

export type Look = { seed: string; style: string; pen: string; penSize: string; ink: string; paper: string; size: number; offsets: Record<string, number> };
export interface Sheet {
  id: string;
  look: Look;
  /** the sheet's ink log (encodeInk), or null when nothing is written yet */
  ink: string | null;
  /** when it was last written on (ms) */
  at: number;
}
export interface Kept { v: 2; cur: Sheet; pile: Sheet[] }

const KEY = 'seedhand:write';
/** how many earlier sheets the pile keeps (a few kB each); a full pile asks for room, it never drops one quietly */
export const PILE_MAX = 50;

/** the hands the site opens on (the curated first looks), less pencil: pencil doesn't write in ink */
const WRITABLE = (LOOKS as Look[]).filter((l) => l.pen !== 'pencil');
export const pickLook = (not?: string) => {
  const pool = WRITABLE.filter((l) => l.seed !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const blankSheet = (look: Look): Sheet => ({ id: newId(), look, ink: null, at: Date.now() });

export function readKept(): Kept | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o?.v === 2 && o.cur?.look?.seed) return { v: 2, cur: o.cur, pile: Array.isArray(o.pile) ? o.pile : [] };
    // the first version kept one sheet
    if (o?.v === 1 && o.look?.seed) return { v: 2, cur: { id: newId(), look: o.look, ink: o.ink ?? null, at: Date.now() }, pile: [] };
  } catch { /* unreadable: start over */ }
  return null;
}
/** false when the browser wouldn't keep it (private mode, or its storage is full) */
export function keep(k: Kept): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(k)); return true; } catch { return false; }
}

export function stateOf(l: Look, inkLog: string | null = null): NoteState {
  return {
    seed: l.seed, style: l.style, offsets: l.offsets, pen: l.pen, penSize: l.penSize as NoteState['penSize'], ink: l.ink,
    size: l.size, paper: l.paper as PaperId, occasion: null, amount: 1, text: '', sample: null, mode: 'ink', inkLog,
    replyTo: null, marks: [], signed: false, reader: false, neatOnly: true,
  };
}

/** what a sheet says (struck words left out), for its name in the pile */
export function sheetWords(s: Sheet, n = 8) {
  const doc = decodeInk(s.ink);
  return doc ? inkText(doc).trim().split(/\s+/).slice(0, n).join(' ') : '';
}
export const isBlank = (s: Sheet) => !decodeInk(s.ink)?.log.length;

/** a sheet's first page as SVG, written once and kept for the session (the pile shows a few at a time) */
const drawn = new Map<string, { svg: string; ink: string }>();
export function sheetSvg(s: Sheet): { svg: string; ink: string } | null {
  if (!s.ink) return null;
  const key = `${s.id}|${s.look.seed}|${s.ink.length}`;
  const hit = drawn.get(key);
  if (hit) return hit;
  const req = { ...requestFor(stateOf(s.look, s.ink)), id: 0 };
  if (!req.ink) return null;
  try {
    const res = writeInkLetter(req);
    const out = res.svgs[0] ? { svg: res.svgs[0], ink: req.inkColor } : null;
    if (out) drawn.set(key, out);
    return out;
  } catch { return null; }
}
