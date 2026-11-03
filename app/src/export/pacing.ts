// Pacing: how video time maps onto the writer's own time (engine/animate.js timeline).
//
// Two steps, both pure functions of the timeline, so a clip comes out the same every time:
//  1. Work time. Strokes keep their real duration; pen lifts under 0.15 s stay as they are (that is the
//     hand's rhythm), longer pauses (between words, at a line return, a new paragraph) are halved past that.
//  2. Speed. The clip opens at about 3x a real hand for two seconds, so you see how this person writes,
//     then eases up (smoothstep over 3 s) to whatever speed fits the writing into its budget.
import type { Ev, Timeline } from './types';

const KEEP_GAP = 0.15;   // s: pen lifts up to this stay real
const GAP_RATE = 0.5;    // longer pauses: half speed past KEEP_GAP
export const START_SPEED = 3;
const RAMP_AT = 2;       // s of video at START_SPEED before speeding up
const RAMP_LEN = 3;      // s of video to reach full speed

/** Hand time <-> work time: knots at every stroke's start and end. */
export interface WorkClock {
  /** hand time at the knots (s, the timeline's own clock) */
  t: Float64Array;
  /** work time at the knots */
  w: Float64Array;
  /** total work */
  total: number;
}

export function workClock(events: Ev[]): WorkClock {
  const n = events.length;
  const t = new Float64Array(2 * n), w = new Float64Array(2 * n);
  let acc = 0, prevEnd = n ? events[0].t0 : 0;
  events.forEach((e, i) => {
    const gap = Math.max(0, e.t0 - prevEnd);
    acc += gap <= KEEP_GAP ? gap : KEEP_GAP + (gap - KEEP_GAP) * GAP_RATE;
    t[2 * i] = e.t0; w[2 * i] = acc;
    acc += e.dur;
    t[2 * i + 1] = e.t0 + e.dur; w[2 * i + 1] = acc;
    prevEnd = e.t0 + e.dur;
  });
  return { t, w, total: acc };
}

/** Work done by the end of event i. */
export const workAt = (c: WorkClock, i: number) => c.w[2 * i + 1];

/** Hand time for an amount of work (piecewise linear between the knots). */
export function handTime(c: WorkClock, work: number) {
  const { t, w } = c;
  const n = w.length;
  if (!n) return 0;
  if (work <= 0) return t[0];
  if (work >= w[n - 1]) return t[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (w[m] <= work) lo = m; else hi = m; }
  const span = w[hi] - w[lo];
  return t[lo] + (span > 0 ? (work - w[lo]) / span : 0) * (t[hi] - t[lo]);
}

/** A speed curve over video time: START_SPEED, then easing up to `top`. */
export interface Speed {
  top: number;
  /** video seconds the writing takes */
  seconds: number;
  /** work done by video time v (0 <= v <= seconds) */
  work(v: number): number;
}

// integral of smoothstep from 0 to x
const S1 = (x: number) => x * x * x - (x * x * x * x) / 2;

function curve(s0: number, s1: number) {
  return (v: number) => {
    if (v <= RAMP_AT) return s0 * v;
    if (v <= RAMP_AT + RAMP_LEN) return s0 * v + (s1 - s0) * RAMP_LEN * S1((v - RAMP_AT) / RAMP_LEN);
    return s0 * v + (s1 - s0) * (v - RAMP_AT - RAMP_LEN / 2);
  };
}

/** The speed that fits `work` seconds of writing into `budget` seconds of video. */
export function fitSpeed(work: number, budget: number): Speed {
  const s0 = START_SPEED;
  if (work <= s0 * budget) return { top: s0, seconds: work / s0, work: curve(s0, s0) };
  if (budget <= RAMP_AT + RAMP_LEN) {
    const s = work / budget;
    return { top: s, seconds: budget, work: (v) => s * v };
  }
  const s1 = s0 + (work - s0 * budget) / (budget - RAMP_AT - RAMP_LEN / 2);
  return { top: s1, seconds: budget, work: curve(s0, s1) };
}

/** Hand time at video time v into the writing. */
export const handAt = (tl: Timeline, clock: WorkClock, speed: Speed, v: number) =>
  v <= 0 ? (tl.events[0]?.t0 ?? 0) : v >= speed.seconds ? tl.duration : handTime(clock, speed.work(v));
