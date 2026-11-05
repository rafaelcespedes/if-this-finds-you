// The fonts video's timing (every time in seconds, so another frame rate keeps it):
//   0.0  close on one row: a blinking cursor
//   0.5–2.2  "The quick brown fox jumps over the lazy dog" typed, quickly; the camera holds, the line runs off the frame
//   1.1–2.6  the camera pulls back, zooming out from the start of the line: it's one row of a long list
//   2.6–3.3  it sits: a moment to take in the list (Rafael: it started scrolling too soon)
//   3.3–7.2  the list scrolls, picking up from rest, faster and faster, to a blur
//   7.2–8.8  slowing down, to a dead stop on a row
//   9.2–10.6 pulling back again: the page's header and tester bar, the browser window, the address
//   10.65–11.4 the pointer glides to the tester; a click clears it; the ending words are typed, every row following
//   14.0 end (the first frame follows: it loops)
// (the page's sizes are FontList's: two photos of the live page, 1600 × 1000 and 1024 × 1150)
export const ROW = 128; // a row at the page's 64 px
export const LINE = 'The quick brown fox jumps over the lazy dog';
export const TYPED = 'If this finds you';
export const T = {
  caret: 0.5, rowType: [0.5, 2.2], ease: [1.1, 2.6], scroll: [3.3, 8.8], peak: 7.2, pull: [9.2, 10.6],
  move: [10.65, 11.4], click: 11.45, type: [11.7, 13.1], end: 14.0,
};
export const SECONDS = T.end;

const DOUBLE = 0.65;
/** speed (rows a second, before scaling): slow start, doubling every DOUBLE seconds to the peak, then easing to rest */
function speed(t: number) {
  const [a, b] = T.scroll;
  if (t <= a || t >= b) return 0;
  const start = 1.2;
  // from rest: the first 0.7 s fade the speed in (smoothstep), so the scroll never jumps into motion
  const r = Math.min(1, (t - a) / 0.7), fadeIn = r * r * (3 - 2 * r);
  if (t <= T.peak) return start * Math.pow(2, (t - a) / DOUBLE) * fadeIn;
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

/** when each character of a typed text appears: a person's rhythm (a deterministic jitter, a beat longer at spaces),
 *  fitted to the window [a, b] */
export function typeTimes(text: string, [a, b]: number[], salt = 1) {
  let x = 0x9e3779b9 ^ (salt * 2654435761);
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  const gaps = [...text].map((ch, i) => (i === 0 ? 0.6 : 1) * (ch === ' ' ? 1.35 : 1) * (0.65 + 0.7 * rnd()));
  const total = gaps.reduce((s, g) => s + g, 0);
  let acc = 0;
  return gaps.map((g) => { acc += g; return a + ((b - a) * acc) / total; });
}
