import type { ArchiveLetter, Look } from './model';

/** The fields of a letter the worker needs to pick its hand (look.ts reads all of these) and write its opening. */
export type CardLetter = Pick<ArchiveLetter, 'id' | 'text' | 'lang' | 'year' | 'tags' | 'traditions' | 'olderHandsOnly' | 'look' | 'origin' | 'recipient'> & {
  found?: Pick<NonNullable<ArchiveLetter['found']>, 'circumstance'>;
};

export interface CardRequest {
  job: number;
  letter: CardLetter;
  /** a chosen hand (seed~style); the letter's own hand when absent */
  hand?: string;
  /** raster width of the sheet in the image, px */
  width: number;
  /** the card's width on screen, CSS px (the shadow's size) */
  css: number;
  /** the sheet's height for its width (the page lays the grid out with it before the image exists) */
  aspect: number;
  /** the whole first sheet at its paper's own size (the Reading Room's table): `width` spans the paper's width and
   * `aspect` is the paper's */
  full?: boolean;
  /** how worn the page's sheets are (lib/paper/wear.ts: 0 new, 1 gentle, 2 well worn) */
  wear?: 0 | 1 | 2;
}

/** Sent once when a worker starts: get the engine's renderer ready before the first card is asked for. */
export interface CardWarm {
  warm: true;
}

export type CardResult =
  | { job: number; id: string; blob: Blob; look: Look; width: number; height: number; bleed: number; shaped: boolean; ms: number }
  | { job: number; id: string; error: string };

/**
 * How tall a card's sheet is for its width, from the letter's length alone (no engine needed, so the grid is laid
 * out before any card is written and never moves): about 34 letters a line on an A5 sheet, lines 10.5 mm apart,
 * a 27 mm top and a 20 mm bottom. Between a short note card and a whole sheet.
 */
export function cardAspect(text: string) {
  const lines = text.split('\n').reduce((n, para) => n + Math.max(1, Math.ceil(para.length / 34)), 0);
  const mm = 27 + lines * 10.5 + 20;
  return Math.min(1.42, Math.max(0.62, mm / 148));
}
