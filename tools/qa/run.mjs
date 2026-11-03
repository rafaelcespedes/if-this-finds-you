#!/usr/bin/env node
// tools/qa/run.mjs — the QA harness for the handwriting engine. Plain Node (>= 18), no installs.
//
//   node tools/qa/run.mjs                 run every check, write sheets to tools/qa/out/
//   node tools/qa/run.mjs --update        accept the current output as the new baseline (hashes + perf)
//   node tools/qa/run.mjs --only=determinism,geometry      run some checks
//   node tools/qa/run.mjs --skip=sheets,variety            skip some checks
//   node tools/qa/run.mjs --quick         fewer seeds in variety/feel (for quick iteration)
//   node tools/qa/run.mjs --fresh-seeds   contact sheets with 12 new random seeds (printed on the sheets)
//   node tools/qa/run.mjs --root=../wt    test the engine in another checkout (e.g. a branch worktree)
//   node tools/qa/regress.mjs             the fast gate: determinism, regression, coverage, contracts, geometry
//
// Checks: determinism (+ regression vs baseline.json), coverage, contracts, geometry, perf, variety,
//         feel (human-feel proxies), sheets (SVG contact sheets).
// Exit code 1 if any check FAILS. WARN never fails the run; it is for human judgement. Failures recorded in
// baseline.json knownFailures print as KNOWN and do not fail the run unless they get worse.
// Output: console summary, tools/qa/out/summary.txt, out/results.json, out/index.html (sheets gallery).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveRoot, loadEngine, QA_DIR } from './lib/engine.mjs';
import { esc } from './lib/util.mjs';

const CHECKS = ['determinism', 'coverage', 'contracts', 'geometry', 'proportions', 'perf', 'variety', 'feel', 'sheets'];
const BASELINE = path.join(QA_DIR, 'baseline.json');

function parseArgs(argv) {
  const a = { update: false, quick: false, freshSeeds: false, json: false, only: null, skip: [] };
  for (const x of argv) {
    if (x === '--update') a.update = true;
    else if (x === '--quick') a.quick = true;
    else if (x === '--fresh-seeds') a.freshSeeds = true;
    else if (x === '--json') a.json = true;
    else if (x.startsWith('--only=')) a.only = x.slice(7).split(',').filter(Boolean);
    else if (x.startsWith('--skip=')) a.skip = x.slice(7).split(',').filter(Boolean);
    else if (x === '--help' || x === '-h') a.help = true;
  }
  return a;
}

function readBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { return null; }
}
// One matrix item per line, sorted, so parallel branches merge baseline changes line by line.
function writeBaseline(b) {
  const items = Object.keys(b.items || {}).sort().map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(b.items[k])}`);
  const perfItems = Object.keys((b.perf && b.perf.items) || {}).sort().map((k) => `      ${JSON.stringify(k)}: ${JSON.stringify(b.perf.items[k])}`);
  const txt = '{\n' +
    `  "about": ${JSON.stringify('QA baseline for tools/qa/run.mjs. items: layout:center:outline:svg hashes per matrix item. knownFailures: failures accepted when the baseline was taken (key: count); they print as KNOWN, and only new or worse ones fail. Regenerate with node tools/qa/run.mjs --update, and say why in the commit.')},\n` +
    `  "updated": ${JSON.stringify(b.updated)},\n  "engineCommit": ${JSON.stringify(b.engineCommit)},\n` +
    `  "perf": {\n    "machine": ${JSON.stringify(b.perf ? b.perf.machine : null)},\n    "calib": ${JSON.stringify(b.perf ? +(+b.perf.calib).toFixed(3) : null)},\n    "items": {\n${perfItems.join(',\n')}\n    }\n  },\n` +
    `  "knownFailures": {\n${Object.keys(b.knownFailures || {}).sort().map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(b.knownFailures[k])}`).join(',\n')}\n  },\n` +
    `  "items": {\n${items.join(',\n')}\n  }\n}\n`;
  fs.writeFileSync(BASELINE, txt);
}

const ICON = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
const statusOf = (r) => (r.problems.some((p) => p.level === 'fail') ? 'fail' : r.problems.some((p) => p.level === 'warn' || p.level === 'known') ? 'warn' : 'pass');
// A failure's identity: an explicit key from the check, else its message with seeds, numbers and examples removed.
const failKey = (id, p) => id + '|' + (p.key || p.msg.replace(/[a-z]+-[a-z]+-\d+/g, '<seed>').split(/: (?=\S)/).slice(0, 2).join(': ').replace(/-?\d+(\.\d+)?/g, '#').slice(0, 120));
const failCount = (p) => (Number.isFinite(p.count) ? p.count : 1);
const LABEL = { fail: '✗ FAIL', warn: '! warn', known: '~ KNOWN' };

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); return 0; }
  const root = resolveRoot(argv);
  const outDir = path.join(QA_DIR, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  let E;
  try { E = await loadEngine(root); } catch (e) { console.error('FAIL: the engine did not load: ' + (e.stack || e)); return 1; }
  const baseline = readBaseline();
  let commit = null;
  try { commit = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h %s'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  const ctx = { E, root, args, outDir, baseline, update: args.update, shared: {},
    baselineNext: Object.assign({ items: {}, perf: null }, baseline || {}) };

  const selected = CHECKS.filter((c) => (!args.only || args.only.includes(c)) && !args.skip.includes(c));
  const results = [];
  const out = [];
  const log = (s = '') => { out.push(s); if (!args.json) console.log(s); };
  log(`Seedhand QA · engine ${path.relative(process.cwd(), root) || '.'} · ${commit || 'no git info'} · styles: ${E.styleNames().join(', ')} · pens: ${Object.keys(E.PENS).join(', ')}`);
  for (const id of selected) {
    const t0 = Date.now();
    let r;
    try {
      const mod = await import(`./lib/checks/${id}.mjs`);
      r = await mod.run(ctx);
    } catch (e) {
      r = { id, title: id, lines: [], problems: [{ level: 'fail', msg: `check crashed: ${(e && e.stack) || e}` }], data: {} };
    }
    // failures already accepted in the baseline print as KNOWN; only new or worse ones fail
    const known = (baseline && baseline.knownFailures) || {};
    for (const p of r.problems) {
      if (p.level !== 'fail') continue;
      const k = failKey(id, p);
      if (!args.update && k in known && failCount(p) <= known[k]) p.level = 'known';
    }
    r.status = statusOf(r);
    r.seconds = (Date.now() - t0) / 1000;
    results.push(r);
    log('');
    log(`── ${ICON[r.status]} · ${r.title} (${r.seconds.toFixed(1)}s)`);
    for (const l of r.lines) log('  ' + l.replace(/\n/g, '\n  '));
    const rank = { fail: 0, known: 1, warn: 2 };
    const sorted = [...r.problems].sort((a, b) => rank[a.level] - rank[b.level]);
    for (const p of sorted.slice(0, 25)) log(`  ${LABEL[p.level] || p.level}  ${p.msg}`);
    if (sorted.length > 25) log(`  … ${sorted.length - 25} more in tools/qa/out/results.json`);
  }
  const fails = results.filter((r) => r.status === 'fail').length, warns = results.filter((r) => r.status === 'warn').length;
  const knownN = results.reduce((n, r) => n + r.problems.filter((p) => p.level === 'known').length, 0);
  log('');
  log(`Result: ${fails ? 'FAIL' : 'PASS'} — ${results.length} checks · ${fails} failed · ${warns} with warnings · ${results.length - fails - warns} clean` +
    (knownN ? ` · ${knownN} known failures still open (see baseline.json knownFailures)` : ''));

  if (args.update) {
    // record today's failures as known; keep known entries of checks that didn't run this time
    const next = {};
    for (const [k, v] of Object.entries((baseline && baseline.knownFailures) || {})) if (!selected.includes(k.split('|')[0])) next[k] = v;
    for (const r of results) for (const p of r.problems) if (p.level === 'fail') next[failKey(r.id, p)] = Math.max(next[failKey(r.id, p)] || 0, failCount(p));
    ctx.baselineNext.knownFailures = next;
    if (Object.keys(next).length) log(`Recorded ${Object.keys(next).length} known failures in the baseline (they will print as KNOWN until fixed).`);
    ctx.baselineNext.updated = new Date().toISOString().slice(0, 10);
    ctx.baselineNext.engineCommit = commit;
    writeBaseline(ctx.baselineNext);
    log(`Baseline written: ${path.relative(process.cwd(), BASELINE)} (${Object.keys(ctx.baselineNext.items || {}).length} items${ctx.baselineNext.perf ? ', perf' : ''})`);
  }

  const summary = out.join('\n');
  fs.writeFileSync(path.join(outDir, 'summary.txt'), summary + '\n');
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ commit, root, args, results: results.map((r) => ({ id: r.id, title: r.title, status: r.status, seconds: r.seconds, lines: r.lines, problems: r.problems, data: r.data })) }, null, 1));
  writeIndex(outDir, summary, ctx.shared.sheets || listSheets(outDir));
  if (args.json) console.log(JSON.stringify({ status: fails ? 'fail' : 'pass', checks: results.map((r) => ({ id: r.id, status: r.status, problems: r.problems })) }, null, 1));
  return fails ? 1 : 0;
}

function listSheets(outDir) {
  return fs.readdirSync(outDir).filter((f) => f.endsWith('.svg')).sort().map((f) => ({ file: f, title: f.replace(/\.svg$/, ''), style: f.split('-')[0] }));
}
function writeIndex(outDir, summary, sheets) {
  const byStyle = new Map();
  for (const s of sheets) { if (!byStyle.has(s.style)) byStyle.set(s.style, []); byStyle.get(s.style).push(s); }
  const nav = sheets.map((s) => `<a href="#${esc(s.file)}">${esc(s.title)}</a>`).join('');
  const body = [...byStyle].map(([style, list]) => `<h2>${esc(style)}</h2>` + list.map((s) =>
    `<section id="${esc(s.file)}"><h3>${esc(s.title)} <a href="${esc(s.file)}" target="_blank">open</a></h3><img loading="lazy" src="${esc(s.file)}" alt="${esc(s.title)}"></section>`).join('')).join('');
  fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seedhand QA</title>
<style>:root{color-scheme:light}body{margin:0;background:#eeebe4;color:#23211d;font:14px/1.45 ui-sans-serif,-apple-system,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px}pre{background:#fffdf8;padding:16px;border-radius:6px;overflow:auto;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap}
nav{display:flex;flex-wrap:wrap;gap:6px 12px;margin:12px 0 24px}nav a{color:#77736a;font-size:12px}
section{margin:0 0 28px}h3{font-size:13px;font-weight:600;color:#77736a;margin:0 0 8px}h3 a{font-weight:400;margin-left:8px;color:#77736a}
img{display:block;width:100%;height:auto;background:#fffdf8;border-radius:4px;box-shadow:0 1px 0 #0000000d}</style></head>
<body><main><h1>Seedhand QA</h1><nav>${nav}</nav><details open><summary>Run summary</summary><pre>${esc(summary)}</pre></details>${body}</main></body></html>`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}
