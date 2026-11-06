// tempo.js — the hand keeps your tempo (issue #4). People write faster when they're excited and slower when they're
// careful, and it shows: a hurried hand slants more, joins more, spaces less evenly and gets messier. In Ink mode the
// typing is the writer's tempo: a burst faster than your own average makes the words that come out of it hastier, and
// slow, careful typing makes them tidier. Never extreme: the same writer, in a different mood.
//
//   const T = newTypist();                  // one per person typing (the app keeps one for the page)
//   typistKey(T, performance.now(), true);  // every key; typed: a letter or a space (Backspace etc. only keep time)
//   const haste = typistHaste(T);           // -2 … 2: how the last few keys compare with this typist's own average
//   hastes = hasteCarry(st, events, view.tail, hastes, next.tail, haste)  // Ink mode: each word at the tempo it
//                                           // was typed at, however far behind the pen is (below)
//   { t: 'write', text, haste }             // the ink log keeps it (inklog.js), so a replay gives the same page
//   layout(p, text, { haste })              // the words that start in this write are written that way
//
// Steps, not a dial: a few steps keep the log small and the page calm (a word is either the usual hand, a little
// hastier or tidier, or more so). A word takes the haste of the write its first letter came in, and keeps it when it's
// continued in a later piece (layout's open word carries its values), so a word never changes halfway. Absent or 0:
// exactly as before, byte for byte.
//
// What a step does (hastyHand, layout's word values): the hand's own Hurry nudged, so the slant, width, rhythm and care
// the Hurry control moves follow (hand.js care(), hurryDelta(); style-dims.js rhythm), a little more lean and a little
// less neatness on top, fewer pen lifts in a joined hand, a little less care in the word's own spread (layout's word
// lean, size, float and gaps), and a quicker pen when it's drawn. Slower than usual is the same, the other way.
// Research: docs/research/human-feel.md §1.3 (hurried writers join more), §4.2 (gaps less even when faster), §4.3.

import { clamp } from './core.js';

// ---------- the typist: your own average, and the tempo now ----------
// Times are kept as logs (a burst twice as fast counts as much as one twice as slow). The average starts from a typical
// typist's pace, about 240 ms between keys (Dhakal et al., "Observations on typing from 136 million keystrokes", CHI
// 2018), and becomes yours over the next hundred-odd keys, so the first lines are judged against an ordinary typist and
// everything after against you. The burst is about the last word's keys, so a steady typist's natural unevenness
// doesn't flicker the hand from word to word.
export const TYPIST_PRIOR_MS = 240;
const AVG_KEYS = 150;     // the average's memory, in keys (about 30 words)
const BURST = 0.15;       // the burst's weight on each new key (about the last six keys)
const PAUSE_MS = 1500;    // a longer gap is a pause to think, not tempo
const MIN_MS = 15;        // two events of one key (an input method)

export function newTypist(priorMs = TYPIST_PRIOR_MS) {
  const l = Math.log(priorMs);
  return { avg: l, burst: l, last: -Infinity, keys: 0 };
}
// A key at time `at` (ms). Only typed keys (a letter, a space) count towards the tempo; every key keeps the clock, so the
// gap after a Backspace is measured from the Backspace.
export function typistKey(T, at, typed = true) {
  const gap = at - T.last;
  T.last = at;
  if (!typed || !(gap >= MIN_MS && gap <= PAUSE_MS)) return T;
  const l = Math.log(gap);
  T.burst += BURST * (l - T.burst);
  T.avg += (l - T.avg) / AVG_KEYS;
  T.keys++;
  return T;
}
// The tempo now as a step: 0 within about a fifth of your usual pace, 1 up to about 1.5 times faster, 2 beyond (and the
// same, negative, for slower).
export function typistHaste(T) {
  const x = (T.avg - T.burst) / Math.LN2; // octaves faster than usual
  const a = Math.abs(x);
  const s = a < 0.25 ? 0 : a < 0.6 ? 1 : HASTE_MAX;
  return x < 0 ? -s : s;
}

// ---------- what a step does to the hand ----------
export const HASTE_MAX = 2;
/** A step as it's kept in the log: a whole number, -2 … 2 (anything else is clamped; not a number: 0). */
export const hasteStep = (v) => (Number.isFinite(v) ? clamp(Math.round(v), -HASTE_MAX, HASTE_MAX) : 0);
const HURRY = 0.1;   // the hand's Hurry, per step (±0.2 at most: the slider runs 0 … 1)
const SLANT = 0.6;   // more lean, degrees per step (with Hurry's own, about ±3° at most)
const NEAT = 0.05;   // less neatness, per step (the slider runs 0 … 1)
const LIFTS = 0.15;  // fewer pen lifts in a joined hand, per step (a share of the writer's own)
const CARE = 0.07;   // less care in the word's own spread, per step (layout spreadOf: lean, size, float, gaps)
const TEMPO = 0.1;   // the drawn pen, per step
export const hasteCare = (s) => CARE * hasteStep(s);
export const hasteTempo = (s) => 1 + TEMPO * hasteStep(s);

// The same writer in a hurry (or taking care): the hand with its Hurry nudged, against its own pace (hurry0), so care(),
// the hurry slant and width, and the rhythm follow; a little more lean, a little less neatness. Cached per hand and
// step, so its letters are cached too.
const HASTY = new WeakMap();
export function hastyHand(p, step) {
  const s = hasteStep(step);
  if (!s || !p) return p;
  let m = HASTY.get(p);
  if (!m) { m = new Map(); HASTY.set(p, m); }
  let h = m.get(s);
  if (!h) {
    const hurry = Number.isFinite(p.hurry) ? p.hurry : 0.4;
    const o = { hurry: clamp(hurry + HURRY * s, 0, 1), hurry0: Number.isFinite(p.hurry0) ? p.hurry0 : hurry };
    if (Number.isFinite(p.slant)) o.slant = p.slant + SLANT * s;
    if (Number.isFinite(p.neatness)) o.neatness = clamp(p.neatness - NEAT * s, 0, 1);
    if (Number.isFinite(p.lifts)) o.lifts = clamp(p.lifts * (1 - LIFTS * s), 0, 1);
    h = Object.assign(Object.create(p), o);
    m.set(s, h);
  }
  return h;
}

// ---------- Ink mode: each word at the tempo it was typed at ----------
// The pen trails the typing, sometimes by several words, so a write can't simply take the tempo of the moment it's
// written. Each unwritten letter remembers the tempo it was typed at (hastes: one per UTF-16 unit of view.tail), and a
// write takes the tempo of its first new word as it was typed (at that word's last letter so far, so a word typed in a
// burst counts the burst). The app keeps the list beside the view; these keep it in step.

// the first word that starts in `text` (after a word the pen is still in: open): its first and last letter
function newWord(text, open) {
  for (let i = 0; i < text.length; i++) {
    const space = /\s/.test(text[i]);
    if (!space && !open) {
      let j = i;
      while (j + 1 < text.length && /\S/.test(text[j + 1])) j++;
      return { first: i, last: j };
    }
    open = !space;
  }
  return null;
}
// the pen is inside a word (layout's open word): text that doesn't start with a space continues it
const inWord = (st) => !!(st && st.page && st.page.pen && st.page.pen.open);

// The view's tail goes from tail0 (hastes0) to tail1 with `events` (not applied yet): each write gets `haste` (when it
// isn't 0), and the hastes of tail1 come back. What the pen took from the front of the tail keeps the tempo it was
// typed at; a write that isn't the tail's own letters (a word written again after a fix) takes the tempo of the letters
// the pen took, or `now`; letters new to the tail get `now`.
export function hasteCarry(st, events, tail0, hastes0, tail1, now = 0) {
  const t0 = String(tail0 || ''), t1 = String(tail1 || '');
  now = hasteStep(now);
  const h0 = hastes0 && hastes0.length === t0.length ? hastes0 : new Array(t0.length).fill(now);
  const took = t1.length <= t0.length && t0.endsWith(t1) ? t0.length - t1.length : 0;
  let k = 0, open = inWord(st);
  for (const e of events || []) {
    if (!e) continue;
    if (e.t === 'write') {
      const text = String(e.text || '');
      const at = text && k < took ? t0.indexOf(text, k) : -1;
      const mine = at >= 0 && at + text.length <= took;
      if (mine) k = at;
      const w = newWord(text, open);
      const h = hasteStep(!w ? 0 : mine ? h0[k + w.last] : k < took ? h0[k] : now);
      if (h) e.haste = h;
      if (mine) k += text.length;
      if (text) open = /\S$/.test(text);
    } else if (e.t === 'break') {
      open = false;
      if (k < took && t0[k] === '\n') k++;
    } else if (e.t === 'move' || e.t === 'sheet') open = false;
  }
  if (took) return h0.slice(took);
  // an edit of the tail: what's kept keeps its own, what's new gets `now`
  const n = Math.min(t0.length, t1.length);
  let a = 0, b = 0;
  while (a < n && t0.charCodeAt(a) === t1.charCodeAt(a)) a++;
  while (b < n - a && t0.charCodeAt(t0.length - 1 - b) === t1.charCodeAt(t1.length - 1 - b)) b++;
  return [...h0.slice(0, a), ...new Array(t1.length - a - b).fill(now), ...h0.slice(t0.length - b)];
}
// The tempo the next word to be written was typed at (for its thought letters: draftPage opts.haste).
export function hasteNext(st, tail, hastes) {
  const t = String(tail || '');
  const w = newWord(t, inWord(st));
  return w && hastes && hastes.length === t.length ? hasteStep(hastes[w.last]) : 0;
}
