import type { PaperId } from './papers';

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
}

/** Floats per laid-out character in `WriteResult.glyphs`: sheet, x, y, advance, line, kind (1 glyph, 0 missing). */
export const GLYPH_STRIDE = 6;

export interface WriteResult {
  id: number;
  /** seed:style the writing was made for */
  handKey: string;
  paper: PaperId;
  inkKey: string | null;
  svgs: string[];
  emMm: number;
  lineMm: number;
  firstMm: number;
  perPage: number;
  unitsPerMm: number;
  /** one entry per written character (every non-space character, in reading order) */
  glyphs: Float32Array;
  /** the text this was written from (positions map onto it) */
  text: string;
  /** one word space, font units */
  spaceU: number;
  /** writing area left edge on the sheet, font units */
  leftU: number;
  /** total lines laid out */
  lines: number;
  ms: number;
}
