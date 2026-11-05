// The video's settings, shared by the keystroke script (scripts/ink-session.ts) and the video (src/InkDemo.tsx).
// Change any of these, then run `npm run session` to record the typing again.

/**
 * The writer: a seed (any word works; the site's look like "soft-thistle-38") and a school of handwriting, with the
 * pen, its tip and the ink. `params` are optional fine-tuning (neatness, slant, pressure…): leave it {} for the
 * seed's own hand. Find hands you like at https://ifthisfindsyou.app/fonts; this one is Hana Hartmann there.
 * Schools: print, script, palmer, spencerian, suetterlin, kurrent-1849, arrighi, quebec-print, norwegian-1849,
 * polish-1906, spanish-1776, dutch-1618, adult-fr-2023. Pens: ballpoint, gel, fountain, pointed, italic, felt,
 * pencil. Inks: e.g. royal-blue, blue-black, black, sepia, iron-gall, graphite.
 */
export const HAND = {
  seed: 'soft-thistle-38',
  style: 'script',
  pen: 'fountain',
  tip: 'medium',
  ink: 'royal-blue',
  params: {
    neatness: 0.821, slant: 9.08, pressure: 0.311, hurry: 0.127, blend: 0, lineWander: 0.598, fatigue: 1.234, loops: 0.52,
    leadIns: 0.12, endFlicks: 0.11, flourish: 0.09, lifts: 0, joinLength: 0, angularity: -0.58, loopHeight: -0.14,
    bowls: -0.51, rhythm: -0.35, mistakes: 0.179, inkAge: 0.53, inkVariation: 0.58,
  } as Record<string, number>,
  name: 'Hana Hartmann',
};
/** the sheet: one of the site's papers (app/src/lib/papers.ts: pad, laid, notebook, postcard, airmail…) */
export const PAPER = 'pad';
/** how much of the paper's own line length the writing uses (1 = the whole column) */
export const MEASURE = 1.0;
/**
 * The letter's salt: how this writer corrects (writing a letter over another, or striking the word) is a roll
 * seeded by it, so the same keystrokes always give the same page. Try another (`INK_SALT=b npm run session`) to
 * get a different correction.
 */
export const SALT = 'a';
/** the pen's pace, letters a second (the site's own is 2, catching up to 8 when it falls behind) */
export const PEN_SPEED = 4.5;
