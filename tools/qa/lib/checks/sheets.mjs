// Visual contact sheets for human and agent review, written to tools/qa/out/ (gitignored).
// Each row is one hand: seed + key params on the left, the engine's own renderSVG output on the right,
// with faint guides at the nominal baselines so baseline wander and line rhythm are easy to judge.
// out/index.html shows every sheet plus the run summary; open it via tools/serve.py:
//   http://127.0.0.1:8765/tools/qa/out/index.html

import fs from 'node:fs';
import path from 'node:path';
import { TEXTS, RENDER, NARROW_WIDTH, RUBRIC_TEXTS, sheetSeeds } from '../config.mjs';
import { paramsFor } from '../engine.mjs';
import { esc, fmt } from '../util.mjs';

const LABEL_W = 210, PAD = 24;
let uid = 0;

// make a renderSVG string nestable: position it, and give its ids (filters, gradients) unique names
function nest(svg, x, y) {
  const n = ++uid;
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of new Set(ids)) {
    const e = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    svg = svg.replace(new RegExp(`id="${e}"`, 'g'), `id="${id}-${n}"`)
      .replace(new RegExp(`url\\(#${e}\\)`, 'g'), `url(#${id}-${n})`)
      .replace(new RegExp(`href="#${e}"`, 'g'), `href="#${id}-${n}"`);
  }
  return svg.replace(/^<svg /, `<svg x="${x}" y="${y}" overflow="visible" `);
}

function paramLine(p) {
  const bits = [`slant ${fmt(p.slant, 1)}°`, `neat ${Math.round(p.neatness * 100)}%`, `xh ${fmt(p.xHeight, 2)}`, `w ${fmt(p.width, 2)}`, `pen ${fmt(p.penWidth, 0)}`, `press ${Math.round(p.pressure * 100)}%`];
  return [bits.slice(0, 3).join(' · '), bits.slice(3).join(' · ')];
}

// rows: [{ spec, label? }] -> one SVG file
function sheet(E, title, rows, file) {
  const parts = [];
  let y = 56;
  let maxW = 0;
  for (const row of rows) {
    const spec = row.spec;
    const p = paramsFor(E, spec);
    const width = spec.width || RENDER.width, emPx = spec.emPx || RENDER.emPx;
    const text = spec.text != null ? spec.text : TEXTS[spec.textId];
    const page = E.layout(p, text, { maxWidth: width / (emPx / E.UPM), lineHeight: RENDER.lineEm * E.UPM });
    const svg = E.renderSVG(p, page, { width, emPx });
    const h = Math.ceil(page.height * emPx / E.UPM);
    const sc = emPx / E.UPM;
    const top = y + 10;
    // nominal baseline guides
    for (let i = 0; i < Math.max(1, page.lines); i++) {
      const by = top + (0.95 + i * RENDER.lineEm) * E.UPM * sc;
      parts.push(`<line x1="${LABEL_W}" x2="${LABEL_W + width}" y1="${by.toFixed(1)}" y2="${by.toFixed(1)}" class="guide"/>`);
    }
    parts.push(`<line x1="${LABEL_W}" x2="${LABEL_W}" y1="${top}" y2="${top + h}" class="margin"/>`);
    const [l1, l2] = paramLine(p);
    parts.push(`<text x="${PAD}" y="${top + 16}" class="seed">${esc(row.label || spec.seed)}</text>` +
      `<text x="${PAD}" y="${top + 32}" class="meta">${esc(`${spec.style} · ${p.pen}${row.note ? ' · ' + row.note : ''}`)}</text>` +
      `<text x="${PAD}" y="${top + 46}" class="meta">${esc(l1)}</text><text x="${PAD}" y="${top + 60}" class="meta">${esc(l2)}</text>` +
      (page.misses.length ? `<text x="${PAD}" y="${top + 74}" class="warn">${page.misses.length} missing: ${esc([...new Set(page.misses)].join(' '))}</text>` : ''));
    parts.push(nest(svg, LABEL_W, top));
    y = top + Math.max(h, 84) + 18;
    parts.push(`<line x1="0" x2="100%" y1="${y - 9}" y2="${y - 9}" class="sep"/>`);
    maxW = Math.max(maxW, width);
  }
  const W = LABEL_W + maxW + PAD;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y + 10}" viewBox="0 0 ${W} ${y + 10}">` +
    `<style>svg{--ink:#1c2233}.seed{font:600 13px ui-monospace,Menlo,monospace;fill:#23211d}.meta{font:11px ui-sans-serif,-apple-system,Helvetica,sans-serif;fill:#77736a}` +
    `.warn{font:11px ui-sans-serif,-apple-system,Helvetica,sans-serif;fill:#a2632a}.title{font:600 15px ui-sans-serif,-apple-system,Helvetica,sans-serif;fill:#23211d}` +
    `.guide{stroke:#d9e3f0;stroke-width:1}.margin{stroke:#f0d9d9;stroke-width:1}.sep{stroke:#e7e1d3;stroke-width:1}` +
    `.miss{fill:#a59f92;font-family:"Bradley Hand","Segoe Print",cursive;text-anchor:middle;font-style:italic;opacity:.75}</style>` +
    `<rect width="100%" height="100%" fill="#fffdf8"/><text x="${PAD}" y="32" class="title">${esc(title)}</text>${parts.join('')}</svg>`;
  fs.writeFileSync(file, out);
  return { file: path.basename(file), title, rows: rows.length, bytes: out.length };
}

// pairs of hands side by side (for "do these look like two different people?")
function pairSheet(E, title, pairs, file, textId) {
  const colW = 460, emPx = 40, parts = [];
  let y = 56;
  for (const [a, b, d] of pairs) {
    let rowH = 0;
    parts.push(`<text x="${PAD}" y="${y + 14}" class="seed">${esc(a)}  ~  ${esc(b)}</text><text x="${PAD + 360}" y="${y + 14}" class="meta">distance ${fmt(d, 2)} JND (variety metric; &lt; 1.5 = near-twins)</text>`);
    [a, b].forEach((seed, i) => {
      const spec = { style: pairs.style, seed, textId, width: colW - 20, emPx };
      const p = paramsFor(E, spec);
      const page = E.layout(p, TEXTS[textId], { maxWidth: spec.width / (emPx / E.UPM), lineHeight: RENDER.lineEm * E.UPM });
      const svg = E.renderSVG(p, page, { width: spec.width, emPx });
      const x = PAD + i * colW;
      const [l1, l2] = paramLine(p);
      parts.push(`<text x="${x}" y="${y + 34}" class="meta">${esc(seed + ' · ' + l1 + ' · ' + l2)}</text>`);
      parts.push(nest(svg, x, y + 40));
      rowH = Math.max(rowH, Math.ceil(page.height * emPx / E.UPM));
    });
    y += rowH + 64;
    parts.push(`<line x1="0" x2="100%" y1="${y - 12}" y2="${y - 12}" class="sep"/>`);
  }
  const W = PAD * 2 + colW * 2;
  fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><style>svg{--ink:#1c2233}.seed{font:600 13px ui-monospace,Menlo,monospace;fill:#23211d}.meta{font:10px ui-sans-serif,-apple-system,Helvetica,sans-serif;fill:#77736a}.title{font:600 15px ui-sans-serif,-apple-system,Helvetica,sans-serif;fill:#23211d}.sep{stroke:#e7e1d3}</style>` +
    `<rect width="100%" height="100%" fill="#fffdf8"/><text x="${PAD}" y="32" class="title">${esc(title)}</text>${parts.join('')}</svg>`);
  return { file: path.basename(file), title, rows: pairs.length };
}

export async function run(ctx) {
  const { E, outDir } = ctx;
  const lines = [], problems = [], files = [];
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.endsWith('.svg')) fs.unlinkSync(path.join(outDir, f));
  const seeds = sheetSeeds(!!ctx.args.freshSeeds);
  const pens = Object.keys(E.PENS);
  const stress = [TEXTS.repeat, TEXTS.prices, TEXTS.caps, TEXTS.punct].join('\n');
  for (const style of E.styleNames()) {
    const S = (name, title, rows) => files.push({ style, ...sheet(E, `${style} — ${title}`, rows, path.join(outDir, `${style}-${name}.svg`)) });
    const rows12 = (extra) => seeds.map((seed) => ({ spec: { style, seed, ...extra } }));
    S('stress', 'stress texts, 12 hands', rows12({ text: stress }));
    S('repeat', 'same letter repeated (large)', rows12({ textId: 'repeat', emPx: 80 }));
    S('paragraph', 'long paragraph (~190 words), 3 hands', seeds.slice(0, 3).map((seed) => ({ spec: { style, seed, textId: 'long' } })));
    S('rubric', 'human-feel.md §8.1 test texts, 12 hands', rows12({ text: RUBRIC_TEXTS.map((t) => TEXTS[t]).join('\n') }));
    S('prices', 'numbers and prices', rows12({ textId: 'prices' }));
    S('caps', 'ALL CAPS', rows12({ textId: 'caps' }));
    S('punct', 'punctuation and quotes', rows12({ textId: 'punct' }));
    S('kernel', 'full GF Latin Kernel', rows12({ textId: 'kernel' }));
    S('mobile', `phone width (${NARROW_WIDTH}px)`, seeds.slice(0, 4).map((seed) => ({ spec: { style, seed, textId: 'letter', width: NARROW_WIDTH } })));
    S('accents', 'Tier 2 text (accents) and hostile input', seeds.slice(0, 4).flatMap((seed) => [{ spec: { style, seed, textId: 'accents' } }, { spec: { style, seed, textId: 'edge' } }]));
    S('pens', 'every pen', seeds.slice(0, 4).flatMap((seed) => pens.map((pen) => ({ spec: { style, seed, pen, textId: 'pangram' }, note: 'pen=' + pen }))));
    const ext = [];
    for (const d of E.PARAMS) {
      if (d.type === 'select') continue;
      for (const v of [d.min, d.max]) ext.push({ spec: { style, seed: seeds[0], textId: 'pangram', overrides: { [d.key]: v } }, label: `${d.label} = ${v}`, note: seeds[0] });
    }
    S('extremes', 'every control at both ends of its range', ext);
    const cp = ctx.shared.closestPairs && ctx.shared.closestPairs[style];
    if (cp) { const pairs = cp.slice(); pairs.style = style; files.push({ style, ...pairSheet(E, `${style} — the most similar pairs of hands (variety check): do they look like two different people?`, pairs, path.join(outDir, `${style}-closest.svg`), 'letter') }); }
    S('closeup', 'close-up: ink, stroke ends, joins, dots (1 em = 220 px)', seeds.slice(0, 2).map((seed) => ({ spec: { style, seed, text: 'minimum mummy\nDon’t 1111 tilt', width: 1100, emPx: 220 } })));
  }
  ctx.shared.sheets = files;
  lines.push(`${files.length} sheets in ${path.relative(process.cwd(), outDir) || outDir}/ · seeds: ${seeds.join(', ')}`);
  lines.push(`view: python3 tools/serve.py 8765 → http://127.0.0.1:8765/tools/qa/out/index.html`);
  return { id: 'sheets', title: 'Visual contact sheets', lines, problems, data: { files, seeds } };
}
