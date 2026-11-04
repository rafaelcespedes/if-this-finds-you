// The writer's own letters, kept on this device when they step away to read a found letter. Never in a share
// link (that's someone's private text): only here, newest first, a handful at most.
import type { NoteState } from './state';

export type Draft = Pick<NoteState, 'text' | 'inkLog' | 'marks' | 'replyTo' | 'signed'> & {
  savedAt: number;
  /** the tab it was written in: "Back to my letter" brings back this tab's own, never another tab's */
  tab?: string;
};

export const DRAFTS_KEY = 'seedhand:drafts';
const KEEP = 6;

/** This tab's name for its letters (a tab of its own, until it's closed). */
export const TAB = (() => {
  try {
    const had = sessionStorage.getItem('seedhand:tab');
    if (had) return had;
    const id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('seedhand:tab', id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
})();

/** When the device won't keep them (storage full or blocked): kept here while the page is open. */
let memory: Draft[] | null = null;

export function drafts(): Draft[] {
  if (memory) return memory;
  try {
    const v = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((d) => d && typeof d.text === 'string') : [];
  } catch {
    return [];
  }
}

/** Write the pile; false when the device wouldn't keep it (it's kept in memory instead). */
function save(all: Draft[]): boolean {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
    memory = null;
    return true;
  } catch {
    memory = all;
    return false;
  }
}

/**
 * Keep this letter (nothing to keep when it's empty; the same letter twice is kept once). false: the device
 * wouldn't keep it, so it lasts only while this page is open.
 */
export function keepDraft(s: NoteState): boolean {
  if (!s.text.trim() && !s.inkLog) return true;
  const d: Draft = { text: s.text, inkLog: s.inkLog, marks: s.marks, replyTo: s.replyTo, signed: s.signed, savedAt: Date.now(), tab: TAB };
  const rest = drafts().filter((x) => x.text !== d.text || x.inkLog !== d.inkLog);
  return save([d, ...rest].slice(0, KEEP));
}

/** The letter on the desk is open again (back from another page, a reload, Back): it leaves this tab's kept pile, so
 *  My letters doesn't list it twice. */
export function forgetOpen(s: Pick<NoteState, 'text' | 'inkLog' | 'sample'>) {
  if (s.sample || (!s.text.trim() && !s.inkLog)) return;
  const all = drafts();
  const rest = all.filter((d) => !(d.tab === TAB && d.text === s.text && (d.inkLog ?? null) === (s.inkLog ?? null)));
  if (rest.length !== all.length) save(rest);
}

/** This tab's newest kept letter (-1 when it has none). */
export const mineIndex = (all: Draft[]) => all.findIndex((d) => d.tab === TAB);

/** A kept letter, by when it was put down (this tab's newest when none is named), taken off the pile. */
export function takeDraft(savedAt?: number): Draft | null {
  const all = drafts();
  const index = savedAt == null ? mineIndex(all) : all.findIndex((d) => d.savedAt === savedAt);
  const d = all[index];
  if (!d) return null;
  save(all.filter((_, i) => i !== index));
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
