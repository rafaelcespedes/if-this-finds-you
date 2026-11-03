// ink-svg.js — how ink looks in SVG, one item at a time. Shared by every SVG renderer (renderSVG draws
// whole pages; page-rhythm's renderRun draws one word in its own frame), so the look is identical.
//
//   const ink = inkSVG(p, { emPx, ink, wrap });   // once per render
//   ink.item(it, g, ox, oy)   // draw g's strokes (default it.g) with g's origin at (ox, oy) px, y down
//   ink.lift()                // the pen leaves the paper (a missing glyph, a gap): the next stroke starts afresh
//   ink.take()                // close the open pen-down; returns the elements drawn since the last take
//   ink.defs()                // <filter> + pool gradients, for <defs> (call after drawing)
//   ink.groupAttrs            // goes on the <g> that holds the ink (the edge filter)
//
//   it:   supplies kind ('glyph' | 'mark'), inkIndex, charIndex, key, weight. Ink is a pure function of
//         the item and stroke, so a word redrawn on its own looks exactly as in a full render.
//   wrap: (it, strokeIndex, k) => attribute string | null. When it returns a string, each stroke gets its
//         own <g …> (write-on animation) and pen-downs aren't merged. k counts strokes since inkSVG().
//
// The look: each pen-down (a stroke plus the pieces that continue it: corners, retraces, script joins)
// is ONE path in its Beer–Lambert colour, so a stroke that retraces itself doesn't darken; separate
// pen-downs overlap through fill-opacity, so real crossings do. Slow and down strokes get a darker
// core, rests get soft pools (radial gradients). Outlines are simplified to ~0.15 px.

import { UPM } from './hand.js';
import { rng } from './core.js';
import { getPen, strokeInk, inkModel, inkRGB, inkAt, rgbHex, simplify, penWidthUnits, continuesStroke, PEN_KIND } from './pen.js';

const num = (v) => String(Math.round(v * 10) / 10);
// compact path data for one closed contour (font units, y up) placed at (ox, oy) px
export function polyD(c, ox, oy, sc) {
  let d = 'M' + num(ox + c[0][0] * sc) + ' ' + num(oy - c[0][1] * sc);
  for (let i = 1; i < c.length; i++) d += 'L' + num(ox + c[i][0] * sc) + ' ' + num(oy - c[i][1] * sc);
  return d + 'Z';
}

// Edge roughening scaled per pen and capped at 10% of the thinnest stroke; felt bleeds a little;
// pencil gets a graphite grain that breaks up its coverage.
function svgLook(p, pen, emPx) {
  const sc = emPx / UPM;
  const thinPx = Math.max(0.2, (pen.kind === PEN_KIND.pointed || pen.kind === PEN_KIND.italic ? 0.16 : 0.5) * penWidthUnits(p) / (pen.wScale || 1) * sc);
  const rough = Math.min((pen.rough || 0.2) * Math.min(1.6, 0.5 + emPx / 70), 0.1 * thinPx * 2) * 2;
  const seed = 1 + Math.floor(rng('svg:' + p.seed)() * 997); // each hand's paper and pen roughen differently
  let f = `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${seed}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${rough.toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="ink"/>`;
  if (pen.kind === PEN_KIND.felt) f += `<feGaussianBlur in="ink" stdDeviation="${Math.max(0.25, 0.5 * (pen.bleed || 0.5) * emPx / 58).toFixed(2)}" result="ink"/>`;
  if (pen.kind === PEN_KIND.pencil) {
    f += `<feTurbulence type="fractalNoise" baseFrequency="${(1.4 * 58 / emPx).toFixed(2)} ${(0.95 * 58 / emPx).toFixed(2)}" numOctaves="2" seed="${seed + 1}" result="g"/>` +
      `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.25 1.32" result="gm"/>` +
      `<feComposite in="ink" in2="gm" operator="in"/>`;
  }
  return {
    defs: `<filter id="inkEdge" x="-2%" y="-2%" width="104%" height="104%">${f}</filter>`,
    groupAttrs: 'filter="url(#inkEdge)"',
  };
}

// a closed path along part of a profile, `frac` of its width, tapering to a point at both ends
function corePath(pr, i0, i1, frac, ox, oy, sc) {
  const L = [], R = [];
  const s0 = pr.s[i0], s1 = pr.s[i1], span = Math.max(1e-6, s1 - s0);
  for (let i = i0; i <= i1; i++) {
    const u = (pr.s[i] - s0) / span;
    const taper = Math.min(1, u / 0.3, (1 - u) / 0.3);
    const h = pr.w[i] * frac * 0.5 * Math.max(0, taper);
    const x = pr.x[i], y = pr.y[i];
    L.push([x - pr.ty[i] * h, y + pr.tx[i] * h]);
    R.push([x + pr.ty[i] * h, y - pr.tx[i] * h]);
  }
  return polyD(simplify(L.concat(R.reverse()), 0.15 / sc), ox, oy, sc);
}

// opts: { emPx (px per em), ink (swatch key, '#rrggbb' or a CSS colour), wrap }
export function inkSVG(p, opts = {}) {
  const emPx = opts.emPx;
  const sc = emPx / UPM;
  const pen = getPen(p);
  const look = svgLook(p, pen, emPx);
  const model = inkModel(p, opts.ink);                  // null: a CSS colour we can't model -> flat fill
  const flat = model ? null : (opts.ink || 'var(--ink)');
  const wrap = opts.wrap || null;
  const wet = pen.kind !== PEN_KIND.pencil && pen.kind !== PEN_KIND.classic;
  const tol = 0.15 / sc;                                // outline simplification: 0.15 px
  const grads = new Map();
  const grad = (rgb) => { // one radial gradient per pool colour
    const hex = rgbHex(rgb);
    let g = grads.get(hex);
    if (!g) {
      g = { id: 'pool' + grads.size };
      g.def = `<radialGradient id="${g.id}"><stop offset="0" stop-color="${hex}" stop-opacity="0.85"/>` +
        `<stop offset="0.55" stop-color="${hex}" stop-opacity="0.45"/><stop offset="1" stop-color="${hex}" stop-opacity="0"/></radialGradient>`;
      grads.set(hex, g);
    }
    return g.id;
  };
  const out = [];
  // the pen-down being collected: its subpaths, length-weighted density, shade, and overlays
  let chain = null, prevEnd = null, prevKind = null, prevInk = null, k = 0;
  const flush = (attr) => {
    if (!chain) return;
    const fill = chain.flat || rgbHex(inkRGB(model, chain.dl / Math.max(1e-6, chain.len) * 1.1, undefined, chain.shade));
    const els = `<path fill="${fill}" fill-opacity="${chain.flat ? '0.92' : '0.88'}" d="${chain.d}"/>` + chain.over.join('');
    out.push(attr == null ? els : `<g ${attr}>${els}</g>`);
    chain = null;
  };
  const lift = () => { flush(); prevEnd = null; prevKind = null; prevInk = null; };

  function item(it, g = it.g, ox = it.x * sc, oy = it.y * sc) {
    if (!g) return;
    if (it.kind !== prevKind) { flush(); prevEnd = null; } // a correction mark is its own pen-down
    prevKind = it.kind;
    const wordStart = it.inkIndex !== prevInk;
    prevInk = it.inkIndex;
    const weight = it.weight > 0 ? Math.pow(it.weight, 0.6) : 1; // overwritten letters carry more ink
    const ux = ox / sc, uy = oy / sc;                   // the same offset in font units, for joins
    const ns = g.strokes.length;
    g.strokes.forEach((st, ci) => {
      const pr = strokeInk(p, st);
      const d = polyD(simplify(st.contour, tol), ox, oy, sc);
      const attr = wrap ? wrap(it, ci, k + ci) : null;
      // does this stroke continue the previous one (a corner, a retrace, a script join)? then same path
      const joins = attr == null && prevEnd && continuesStroke(prevEnd.pr, prevEnd.x, prevEnd.y, pr, ux, uy);
      if (!joins) flush();
      const done = () => { if (attr != null) flush(attr); };
      if (pr) prevEnd = { pr, x: ux, y: uy };
      if (!pr || !model) {
        if (!chain) chain = { d: '', flat: flat || 'currentColor', over: [] };
        chain.d += d;
        return done();
      }
      let dm = 0, wm = 0;
      for (let i = 0; i < pr.n; i++) { dm += pr.d[i]; wm += pr.w[i]; }
      dm /= pr.n; wm /= pr.n;
      const ink = inkAt(p, { item: it, strokeIndex: ci, strokeCount: ns, wordStart });
      if (weight !== 1) ink.mul *= weight;
      const base = dm * ink.mul;
      if (!chain) chain = { d: '', dl: 0, len: 0, shade: ink.shade, over: [] };
      chain.d += d; chain.dl += base * pr.len; chain.len += pr.len;
      if (!wet) return done();
      // darker core where the ink runs heavier than the stroke's mean (slow and down strokes)
      let i0 = -1;
      for (let i = 0; i <= pr.n; i++) {
        const heavy = i < pr.n && pr.d[i] * ink.mul > base * 1.12 && !pr.dot;
        if (heavy && i0 < 0) i0 = i;
        if (!heavy && i0 >= 0) {
          const i1 = i - 1;
          if (pr.s[i1] - pr.s[i0] > 0.8 * wm) {
            let dc = 0; for (let j = i0; j <= i1; j++) dc += pr.d[j]; dc = dc / (i1 - i0 + 1) * ink.mul;
            chain.over.push(`<path fill="${rgbHex(inkRGB(model, dc * 1.15, undefined, ink.shade))}" fill-opacity="0.5" d="${corePath(pr, i0, i1, 0.55, ox, oy, sc)}"/>`);
          }
          i0 = -1;
        }
      }
      // pools: local density peaks well above the stroke's mean (rests, blobs, cusps, a fresh dip)
      const extra = (i) => pr.d[i] * ink.mul + (ink.wet ? ink.wet * (pen.pool || 0) * 1.5 * Math.exp(-((pr.s[i] / (0.6 * pr.w[0])) ** 2)) : 0);
      for (let i = 0; i < pr.n; i++) {
        const v = extra(i);
        if (v < base * 1.25 && !(pr.dot && i === 1)) continue;
        if ((i > 0 && extra(i - 1) > v) || (i < pr.n - 1 && extra(i + 1) >= v)) continue;
        const x = ox + pr.x[i] * sc, y = oy - pr.y[i] * sc;
        const rx = 0.6 * pr.w[i] * sc, ry = 0.48 * pr.w[i] * sc;
        const ang = Math.atan2(-pr.ty[i], pr.tx[i]) * 180 / Math.PI;
        chain.over.push(`<ellipse cx="${num(x)}" cy="${num(y)}" rx="${num(rx)}" ry="${num(ry)}" transform="rotate(${ang.toFixed(0)} ${num(x)} ${num(y)})" fill="url(#${grad(inkRGB(model, v * 1.2, undefined, ink.shade))})"/>`);
      }
      done();
    });
    k += g.contours.length;
  }

  return {
    item,
    lift,
    take() { lift(); return out.splice(0).join(''); },
    defs: () => look.defs + [...grads.values()].map((g) => g.def).join(''),
    groupAttrs: look.groupAttrs,
  };
}
