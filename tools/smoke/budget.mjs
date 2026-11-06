#!/usr/bin/env node
// tools/smoke/budget.mjs — the writing page's speed budget (docs/WRITING.md), measured on the built site.
//
//   cd app && npm run build && cd ..
//   (cd tools/smoke && npm ci)
//   node tools/smoke/budget.mjs                     serve app/dist with `npx vite preview` and measure /write
//   node tools/smoke/budget.mjs --dist=<folder>     another build (an earlier one, to compare)
//   node tools/smoke/budget.mjs --url=<site>        a running site instead (http://127.0.0.1:5391, a Vercel preview)
//   --only=desktop|phone    one device        --json=<file>    also write every number there
//   SMOKE_CHANNEL=chrome node tools/smoke/…   use the installed Google Chrome (no browser download)
//
// Desktop is 1440×900. "Phone" is 390×844 touch emulation with the CPU slowed 4× (Chrome DevTools throttling), a
// stand-in for a mid-range Android until there's a real-device lab; it isn't Safari. Headless frames run at 60 Hz.
// One run per device, in this order, on a fresh sheet (storage cleared):
//   1. typing a letter at a human rhythm (~90 wpm on a computer, ~60 on the phone): key → frame and key → painted
//   2. stopping: how long the pen goes on writing after the last key
//   3. corrections on dry ink: Backspace (and, on a computer, ⌘B, ⌘U, ⌘Z): key → frame
//   4. a paste of ~1,000 letters (~500 on the phone): how long the pen takes to copy it out, and the longest frame
//      and long animation frames while it does
//   5. typing on the now full sheet: key → frame, key → painted, and the pen's paint per frame (the rAF callbacks)
//   6. New sheet: the click → a fresh, empty sheet with its caret on screen
//   7. motion, read from the site's own CSS: the sheet's moves (view transitions) and the caret's blink. The minifier
//      rewrites units (130ms becomes .13s), so every duration is parsed with its unit
//   8. layout shift (CLS) over the whole run, and timers that keep firing while nothing moves
// "Key → frame" is from the key event to the next animation frame after all its handlers ran; "key → painted" is from
// the key to a task posted from that frame, about when it shows. Each budget line prints pass or fail; the exit code
// is 1 when any fails (informational lines don't count).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const APP = path.join(ROOT, 'app');
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const ONLY = arg('only');
const JSON_OUT = arg('json');

// ---------- the budget (ideas-feel.md, "The speed budget"); phone = the 4×-slower emulation ----------
const BUDGET = {
  keyFrame: { desktop: 16.7, phone: 33 },        // ms, p95, any sheet
  keyPainted: { desktop: 25, phone: 50 },        // ms, p95, any sheet
  penPaint: { desktop: 1, phone: 3 },            // ms per frame, full sheet (p95 of the pen's rAF callbacks)
  longFrame: { desktop: 50, phone: 50 },         // ms: any frame while the pen copies a paste out
  afterStop: { desktop: 1.5, phone: 1.5 },       // s the pen goes on after the last key (normal typing)
  pasteOut: { desktop: 6, phone: 6 },            // s to write out a paste, any length
  newSheet: { desktop: 50, phone: 100 },         // ms from the click to a fresh sheet with a caret
  sheetMotion: 320,                              // ms: the longest sheet move (view transitions)
  inkKeys: { desktop: 16.7, phone: 33 },         // ms, key → frame: ⌫ on ink, ⌘B, ⌘U, ⌘Z
  cls: 0,
};

// ---------- the site ----------
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
async function serve() {
  const url = arg('url');
  if (url) return { base: url.replace(/\/$/, ''), stop: () => {} };
  const dist = path.resolve(arg('dist') || path.join(APP, 'dist'));
  if (!fs.existsSync(path.join(dist, 'write.html'))) {
    console.error(`No build with a writing page at ${dist}: run "cd app && npm run build" first.`);
    process.exit(1);
  }
  const port = await freePort();
  const vite = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: APP, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + '/write.html'); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { base, stop: () => vite.kill() };
}

// ---------- in the page, before its own scripts ----------
function instrument() {
  const M = (window.__budget = { keys: [], raf: [], frames: [], loaf: [], ls: [], timers: 0, phase: '' });
  const raf0 = window.requestAnimationFrame.bind(window);
  // every rAF callback the page asks for, timed (the drawn pen's paint step is one)
  window.requestAnimationFrame = (cb) => raf0((t) => { const a = performance.now(); cb(t); M.raf.push([M.phase, a, performance.now() - a]); });
  let last = 0;
  const clock = (t) => { if (last) M.frames.push([M.phase, t, t - last]); last = t; raf0(clock); };
  raf0(clock);
  addEventListener('keydown', (e) => {
    const t0 = e.timeStamp, k = e.key, phase = M.phase;
    raf0(() => { const f = performance.now(); setTimeout(() => M.keys.push({ phase, k, toFrame: f - t0, painted: performance.now() - t0 }), 0); });
  }, true);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) M.loaf.push([M.phase, e.startTime, e.duration]); }).observe({ type: 'long-animation-frame', buffered: true }); } catch { /* not in this browser */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) M.ls.push([M.phase, e.value]); }).observe({ type: 'layout-shift', buffered: true }); } catch { /* not in this browser */ }
  // timers firing while nothing moves (counted only in the idle phase)
  const si0 = window.setInterval.bind(window);
  window.setInterval = (cb, ms, ...a) => si0(typeof cb === 'function' ? (...x) => { if (M.phase === 'idle') M.timers++; return cb(...x); } : cb, ms, ...a);
  // the pen's backlog: letters the drawn pen still has to ink, plus letters typed but not yet handed to it
  window.__backlog = () => { const L = window.__seedhandLive; if (!L || !L.pen) return -1; const s = L.pen.at(performance.now() / 1000); return s.letters + (L.pen.trail || 0); };
}

// ---------- helpers ----------
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const ms = (v) => (v == null ? '—' : v >= 100 ? `${Math.round(v)} ms` : `${v.toFixed(1)} ms`);
const sec = (v) => (v == null ? '—' : v < 0 ? 'never' : `${v.toFixed(2)} s`);
// a CSS time as the minifier may have written it: "1.06s", ".13s", "130ms", "0s", lists ("0s, .4s")
export const cssTimes = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
  const m = /^(-?[\d.]+)(ms|s)$/.exec(x);
  return m ? parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1) : NaN;
});

const LETTER = 'Dear Ada, the little letters never quite match, and that is the point. I wrote this on the train, so forgive the wobble. See you on Sunday. ';
const PASTE = 'It rained all week and the garden is a marsh. Tom says the roof will hold until spring, but I have my doubts, and the bucket in the hall agrees with me. We walked to the harbour on Thursday and watched the boats come in, the gulls arguing over every scrap. ';
const MORE = 'and one more line on a full sheet. ';

async function run(browser, base, dev) {
  const phone = dev === 'phone';
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, reducedMotion: 'no-preference' }
    : { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await ctx.addInitScript(instrument);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  const cdp = await ctx.newCDPSession(page);
  if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const R = { dev };
  const phase = (n) => page.evaluate((n) => { window.__budget.phase = n; }, n);
  const backlog = () => page.evaluate(() => window.__backlog());
  const caughtUp = async (max) => {
    const a = Date.now();
    while (Date.now() - a < max) { if ((await backlog()) === 0) return (Date.now() - a) / 1000; await page.waitForTimeout(25); }
    return -1;
  };
  const typeHuman = async (text, base) => {
    for (const ch of text) { await page.keyboard.type(ch); await page.waitForTimeout(base * (0.6 + Math.random() * 0.8)); }
  };

  await page.goto(base + '/write', { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* fine */ } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-paper] textarea', { timeout: 30000 });
  await page.waitForTimeout(800);
  if (phone) {
    const box = await page.locator('[data-paper]').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + 60);
    await page.waitForTimeout(400);
  } else await page.locator('[data-paper] textarea').focus();

  // 1–2. typing on an empty sheet, then stopping
  await phase('type');
  await typeHuman(LETTER, phone ? 160 : 110);
  await phase('stop');
  R.afterStop = await caughtUp(30000);
  await page.waitForTimeout(phone ? 7000 : 7000); // the ink dries (the longest wet window is 6 s)

  // 3. corrections on dry ink
  await phase('ink');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1500);
  if (!phone) {
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Meta+b'); await page.waitForTimeout(900);
    await page.keyboard.press('Meta+u'); await page.waitForTimeout(900);
    await page.keyboard.press('Meta+z'); await page.waitForTimeout(900);
    await page.waitForTimeout(6500);
    await page.keyboard.press('Meta+z'); await page.waitForTimeout(600);
    await page.keyboard.press('End');
    await page.keyboard.press('Meta+ArrowDown');
  }
  await caughtUp(15000);

  // 4. a paste, copied out by the pen
  await phase('paste');
  const paste = PASTE.repeat(phone ? 2 : 4);
  const p0 = Date.now();
  await page.keyboard.insertText(paste);
  R.pasteChars = paste.length;
  R.pasteOut = await caughtUp(150000);
  if (R.pasteOut >= 0) R.pasteOut = (Date.now() - p0) / 1000;
  await phase('settle');
  await page.waitForTimeout(800);
  R.strokes = await page.evaluate(() => document.querySelectorAll('[data-s]').length);

  // 5. typing on the full sheet
  await phase('full');
  await typeHuman(MORE, phone ? 160 : 110);
  await phase('full-stop');
  await caughtUp(30000);
  await page.waitForTimeout(500);

  // 8. nothing moving: timers that still fire
  await phase('idle');
  await page.waitForTimeout(2000);
  await phase('');

  // 6. New sheet
  const btn = page.getByRole('button', { name: 'New sheet' });
  if (await btn.count()) {
    await phase('new');
    R.newSheet = await page.evaluate(() => new Promise((resolve) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'New sheet' || x.textContent.trim() === 'New sheet');
      const t0 = performance.now();
      b.click();
      const check = () => {
        const ta = document.querySelector('[data-paper] textarea');
        if (ta && ta.value === '') requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0));
        else if (performance.now() - t0 > 3000) resolve(-1);
        else requestAnimationFrame(check);
      };
      check();
    }));
    await page.waitForTimeout(1200);
    await phase('');
  }

  // 7. motion, from the CSS the site ships
  R.motion = await page.evaluate(() => {
    const out = { sheet: [], caret: null };
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !(r instanceof CSSStyleRule)) { if (!(r.media && /reduce/.test(r.media.mediaText))) walk(r.cssRules); continue; }
        if (!(r instanceof CSSStyleRule)) continue;
        if (/::view-transition-(group|old|new|image-pair)/.test(r.selectorText) && (r.style.animationDuration || r.style.animation)) {
          out.sheet.push({ sel: r.selectorText.slice(0, 80), dur: r.style.animationDuration || '', anim: r.style.animation || '' });
        }
        if (r.selectorText === '.caret-blink') out.caret = { anim: r.style.animation || '', dur: r.style.animationDuration || '', delay: r.style.animationDelay || '' };
      }
    };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* another origin */ } }
    return out;
  });

  const M = await page.evaluate(() => window.__budget);
  R.errors = errors;
  const keys = (ph) => M.keys.filter((k) => ph.includes(k.phase));
  const frameKeys = (ph) => keys(ph).map((k) => k.toFrame);
  const paintKeys = (ph) => keys(ph).map((k) => k.painted);
  R.keyFrame = { empty: pct(frameKeys(['type']), 0.95), full: pct(frameKeys(['full']), 0.95) };
  R.keyPainted = { empty: pct(paintKeys(['type']), 0.95), full: pct(paintKeys(['full']), 0.95), emptyP50: pct(paintKeys(['type']), 0.5), fullP50: pct(paintKeys(['full']), 0.5) };
  // (the correction keys themselves: ⌫, and B, U, Z with ⌘; not the arrows that move between them)
  const inkKeys = keys(['ink']).filter((k) => /^(Backspace|b|u|z)$/.test(k.k));
  R.inkKeys = pct(inkKeys.map((k) => k.toFrame), 1);
  R.inkKeysEach = inkKeys.map((k) => `${k.k === 'Backspace' ? '⌫' : '⌘' + k.k.toUpperCase()} ${Math.round(k.toFrame)}`).join(', ');
  // the pen's paint step: rAF callbacks that did real work while the pen drew on the full sheet
  const paints = M.raf.filter(([ph, , d]) => (ph === 'full' || ph === 'full-stop') && d > 0.02).map(([, , d]) => d);
  R.penPaint = { p95: pct(paints, 0.95), p50: pct(paints, 0.5), n: paints.length };
  const pasteFrames = M.frames.filter(([ph]) => ph === 'paste').map(([, , d]) => d);
  R.paste = { worstFrame: pct(pasteFrames, 1), over50: pasteFrames.filter((d) => d > 50).length, frames: pasteFrames.length, loaf: M.loaf.filter(([ph]) => ph === 'paste').length };
  R.cls = M.ls.reduce((s, [, v]) => s + v, 0);
  R.idleTimers = M.timers;
  const sheetMs = R.motion.sheet.flatMap((x) => [...cssTimes(x.dur), ...(x.anim.match(/-?[\d.]+m?s/g) || []).slice(0, 1).flatMap(cssTimes)]).filter((x) => Number.isFinite(x));
  R.sheetMotion = sheetMs.length ? Math.max(...sheetMs) : null;
  await ctx.close();
  return R;
}

function report(R) {
  const d = R.dev;
  const lines = [];
  const line = (what, value, budget, ok, info = false) => lines.push({ what, value, budget, ok: info ? null : ok });
  line('Key → frame, p95, empty sheet', ms(R.keyFrame.empty), `≤ ${BUDGET.keyFrame[d]} ms`, R.keyFrame.empty != null && R.keyFrame.empty <= BUDGET.keyFrame[d]);
  line('Key → frame, p95, full sheet', ms(R.keyFrame.full), `≤ ${BUDGET.keyFrame[d]} ms`, R.keyFrame.full != null && R.keyFrame.full <= BUDGET.keyFrame[d]);
  line('Key → painted, p95, empty sheet', ms(R.keyPainted.empty), `≤ ${BUDGET.keyPainted[d]} ms`, R.keyPainted.empty != null && R.keyPainted.empty <= BUDGET.keyPainted[d]);
  line('Key → painted, p95, full sheet', `${ms(R.keyPainted.full)} (p50 ${ms(R.keyPainted.fullP50)})`, `≤ ${BUDGET.keyPainted[d]} ms`, R.keyPainted.full != null && R.keyPainted.full <= BUDGET.keyPainted[d]);
  line(`Pen paint per frame, full sheet (${R.strokes} strokes)`, `${ms(R.penPaint.p95)} p95, ${ms(R.penPaint.p50)} p50`, `≤ ${BUDGET.penPaint[d]} ms`, R.penPaint.p95 != null && R.penPaint.p95 <= BUDGET.penPaint[d]);
  line(`Longest frame while a paste is copied out (${R.paste.over50} over 50 ms)`, ms(R.paste.worstFrame), `≤ ${BUDGET.longFrame[d]} ms`, R.paste.worstFrame != null && R.paste.worstFrame <= BUDGET.longFrame[d]);
  line('Pen still writing after the last key', sec(R.afterStop), `≤ ${BUDGET.afterStop[d]} s`, R.afterStop >= 0 && R.afterStop <= BUDGET.afterStop[d]);
  line(`A paste of ${R.pasteChars} letters written out`, sec(R.pasteOut), `≤ ${BUDGET.pasteOut[d]} s`, R.pasteOut >= 0 && R.pasteOut <= BUDGET.pasteOut[d]);
  line(`⌫ on ink, ⌘B, ⌘U, ⌘Z: key → frame, worst (${R.inkKeysEach})`, ms(R.inkKeys), `≤ ${BUDGET.inkKeys[d]} ms`, R.inkKeys != null && R.inkKeys <= BUDGET.inkKeys[d]);
  line('New sheet: click → fresh sheet with a caret', R.newSheet == null ? 'no button' : R.newSheet < 0 ? 'never' : ms(R.newSheet), `≤ ${BUDGET.newSheet[d]} ms`, R.newSheet != null && R.newSheet >= 0 && R.newSheet <= BUDGET.newSheet[d]);
  line('Sheet motion, longest (CSS)', R.sheetMotion == null ? 'none found' : ms(R.sheetMotion), `≤ ${BUDGET.sheetMotion} ms`, R.sheetMotion == null || R.sheetMotion <= BUDGET.sheetMotion);
  line('Layout shift (CLS), whole run', R.cls.toFixed(3), '0', R.cls <= 0.001);
  line('Interval timers fired in 2 s with nothing moving', String(R.idleTimers), 'none', R.idleTimers === 0, true);
  const caret = R.motion.caret;
  line('Caret blink (CSS)', caret ? `${caret.anim || caret.dur} → ${cssTimes(caret.dur || (caret.anim.match(/[\d.]+m?s/) || [''])[0]).map((x) => x + ' ms').join(', ')}` : 'none', 'info', true, true);
  if (R.errors.length) line('Console errors', R.errors.slice(0, 3).join(' | '), 'none', false);
  return lines;
}

const devices = ONLY ? [ONLY] : ['desktop', 'phone'];
const site = await serve();
const browser = await chromium.launch(process.env.SMOKE_CHANNEL ? { channel: process.env.SMOKE_CHANNEL } : {});
const all = {};
let failed = 0;
try {
  for (const d of devices) {
    console.log(`\n${d === 'phone' ? 'Phone (390×844, CPU 4× slower)' : 'Desktop (1440×900)'}: ${site.base}/write`);
    const R = await run(browser, site.base, d);
    all[d] = R;
    for (const l of report(R)) {
      const mark = l.ok == null ? '·' : l.ok ? '✓' : '✗';
      if (l.ok === false) failed++;
      console.log(`  ${mark} ${l.what.padEnd(62)} ${String(l.value).padEnd(26)} ${l.budget}`);
    }
  }
} finally {
  await browser.close();
  site.stop();
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(all, null, 1));
console.log(`\n${failed ? `FAIL: ${failed} over budget` : 'PASS: everything within budget'}`);
process.exit(failed ? 1 : 0);
