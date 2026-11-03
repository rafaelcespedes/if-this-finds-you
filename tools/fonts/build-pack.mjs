#!/usr/bin/env node
// tools/fonts/build-pack.mjs — the curated open-source font pack (docs/FONTS.md).
//
// Picks named writers across all 13 traditions (print and joined, neat to messy, and for joined hands one who
// lifts the pen often), builds each font with the engine's font builder (engine/fontbuild.js), and writes to
// tools/fonts/out/ (gitignored, never published from here):
//   fonts/<Family>/   .otf .ttf .woff2, README.txt, LICENSE.txt, CREDITS.txt, specimen.png, specimen.pdf
//   zips/<Family>.zip the same download the app offers (fonts + README + LICENSE + CREDITS)
//   index.html, overview.png, overview.pdf, manifest.json, README.md, LICENSE.txt
//
//   cd tools/fonts && npm install && node build-pack.mjs              (about 5 minutes)
//   node build-pack.mjs --per=3 --only=palmer,arrighi --no-specimens  (a quick partial run)
// Specimens and the overview are rendered by headless Google Chrome (set CHROME=/path/to/chrome elsewhere).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as E from '../../engine/index.js';
import { buildFontPackage, GF_LATIN_CORE, licenceText } from '../../engine/fontbuild.js';

const require = createRequire(import.meta.url);
const ClipperLib = require('clipper-lib');
const wawoff2 = require('wawoff2');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v == null ? true : v]; }));
const PER = Number(args.per || 6);
const ONLY = args.only ? String(args.only).split(',') : null;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---------- writers' names: the same as the app's (app/src/lib/hands.ts writerName) ----------
const FIRST = [
  'Ada', 'Ottilie', 'Bastien', 'Mirela', 'Ines', 'Tomasz', 'Hugo', 'Wren', 'Linnea', 'Matteo', 'Noor', 'Elif',
  'Anouk', 'Søren', 'Clara', 'Teodor', 'Yara', 'Emil', 'Margit', 'Rosa', 'Felix', 'Ilse', 'Niamh', 'Arlo',
  'Leonie', 'Pilar', 'Henrik', 'Saoirse', 'Jules', 'Mira', 'Oskar', 'Beatrix', 'Amara', 'Kenji', 'Lucia',
  'Viggo', 'Dorothea', 'Idris', 'Hana', 'Magnus', 'Esme', 'Aurelio', 'Signe', 'Thea', 'Casimir', 'Odile',
];
const LAST = [
  'Marsh', 'Lindqvist', 'Moreau', 'Hale', 'Okafor', 'Brandt', 'Castell', 'Novak', 'Ferrante', 'Ashby', 'Halloran',
  'Varga', 'Quint', 'Rowe', 'Sandoval', 'Thorne', 'Weller', 'Bellamy', 'Carver', 'Dunmore', 'Eskildsen', 'Fairley',
  'Gallo', 'Hartmann', 'Ivers', 'Juhl', 'Kessler', 'Lowell', 'Mendes', 'Nyberg', 'Orsini', 'Pryor', 'Sorel',
  'Tamura', 'Ulrich', 'Vance', 'Whitlock', 'Ybarra', 'Zielinski', 'Achterberg', 'Belmonte', 'Kowal', 'Rautio',
];
const ADJECTIVES = ['quiet', 'amber', 'salt', 'misty', 'lunar', 'velvet', 'cedar', 'honey', 'wild', 'copper', 'olive', 'north',
  'soft', 'linen', 'ember', 'fern', 'maple', 'paper', 'still', 'early', 'hollow', 'silver', 'rusty', 'gentle',
  'brisk', 'dusky', 'woolen', 'pale', 'sunday', 'winter', 'tidal', 'mossy', 'flint', 'clover', 'saffron', 'slate'];
const NOUNS = ['heron', 'river', 'harbor', 'sparrow', 'meadow', 'lantern', 'pebble', 'orchard', 'comet', 'thistle', 'willow',
  'canyon', 'garden', 'atlas', 'quill', 'moth', 'tide', 'birch', 'kettle', 'fable', 'finch', 'lark', 'hazel',
  'ferry', 'attic', 'parcel', 'compass', 'marrow', 'juniper', 'inkwell', 'postcard', 'cobble', 'wren', 'harvest'];
const seedFamily = (seed) => seed.trim().toLowerCase().replace(/-?\d+$/, '') || seed.trim().toLowerCase();
const writerName = (seed) => `${E.rng('writer:' + seed.trim().toLowerCase()).pick(FIRST)} ${E.rng('family:' + seedFamily(seed)).pick(LAST)}`;

// ---------- choosing the hands ----------
function candidates(style, n) {
  const r = E.rng('pack:' + style);
  const out = [];
  for (let i = 0; i < n; i++) out.push(`${r.pick(ADJECTIVES)}-${r.pick(NOUNS)}-${10 + Math.floor(r() * 90)}`);
  return [...new Set(out)];
}
function pickHands() {
  const used = new Set();
  const picks = [];
  for (const style of E.styleNames()) {
    if (ONLY && !ONLY.includes(style)) continue;
    const st = E.getStyle(style);
    const joined = !!st.connected;
    const pool = candidates(style, 60).map((seed) => {
      const p = E.makeHand(seed, { style });
      return { seed, style, p, name: writerName(seed), neat: p.neatness, lifts: E.styleDims(p).lifts };
    }).sort((a, b) => a.neat - b.neat);
    const take = (want) => {
      // the free candidate nearest to `want` (a neatness quantile), never a name already in the pack
      let best = null;
      for (const c of pool) if (!used.has(c.name) && (!best || Math.abs(c.neat - want) < Math.abs(best.neat - want))) best = c;
      if (best) { used.add(best.name); picks.push(best); }
    };
    const qs = [0.04, 0.3, 0.55, 0.8, 0.97].slice(0, joined ? Math.max(1, PER - 1) : PER);
    for (const q of qs) take(pool[Math.min(pool.length - 1, Math.floor(q * pool.length))].neat);
    if (joined && PER > 1) {
      // someone who lifts the pen often (print-script habits within a joined tradition). Not the extreme: at the
      // very top of the range some retraced ascenders come apart in the engine itself (reported as a follow-up)
      const lifter = pool.filter((c) => !used.has(c.name) && c.lifts >= 0.35 && c.lifts <= 0.85).sort((a, b) => Math.abs(a.lifts - 0.6) - Math.abs(b.lifts - 0.6))[0];
      if (lifter) { used.add(lifter.name); picks.push(lifter); }
    }
  }
  return picks;
}

// ---------- specimens ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const words = { neat: (v) => (v < 0.25 ? 'scrawled' : v < 0.45 ? 'hurried' : v < 0.65 ? 'relaxed' : v < 0.85 ? 'careful' : 'meticulous') };
const CSS = `
  :root { --paper: #fbf8f1; --ink: #1d2a44; --muted: #7a7466; --rule: #e6dfd0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .label { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
`;
function specimenHTML(m) {
  const first = m.writer.split(' ')[0];
  const charset = GF_LATIN_CORE.filter((c) => !/^\p{M}$/u.test(c) && c.trim()).join(' ');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.family)}</title><style>
  @font-face { font-family: "Hand"; src: url("${esc(m.otfFile)}") format("opentype"); }
  @page { size: 1600px 1130px; margin: 0; }
  ${CSS}
  .page { width: 1600px; height: 1130px; padding: 56px 72px; display: flex; flex-direction: column; gap: 22px; overflow: hidden; }
  .hand { font-family: "Hand"; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--rule); padding-bottom: 14px; }
  h1 { margin: 0; font-weight: 600; font-size: 26px; }
  .name { font-size: 112px; line-height: 1.05; margin: 6px 0 0; }
  .letter { font-size: 46px; line-height: 1.32; }
  .row { display: flex; gap: 48px; }
  .col { flex: 1; min-width: 0; }
  .demo { font-size: 38px; line-height: 1.3; white-space: nowrap; overflow: hidden; }
  .off { font-feature-settings: "calt" 0; }
  .chars { font-size: 27px; line-height: 1.5; word-spacing: 4px; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 28px; font-size: 13.5px; }
  .facts b { display: block; font-weight: 600; }
  footer { margin-top: auto; font-size: 12px; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 10px; }
  </style></head><body><div class="page">
  <header><h1>${esc(m.family)}</h1><span class="label">If This Finds You · open font · SIL OFL 1.1</span></header>
  <div class="hand name">${esc(m.writer)}</div>
  <div class="hand letter">Dear Ada, if this finds you, write back. The quick brown fox still jumps over the lazy dog by the river, and I think of you each time. Yours, ${esc(first)}</div>
  <div class="row">
    <div class="col"><div class="label">Contextual alternates on: ${m.alternates} versions, cycled</div><div class="hand demo">the the the the · Mississippi · letter</div></div>
    <div class="col"><div class="label">Off: one version of each letter</div><div class="hand demo off">the the the the · Mississippi · letter</div></div>
  </div>
  <div><div class="label">GF Latin Core, ${m.characters} characters</div><div class="hand chars">${esc(charset)}</div></div>
  <div class="facts">
    <div><b>Tradition</b>${esc(m.tradition)}</div>
    <div><b>Hand</b>${m.joined ? 'Joined' : 'Print'}, ${words.neat(m.neatness)}${m.lifts > 0.3 ? ', lifts the pen often' : ''}</div>
    <div><b>Pen</b>${esc(m.pen)}</div>
    <div><b>Seed</b>${esc(m.seed)} (${esc(m.style)})</div>
    <div><b>Glyphs</b>${m.glyphs} (${m.forms} letter forms, ${m.kernPairs} kerning pairs)</div>
    <div><b>Files</b>OTF ${m.kb.otf} KB · TTF ${m.kb.ttf} KB · WOFF2 ${m.kb.woff2} KB</div>
    <div><b>Credits</b>${esc(m.creditShort)}</div>
    <div><b>Licence</b>SIL Open Font License 1.1</div>
  </div>
  <footer>The website writes every letter fresh; this font cycles ${m.alternates} versions of each. https://ifthisfindsyou.app</footer>
  </div></body></html>`;
}
function overviewHTML(list) {
  const cards = list.map((m) => `<div class="card">
    <style>@font-face { font-family: "F${m.i}"; src: url("${esc(m.dir)}/${esc(m.otfFile)}") format("opentype"); }</style>
    <div class="top"><b>${esc(m.writer)}</b><span>${esc(m.styleLabel)} · ${m.joined ? 'joined' : 'print'} · ${words.neat(m.neatness)}</span></div>
    <div class="sample" style="font-family: 'F${m.i}'">Dear Ada, if this finds you, write back.</div></div>`).join('\n');
  const rows = Math.ceil(list.length / 3);
  return { rows, html: `<!doctype html><html><head><meta charset="utf-8"><title>If This Finds You: the font pack</title><style>
  @page { size: 1800px ${180 + rows * 172}px; margin: 0; }
  ${CSS}
  .wrap { width: 1800px; padding: 48px 56px; }
  h1 { margin: 0 0 4px; font-size: 30px; font-weight: 600; }
  p.lead { margin: 0 0 24px; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px 28px; }
  .card { border-top: 1px solid var(--rule); padding-top: 10px; height: 154px; overflow: hidden; }
  .top { display: flex; justify-content: space-between; font-size: 13.5px; }
  .top span { color: var(--muted); }
  .sample { font-size: 40px; line-height: 1.3; margin-top: 10px; white-space: nowrap; overflow: hidden; }
  </style></head><body><div class="wrap"><h1>If This Finds You: the font pack</h1>
  <p class="lead">${list.length} fictional writers in 13 handwriting traditions (1522–2023). Free and open: SIL Open Font License 1.1. Each font cycles a few versions of every letter; the website writes every letter fresh.</p>
  <div class="grid">${cards}</div></div></body></html>` };
}
let profileDir = null;
function chrome(htmlPath, png, pdf, w, h) {
  // a throwaway profile outside the repo; a busy machine sometimes makes Chrome fail once, so try again
  if (!profileDir) profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itfy-chrome-'));
  const base = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profileDir}`, '--hide-scrollbars', '--virtual-time-budget=4000', '--allow-file-access-from-files'];
  const url = 'file://' + htmlPath;
  const run = (extra) => {
    for (let t = 0; t < 3; t++) {
      try { execFileSync(CHROME, [...base, ...extra, url], { stdio: 'ignore', timeout: 60000 }); return true; } catch (e) { /* retry */ }
    }
    console.log(`\n  (Chrome could not render ${path.basename(path.dirname(htmlPath))}/${path.basename(htmlPath)})`);
    return false;
  };
  if (png) run([`--window-size=${w},${h}`, `--screenshot=${png}`]);
  if (pdf) run(['--no-pdf-header-footer', `--print-to-pdf=${pdf}`]);
}

// ---------- build ----------
async function main() {
  const t0 = Date.now();
  fs.rmSync(path.join(OUT, 'fonts'), { recursive: true, force: true });
  fs.rmSync(path.join(OUT, 'zips'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'zips'), { recursive: true });
  const hands = pickHands();
  console.log(`${hands.length} hands across ${new Set(hands.map((h) => h.style)).size} traditions`);
  const manifest = [];
  let i = 0;
  for (const h of hands) {
    const pkg = await buildFontPackage(h.p, { name: h.name, clipper: ClipperLib, woff2: (b) => wawoff2.compress(b), clock: () => performance.now() });
    const dirName = pkg.info.file;
    const dir = path.join(OUT, 'fonts', dirName);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of pkg.files) fs.writeFileSync(path.join(dir, path.basename(f.name)), f.data);
    // the same download the app offers (plus the .woff2 for web use)
    fs.writeFileSync(path.join(OUT, 'zips', pkg.filename), pkg.zip);
    const st = E.getStyle(h.style);
    const woff2 = pkg.files.find((f) => f.name.endsWith('.woff2'));
    const groups = pkg.built.credits.groups;
    const m = {
      i: i++, family: pkg.info.family, writer: h.name, seed: h.seed, style: h.style, dir: 'fonts/' + dirName,
      styleLabel: st.label || h.style, tradition: `${st.tradition.name} (${st.tradition.region}, ${st.tradition.era})`,
      joined: pkg.info.joined, neatness: +h.p.neatness.toFixed(2), lifts: +h.lifts.toFixed(2), pen: String((E.getPen(h.p) || {}).label || 'pen'),
      glyphs: pkg.info.glyphs, forms: pkg.info.forms, alternates: pkg.info.alternates, characters: pkg.info.characters, kernPairs: pkg.info.kernPairs,
      otfFile: `${dirName}-Regular.otf`,
      kb: { otf: Math.round(pkg.info.sizes.otf / 1024), ttf: Math.round(pkg.info.sizes.ttf / 1024), woff2: woff2 ? Math.round(woff2.data.length / 1024) : 0, zip: Math.round(pkg.zip.length / 1024) },
      ms: pkg.info.ms.total, ascender: pkg.info.ascender, descender: pkg.info.descender,
      creditShort: [...groups['public-domain'], ...groups['cc-by-4.0']].map((s) => s.name.replace(/,.*$/, '').replace(/ \(.*$/, '')).filter((s, k, a) => a.indexOf(s) === k).slice(0, 3).join('; ') || 'Hershey fonts (1967)',
    };
    manifest.push(m);
    fs.writeFileSync(path.join(dir, 'specimen.html'), specimenHTML(m));
    console.log(`${String(m.i + 1).padStart(3)} ${m.family.padEnd(40)} ${h.style.padEnd(15)} neat ${m.neatness.toFixed(2)} lifts ${m.lifts.toFixed(2)}  ${String(m.glyphs).padStart(4)} glyphs  ${String(m.kb.otf).padStart(4)} KB otf  ${String(m.ms).padStart(5)} ms`);
  }
  // pack files
  fs.writeFileSync(path.join(OUT, 'LICENSE.txt'), licenceText());
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const ov = overviewHTML(manifest);
  fs.writeFileSync(path.join(OUT, 'index.html'), ov.html);
  fs.writeFileSync(path.join(OUT, 'README.md'), packReadme(manifest));
  if (!args['no-specimens']) {
    if (!fs.existsSync(CHROME)) console.log('Chrome not found: skipped the specimen images (set CHROME=...)');
    else {
      for (const m of manifest) {
        const dir = path.join(OUT, m.dir);
        chrome(path.join(dir, 'specimen.html'), path.join(dir, 'specimen.png'), path.join(dir, 'specimen.pdf'), 1600, 1130);
        process.stdout.write('.');
      }
      chrome(path.join(OUT, 'index.html'), path.join(OUT, 'overview.png'), path.join(OUT, 'overview.pdf'), 1800, 180 + ov.rows * 172);
      console.log(' specimens done');
    }
  }
  if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
  const kb = (k) => manifest.reduce((n, m) => n + m.kb[k], 0);
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s: ${manifest.length} fonts, OTF ${(kb('otf') / 1024).toFixed(1)} MB, TTF ${(kb('ttf') / 1024).toFixed(1)} MB, WOFF2 ${(kb('woff2') / 1024).toFixed(1)} MB, zips ${(kb('zip') / 1024).toFixed(1)} MB`);
}

function packReadme(list) {
  const byStyle = new Map();
  for (const m of list) { if (!byStyle.has(m.styleLabel)) byStyle.set(m.styleLabel, []); byStyle.get(m.styleLabel).push(m); }
  const lines = ['# If This Finds You: the font pack', '',
    `${list.length} handwriting fonts, each the hand of a fictional writer from [If This Finds You](https://ifthisfindsyou.app). ` +
    'Every hand is generated from real handwriting traditions (13 of them, 1522–2023) and drawn by its own pen.', '',
    'Free and open: [SIL Open Font License 1.1](LICENSE.txt). Use them, embed them, change them, share them; just don\'t sell the fonts on their own. ' +
    'Each font folder has its own README (how to install), LICENSE and CREDITS (where its letters come from).', '',
    'Each font carries a few versions of every letter and cycles them as you type (contextual alternates, on by default in most apps). ' +
    'The website writes every letter fresh; a font file can only hold a few.', '',
    '| Writer | Tradition | Hand | Files |', '|---|---|---|---|',
    ...list.map((m) => `| [${m.writer}](${m.dir}/) | ${m.tradition} | ${m.joined ? 'joined' : 'print'}, ${words.neat(m.neatness)}${m.lifts > 0.3 ? ', lifts often' : ''} | OTF ${m.kb.otf} KB, TTF ${m.kb.ttf} KB, WOFF2 ${m.kb.woff2} KB |`),
    '', `Built by tools/fonts/build-pack.mjs. Traditions: ${[...byStyle.keys()].join(', ')}.`, ''];
  return lines.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
