// The fonts video's timing (30 fps; every time in seconds, so another frame rate keeps it):
//   0.0  close on the first row, its line writing itself in (the page's fx-write: 0.9 s, its ease)
//   1.3  the camera eases out to the list as it starts to scroll
//   1.3–5.0  faster and faster, to a blur (speed doubling every 0.62 s, to about 2.5 rows a frame)
//   5.0–6.6  slowing down, to a dead stop on a row
//   7.0–8.4  pulling back: the page's header and tester bar, then the browser window around it
//   8.6–9.2  the pointer goes to the tester; a click clears it; the words are typed in, every row following
//   12.0 end (the first frame follows: it loops)
export const ROW = 128; // the page's row at 64 px (measured on the live page, 1024 wide)
export const LIST_TOP = 170; // under the sticky header (65) and tester bar (105)
export const VIEW = { w: 1024, h: 720 };
export const TYPED = 'If this finds you';
export const T = {
  write: [0.0, 0.9], ease: [1.3, 2.1], scroll: [1.3, 6.6], peak: 5.0, pull: [7.0, 8.4],
  move: [8.6, 9.2], click: 9.25, type: [9.5, 10.9], end: 12.0,
};
export const SECONDS = T.end;

const DOUBLE = 0.62;
/** speed (rows a second, before scaling): slow start, doubling every half second to the peak, then easing to rest */
function speed(t: number) {
  const [a, b] = T.scroll;
  if (t <= a || t >= b) return 0;
  const start = 1.2; // rows a second as it starts
  if (t <= T.peak) return start * Math.pow(2, (t - a) / DOUBLE);
  const x = (t - T.peak) / (b - T.peak);
  const top = start * Math.pow(2, (T.peak - a) / DOUBLE);
  return top * Math.pow(1 - x, 2.2);
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
/** rows a second at t (scaled), for the blur and the sound */
export const rowsPerSecond = (t: number) => k * speed(t);
