// What the page and the roll worker (workers/roll.ts, run by a copy of workers/write.worker.ts) say to each other.
import type { NoteState } from './state';
import type { LockKey } from './roll';

export type RollAsk =
  | { id: number; kind: 'next'; visit: string; state: NoteState; variety: number; locked: LockKey[]; avoid: string[]; n: number }
  | { id: number; kind: 'similar'; visit: string; state: NoteState; avoid: string[] };

export type RollReply =
  | { id: number; kind: 'next'; index: number; look: Partial<NoteState> }
  | { id: number; kind: 'similar'; look: Partial<NoteState> };

/** A roll ask, not a write request (one worker script answers both: workers/write.worker.ts) */
export const isRollAsk = (m: unknown): m is RollAsk =>
  typeof m === 'object' && m !== null && ((m as RollAsk).kind === 'next' || (m as RollAsk).kind === 'similar');
