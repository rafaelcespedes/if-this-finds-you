// The note as a document: the logical text, plus the few marks a pen can make on it.
// Every input reaches the document through applyEdit (one Edit per change, see lib/edits.ts), so the
// Ink mode in docs/research/writing-experience.md can swap this "fair copy" model for its append-only
// ink log without touching inputs, rendering or share links.
//
// Marks are handwriting-native formatting (editor-ux.md §3.4): an underline drawn after the word
// (double when pressed twice), and "pressed harder" letters. Nothing else.
import type { Edit } from './edits';
import { applyEdit as applyTextEdit } from './edits';

export type MarkKind = 'underline' | 'underline2' | 'press';

export interface Mark {
  kind: MarkKind;
  /** UTF-16 range in the text, from inclusive, to exclusive */
  from: number;
  to: number;
}

export interface NoteDoc {
  text: string;
  marks: Mark[];
  /** the writer signs below the last line */
  signed: boolean;
}

/** Move a position through an edit. `assoc` -1 keeps it before an insertion at the same spot, +1 after. */
function mapPos(pos: number, e: Edit, assoc: -1 | 1) {
  if (pos < e.at) return pos;
  if (pos > e.at + e.del) return pos - e.del + e.ins.length;
  // at the edit, or inside the deleted range: collapse to one side of it
  return assoc < 0 ? e.at : e.at + e.ins.length;
}

export function mapMarks(marks: Mark[], e: Edit): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    // typing at a mark's end extends it (like pressing on with the same pen); at its start it doesn't
    const from = mapPos(m.from, e, 1);
    const to = mapPos(m.to, e, e.at === m.to && e.del === 0 ? 1 : -1);
    if (to > from) out.push({ ...m, from, to });
  }
  return out;
}

export function applyEdit(doc: NoteDoc, e: Edit): NoteDoc {
  return { ...doc, text: applyTextEdit(doc.text, e), marks: mapMarks(doc.marks, e) };
}

/** The word around a caret (for formatting with no selection). */
export function wordAt(text: string, at: number): [number, number] {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  if (seg) {
    for (const s of seg.segment(text)) {
      const end = s.index + s.segment.length;
      if (s.isWordLike && at >= s.index && at <= end) return [s.index, end];
    }
    return [at, at];
  }
  let a = at, b = at;
  while (a > 0 && /\S/.test(text[a - 1])) a--;
  while (b < text.length && /\S/.test(text[b])) b++;
  return [a, b];
}

/**
 * Underline (⌘U / ⌘I): none -> single -> double -> none over the range.
 * Press harder (⌘B): toggles.
 */
export function toggleMark(doc: NoteDoc, kind: 'underline' | 'press', from: number, to: number): NoteDoc {
  if (to <= from) return doc;
  const covers = (k: MarkKind) => doc.marks.some((m) => m.kind === k && m.from <= from && m.to >= to);
  const without = (kinds: MarkKind[]) => subtract(doc.marks, kinds, from, to);
  if (kind === 'press') {
    return { ...doc, marks: covers('press') ? without(['press']) : [...without(['press']), { kind: 'press', from, to }] };
  }
  if (covers('underline2')) return { ...doc, marks: without(['underline', 'underline2']) };
  if (covers('underline')) return { ...doc, marks: [...without(['underline', 'underline2']), { kind: 'underline2', from, to }] };
  return { ...doc, marks: [...without(['underline', 'underline2']), { kind: 'underline', from, to }] };
}

/** Remove [from, to) from marks of the given kinds, splitting where needed. */
function subtract(marks: Mark[], kinds: MarkKind[], from: number, to: number): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    if (!kinds.includes(m.kind) || m.to <= from || m.from >= to) { out.push(m); continue; }
    if (m.from < from) out.push({ ...m, to: from });
    if (m.to > to) out.push({ ...m, from: to });
  }
  return out;
}

// ---------- share-link encoding: m=u3-9_d12-20_b30-35 ----------
const CODE: Record<MarkKind, string> = { underline: 'u', underline2: 'd', press: 'b' };
const KIND: Record<string, MarkKind> = { u: 'underline', d: 'underline2', b: 'press' };

export function encodeMarks(marks: Mark[]) {
  return marks.map((m) => `${CODE[m.kind]}${m.from}-${m.to}`).join('_');
}
export function decodeMarks(s: string | null, textLength: number): Mark[] {
  if (!s) return [];
  const out: Mark[] = [];
  for (const part of s.split('_')) {
    const kind = KIND[part[0]];
    const [a, b] = part.slice(1).split('-').map(Number);
    if (kind && Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b > a && b <= textLength) out.push({ kind, from: a, to: b });
  }
  return out;
}
