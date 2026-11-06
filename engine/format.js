// format.js — formatting by hand, the way this writer does it (ideas-toolbar.md §3, §9). A font has bold, italic, a
// title style and bullets; a hand has pressing harder, leaning in, the way this person sets out a title, their own
// bullet and their own tick. Nothing here is drawn: layout.js and sheet.js ask it what to do.
//
//   Style for what's typed next (a field on each write in the ink log; absent = the writer's usual hand):
//     lean    1, 2: the words lean further forward (about 10° a step), a little narrower and quicker (italic)
//     weight  1, 2: pressed harder: a wider line and more ink, a touch bigger (bold)
//     size    a factor on the letters' size, 0.6 … 2 (in 0.05 steps)
//   Layout honours them per word: a word takes the style of the write its first letter came in, and keeps it when
//   it's continued in a later piece (as it keeps its tempo, tempo.js), so a word never changes halfway.
//
//   Line formats (a `line` event in the ink log, sheet.js): 'title', 'heading', 'body', and lists, 'bullet',
//   'number', 'check'. A title is written the writer's own way (formatHabits): larger and more careful, and one of
//   underlined once, underlined twice (drawn when the line ends), printed in capitals, or centred; a heading is a
//   smaller version. A list item starts with the writer's own bullet, number or box; its lines hang under the first word.
//
// Habits are fixed per seed in their own namespace ('format:'), so no other habit of the writer moves.

import { rng, clamp } from './core.js';

// ---------- style steps (what the log keeps) ----------
export const LEAN_MAX = 2, WEIGHT_MAX = 2;
const step = (v, max) => (Number.isFinite(v) ? clamp(Math.round(v), 0, max) : 0);
export const leanStep = (v) => step(v, LEAN_MAX);
export const weightStep = (v) => step(v, WEIGHT_MAX);
/** a size factor as the log keeps it: 0.6 … 2 in 0.05 steps; 1 (or anything not a number) is the usual size */
export const sizeStep = (v) => (Number.isFinite(v) && v > 0 ? Math.round(clamp(v, 0.6, 2) * 20) / 20 : 1);
/** A write's style, normalised; null when it's the writer's usual hand (so old logs take exactly the old path). */
export function styleOf(s) {
  if (!s) return null;
  const lean = leanStep(s.lean), weight = weightStep(s.weight), size = sizeStep(s.size);
  return lean || weight || size !== 1 ? { lean, weight, size } : null;
}

// ---------- what a step does to the hand ----------
const LEAN_DEG = 10;      // degrees of extra slant per step (italic type came from a hand leaning further)
const LEAN_NARROW = 0.93; // a little narrower per step
export const LEAN_TEMPO = 1.08; // ...and a little quicker (the drawn pen)
const PRESS_W = 0.22;     // pen width, per step
const PRESS_P = 0.14;     // pressure (stroke contrast), per step
export const PRESS_INK = (s) => 1 + 0.32 * weightStep(s);  // ink carried (the renderers' item.weight)
export const PRESS_SIZE = (s) => 1 + 0.025 * weightStep(s); // pressing harder, the letters come out a touch bigger

const derived = (cache, p, s, make) => {
  let m = cache.get(p);
  if (!m) { m = new Map(); cache.set(p, m); }
  let h = m.get(s);
  if (!h) { h = Object.assign(Object.create(p), make()); m.set(s, h); }
  return h;
};
const LEANS = new WeakMap(), PRESSES = new WeakMap();
/** The same writer leaning in: more slant, a little narrower. Cached per hand and step, so its letters are cached too. */
export function leanHand(p, s) {
  s = leanStep(s);
  if (!s || !p) return p;
  return derived(LEANS, p, s, () => {
    const k = Math.pow(LEAN_NARROW, s), o = { slant: (Number.isFinite(p.slant) ? p.slant : 0) + LEAN_DEG * s };
    if (Number.isFinite(p.width)) o.width = p.width * k;
    if (Number.isFinite(p.capWidth)) o.capWidth = p.capWidth * k;
    return o;
  });
}
/** The same writer pressing harder: a wider line, more contrast. */
export function pressHand(p, s) {
  s = weightStep(s);
  if (!s || !p) return p;
  // (a physical tip doesn't follow penWidth: pressWidth widens whatever line the pen draws, pen.js penWidthUnits)
  return derived(PRESSES, p, s, () => ({
    penWidth: (p.penWidth || 50) * (1 + PRESS_W * s),
    pressWidth: (p.pressWidth || 1) * (1 + PRESS_W * s),
    pressure: clamp((Number.isFinite(p.pressure) ? p.pressure : 0.4) + PRESS_P * s, 0, 1),
  }));
}

// ---------- line formats ----------
export const LINE_FORMATS = ['title', 'heading', 'body', 'bullet', 'number', 'check'];
export const isList = (as) => as === 'bullet' || as === 'number' || as === 'check';
export const lineFormat = (as) => (LINE_FORMATS.includes(as) ? as : 'body');

// one of several habits, by weight: [[weight, value], ...]
function pick(r, opts) {
  let u = r();
  for (const [w, v] of opts) { if (u < w) return typeof v === 'function' ? v() : v; u -= w; }
  const last = opts[opts.length - 1][1];
  return typeof last === 'function' ? last() : last;
}

const habitCache = new WeakMap();
// How this writer formats (fixed per seed, 'format:' namespace). Every draw is made up front in a fixed order, so a
// habit added later goes at the end and none before it moves.
export function formatHabits(p) {
  let F = habitCache.get(p);
  if (F) return F;
  const r = rng('format:' + p.seed);
  const neat = clamp(p.neatness == null ? 0.6 : p.neatness, 0, 1);
  // a title: how it's set apart (each writer's own), how much bigger, how much more careful
  const how = pick(r, [[0.3, 'under1'], [0.17, 'under2'], [0.23, 'caps'], [0.3, 'centre']]);
  const tSize = r.range(1.32, 1.62);
  const hSize = 1 + (tSize - 1) * r.range(0.42, 0.6);
  const care = r.range(0.1, 0.22);
  const title = {
    how, size: tSize, care,
    before: r.range(0.35, 0.8),       // space above a title that follows writing (pitches)
    after: r.range(0.15, 0.45),       // and below it, before the next line (pitches, past what its size needs)
    off: r.range(-0.6, 0.25),         // centred by eye: x-heights off the true centre (a little left, mostly)
  };
  // a heading: the same habit, smaller (a double underline steps down to one)
  const heading = Object.assign({}, title, { how: how === 'under2' ? 'under1' : how, size: hSize, care: care * 0.7, before: title.before * r.range(0.6, 0.9), after: title.after * 0.6 });
  // lists: the bullet, how numbers are written, the box, how it's ticked
  const bullet = pick(r, [[0.34, 'dot'], [0.3, 'dash'], [0.18, 'circle'], [0.18, 'arrow']]);
  const number = pick(r, [[0.7, '.'], [0.3, ')']]);
  const box = pick(r, [[0.5, 'square'], [0.28, 'round'], [0.22, 'dash']]);
  const tick = pick(r, [[0.45, 'tick'], [0.2, 'cross'], [0.15, 'fill'], [0.2, 'strike']]);
  const list = {
    bullet, number, box, tick,
    at: r.range(0.1, 0.9),            // where the bullet sits, x-heights in from the margin
    gap: r.range(0.55, 1.1),          // from the bullet (or number, or box) to the first word (x-heights)
    boxSize: r.range(1.0, 1.3),       // the box, in x-heights (about as tall as a capital)
    sloppy: clamp(1.15 - neat, 0.15, 1), // how loosely boxes and bullets are drawn
  };
  F = { title, heading, list };
  habitCache.set(p, F);
  return F;
}

// ---------- highlighter ----------
// Fluorescent inks: a felt chisel, laid under the writing. Colours as they look on white paper.
export const HIGHLIGHTS = { yellow: '#ffe83a', pink: '#ff7cc0', green: '#8ef06a', blue: '#6fd0ff' };
export const highlightColor = (c) => (HIGHLIGHTS[c] ? c : 'yellow');
