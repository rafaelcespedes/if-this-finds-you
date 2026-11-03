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

/** A kept letter (the newest by default), taken off the pile. */
export function takeDraft(index = 0): Draft | null {
  const all = drafts();
  const d = all[index];
  if (!d) return null;
  try { localStorage.setItem(KEY, JSON.stringify(all.filter((_, i) => i !== index))); } catch { /* fine */ }
  return d;
}

/** How a kept letter is named in a list: its first words, and when it was put down. */
export function draftLabel(d: Draft, now = Date.now()): { words: string; when: string } {
  const flat = d.text.replace(/\s+/g, ' ').trim();
  const words = flat ? (flat.length > 34 ? flat.slice(0, 34).replace(/\s+\S*$/, '') + '…' : flat) : 'A letter in ink';
  const mins = Math.round((now - d.savedAt) / 60000);
  const when = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 60 * 24 ? `${Math.round(mins / 60)} h ago`
    : new Date(d.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return { words, when };
}
