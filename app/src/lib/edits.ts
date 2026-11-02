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
