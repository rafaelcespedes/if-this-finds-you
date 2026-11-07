// desk-capture.mjs: films the real writing page (/write) on a desktop, frame by frame, for the desk video
// (src/InkDesk.tsx). Headless Chrome opens the site, the page runs on the video's clock (scripts/desk-clock.js), and a
// script of keys, clicks and drags (scripts/desk-script.mjs) is sent as real input at its time on that clock. After
// each frame's worth of time, the page is photographed. Nothing on the page is drawn by the video: it's the site.
// Writes public/desk/<tag>/NNNNN.jpg and src/data/desk-<tag>.json (the pointer, the captions, where things are).
//   node scripts/desk-capture.mjs [--tag draft] [--dpr 1] [--url http://localhost:4174/write] [--from 0] [--to 999]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { scene } = await import(process.env.DESK_SCENE ? path.resolve(process.env.DESK_SCENE) : './desk-script.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TAG = arg('tag', 'draft');
const DPR = Number(arg('dpr', 1));
const URL_ = arg('url', 'http://localhost:4174/write');
const FPS = Number(arg('fps', 30));
const QUALITY = Number(arg('q', 86));
const ONLY = arg('only', ''); // e.g. "0-90": photograph only these frames (the rest still run, unphotographed)
const W = scene.width, H = scene.height;

const chrome = path.join(root, 'node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-'));
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(chrome, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', `--window-size=${W},${H}`,
  '--no-first-run', '--font-render-hinting=none', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const outDir = path.join(root, 'public/desk', TAG);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject, method }); ws.send(JSON.stringify({ id: i, method, params }));
});
const logs = [];
async function js(expr) {
  const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result?.value;
}

// ---------- keys ----------
const CODES = { ' ': 'Space', ',': 'Comma', '.': 'Period', '/': 'Slash', '-': 'Minus', '[': 'BracketLeft', ']': 'BracketRight', '#': 'Digit3', "'": 'Quote', '’': 'Quote', '!': 'Digit1', '?': 'Slash' };
const VK = { ' ': 32, ',': 188, '.': 190, '/': 191, '-': 189, '[': 219, ']': 221, "'": 222 };
function charKey(ch) {
  const up = ch.toUpperCase();
  if (/[a-z]/i.test(ch)) return { key: ch, code: `Key${up}`, vk: up.charCodeAt(0), shift: ch !== ch.toLowerCase() };
  if (/[0-9]/.test(ch)) return { key: ch, code: `Digit${ch}`, vk: ch.charCodeAt(0) };
  return { key: ch, code: CODES[ch] || '', vk: VK[ch] || 0, shift: '#!?'.includes(ch) };
}
const NAMED = { Backspace: { code: 'Backspace', vk: 8, cmd: 'deleteBackward' }, Enter: { code: 'Enter', vk: 13, text: '\r' }, Escape: { code: 'Escape', vk: 27 },
  ArrowLeft: { code: 'ArrowLeft', vk: 37, cmd: 'moveLeft' }, ArrowRight: { code: 'ArrowRight', vk: 39, cmd: 'moveRight' } };
const MODS = { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 };
async function typeChar(ch) {
  const k = charKey(ch);
  const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: k.shift ? 8 : 0 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
/** "Backspace", "Enter", "Meta+b", "Shift+Meta+e", "Alt+Meta+n"; `repeat` for a held key's repeats */
async function press(combo, { repeat = false, up = true } = {}) {
  const parts = combo.split('+');
  const main = parts.pop();
  const modifiers = parts.reduce((m, p) => m | MODS[p], 0);
  const named = NAMED[main];
  const k = named ? { key: main, code: named.code, vk: named.vk } : charKey(main);
  const ev = { key: modifiers & 8 && k.key.length === 1 ? k.key.toUpperCase() : k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers, autoRepeat: repeat };
  if (named?.text && !modifiers) await send('Input.dispatchKeyEvent', { type: 'keyDown', ...ev, text: named.text, unmodifiedText: named.text });
  else await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev, ...(named?.cmd && !modifiers && !repeat ? { commands: [named.cmd] } : {}) });
  if (up) await send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev });
}

// ---------- the pointer ----------
const ptr = { x: W * 0.62, y: H * 0.55, shown: false, down: false };
async function mouse(type, x, y, extra = {}) {
  ptr.x = x; ptr.y = y;
  await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !ptr.down ? 'none' : 'left', buttons: ptr.down ? 1 : 0, ...extra });
}

// ---------- where things are on the page ----------
/** the screen point of text offset `o` in the note (the textarea sits at the caret, so put the caret there and look) */
async function pointAt(o) {
  return js(`(async () => {
    const ta = document.querySelector('.wr-main textarea');
    const keep = [ta.selectionStart, ta.selectionEnd];
    ta.setSelectionRange(${o}, ${o});
    document.dispatchEvent(new Event('selectionchange'));
    await window.__desk.settle(20); window.__desk.flush(); await window.__desk.settle(20);
    const r = ta.getBoundingClientRect();
    const out = { x: r.left, y: r.top, h: r.height };
    ta.setSelectionRange(keep[0], keep[1]);
    document.dispatchEvent(new Event('selectionchange'));
    await window.__desk.settle(20); window.__desk.flush(); await window.__desk.settle(20);
    return out;
  })()`);
}
const noteText = () => js(`document.querySelector('.wr-main textarea')?.value ?? ''`);
/** a word's place in the text: its nth match ("garden", or "the garden" with `word` picked inside) */
async function findWord(spec) {
  const text = await noteText();
  const { word, n = 1, in: within } = typeof spec === 'string' ? { word: spec } : spec;
  let at = -1;
  const hay = within ?? word;
  for (let i = 0, from = 0; i < n; i++) { at = text.indexOf(hay, from); from = at + 1; if (at < 0) break; }
  if (at < 0) throw new Error(`"${hay}" isn't in ${JSON.stringify(text)}`);
  if (within) at += within.indexOf(word);
  return { from: at, to: at + word.length };
}
/** a stretch of the text's box on the page: select it for a moment and measure the selection the page draws over it */
async function boxOf(from, to) {
  return js(`(async () => {
    const ta = document.querySelector('.wr-main textarea');
    const keep = [ta.selectionStart, ta.selectionEnd, ta.selectionDirection];
    const look = async () => { document.dispatchEvent(new Event('selectionchange')); for (let i = 0; i < 3; i++) { await window.__desk.settle(15); window.__desk.flush(); } };
    ta.setSelectionRange(${from}, ${to});
    await look();
    const rs = [...document.querySelectorAll('.wr-main svg.mix-blend-multiply polygon')].map((p) => p.getBoundingClientRect());
    ta.setSelectionRange(keep[0], keep[1], keep[2]);
    await look();
    if (!rs.length) return null;
    const r = rs[0];
    return { x: r.left, y: r.top, w: r.width, h: r.height, lines: rs.length };
  })()`);
}
async function resolve(where) {
  // something the page is still making (a panel's rows): wait for it, on the wall's clock only
  if (where.sel) for (let i = 0; i < 40; i++) { const r = await find(where); if (r || i === 39) return r; await sleep(100); }
  return locate(where);
}
async function find(where) {
  return js(`(() => { const e = document.querySelectorAll(${JSON.stringify(where.sel)})[${where.n ?? 0}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width * ${where.fx ?? 0.5} + ${where.dx ?? 0}, y: r.top + r.height * ${where.fy ?? 0.5} + ${where.dy ?? 0} }; })()`);
}
async function locate(where) {
  if (where.text || where.end) {
    // a word on the page: its middle, or its start or end, on the line's middle
    let w;
    if (where.end) {
      const t = await noteText();
      // the last letter written (a word put above the line isn't where the writing ends)
      const end = t.trimEnd().length;
      w = { from: end - 1, to: end };
    } else w = await findWord(where.text);
    const b = await boxOf(w.from, w.to);
    if (!b) throw new Error(`no box for ${JSON.stringify(where)}`);
    const x = where.end ? b.x + b.w + 18 : where.start ? b.x + 3 : where.stop ? b.x + b.w - 3 : b.x + b.w / 2;
    return { x: x + (where.dx ?? 0), y: b.y + b.h / 2 + (where.dy ?? 0), box: b, from: w.from, to: w.to };
  }
  return { x: where.x, y: where.y };
}
// where the camera may want to look, every frame
const RECTS = {
  caret: '.wr-main textarea',
  bar: '.wr-bar',
  side: '.wr-side',
  writer: '.wr-writer-chip',
  hands: '.wr-hands',
  panel: '[role="dialog"], [data-radix-popper-content-wrapper]',
  sheet: '.wr-main canvas',
};
const rectsNow = () => js(`(() => { const o = {}; for (const [k, s] of Object.entries(${JSON.stringify(RECTS)})) { const e = document.querySelector(s); if (e) { const r = e.getBoundingClientRect(); if (r.width) o[k] = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10); } } return o; })()`);

// ---------- run ----------
try {
  let targets;
  for (let i = 0; i < 80; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(150); } }
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m); }
    else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scene.scheme ?? 'dark' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(here, 'desk-clock.js'), 'utf8') });
  if (scene.pending) await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (!sessionStorage.getItem('desk-once')) { sessionStorage.setItem('desk-once', '1'); localStorage.setItem('seedhand:write:pending', ${JSON.stringify(JSON.stringify(scene.pending))}); }` });
  await send('Animation.enable');
  await send('Animation.setPlaybackRate', { playbackRate: 0 });
  const u = new URL(URL_); u.searchParams.set('rand', String(scene.rand ?? 7)); if (scene.startShift) u.searchParams.set('shift', String(scene.startShift));
  await send('Page.navigate', { url: u.toString() });
  // the visit: let it load with the clock moving at about the wall's pace
  for (let i = 0; i < 400; i++) {
    await sleep(25);
    const ok = await js(`!!window.__desk && (window.__desk.advance(25), !!document.querySelector('.wr-app:not([data-loading]) .wr-main textarea'))`).catch(() => false);
    if (ok && i > 60) break;
  }
  // the paper and the hands load in workers: wait until the sheet has painted
  for (let i = 0; i < 200; i++) { await js('window.__desk.advance(50)'); await sleep(40); if (i > 40) break; }
  const look = await js(`document.querySelector('.wr-writer-chip')?.getAttribute('aria-label')`);
  console.log('loaded;', look);
  const [onlyA, onlyB] = ONLY ? ONLY.split('-').map(Number) : [0, Infinity];
  const rec = { fps: FPS, width: W, height: H, dpr: DPR, frames: 0, seconds: scene.end, look, tag: TAG, notes: [], cams: [], pointer: [], rects: [], keys: [], clicks: [] };
  let clock = 0; // script seconds
  let ai = 0;
  let acts = [];
  let shoot = false;
  const schedule = (n) => { let i = ai; while (i < acts.length && acts[i].t <= n.t) i++; acts.splice(i, 0, n); };
  let glide = []; // pointer moves in flight: { t0, t1, from, to }
  const go = async (t) => { if (t > clock) { await js(`window.__desk.advance(${(t - clock) * 1000})`); clock = t; } };
  /** play a script on the clock: photographed (the video), or not (the notes written before it) */
  async function play(list, END, film) {
    acts = [...list].sort((a, b) => a.t - b.t); ai = 0; clock = 0; glide = []; shoot = film;
    const frames = Math.round(END * FPS);
    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      const T = f / FPS;
      while (ai < acts.length && acts[ai].t <= T + 1e-9) {
        const a = acts[ai++];
        await go(a.t);
        await perform(a);
      if (process.env.DESK_DEBUG > 1) console.log('\n', a.t.toFixed(2), a.key, a.combo ?? a.ch ?? '', JSON.stringify(await noteText()));
        await js('window.__desk.settle(2)');
      }
      // pointer glides land on frame times (and drags send their moves)
      for (const g of glide) {
        if (g.done) continue;
        const u = Math.min(1, (T - g.t0) / (g.t1 - g.t0));
        if (u < 0) continue;
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const x = g.from.x + (g.to.x - g.from.x) * e, y = g.from.y + (g.to.y - g.from.y) * e + Math.sin(Math.PI * e) * (g.arc ?? 0);
        await go(T);
        await mouse('mouseMoved', x, y);
        if (u >= 1) g.done = true;
      }
      await go(T);
      if (!film) { if (f % 15 === 0) await js('window.__desk.settle(15)'); continue; }
      await js('window.__desk.settle(4)');
      rec.pointer.push([Math.round(ptr.x * 10) / 10, Math.round(ptr.y * 10) / 10, ptr.shown ? 1 : 0, ptr.down ? 1 : 0]);
      rec.rects.push(await rectsNow());
      if (f >= onlyA && f <= onlyB) {
        const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY, captureBeyondViewport: false, optimizeForSpeed: true });
        fs.writeFileSync(path.join(outDir, `${String(f).padStart(5, '0')}.jpg`), Buffer.from(shot.result.data, 'base64'));
      }
      if (f % 60 === 0) process.stdout.write(`\rframe ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)   `);
    }
    await go(END);
    if (film) { rec.frames = frames; console.log(`\n${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  }
  // the notes written before (yesterday's, this morning's): typed for real, unfilmed, so the list has them
  for (const b of scene.before ?? []) {
    if (b.shift) await js(`window.__desk.shift(${b.shift * 3600e3})`);
    await play(b.acts, b.end, false);
    console.log('before:', JSON.stringify(await noteText()));
  }
  await js(`window.__desk.shift(-window.__desk.shifted())`);
  await play(scene.acts, scene.end, true);
  console.log(`text: ${JSON.stringify(await noteText())}`);
  fs.writeFileSync(path.join(root, `src/data/desk-${TAG}.json`), JSON.stringify(rec));
  if (logs.length) console.log('page said:\n  ' + [...new Set(logs)].slice(0, 20).join('\n  '));

  async function perform(a) {
    switch (a.key) {
      case 'note': if (!shoot) return; rec.notes.push({ t: a.t, note: a.note, keys: a.keys }); return;
      case 'type': ptr.shown = false; if (shoot) rec.keys.push({ t: a.t, k: a.ch }); return typeChar(a.ch);
      case 'press': ptr.shown = a.pointer ?? false; rec.keys.push({ t: a.t, k: a.combo }); return press(a.combo);
      case 'hold': {
        // a key held down: the press, then the system's repeats (after 0.5 s, every 83 ms), then the lift
        rec.keys.push({ t: a.t, k: a.combo, dur: a.dur });
        ptr.shown = false;
        await press(a.combo, { up: false });
        for (let r = a.t + 0.5; r < a.t + a.dur; r += 0.083) schedule({ t: r, key: 'repeat', combo: a.combo });
        schedule({ t: a.t + a.dur, key: 'keyup', combo: a.combo });
        return;
      }
      case 'repeat': return press(a.combo, { repeat: true, up: false });
      case 'keyup': return send('Input.dispatchKeyEvent', { type: 'keyUp', key: a.combo, code: NAMED[a.combo]?.code, windowsVirtualKeyCode: NAMED[a.combo]?.vk });
      case 'move': {
        // glide the pointer to a place, arriving `dur` seconds later
        const to = await resolve(a.to);
        if (!to) throw new Error(`nothing at ${JSON.stringify(a.to)}`);
        ptr.shown = true;
        glide.push({ t0: a.t, t1: a.t + (a.dur ?? 0.6), from: { x: ptr.x, y: ptr.y }, to, arc: a.arc ?? -12 });
        a.resolved = to;
        return;
      }
      case 'click': {
        const at = a.at ? await resolve(a.at) : { x: ptr.x, y: ptr.y };
        if (process.env.DESK_DEBUG) console.log('\nclick', JSON.stringify(a.at), JSON.stringify(at), JSON.stringify(await noteText()));
        ptr.shown = true;
        rec.clicks.push({ t: a.t, x: at.x, y: at.y, count: a.count ?? 1 });
        for (let c = 1; c <= (a.count ?? 1); c++) {
          ptr.down = true; await mouse('mousePressed', at.x, at.y, { clickCount: c });
          ptr.down = false; await mouse('mouseReleased', at.x, at.y, { clickCount: c });
        }
        return;
      }
      case 'drag': {
        // press here, glide to there with the button down, let go (selecting text)
        const from = await resolve(a.from), to = await resolve(a.to);
        ptr.shown = true;
        await mouse('mouseMoved', from.x, from.y);
        ptr.down = true; await mouse('mousePressed', from.x, from.y, { clickCount: 1 });
        rec.clicks.push({ t: a.t, x: from.x, y: from.y, count: 1, drag: true });
        glide.push({ t0: a.t, t1: a.t + (a.dur ?? 0.5), from, to, arc: 0 });
        schedule({ t: a.t + (a.dur ?? 0.5) + 0.01, key: 'up', x: to.x, y: to.y });
        return;
      }
      case 'up': ptr.down = false; return mouse('mouseReleased', a.x, a.y, { clickCount: 1 });
      case 'hide': ptr.shown = false; return;
      case 'cam': if (shoot) rec.cams.push({ t: a.t, focus: a.focus, zoom: a.zoom, ease: a.ease }); return;
      case 'js': return js(a.code);
      default: throw new Error(`unknown act ${a.key}`);
    }
  }
} finally {
  try { ws?.close(); } catch {}
  proc.kill();
  fs.rmSync(profile, { recursive: true, force: true });
}
