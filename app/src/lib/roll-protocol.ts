// What the page and the roll worker (workers/roll.worker.ts) say to each other.
import type { NoteState } from './state';
import type { LockKey } from './roll';

export type RollAsk =
  | { id: number; kind: 'next'; visit: string; state: NoteState; variety: number; locked: LockKey[]; avoid: string[]; n: number }
  | { id: number; kind: 'similar'; visit: string; state: NoteState; avoid: string[] };

export type RollReply =
  | { id: number; kind: 'next'; index: number; look: Partial<NoteState> }
  | { id: number; kind: 'similar'; look: Partial<NoteState> };
