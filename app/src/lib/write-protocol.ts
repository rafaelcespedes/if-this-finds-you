import type { PaperId } from './papers';
import type { Overrides } from './state';

/** What the page needs to be written. Ink and screen size are not part of it (see lib/writing.ts). */
export interface WriteRequest {
  id: number;
  seed: string;
  style: string;
  overrides: Overrides;
  text: string;
  paper: PaperId;
  size: number;
}

/** Floats per laid-out character in `WriteResult.glyphs`: sheet, x, y, advance, line, kind (1 glyph, 0 missing). */
export const GLYPH_STRIDE = 6;

export interface WriteResult {
  id: number;
  /** seed:style the writing was made for */
  handKey: string;
  paper: PaperId;
  svgs: string[];
  emMm: number;
  lineMm: number;
  firstMm: number;
  perPage: number;
  unitsPerMm: number;
  /** one entry per written character (every non-space character, in reading order) */
  glyphs: Float32Array;
  ms: number;
}
