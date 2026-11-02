// render-svg.js — a laid-out page -> an SVG string. No DOM needed (works in Node too).
// This is the vector / export path. The live view uses renderCanvas (render-canvas.js), which models
// ink as a density field; here the same ink model is approximated with plain SVG that survives export:
// each stroke is filled with its Beer–Lambert colour, slow and down strokes get a darker core, and
// rests get soft pools (radial gradients). Crossings darken through fill-opacity.

import { UPM } from './hand.js';
import { getPen, strokeInk, inkModel, inkRGB, inkWalker, rgbHex, PEN_KIND } from './pen.js';

export function contoursToD(contours, ox, oy, sc) {
  let d = '';
  for (const c of contours) {
    d += 'M' + (ox + c[0][0] * sc).toFixed(1) + ' ' + (oy - c[0][1] * sc).toFixed(1);
    for (let i = 1; i < c.length; i++) d += 'L' + (ox + c[i][0] * sc).toFixed(1) + ' ' + (oy - c[i][1] * sc).toFixed(1);
    d += 'Z';
  }
  return d;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---------- ink look (SVG) ----------
// Edge roughening scaled per pen and capped at 10% of the thinnest stroke; felt bleeds a little;
// pencil gets a graphite grain that breaks up its coverage.
function svgLook(p, pen, emPx) {
  const sc = emPx / UPM;
  const thinPx = Math.max(0.2, (pen.kind === PEN_KIND.pointed || pen.kind === PEN_KIND.italic ? 0.16 : 0.5) * p.penWidth * sc);
  const rough = Math.min((pen.rough || 0.2) * Math.min(1.6, 0.5 + emPx / 70), 0.1 * thinPx * 2) * 2;
  let f = `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${rough.toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="ink"/>`;
  if (pen.kind === PEN_KIND.felt) f += `<feGaussianBlur in="ink" stdDeviation="${Math.max(0.25, 0.5 * (pen.bleed || 0.5) * emPx / 58).toFixed(2)}" result="ink"/>`;
  if (pen.kind === PEN_KIND.pencil) {
    f += `<feTurbulence type="fractalNoise" baseFrequency="${(1.4 * 58 / emPx).toFixed(2)} ${(0.95 * 58 / emPx).toFixed(2)}" numOctaves="2" seed="3" result="g"/>` +
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
  return contoursToD([L.concat(R.reverse())], ox, oy, sc);
}

// page: result of layout(); opts: { width (px), emPx (px per em), ink (swatch key, '#rrggbb' or a CSS color) }
export function renderSVG(p, page, opts) {
  const W = opts.width;
  const emPx = opts.emPx;
  const sc = emPx / UPM;
  const pen = getPen(p);
  const look = svgLook(p, pen, emPx);
  const model = inkModel(p, opts.ink);                  // null: a CSS colour we can't model -> flat fill
  const flat = model ? null : (opts.ink || 'var(--ink)');
  const walk = inkWalker(p);
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
  const wet = pen.kind !== PEN_KIND.pencil && pen.kind !== PEN_KIND.classic;
  const paths = [];
  const misses = [];
  let prevInk = null;
  for (const it of page.items) {
    if (it.kind === 'miss') {
      misses.push(`<text class="miss" x="${((it.x + 280) * sc).toFixed(1)}" y="${(it.y * sc).toFixed(1)}" font-size="${(0.62 * emPx).toFixed(1)}">` +
        `<title>This hand hasn’t learned ‹${esc(it.ch)}› yet</title>${esc(it.ch)}</text>`);
      continue;
    }
    const wordStart = it.inkIndex !== prevInk;
    prevInk = it.inkIndex;
    const ox = it.x * sc, oy = it.y * sc;
    // one path per pen stroke, in its own Beer–Lambert colour; fill-opacity lets crossings build up
    it.g.strokes.forEach((st, ci) => {
      const pr = strokeInk(p, st);
      const d = contoursToD([st.contour], ox, oy, sc);
      if (!pr || !model) { paths.push(`<path fill="${flat}" fill-opacity="0.92" d="${d}"/>`); return; }
      let dm = 0, wm = 0;
      for (let i = 0; i < pr.n; i++) { dm += pr.d[i]; wm += pr.w[i]; }
      dm /= pr.n; wm /= pr.n;
      const ink = walk({ item: it, strokeIndex: ci, wordStart, len: pr.len, width: wm, dot: pr.dot });
      const base = dm * ink.mul;
      paths.push(`<path fill="${rgbHex(inkRGB(model, base * 1.1))}" fill-opacity="0.88" d="${d}"/>`);
      if (!wet) return;
      // darker core where the ink runs heavier than the stroke's mean (slow and down strokes)
      let i0 = -1;
      for (let i = 0; i <= pr.n; i++) {
        const heavy = i < pr.n && pr.d[i] * ink.mul > base * 1.12 && !pr.dot;
        if (heavy && i0 < 0) i0 = i;
        if (!heavy && i0 >= 0) {
          const i1 = i - 1;
          if (pr.s[i1] - pr.s[i0] > 0.8 * wm) {
            let dc = 0; for (let j = i0; j <= i1; j++) dc += pr.d[j]; dc = dc / (i1 - i0 + 1) * ink.mul;
            paths.push(`<path fill="${rgbHex(inkRGB(model, dc * 1.15))}" fill-opacity="0.5" d="${corePath(pr, i0, i1, 0.55, ox, oy, sc)}"/>`);
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
        paths.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" transform="rotate(${ang.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#${grad(inkRGB(model, v * 1.2))})"/>`);
      }
    });
  }
  const H = Math.ceil(page.height * sc);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Handwritten text">` +
    `<defs>${look.defs}${[...grads.values()].map((g) => g.def).join('')}</defs>` +
    `<g ${look.groupAttrs}>${paths.join('')}</g>${misses.join('')}</svg>`;
}
