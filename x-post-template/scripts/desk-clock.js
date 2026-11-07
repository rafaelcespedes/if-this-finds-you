// desk-clock.js: put into the writing page before any of its own code runs (scripts/desk-capture.mjs), so the page
// runs on the video's clock instead of the wall clock. performance.now, Date, timers, requestAnimationFrame, CSS
// transitions and Math.random all follow a virtual clock that only moves when the recorder calls
// window.__desk.advance(ms). The page's own code is untouched: it is the site, just told what time it is.
(() => {
  const real = { setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) };
  // 9:41 on a Sunday morning, as the notes list will say
  const DATE0 = new Date(2026, 10, 8, 9, 41, 0).getTime();
  let vnow = 1000; // ms, performance.now()
  // the wall clock's offset from the video's (h): the notes written before the video are dated earlier
  let shift = Number(new URLSearchParams(location.search).get('shift') || 0) * 3600e3;
  const timers = new Map();
  let tid = 1;
  let rafs = [];
  let rid = 1;
  const cancelled = new Set();

  Object.defineProperty(performance, 'now', { value: () => vnow, configurable: true });
  const RealDate = Date;
  class VDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(DATE0 + vnow - 1000 + shift); else super(...a); }
    static now() { return DATE0 + vnow - 1000 + shift; }
  }
  VDate.UTC = RealDate.UTC; VDate.parse = RealDate.parse;
  window.Date = VDate;

  // a seeded Math.random: the same visit every time (which writer a new note opens with, ids…)
  let seed = Number(new URLSearchParams(location.search).get('rand') || 7) >>> 0 || 7;
  Math.random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };

  window.setTimeout = (fn, ms, ...args) => { const id = tid++; timers.set(id, { at: vnow + Math.max(0, Number(ms) || 0), fn, args, every: 0 }); return id; };
  window.setInterval = (fn, ms, ...args) => { const id = tid++; const every = Math.max(1, Number(ms) || 0); timers.set(id, { at: vnow + every, fn, args, every }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = rid++; rafs.push({ id, fn }); return id; };
  window.cancelAnimationFrame = (id) => { cancelled.add(id); };

  const run = (f) => { try { typeof f === 'function' ? f() : null; } catch (e) { console.error('[desk-clock]', e); } };
  function fireTimers(upTo) {
    for (;;) {
      let best = null, bestId = 0;
      for (const [id, t] of timers) if (t.at <= upTo && (!best || t.at < best.at || (t.at === best.at && id < bestId))) { best = t; bestId = id; }
      if (!best) return;
      vnow = Math.max(vnow, best.at);
      if (best.every) best.at += best.every; else timers.delete(bestId);
      run(() => best.fn(...best.args));
    }
  }
  function fireRafs() {
    const list = rafs; rafs = [];
    for (const r of list) if (!cancelled.has(r.id)) run(() => r.fn(vnow));
    cancelled.clear();
  }
  // CSS transitions and animations: held, and moved on with the clock
  function animations() {
    for (const a of document.getAnimations()) {
      if (a.__v0 === undefined) { a.__v0 = vnow; try { a.pause(); } catch {} }
      const t = vnow - a.__v0;
      const end = a.effect?.getComputedTiming?.().endTime ?? Infinity;
      try { if (Number.isFinite(end) && t >= end) a.finish(); else a.currentTime = t; } catch {}
    }
  }
  const STEP = 1000 / 60;
  window.__desk = {
    now: () => vnow,
    /** move the clock on by `ms`, firing timers in order and animation frames every 1/60 s */
    advance(ms) {
      const target = vnow + ms;
      while (vnow < target - 1e-6) {
        const next = Math.min(target, vnow + STEP);
        fireTimers(next);
        vnow = next;
        fireRafs();
        animations();
      }
      fireTimers(vnow);
      animations();
      return vnow;
    },
    /** let the page's promises, workers and React commits run (real time), with the clock still */
    settle(ms = 0) { return new Promise((r) => real.setTimeout(r, ms)); },
    /** run what's waiting for this moment (timers due, animation frames) without moving the clock */
    flush() { fireTimers(vnow); fireRafs(); animations(); },
    shift(ms) { shift += ms; },
    shifted: () => shift,
    pending: () => ({ timers: timers.size, rafs: rafs.length }),
  };
})();
