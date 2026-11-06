// animate.js — write the page stroke by stroke, the way a person would (human-feel.md rule 22, §1).
//
// timeline(page) turns a laid-out page into timed pen strokes, timing each one with kinematics():
//   - a stroke takes its own time: fast on straights, slow at turns, ~100 ms per sub-stroke
//   - pen-up gaps of 50–150 ms between strokes; joined script letters flow on with barely a gap
//   - word pauses of 150–400 ms, longer after punctuation, at a line return and a new paragraph
//   - i-dots and t-bars come after the word, when that is this writer's habit (strokes[i].delayed)
//   - a tired writer speeds up (item.tempo, set by layout)
// The timeline is plain data, independent of any renderer:
//   createPlayer(tl, draw) is a clock (play, pause, replay, skip, seek, speed) that calls draw(t).
//   playSVG(svg, page) reveals each stroke along its centerline with an SVG mask.
//   A canvas player draws events[0..done) whole and the active one up to its arclength fraction:
//     const { done, active, frac } = frameAt(tl, t)
//
// Determinism: pauses come from rng('anim:' + seed + word identity); same page, same timeline, and
// editing one word doesn't change the rhythm elsewhere.

import { rng, clamp } from './core.js';
import { kinematics } from './kinematics.js';

const STOP = /[.!?]["'’”)]*$/, PAUSE = /[,;:]["'’”)]*$/;

// page: result of layout(). opts: { lead (s before the first stroke, default 0.3) }
// Returns { events, duration }:
//   events, sorted by t0, never overlapping (one pen):
//     { k, item, stroke, t0, dur, word, line, delayed, tn, sn }
//     k      = page-wide stroke index (items in order, then g.strokes in order) = data-k in renderSVG
//     item   = index into page.items; stroke = index into that item's g.strokes
//     tn, sn = matching tables of normalised time and normalised arclength along the stroke (0..1)
export function timeline(page, opts = {}) {
  let r = rng('anim:' + (page.seed || ''));
  const logn = (median, sigma, lo, hi) => clamp(median * Math.exp(sigma * clamp(r.gauss(), -2.5, 2.5)), lo, hi);
  const xh = page.xh || 400;
  const items = page.items;
  const events = [];
  const kOf = [];
  let k = 0;
  // letters and correction marks are written; placeholders aren't
  const inks = (it) => it.kind === 'glyph' || it.kind === 'mark';
  for (const it of items) { kOf.push(k); if (inks(it)) k += it.g.strokes.length; }

  const event = (it, j, si) => {
    const st = it.g.strokes[si];
    const kin = kinematics(st.center, { xh });
    const n = st.center.length;
    const tn = new Float32Array(n), sn = new Float32Array(n);
    const T = kin.duration || 1, L = n > 1 ? kin.s[n - 1] || 1 : 1;
    for (let i = 0; i < n; i++) { tn[i] = kin.t[i] / T; sn[i] = n > 1 ? kin.s[i] / L : 1; }
    const dur = Math.max(st.dot ? 0.05 : 0.04, kin.duration) / (it.tempo || 1);
    return { k: kOf[j] + si, item: j, stroke: si, t0: 0, dur, word: it.word, line: it.line, delayed: !!st.delayed, tn, sn };
  };

  let t = opts.lead == null ? 0.3 : opts.lead;
  let prev = null; // last item of the previous word
  for (let a = 0; a < items.length;) {
    let b = a;
    while (b < items.length && items[b].word === items[a].word) b++;
    const first = items[a];
    const tempo = first.tempo || 1;
    r = rng('anim:' + (page.seed || '') + ':' + (first.wkey || first.word) + ':' + first.charIndex);
    if (prev) {
      let pause = logn(0.24, 0.3, 0.15, 0.4);
      if (STOP.test(prev.ch)) pause += 0.2 + 0.2 * r();
      else if (PAUSE.test(prev.ch)) pause += 0.08 + 0.1 * r();
      if (first.para !== prev.para) pause += 0.5 + 0.4 * r();       // a new paragraph: a breath
      else if (first.line !== prev.line) pause += 0.25 + 0.2 * r(); // the hand sweeps back to the margin
      t += pause / tempo;
    }
    const later = [];
    let drawn = false;
    for (let j = a; j < b; j++) {
      const it = items[j];
      if (!inks(it)) { t += 0.2; continue; } // a placeholder: the writer hesitates
      for (let si = 0; si < it.g.strokes.length; si++) {
        const ev = event(it, j, si);
        if (ev.delayed) { later.push(ev); continue; }
        if (drawn) {
          const join = page.connected && si === 0 && !it.g.strokes[0].dot;
          t += (join ? 0.01 + 0.02 * r() : logn(0.085, 0.3, 0.05, 0.15)) / tempo;
        }
        ev.t0 = t; t += ev.dur; events.push(ev);
        drawn = true;
      }
    }
    // dots and bars, after the word: the pen travels back, then adds each one
    later.forEach((ev, n) => {
      t += (n ? logn(0.08, 0.3, 0.05, 0.15) : logn(0.14, 0.25, 0.09, 0.24)) / tempo;
      ev.t0 = t; t += ev.dur; events.push(ev);
    });
    prev = items[b - 1];
    a = b;
  }
  return { events, duration: t + 0.1 };
}

// arclength fraction (0..1) of a stroke at local time fraction u (0..1), from its kinematic tables
export function strokeFraction(ev, u) {
  const { tn, sn } = ev;
  if (u <= 0) return 0;
  if (u >= 1 || tn.length < 2) return 1;
  let lo = 0, hi = tn.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tn[m] <= u) lo = m; else hi = m; }
  const span = tn[hi] - tn[lo];
  return sn[lo] + (span > 0 ? (u - tn[lo]) / span : 1) * (sn[hi] - sn[lo]);
}

// What is on the page at time t: events[0..done) are complete; `active` (or null) is being drawn,
// `frac` of the way along its centerline.
export function frameAt(tl, t) {
  const ev = tl.events;
  let lo = 0, hi = ev.length; // first event with t0 > t
  while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t0 <= t) lo = m + 1; else hi = m; }
  const i = lo - 1;
  if (i < 0) return { done: 0, active: null, frac: 0 };
  const e = ev[i];
  if (t >= e.t0 + e.dur) return { done: i + 1, active: null, frac: 0 };
  return { done: i, active: e, frac: strokeFraction(e, (t - e.t0) / e.dur) };
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// A renderer-agnostic clock. draw(t) is called with the time in seconds whenever it changes.
// opts: { rate (default 1), onEnd(), reducedMotion (default: the OS setting), raf, caf, now }
// With reduced motion, play() goes straight to the finished page.
// Starts at the end (everything drawn); play() from the end starts over.
export function createPlayer(tl, draw, opts = {}) {
  const raf = opts.raf || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(() => f(now()), 16));
  const caf = opts.caf || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout);
  const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const reduce = opts.reducedMotion == null ? prefersReducedMotion() : !!opts.reducedMotion;
  let rate = opts.rate > 0 ? opts.rate : 1;
  let t = tl.duration, playing = false, last = 0, id = 0;
  const end = () => { playing = false; if (opts.onEnd) opts.onEnd(); };
  function tick(ts) {
    if (!playing) return;
    const stamp = typeof ts === 'number' ? ts : now();
    t += clamp((stamp - last) / 1000, 0, 0.25) * rate; // a hidden tab doesn't jump ahead
    last = stamp;
    if (t >= tl.duration) { t = tl.duration; draw(t); end(); return; }
    draw(t);
    id = raf(tick);
  }
  const api = {
    play() {
      if (reduce) return api.skip();
      if (playing) return api;
      if (t >= tl.duration) t = 0;
      playing = true; last = now(); draw(t); id = raf(tick);
      return api;
    },
    pause() { if (playing) { playing = false; caf(id); } return api; },
    toggle() { return playing ? api.pause() : api.play(); },
    replay() { api.pause(); t = 0; draw(t); return api.play(); },
    skip() { const was = playing || t < tl.duration; api.pause(); t = tl.duration; draw(t); if (was || reduce) end(); return api; },
    seek(x) { t = clamp(x, 0, tl.duration); draw(t); return api; },
    setRate(x) { rate = x > 0 ? x : 1; return api; },
    get rate() { return rate; },
    get time() { return t; },
    get duration() { return tl.duration; },
    get playing() { return playing; },
    reducedMotion: reduce,
    timeline: tl,
    destroy() { api.pause(); },
  };
  return api;
}

// ---------- SVG: reveal each stroke along its centerline ----------
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

// widest distance from the pen path to its outline (font units), so the reveal mask covers the ink
function halfWidth(st) {
  const c = st.center, poly = st.contour || [];
  const sp = Math.max(1, Math.floor(poly.length / 48)), sc = Math.max(1, Math.floor(c.length / 48));
  let m = 0;
  for (let i = 0; i < poly.length; i += sp) {
    let best = Infinity;
    for (let j = 0; j < c.length; j += sc) {
      const dx = poly[i][0] - c[j][0], dy = poly[i][1] - c[j][1], d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    if (best > m) m = best;
  }
  return Math.sqrt(m);
}

// svg: the element from renderSVG(p, page, { ..., strokeIds: true }); page: the same layout result.
// opts: { emPx (the renderSVG emPx, default 58), timeline (else built from page), ...createPlayer opts }
// Returns a player (see createPlayer) with the page fully drawn; call .play() to write it.
export function playSVG(svg, page, opts = {}) {
  const tl = opts.timeline || timeline(page, opts);
  const sc = (opts.emPx || 58) / 1000; // font units (UPM 1000) -> px
  const doc = svg.ownerDocument;
  const els = [];
  svg.querySelectorAll('[data-k]').forEach((el) => { els[+el.getAttribute('data-k')] = el; });
  const id = 'sh-write-' + (++uid);
  const defs = svg.querySelector('defs') || svg.insertBefore(doc.createElementNS(NS, 'defs'), svg.firstChild);
  const style = doc.createElementNS(NS, 'style');
  style.textContent = `.${id} [data-k]:not(.sh-on){visibility:hidden}`;
  const mask = doc.createElementNS(NS, 'mask');
  mask.setAttribute('id', id);
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  for (const [k, v] of [['x', -1e4], ['y', -1e4], ['width', 4e4], ['height', 4e4]]) mask.setAttribute(k, v);
  const pen = doc.createElementNS(NS, 'path');
  for (const [k, v] of [['fill', 'none'], ['stroke', '#fff'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['pathLength', '1'], ['stroke-dasharray', '1 2']]) pen.setAttribute(k, v);
  mask.appendChild(pen);
  defs.appendChild(style);
  defs.appendChild(mask);
  svg.classList.add(id);

  const ev = tl.events;
  let shown = 0, activeIdx = -1;
  const show = (i, on) => { const el = els[ev[i].k]; if (el) { el.removeAttribute('mask'); el.classList.toggle('sh-on', on); } };
  function draw(t) {
    const f = frameAt(tl, t);
    const ai = f.active ? f.done : -1;
    if (activeIdx >= 0 && activeIdx !== ai) { show(activeIdx, activeIdx < f.done); activeIdx = -1; }
    while (shown < f.done) show(shown++, true);
    while (shown > f.done) show(--shown, false);
    if (ai < 0) return;
    if (activeIdx !== ai) {
      const e = ev[ai], it = page.items[e.item], st = it.g.strokes[e.stroke];
      let d = '';
      for (const q of st.center) d += (d ? 'L' : 'M') + ((it.x + q[0]) * sc).toFixed(1) + ' ' + ((it.y - q[1]) * sc).toFixed(1);
      if (st.center.length === 1) d += 'h0.01';
      pen.setAttribute('d', d);
      pen.setAttribute('stroke-width', ((2 * halfWidth(st) + 8) * sc + 2).toFixed(2));
      const el = els[e.k];
      if (el) { el.setAttribute('mask', `url(#${id})`); el.classList.add('sh-on'); }
      activeIdx = ai;
    }
    pen.setAttribute('stroke-dashoffset', (1 - f.frac).toFixed(4));
  }
  const player = createPlayer(tl, draw, opts);
  draw(tl.duration);
  const destroy = player.destroy;
  player.destroy = () => {
    destroy();
    draw(tl.duration);
    svg.classList.remove(id);
    style.remove();
    mask.remove();
  };
  return player;
}

// ---------- the pen catching up: ink the newest letters behind the typing ----------
// While someone types, letters appear first as a faint "thought" in their final places, and the
// writer's pen inks over them a few letters behind, at handwriting speed (writing-experience §3.2,
// editor-ux §3.4). Renderer-agnostic and clock-free: the caller passes `now` (seconds).
//
//   const pen = createPen({ hold: 2 });           // Ink mode: hold back the last 2 typed letters
//   pen.sync(page, now);                          // after every layout (keys must be stable: Ink mode)
//   const s = pen.at(now);
//   s.ink(item.key, strokeIndex)  -> 0..1   how much of that stroke is inked (renderCanvas `reveal`)
//   s.thought(item.key)           -> 0..1   how strongly to show the faint thought letter (60 ms fade-in)
//   s.writing                     -> { key, stroke, frac } | null, the pen tip
//   s.busy                        -> strokes still to ink
//   s.letters                     -> letters (and marks) still to ink, the one on the pen included
//   s.copying                     -> a copy-out is on (see pacing)
//   pen.finish(now)                         ink everything now; finish(now, true): and count it all as ink that
//                                           was already on the paper (dry: a sheet drawn as it is, not written)
//   pen.liftedAt(key)             -> when (the caller's clock) the pen lifted off that item: its last stroke inked,
//                                    so its ink starts to dry. -Infinity: already dry; undefined: not all inked yet
//
// opts: { hold (letters held back, or 'word' to hold an unfinished last word: right for fair copy,
//   where the word being typed changes as it grows), holdMs (after this pause the held letters are
//   written anyway, default 0.7 s), speed (× handwriting speed, default 1.5), fast (top speed when far
//   behind, default 4), behind (letters behind before speeding up, default 12), fadeIn (seconds a new thought
//   letter takes to show, default 0.06; 0 when the letters already showed as thoughts elsewhere, so they never
//   blink out), reducedMotion,
//   lag (seconds: pace by time instead, below), drain (0.8), max (6), copy (6), copyFrom (60), wordAbove (12),
//   forget (a key that leaves the page is forgotten: written again if it comes back, as after an undo) }
// pen.trail = n: letters typed but not yet handed to the pen (Ink mode's thought letters); they count as waiting,
// so the pen speeds up with the whole backlog.
//
// Pacing by letters (the default): `speed`, rising to `fast` once more than `behind` letters wait.
// Pacing by time (opts.lag, Ink mode): the backlog B is in seconds of writing (each waiting stroke's own duration,
// the pen-up gaps, and the trail at the time a letter of this hand takes):
//   - while you type: `speed` until B would take more than `lag` s at it, then fast enough to stay `lag` s behind,
//     up to `max`; eased over 250 ms, so the pen never lurches
//   - once nothing typed waits to be handed over (trail 0: you've stopped, and the last word's grace is over): fast
//     enough to be done within `drain` s, never slower than it was
//   - copying out (more than `copyFrom` letters arrive at once: a paste, a P.S., a fair copy): done within `copy` s
//     (or at `speed`, if that's sooner), pen-up gaps shrinking with it. Above `wordAbove` × it shows a word at a
//     time, whole: a stroke at a time at that speed reads as a glitch
// Items keep their place in the queue by item.key. A key that disappears (deleted before it was
// inked) is dropped cleanly; one that appears is queued after everything already waiting.
// Dots, bars and accents (delayed strokes) are added once the rest of their word is written.
const GAP = 0.07, WORD_GAP = 0.18; // pen-up between strokes, and between words (seconds at 1×)
export function createPen(opts = {}) {
  const hold = opts.hold == null ? 2 : opts.hold;
  const holdMs = opts.holdMs == null ? 0.7 : opts.holdMs;
  const base = opts.speed || 1.5, top = opts.fast || 4, behind = opts.behind == null ? 12 : opts.behind;
  const lag = opts.lag > 0 ? opts.lag : 0;
  const drain = opts.drain > 0 ? opts.drain : 0.8, most = opts.max > 0 ? opts.max : 6;
  const copyFor = opts.copy > 0 ? opts.copy : 6, copyFrom = opts.copyFrom == null ? 60 : opts.copyFrom;
  const wordAbove = opts.wordAbove > 0 ? opts.wordAbove : 12;
  const forget = !!opts.forget;
  const reduce = opts.reducedMotion == null ? prefersReducedMotion() : !!opts.reducedMotion;
  const fadeIn = opts.fadeIn == null ? 0.06 : opts.fadeIn;
  const self = {};
  let trail = 0;
  const inked = new Map();   // key -> number of strokes fully inked (Infinity = whole letter)
  const lifted = new Map();  // key -> when its last stroke was inked
  let queue = [];            // { key, si, dur, word, delayed, tn, sn }
  const seenAt = new Map();  // key -> time first seen (thought fade-in)
  const kin = new WeakMap();
  let cur = null;            // on the pen: { s (its first stroke), list (strokes drawn as one: a word, in a copy-out), dur, done }
  let clock = null, gapLeft = 0, typedAt = -Infinity, closed = new Set();
  let heldKeys = new Set();
  let seenLen = 0, seenFirst = null; // the last page synced: how many items, and its first
  let speed = base, copyUntil = null, drainUntil = null, letterSec = 0.45; // (seconds a letter of this hand takes at 1×, learned as it goes)

  const timing = (center, xh) => {
    let k = kin.get(center);
    if (!k) {
      const K = kinematics(center, { xh });
      const n = center.length, T = K.duration || 1, L = n > 1 ? K.s[n - 1] || 1 : 1;
      const tn = new Float32Array(n), sn = new Float32Array(n);
      for (let i = 0; i < n; i++) { tn[i] = K.t[i] / T; sn[i] = n > 1 ? K.s[i] / L : 1; }
      k = { dur: K.duration, tn, sn };
      kin.set(center, k);
    }
    return k;
  };

  // seconds of writing still to do, at 1×
  function backlog() {
    let s = 0, w = null;
    for (const q of queue) { s += q.dur + GAP; if (q.word !== w) { s += WORD_GAP - GAP; w = q.word; } }
    if (cur) s += cur.dur - cur.done;
    return s + trail * letterSec;
  }
  // a long run of letters arrived at once: copied out within `copyFor` s
  function copying(now) {
    if (!lag) return;
    const until = now + Math.min(copyFor, backlog() / base);
    copyUntil = copyUntil == null ? until : Math.max(copyUntil, until);
  }
  // the pace by time (opts.lag), `dt` seconds on from the last. A copy-out and the finish after you stop each keep a
  // fixed end time (a pace recomputed from what's left would only ever halve it)
  function pace(now, dt) {
    const B = backlog();
    if (B <= 1e-6) copyUntil = drainUntil = null;
    if (copyUntil != null) {
      // (what's typed during it, or a little over: done within a moment of the end)
      if (now > copyUntil - 0.05) copyUntil = now + 0.35;
      return Math.max(base, speed, B / (copyUntil - now));
    }
    if (trail) drainUntil = null;
    else if (drainUntil == null && B > 0) drainUntil = now + drain;
    if (drainUntil != null) {
      if (now > drainUntil - 0.05) drainUntil = now + 0.2;
      return clamp(Math.max(speed, B / (drainUntil - now)), base, most);
    }
    const target = clamp(B / lag, base, most);
    return clamp(speed + (target - speed) * (1 - Math.exp(-dt / 0.25)), base, most);
  }

  Object.defineProperty(self, 'trail', {
    enumerable: true,
    get: () => trail,
    set(v) { const n = Math.max(0, +v || 0); trail = n; if (n - trail0 > copyFrom && clock != null) copying(clock); trail0 = n; },
  });
  let trail0 = 0;

  function sync(pg, now) {
    // first catch the pen up to this moment with what was on the page until now, so its progress
    // depends only on time, never on how often someone asked for a frame
    if (clock == null) clock = now; // the pen's clock starts when the first letters arrive
    else advance(now, reduce);
    const xh = pg.xh || 400;
    const present = new Set();
    // letters and correction marks (kind 'mark'), in page order: marks are written where they appear
    const glyphs = pg.items.filter((it) => it.kind === 'glyph' || it.kind === 'mark');
    // the end of the text is still being typed: which letters to hold back
    const open = !/[\s]$/.test(pg.text || '') && glyphs.length;
    heldKeys = new Set();
    if (open && hold) {
      if (hold === 'word') { const w = glyphs[glyphs.length - 1].wkey; for (const it of glyphs) if (it.wkey === w) heldKeys.add(it.key); }
      else for (const it of glyphs.slice(-hold)) heldKeys.add(it.key);
    }
    closed = new Set();
    let wPrev = null;
    for (const it of glyphs) { if (wPrev && wPrev !== it.wkey) closed.add(wPrev); wPrev = it.wkey; }
    if (!open && wPrev) closed.add(wPrev);
    // a letter not yet inked may still change shape as the next one is typed (some hands shape a letter
    // by the one after it): its waiting strokes are queued again from its new shape
    // (compared by stroke count: marks are rebuilt on every page, letters come from a cache)
    const shape = new Map();
    for (const it of glyphs) shape.set(it.key, (it.glyph || it.g).strokes.length);
    queue = queue.filter((q) => !shape.has(q.key) || q.n === shape.get(q.key) || (inked.get(q.key) || 0) > 0);
    // strokes already waiting, or on the pen right now, are not queued again
    const queued = new Set(queue.map((q) => q.key + '#' + q.si));
    if (cur) for (const q of cur.list) queued.add(q.key + '#' + q.si);
    let arrived = 0;
    for (const it of glyphs) {
      present.add(it.key);
      if (!seenAt.has(it.key)) seenAt.set(it.key, now);
      if (inked.get(it.key) === Infinity) continue;
      const g = it.glyph || it.g;
      let took = 0, whole = 0;
      g.strokes.forEach((st, si) => {
        if ((inked.get(it.key) || 0) > si || queued.has(it.key + '#' + si)) return;
        const t = timing(st.center, xh);
        const dur = Math.max(st.dot ? 0.05 : 0.04, t.dur) / (it.tempo || 1);
        queue.push({ key: it.key, si, n: g.strokes.length, word: it.wkey, delayed: it.kind !== 'mark' && !!st.delayed, dur, tn: t.tn, sn: t.sn });
        took++; whole += dur + GAP;
      });
      if (took && took === g.strokes.length) {
        arrived++;
        if (it.kind === 'glyph') letterSec += 0.1 * (whole + 0.02 - letterSec); // (the word gaps, spread over its letters)
      }
    }
    // letters deleted before the pen reached them simply go (they were only a thought)
    queue = queue.filter((q) => present.has(q.key));
    if (cur && !cur.list.every((q) => present.has(q.key))) { for (const q of cur.list) if (present.has(q.key)) queue.unshift(q); cur = null; }
    // (only a page that lost letters can have keys gone: one that only grew keeps its first ones, the same objects)
    const grew = pg.items.length >= seenLen && pg.items[0] === seenFirst;
    seenLen = pg.items.length; seenFirst = pg.items[0];
    if (!grew) {
      for (const k of [...seenAt.keys()]) if (!present.has(k)) seenAt.delete(k);
      // gone from the page (an undo): if the same key comes back, it's new writing
      if (forget) for (const k of [...inked.keys()]) if (!present.has(k)) { inked.delete(k); lifted.delete(k); }
    }
    typedAt = now;
    if (arrived > copyFrom) copying(now);
    if (reduce) advance(now, true);
  }

  // the next stroke the pen may write, or null
  function next(now, force) {
    const idle = force || now - typedAt >= holdMs;
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
      if (heldKeys.has(q.key) && !idle) return null; // everything after a held letter waits too
      if (q.delayed) {
        // dots, bars and accents: after the rest of the word, once the word is finished (or typing paused)
        if (queue.some((o) => o.word === q.word && !o.delayed)) continue;
        if (!closed.has(q.word) && !idle) continue;
      }
      return i;
    }
    return null;
  }
  // take queue[i] onto the pen; fast enough, the rest of its word with it (shown whole when done)
  function take(i, now, force) {
    const s = queue.splice(i, 1)[0];
    const list = [s];
    if (lag && speed > wordAbove) {
      const idle = force || now - typedAt >= holdMs;
      for (let j = 0; j < queue.length;) {
        const q = queue[j];
        if (q.word === s.word && !heldKeys.has(q.key) && (!q.delayed || closed.has(q.word) || idle)) { list.push(q); queue.splice(j, 1); } else j++;
      }
    }
    let dur = 0;
    for (const q of list) dur += q.dur;
    return { s, list, dur: dur + GAP * (list.length - 1), done: 0, whole: list.length > 1 };
  }

  // move the pen forward from its clock to `now` (instantly: write everything it may write now;
  // force: also what it is holding back; dry: what's inked now was already on the paper)
  function advance(now, instant, force, dry) {
    if (clock == null) clock = now;
    let t = instant ? Infinity : Math.max(0, now - clock);
    let when = clock; // the moment within this step, for lift times
    if (lag && !instant) speed = pace(now, Math.min(t, 0.25));
    clock = now;
    let guard = 0;
    while (t > 0 && guard++ < 100000) {
      if (!cur) {
        if (gapLeft > 0) { const d = Math.min(gapLeft, t); gapLeft -= d; t -= d; when += d; continue; }
        const i = next(now, force);
        if (i == null) break;
        cur = take(i, now, force);
      }
      // speed: a little faster than a person, much faster when far behind
      let sp = speed;
      if (instant) sp = Infinity;
      else if (!lag) {
        const waiting = new Set(queue.map((q) => q.key)).size + (trail || 0);
        sp = base + (top - base) * clamp((waiting - behind) / behind, 0, 1);
      }
      const need = (cur.dur - cur.done) / sp;
      if (t >= need) {
        t -= need; when += need;
        const at = instant ? (dry ? -Infinity : now) : when;
        for (const q of cur.list) {
          inked.set(q.key, Math.max(inked.get(q.key) || 0, q.si + 1));
          if (!queue.some((o) => o.key === q.key)) { inked.set(q.key, Infinity); lifted.set(q.key, at); }
        }
        // pen up: a short lift between strokes, longer between words
        const ni = next(now, force), nextQ = ni == null ? null : queue[ni];
        gapLeft = instant ? 0 : (nextQ && nextQ.word !== cur.s.word ? WORD_GAP : GAP) / sp;
        cur = null;
      } else { cur.done += t * sp; t = 0; }
    }
  }

  function at(now) {
    advance(now, reduce);
    const c = cur;
    let letters = -1;
    return {
      ink: (key, si) => {
        const n = inked.get(key);
        if (n === Infinity || (n || 0) > si) return 1;
        if (c && !c.whole && c.s.key === key && c.s.si === si) return strokeFraction(c.s, c.done / c.s.dur);
        return 0;
      },
      thought: (key) => {
        if (inked.get(key) === Infinity) return 0;
        const t0 = seenAt.get(key);
        return t0 == null ? 0 : fadeIn > 0 ? clamp((now - t0) / fadeIn, 0, 1) : 1;
      },
      writing: c && !c.whole ? { key: c.s.key, stroke: c.s.si, frac: strokeFraction(c.s, c.done / c.s.dur) } : null,
      busy: queue.length + (c ? c.list.length : 0),
      get letters() {
        if (letters < 0) { const k = new Set(queue.map((q) => q.key)); if (c) for (const q of c.list) k.add(q.key); letters = k.size; }
        return letters;
      },
      copying: copyUntil != null,
      speed,
      pen: self,
    };
  }

  return Object.assign(self, {
    sync, at,
    finish(now, dry) {
      advance(now, true, true, dry);
      if (dry) for (const k of lifted.keys()) lifted.set(k, -Infinity);
    },
    liftedAt: (key) => lifted.get(key),
    reducedMotion: reduce,
    // for renderCanvas({ reveal }): (item, strokeIndex) -> 0..1 at the time of the last at()
    reveal(now) { const s = at(now); return (item, si) => s.ink(item.key, si); },
  });
}

// Paint a pen state onto an SVG drawn with renderSVG(p, page, { runs: true, strokeKeys: true }).
// Thought letters are the same strokes in faint graphite; inked strokes are normal ink; the stroke being
// written is revealed along its centerline over a faint copy of itself, so nothing flickers.
// opts: { emPx, thought (opacity of a thought letter, default 0.16), graphite (colour, default #6f6f78),
//   dim (keys of letters shown faded: Ink mode's letters taken back while the pen hovers over the fix) }
// Cheap at any length: a stroke fully inked (and not dimmed) is settled, marked .sh-ok and never touched again. Each
// frame visits only the strokes still to settle: the queue, the stroke on the pen, thought letters, dimmed letters.
// A new page (a new `page` object: after a sync) looks for strokes not yet settled once; nothing per frame walks the
// sheet.
export function paintPen(svg, page, s, opts = {}) {
  const doc = svg.ownerDocument;
  let st = svg.__shPen;
  if (!st) {
    const id = 'sh-pen-' + (++uid);
    const defs = svg.querySelector('defs') || svg.insertBefore(doc.createElementNS(NS, 'defs'), svg.firstChild);
    const style = doc.createElementNS(NS, 'style');
    // (ink paths carry their own fill, so the graphite goes on them too; CSS beats presentation attributes)
    const gr = opts.graphite || '#6f6f78';
    style.textContent = `.${id} [data-s].sh-th, .${id} [data-s].sh-th *, .${id} .sh-under, .${id} .sh-under *{fill:${gr}}`;
    const mask = doc.createElementNS(NS, 'mask');
    mask.setAttribute('id', id);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    for (const [k, v] of [['x', -1e5], ['y', -1e5], ['width', 2e5], ['height', 2e5]]) mask.setAttribute(k, v);
    const tip = doc.createElementNS(NS, 'path');
    for (const [k, v] of [['fill', 'none'], ['stroke', '#fff'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['pathLength', '1'], ['stroke-dasharray', '1 2']]) tip.setAttribute(k, v);
    mask.appendChild(tip);
    defs.appendChild(style); defs.appendChild(mask);
    svg.classList.add(id);
    st = svg.__shPen = { id, tip, active: null, activeEl: null, under: null, page: null, byKey: null, live: new Set(), pen: null, dim: null, dimKeys: '' };
  }
  const sc = (opts.emPx || 58) / 1000;
  const thoughtOpacity = opts.thought == null ? 0.16 : opts.thought;
  // another pen on the same sheet: nothing it painted counts as settled
  if (s.pen !== st.pen) {
    if (st.pen !== null) for (const el of svg.querySelectorAll('[data-s].sh-ok')) el.classList.remove('sh-ok');
    st.pen = s.pen;
    st.page = null;
  }
  // once per page: its items by key, and the strokes not yet settled (new runs, a sheet drawn afresh)
  if (st.page !== page) {
    st.page = page;
    st.byKey = new Map();
    for (const it of page.items) st.byKey.set(it.key, it);
    for (const el of svg.querySelectorAll('[data-s]:not(.sh-ok)')) if (el !== st.under) st.live.add(el);
  }
  const keyOf = (el) => {
    if (el.__shK === undefined) {
      const ks = el.getAttribute('data-s'), cut = ks.lastIndexOf('#');
      el.__shS = ks; el.__shK = ks.slice(0, cut); el.__shI = +ks.slice(cut + 1);
    }
    return el.__shK;
  };
  // letters dimmed or no longer dimmed come back to life until they settle again
  const dimKeys = opts.dim && opts.dim.size ? [...opts.dim].join('\n') : '';
  if (dimKeys !== st.dimKeys) {
    const touched = new Set([...(st.dim || []), ...(opts.dim || [])]);
    for (const el of svg.querySelectorAll('[data-s]')) if (el !== st.under && touched.has(keyOf(el))) { el.classList.remove('sh-ok'); st.live.add(el); }
    st.dimKeys = dimKeys;
    st.dim = opts.dim && opts.dim.size ? new Set(opts.dim) : null;
  }
  const dim = st.dim;
  // a correction mark isn't a thought: it shows only as the pen draws it (no grey preview of a strike)
  const isMark = (key) => { const it = st.byKey.get(key); return !!it && it.kind === 'mark'; };
  const w = s.writing;
  const activeKey = w ? w.key + '#' + w.stroke : null;
  if (st.active && st.active !== activeKey) {
    if (st.activeEl) st.activeEl.removeAttribute('mask');
    if (st.under) st.under.remove();
    st.active = null; st.activeEl = null; st.under = null;
  }
  let activeEl = null;
  for (const el of st.live) {
    if (!el.isConnected) { st.live.delete(el); continue; }
    const key = keyOf(el);
    if (el.__shS === activeKey) { activeEl = el; continue; }
    const f = s.ink(key, el.__shI);
    let cls, op;
    if (f >= 1) {
      const dimmed = !!dim && dim.has(key);
      cls = false; op = dimmed ? '0.4' : '';
      if (!dimmed) { el.classList.add('sh-ok'); st.live.delete(el); }
    } else { cls = true; op = isMark(key) ? '0' : String(thoughtOpacity * s.thought(key)); }
    if (el.__shT !== cls) { el.classList.toggle('sh-th', cls); el.__shT = cls; }
    if (el.__shO !== op) { el.style.opacity = op; el.__shO = op; }
  }
  if (w && activeEl) {
    const el = activeEl;
    const it = st.byKey.get(w.key);
    if (it) {
      if (st.active !== activeKey) {
        // a faint copy stays underneath while the ink goes on
        st.under = el.cloneNode(true);
        st.under.removeAttribute('data-s');
        st.under.removeAttribute('mask');
        st.under.classList.remove('sh-th');
        st.under.classList.add('sh-under');
        st.under.style.opacity = isMark(w.key) ? '0' : String(thoughtOpacity);
        el.parentNode.insertBefore(st.under, el);
        el.classList.remove('sh-th'); el.style.opacity = ''; el.__shT = false; el.__shO = '';
        // the reveal follows the stroke's centerline in the run's own frame
        const g = it.glyph || it.g, stroke = g.strokes[w.stroke], [lx, ly] = it.local || [0, 0];
        let d = '';
        for (const q of stroke.center) d += (d ? 'L' : 'M') + ((lx + q[0]) * sc).toFixed(1) + ' ' + ((-ly - q[1]) * sc).toFixed(1);
        st.tip.setAttribute('d', d);
        st.tip.setAttribute('stroke-width', ((2 * halfWidth(stroke) + 8) * sc + 2).toFixed(2));
        // (the mask is drawn in the masked element's own space, which already includes the run's transform)
        el.setAttribute('mask', `url(#${st.id})`);
        st.active = activeKey; st.activeEl = el;
      }
      st.tip.setAttribute('stroke-dashoffset', (1 - w.frac).toFixed(4));
    }
  }
}
