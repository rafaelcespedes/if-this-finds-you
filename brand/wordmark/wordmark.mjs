// wordmark.mjs — set short phrases (a wordmark) in engine hands as clean, tightly cropped SVG.
// Uses only the public engine API (makeHand, withOverrides, layout, renderSVG); nothing in engine/ changes.
//
//   const svg = wordmark([{ runs: [{ text: 'If This Finds You', hand: { seed, style, pen } }] }], { id: 'w7' });
//
// A wordmark is lines; a line is runs written one after another (a run can be a different hand or size).
//   hand: { seed, style, pen?, tip?, ink?, slant?, neatness?, hurry?, penWidth?, pressure?, salt? }
//   run:  { text, hand, size? (1 = the hand's own), gap? (em before this run), dy? (em, baseline shift) }
//   line: { runs, indent? (em), leading? (em from the previous baseline) }
// opts: { id (makes ids unique when many SVGs share a page), ink ('#rrggbb' to model real ink,
//         'currentColor' for a one-colour mark), pad (em) }

import * as E from '../../engine/index.js';

const EM = 100;                   // px per em while rendering; the output is vector, so this is just a unit

export function handOf(h) {
  const base = E.makeHand(h.seed, { style: h.style });
  const o = {};
  for (const k of ['pen', 'tip', 'slant', 'neatness', 'hurry', 'penWidth', 'pressure', 'blend', 'size', 'inkVariation', 'lineWander'])
    if (h[k] !== undefined) o[k] = h[k];
  return E.withOverrides(base, o);
}

// one run -> { defs, body, box: [x0, y0, x1, y1] px with the baseline at y = 0, the first glyph's pen x at 0 }
function renderRun(run, ink, uid) {
  const p = handOf(run.hand);
  const size = run.size || 1;
  const page = E.layout(p, run.text, { maxWidth: 60000, salt: run.hand.salt });
  const first = page.items.find((it) => it.kind === 'glyph') || page.items[0];
  const emPx = EM * size;
  const sc = emPx / E.UPM;
  const W = Math.ceil((page.width || 60000) * sc);
  let svg = E.renderSVG(p, page, { width: W, emPx, ink: run.hand.ink || ink });
  svg = svg.replace(/\b(inkEdge|pool\d+)\b/g, `${uid}-$1`);
  const defs = (svg.match(/<defs>([\s\S]*?)<\/defs>/) || ['', ''])[1];
  const body = svg.slice(svg.indexOf('<g data-ink'), svg.lastIndexOf('</svg>'));
  // tight box from the path data (ink pools sit inside strokes)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of body.matchAll(/ d="([^"]+)"/g)) {
    const nums = m[1].match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i], y = nums[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const ox = first.x * sc, oy = first.y * sc;          // first glyph's origin on its baseline
  return { defs, body, ox, oy, box: [x0 - ox, y0 - oy, x1 - ox, y1 - oy], p };
}

export function wordmark(lines, opts = {}) {
  const id = opts.id || 'w';
  const ink = opts.ink || '#1c2233';
  const pad = (opts.pad ?? 0.12) * EM;
  let defs = '', body = '', k = 0;
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  let baseline = 0;
  lines.forEach((line, li) => {
    if (li > 0) baseline += (line.leading ?? 1.05) * EM;
    let x = (line.indent || 0) * EM;
    line.runs.forEach((run, ri) => {
      const r = renderRun(run, ink, `${id}-${k++}`);
      if (ri > 0) x += (run.gap ?? 0.28) * EM - r.box[0];
      const y = baseline + (run.dy || 0) * EM;
      const tx = x - r.ox, ty = y - r.oy;
      defs += r.defs;
      body += `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)})">${r.body}</g>`;
      X0 = Math.min(X0, x + r.box[0]); X1 = Math.max(X1, x + r.box[2]);
      Y0 = Math.min(Y0, y + r.box[1]); Y1 = Math.max(Y1, y + r.box[3]);
      x += r.box[2];
    });
  });
  const vx = X0 - pad, vy = Y0 - pad, vw = X1 - X0 + 2 * pad, vh = Y1 - Y0 + 2 * pad;
  const label = opts.label || lines.map((l) => l.runs.map((r) => r.text).join(' ')).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" role="img" aria-label="${label}">` +
    `<defs>${defs}</defs>${body}</svg>`;
}

// handy shapes
export const oneLine = (text, hand) => [{ runs: [{ text, hand }] }];
