// Determinism + regression.
//  1. Every matrix item rendered twice in a row is byte-identical.
//  2. Rendering the whole matrix in reverse order gives the same hashes (no state leaks between renders).
//  3. A fresh Node process gives the same hashes.
//  4. Rendering never mutates the params object it was given.
//  5. No Math.random / clock / crypto randomness in engine/ (static scan + runtime trap).
//  6. Hashes are compared with tools/qa/baseline.json, per layer (layout / center / outline / svg).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildMatrix, quickMatrix, renderSpec, layerHashes, LAYERS, QA_DIR } from '../engine.mjs';
import { MATRIX_SEEDS } from '../config.mjs';

const snapshot = (p) => JSON.stringify(Object.keys(p).sort().filter((k) => typeof p[k] !== 'function' && typeof p[k] !== 'object').map((k) => [k, p[k]]));

function scanSource(root) {
  const hits = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, f.name);
      if (f.isDirectory()) walk(fp);
      else if (/\.(m?js|ts|tsx|jsx)$/.test(f.name)) {
        const src = fs.readFileSync(fp, 'utf8');
        // strip comments, keeping line numbers
        const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
        code.split('\n').forEach((line, i) => {
          const rel = path.relative(root, fp) + ':' + (i + 1);
          if (/\bMath\s*\.\s*random\b/.test(line)) hits.push({ level: 'fail', where: rel, what: 'Math.random' });
          if (/crypto\s*\.\s*(getRandomValues|randomUUID)/.test(line)) hits.push({ level: 'fail', where: rel, what: 'crypto randomness' });
          if (/\bDate\s*\.\s*now\b|\bnew\s+Date\b|\bperformance\s*\.\s*now\b/.test(line)) hits.push({ level: 'warn', where: rel, what: 'clock read (fine for timing, not for output)' });
        });
      }
    }
  };
  walk(path.join(root, 'engine'));
  return hits;
}

export async function run(ctx) {
  const { E, root } = ctx;
  const problems = [];
  const lines = [];
  const all = buildMatrix(E);
  const specs = ctx.args.quick ? quickMatrix(E, all) : all;

  // runtime trap: count any Math.random / Date.now call made while the engine renders
  const trap = { random: 0, clock: 0, where: [] };
  const origRandom = Math.random, origNow = Date.now;
  Math.random = function () { trap.random++; if (trap.where.length < 3) trap.where.push(new Error().stack.split('\n').slice(2, 4).join(' <- ').trim()); return origRandom(); };
  Date.now = function () { trap.clock++; return origNow(); };

  const fwd = new Map();
  let twiceDiff = [], mutated = [], threw = [], reverseDiff = [];
  try {
    for (const spec of specs) {
      let a, b;
      try {
        a = renderSpec(E, spec);
        const before = snapshot(a.p);
        b = renderSpec(E, spec);
        // re-run layout+render on the same params object and confirm it wasn't touched
        E.renderSVG(a.p, E.layout(a.p, 'mutation probe', {}), { width: 300, emPx: 40 });
        if (snapshot(a.p) !== before) mutated.push(spec.id);
      } catch (e) { threw.push(spec.id + ': ' + (e && e.message)); continue; }
      if (a.svg !== b.svg) twiceDiff.push(spec.id);
      fwd.set(spec.id, layerHashes(a.page, a.svg));
    }
    for (const spec of [...specs].reverse()) {
      if (!fwd.has(spec.id)) continue;
      const r = renderSpec(E, spec);
      const h = layerHashes(r.page, r.svg);
      if (h.svg !== fwd.get(spec.id).svg) reverseDiff.push(spec.id);
    }
  } finally { Math.random = origRandom; Date.now = origNow; }

  const some = (a) => a.slice(0, 3).join(', ') + (a.length > 3 ? ` … (+${a.length - 3})` : '');
  if (threw.length) problems.push({ level: 'fail', msg: `render threw in ${threw.length} items: ${some(threw)}` });
  if (twiceDiff.length) problems.push({ level: 'fail', msg: `${twiceDiff.length} items not byte-identical on a second render: ${some(twiceDiff)}` });
  if (reverseDiff.length) problems.push({ level: 'fail', msg: `${reverseDiff.length} items differ when the matrix is rendered in reverse order (state leaks between renders): ${some(reverseDiff)}` });
  if (mutated.length) problems.push({ level: 'fail', msg: `layout/render mutated the params object in ${mutated.length} items: ${some(mutated)}` });
  if (trap.random) problems.push({ level: 'fail', msg: `Math.random was called ${trap.random}x during rendering: ${trap.where.join(' | ')}` });
  if (trap.clock) problems.push({ level: 'warn', msg: `Date.now was called ${trap.clock}x during rendering` });

  // fresh process
  // one seed's items across every style and pen, plus the long paragraphs
  const sample = specs.filter((s) => s.seed === MATRIX_SEEDS[1] || s.textId === 'paragraph').map((s) => s.id).filter((id) => fwd.has(id));
  try {
    const out = execFileSync(process.execPath, [path.join(QA_DIR, 'lib', 'worker.mjs'), root, ...sample], { maxBuffer: 64 << 20 }).toString();
    const fresh = JSON.parse(out);
    const badIds = sample.filter((id) => !fresh[id] || fresh[id].svg !== fwd.get(id).svg);
    const bad = badIds.length;
    if (bad) problems.push({ level: 'fail', msg: `${bad} items differ when rendered in a fresh process: ${some(badIds)}` });
    lines.push(`fresh-process re-render: ${sample.length - bad}/${sample.length} identical`);
  } catch (e) { problems.push({ level: 'fail', msg: 'fresh-process worker failed: ' + e.message.split('\n')[0] }); }

  for (const h of scanSource(root)) problems.push({ level: h.level, msg: `${h.what} in ${h.where}` });

  lines.unshift(`${specs.length} matrix items${ctx.args.quick ? ` (quick sample of ${all.length})` : ''} · rendered twice: ${specs.length - twiceDiff.length - threw.length} identical · reverse order: ${reverseDiff.length ? reverseDiff.length + ' differ' : 'same'} · Math.random calls: ${trap.random}`);

  // ---------- regression vs baseline ----------
  const base = (ctx.baseline && ctx.baseline.items) || {};
  const cur = {};
  for (const [id, h] of fwd) cur[id] = LAYERS.map((k) => h[k]).join(':');
  const changed = [], added = [], removed = [];
  for (const id in cur) {
    if (!(id in base)) added.push(id);
    else if (base[id] !== cur[id]) {
      const a = base[id].split(':'), b = cur[id].split(':');
      changed.push({ id, layers: LAYERS.filter((_, i) => a[i] !== b[i]) });
    }
  }
  // the quick sample compares only what it rendered, and never writes the baseline (run.mjs refuses --quick --update)
  if (!ctx.args.quick) {
    for (const id in base) if (!(id in cur)) removed.push(id);
    ctx.baselineNext.items = cur;
  }

  const regression = { changed, added, removed, total: Object.keys(cur).length };
  if (!Object.keys(base).length) {
    lines.push('regression: no baseline yet — run with --update to create tools/qa/baseline.json');
    problems.push({ level: 'warn', msg: 'no regression baseline' });
  } else {
    lines.push(`regression vs baseline: ${regression.total - changed.length - added.length} unchanged · ${changed.length} changed · ${added.length} new · ${removed.length} removed`);
    if (changed.length) {
      // group: which layers changed, and where
      const bySig = new Map();
      for (const c of changed) {
        const [style, pen, , text] = c.id.split('/');
        const sig = c.layers.join('+');
        if (!bySig.has(sig)) bySig.set(sig, { n: 0, where: new Map() });
        const g = bySig.get(sig); g.n++;
        const w = `${style}/${pen}/${text}`; g.where.set(w, (g.where.get(w) || 0) + 1);
      }
      for (const [sig, g] of bySig) {
        lines.push(`  changed layers [${sig}] in ${g.n} items: ${[...g.where].slice(0, 12).map(([w, n]) => `${w}×${n}`).join(', ')}${g.where.size > 12 ? ' …' : ''}`);
      }
      lines.push('  (layout = layout.js · center = letters/hand.js · outline = pen.js · svg = render-svg/ink)');
      if (!ctx.update) problems.push({ level: 'fail', msg: `${changed.length} matrix items changed vs baseline — if intentional, run with --update and say why` });
    }
    if (added.length) {
      lines.push(`  new items (not in baseline): ${added.slice(0, 8).join(', ')}${added.length > 8 ? ` … (+${added.length - 8})` : ''}`);
      if (!ctx.update) problems.push({ level: 'warn', msg: `${added.length} new matrix items not in baseline (new style/pen/param?) — run with --update to record them` });
    }
    if (removed.length) {
      lines.push(`  removed items: ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? ' …' : ''}`);
      if (!ctx.update) problems.push({ level: 'warn', msg: `${removed.length} baseline items no longer rendered` });
    }
  }
  return { id: 'determinism', title: 'Determinism & regression', lines, problems, data: { regression, trap } };
}
