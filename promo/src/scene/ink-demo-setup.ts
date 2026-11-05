// The ink demo's setup, shared by the session script (scripts/ink-session.ts) and the video (src/InkDemo.tsx).
// The hand: Rafael's #13, Hana Hartmann (joined, fountain pen, royal blue), from the thread's favourites.
import specimens from '../data/specimens.json';

const h = (specimens as any[]).find((s) => s.seed === 'soft-thistle-38');
export const HAND = { seed: h.seed as string, style: h.style as string, pen: h.pen as string, tip: h.tip as string, ink: h.ink as string, params: h.params as Record<string, number>, name: h.name as string };
/** the sheet: a ruled letter pad, its column narrowed so the writing is big in the frame */
export const PAPER = 'pad';
export const MEASURE = 1.0;
export const SALT = 'a'; // (a salt whose rolls make this writer strike "quite" and write the 8 over the 3)
/** the pen's pace, letters a second (the site's own is 2, catching up to 8 when behind): brisker, for a demo */
export const PEN_SPEED = 4.5;
