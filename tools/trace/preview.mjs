#!/usr/bin/env node
// tools/trace/preview.mjs — render traced styles through the real engine, large, for several seeds.
//   node tools/trace/preview.mjs palmer [suetterlin ...] [--seeds 4] [--text "..."]
// Writes tools/trace/out/preview.html (open it through tools/serve.py: /tools/trace/out/preview.html).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const E = await import(pathToFileURL(path.join(root, 'engine', 'index.js')).href);

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const styles = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const nSeeds = +opt('--seeds', 3);
const SEEDS = ['maple-river-42', 'quiet-heron-17', 'amber-comet-88', 'ink-moth-51', 'linen-fox-3', 'cedar-wren-90'].slice(0, nSeeds);
const TEXT = opt('--text', 'Dear Ada,\nthe little letters never quite match, and that is the point.\nSee you at 7:30 - bring the old maps & a good pen!\nThe quick brown fox jumps over the lazy dog. 0123456789\nABCDEFGHIJKLM NOPQRSTUVWXYZ\nabcdefghijklm nopqrstuvwxyz');

let body = '';
for (const style of (styles.length ? styles : E.styleNames())) {
  const st = E.getStyle(style);
  body += `<h2>${st.label} <small>${style} · ${st.family} · ${st.tradition ? st.tradition.name + ', ' + st.tradition.era : ''}</small></h2>`;
  for (const seed of SEEDS) {
    const p = E.makeHand(seed, style);
    const width = 1500, emPx = 64;
    const page = E.layout(p, TEXT, { maxWidth: width / (emPx / E.UPM), lineHeight: 1.6 * E.UPM });
    const svg = E.renderSVG(p, page, { width, emPx });
    const miss = page.misses.length ? ` · missing: ${[...new Set(page.misses)].join(' ')}` : '';
    body += `<section><h3>${seed} · slant ${p.slant.toFixed(1)}° · neatness ${(p.neatness * 100).toFixed(0)}%${miss}</h3>${svg}</section>`;
  }
}
const html = `<!doctype html><meta charset="utf-8"><title>Trace preview</title>
<style>body{margin:16px;background:#eeebe4;font:13px ui-sans-serif,-apple-system,sans-serif;color:#23211d}
h2{margin:28px 0 8px}h2 small{font-weight:400;color:#77736a}h3{font-weight:500;color:#77736a;margin:12px 0 4px}
section svg{background:#fffdf8;display:block;width:1500px;height:auto;border-radius:4px}</style>${body}`;
const out = path.join(here, 'out', 'preview.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out);
