#!/usr/bin/env node
// tools/smoke/smoke.mjs — opens the built site in a real browser and fails if a page is broken (docs/CHECKS.md).
//
//   cd app && npm run build && cd ..
//   (cd tools/smoke && npm ci)
//   node tools/smoke/smoke.mjs                   serve app/dist the way Vercel does and check it
//   node tools/smoke/smoke.mjs --url=<site>      check a running site instead (a Vercel preview, the live site)
//   SMOKE_CHANNEL=chrome node tools/smoke/…      use the installed Google Chrome (CI does; no browser download)
//
// Pages: / (the desk), /letters (all letters), one letter page (the first card's link; the library shuffles,
// so it varies from run to run and the output names it), /fonts and /about, each at desktop (1440×900) and phone
// (375×812) size, and the earlier Fonts page (/fonts?fonts=old) at desktop size. A page fails when
//   - it logs a console error or throws an uncaught exception
//   - one of its web workers fails (a worker's uncaught error or console error; every `new Worker` is watched)
//   - a request to the site itself fails (4xx / 5xx, or no answer)
//   - it shows one of the site's own failure messages ("The fonts didn't load", FAILURE_TEXTS below)
//   - it stays blank: within 30 s the desk's letter has no handwriting, fewer than 6 letter cards have painted,
//     the letter page has no handwriting, the Fonts page's first hand or 3 more of its specimens haven't drawn in
//     the fonts it made, or About's live line is unwritten
// Screenshots of every page land in tools/smoke/out/ (CI keeps them). Exit code 1 on any failure.
//
// What each page must draw is found by accessible names and links (PAGES below). If a redesign renames one,
// the test says so plainly: update the selector here.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DIST = path.join(ROOT, 'app', 'dist');
const OUT = path.join(HERE, 'out');
const WAIT_MS = 30_000;   // for the first handwriting to appear (the engine loads, a worker draws)
const SETTLE_MS = 1_500;  // after it appears, for late errors

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
// What each page must draw before it counts as working: `sel` finds the things, `need` of them must be drawn.
//   sheet: one element with handwriting (svg paths or a loaded image)    cards: elements each with handwriting
//   fonts: rows whose specimen is set in a font the page loaded itself (or shows a loaded image); with `lead`, that
//          one (the page's first hand) must be drawn too, and `need` counts the rows after it
const PAGES = {
  home: { what: 'the letter on the desk', kind: 'sheet', sel: '[role="group"][aria-label="Letter"]', need: 1 },
  letters: { what: 'letter cards painted', kind: 'cards', sel: 'a[href*="#/letter/"]', need: 6 },
  letter: { what: 'the letter in its hand', kind: 'sheet', sel: '[role="img"][aria-label^="The letter"]', need: 1 },
  // Fonts: the first hand at poster size, then the rest of the set as a list (new/FontsNew.tsx)
  fonts: { what: 'the first hand and font specimens drawn', kind: 'fonts', lead: 'section[aria-label="The first hand in this set"]', sel: 'ol[aria-label="More hands in this set"] > li', need: 3 },
  // the earlier Fonts page, kept behind ?fonts=old for now (FontsApp.tsx): a lighter check, desktop only
  fontsOld: { what: 'font specimens drawn (?fonts=old)', kind: 'fonts', sel: 'ol[aria-label="Fonts"] > li', need: 3 },
  // About: the one line a writer writes live (a figure, captioned with the writer's name)
  about: { what: 'the line written live', kind: 'sheet', sel: 'main figure', need: 1 },
  // the writing app: a fresh note is a blank sheet, so the paper and the editor on it (not strokes) are what count
  write: { what: 'the writing app’s sheet, ready to write on', kind: 'present', sel: '.wr-sheet [data-paper], .wr-sheet canvas', need: 1 },
};
const MIN_STROKES = 20; // svg paths; a found letter has hundreds, an empty sheet none
// the site's own words for "this broke" (a page can fail without throwing)
const FAILURE_TEXTS = [/The (fonts|letters) didn[’']t load/, /couldn[’']t be set as a font here/];

// ---------- a static server for app/dist that behaves like Vercel with cleanUrls (/letters -> letters.html) ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};
function serveDist() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error(`No build found at ${path.relative(process.cwd(), DIST) || DIST}: run "cd app && npm run build" first.`);
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index';
    const candidates = [rel, rel + '.html'];
    for (const c of candidates) {
      const file = path.join(DIST, path.normalize(c));
      if (!file.startsWith(DIST)) break;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
        return;
      }
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------- watching workers: runs in the page before its own scripts ----------
// Every Worker the page starts is recorded with its type; its uncaught errors (a script that doesn't parse, a
// crash while drawing) are kept for the test, which otherwise only sees the page's own errors.
function watchWorkers() {
  const W = window.Worker;
  if (!W) return;
  const seen = (window.__smokeWorkers = { made: [], errors: [] });
  window.Worker = class extends W {
    constructor(url, opts) {
      super(url, opts);
      const who = `${(opts && opts.name) || String(url).split('/').pop()} (${(opts && opts.type) || 'classic'} worker)`;
      seen.made.push(who);
      this.addEventListener('error', (e) => seen.errors.push(`${who}: ${e.message || 'failed to start'}`));
    }
  };
}

// ---------- the probe, run inside the page: has it drawn what it should? ----------
function probePage({ kind, sel, lead, minStrokes, failureTexts }) {
  const written = (el) => el.querySelectorAll('svg path').length >= minStrokes ||
    [...el.querySelectorAll('img')].some((i) => i.complete && i.naturalWidth > 50);
  const els = [...document.querySelectorAll(sel)];
  let count = 0, detail = '', found = els.length > 0;
  if (kind === 'sheet') {
    const el = els[0];
    if (el) {
      const r = el.getBoundingClientRect();
      const strokes = el.querySelectorAll('svg path').length;
      const images = [...el.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth > 50).length;
      count = r.width >= 100 && r.height >= 100 && written(el) ? 1 : 0;
      detail = `${strokes} strokes${images ? `, ${images} images` : ''} (${Math.round(r.width)}×${Math.round(r.height)} px)`;
    }
  } else if (kind === 'present') {
    const big = els.filter((el) => { const r = el.getBoundingClientRect(); return r.width >= 100 && r.height >= 100; });
    count = big.length && document.querySelector('.wr-desk textarea') ? 1 : 0;
    detail = `${big.length} sheet(s), ${document.querySelector('.wr-desk textarea') ? 'with' : 'without'} the editor`;
  } else if (kind === 'cards') {
    count = els.filter(written).length;
    detail = `${count} of ${els.length} cards painted`;
  } else if (kind === 'fonts') {
    const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')));
    const drawn = (li) => [...li.querySelectorAll('[style*="font-family"]')].some((e) => loaded.has(e.style.fontFamily.replace(/["']/g, ''))) ||
      [...li.querySelectorAll('img')].some((i) => i.complete && i.naturalWidth > 50);
    const rows = els.filter(drawn).length;
    const leadEl = lead ? document.querySelector(lead) : null;
    const leadDrawn = !lead || (!!leadEl && drawn(leadEl));
    count = leadDrawn ? rows : 0;
    detail = `${lead ? `first hand ${leadEl ? (leadDrawn ? 'drawn' : 'not drawn') : 'missing'}, ` : ''}${rows} of ${els.length} specimens drawn`;
    if (lead) found = !!leadEl || els.length > 0;
  }
  const text = document.body ? document.body.innerText : '';
  const failures = failureTexts.map((re) => (text.match(new RegExp(re)) || [])[0]).filter(Boolean);
  return { found, count, detail, failures, workers: window.__smokeWorkers || { made: [], errors: [] } };
}

async function checkPage(browser, base, vp, page) {
  const context = await browser.newContext({ ...vp, viewport: vp.viewport, reducedMotion: 'no-preference' });
  await context.addInitScript(watchWorkers);
  const tab = await context.newPage();
  const origin = new URL(base).origin;
  const problems = [];
  let crashed = false;
  tab.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text().slice(0, 300)}`); });
  tab.on('pageerror', (e) => { crashed = true; problems.push(`uncaught exception: ${String(e.stack || e).split('\n').slice(0, 3).join(' | ').slice(0, 300)}`); });
  tab.on('worker', (w) => w.on('console', (m) => { if (m.type() === 'error') problems.push(`worker console error (${w.url().split('/').pop()}): ${m.text().slice(0, 300)}`); }));
  tab.on('response', (r) => { if (r.url().startsWith(origin) && r.status() >= 400) problems.push(`HTTP ${r.status()} for ${r.url().slice(origin.length)}`); });
  tab.on('requestfailed', (r) => {
    const err = r.failure() && r.failure().errorText;
    // a fetch the page itself cancels (navigation, a newer request) is fine
    if (r.url().startsWith(origin) && err !== 'net::ERR_ABORTED') problems.push(`request failed: ${r.url().slice(origin.length)} (${err})`);
  });

  const url = base.replace(/\/$/, '') + page.path;
  const want = PAGES[page.kind];
  const args = { kind: want.kind, sel: want.sel, lead: want.lead || null, minStrokes: MIN_STROKES, failureTexts: FAILURE_TEXTS.map((re) => re.source) };
  let probe = { found: false, count: 0, detail: '', failures: [], workers: { made: [], errors: [] } };
  try {
    const res = await tab.goto(url, { waitUntil: 'load', timeout: WAIT_MS });
    if (!res || !res.ok()) problems.push(`the page itself answered HTTP ${res ? res.status() : 'nothing'}`);
    const t0 = Date.now();
    do {
      probe = await tab.evaluate(probePage, args);
      if (probe.count >= want.need) break;
      // a page that crashed won't recover: give it a few seconds, not the full wait
      if ((crashed || probe.workers.errors.length || probe.failures.length) && Date.now() - t0 > 5_000) break;
      await tab.waitForTimeout(250);
    } while (Date.now() - t0 < WAIT_MS);
    const waited = Math.round((Date.now() - t0) / 1000);
    const broke = crashed || probe.workers.errors.length || probe.failures.length;
    if (!probe.found) problems.push(`blank page: ${want.what}: nothing found after ${waited} s (looked for ${want.lead ? `${want.lead} and ` : ''}${want.sel}${broke ? '' : '; if the page was redesigned, update PAGES in tools/smoke/smoke.mjs'})`);
    else if (probe.count < want.need) problems.push(`blank: ${want.what}: ${probe.detail} after ${waited} s, needs ${want.need}`);
    await tab.waitForTimeout(SETTLE_MS);
    probe = await tab.evaluate(probePage, args).catch(() => probe);
  } catch (e) {
    problems.push(`could not load: ${String(e.message || e).split('\n')[0]}`);
  }
  for (const m of probe.workers.errors) problems.push(`worker failed: ${m.slice(0, 300)}`);
  for (const m of probe.failures) problems.push(`the page says "${m}"`);
  // the letters index hands its first letter to the letter page
  let firstLetter = null;
  if (page.kind === 'letters') {
    firstLetter = await tab.evaluate((sel) => {
      const m = (document.querySelector(sel)?.getAttribute('href') || '').match(/#\/letter\/([^?]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    }, want.sel).catch(() => null);
  }
  const shot = path.join(OUT, `${page.name}-${vp.name}.png`);
  await tab.screenshot({ path: shot }).catch(() => {});
  await context.close();
  return { problems, probe, shot, firstLetter };
}

function firstEnabledLetter() {
  try {
    const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'sample-texts.json'), 'utf8'));
    return (items.find((x) => x && x.id && x.enabled !== false) || {}).id || null;
  } catch { return null; }
}

async function main() {
  const urlArg = process.argv.slice(2).find((a) => a.startsWith('--url='));
  let server = null, base;
  if (urlArg) base = urlArg.slice(6);
  else { server = await serveDist(); base = `http://127.0.0.1:${server.address().port}`; }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const channel = process.env.SMOKE_CHANNEL || undefined;
  let browser;
  try { browser = await chromium.launch({ channel }); }
  catch (e) {
    console.error(`Could not start the browser${channel ? ` (channel ${channel})` : ''}: ${String(e.message || e).split('\n')[0]}`);
    console.error(channel ? 'Install Google Chrome, or unset SMOKE_CHANNEL to use Playwright\'s Chromium.' : 'Run: cd tools/smoke && npx playwright install chromium');
    process.exit(1);
  }
  console.log(`Smoke test · ${base}${server ? ' (app/dist)' : ''} · ${channel || 'chromium'} ${browser.version()}`);

  const results = [];
  for (const vp of VIEWPORTS) {
    let letterId = null;
    const pages = [
      { name: 'home', path: '/', kind: 'home' },
      { name: 'letters', path: '/letters', kind: 'letters' },
      { name: 'letter', path: null, kind: 'letter' },
      { name: 'fonts', path: '/fonts', kind: 'fonts' },
      ...(vp.name === 'desktop' ? [{ name: 'fonts-old', path: '/fonts?fonts=old', kind: 'fontsOld' }] : []),
      { name: 'about', path: '/about', kind: 'about' },
      { name: 'write', path: '/notes', kind: 'write' },
    ];
    for (const page of pages) {
      if (page.kind === 'letter') {
        const id = letterId || firstEnabledLetter();
        if (!id) { results.push({ label: `letter page · ${vp.name}`, problems: ['no letter id to open (no card on /letters, none in content/sample-texts.json)'] }); continue; }
        page.path = `/letters#/letter/${encodeURIComponent(id)}`;
      }
      const t0 = Date.now();
      const r = await checkPage(browser, base, vp, page);
      if (r.firstLetter) letterId = r.firstLetter;
      const label = `${page.path} · ${vp.name}`;
      const detail = r.probe.found ? r.probe.detail : 'nothing found';
      console.log(`${r.problems.length ? '✗ FAIL' : '✓ ok  '}  ${label.padEnd(44)} ${detail.padEnd(36)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      for (const m of [...new Set(r.problems)].slice(0, 12)) console.log(`         ${m}`);
      results.push({ label, problems: r.problems });
    }
  }
  await browser.close();
  if (server) server.close();

  const failed = results.filter((r) => r.problems.length);
  console.log(`\nResult: ${failed.length ? 'FAIL' : 'PASS'} — ${results.length} pages · ${failed.length} failed · screenshots in ${path.relative(process.cwd(), OUT) || OUT}`);
  return failed.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
