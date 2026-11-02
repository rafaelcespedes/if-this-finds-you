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
  for (const it of items) { kOf.push(k); if (it.kind === 'glyph') k += it.g.strokes.length; }

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
      if (it.kind !== 'glyph') { t += 0.2; continue; } // a placeholder: the writer hesitates
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
