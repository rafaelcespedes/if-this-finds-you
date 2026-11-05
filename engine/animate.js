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
//   pen.finish(now)                         ink everything now
//
// opts: { hold (letters held back, or 'word' to hold an unfinished last word: right for fair copy,
//   where the word being typed changes as it grows), holdMs (after this pause the held letters are
//   written anyway, default 0.7 s), speed (× handwriting speed, default 1.5), fast (top speed when far
//   behind, default 4), behind (letters behind before speeding up, default 12), fadeIn (seconds a new thought
//   letter takes to show, default 0.06; 0 when the letters already showed as thoughts elsewhere, so they never
//   blink out), reducedMotion }
// pen.trail = n: letters typed but not yet handed to the pen (Ink mode's thought letters); they count as waiting,
// so the pen speeds up with the whole backlog.
// Items keep their place in the queue by item.key. A key that disappears (deleted before it was
// inked) is dropped cleanly; one that appears is queued after everything already waiting.
// Dots, bars and accents (delayed strokes) are added once the rest of their word is written.
export function createPen(opts = {}) {
  const hold = opts.hold == null ? 2 : opts.hold;
  const holdMs = opts.holdMs == null ? 0.7 : opts.holdMs;
  const base = opts.speed || 1.5, top = opts.fast || 4, behind = opts.behind == null ? 12 : opts.behind;
  const reduce = opts.reducedMotion == null ? prefersReducedMotion() : !!opts.reducedMotion;
  const fadeIn = opts.fadeIn == null ? 0.06 : opts.fadeIn;
  const self = { trail: 0 };
  const inked = new Map();   // key -> number of strokes fully inked (Infinity = whole letter)
  let queue = [];            // { key, si, dur, word, delayed, tn, sn }
  const seenAt = new Map();  // key -> time first seen (thought fade-in)
  const kin = new WeakMap();
  let cur = null;            // the stroke being written: { s, t0 }
  let clock = null, gapLeft = 0, typedAt = -Infinity, lastWord = null, page = null, closed = new Set();
  let heldKeys = new Set();

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

  function sync(pg, now) {
    // first catch the pen up to this moment with what was on the page until now, so its progress
    // depends only on time, never on how often someone asked for a frame
    if (clock == null) clock = now; // the pen's clock starts when the first letters arrive
    else advance(now, reduce);
    page = pg;
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
    if (cur) queued.add(cur.s.key + '#' + cur.s.si);
    for (const it of glyphs) {
      present.add(it.key);
      if (!seenAt.has(it.key)) seenAt.set(it.key, now);
      if (inked.get(it.key) === Infinity) continue;
      const g = it.glyph || it.g;
      g.strokes.forEach((st, si) => {
        if ((inked.get(it.key) || 0) > si || queued.has(it.key + '#' + si)) return;
        const t = timing(st.center, xh);
        queue.push({ key: it.key, si, n: g.strokes.length, word: it.wkey, delayed: it.kind !== 'mark' && !!st.delayed, dur: Math.max(st.dot ? 0.05 : 0.04, t.dur) / (it.tempo || 1), tn: t.tn, sn: t.sn });
      });
    }
    // letters deleted before the pen reached them simply go (they were only a thought)
    queue = queue.filter((q) => present.has(q.key));
    if (cur && !present.has(cur.s.key)) cur = null;
    for (const k of [...seenAt.keys()]) if (!present.has(k)) seenAt.delete(k);
    typedAt = now;
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

  // move the pen forward from its clock to `now` (instantly: write everything it may write now;
  // force: also what it is holding back)
  function advance(now, instant, force) {
    const budget = instant ? Infinity : 0;
    if (clock == null) clock = now;
    let t = budget === Infinity ? Infinity : Math.max(0, now - clock);
    clock = now;
    let guard = 0;
    while (t > 0 && guard++ < 100000) {
      if (!cur) {
        if (gapLeft > 0) { const d = Math.min(gapLeft, t); gapLeft -= d; t -= d; continue; }
        const i = next(now, force);
        if (i == null) break;
        const s = queue.splice(i, 1)[0];
        cur = { s, done: 0 };
      }
      // speed: a little faster than a person, much faster when far behind
      const waiting = new Set(queue.map((q) => q.key)).size + (self.trail || 0);
      const speed = budget === Infinity ? Infinity : base + (top - base) * clamp((waiting - behind) / behind, 0, 1);
      const need = (cur.s.dur - cur.done) / speed;
      if (t >= need) {
        t -= need;
        inked.set(cur.s.key, Math.max(inked.get(cur.s.key) || 0, cur.s.si + 1));
        if (!queue.some((q) => q.key === cur.s.key)) inked.set(cur.s.key, Infinity);
        // pen up: a short lift between strokes, longer between words
        const ni = next(now, force), nextQ = ni == null ? null : queue[ni];
        gapLeft = budget === Infinity ? 0 : (nextQ && nextQ.word !== cur.s.word ? 0.18 : 0.07) / speed;
        lastWord = cur.s.word;
        cur = null;
      } else { cur.done += t * speed; t = 0; }
    }
  }

  function at(now) {
    advance(now, reduce);
    const c = cur;
    return {
      ink: (key, si) => {
        const n = inked.get(key);
        if (n === Infinity || (n || 0) > si) return 1;
        if (c && c.s.key === key && c.s.si === si) return strokeFraction(c.s, c.done / c.s.dur);
        return 0;
      },
      thought: (key) => {
        if (inked.get(key) === Infinity) return 0;
        const t0 = seenAt.get(key);
        return t0 == null ? 0 : fadeIn > 0 ? clamp((now - t0) / fadeIn, 0, 1) : 1;
      },
      writing: c ? { key: c.s.key, stroke: c.s.si, frac: strokeFraction(c.s, c.done / c.s.dur) } : null,
      busy: queue.length + (c ? 1 : 0),
      letters: new Set([...queue.map((q) => q.key), ...(c ? [c.s.key] : [])]).size,
    };
  }

  return Object.assign(self, {
    sync, at,
    finish(now) { advance(now, true, true); },
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
    st = svg.__shPen = { id, tip, active: null, under: null };
  }
  const sc = (opts.emPx || 58) / 1000;
  const thoughtOpacity = opts.thought == null ? 0.16 : opts.thought;
  const byKey = new Map(page.items.map((it) => [it.key, it]));
  // a correction mark isn't a thought: it shows only as the pen draws it (no grey preview of a strike)
  const isMark = (key) => { const it = byKey.get(key); return !!it && it.kind === 'mark'; };
  const w = s.writing;
  const activeKey = w ? w.key + '#' + w.stroke : null;
  if (st.active && st.active !== activeKey) {
    const old = svg.querySelector(`[data-s="${st.active}"]`);
    if (old) old.removeAttribute('mask');
    if (st.under) st.under.remove();
    st.active = null; st.under = null;
  }
  svg.querySelectorAll('[data-s]').forEach((el) => {
    if (el === st.under) return;
    const ks = el.getAttribute('data-s'), cut = ks.lastIndexOf('#');
    const key = ks.slice(0, cut), si = +ks.slice(cut + 1);
    const f = s.ink(key, si);
    if (ks === activeKey) return;
    if (f >= 1) { el.classList.remove('sh-th'); el.style.opacity = opts.dim && opts.dim.has(key) ? '0.4' : ''; }
    else { el.classList.add('sh-th'); el.style.opacity = isMark(key) ? '0' : String(thoughtOpacity * s.thought(key)); }
  });
  if (w) {
    const el = svg.querySelector(`[data-s="${activeKey}"]`);
    const it = byKey.get(w.key);
    if (el && it) {
      if (st.active !== activeKey) {
        // a faint copy stays underneath while the ink goes on
        st.under = el.cloneNode(true);
        st.under.removeAttribute('data-s');
        st.under.removeAttribute('mask');
        st.under.classList.remove('sh-th');
        st.under.classList.add('sh-under');
        st.under.style.opacity = isMark(w.key) ? '0' : String(thoughtOpacity);
        el.parentNode.insertBefore(st.under, el);
        el.classList.remove('sh-th'); el.style.opacity = '';
        // the reveal follows the stroke's centerline in the run's own frame
        const g = it.glyph || it.g, stroke = g.strokes[w.stroke], [lx, ly] = it.local || [0, 0];
        let d = '';
        for (const q of stroke.center) d += (d ? 'L' : 'M') + ((lx + q[0]) * sc).toFixed(1) + ' ' + ((-ly - q[1]) * sc).toFixed(1);
        st.tip.setAttribute('d', d);
        st.tip.setAttribute('stroke-width', ((2 * halfWidth(stroke) + 8) * sc + 2).toFixed(2));
        // (the mask is drawn in the masked element's own space, which already includes the run's transform)
        el.setAttribute('mask', `url(#${st.id})`);
        st.active = activeKey;
      }
      st.tip.setAttribute('stroke-dashoffset', (1 - w.frac).toFixed(4));
    }
  }
}
