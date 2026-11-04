// The three actions: share a link, download the note as a JPEG, export the hand as a font file.
import * as E from '@engine';
import { buildFont, verify, type Hand } from '@engine';
import { getPaper, paintPaper } from './papers';
import { marksForExport, printMarks } from './paper/marks';
import { wornForExport } from './paper/wear';
import { rasterizeWriting } from './writing';
import { write } from './write-core';
import { sheetSVG, type Live } from './live';
import type { WriteRequest } from './write-protocol';
import { reloadForNewVersion, workerDidNotLoad } from './stale-build';
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
export async function renderNote(req: Omit<WriteRequest, 'id'>, ink: string, cssPxPerMm: number) {
  // the letter's own sheet, worn as it is on screen (lib/paper/wear.ts)
  const paper = wornForExport(getPaper(req.paper));
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
    // a look's printed marks on the first sheet: those stamped before writing go into the paper
    const marks = i === 0 ? marksForExport(paper) : null;
    paintPaper(ctx, paper, { pxPerMm: k, grainScale: k / cssPxPerMm, holeFill: DESK, marks: marks ?? undefined, sheet: i });
    const img = await rasterizeWriting(res.svgs[i], sheetW, sheetH, ink);
    ctx.drawImage(img, 0, 0, sheetW, sheetH);
    // and those stamped after it, over the writing
    if (marks) printMarks(ctx, marks, k, 'over', paper);
    ctx.restore();
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('The image could not be encoded.');
  return { blob, width: canvas.width, height: canvas.height };
}

/** The live page as a JPEG: each sheet's whole SVG (windowed onto the page), at 3x the screen. */
export async function renderLiveNote(live: Live, extras: string[], inkKey: string | undefined, ink: string, cssPxPerMm: number) {
  const paper = wornForExport(live.paper);
  let k = cssPxPerMm * 3;
  k = Math.max(k, 1800 / paper.w);
  k = Math.min(k, 3600 / paper.w);
  const n = live.sheets.length;
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
    // a look's printed marks on the first sheet: those stamped before writing go into the paper
    const marks = i === 0 ? marksForExport(paper) : null;
    paintPaper(ctx, paper, { pxPerMm: k, grainScale: k / cssPxPerMm, holeFill: DESK, marks: marks ?? undefined, sheet: i });
    const img = await rasterizeWriting(sheetSVG(live, i, inkKey ?? 'currentColor', extras[i] ?? ''), sheetW, sheetH, ink);
    ctx.drawImage(img, 0, 0, sheetW, sheetH);
    // and those stamped after it, over the writing
    if (marks) printMarks(ctx, marks, k, 'over', paper);
    ctx.restore();
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('The image could not be encoded.');
  return { blob, width: canvas.width, height: canvas.height };
}

export type SaveResult = 'saved' | 'shared' | 'cancelled' | 'needs-tap';

/**
 * Hand the image to the person: on phones the share sheet (Save Image, Messages, ...), elsewhere a
 * download. If the browser wants a fresh tap before sharing, returns 'needs-tap' so the UI can offer one.
 */
export async function saveNote(blob: Blob, filename: string, preferShare: boolean): Promise<SaveResult> {
  const name = `${fileSafe(filename)}.jpg`;
  if (preferShare && typeof navigator.share === 'function') {
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        const n = (e as DOMException).name;
        if (n === 'AbortError') return 'cancelled';
        if (n === 'NotAllowedError') return 'needs-tap';
      }
    }
  }
  saveBlob(blob, name);
  return 'saved';
}

/** Open the share sheet for a link (after it has been copied). */
export async function shareLink(url: string, title: string) {
  try {
    await navigator.share({ url, title });
  } catch {
    /* cancelled: the link is already on the clipboard */
  }
}
export const canShareLinks = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** The engine builds the open font package (zip: .otf, .ttf, how to install it, the licence, the credits). */
export const FONT_PACKAGE = typeof (E as unknown as { buildFontPackage?: unknown }).buildFontPackage === 'function';

/** The open font package, built in a worker, saved as the engine names it ("IfThisFindsYou-Yara-Rowe-K7Q2.zip": the writer, then the hand's own code). */
export function exportFontPackage(req: import('@/workers/font.worker').FontRequest) {
  return new Promise<{ filename: string; family: string; glyphs: number; bytes: number }>((resolve, reject) => {
    const w = new Worker(new URL('../workers/font.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<import('@/workers/font.worker').FontReply>) => {
      w.terminate();
      const r = e.data;
      if (!r.ok) { reject(new Error(r.error)); return; }
      saveBlob(new Blob([r.zip], { type: 'application/zip' }), r.filename);
      resolve({ filename: r.filename, family: r.info.family, glyphs: r.info.glyphs, bytes: r.zip.byteLength });
    };
    w.onerror = (e) => {
      w.terminate();
      // its script gone (the site was updated since this tab opened): the page reloads onto the new version
      if (workerDidNotLoad(e) && reloadForNewVersion()) return;
      reject(new Error(e.message || 'The font couldn’t be built'));
    };
    w.postMessage(req);
  });
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
