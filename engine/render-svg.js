// render-svg.js — a laid-out page -> an SVG string. No DOM needed (works in Node too).

import { UPM } from './hand.js';
import { getPen } from './pen.js';

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

// page: result of layout(); opts: { width (px), emPx (px per em), ink (CSS color, default var(--ink)),
//   strokeIds (wrap each pen stroke in <g data-k="k"> for the writing animation; k counts g.strokes
//              across the page in item order, see animate.js),
//   rules (draw the ruled lines of a `ruled` layout, CSS color, default var(--rule)) }
export function renderSVG(p, page, opts) {
  const W = opts.width;
  const emPx = opts.emPx;
  const sc = emPx / UPM;
  const pen = getPen(p);
  const look = pen.svgDefs ? pen.svgDefs(p, { emPx }) : { defs: '', groupAttrs: '' };
  const paths = [];
  const misses = [];
  let k = 0;
  for (const it of page.items) {
    if (it.kind === 'miss') {
      misses.push(`<text class="miss" x="${((it.x + 280) * sc).toFixed(1)}" y="${(it.y * sc).toFixed(1)}" font-size="${(0.62 * emPx).toFixed(1)}">` +
        `<title>This hand hasn’t learned ‹${esc(it.ch)}› yet</title>${esc(it.ch)}</text>`);
      continue;
    }
    // one path per pen stroke, each with slightly different ink density:
    // where strokes cross or a pen lifts and lands again, ink builds up like the real thing
    it.g.contours.forEach((c, ci) => {
      const op = pen.strokeOpacity ? pen.strokeOpacity(p, { inkIndex: it.inkIndex, strokeIndex: ci }) : 1;
      const el = `<path fill-opacity="${op.toFixed(2)}" d="${contoursToD([c], it.x * sc, it.y * sc, sc)}"/>`;
      paths.push(opts.strokeIds ? `<g data-k="${k + ci}">${el}</g>` : el);
    });
    k += it.g.contours.length;
  }
  const H = Math.ceil(page.height * sc);
  let rules = '';
  if (opts.rules && page.rules && page.rules.length) {
    const col = typeof opts.rules === 'string' ? opts.rules : 'var(--rule)';
    rules = `<g class="rules" stroke="${col}" stroke-width="1">` +
      page.rules.map((y) => `<line x1="0" x2="${W}" y1="${(y * sc).toFixed(1)}" y2="${(y * sc).toFixed(1)}"/>`).join('') + '</g>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Handwritten text">` +
    `<defs>${look.defs}</defs>${rules}` +
    `<g fill="${opts.ink || 'var(--ink)'}" ${look.groupAttrs}>${paths.join('')}</g>${misses.join('')}</svg>`;
}
