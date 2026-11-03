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
  /** raster width of the card image, px */
  width: number;
  /** the card's width on screen, CSS px (sets how much of the sheet it shows) */
  css: number;
}

/** Sent once when a worker starts: get the engine's renderer ready before the first card is asked for. */
export interface CardWarm {
  warm: true;
}

export type CardResult =
  | { job: number; id: string; blob: Blob; look: Look; width: number; height: number; ms: number }
  | { job: number; id: string; error: string };

/** A card is this tall for its width. */
export const CARD_RATIO = 0.62;

/** On screen, a card shows the sheet at about this many CSS px per mm (the tool's sheet is up to 3.9). */
export const CARD_PX_PER_MM = 2.3;

/**
 * The part of a sheet a card shows (mm): the top left, as wide as the card shows at CARD_PX_PER_MM (never more
 * than the sheet), from a little above the first line. `right` is the margin the writing keeps from the window's
 * right edge, so lines are whole.
 */
export function cardWindow(paper: { w: number; h: number; text: { left: number; right: number; first: number } }, css: number) {
  const w = Math.min(paper.w, Math.max(paper.text.left + 60, css / CARD_PX_PER_MM));
  const h = w * CARD_RATIO;
  const top = Math.max(0, Math.min(paper.h - h, paper.text.first - 13));
  const right = Math.min(12, Math.max(7, paper.w - paper.text.right));
  return { w, h, top, right };
}
