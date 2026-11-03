// Caret geometry: everything the editor needs to know about where text sits on the sheets.
// Two implementations:
//   - mapGeometry: from the worker's glyph boxes (any engine), with the app's own caret rules (lib/caret.ts)
//   - engineGeometry (lib/live.ts): the engine's own stops, slanted caret, hit-testing and ribbons
// Coordinates are font units, sheet-local: x from the sheet's left edge, y down from the sheet's top.
import { buildMap, caretAt, indexOnLine, lineAtY, lineEdges, translateIndex, type TextMap } from './caret';
import type { WriteResult } from './write-protocol';

export interface CaretPos {
  sheet: number;
  /** baseline point under the caret */
  x: number;
  y: number;
  /** top of a slanted caret, when the engine knows the lean */
  top?: [number, number];
  line: number;
}

export interface Ribbon {
  sheet: number;
  /** polygon points (font units, sheet-local) */
  points: [number, number][];
}

export interface Geometry {
  /** the text this geometry was made for (the live text may be a keystroke ahead) */
  text: string;
  unitsPerMm: number;
  emMm: number;
  lineMm: number;
  sheets: number;
  /** caret band above / below the baseline, font units */
  ascU: number;
  descU: number;
  caret(o: number): CaretPos | null;
  hit(sheet: number, x: number, y: number): number;
  /** Up/Down: the offset on the next line, keeping a goal x */
  vertical(o: number, dir: -1 | 1, goalX: number | null): { o: number; goalX: number };
  /** Home/End: the written line's start and end around o */
  edges(o: number): { start: number; end: number };
  ribbons(from: number, to: number): Ribbon[];
  /** the draft's corrections in words (journey), for screen readers */
  summary?: string;
}

/** Geometry from the worker's result: glyph boxes plus the app's caret rules. */
export function mapGeometry(res: WriteResult): Geometry {
  const map: TextMap = buildMap(res);
  const emU = res.emMm * res.unitsPerMm;
  const ascU = 0.74 * emU, descU = 0.2 * emU;
  return {
    text: res.text,
    unitsPerMm: res.unitsPerMm,
    emMm: res.emMm,
    lineMm: res.lineMm,
    sheets: res.svgs.length,
    ascU,
    descU,
    summary: res.summary,
    caret: (o) => caretAt(map, o),
    hit: (sheet, x, y) => indexOnLine(map, lineAtY(map, sheet, y), x),
    vertical: (o, dir, goalX) => {
      const c = caretAt(map, o);
      const gx = goalX ?? c.x;
      const target = c.line + dir;
      return { o: target < 0 ? 0 : indexOnLine(map, target, gx), goalX: gx };
    },
    edges: (o) => lineEdges(map, caretAt(map, o).line),
    ribbons: (from, to) => {
      // one shape per written line, following that line's own baseline
      const byLine = new Map<string, typeof map.boxes>();
      for (const b of map.boxes) {
        if (b.i < from || b.i >= to) continue;
        const key = b.sheet + ':' + b.line;
        if (!byLine.has(key)) byLine.set(key, []);
        byLine.get(key)!.push(b);
      }
      return [...byLine.values()].map((boxes) => {
        const end = boxes[boxes.length - 1];
        const top: [number, number][] = boxes.map((bx) => [bx.x, bx.y - ascU * 0.92]);
        top.push([end.x + end.adv, end.y - ascU * 0.92]);
        const bottom: [number, number][] = [...boxes].reverse().map((bx) => [bx.x, bx.y + descU * 0.9]);
        bottom.unshift([end.x + end.adv, end.y + descU * 0.9]);
        return { sheet: boxes[0].sheet, points: [...top, ...bottom] };
      });
    },
  };
}

/** Move an offset between two versions of the text (see translateIndex). */
export const across = translateIndex;
