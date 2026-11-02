// The three actions: share a link, download the note as a JPEG, export the hand as a font file.
import { buildFont, verify, type Hand } from '@engine';
import { getPaper, paintPaper } from './papers';
import { rasterizeWriting } from './writing';
import { write } from './write-core';
import type { WriteRequest } from './write-protocol';
import { fileSafe, saveBlob } from './utils';

/** Copy text to the clipboard, with a fallback for browsers that block the async API. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

const DESK = '#eeebe4';
const PAGE_GAP_MM = 8;

/**
 * Paint every sheet of the note, paper and writing, at 3x the screen and save one JPEG.
 * Several sheets are stacked top to bottom with a little desk between them.
 */
export async function downloadNote(req: Omit<WriteRequest, 'id'>, ink: string, cssPxPerMm: number, filename: string) {
  const paper = getPaper(req.paper);
  // the same SVG the screen shows (written fresh here, deterministically), drawn larger
  const res = write({ ...req, id: -1 });
  // 3x what's on screen, but never smaller than ~1800 px wide, and capped for memory on phones
  let k = cssPxPerMm * 3;
  k = Math.max(k, 1800 / paper.w);
  k = Math.min(k, 3600 / paper.w);
  const n = res.svgs.length;
  const sheetW = Math.round(paper.w * k), sheetH = Math.round(paper.h * k), gap = Math.round(PAGE_GAP_MM * k);
  const canvas = document.createElement('canvas');
  canvas.width = sheetW;
  canvas.height = sheetH * n + gap * (n - 1);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create an image.');
  ctx.fillStyle = DESK;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.translate(0, i * (sheetH + gap));
    paintPaper(ctx, paper, { pxPerMm: k, grainScale: k / cssPxPerMm, holeFill: DESK });
    const img = await rasterizeWriting(res.svgs[i], sheetW, sheetH, ink);
    ctx.drawImage(img, 0, 0, sheetW, sheetH);
    ctx.restore();
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('The image could not be encoded.');
  saveBlob(blob, `${fileSafe(filename)}.jpg`);
  return { width: canvas.width, height: canvas.height, bytes: blob.size };
}

/** Build the .otf with the engine's font builder (opentype.js is loaded only when needed). */
export async function exportFont(p: Hand, filename: string) {
  const mod = await import('opentype.js');
  const opentype = (mod as { default?: unknown }).default ?? mod;
  const t0 = performance.now();
  const built = buildFont(opentype, p, { alts: 3 });
  const ms = performance.now() - t0;
  const check = verify(opentype, built.buffer);
  saveBlob(new Blob([built.buffer], { type: 'font/otf' }), `${fileSafe(filename)}.otf`);
  return { ms, ok: check.ok, features: check.features, ...built.info };
}
