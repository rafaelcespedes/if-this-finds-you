// The typing, as the hands do it: every recorded key (src/data/ink-session.json) becomes a press by the finger touch
// typing gives it, and each finger and hand moves over time to make those presses. Pure functions of time, so
// scripts/hand-session.ts can sample them frame by frame and solve the joints.
//
// A press: the finger leaves where it was a moment before (sooner the further it has to go), travels in a low arc,
// touches the key as it goes down, pushes it in, lets it up and hovers; if it isn't needed again soon it settles back
// on its home key. A modifier (Shift, ⌘) goes down just before its letter and comes up just after. The hand follows
// its busy fingers part of the way (a pinky reaching for Delete takes the hand with it), on a spring, so it lags and
// settles as a real hand does. Fingers that aren't pressing ride along with the hand, lifting off their keys when it
// moves away from home.
import * as THREE from 'three';
import { keysOf } from '../keyboard';
import { DIGITS, type Digit, type Side } from './rig';
import { FINGER, homeOf, onKey } from './home';

export interface Press { key: string; side: Side; digit: Digit; t0: number; t1: number }

/** how long a key stays down, s */
const TAP = 0.1;
/** a modifier goes down this much before its letter and comes up this much after it */
const MOD_LEAD = 0.07, MOD_TAIL = 0.12;

/** the presses for the recorded keys (sorted by time) */
export function pressesOf(keys: { t: number; key: string }[]): Press[] {
  const out: Press[] = [];
  for (const kk of keys) {
    const ids = keysOf(kk.key);
    if (!ids.length) continue;
    if (kk.key === 'BackspaceHold') { out.push({ key: 'Backspace', ...finger('Backspace'), t0: kk.t, t1: kk.t + 3 * 0.28 + 0.08 }); continue; }
    const mod = ids.length === 2 ? ids[0] : null, letter = ids[ids.length - 1];
    const lf = finger(letter);
    if (mod) {
      const mf = finger(mod);
      out.push({ key: mod, ...mf, t0: kk.t - MOD_LEAD, t1: kk.t + TAP + MOD_TAIL });
      // the same finger can't hold Shift and type A: the ring finger takes the letter
      if (mf.side === lf.side && mf.digit === lf.digit) lf.digit = 'ring-finger';
    }
    out.push({ key: letter, ...lf, t0: kk.t, t1: kk.t + TAP });
  }
  out.sort((a, b) => a.t0 - b.t0);
  // a finger needed again straight away lets its key up sooner (the key has registered; the finger has to travel)
  for (let i = 0; i < out.length; i++) {
    const next = out.slice(i + 1).find((q) => q.side === out[i].side && q.digit === out[i].digit);
    if (next) out[i].t1 = Math.max(out[i].t0 + 0.05, Math.min(out[i].t1, next.t0 - 0.1));
  }
  return out;
}
function finger(key: string): { side: Side; digit: Digit } {
  const f = FINGER[key];
  if (!f) throw new Error(`no finger for key ${JSON.stringify(key)}`);
  return { side: f[0], digit: f[1] };
}

/** where on its key a finger strikes (a thumb near its own end of the space bar, the pinky on the near side of the wide
 *  keys) */
function strikePoint(p: Press, z = 0) {
  if (p.key === ' ') return onKey(' ', p.side === 'L' ? 0.12 : 0.55, 0.5, z);
  if (p.key === 'Enter') return onKey('Enter', 0.2, 0.55, z);
  if (p.key === 'Backspace') return onKey('Backspace', 0.3, 0.55, z);
  if (p.key === 'Shift') return onKey('Shift', 0.62, 0.5, z);
  if (p.key === 'Meta') return onKey('Meta', 0.62, 0.5, z);
  return onKey(p.key, 0.5, 0.55, z);
}

const smooth = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };
const smoother = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * x * (x * (6 * x - 15) + 10); };

/** how deep a pressed key goes, mm (the fingertip follows it down) */
const TRAVEL = 1.6;
/** how high a finger hovers just after a key, mm */
const HOVER = 3.5;

export class Typist {
  readonly presses: Press[];
  private byDigit = new Map<string, Press[]>();
  constructor(keys: { t: number; key: string }[]) {
    this.presses = pressesOf(keys);
    for (const p of this.presses) {
      const k = `${p.side} ${p.digit}`;
      if (!this.byDigit.has(k)) this.byDigit.set(k, []);
      this.byDigit.get(k)!.push(p);
    }
  }

  private ride: ((p: THREE.Vector3) => THREE.Vector3) | null = null;
  /** where a press strikes: its key's strike point; a thumb on the space bar wherever along it the hand has carried the
   *  thumb */
  private strike(p: Press, z = 0) {
    const q = strikePoint(p, z);
    if (p.key === ' ' && this.ride) {
      const bar = onKey(' ', 0, 0.5), end = onKey(' ', 1, 0.5);
      q.x = Math.min(end.x - 8, Math.max(bar.x + 8, this.ride(homeOf(p.side, 'thumb')).x));
    }
    return q;
  }

  /** when a press's finger starts moving to it, and from where (its previous press, or rest) */
  private approach(side: Side, d: Digit, i: number) {
    const list = this.byDigit.get(`${side} ${d}`)!;
    const p = list[i], prev = list[i - 1];
    const to = this.strike(p);
    const from = prev && p.t0 - prev.t1 < GAP_SETTLE ? this.strike(prev) : homeOf(side, d);
    const dist = from.distanceTo(to);
    const dur = Math.min(0.26, Math.max(0.11, 0.1 + 0.006 * dist));
    const start = Math.max(prev ? prev.t1 + 0.025 : -Infinity, p.t0 - dur);
    return { start, from, to, dist };
  }

  /** a digit's fingertip contact point at t (world mm), and whether it's busy (pressing, or on its way). `ride` maps a
   *  point at the hand's home to where the hand has carried it now: an idle finger rides along with its hand, lifting
   *  off its key as the hand moves away from home (`away`, mm). */
  fingertip(side: Side, d: Digit, t: number, ride: (p: THREE.Vector3) => THREE.Vector3, away: number): { p: THREE.Vector3; busy: number } {
    const list = this.byDigit.get(`${side} ${d}`) ?? [];
    this.ride = ride;
    const idle = () => {
      // between staying over its own key and riding along with the hand
      const home = homeOf(side, d);
      const h = home.clone().lerp(ride(home), RIDE);
      h.z += Math.min(2, 0.15 * away) + (d === 'thumb' ? 0.5 : 0);
      return h;
    };
    // the press this moment belongs to: the first one not yet let go of (with its settle afterwards)
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const a = this.approach(side, d, i);
      if (t < a.start) break;
      const next = list[i + 1];
      const settleEnd = p.t1 + 0.05 + SETTLE;
      if (next && next.t0 - p.t1 < GAP_SETTLE && t >= p.t1) {
        // the next press follows soon: hover over this key until its approach starts
        const an = this.approach(side, d, i + 1);
        if (t < an.start) return { p: this.strike(p, liftAfter(t - p.t1)), busy: 1 };
        continue;
      }
      if (t > settleEnd) continue;
      if (t < p.t0) {
        // on its way: a low arc from where it was, touching down at t0
        const u = (t - a.start) / Math.max(0.01, p.t0 - a.start);
        const from = a.from.clone();
        if (!(list[i - 1] && p.t0 - list[i - 1].t1 < GAP_SETTLE)) from.copy(idle());
        else from.z = HOVER;
        const e = smoother(u);
        const q = from.clone().lerp(a.to, e);
        const lift = Math.min(10, 2.5 + 0.22 * a.dist) * Math.sin(Math.PI * Math.min(1, u * 1.08));
        q.z = from.z * (1 - e) + lift;
        // the last few hundredths of a second: down onto the key
        if (u > 0.85) q.z = Math.min(q.z, (1 - u) / 0.15 * 2.5);
        return { p: q, busy: smooth(u * 3) };
      }
      if (t <= p.t1) {
        // down: pushing the key in, then holding it
        const u = (t - p.t0) / 0.035;
        return { p: this.strike(p, -TRAVEL * smooth(u)), busy: 1 };
      }
      // let go: up off the key, then back to rest
      const up = t - p.t1;
      const q = this.strike(p, liftAfter(up));
      if (up < 0.05) return { p: q, busy: 1 };
      const u = smoother((up - 0.05) / SETTLE);
      return { p: q.lerp(idle(), u), busy: 1 - u };
    }
    return { p: idle(), busy: 0 };
  }

  /** how far a press needs its hand moved (world mm, from home) so its finger can reach comfortably; set by the
   *  recording script, which can try the reach on the skeleton. Without it the hand follows REACH of the reach. */
  readonly need = new Map<Press, THREE.Vector3>();
  /** the reach a press asks of its finger from home (world mm, flat) */
  reachOf(p: Press) { const r = strikePoint(p).sub(homeOf(p.side, p.digit)); r.z = 0; return r; }
  strikeOf(p: Press) { return strikePoint(p); }

  /** how much a press holds its hand at t (0..1): from a little before its finger sets off until a moment after it
   *  lets go */
  hold(p: Press, t: number) {
    const list = this.byDigit.get(`${p.side} ${p.digit}`)!;
    const a = this.approach(p.side, p.digit, list.indexOf(p));
    const lead = HAND_LEAD + 0.5 * (p.t0 - a.start);
    return smooth((t - (p.t0 - lead)) / lead) * (1 - smooth((t - p.t1 - 0.03) / 0.3));
  }
  /** the presses of a hand that hold it at t, with how much */
  holding(side: Side, t: number): [Press, number][] {
    const out: [Press, number][] = [];
    for (const p of this.presses) { if (p.side !== side || p.t0 - 0.6 > t || p.t1 + 0.4 < t) continue; const w = this.hold(p, t); if (w > 0) out.push([p, w]); }
    return out;
  }

  /** where a hand wants to be, relative to its home placement: where its presses need it, each as much as it holds the
   *  hand (an average, so presses close together don't add up), and home when none does */
  handPull(side: Side, t: number): THREE.Vector3 {
    const pull = new THREE.Vector3();
    let sum = 0;
    for (const [p, w] of this.holding(side, t)) {
      pull.addScaledVector(this.need.get(p) ?? this.reachOf(p).multiplyScalar(REACH[p.digit]), w);
      sum += w;
    }
    return sum > 1 ? pull.divideScalar(sum) : pull;
  }
}
/** the hand sets off this long (s) before its finger touches down, plus half the finger's own approach */
const HAND_LEAD = 0.12;
/** a finger released after `up` s: rising off the key to its hover */
const liftAfter = (up: number) => -TRAVEL + (TRAVEL + HOVER) * smooth(up / 0.07);
/** a finger whose next press is within this many seconds hovers instead of settling home */
const GAP_SETTLE = 0.32;
/** how far an idle finger goes along with its hand when the hand moves for another finger (0: stays over its key) */
const RIDE = 0.5;
/** how long a finger takes to settle back on its home key, s */
const SETTLE = 0.24;
/** how much of a finger's reach the hand follows */
export const REACH: Record<Digit, number> = { thumb: 0.08, 'index-finger': 0.18, 'middle-finger': 0.2, 'ring-finger': 0.24, 'pinky-finger': 0.32 };
