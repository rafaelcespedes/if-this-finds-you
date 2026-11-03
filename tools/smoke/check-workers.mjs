#!/usr/bin/env node
// tools/smoke/check-workers.mjs — every `new Worker(` in app/src must start its worker the way the build makes it.
//
//   node tools/smoke/check-workers.mjs        exit 1 on a mismatch (CI runs it before the build; plain Node, no installs)
//
// app/vite.config.ts `worker: { format: 'es' }` builds workers as ES modules. Started as { type: 'classic' } (or with no
// type, which means classic), such a worker fails in production with "Unexpected token 'export'" while `npm run dev`
// still works, because dev always serves modules. That broke the Fonts page and the All letters cards on 3 Nov 2026
// (4334773, fixed in 3d0afb9). With the default format ('iife') both types load, so nothing is checked.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'app');

// comments blanked out, line numbers kept
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

const config = code(fs.readFileSync(path.join(APP, 'vite.config.ts'), 'utf8'));
const m = config.match(/\bworker\s*:\s*\{[\s\S]{0,600}?\bformat\s*:\s*['"](\w+)['"]/);
const format = m ? m[1] : 'iife';
if (format !== 'es') {
  console.log(`Workers: the build makes '${format}' workers, which load as classic or module workers alike. Nothing to check.`);
  process.exit(0);
}

const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(m?[jt]sx?)$/.test(f.name)) files.push(p);
  }
};
walk(path.join(APP, 'src'));

// the text of the call starting at `start` (the "(" after new Worker), up to its closing parenthesis
function callText(src, start) {
  let depth = 0, quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

const bad = [], ok = [];
for (const file of files) {
  const src = code(fs.readFileSync(file, 'utf8'));
  for (const hit of src.matchAll(/\bnew\s+(?:Shared)?Worker\s*\(/g)) {
    const call = callText(src, hit.index + hit[0].length - 1);
    const where = `${path.relative(ROOT, file)}:${src.slice(0, hit.index).split('\n').length}`;
    const isModule = /\btype\s*:\s*['"]module['"]/.test(call) && !/['"]classic['"]/.test(call);
    (isModule ? ok : bad).push(`${where}  ${call.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
}

if (bad.length) {
  console.log(`Workers: the build makes ES-module workers (vite.config.ts worker.format 'es'), but ${bad.length} start as classic:`);
  for (const b of bad) console.log(`  ✗ ${b}`);
  console.log(`They fail in production with "Unexpected token 'export'". Give each { type: 'module' } (in dev and in the build).`);
  process.exit(1);
}
console.log(`Workers: all ${ok.length} start as modules, matching the build's ES-module workers.`);
