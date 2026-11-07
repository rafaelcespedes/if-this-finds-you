// The red pencil's questions about the page (PaperEditor's `pencil` prop, on /write only): how big the caret is where
// it sits (an insertion above the line is written smaller), where the ink before it ends, where the drawn pen has got
// to (the nib), and where a strike the pen is hovering over will go. Read-only: page items, in page font units.
import type { CaretPos } from '@/lib/geometry';
import type { PencilFit, PencilSpan } from '@/components/PaperEditor';

export type PageItem = {
  kind: string;
  key?: string | number;
  box?: number[];
  y: number;
  line?: number;
  role?: string;
  g?: { strokes?: unknown[]; pose?: { scale?: number } };
};

/** where items and carets sit: a sheet's top in page units, and the sheet a page item is on */
export interface PencilFrame {
  /** a sheet's top, page units (the caret is sheet-local) */
  shift: (sheet: number) => number;
  /** the sheet an item is on */
  sheetOf: (it: PageItem) => number;
}

const glyph = (it: PageItem) => it.kind === 'glyph' && !!it.box && !!it.g?.strokes?.length;
const scaleOf = (it: PageItem) => it.g?.pose?.scale ?? 1;

/**
 * The caret's size where it sits, and the right edge of the ink before it on its line. An insertion above the line is
 * written smaller (about 0.6×): a caret inside one, written or still grey, is drawn at its size. Looks at the
 * letters on the caret's own baseline, nearest first; `lists` are the page's items and the thought letters'.
 */
export function caretFit(lists: PageItem[][], xhU: number, frame: PencilFrame, c: CaretPos): PencilFit {
  const Y = c.y + frame.shift(c.sheet);
  let near: PageItem | null = null, nd = Infinity, right = -Infinity, ceil = -Infinity;
  for (const list of lists) {
    for (const it of list) {
      if (!glyph(it)) continue;
      // the ink of the lines above, over the caret (its descenders too): the dashed caret above the line stops short of it
      if (it.line !== c.line && it.y < Y - 0.45 * xhU && Y - it.y < 6 * xhU) {
        const [x0, , x1, y1] = it.box!;
        if (x1 >= c.x - 0.7 * xhU && x0 <= c.x + 0.7 * xhU && y1 > ceil) ceil = y1;
      }
      if (Math.abs(it.y - Y) > 0.45 * xhU) continue;
      const [x0, , x1] = it.box!;
      const d = c.x < x0 ? x0 - c.x : c.x > x1 ? c.x - x1 : 0;
      if (d < nd) { nd = d; near = it; }
      // (the ink before the caret: letters whose middle is left of it)
      if ((x0 + x1) / 2 <= c.x + 1 && x1 > right) right = x1;
    }
  }
  let scale = 1;
  if (!near || nd >= 1.5 * xhU) {
    // no letters at the caret's height (an insertion whose grey letters this can't see): a caret lifted well above
    // its own line's writing is in an insertion above it, written at about 0.6
    let base: PageItem | null = null, bd = Infinity;
    for (const list of lists) for (const it of list) {
      if (!glyph(it) || it.line !== c.line || it.role === 'insert') continue;
      const d = Math.abs((it.box![0] + it.box![2]) / 2 - c.x);
      if (d < bd) { bd = d; base = it; }
    }
    if (base && base.y - Y > 1.1 * xhU) scale = 0.62;
  } else {
    // the size of the main writing on that line, to measure an insertion's against
    let sum = 0, n = 0;
    for (const list of lists) for (const it of list) if (glyph(it) && it.line === near.line && it.role !== 'insert' && it !== near) { sum += scaleOf(it); n++; }
    const main = n ? sum / n : 1;
    const r = scaleOf(near) / main;
    if (near.role === 'insert' || r < 0.8) scale = Math.max(0.4, Math.min(1, r));
  }
  return { scale, inkRight: Number.isFinite(right) ? right : undefined, ceil: Number.isFinite(ceil) ? ceil - frame.shift(c.sheet) : undefined };
}

/** where a strike will go: the letters the pen hovers over (by item key), a span per line, baseline at each end */
export function strikeSpans(items: PageItem[], keys: readonly string[], frame: PencilFrame): PencilSpan[] {
  if (!keys.length) return [];
  const want = new Set(keys);
  const lines = new Map<string, { sheet: number; a: PageItem; b: PageItem }>();
  for (const it of items) {
    if (!it.box || it.key == null || !want.has(String(it.key))) continue;
    const sheet = frame.sheetOf(it);
    const id = sheet + ':' + (it.line ?? 0);
    const l = lines.get(id);
    if (!l) lines.set(id, { sheet, a: it, b: it });
    else {
      if (it.box[0] < l.a.box![0]) l.a = it;
      if (it.box[2] > l.b.box![2]) l.b = it;
    }
  }
  return [...lines.values()].map(({ sheet, a, b }) => {
    const top = frame.shift(sheet);
    return { sheet, x0: a.box![0], x1: b.box![2], y0: a.y - top, y1: b.y - top };
  });
}

type PenState = { writing: { key: string; stroke: number; frac: number } | null; ink: (key: string, si: number) => number };
type DrawnPenLike = { at(now: number): unknown } | null | undefined;

/**
 * The drawn pen's head, for the nib: the letter (or mark) it's writing, and how far through its strokes; between
 * strokes, where it last was; with nothing yet, the last letter it has finished. Sheet-local page units, on the
 * letter's baseline (a mark: its middle).
 */
export function nibFinder() {
  let byKey = new Map<string, PageItem>();
  let indexed: PageItem[] | null = null, indexedN = -1;
  let last: { sheet: number; x: number; y: number } | null = null;
  const at = (frame: PencilFrame, it: PageItem, prog: number) => {
    const [x0, y0, x1, y1] = it.box!;
    const py = it.kind === 'glyph' ? it.y : (y0 + y1) / 2;
    const sheet = frame.sheetOf(it);
    return { sheet, x: x0 + (x1 - x0) * Math.max(0, Math.min(1, prog)), y: py - frame.shift(sheet) };
  };
  return {
    reset() { last = null; },
    find(pen: DrawnPenLike, items: PageItem[], frame: PencilFrame) {
      if (!pen) return null;
      // (the page's item list may grow in place: indexed again when it has)
      if (items !== indexed || items.length !== indexedN) {
        byKey = new Map();
        for (const it of items) if (it.key != null && it.box) byKey.set(String(it.key), it);
        indexed = items; indexedN = items.length;
      }
      const st = pen.at(performance.now() / 1000) as PenState;
      const w = st.writing;
      const it = w ? byKey.get(String(w.key)) : undefined;
      if (it && it.g?.strokes?.length) return (last = at(frame, it, (w!.stroke + w!.frac) / it.g.strokes.length));
      if (last) return last;
      // the last letter fully inked, from the end of the page (what's still to write is near the end)
      for (let i = items.length - 1; i >= 0; i--) {
        const g = items[i];
        const n = g.g?.strokes?.length ?? 0;
        if (!n || !g.box || g.key == null) continue;
        if (st.ink(String(g.key), n - 1) >= 1) return (last = at(frame, g, 1));
      }
      return null;
    },
  };
}
