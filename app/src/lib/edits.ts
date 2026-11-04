// Edits as events. Every change to the note's text, from the paper or the plain-text box, arrives here
// as one Edit, so the document model can later become an append-only ink log (docs/research/
// writing-experience.md §3.5, §7.4) without touching the inputs. Today's model ("fair copy") just
// applies each edit to the text.
//
// The browser applies the edit itself (IME, autocorrect, dictation and undo keep working); we read
// `beforeinput` only for hints and take the truth from a diff of the old and new value.

export type InputKind = 'type' | 'delete' | 'paste' | 'cut' | 'drop' | 'compose' | 'replace' | 'undo';

export interface Edit {
  /** UTF-16 offset where the change starts */
  at: number;
  /** code units removed */
  del: number;
  /** text inserted */
  ins: string;
  kind: InputKind;
  /** ms timestamp */
  t: number;
  /** where it came from */
  source: 'paper' | 'plain';
}

export function kindOf(inputType: string | undefined, composing: boolean): InputKind {
  if (composing || inputType === 'insertCompositionText') return 'compose';
  if (!inputType) return 'type';
  if (inputType.startsWith('history')) return 'undo';
  if (inputType === 'insertFromPaste' || inputType === 'insertFromPasteAsQuotation') return 'paste';
  if (inputType === 'deleteByCut') return 'cut';
  if (inputType === 'insertFromDrop' || inputType === 'deleteByDrag') return 'drop';
  if (inputType === 'insertReplacementText') return 'replace';
  if (inputType.startsWith('delete')) return 'delete';
  return 'type';
}

/** The smallest Edit that turns `before` into `after`. */
export function diffEdit(before: string, after: string, kind: InputKind, source: Edit['source']): Edit | null {
  if (before === after) return null;
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++;
  // don't split a surrogate pair
  if (p > 0 && isHigh(before.charCodeAt(p - 1))) p--;
  return { at: p, del: before.length - s - p, ins: after.slice(p, after.length - s), kind, t: Date.now(), source };
}
const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;

export function applyEdit(text: string, e: Edit) {
  return text.slice(0, e.at) + e.ins + text.slice(e.at + e.del);
}

/** A bounded in-memory history of edits: the seed of the future ink log. */
export class EditLog {
  readonly events: Edit[] = [];
  constructor(private max = 2000) {}
  push(e: Edit) {
    this.events.push(e);
    if (this.events.length > this.max) this.events.splice(0, this.events.length - this.max);
  }
}

/** One step of undo: the letter's text before it and after it, and the edit that ended it. */
interface UndoGroup { before: string; after: string; last: Edit; at: number }

/**
 * The letter's own undo (launch QA: Safari's native undo jumped back over the whole typing run and took the letter with
 * it). Edits are grouped the way a writer thinks of them: a word typed (with the space after it), a run of Backspaces
 * or Deletes, or one paste, cut, replacement or format. A step undoes one group and nothing more; if the text is no
 * longer what that group left (the letter was replaced, a mode changed it), the history is dropped instead of
 * guessing, so an undo can never take more than the last edit.
 */
export class UndoHistory {
  private undos: UndoGroup[] = [];
  private redos: UndoGroup[] = [];
  constructor(private max = 200, private joinMs = 1500) {}

  /** an edit that changed the letter from `before` to `after` (never an undo or redo) */
  record(before: string, after: string, e: Edit) {
    if (before === after) return;
    this.redos = [];
    const g = this.undos[this.undos.length - 1];
    if (g && g.after === before && joins(g.last, e, this.joinMs)) {
      g.after = after;
      g.last = e;
      g.at = e.t;
      return;
    }
    this.undos.push({ before, after, last: e, at: e.t });
    if (this.undos.length > this.max) this.undos.shift();
  }

  /** the edit that takes `current` back one step, or null (nothing to undo, or the text moved on without us) */
  undo(current: string): Edit | null {
    const g = this.undos.pop();
    if (!g) return null;
    if (g.after !== current) { this.clear(); return null; }
    this.redos.push(g);
    return diffEdit(current, g.before, 'undo', g.last.source);
  }
  /** the edit that puts back the step just undone, or null */
  redo(current: string): Edit | null {
    const g = this.redos.pop();
    if (!g) return null;
    if (g.before !== current) { this.clear(); return null; }
    this.undos.push(g);
    return diffEdit(current, g.after, 'replace', g.last.source);
  }
  /** an undo that couldn't be carried out (dry ink): the step stays where it was */
  keep(dir: 'undo' | 'redo') {
    if (dir === 'undo') { const g = this.redos.pop(); if (g) this.undos.push(g); }
    else { const g = this.undos.pop(); if (g) this.redos.push(g); }
  }
  clear() { this.undos = []; this.redos = []; }
}

const SPACE = /^\s+$/;
/** does edit `e` carry on the group that `last` ended? */
function joins(last: Edit, e: Edit, joinMs: number) {
  if (e.t - last.t > joinMs) return false;
  // typing on: one key after another at the caret, a new word starting a new step (the space after a word stays with it)
  if (last.kind === 'type' && e.kind === 'type' && !last.del && !e.del && e.ins.length === 1 && last.ins.length === 1 && e.at === last.at + 1 && e.ins !== '\n') {
    return !(SPACE.test(last.ins) && !SPACE.test(e.ins));
  }
  // Backspace after Backspace, Delete after Delete
  if (last.kind === 'delete' && e.kind === 'delete' && !last.ins && !e.ins) {
    return e.at + e.del === last.at || e.at === last.at;
  }
  return false;
}
