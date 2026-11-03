// Writes the index cards off the main thread: the top of each letter's first sheet, its paper painted by the tool's
// painter and its opening lines written in the letter's own hand by the engine, as one small image (WebP). One card
// at a time; the page decides the order (visible cards first) and keeps the results.
import './worker-shim';
import * as E from '@engine';
import { layout, makeHand } from '@engine';
import { liveLayout } from '@/lib/live';
import { paintPaper } from '@/lib/papers';
import { lookFor, renderingOf } from './look';
import { cardWindow, type CardRequest, type CardResult, type CardWarm } from './card-protocol';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;
const post = (msg: CardResult) => (self as unknown as Worker).postMessage(msg);

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
    const look = lookFor(req.letter as never, req.hand);
    const r = renderingOf(look);
    const sheet = r.paper;
    // a window onto the top left of the sheet, starting a little above the first line; a narrow card shows less
    // of the sheet's width and the letter is wrapped to it, so the hand keeps a readable size with whole lines
    const win = cardWindow(sheet, req.css);
    const paper = { ...sheet, text: { ...sheet.text, right: win.w - win.right } };
    const W = Math.round(req.width);
    const k = W / win.w;
    const H = Math.round(win.h * k);

    // enough of the letter to fill the window: whole words
    const xh = paper.xh * r.size;
    const perLine = (paper.text.right - paper.text.left) / (xh * 0.9);
    const lines = Math.max(2, (win.top + win.h - paper.text.first) / (xh * 2.2) + 2);
    let n = Math.ceil(perLine * lines * 1.3);
    const text = req.letter.text;
    if (n < text.length) { const cut = text.slice(n).search(/\s/); n = cut < 0 ? text.length : n + cut; }
    const live = liveLayout(r.p, text.slice(0, n), paper, r.size, r.lineSpacing, false);
    const u = live.unitsPerMm;
    const top = win.top * u;
    const items = (live.page.items as any[]).filter((it) => it.y / u < win.top + win.h + 4).map((it) => ({ ...it, y: it.y - top }));

    // paper
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d')!;
    ctx.translate(0, -win.top * k);
    paintPaper(ctx as unknown as CanvasRenderingContext2D, sheet, { pxPerMm: k, grainScale: 2, holeFill: 'clear' });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // ink, multiplied onto the paper (the engine's canvas renderer: ink as density, colour from the ink model)
    const ink = new OffscreenCanvas(W, H);
    engine.renderCanvas(ink, r.p, { items, height: win.h * u, lineHeight: live.lineMm * u }, {
      width: W, height: H, emPx: live.emMm * k, dpr: 1, style: false, paper: { transparent: true }, ink: r.inkKey ?? r.inkColor,
    });
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(ink, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    let blob: Blob;
    try { blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 }); } catch { blob = await canvas.convertToBlob(); }
    post({ job: req.job, id: req.letter.id, blob, look, width: W, height: H, ms: performance.now() - t0 });
  } catch (err) {
    post({ job: req.job, id: req.letter.id, error: err instanceof Error ? err.message : String(err) });
  }
};
