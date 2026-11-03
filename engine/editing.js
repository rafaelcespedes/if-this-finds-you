// editing.js — the geometry an editor needs over handwriting: caret, hit-testing and selection.
// Pure data, no DOM. Everything is in page font units (y down), like layout().
//
//   const page = layout(p, text, opts);
//   const geo = geometry(p, page);              // or geometry(p, [page1, page2, ...]) for a page written in pieces
//   geo.caretAt(offset, 'after')                -> { x, y, top, bottom, line, angle, slant }
//   geo.hitTest(x, y)                           -> { offset, aff, line }
//   geo.selection(from, to)                     -> [{ line, points }]   one leaning ribbon per written line
//   pathD(points, scale)                        -> SVG path data for a ribbon
//
// Stops come from layout (page.stops): one for every boundary in the text, spaces, line ends and empty
// lines included. At a soft wrap one offset has two places: the end of the upper line (aff 'before') and
// the start of the lower one (aff 'after'). The caret is a slanted pen tip on the line's own wandering
// baseline (lineBaseline), and hit-testing removes the slant before looking for the nearest stop.

import { DEG } from './core.js';
import { lineBaseline, lineAngle, lineLean, pageMetrics } from './layout.js';

export function geometry(p, pages, opts = {}) {
  const list = Array.isArray(pages) ? pages : [pages];
  const M = pageMetrics(p);
  const xh = M.xh;
  // the caret and selection band: about an ascender up, half a descender down
  const ascent = opts.ascent || Math.min(0.9 * M.ascender, 2.4 * xh);
  const descent = opts.descent || 0.55 * M.descender;
  // lines and stops; a later page (written after) wins for the same offset and side
  const lines = new Map();
  for (const pg of list) for (const ln of pg.lineInfo) lines.set(ln.n, ln);
  const byKey = new Map();
  for (const pg of list) for (const s of pg.stops) byKey.set(s.o + (s.aff || ''), s);
  // a soft wrap has its two places (aff 'before' and 'after'); a plain stop at the same offset is left
  // over from text written in pieces (Ink mode: a piece's end, before the next piece wrapped) and goes
  for (const k of [...byKey.keys()]) {
    const s = byKey.get(k);
    if (!s.aff && byKey.has(s.o + 'before') && byKey.has(s.o + 'after')) byKey.delete(k);
  }
  const stops = [...byKey.values()].sort((a, b) => a.o - b.o || (a.aff === 'before' ? -1 : b.aff === 'before' ? 1 : 0));
  const onLine = new Map();
  for (const s of stops) { if (!onLine.has(s.line)) onLine.set(s.line, []); onLine.get(s.line).push(s); }
  for (const arr of onLine.values()) arr.sort((a, b) => a.x - b.x || a.o - b.o);
  const lineNums = [...onLine.keys()].sort((a, b) => a - b);

  const baseline = (n, x) => lineBaseline(p, lines.get(n), x);
  // An empty line between paragraphs sits in the gap the writer left there: a whole line, half a line or
  // almost none. Its caret, hit area and selection tab stay inside that gap, clear of the letters above
  // and below. gaps: line n -> [the written line above, the written line below]
  const gaps = new Map();
  {
    const all = [...lines.keys()].sort((a, b) => a - b);
    all.forEach((n, i) => {
      if (!lines.get(n).blank) return;
      let a = i - 1; while (a >= 0 && lines.get(all[a]).blank) a--;
      let b = i + 1; while (b < all.length && lines.get(all[b]).blank) b++;
      if (a >= 0 && b < all.length) gaps.set(n, [all[a], all[b]]);
    });
  }
  // above / below the baseline that line n's caret may reach at x (font units)
  function reach(n, x) {
    const g = gaps.get(n);
    if (!g) return [ascent, descent];
    const y = baseline(n, x);
    const top = Math.max(y - ascent, baseline(g[0], x) + M.descender), bottom = Math.min(y + descent, baseline(g[1], x) - M.ascender);
    if (bottom - top >= 0.2 * xh) return [y - top, bottom - y];
    const mid = (top + bottom) / 2;
    return [y - mid + 0.1 * xh, mid - y + 0.1 * xh];
  }
  // lean of the writing at x on a line, degrees (the hand's slant + the line's own lean)
  const slant = (n, x) => (p.slant || 0) + lineLean(p, lines.get(n), x);

  // the stop for an offset (the nearest one at or before it when the offset falls inside a letter)
  function stopFor(offset, aff = 'after') {
    let lo = 0, hi = stops.length - 1, best = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (stops[m].o <= offset) { best = m; lo = m + 1; } else hi = m - 1; }
    if (best < 0) return stops[0] || null;
    const o = stops[best].o;
    let a = best;
    while (a > 0 && stops[a - 1].o === o) a--;
    const same = stops.slice(a, best + 1);
    return same.find((s) => s.aff === aff) || same.find((s) => !s.aff) || same[same.length - 1];
  }

  // a point in the line's own frame (along the baseline, up by v, leaned) -> page
  function framePoint(n, x, v) {
    const y = baseline(n, x), a = lineAngle(p, lines.get(n), x), t = Math.tan(slant(n, x) * DEG);
    const u = v * t, c = Math.cos(a), s = Math.sin(a);
    return [x + c * u - s * v, y - (s * u + c * v)];
  }

  function caretAt(offset, aff = 'after') {
    const s = stopFor(offset, aff);
    if (!s) return null;
    const [up, down] = reach(s.line, s.x);
    return {
      offset: s.o, aff: s.aff || aff, line: s.line, x: s.x, y: baseline(s.line, s.x), kind: s.kind,
      top: framePoint(s.line, s.x, up), bottom: framePoint(s.line, s.x, -down),
      angle: lineAngle(p, lines.get(s.line), s.x), slant: slant(s.line, s.x),
    };
  }

  // the written line a point belongs to: the first line (top down) whose descenders the point hasn't
  // passed, so a click high on an ascender or low on a descender stays with its own line
  function lineAt(x, y) {
    // an empty line between paragraphs: only inside its gap
    for (const n of gaps.keys()) {
      if (!onLine.has(n)) continue;
      const b = baseline(n, x), [up, down] = reach(n, x);
      if (y >= b - up && y <= b + down) return n;
    }
    let best = null, by = Infinity;
    for (const n of lineNums) {
      if (gaps.has(n)) continue;
      const b = baseline(n, x);
      if (y <= b + 1.05 * M.descender && b < by) { by = b; best = n; }
    }
    if (best != null) return best;
    let low = null, ly = -Infinity; // below every line: the last one
    for (const n of lineNums) { if (gaps.has(n)) continue; const b = baseline(n, x); if (b > ly) { ly = b; low = n; } }
    return low;
  }
  // the stop on line n nearest to page x (already un-sheared)
  function nearestOn(n, x) {
    const arr = onLine.get(n);
    if (!arr || !arr.length) return null;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if ((arr[m].x + arr[m + 1].x) / 2 < x) lo = m + 1; else hi = m; }
    return arr[lo];
  }
  function hitTest(x, y) {
    const n = lineAt(x, y);
    if (n == null) return { offset: 0, aff: 'after', line: null };
    // un-shear: a click on an ascender belongs to the letter at its foot
    const h = baseline(n, x) - y;
    const s = nearestOn(n, x - h * Math.tan(slant(n, x) * DEG));
    return { offset: s.o, aff: s.aff || (s.kind === 'lineEnd' ? 'before' : 'after'), line: n };
  }

  // the caret stops of a line, left to right (for Home/End and Up/Down with a goal x)
  const lineStops = (n) => onLine.get(n) || [];
  const stopNear = (n, x) => nearestOn(n, x);

  // one leaning ribbon per written line, following the line's wander
  function selection(from, to) {
    if (to < from) [from, to] = [to, from];
    if (to === from) return [];
    const out = [];
    for (const n of lineNums) {
      const arr = onLine.get(n);
      const inside = arr.filter((s) => s.o >= from && s.o <= to && !(s.o === from && s.aff === 'before') && !(s.o === to && s.aff === 'after'));
      if (!inside.length) continue;
      let xa = Math.min(...inside.map((s) => s.x)), xb = Math.max(...inside.map((s) => s.x));
      if (xb - xa < 0.2 * xh) { if (inside.length === 1 && inside[0].o === to) continue; xb = xa + 0.2 * xh; } // a selected line end shows as a short tab
      const step = 0.5 * xh, top = [], bottom = [];
      for (let x = xa; ; x = Math.min(xb, x + step)) { const [up, down] = reach(n, x); top.push(framePoint(n, x, up)); bottom.push(framePoint(n, x, -down)); if (x >= xb) break; }
      out.push({ line: n, from: Math.min(...inside.map((s) => s.o)), to: Math.max(...inside.map((s) => s.o)), points: top.concat(bottom.reverse()) });
    }
    return out;
  }

  return { stops, lines, ascent, descent, baseline, slant, caretAt, hitTest, selection, lineAt, lineStops, stopNear, stopFor };
}

// A page whose caret stops are moved `by` offsets: Ink mode's thought letters (sheet.js draftPage, offsets
// counted from draft.from) in the textarea's offsets, after the written text. Then one geometry covers the
// whole text, with a stop at every boundary (spaces and line ends too) and both sides of every wrap:
//   geometry(p, [page, offsetStops(draft, page.text.length - draft.from)])
export function offsetStops(page, by) {
  return Object.assign({}, page, { stops: page.stops.map((s) => Object.assign({}, s, { o: s.o + by })) });
}

// SVG path data for a closed ribbon (page units × scale); round its corners with stroke-linejoin: round
export function pathD(points, sc = 1) {
  if (!points.length) return '';
  let d = '';
  points.forEach((q, i) => { d += (i ? 'L' : 'M') + (q[0] * sc).toFixed(1) + ' ' + (q[1] * sc).toFixed(1); });
  return d + 'Z';
}
