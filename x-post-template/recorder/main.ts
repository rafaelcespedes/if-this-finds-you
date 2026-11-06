// The typing recorder: a sheet of paper that takes typing as the video's ink does (src/ink-run.ts, the same clock
// and the same engine calls, so what you see here is what the video replays), and a take that keeps everything
// on one clock: what was done (acts), every key down and up (for the hands), the pointer, the webcam with its
// sound, and sync beeps (the phone filming the hands from above hears them). Saved as one zip; turned into the
// video's data by scripts/take.ts. Built into one HTML file by scripts/build-recorder.mjs.
import { InkRun, type Act } from '../src/ink-run';
import { engine, drawInk, UPM } from '../src/draw';
import { paintPaper } from '@/lib/papers';
import { HAND, PAPER, MEASURE, SALT, PEN_SPEED } from '../src/setup';
import { zip } from './zip';

/* eslint-disable @typescript-eslint/no-explicit-any */
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

// ---------- the take ----------
type Phase = 'setup' | 'countdown' | 'recording' | 'finishing' | 'done';
let phase: Phase = 'setup';
let run = new InkRun();
let t0 = 0;
const T = () => (performance.now() - t0) / 1000;
const acts: Act[] = [];
/** every key down and up: t, d (down) or u (up), code (the physical key), key (what it types), r (a repeat), m (shift 1, ctrl 2, alt 4, meta 8) */
const keys: { t: number; e: 'd' | 'u'; code: string; key: string; r?: 1; m?: number }[] = [];
/** the pointer over the sheet, mm from its top left corner: m (move), d (down), u (up) */
const pointer: { t: number; e: 'm' | 'd' | 'u'; x: number; y: number }[] = [];
const beeps: { t: number; hz: number; dur: number; what: string }[] = [];
let END = 0;
let GO = 0;

/** do something, now: the clock runs up to this moment first, as the replay will */
function doAct(a: Omit<Act, 't'>) {
  if (phase !== 'recording') return;
  const t = T();
  run.runTo(t);
  const full = { ...a, t } as Act;
  run.act(full);
  acts.push(full);
  inkDirty = true;
}
const caret = () => run.cursor ?? run.text().length;

// ---------- the sheet on screen ----------
const paper = run.paper;
const u = run.io.u as number; // page units per mm
let k = 6; // CSS px per mm
let dpr = 1;
const sheetEl = $('sheet');
const paperC = $<HTMLCanvasElement>('paper');
const inkC = $<HTMLCanvasElement>('ink');
const overC = $<HTMLCanvasElement>('over');
let sheets = 1;

function layout() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  k = clamp((window.innerWidth - 220) / paper.w, 3, 6.2);
  const W = paper.w * k, H = paper.h * k * sheets;
  sheetEl.style.width = `${W}px`;
  sheetEl.style.height = `${H}px`;
  sheetEl.style.left = `${(window.innerWidth - W) / 2}px`;
  for (const c of [paperC, inkC, overC]) { c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr); c.style.width = `${W}px`; c.style.height = `${H}px`; }
  const ctx = paperC.getContext('2d')!;
  for (let s = 0; s < sheets; s++) {
    ctx.save();
    ctx.translate(0, s * paper.h * k * dpr);
    paintPaper(ctx, paper as any, { pxPerMm: k * dpr, grainScale: (k * dpr) / 4, holeFill: 'clear', shadow: 'none', sheet: s } as any);
    ctx.restore();
  }
  inkDirty = true;
  scrollTo(true);
}
/** page units → CSS px on the sheet */
const sc = () => k / u;

// the pen's clock: every letter and mark drawn in writing order, stroke by stroke (as the video draws it)
interface Timed { it: any; start: number; dur: number }
function penClock(sh: any, ids: number[], evTime: number[]): Timed[] {
  const items = (sh.page.items as any[]).map((it, i) => ({ it, i })).filter(({ it }) => it.g && (it.kind === 'glyph' || it.kind === 'mark'));
  items.sort((a, b) => (a.it.ev ?? 0) - (b.it.ev ?? 0) || (a.it.inkIndex ?? a.i) - (b.it.inkIndex ?? b.i) || a.i - b.i);
  const evT = (ev: number) => evTime[ids[ev]] ?? 0;
  const per = new Map<number, number>();
  for (const { it } of items) per.set(it.ev ?? 0, (per.get(it.ev ?? 0) ?? 0) + 1);
  const evs = [...per.keys()].sort((a, b) => a - b);
  const next = new Map<number, number>();
  evs.forEach((e, j) => next.set(e, j + 1 < evs.length ? evT(evs[j + 1]) : Infinity));
  const out: Timed[] = [];
  let pen = 0;
  for (const { it } of items) {
    const ev = it.ev ?? 0;
    const room = (next.get(ev)! - evT(ev)) / (per.get(ev) || 1);
    const base = it.kind === 'mark' ? 0.32 : 1 / PEN_SPEED;
    const dur = clamp(Math.min(base, room * 0.95), 0.05, base);
    const start = Math.max(evT(ev), pen);
    out.push({ it, start, dur });
    pen = start + dur;
  }
  return out;
}

let inkDirty = true;
let inkSig = '';
let draftCache: { tail: any; items: any[]; page: any } = { tail: null, items: [], page: null };
function draft() {
  const v = run.view;
  if (draftCache.tail !== v.tail) {
    let page: any = null;
    try { page = v.tail ? engine.draftPage(run.sheet, v) : null; } catch { page = null; }
    draftCache = { tail: v.tail, page, items: ((page?.items ?? []) as any[]).filter((it) => it.kind === 'glyph') };
  }
  return draftCache;
}
function drawInkLayer(t: number) {
  const timed = penClock(run.sheet, run.ids, run.evTime);
  const drawn = timed.filter((x) => x.start <= t);
  const writing = drawn.some((x) => t < x.start + x.dur);
  const d = draft();
  const sig = `${run.states.length}:${drawn.length}:${d.tail ?? ''}:${k}:${sheets}`;
  if (!inkDirty && !writing && sig === inkSig) return;
  inkDirty = false;
  inkSig = sig;
  // the letter grows onto another sheet: lay it out again
  const lastY = Math.max(0, ...(run.sheet.page.items as any[]).filter((it) => it.box).map((it) => it.box[3]), ...d.items.map((it) => it.y));
  const need = 1 + Math.floor(lastY / (paper.h * u));
  if (need > sheets) { sheets = need; layout(); }
  const ctx = inkC.getContext('2d')!;
  ctx.clearRect(0, 0, inkC.width, inkC.height);
  const frac = new Map<any, number>();
  for (const x of drawn) frac.set(x.it, clamp((t - x.start) / x.dur, 0, 1));
  const emPx = sc() * dpr * UPM;
  drawInk(ctx, run.p, drawn.map((x) => x.it), {
    emPx, width: inkC.width, height: inkC.height,
    reveal: (it: any, si: number) => { const f = frac.get(it) ?? 1; const n = it.g?.strokes?.length || 1; return clamp(f * n - si, 0, 1); },
  });
  // the letters the pen hasn't reached yet: faint graphite, where they'll be written
  if (d.items.length) drawInk(ctx, run.p, d.items, { emPx, width: inkC.width, height: inkC.height, ink: '#6f6f78', alpha: 0.26 });
}

/** the caret geometry for what's typed now (the engine's own: written letters and the thoughts ahead of the pen) */
let geoCache: { sig: string; geo: any } = { sig: '', geo: null };
function geo() {
  const d = draft();
  const sig = `${run.states.length}:${d.tail ?? ''}:${run.text().length}`;
  if (geoCache.sig !== sig) {
    const page = run.sheet.page;
    const written = String(page.text ?? '').length;
    let g: any = null;
    try { g = d.page ? engine.geometry(run.p, [page, engine.offsetStops(d.page, written - (d.page.from || 0))]) : engine.geometry(run.p, page); } catch { g = null; }
    geoCache = { sig, geo: g };
  }
  return geoCache.geo;
}
/** where the caret is, sheet CSS px: its foot and its top */
function caretPx(o: number): { x0: number; y0: number; x1: number; y1: number } {
  const g = geo();
  const c = g?.caretAt(o, 'after');
  const s = sc();
  if (c) return { x0: c.bottom[0] * s, y0: c.bottom[1] * s, x1: c.top[0] * s, y1: c.top[1] * s };
  const x = paper.text.left * k, y = run.io.lines.first * k;
  return { x0: x, y0: y + 1.5 * k, x1: x, y1: y - 6 * k };
}
/** the text index under a point on the sheet (CSS px) */
function hit(x: number, y: number) {
  const g = geo();
  if (!g) return run.text().length;
  try { return clamp(g.hitTest(x / sc(), y / sc()).offset, 0, run.text().length); } catch { return run.text().length; }
}

let lastKeyAt = -10;
let drag: { a: number; b: number } | null = null;
function drawOverlay(t: number) {
  const ctx = overC.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, overC.width, overC.height);
  if (phase !== 'recording' && phase !== 'countdown' && phase !== 'finishing') return;
  const g = geo();
  const s = sc();
  // a selection (dragged across, held until its command): a soft blue behind the words
  const sel = drag && drag.a !== drag.b ? { from: Math.min(drag.a, drag.b), to: Math.max(drag.a, drag.b) } : run.selection;
  if (sel && g) {
    ctx.fillStyle = 'rgba(44, 99, 214, 0.16)';
    for (const r of g.selection(sel.from, sel.to) as { points: [number, number][] }[]) {
      ctx.beginPath();
      r.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
      ctx.closePath();
      ctx.fill();
    }
  }
  // the caret: steady while typing, blinking when you stop
  if (!sel && phase === 'recording') {
    const on = t - lastKeyAt < 0.6 || Math.floor((t - lastKeyAt) * 2) % 2 === 0;
    if (on) {
      const c = caretPx(caret());
      ctx.strokeStyle = '#1f2833';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x0, c.y0); ctx.lineTo(c.x1, c.y1); ctx.stroke();
    }
  }
}

// keep the line being written in view: the sheet slides up as the letter grows
let sheetTop = 0;
function scrollTo(now = false) {
  const c = caretPx(caret());
  const room = window.innerHeight * 0.58;
  const top = Math.min(84, room - c.y0);
  if (now || Math.abs(top - sheetTop) > 1) {
    sheetTop = top;
    sheetEl.style.transition = now ? 'none' : 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
    sheetEl.style.transform = `translateY(${top}px)`;
  }
}

// ---------- the loop ----------
let shownToasts = 0;
function frame() {
  const t = phase === 'setup' ? 0 : T();
  if (phase === 'recording') run.runTo(t);
  drawInkLayer(phase === 'setup' ? 0 : phase === 'done' ? Infinity : t);
  drawOverlay(t);
  if (phase === 'recording') scrollTo();
  if (run.toasts.length > shownToasts) { shownToasts = run.toasts.length; toast(run.toasts[run.toasts.length - 1].title, run.toasts[run.toasts.length - 1].body); }
  if (phase === 'recording' || phase === 'finishing') $('clock').textContent = clockText(t - GO);
  requestAnimationFrame(frame);
}
const clockText = (s: number) => { const x = Math.max(0, Math.floor(s)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };
let toastTimer = 0;
function toast(title: string, body = '') {
  const el = $('toast');
  el.innerHTML = `<b>${title}</b>${body ? `<span>${body}</span>` : ''}`;
  el.dataset.on = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.dataset.on = ''; }, 2200);
}

// ---------- typing ----------
const sink = $<HTMLTextAreaElement>('sink');
const focusSink = () => { if (document.activeElement !== sink) sink.focus({ preventScroll: true }); };
const mods = (e: KeyboardEvent | MouseEvent) => (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
/** a held Backspace on a struck word: one more pass this often (the writing page's AGAIN_EVERY) */
const AGAIN_EVERY = 0.7;
let againHeld = false, lastAgain = -10;
let goalX: number | null = null;
let anchor: number | null = null;

function wordLeft(text: string, i: number) { while (i > 0 && /\s/.test(text[i - 1])) i--; while (i > 0 && !/\s/.test(text[i - 1])) i--; return i; }
function wordRight(text: string, i: number) { while (i < text.length && /\s/.test(text[i])) i++; while (i < text.length && !/\s/.test(text[i])) i++; return i; }
/** the caret moved by an arrow key (with Shift: the selection grows) */
function moveCaret(e: KeyboardEvent) {
  const text = run.text();
  const sel = run.selection;
  const from = sel ? sel.from : caret(), to = sel ? sel.to : caret();
  const head = sel && anchor != null ? (anchor === sel.from ? sel.to : sel.from) : caret();
  let o = head;
  const g = geo();
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const right = e.key === 'ArrowRight';
    goalX = null;
    if (sel && !e.shiftKey && !e.altKey && !e.metaKey) o = right ? to : from;
    else if (e.metaKey && g) { const c = g.caretAt(head, 'after'); const os = c ? (g.lineStops(c.line) as { o: number }[]).map((s) => s.o) : [head]; o = right ? Math.max(...os) : Math.min(...os); }
    else if (e.altKey) o = right ? wordRight(text, head) : wordLeft(text, head);
    else o = clamp(head + (right ? 1 : -1), 0, text.length);
  } else {
    const down = e.key === 'ArrowDown';
    if (e.metaKey) o = down ? text.length : 0;
    else if (g) {
      const c = g.caretAt(head, 'after');
      if (c) {
        const gx = goalX ?? c.x;
        const lines = [...(g.lines as Map<number, unknown>).keys()].filter((n) => (g.lineStops(n) as unknown[]).length).sort((a, b) => a - b);
        const next = lines[lines.indexOf(c.line) + (down ? 1 : -1)];
        o = next == null ? (down ? text.length : 0) : g.stopNear(next, gx).o;
        goalX = gx;
      }
    }
  }
  if (e.shiftKey) {
    const a = anchor ?? (sel ? (head === sel.from ? sel.to : sel.from) : caret());
    anchor = a;
    if (o === a) doAct({ key: 'caret', at: o });
    else doAct({ key: 'select', at: Math.min(a, o), to: Math.max(a, o) });
  } else {
    anchor = null;
    doAct({ key: 'caret', at: o });
  }
}

window.addEventListener('keydown', (e) => {
  if (phase === 'countdown' || phase === 'recording') keys.push({ t: T(), e: 'd', code: e.code, key: e.key, ...(e.repeat ? { r: 1 as const } : {}), ...(mods(e) ? { m: mods(e) } : {}) });
  if (phase !== 'recording') {
    if (phase === 'countdown' && !e.metaKey) e.preventDefault();
    return;
  }
  focusSink();
  lastKeyAt = T();
  if (e.isComposing || e.key === 'Dead' || e.key === 'Process') return; // a letter being composed (´ then e): its input comes later
  if (e.metaKey || e.ctrlKey) {
    const kk = e.key.toLowerCase();
    if (kk === 'z' && !e.shiftKey) doAct({ key: 'Meta+z' });
    else if (kk === 'u') doAct({ key: 'Meta+u' });
    else if (kk === 'b') doAct({ key: 'Meta+b' });
    else if (e.key === 'Enter') doAct({ key: 'Meta+Enter' });
    else if (e.key.startsWith('Arrow')) moveCaret(e);
    e.preventDefault(); // nothing else: no reload, no paste, no select all
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    goalX = null; anchor = null;
    if (run.selection) { doAct({ key: 'Backspace' }); return; }
    // Backspace at a crossed-out word: crossed out again, harder each time; held, one pass every AGAIN_EVERY,
    // until it's inked out; a fresh press after that deletes as usual (the writing page's rule)
    const t = T();
    if (e.repeat && againHeld && t - lastAgain < AGAIN_EVERY) return;
    run.runTo(t);
    const r = run.view.pending || run.view.mid ? null : engine.again(run.sheet, run.view, caret());
    const max = r && !r.events.length;
    if (!r || (max && !e.repeat)) { againHeld = false; doAct({ key: 'Backspace' }); return; }
    if (max) return; // held past inked out: it stays there
    againHeld = true; lastAgain = t;
    doAct({ key: 'Again', at: caret() });
    return;
  }
  againHeld = false;
  if (e.key === 'Enter') { e.preventDefault(); goalX = null; anchor = null; doAct({ key: 'Enter' }); return; }
  if (e.key.startsWith('Arrow')) { e.preventDefault(); moveCaret(e); return; }
  if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); return; }
  goalX = null; anchor = null;
  // letters come through the textarea's input (any keyboard layout, accents composed)
}, true);
window.addEventListener('keyup', (e) => {
  if (phase === 'countdown' || phase === 'recording') keys.push({ t: T(), e: 'u', code: e.code, key: e.key, ...(mods(e) ? { m: mods(e) } : {}) });
  if (e.key === 'Backspace' || e.key === 'Delete') againHeld = false;
}, true);
// a letter composed from two keys (´ then e) arrives once, at the end of its composition
let composing = false;
let composed: { data: string; at: number } | null = null;
sink.addEventListener('beforeinput', (e) => {
  if (e.inputType === 'insertCompositionText' || composing) return;
  e.preventDefault();
  if (phase !== 'recording') return;
  if (composed && e.data === composed.data && performance.now() - composed.at < 80) return;
  if (e.inputType === 'insertText' && e.data) for (const ch of e.data) doAct({ key: ch });
});
sink.addEventListener('compositionstart', () => { composing = true; });
sink.addEventListener('compositionend', (e) => {
  composing = false;
  if (phase === 'recording' && e.data) { for (const ch of e.data) doAct({ key: ch }); composed = { data: e.data, at: performance.now() }; }
  sink.value = '';
});
sink.addEventListener('input', () => { if (!composing) sink.value = ''; });
sink.addEventListener('blur', () => { if (phase === 'recording' || phase === 'countdown') window.setTimeout(focusSink, 0); });

// ---------- the pointer ----------
function onSheet(e: PointerEvent | MouseEvent) {
  const r = sheetEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
const logPointer = (e: PointerEvent, kind: 'm' | 'd' | 'u') => {
  if (phase !== 'recording' && phase !== 'countdown') return;
  const p = onSheet(e);
  pointer.push({ t: T(), e: kind, x: Math.round((p.x / k) * 100) / 100, y: Math.round((p.y / k) * 100) / 100 });
};
window.addEventListener('pointermove', (e) => {
  logPointer(e, 'm');
  if (drag && phase === 'recording') { const p = onSheet(e); drag.b = hit(p.x, p.y); }
}, true);
$('desk').addEventListener('pointerdown', (e) => {
  logPointer(e, 'd');
  if (phase !== 'recording' || e.button !== 0) return;
  e.preventDefault();
  focusSink();
  const p = onSheet(e);
  const o = hit(p.x, p.y);
  drag = { a: o, b: o };
  goalX = null; anchor = null;
});
window.addEventListener('pointerup', (e) => {
  logPointer(e, 'u');
  if (!drag || phase !== 'recording') { drag = null; return; }
  const p = onSheet(e);
  drag.b = hit(p.x, p.y);
  const { a, b } = drag;
  drag = null;
  lastKeyAt = T();
  if (a === b) doAct({ key: 'click', at: a });
  else doAct({ key: 'select', at: Math.min(a, b), to: Math.max(a, b) });
}, true);
$('desk').addEventListener('dblclick', (e) => {
  if (phase !== 'recording') return;
  const p = onSheet(e);
  const text = run.text();
  const o = hit(p.x, p.y);
  let a = o, b = o;
  while (a > 0 && /[\p{L}\p{N}'’-]/u.test(text[a - 1])) a--;
  while (b < text.length && /[\p{L}\p{N}'’-]/u.test(text[b])) b++;
  if (b > a) doAct({ key: 'select', at: a, to: b });
});

// ---------- the camera ----------
let stream: MediaStream | null = null;
let rec: MediaRecorder | null = null;
let chunks: Blob[] = [];
let camMime = '';
let camStart = 0;
let camSettings: MediaTrackSettings = {};
async function cameraOn() {
  const btn = $<HTMLButtonElement>('cam');
  btn.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      // the beeps come out of this Mac: echo cancelling would take them out of the recording, and noise
      // suppression the key clicks
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const v = $<HTMLVideoElement>('preview');
    v.srcObject = stream;
    await v.play().catch(() => undefined);
    camSettings = stream.getVideoTracks()[0]?.getSettings() ?? {};
    $('camState').textContent = `Camera on: ${camSettings.width}×${camSettings.height}`;
    document.body.dataset.cam = 'on';
    btn.textContent = 'Camera on';
  } catch (err) {
    $('camState').textContent = `No camera: ${(err as Error).message}. You can still record the typing.`;
    btn.disabled = false;
  }
}
function startCamera() {
  if (!stream) return;
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  camMime = types.find((x) => MediaRecorder.isTypeSupported(x)) ?? '';
  chunks = [];
  rec = new MediaRecorder(stream, { ...(camMime ? { mimeType: camMime } : {}), videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstart = () => { camStart = T(); };
  rec.start(1000);
}
const stopCamera = () => new Promise<Blob | null>((res) => {
  if (!rec || rec.state === 'inactive') { res(null); return; }
  rec.onstop = () => res(new Blob(chunks, { type: camMime || 'video/webm' }));
  rec.stop();
});

// ---------- the beeps ----------
let audio: AudioContext | null = null;
/** how long sound takes from the page to the speakers, s (measured once the sound is running) */
let latency = 0;
/** a beep at take time `at` (s), logged at the moment it leaves the speakers */
function beep(at: number, hz: number, dur: number, what: string) {
  const ctx = audio!;
  const ts = ctx.getOutputTimestamp();
  const nowCtx = ts.contextTime ?? ctx.currentTime;
  const nowPerf = ts.performanceTime || performance.now();
  const when = nowCtx + (t0 + at * 1000 - nowPerf) / 1000;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = hz;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.5, when + 0.005);
  g.gain.setValueAtTime(0.5, when + dur - 0.01);
  g.gain.linearRampToValueAtTime(0, when + dur);
  o.connect(g).connect(ctx.destination);
  o.start(when); o.stop(when + dur + 0.02);
  beeps.push({ t: at + latency, hz, dur, what });
}

// ---------- start, finish, save ----------
async function start() {
  audio ??= new AudioContext({ latencyHint: 'interactive' });
  await audio.resume();
  // a moment for the sound to start running, so its timing and its delay to the speakers are known
  await new Promise((r) => window.setTimeout(r, 150));
  latency = (audio as any).outputLatency || audio.baseLatency || 0;
  run = new InkRun();
  acts.length = 0; keys.length = 0; pointer.length = 0; beeps.length = 0; shownToasts = 0;
  sheets = 1; layout();
  t0 = performance.now();
  startCamera();
  phase = 'countdown';
  document.body.dataset.phase = phase;
  focusSink();
  // three beeps a second apart, then a higher one: write
  GO = 4;
  [1, 2, 3].forEach((s) => beep(s, 880, 0.12, `count ${4 - s}`));
  beep(GO, 1320, 0.3, 'go');
  const cd = $('count');
  [1, 2, 3].forEach((s) => window.setTimeout(() => { cd.textContent = String(4 - s); cd.dataset.on = '1'; }, s * 1000));
  window.setTimeout(() => {
    cd.dataset.on = '';
    phase = 'recording';
    document.body.dataset.phase = phase;
    lastKeyAt = T();
    focusSink();
  }, GO * 1000);
}
async function finish() {
  if (phase !== 'recording') return;
  END = T();
  run.runTo(END);
  phase = 'finishing';
  document.body.dataset.phase = phase;
  // two beeps to close: the phone hears where the take ends
  beep(END + 0.3, 660, 0.12, 'end 1');
  beep(END + 0.7, 660, 0.12, 'end 2');
  await new Promise((r) => window.setTimeout(r, 1400));
  const face = await stopCamera();
  phase = 'done';
  document.body.dataset.phase = phase;
  inkDirty = true;
  await save(face);
}
let lastZip: { blob: Blob; name: string } | null = null;
async function save(face: Blob | null) {
  $('saved').textContent = 'Saving…';
  const nav = navigator as any;
  let layoutMap: Record<string, string> | null = null;
  try { const m = await nav.keyboard?.getLayoutMap?.(); if (m) { layoutMap = {}; m.forEach((v: string, kk: string) => { layoutMap![kk] = v; }); } } catch { /* not offered */ }
  const ext = camMime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const result = run.result(END);
  const take = {
    version: 1,
    made: new Date().toISOString(),
    what: 'A typing take from the If This Finds You typing recorder (x-post-template/recorder). Times in seconds from Start.',
    settings: { hand: HAND, paper: PAPER, measure: MEASURE, salt: SALT, penSpeed: PEN_SPEED, againEvery: AGAIN_EVERY },
    browser: navigator.userAgent, language: navigator.language, screen: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    keyboardLayout: layoutMap,
    sheetMm: { w: paper.w, h: paper.h },
    go: GO, end: END,
    beeps, acts, keys, pointer,
    camera: face ? { file: `face.${ext}`, mime: camMime, startedAt: camStart, settings: camSettings } : null,
    // what this page wrote, so the replay can check it writes the same
    check: { text: result.text, events: result.events.length, states: result.states.length, hash: hash(JSON.stringify(result.events)) },
  };
  const files: { name: string; data: Blob | string }[] = [{ name: 'take.json', data: JSON.stringify(take) }];
  if (face) files.push({ name: `face.${ext}`, data: face });
  try { localStorage.setItem('typing-take-last', JSON.stringify(take)); } catch { /* too big for storage: the zip has it */ }
  const blob = await zip(files);
  const d = new Date();
  const name = `Typing take ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} at ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}.zip`;
  lastZip = { blob, name };
  download();
  $('saved').innerHTML = `Saved to Downloads as <b>${name}</b>${face ? '' : ' (typing only, no camera)'}.`;
}
function download() {
  if (!lastZip) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastZip.blob);
  a.download = lastZip.name;
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60_000);
}
function hash(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }

// ---------- wiring ----------
$('cam').addEventListener('click', cameraOn);
$('start').addEventListener('click', () => { void start(); });
$('finish').addEventListener('click', () => { void finish(); });
$('again').addEventListener('click', () => { window.location.reload(); });
$('resave').addEventListener('click', download);
window.addEventListener('beforeunload', (e) => { if (phase === 'recording' || phase === 'finishing' || phase === 'countdown') { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('resize', () => layout());
window.addEventListener('blur', () => { drag = null; });
document.body.dataset.phase = phase;
if (!/Chrome\//.test(navigator.userAgent) || /Edg\//.test(navigator.userAgent)) $('browser').hidden = false;
try { engine.warmCanvas?.(); } catch { /* warmed on first use */ }
layout();
requestAnimationFrame(frame);
