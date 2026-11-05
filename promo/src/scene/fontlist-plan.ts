// The fonts video's timing (every time in seconds, so another frame rate keeps it):
//   0.0  close on one row: a blinking cursor
//   0.5–2.2  "The quick brown fox jumps over the lazy dog" typed, quickly; the camera holds, the line runs off the frame
//   1.2–2.4  the camera pulls back: it's one row of a long list, every row in its own hand's font
//   2.3–6.0  the list scrolls, faster and faster, to a blur (speed doubling every 0.62 s, to about 2.5 rows a frame)
//   6.0–7.6  slowing down, to a dead stop on a row
//   8.0–9.4  pulling back again: the page's header and tester bar, the browser window, the address
//   9.6–10.2 the pointer goes to the tester; a click clears it; "If this finds you" is typed, every row following
//   12.8 end (the first frame follows: it loops)
import page from '../data/fonts-page.json';

export const VIEW = { w: page.width, h: page.height }; // the browser's page, CSS px (1600 × 1000)
export const LIST_TOP = page.bar.bottom; // under the sticky header and tester bar (126)
export const ROW = 128; // a row at the page's 64 px
export const LINE = 'The quick brown fox jumps over the lazy dog';
export const TYPED = 'If this finds you';
export const T = {
  caret: 0.5, rowType: [0.5, 2.2], ease: [1.2, 2.4], scroll: [2.3, 7.6], peak: 6.0, pull: [8.0, 9.4],
  move: [9.6, 10.2], click: 10.25, type: [10.5, 11.9], end: 12.8,
};
export const SECONDS = T.end;

const DOUBLE = 0.62;
/** speed (rows a second, before scaling): slow start, doubling every DOUBLE seconds to the peak, then easing to rest */
function speed(t: number) {
  const [a, b] = T.scroll;
  if (t <= a || t >= b) return 0;
  const start = 1.2;
  if (t <= T.peak) return start * Math.pow(2, (t - a) / DOUBLE);
  const x = (t - T.peak) / (b - T.peak);
  return start * Math.pow(2, (T.peak - a) / DOUBLE) * Math.pow(1 - x, 2.2);
}
// the scroll, integrated finely, and scaled so it comes to rest exactly on a row
const STEPS = 4000;
const cum: number[] = [0];
for (let i = 1; i <= STEPS; i++) {
  const t0 = T.scroll[0] + ((i - 1) / STEPS) * (T.scroll[1] - T.scroll[0]);
  const t1 = T.scroll[0] + (i / STEPS) * (T.scroll[1] - T.scroll[0]);
  cum.push(cum[i - 1] + ((speed(t0) + speed(t1)) / 2) * (t1 - t0));
}
export const RAW_ROWS = cum[STEPS];
export const STOP_ROW = Math.round(RAW_ROWS);
const k = STOP_ROW / RAW_ROWS;
/** the list's scroll, rows from the top (fractional) */
export function rowsAt(t: number) {
  if (t <= T.scroll[0]) return 0;
  if (t >= T.scroll[1]) return STOP_ROW;
  const f = ((t - T.scroll[0]) / (T.scroll[1] - T.scroll[0])) * STEPS;
  const i = Math.floor(f);
  return k * (cum[i] + (cum[Math.min(STEPS, i + 1)] - cum[i]) * (f - i));
}
/** rows a second at t (scaled), for the blur */
export const rowsPerSecond = (t: number) => k * speed(t);
