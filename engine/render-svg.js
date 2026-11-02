// render-svg.js — a laid-out page -> an SVG string. No DOM needed (works in Node too).
//
// Two ways to draw a page:
// - renderSVG(p, page, opts): the whole page.
// - for live editing, one group per word run: renderRun(p, page, run, opts) draws a run in its own
//   frame, and runTransform(run, emPx) places it. When the page is laid out again, runChanges(old, new)
//   says which runs to add, remove or just move (same id, new transform), so a keystroke redraws one
//   word instead of the page. renderSVG(p, page, { runs: true }) emits the same groups.

import { UPM } from './hand.js';
import { getPen } from './pen.js';

const DEG = Math.PI / 180;

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
const missMark = (ch, x, y, emPx) => `<text class="miss" x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${(0.62 * emPx).toFixed(1)}">` +
  `<title>This hand hasn’t learned ‹${esc(ch)}› yet</title>${esc(ch)}</text>`;

// SVG transform that puts a run's frame on the page: lean, then turn, then move (see layout's place())
export function runTransform(run, emPx) {
  const sc = emPx / UPM;
  return `translate(${(run.x * sc).toFixed(2)} ${(run.y * sc).toFixed(2)}) rotate(${(-run.a / DEG).toFixed(4)}) skewX(${(Math.atan(-run.k) / DEG).toFixed(4)})`;
}

// one word run as <g data-run data-pid transform>…</g>, its letters drawn in the run's own frame.
// opts: { emPx, strokeKeys (wrap each stroke in <g data-s="itemKey#strokeIndex">) }
export function renderRun(p, page, run, opts) {
  const sc = opts.emPx / UPM;
  const pen = getPen(p);
  let out = '';
  for (let i = run.from; i < run.to; i++) {
    const it = page.items[i];
    const [lx, ly] = it.local || [0, 0];
    if (it.kind === 'miss') { out += missMark(it.ch, (lx + (it.advance || 560) / 2) * sc, -ly * sc, opts.emPx); continue; }
    const g = it.glyph || it.g;
    g.contours.forEach((c, ci) => {
      const op = pen.strokeOpacity ? pen.strokeOpacity(p, { inkIndex: it.inkIndex, strokeIndex: ci }) : 1;
      const el = `<path fill-opacity="${op.toFixed(2)}" d="${contoursToD([c], lx * sc, -ly * sc, sc)}"/>`;
      out += opts.strokeKeys ? `<g data-s="${it.key}#${ci}">${el}</g>` : el;
    });
  }
  return `<g data-run="${run.id}" data-pid="${run.pid}" transform="${runTransform(run, opts.emPx)}">${out}</g>`;
}

// What changed between two layouts of the same page, by run: { add: runs to draw, move: runs whose
// drawing is unchanged but whose place moved (update the transform), remove: ids to delete, keep: ids }
export function runChanges(prev, next) {
  const before = new Map((prev ? prev.runs : []).map((r) => [r.id, r]));
  const add = [], move = [], keep = [];
  const seen = new Set();
  for (const r of next.runs) {
    seen.add(r.id);
    const o = before.get(r.id);
    if (!o) add.push(r);
    else if (o.pid !== r.pid) move.push(r);
    else keep.push(r.id);
  }
  const remove = [...before.keys()].filter((id) => !seen.has(id));
  return { add, move, remove, keep };
}

// page: result of layout(); opts: { width (px), emPx (px per em), ink (CSS color, default var(--ink)),
//   strokeIds (wrap each pen stroke in <g data-k="k"> for the writing animation; k counts g.strokes
//              across the page in item order, see animate.js),
//   rules (draw the paper's rules for a `ruled` layout, CSS color, default var(--rule)),
//   runs (draw one <g data-run> per word run, as renderRun; with strokeKeys for stable stroke ids) }
export function renderSVG(p, page, opts) {
  const W = opts.width;
  const emPx = opts.emPx;
  const sc = emPx / UPM;
  const pen = getPen(p);
  const look = pen.svgDefs ? pen.svgDefs(p, { emPx }) : { defs: '', groupAttrs: '' };
  const paths = [];
  const misses = [];
  let k = 0;
  if (opts.runs && page.runs) for (const run of page.runs) paths.push(renderRun(p, page, run, opts));
  else for (const it of page.items) {
    if (it.kind === 'miss') {
      misses.push(missMark(it.ch, (it.x + (it.advance || 560) / 2) * sc, it.y * sc, emPx));
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
  if (opts.rules && page.ruling) {
    // the paper's rules, including any the writer skipped
    const col = typeof opts.rules === 'string' ? opts.rules : 'var(--rule)';
    const { first, pitch } = page.ruling, ys = [];
    for (let y = first - Math.floor(first / pitch) * pitch; y <= page.height + 1e-6; y += pitch) ys.push(y);
    rules = `<g class="rules" stroke="${col}" stroke-width="1">` +
      ys.map((y) => `<line x1="0" x2="${W}" y1="${(y * sc).toFixed(1)}" y2="${(y * sc).toFixed(1)}"/>`).join('') + '</g>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Handwritten text">` +
    `<defs>${look.defs}</defs>${rules}` +
    `<g fill="${opts.ink || 'var(--ink)'}" ${look.groupAttrs}>${paths.join('')}</g>${misses.join('')}</svg>`;
}
