// The scene: one letter writing itself out on its paper, framed for a phone screen, as a pure function of
// video time. draw(ctx, v) paints the frame at v seconds; the recorder steps v frame by frame, the preview
// steps it with the clock, so the file and the preview are the same pictures.
//
// Per frame: desk, the sheet (painted once by the app's own paper painter, with its shadow), the ink drawn by
// the engine's canvas renderer (render-canvas.js, density ink, Beer–Lambert colour) up to the pen's position
// at that moment (animate.js frameAt), multiplied over the paper, then the signature and the credit.
import * as E from '@engine';
import { makeHand, withOverrides, type Hand } from '@engine';
import { requestFor } from '@/lib/request';
import { getPaper, paintPaper, type PaperSpec } from '@/lib/papers';
import { liveExtras, liveLayout, sheetOfLine, type Live } from '@/lib/live';
import { decodeInk, inkLive, inkPage } from '@/lib/ink';
import { sampleById, sampleCredit } from '@/lib/samples';
import type { NoteState } from '@/lib/state';
import { fitSpeed, handAt, workAt, workClock, type Speed, type WorkClock } from './pacing';
import type { Aspect, Branding, Ev, Framing, Timeline } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;

const DESK = '#eeebe4';
const TEXT_MUTED = '#6c685f';
const UI_INK_SOFT = '#3b4152';
const FONT = '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", ui-sans-serif, system-ui, sans-serif';
const WORDMARK = 'If This Finds You';

export const ASPECTS: Record<Aspect, number> = { '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9, '9:16': 9 / 16 };

/** Lines mode writes at most this many lines, and never faster than LINES_TOP_SPEED x a real hand. */
const MAX_LINES = 10;
const LINES_TOP_SPEED = 8;
/** The smallest x-height that still reads on a phone, as a share of the frame's short side. */
const LEGIBLE_XH = 0.016;
const CAM_HZ = 60;

export interface SceneOptions {
  aspect: Aspect;
  framing: Framing;
  /** longest clip, s */
  maxSeconds: number;
  width: number;
  height: number;
  fps: number;
  /** ink supersampling */
  ss: number;
  branding: Required<Branding>;
  credit: string | null | undefined;
  /** GIF: end by fading back to the blank sheet, so the loop point is seamless */
  loop: boolean;
  /** GIF: never move the camera (a moving frame changes every pixel) */
  still: boolean;
}

export interface Scene {
  width: number;
  height: number;
  fps: number;
  frames: number;
  seconds: number;
  credit: string | null;
  /** for file names */
  slug: string;
  pace: { lines: number; topSpeed: number; writeSeconds: number };
  /** the finished letter with its credit showing (the GIF palette, a poster frame) */
  poster: number;
  /** paint the frame at video time v (seconds) */
  draw(ctx: CanvasRenderingContext2D, v: number): void;
}

interface Cam { s: number; cx: number; cy: number }

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const easeInOut = (x: number) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const ramp = (v: number, a: number, len: number) => (len <= 0 ? (v >= a ? 1 : 0) : smooth((v - a) / len));

/** Even output sizes (H.264 wants them) for an aspect. */
export function frameSize(aspect: Aspect, kind: 'video' | 'gif', width?: number) {
  const r = ASPECTS[aspect];
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
  if (width) return { width: even(width), height: even(width / r) };
  if (kind === 'video') return r >= 1 ? { width: even(1080 * r), height: 1080 } : { width: 1080, height: even(1080 / r) };
  // GIF: about 560 thousand pixels whatever the shape (670 x 836 at 4:5), so files stay small enough to post
  const w = Math.sqrt(560_000 * r);
  return { width: even(w), height: even(w / r) };
}

/** Build the scene for a note (the app's state). Async only for fonts and the signature's raster. */
export async function buildScene(state: NoteState, o: SceneOptions): Promise<Scene> {
  // ---- the letter, laid out exactly as the app lays it out (lib/live.ts, lib/ink.ts)
  const natural = makeHand(state.seed, state.style);
  const req = requestFor(state, natural);
  const p: Hand = withOverrides(natural, req.overrides);
  const paper = getPaper(req.paper);
  // First lines, close up: in a tall frame the full line is too wide to read big, so the letter flows into a
  // narrower column on the same sheet (same hand, same paper and size; the lines just break sooner), and the
  // block of opening lines comes out about the frame's shape. A wide frame keeps the paper's own measure.
  const measure = o.framing === 'lines' ? clamp(Math.sqrt(ASPECTS[o.aspect] / (16 / 9)), 0.5, 1) : 1;
  const lay: PaperSpec = measure < 1
    ? { ...paper, text: { ...paper.text, right: paper.text.left + (paper.text.right - paper.text.left) * measure } }
    : paper;
  const doc = req.ink ? decodeInk(req.ink) : null;
  const live: Live = doc
    ? inkLive(p, inkPage(p, doc, lay, req.size, req.lineSpacing), lay, req.size, req.lineSpacing)
    : liveLayout(p, req.text, lay, req.size, req.lineSpacing, !!req.signed);
  const page = live.page;
  const items = page.items as any[];
  const u = live.unitsPerMm;
  const onFirst = items.map((it) => sheetOfLine(live, it.line) === 0);

  // ---- what gets written: sheet 1 (page), or its opening lines (lines)
  const all: Timeline = engine.timeline(page, { lead: 0 });
  let cut = all.events.findIndex((e) => !onFirst[e.item]);
  if (cut < 0) cut = all.events.length;
  const sheetEvents = all.events.slice(0, cut);
  // lines in the order they're first written
  const rank = new Map<number, number>();
  const evRank = sheetEvents.map((e) => {
    if (!rank.has(e.line)) rank.set(e.line, rank.size);
    return rank.get(e.line)!;
  });
  const lead = 0.5;
  const hold = o.loop ? 2.2 : 3.0;
  const loopOut = o.loop ? 1.0 : 0;
  const zoomed = !o.still && o.framing === 'page'; // may need a pull back at the end (decided below)
  const budgetFor = (pull: boolean) => Math.max(2, o.maxSeconds - lead - hold - loopOut - (pull ? 1.4 : 0));
  const prefix = (n: number) => { const i = evRank.findIndex((r) => r >= n); return i < 0 ? sheetEvents.length : i; };
  const fullClock = workClock(sheetEvents);
  const workTo = (end: number) => (end > 0 ? workAt(fullClock, end - 1) : 0);

  const textW = lay.text.right - lay.text.left;
  const textCx = (lay.text.left + lay.text.right) / 2;
  // the opening lines: the writing area fills the width
  const fitText = Math.min((o.width * 0.92) / textW, o.height / (live.lineMm * 7.5));
  let nLines = rank.size;
  if (o.framing === 'lines') {
    // as many lines as sit in the frame below a 14% top margin and above the caption, so the camera stays
    // still: ascenders of the first line to descenders of the last in 66% of the height (lines drift: 4% slack)
    const vh = o.height / fitText, xh = paper.xh * req.size;
    const fit = Math.floor((0.66 * vh - 3.6 * xh) / (live.lineMm * 1.04)) + 1;
    nLines = Math.max(1, Math.min(MAX_LINES, fit, rank.size));
    while (nLines > 1 && fitSpeed(workTo(prefix(nLines)), budgetFor(false)).top > LINES_TOP_SPEED) nLines--;
  }
  const events: Ev[] = sheetEvents.slice(0, prefix(nLines));
  const last = events[events.length - 1];
  const tl: Timeline = { events, duration: last ? last.t0 + last.dur : 0 };
  const clock: WorkClock = workClock(events);
  const wholeSheet = nLines >= rank.size;
  // the written block on the sheet (mm): pen positions, from the first letter's left to the last one's advance
  const blk = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const e of events) {
    const it = items[e.item], x = it.x / u, y = it.y / u;
    blk.x0 = Math.min(blk.x0, x); blk.x1 = Math.max(blk.x1, x + (it.g?.advance ?? 0) / u);
    blk.y0 = Math.min(blk.y0, y); blk.y1 = Math.max(blk.y1, y);
  }
  if (!events.length) Object.assign(blk, { x0: lay.text.left, x1: lay.text.right, y0: live.firstMm, y1: live.firstMm });

  // ---- credit and wordmark (they shape the framing: the whole sheet leaves a strip of desk for them)
  const sample = sampleById(state.sample);
  const credit = !o.branding.credit ? null : o.credit !== undefined ? o.credit : sample ? sampleCredit(sample) : null;
  const wordmark = o.branding.wordmark;
  if (credit || wordmark) await loadFonts();
  const slug = (sample?.id ?? `${state.seed}`).replace(/[^a-z0-9-]+/gi, '-').toLowerCase();

  // ---- the camera
  const W = o.width, H = o.height;
  const xhMm = paper.xh * req.size;
  const fs = captionSize(W, H);
  const band = credit || wordmark ? Math.max(0.07 * H, 3.4 * fs) : 0.05 * H;
  // whole sheet: centred above the caption strip, with a margin of desk all round
  const fitPage = Math.min((W * 0.88) / paper.w, (H * 0.95 - band) / paper.h);
  let sWrite: number, sEnd: number;
  if (o.framing === 'lines') {
    // close on what's written: its lines fill the width, centred (ragged lines end short of the measure)
    const byWidth = (W * 0.86) / Math.max(1, blk.x1 - blk.x0), byHeight = (H * 0.7) / (blk.y1 - blk.y0 + 3.6 * xhMm);
    sWrite = sEnd = Math.max(fitPage, fitText, Math.min(byWidth, byHeight, fitText * 1.35));
  } else {
    const legible = (LEGIBLE_XH * Math.min(W, H)) / xhMm;
    sWrite = o.still ? fitPage : Math.max(fitPage, Math.min(fitText, legible));
    sEnd = fitPage;
  }
  const pull = zoomed && sWrite > fitPage * 1.02;
  if (!pull) sEnd = sWrite;
  const speed: Speed = fitSpeed(clock.total, budgetFor(pull));
  const tWrite0 = lead, tWrite1 = lead + speed.seconds;
  const tPull1 = tWrite1 + (pull ? 1.4 : 0);
  const tHold1 = tPull1 + hold;
  const seconds = tHold1 + loopOut;

  // a still camera sits on whole pixels, so paper rules and ink stay crisp
  const snap = (c: Cam): Cam => {
    const ox = Math.round(W / 2 - c.cx * c.s), oy = Math.round(H / 2 - c.cy * c.s);
    return { s: c.s, cx: (W / 2 - ox) / c.s, cy: (H / 2 - oy) / c.s };
  };
  // the whole sheet, centred in the frame above the caption strip
  const pageCam = (s: number): Cam => snap({ s, cx: paper.w / 2, cy: paper.h / 2 + band / (2 * s) });
  const endCam = o.framing === 'page' ? pageCam(sEnd) : null;
  const camAt = buildCamera();

  function buildCamera(): (v: number) => Cam {
    if (o.framing === 'page' && !pull) { const c = pageCam(sWrite); return () => c; }
    const Vh = H / sWrite, Vw = W / sWrite;
    const cx = Vw >= paper.w ? paper.w / 2 : o.framing === 'lines' ? (blk.x0 + blk.x1) / 2 : textCx;
    const mTop = 0.08 * Vh, mBot = 0.08 * Vh;
    let topMin: number, topMax: number, top: number;
    let still = false;
    if (o.framing === 'lines') {
      // close on the lines, starting near the top of the frame; the sheet's top edge stays just out of view
      const { y0, y1 } = blk;
      topMin = 0;
      topMax = Math.max(0, paper.h - Vh);
      // the whole block in view from the start when it fits (it does, by the choice of nLines and the zoom):
      // no pan. It sits 14% from the top, a little higher if it's tall, ending by 86% (the credit goes below).
      const blockTop = y0 - 2.2 * xhMm, blockH = y1 + 1.4 * xhMm - blockTop;
      still = blockH <= 0.9 * Vh;
      top = blockTop - (still ? Math.min(0.14 * Vh, Math.max(0.03 * Vh, 0.86 * Vh - blockH)) : 0.14 * Vh);
    } else {
      topMin = -mTop;
      topMax = Math.max(topMin, paper.h + mBot - Vh);
      top = -mTop;
    }
    top = clamp(top, topMin, topMax);
    // where the pen is: the baseline of the line it writes on, sampled at CAM_HZ through the writing
    const n = Math.max(1, Math.ceil(speed.seconds * CAM_HZ) + 1);
    const tops = new Float64Array(n);
    still ||= o.still;
    for (let i = 0; i < n; i++) {
      const t = handAt(tl, clock, speed, i / CAM_HZ);
      const f = engine.frameAt(tl, t);
      const e: Ev | undefined = f.active ?? events[Math.max(0, f.done - 1)];
      if (e) {
        const y = items[e.item].y / u;
        // keep the line in the upper 72% (room for descenders and the credit); when it leaves, bring it to mid-frame
        if (!still && (y > top + 0.72 * Vh || y < top + 0.12 * Vh)) top = clamp(y - 0.5 * Vh, topMin, topMax);
      }
      tops[i] = top;
    }
    // a gentle, symmetric smoothing: the camera eases into each move instead of jumping
    const sig = 0.55 * CAM_HZ, R = Math.ceil(3 * sig);
    const k = Array.from({ length: 2 * R + 1 }, (_, j) => Math.exp(-((j - R) ** 2) / (2 * sig * sig)));
    const ksum = k.reduce((a, b) => a + b, 0);
    const smoothTops = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = -R; j <= R; j++) acc += k[j + R] * tops[clamp(i + j, 0, n - 1)];
      smoothTops[i] = acc / ksum;
    }
    const moves = smoothTops.some((t) => Math.abs(t - smoothTops[0]) > 1e-6);
    const writeCam = (i: number): Cam => {
      const c = { s: sWrite, cx, cy: smoothTops[clamp(i, 0, n - 1)] + Vh / 2 };
      return moves ? c : snap(c);
    };
    return (v: number): Cam => {
      if (v >= tWrite1 && pull && endCam) {
        const a = writeCam(n - 1);
        const x = easeInOut((v - tWrite1) / (tPull1 - tWrite1));
        if (x >= 1) return endCam;
        // zoom in log space so the pull back feels even
        const s = Math.exp(Math.log(a.s) + (Math.log(endCam.s) - Math.log(a.s)) * x);
        return { s, cx: a.cx + (endCam.cx - a.cx) * x, cy: a.cy + (endCam.cy - a.cy) * x };
      }
      const f = clamp((v - tWrite0) * CAM_HZ, 0, n - 1);
      const i = Math.floor(f);
      if (!moves || i >= n - 1) return writeCam(i);
      const a = writeCam(i), b = writeCam(i + 1), w = f - i;
      return { s: a.s, cx: a.cx, cy: a.cy + (b.cy - a.cy) * w };
    };
  }

  // where the caption goes, from the closing shot: on the desk below the sheet when there's room, else on the paper
  const caption = (() => {
    const c = camAt(seconds);
    const bottom = H / 2 - c.cy * c.s + paper.h * c.s;
    const room = H - bottom;
    // under the sheet, a label lined up with its edges; on the paper, the frame's margins
    const left = W / 2 - c.cx * c.s, right = left + paper.w * c.s;
    if (room >= 2.6 * fs) return { base: Math.round(bottom + Math.min(room / 2, 1.9 * fs) + 0.36 * fs), ground: DESK, left: Math.max(left, W * 0.04), right: Math.min(right, W * 0.96) };
    return { base: Math.round(H - Math.max(Math.min(W, H) * 0.06, fs * 2)), ground: paper.tint, left: W * 0.06, right: W * 0.94 };
  })();

  // ---- the sheet, painted once at the largest scale it's shown at, with its shadow
  const kSheet = Math.max(sWrite, sEnd);
  const sheet = paintSheet(paper, kSheet);

  // ---- the ink: flat colour when the engine doesn't model ink, else the swatch (or the pen's own)
  const inkOpt = req.inkKey ? (req.inkKey === 'auto' ? undefined : req.inkKey) : req.inkColor;
  const inkHex = solidInk(p, inkOpt) ?? req.inkColor;
  const firstItems = items.map((it, i) => (onFirst[i] && (it.kind === 'glyph' || it.kind === 'mark' || it.kind === 'miss') ? i : -1)).filter((i) => i >= 0)
    // lines mode: only the lines being written (and placeholders on them)
    .filter((i) => wholeSheet || rank.has(items[i].line) && rank.get(items[i].line)! < nLines);
  // event index of each item's strokes
  const evOf = new Map<number, Int32Array>();
  events.forEach((e, n) => {
    let a = evOf.get(e.item);
    if (!a) { a = new Int32Array(items[e.item].g.strokes.length).fill(-1); evOf.set(e.item, a); }
    a[e.stroke] = n;
  });
  const hasMisses = firstItems.some((i) => items[i].kind === 'miss');
  const inkCanvas = document.createElement('canvas');
  // warm the shared GL context with real ink once: its first draw must have segments (an empty first draw
  // leaves the instance buffer unset in render-canvas.js), and the shaders compile here, not on frame 1
  engine.renderCanvas(inkCanvas, p, { ...page, items: firstItems.map((i) => items[i]) }, { width: 64, height: 64, emPx: 8, dpr: 1, ink: inkOpt, paper: { transparent: true }, style: false });
  let inkKey = '';
  let shifted: any[] = [];
  let shiftKey = '';
  let fr = { done: 0, active: null as Ev | null, frac: 0 };
  const reveal = (it: any, si: number) => {
    const a = evOf.get(it.__i);
    const n = a ? a[si] : -1;
    if (n < 0) return 0;
    return n < fr.done ? 1 : fr.active && n === fr.done ? fr.frac : 0;
  };

  // ---- the signature, underlines, pressed letters: they land when the writing is done (as in the reader)
  let extras: HTMLCanvasElement | null = null;
  if (wholeSheet) {
    const markup = liveExtras(live, { marks: doc ? [] : req.marks ?? [], signed: !!req.signed, writerName: req.writerName ?? '', text: page.text })[0] ?? '';
    if (markup) extras = await rasterExtras(live, paper, markup, inkHex, kSheet);
  }

  // fades
  const inkAlpha = (v: number) => (o.loop ? 1 - ramp(v, tHold1, loopOut * 0.7) : 1);
  const extrasAlpha = (v: number) => ramp(v, tWrite1, 0.4) * inkAlpha(v);
  const captionAlpha = (v: number) => ramp(v, tPull1 + 0.3, 0.8) * inkAlpha(v);

  function draw(ctx: CanvasRenderingContext2D, v: number) {
    const cam = camAt(v);
    const ox = W / 2 - cam.cx * cam.s, oy = H / 2 - cam.cy * cam.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = DESK;
    ctx.fillRect(0, 0, W, H);
    // the sheet
    const ks = cam.s / kSheet;
    ctx.drawImage(sheet.canvas, ox - sheet.pad * ks, oy - sheet.pad * ks, sheet.canvas.width * ks, sheet.canvas.height * ks);

    // the ink up to the pen
    const a = inkAlpha(v);
    if (a > 0 && events.length) {
      const t = v < tWrite0 ? -1 : handAt(tl, clock, speed, v - tWrite0);
      fr = t < 0 ? { done: 0, active: null, frac: 0 } : engine.frameAt(tl, t);
      const emPx = live.emMm * cam.s;
      const x0U = (-ox / cam.s) * u, y0U = (-oy / cam.s) * u;
      const sk = `${x0U.toFixed(3)}|${y0U.toFixed(3)}|${emPx.toFixed(4)}`;
      if (sk !== shiftKey) {
        shifted = firstItems.map((i) => ({ ...items[i], x: items[i].x - x0U, y: items[i].y - y0U, __i: i }));
        shiftKey = sk;
      }
      const key = `${sk}|${fr.done}|${fr.active ? fr.frac.toFixed(4) : '-'}`;
      const any = fr.done > 0 || (!!fr.active && fr.frac > 0);
      if (!any) inkKey = '';
      else if (key !== inkKey) {
        // pencil placeholders (characters this hand can't write yet) appear when the pen gets to them
        const pen = fr.active ? fr.active.item : fr.done > 0 ? events[fr.done - 1].item : -1;
        const drawn = hasMisses ? shifted.filter((it) => it.kind !== 'miss' || it.__i < pen) : shifted;
        engine.renderCanvas(inkCanvas, p, { ...page, items: drawn }, {
          width: W, height: H, emPx, dpr: o.ss, ink: inkOpt, paper: { transparent: true }, reveal, style: false,
        });
        inkKey = key;
      }
      if (any) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = a;
        ctx.drawImage(inkCanvas, 0, 0, W, H);
      }
    }
    // the extra ink
    const ea = extras ? extrasAlpha(v) : 0;
    if (extras && ea > 0) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = ea;
      ctx.drawImage(extras, ox, oy, extras.width * ks, extras.height * ks);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // credit and wordmark
    const ca = captionAlpha(v);
    if (ca > 0 && (credit || wordmark)) drawCaption(ctx, fs, ca, credit, wordmark, caption);
  }

  return {
    width: W, height: H, fps: o.fps, frames: Math.ceil(seconds * o.fps), seconds, credit, slug,
    pace: { lines: nLines, topSpeed: speed.top, writeSeconds: speed.seconds },
    poster: Math.max(0, tHold1 - 0.05),
    draw,
  };
}

/** The sheet with its shadow, painted at k px per mm by the app's paper painter (lib/papers.ts). */
function paintSheet(paper: PaperSpec, k: number) {
  const pad = Math.ceil(30 * (k / 4));
  const c = document.createElement('canvas');
  c.width = Math.round(paper.w * k) + 2 * pad;
  c.height = Math.round(paper.h * k) + 2 * pad;
  const ctx = c.getContext('2d')!;
  const w = Math.round(paper.w * k), h = Math.round(paper.h * k);
  // the app's --sheet-shadow (index.css), at the app's ~4 px per mm. Each layer is a rect grown by its
  // spread (negative: shrunk) casting the shadow; the paper painted over it hides the rect itself.
  const f = k / 4;
  for (const [y, blur, spread, a] of [[0.5, 0, 0, 0.08], [1, 2, 0, 0.06], [6, 14, -6, 0.12], [24, 48, -20, 0.2]] as const) {
    const s = spread * f;
    ctx.save();
    ctx.shadowColor = `rgba(60,45,20,${a})`;
    ctx.shadowBlur = blur * f;
    ctx.shadowOffsetY = y * f;
    ctx.fillStyle = paper.tint;
    ctx.fillRect(pad - s, pad - s, w + 2 * s, h + 2 * s);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(pad, pad);
  paintPaper(ctx, paper, { pxPerMm: k, grainScale: k / 3.5, holeFill: DESK });
  ctx.restore();
  return { canvas: c, pad };
}

/** The extra ink (SVG markup in the app's reference px) as a raster at k px per mm. */
async function rasterExtras(live: Live, paper: PaperSpec, markup: string, ink: string, k: number) {
  const w = Math.round(paper.w * k), h = Math.round(paper.h * k);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${live.widthPx} ${live.heightPx}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/><g fill="${ink}" fill-opacity="0.92">${markup}</g></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return c;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A solid colour for this hand's ink (for the signature), from the engine's ink model when it has one. */
function solidInk(p: Hand, ink: string | undefined): string | null {
  if (typeof engine.inkModel !== 'function' || typeof engine.inkRGB !== 'function') return null;
  const m = engine.inkModel(p, ink);
  if (!m) return null;
  const rgb: number[] = engine.inkRGB(m, 1.6);
  return '#' + rgb.map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('');
}

async function loadFonts() {
  try {
    await Promise.all([document.fonts.load(`500 24px ${FONT}`), document.fonts.load(`600 24px ${FONT}`)]);
  } catch { /* the system sans is fine */ }
}

const captionSize = (W: number, H: number) => Math.max(11, Math.round(Math.min(W, H) * 0.0215));

/** The credit (left) and wordmark (right) on one baseline; stacked when they don't fit side by side. */
function drawCaption(
  ctx: CanvasRenderingContext2D, fs: number, alpha: number, credit: string | null, wordmark: boolean,
  at: { base: number; ground: string; left: number; right: number },
) {
  const { base, ground } = at;
  const left = Math.round(at.left), right = Math.round(at.right);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign, tracking = 0) => {
    ctx.font = font;
    ctx.textAlign = align;
    (ctx as any).letterSpacing = `${tracking}px`;
    // a soft halo in the ground colour keeps paper rules out of the letters
    ctx.strokeStyle = ground;
    ctx.globalAlpha = alpha * 0.85;
    ctx.lineWidth = fs * 0.42;
    ctx.strokeText(s, x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };
  const creditFont = `500 ${fs}px ${FONT}`;
  const markFont = `550 ${Math.round(fs * 0.96)}px ${FONT}`;
  ctx.font = creditFont;
  const cw = credit ? ctx.measureText(credit).width : 0;
  ctx.font = markFont;
  const mw = wordmark ? ctx.measureText(WORDMARK).width : 0;
  const fitsOneLine = cw + mw + fs * 2 <= right - left;
  if (credit) text(credit, left, fitsOneLine || !wordmark ? base : base - Math.round(fs * 1.55), creditFont, TEXT_MUTED, 'left');
  if (wordmark) text(WORDMARK, fitsOneLine ? right : left, base, markFont, UI_INK_SOFT, fitsOneLine ? 'right' : 'left', fs * -0.01);
  ctx.restore();
}
