// Performance: layout + renderSVG of the ~600-character paragraph, per style and pen.
// Times are medians, and also divided by a fixed CPU calibration loop so a busy or different machine
// doesn't look like a regression. A > 30% slowdown vs baseline is re-measured once before it's flagged.

import os from 'node:os';
import { PARAGRAPH, RENDER, PERF } from '../config.mjs';
import { fmt } from '../util.mjs';

function calibrate() {
  // fixed numeric + allocation workload, similar in spirit to the engine (floats, arrays, strings)
  const t = [];
  for (let k = 0; k < 5; k++) {
    const t0 = performance.now();
    let acc = 0, s = '';
    for (let i = 0; i < 200000; i++) { const a = [Math.sin(i), Math.cos(i * 0.5)]; acc += Math.hypot(a[0], a[1]); if ((i & 1023) === 0) s += acc.toFixed(1); }
    if (s.length < 0) console.log(acc);
    t.push(performance.now() - t0);
  }
  return t.sort((a, b) => a - b)[2];
}

function measure(E, style, pen, iterations) {
  const p = E.withOverrides(E.makeHand('perf-seed-1', style), { pen });
  const opts = { maxWidth: RENDER.width / (RENDER.emPx / 1000), lineHeight: RENDER.lineEm * 1000 };
  const lay = [], ren = [], tot = [];
  let bytes = 0;
  for (let i = 0; i < PERF.warmup + iterations; i++) {
    const t0 = performance.now();
    const page = E.layout(p, PARAGRAPH, opts);
    const t1 = performance.now();
    const svg = E.renderSVG(p, page, { width: RENDER.width, emPx: RENDER.emPx });
    const t2 = performance.now();
    bytes = svg.length;
    if (i >= PERF.warmup) { lay.push(t1 - t0); ren.push(t2 - t1); tot.push(t2 - t0); }
  }
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return { layout: med(lay), render: med(ren), total: med(tot), bytes };
}

export async function run(ctx) {
  const { E } = ctx;
  const problems = [], lines = [], data = { items: {} };
  const calib = calibrate();
  const machine = `${os.cpus()[0] && os.cpus()[0].model} · node ${process.version}`;
  data.calib = calib; data.machine = machine;
  lines.push(`paragraph: ${PARAGRAPH.length} characters at ${RENDER.width}px · calibration loop ${fmt(calib, 1)} ms · ${machine}`);
  const base = (ctx.baseline && ctx.baseline.perf) || null;
  const sameMachine = base && base.machine === machine;
  for (const style of E.styleNames()) {
    for (const pen of Object.keys(E.PENS)) {
      const key = `${style}/${pen}`;
      let m = measure(E, style, pen, PERF.iterations);
      let norm = m.total / calib;
      const b = base && base.items && base.items[key];
      let ratio = b ? norm / b.norm : null;
      if (ratio && ratio > PERF.regressionRatio) { // confirm with a longer run before flagging
        const m2 = measure(E, style, pen, PERF.iterations * 2);
        const c2 = calibrate();
        if (m2.total / c2 < norm) { m = m2; norm = m2.total / c2; ratio = norm / b.norm; }
      }
      data.items[key] = { ms: m.total, layoutMs: m.layout, renderMs: m.render, norm, bytes: m.bytes };
      const vs = b ? ` · vs baseline ${ratio >= 1 ? '+' : ''}${fmt((ratio - 1) * 100, 0)}% (normalised), ${fmt(b.ms, 0)} → ${fmt(m.total, 0)} ms raw` : ' · no baseline';
      lines.push(`${key}: ${fmt(m.total, 1)} ms (layout ${fmt(m.layout, 1)} + render ${fmt(m.render, 1)}) · SVG ${fmt(m.bytes / 1024, 0)} KB${vs}`);
      if (b && ratio > PERF.regressionRatio) problems.push({ level: sameMachine && !ctx.update ? 'fail' : 'warn', msg: `${key} is ${fmt((ratio - 1) * 100, 0)}% slower than baseline (normalised)${sameMachine ? '' : ' — different machine, treat with care'}` });
      if (b && b.bytes && m.bytes / b.bytes > PERF.regressionRatio) problems.push({ level: 'warn', msg: `${key} SVG is ${fmt((m.bytes / b.bytes - 1) * 100, 0)}% larger than baseline (${fmt(b.bytes / 1024, 0)} → ${fmt(m.bytes / 1024, 0)} KB)` });
      if (m.total > 50) problems.push({ level: 'warn', msg: `${key}: ${fmt(m.total, 0)} ms per full re-render of 600 chars — the lab re-renders on every keystroke; > 50 ms feels laggy` });
      if (m.bytes > 500 * 1024) problems.push({ level: 'warn', msg: `${key}: SVG for 600 chars is ${fmt(m.bytes / 1024 / 1024, 1)} MB — heavy for a live web tool and for export` });
    }
  }
  ctx.baselineNext.perf = { machine, calib, items: Object.fromEntries(Object.entries(data.items).map(([k, v]) => [k, { ms: +v.ms.toFixed(2), norm: +v.norm.toFixed(4), bytes: v.bytes }])) };
  if (base && !sameMachine) lines.push(`(baseline was measured on: ${base.machine})`);
  return { id: 'perf', title: 'Performance', lines, problems, data };
}
