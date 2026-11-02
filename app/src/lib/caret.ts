// Map between positions in the note's text and positions of the handwriting on the sheets:
// where the caret goes for a text index, and which text index a click lands on.
// Works only from the worker's result (glyph boxes in reading order), so it follows whatever the
// engine's layout does, without re-implementing it.
import { GLYPH_STRIDE, type WriteResult } from './write-protocol';

export interface Box {
  /** UTF-16 index of the character in the text */
  i: number;
  /** code units this character takes (2 for astral characters) */
  n: number;
  sheet: number;
  x: number;
  y: number;
  adv: number;
  line: number;
}

export interface TextMap {
  boxes: Box[];
  /** text index where each line starts (for empty lines too) */
  lineStart: number[];
  /** boxes per line */
  byLine: Box[][];
  res: WriteResult;
}

/** Every character except ' ' and '\n' gets a box from layout, in reading order. */
export function buildMap(res: WriteResult): TextMap {
  const { text, glyphs } = res;
  const boxes: Box[] = [];
  const lineStart: number[] = [0];
  let g = 0;
  let line = 0;
  let i = 0;
  for (const ch of text) {
    const n = ch.length;
    if (ch === '\n') {
      line += 1;
      if (lineStart[line] == null) lineStart[line] = i + 1;
    } else if (ch !== ' ' && g * GLYPH_STRIDE < glyphs.length) {
      const o = g * GLYPH_STRIDE;
      const b: Box = { i, n, sheet: glyphs[o], x: glyphs[o + 1], y: glyphs[o + 2], adv: glyphs[o + 3], line: glyphs[o + 4] };
      boxes.push(b);
      if (b.line !== line) {
        line = b.line;
        if (lineStart[line] == null || lineStart[line] > i) lineStart[line] = i;
      }
      g++;
    }
    i += n;
  }
  const byLine: Box[][] = [];
  for (const b of boxes) (byLine[b.line] ??= []).push(b);
  return { boxes, lineStart, byLine, res };
}

/** Nominal baseline of a line, font units from the sheet top, and the sheet it's on. */
export function lineBaseline(m: TextMap, line: number) {
  const { res } = m;
  const sheet = Math.floor(line / res.perPage);
  const local = line - sheet * res.perPage;
  return { sheet, y: (res.firstMm + local * res.lineMm) * res.unitsPerMm };
}

export interface Caret {
  sheet: number;
  x: number;
  y: number;
  line: number;
}

/** Where the caret sits for a text index (font units, sheet-relative). */
export function caretAt(m: TextMap, index: number): Caret {
  const { boxes, res } = m;
  const text = res.text;
  index = Math.max(0, Math.min(index, text.length));
  // binary search: first box with i >= index
  let lo = 0, hi = boxes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (boxes[mid].i < index) lo = mid + 1; else hi = mid;
  }
  const at = boxes[lo];
  // right before a written character (also when that character starts a wrapped line)
  if (at && at.i === index) return { sheet: at.sheet, x: at.x, y: at.y, line: at.line };
  // otherwise the caret follows the previous character, plus any spaces or new lines since
  const prev = boxes[lo - 1];
  const gap = between(text, prev ? prev.i + prev.n : 0, index);
  if (!prev || gap.newlines > 0) {
    const line = (prev ? prev.line : 0) + gap.newlines;
    const { sheet, y } = lineBaseline(m, line);
    return { sheet, x: res.leftU + Math.min(gap.trailingSpaces, 1) * res.spaceU, y, line };
  }
  // layout collapses runs of spaces into one gap
  return { sheet: prev.sheet, x: prev.x + prev.adv + Math.min(gap.spaces, 1) * res.spaceU, y: prev.y, line: prev.line };
}

function between(text: string, a: number, b: number) {
  let spaces = 0, newlines = 0, trailingSpaces = 0;
  for (let k = a; k < b; k++) {
    const c = text.charCodeAt(k);
    if (c === 10) { newlines++; trailingSpaces = 0; }
    else if (c === 32) { spaces++; trailingSpaces++; }
  }
  return { spaces, newlines, trailingSpaces };
}

/** The text index nearest to a point on a line (font units, sheet-relative x). */
export function indexOnLine(m: TextMap, line: number, x: number): number {
  const text = m.res.text;
  const totalLines = Math.max(m.res.lines, m.lineStart.length);
  if (line < 0) return 0;
  if (line >= totalLines) return text.length;
  const row = m.byLine[line];
  if (!row || !row.length) {
    const start = m.lineStart[line];
    return start == null ? text.length : start;
  }
  for (const b of row) if (x < b.x + b.adv / 2) return b.i;
  const last = row[row.length - 1];
  return last.i + last.n;
}

/** Which line a y position (font units, sheet-relative) falls on. */
export function lineAtY(m: TextMap, sheet: number, y: number) {
  const { res } = m;
  const local = Math.floor((y / res.unitsPerMm - res.firstMm) / res.lineMm + 0.72);
  return sheet * res.perPage + Math.max(0, Math.min(res.perPage - 1, local));
}

/** Line start / end for Home and End. */
export function lineEdges(m: TextMap, line: number) {
  const row = m.byLine[line];
  const start = m.lineStart[line] ?? (row && row.length ? row[0].i : m.res.text.length);
  if (!row || !row.length) return { start, end: start };
  const last = row[row.length - 1];
  return { start: Math.min(start, row[0].i), end: last.i + last.n };
}

/**
 * Translate a text index from one version of the text to another (the page may still show the
 * previous version for a few milliseconds while the worker writes the new one).
 */
export function translateIndex(index: number, from: string, to: string) {
  if (from === to) return index;
  let p = 0;
  const max = Math.min(from.length, to.length);
  while (p < max && from.charCodeAt(p) === to.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && from.charCodeAt(from.length - 1 - s) === to.charCodeAt(to.length - 1 - s)) s++;
  if (index <= p) return index;
  if (index >= from.length - s) return index - from.length + to.length;
  return Math.min(p + (index - p), to.length - s);
}
