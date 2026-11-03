// render-svg.js — a laid-out page -> an SVG string. No DOM needed (works in Node too).
// This is the vector / export path; the live view may use renderCanvas (render-canvas.js). How the ink
// looks (Beer–Lambert colour per pen-down, cores, pools, the pen's edge filter) lives in ink-svg.js;
// this file lays the page out around it.
//
// Two ways to draw a page:
// - renderSVG(p, page, opts): the whole page.
// - for live editing, one group per word run: renderRun(p, page, run, opts) draws a run in its own
//   frame, and runTransform(run, emPx) places it. When the page is laid out again, runChanges(old, new)
//   says which runs to add, remove or just move (same id, new transform), so a keystroke redraws one
//   word instead of the page. A live SVG keeps one runRenderer(p, opts) so ink gradients stay unique.
//   renderSVG(p, page, { runs: true }) emits the same groups.

import { UPM } from './hand.js';
import { inkSVG } from './ink-svg.js';

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

// stroke wrappers: data-k (page-wide stroke count, for playSVG) and/or data-s (itemKey#stroke, stable)
function wrapper(opts) {
  if (!opts.strokeIds && !opts.strokeKeys) return null;
  return (it, ci, k) => [opts.strokeIds ? `data-k="${k}"` : '', opts.strokeKeys && it.key ? `data-s="${it.key}#${ci}"` : ''].filter(Boolean).join(' ') || null;
}

// SVG transform that puts a run's frame on the page: lean, then turn, then move (see layout's place())
export function runTransform(run, emPx) {
  const sc = emPx / UPM;
  return `translate(${(run.x * sc).toFixed(2)} ${(run.y * sc).toFixed(2)}) rotate(${(-run.a / DEG).toFixed(4)}) skewX(${(Math.atan(-run.k) / DEG).toFixed(4)})`;
}

// one word run, drawn with a shared inkSVG instance: <g data-run data-pid transform>…</g>
function runMarkup(ink, page, run, emPx) {
  const sc = emPx / UPM;
  let misses = '';
  for (let i = run.from; i < run.to; i++) {
    const it = page.items[i];
    const [lx, ly] = it.local || [0, 0];
    if (it.kind === 'miss') { misses += missMark(it.ch, (lx + (it.advance || 560) / 2) * sc, -ly * sc, emPx); ink.lift(); continue; }
    ink.item(it, it.glyph || it.g, lx * sc, -ly * sc);
  }
  return `<g data-run="${run.id}" data-pid="${run.pid}" transform="${runTransform(run, emPx)}">${ink.take()}${misses}</g>`;
}

// A renderer for a live SVG: keeps one ink state, so pool gradients drawn at different times keep
// unique ids. opts: { emPx, ink, strokeKeys, strokeIds }
//   const R = runRenderer(p, { emPx, strokeKeys: true });
//   R.run(page, run) -> markup for one run; R.defs() -> <defs> content so far (replace yours with it)
export function runRenderer(p, opts) {
  const ink = inkSVG(p, { emPx: opts.emPx, ink: opts.ink, wrap: wrapper(opts) });
  return { run: (page, run) => runMarkup(ink, page, run, opts.emPx), defs: () => ink.defs(), groupAttrs: ink.groupAttrs };
}

// One word run on its own (its own ink state: use runRenderer for a live SVG with several runs).
// opts: { emPx, ink, strokeKeys (wrap each stroke in <g data-s="itemKey#strokeIndex">) }
export function renderRun(p, page, run, opts) {
  return runRenderer(p, opts).run(page, run);
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

// page: result of layout(); opts: { width (px), emPx (px per em), ink (swatch key, '#rrggbb' or a CSS color),
//   strokeIds (wrap each pen stroke in <g data-k="k"> for playSVG; pen-downs then stay per stroke),
//   strokeKeys (wrap each stroke in <g data-s="itemKey#strokeIndex">, stable across edits),
//   rules (draw the paper's rules for a `ruled` layout, CSS color, default var(--rule)),
//   runs (draw one <g data-run> per word run, as renderRun) }
// The ink sits in <g data-ink …>, so live renderers can add runs to it.
export function renderSVG(p, page, opts) {
  const W = opts.width;
  const emPx = opts.emPx;
  const sc = emPx / UPM;
  const ink = inkSVG(p, { emPx, ink: opts.ink, wrap: wrapper(opts) });
  const misses = [];
  let body = '';
  if (opts.runs && page.runs) {
    for (const run of page.runs) body += runMarkup(ink, page, run, emPx);
    // items outside word runs (correction marks) are drawn where they are, keyed for live updates
    const inRun = new Uint8Array(page.items.length);
    for (const run of page.runs) for (let i = run.from; i < run.to; i++) inRun[i] = 1;
    page.items.forEach((it, i) => {
      if (inRun[i] || it.kind === 'miss' || !it.g) return;
      ink.item(it);
      body += `<g data-item="${it.key || i}">${ink.take()}</g>`;
    });
  } else {
    for (const it of page.items) {
      if (it.kind === 'miss') {
        misses.push(missMark(it.ch, (it.x + (it.advance || 560) / 2) * sc, it.y * sc, emPx));
        ink.lift();
        continue;
      }
      ink.item(it);
    }
    body = ink.take();
  }
  const H = Math.ceil(page.height * sc);
  let rules = '';
  if (opts.rules && (page.ruling || (page.rules && page.rules.length))) {
    // the paper's rules, including any the writer skipped
    const col = typeof opts.rules === 'string' ? opts.rules : 'var(--rule)';
    const ys = [];
    if (page.ruling) { const { first, pitch } = page.ruling; for (let y = first - Math.floor(first / pitch) * pitch; y <= page.height + 1e-6; y += pitch) ys.push(y); }
    else ys.push(...page.rules);
    rules = `<g class="rules" stroke="${col}" stroke-width="1">` +
      ys.map((y) => `<line x1="0" x2="${W}" y1="${(y * sc).toFixed(1)}" y2="${(y * sc).toFixed(1)}"/>`).join('') + '</g>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Handwritten text">` +
    `<defs>${ink.defs()}</defs>${rules}` +
    `<g data-ink="" ${ink.groupAttrs}>${body}</g>${misses.join('')}</svg>`;
}
