// The writer's own letters, kept on this device when they step away to read a found letter. Never in a share
// link (that's someone's private text): only here, newest first, a handful at most.
import type { NoteState } from './state';

export type Draft = Pick<NoteState, 'text' | 'inkLog' | 'marks' | 'replyTo' | 'signed'> & { savedAt: number };

const KEY = 'seedhand:drafts';
const KEEP = 6;

export function drafts(): Draft[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((d) => d && typeof d.text === 'string') : [];
  } catch {
    return [];
  }
}

/** Keep this letter (nothing to keep when it's empty; the same letter twice is kept once). */
export function keepDraft(s: NoteState) {
  if (!s.text.trim() && !s.inkLog) return;
  const d: Draft = { text: s.text, inkLog: s.inkLog, marks: s.marks, replyTo: s.replyTo, signed: s.signed, savedAt: Date.now() };
  const rest = drafts().filter((x) => x.text !== d.text || x.inkLog !== d.inkLog);
  try { localStorage.setItem(KEY, JSON.stringify([d, ...rest].slice(0, KEEP))); } catch { /* private mode: fine */ }
}

/** The newest kept letter, taken off the pile. */
export function takeDraft(): Draft | null {
  const all = drafts();
  if (!all.length) return null;
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(1))); } catch { /* fine */ }
  return all[0];
}
