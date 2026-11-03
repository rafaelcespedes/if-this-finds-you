import type { PaperId } from './papers';
import type { Mark } from './doc';

/** What the page needs to be written. Ink and screen size are not part of it (see lib/writing.ts). */
export interface WriteRequest {
  id: number;
  seed: string;
  style: string;
  /** absolute engine overrides (lib/params.ts) */
  overrides: Record<string, number | string>;
  text: string;
  paper: PaperId;
  size: number;
  lineSpacing: number;
  /** ink swatch key when the engine models ink; null = flat currentColor */
  inkKey: string | null;
  /** the flat ink colour the page shows (echoed back, so ink changes land with the new writing) */
  inkColor: string;
  /** handwriting marks: underlines, pressed letters */
  marks?: Mark[];
  /** sign below the last line, with this name */
  signed?: boolean;
  writerName?: string;
  /** for the screen only: when the note is empty, this is written faintly in graphite on line 1 */
  placeholder?: string;
  /** Ink mode: the letter's ink log (lib/ink.ts encodeInk); the page is replayed from it */
  ink?: string | null;
}

/** Floats per laid-out character in `WriteResult.glyphs`: text offset, sheet, x, y, advance, line, kind (1 glyph, 0 missing). */
export const GLYPH_STRIDE = 7;

export interface WriteResult {
  id: number;
  /** seed:style the writing was made for */
  handKey: string;
  paper: PaperId;
  inkKey: string | null;
  inkColor: string;
  svgs: string[];
  emMm: number;
  lineMm: number;
  firstMm: number;
  /** the first line of each sheet, and how far up (font units) each sheet's lines were moved */
  breaks: number[];
  shifts: number[];
  unitsPerMm: number;
  /** one entry per written character of the text (extra ink such as struck words is left out) */
  glyphs: Float32Array;
  /** the draft's corrections in words, for screen readers (journey) */
  summary?: string;
  /** the text this was written from (positions map onto it) */
  text: string;
  /** the look it was written in (lib/request.ts lookOf) */
  look: string;
  /** only the first sheet is written yet (a long letter: the rest follows in the same request's next result);
   * the other sheets are '' for now */
  partial?: boolean;
  /** the request it answers, as JSON (set on the main thread; the cache key) */
  key?: string;
  /** one word space, font units */
  spaceU: number;
  /** writing area left edge on the sheet, font units */
  leftU: number;
  /** total lines laid out */
  lines: number;
  ms: number;
}
