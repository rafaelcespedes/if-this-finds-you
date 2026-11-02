// render-svg.js — a laid-out page -> an SVG string. No DOM needed (works in Node too).
// This is the vector / export path; the live view uses renderCanvas (render-canvas.js). How the ink
// looks (Beer–Lambert colour per pen-down, cores, pools, the pen's edge filter) lives in ink-svg.js,
// shared with page-rhythm's per-word renderer; this file only lays the page out around it.

import { UPM } from './hand.js';
import { inkSVG } from './ink-svg.js';

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

// page: result of layout(); opts: { width (px), emPx (px per em), ink (swatch key, '#rrggbb' or a CSS color),
//   strokeIds (wrap each pen stroke in <g data-k="n"> for the write-on animation; pen-downs then stay
//   per stroke instead of merging), rules (draw page.rules as lines; true or a CSS colour) }
export function renderSVG(p, page, opts) {
  const W = opts.width;
  const emPx = opts.emPx;
  const sc = emPx / UPM;
  const ink = inkSVG(p, { emPx, ink: opts.ink, wrap: opts.strokeIds ? (it, ci, k) => `data-k="${k}"` : null });
  const misses = [];
  for (const it of page.items) {
    if (it.kind === 'miss') {
      misses.push(`<text class="miss" x="${((it.x + 280) * sc).toFixed(1)}" y="${(it.y * sc).toFixed(1)}" font-size="${(0.62 * emPx).toFixed(1)}">` +
        `<title>This hand hasn’t learned ‹${esc(it.ch)}› yet</title>${esc(it.ch)}</text>`);
      ink.lift();
      continue;
    }
    ink.item(it);
  }
  const body = ink.take();
  const H = Math.ceil(page.height * sc);
  let rules = '';
  if (opts.rules && page.rules && page.rules.length) {
    const col = typeof opts.rules === 'string' ? opts.rules : 'var(--rule)';
    rules = `<g class="rules" stroke="${col}" stroke-width="1">` +
      page.rules.map((y) => `<line x1="0" x2="${W}" y1="${(y * sc).toFixed(1)}" y2="${(y * sc).toFixed(1)}"/>`).join('') + '</g>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Handwritten text">` +
    `<defs>${ink.defs()}</defs>${rules}` +
    `<g ${ink.groupAttrs}>${body}</g>${misses.join('')}</svg>`;
}
