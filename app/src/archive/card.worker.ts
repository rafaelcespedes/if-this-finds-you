// Writes the index cards off the main thread. A card is the letter itself: a whole sheet of its paper (the tool's
// painter, with its real edges, no shadow, transparent around it), letter-sized and as tall as the page asked
// (CardRequest.aspect, from the letter's length, so the grid never moves when cards arrive), with the letter written
// on it in its own hand by the engine, whole lines only. One small image (WebP) per card; the page decides the
// order (visible cards first) and keeps the results.
import './worker-shim';
import * as E from '@engine';
import { layout, makeHand } from '@engine';
import { liveLayout } from '@/lib/live';
import { isShaped, paintPaper } from '@/lib/papers';
import { setWearLevel, wornPaper } from '@/lib/paper/wear';
import { lookFor, renderingOf } from './look';
import type { CardRequest, CardResult, CardWarm } from './card-protocol';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;
const post = (msg: CardResult) => (self as unknown as Worker).postMessage(msg);
/** A card's sheet is at most this wide (mm): A5, the size most of the stationery is. */
const CARD_SHEET_MM = 148;

/**
 * The ink multiplied into the paper, pixel by pixel, keeping the paper's own transparency. (A canvas 'multiply'
 * draw would also paint the ink layer's white, opaque, wherever the paper isn't: round deckled and torn edges and
 * in punched holes. Here a pixel outside the paper stays clear, and the paper's soft edge keeps its own alpha.)
 * The ink layer is white where there's no ink (or clear, on the 2D fallback): either way it leaves the paper as is.
 */
function inkOnPaper(ctx: OffscreenCanvasRenderingContext2D, ink: OffscreenCanvas, at: number, W: number, H: number) {
  const paper = ctx.getImageData(at, at, W, H);
  const layer = ink.getContext('2d')!.getImageData(0, 0, W, H);
  const p = paper.data, k = layer.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const a = k[i + 3] / 255;
    // the ink over white, then multiplied into the paper's colour; the paper's alpha unchanged
    p[i] = (p[i] * (k[i] * a + 255 * (1 - a))) / 255;
    p[i + 1] = (p[i + 1] * (k[i + 1] * a + 255 * (1 - a))) / 255;
    p[i + 2] = (p[i + 2] * (k[i + 2] * a + 255 * (1 - a))) / 255;
  }
  ctx.putImageData(paper, at, at);
}

self.onmessage = async (e: MessageEvent<CardRequest | CardWarm>) => {
  if ('warm' in e.data) {
    // compile the ink renderer's shaders and build a first hand while the page is still loading the letters
    try {
      engine.warmCanvas?.();
      const p = makeHand('warm-up-1', 'script');
      engine.renderCanvas(new OffscreenCanvas(64, 32), p, layout(p, 'Dear', { maxWidth: 4000, firstBaseline: 800, lineHeight: 1200 }), { width: 64, height: 32, emPx: 24, dpr: 1, style: false, paper: { transparent: true } });
    } catch { /* the first card does it */ }
    return;
  }
  const req = e.data;
  const t0 = performance.now();
  try {
    // the page's sheets are worn as much as this (a worker can't read the page's address)
    setWearLevel(req.wear);
    const look = lookFor(req.letter, req.hand);
    const r = renderingOf(look);
    const full = r.paper;
    // the sheet as the page sized it: a letter-sized sheet of this stationery (wide notebook and A4 pages are cut to
    // A5 width, so every hand shows at the same scale and the letter fills the card as the page expected), the asked
    // height (never taller than the paper), and its writing area keeping the paper's own margins from the new edges
    // (or, asked for the whole sheet, the paper as it is: the table shows each letter at its own paper's size)
    const wMm = req.full ? full.w : Math.min(full.w, CARD_SHEET_MM);
    const hMm = req.full ? full.h : Math.min(full.h, wMm * req.aspect);
    const right = Math.min(20, Math.max(10, full.w - full.text.right));
    const bottom = Math.max(10, full.h - full.text.last);
    const cut = req.full ? full : { ...full, w: wMm, h: hMm, text: { ...full.text, right: Math.min(full.text.right, wMm - right), last: Math.min(full.text.last, hMm - bottom) } };
    // the letter's own sheet, aged as it is everywhere else (lib/paper/wear.ts)
    const paper = wornPaper(cut, req.letter.id, req.letter.year);
    const W = Math.round(req.width);
    const k = W / wMm;
    const H = Math.round(hMm * k);
    // no shadow: the sheet lies flat on the page, with only its own edge (deckled, torn) and the page around it
    const shaped = isShaped(full);
    const scale = W / Math.max(1, req.css);
    const B = 0;

    // the letter on this sheet: whole lines that fit above the bottom margin (the first sheet of the layout)
    const live = liveLayout(r.p, req.letter.text, paper as typeof full, r.size, r.lineSpacing, false);
    const to = live.sheets[1]?.fromLine ?? Infinity;
    const items = (live.page.items as any[]).filter((it) => it.line < to);

    const canvas = new OffscreenCanvas(W + 2 * B, H + 2 * B);
    const ctx = canvas.getContext('2d')!;
    ctx.translate(B, B);
    paintPaper(ctx as unknown as CanvasRenderingContext2D, paper as typeof full, { pxPerMm: k, grainScale: scale, holeFill: 'clear', shadow: 'none' });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // ink (the engine's canvas renderer: ink as density, colour from the ink model), multiplied into the paper
    const u = live.unitsPerMm;
    const ink = new OffscreenCanvas(W, H);
    engine.renderCanvas(ink, r.p, { items, height: hMm * u, lineHeight: live.lineMm * u }, {
      width: W, height: H, emPx: live.emMm * k, dpr: 1, style: false, paper: { transparent: true }, ink: r.inkKey ?? r.inkColor,
    });
    inkOnPaper(ctx, ink, B, W, H);

    let blob: Blob;
    try { blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 }); } catch { blob = await canvas.convertToBlob(); }
    post({ job: req.job, id: req.letter.id, blob, look, width: W, height: H, bleed: B, shaped, ms: performance.now() - t0 });
  } catch (err) {
    post({ job: req.job, id: req.letter.id, error: err instanceof Error ? err.message : String(err) });
  }
};
