// tools/qa/lib/engine.mjs — load the engine under test, render one matrix item, hash it in layers.
//
// The engine is loaded from <root>/engine/index.js. <root> defaults to this checkout, and can point at
// another one (a worktree of a parallel branch) with --root=<path> or QA_ROOT=<path>, so the harness
// on main can measure a branch without copying itself there.

import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RENDER, NARROW_WIDTH, TEXTS, MATRIX_SEEDS, MATRIX_TEXTS } from './config.mjs';

export const QA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveRoot(argv = process.argv) {
  const a = argv.find((x) => x.startsWith('--root='));
  return path.resolve(a ? a.slice(7) : process.env.QA_ROOT || path.join(QA_DIR, '..', '..'));
}

export async function loadEngine(root) {
  return import(pathToFileURL(path.join(root, 'engine', 'index.js')).href);
}

// ---------- rendering (mirrors lab/app.js renderLive) ----------
export function paramsFor(E, spec) {
  const hand = E.makeHand(spec.seed, spec.style);
  const o = Object.assign({}, spec.overrides || {});
  if (spec.pen) o.pen = spec.pen;
  return E.withOverrides(hand, o);
}
export function renderSpec(E, spec) {
  const p = paramsFor(E, spec);
  const width = spec.width || RENDER.width, emPx = spec.emPx || RENDER.emPx;
  const text = spec.text != null ? spec.text : TEXTS[spec.textId];
  const page = E.layout(p, text, { maxWidth: width / (emPx / E.UPM), lineHeight: RENDER.lineEm * E.UPM });
  const svg = E.renderSVG(p, page, { width, emPx });
  return { p, page, svg, width, emPx };
}

// ---------- layered hashes ----------
// layout  = which character goes where (x, y, line) + page height      -> layout.js
// center  = pen paths (stroke centerlines)                             -> glyphs, sources, hand.js
// outline = filled outlines                                            -> pen.js (and everything above)
// svg     = the final SVG string                                       -> render-svg.js, ink (and everything above)
// Comparing layers tells a workstream whether its change stayed inside the part it owns.
const r2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
export function layerHashes(page, svg) {
  const H = { layout: crypto.createHash('sha256'), center: crypto.createHash('sha256'), outline: crypto.createHash('sha256') };
  H.layout.update(r2(page.height) + ';');
  for (const it of page.items) {
    H.layout.update(`${it.kind}:${it.ch}:${r2(it.x)}:${r2(it.y)}:${it.line};`);
    if (it.kind !== 'glyph') continue;
    for (const s of it.g.strokes) {
      let t = s.dot ? 'd' : 's';
      for (const q of s.center) t += r2(q[0]) + ',' + r2(q[1]) + ' ';
      H.center.update(t + '|');
    }
    for (const c of it.g.contours) {
      let t = '';
      for (const q of c) t += r2(q[0]) + ',' + r2(q[1]) + ' ';
      H.outline.update(t + '|');
    }
  }
  const out = {};
  for (const k in H) out[k] = H[k].digest('hex').slice(0, 16);
  out.svg = crypto.createHash('sha256').update(svg).digest('hex').slice(0, 16);
  return out;
}
export const LAYERS = ['layout', 'center', 'outline', 'svg'];

// ---------- the regression matrix ----------
export function buildMatrix(E) {
  const specs = [];
  const pens = Object.keys(E.PENS);
  const add = (s) => {
    const ov = s.overrides && Object.keys(s.overrides).length ? '/' + Object.entries(s.overrides).map(([k, v]) => `${k}=${v}`).join(',') : '';
    s.id = `${s.style}/${s.pen}/${s.seed}/${s.textId}${s.width ? '@' + s.width : ''}${ov}`;
    specs.push(s);
  };
  for (const style of E.styleNames()) {
    for (const pen of pens) {
      for (const seed of MATRIX_SEEDS) for (const textId of MATRIX_TEXTS) add({ style, pen, seed, textId });
      add({ style, pen, seed: MATRIX_SEEDS[0], textId: 'paragraph' });
      for (const seed of MATRIX_SEEDS.slice(0, 2)) add({ style, pen, seed, textId: 'letter', width: NARROW_WIDTH });
    }
    // every user-facing control at both ends of its range (select controls: every option)
    for (const d of E.PARAMS) {
      if (d.key === 'pen') continue; // covered by the pen axis
      const vals = d.type === 'select' ? d.options().map((o) => o.value) : [d.min, d.max];
      for (const v of vals) add({ style, pen: pens[0], seed: MATRIX_SEEDS[0], textId: 'pangram', overrides: { [d.key]: v } });
    }
  }
  return specs;
}

// ---------- the quick sample (--quick; CI runs it on every push, see docs/CHECKS.md) ----------
// Every style writes the Kernel, the paragraph and a phone-width letter with its own pen, and the pangram with
// every pen; then a fixed 1-in-QUICK_EVERY share of everything else, picked by a hash of the item id so the
// sample doesn't shift when items are added. About 6% of the matrix; the full matrix runs nightly.
export const QUICK_EVERY = 30;
export function quickMatrix(E, specs = buildMatrix(E)) {
  const pen0 = Object.keys(E.PENS)[0], seed0 = MATRIX_SEEDS[0];
  const core = (s) => !s.overrides && s.seed === seed0 && (s.textId === 'pangram' ? !s.width :
    s.pen === pen0 && ((s.textId === 'kernel' && !s.width) || s.textId === 'paragraph' || (s.textId === 'letter' && s.width)));
  const sampled = (s) => parseInt(crypto.createHash('sha256').update(s.id).digest('hex').slice(0, 8), 16) % QUICK_EVERY === 0;
  return specs.filter((s) => core(s) || sampled(s));
}
