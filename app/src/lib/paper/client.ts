// Where paper gets painted. On the page by default: measured at 6x CPU on a production build (2026-11-03), a sheet
// paints in ~6-10 ms there, while a worker made the new paper show ~250 ms later (its bitmap waits for the busy main
// thread) and removed no long tasks. The worker path (OffscreenCanvas) stays ready for a device where painting does
// cost: turn it on with ?paperworker in the URL or localStorage['seedhand:paperworker'] = '1'.
// A job is one bitmap: a whole sheet (with its shadow bleed) or a swatch's crop.
import { paintPaper, warmPaperArt, type PaintOptions } from './paint';
import type { PaperSpec } from './types';

export interface PaperJob {
  id: number;
  paper: PaperSpec;
  /** bitmap size, device px */
  w: number;
  h: number;
  /** where the sheet's top-left corner lands in the bitmap, device px */
  tx: number;
  ty: number;
  /** a colour under everything (a swatch's desk) */
  fill?: string;
  o: PaintOptions;
}
export type PaperReply = { id: number; bitmap: ImageBitmap } | { id: number; error: string };
export type PaperBitmap = ImageBitmap | HTMLCanvasElement;

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { job: PaperJob; resolve: (b: PaperBitmap) => void }>();

function wanted() {
  try {
    return new URLSearchParams(location.search).has('paperworker') || localStorage.getItem('seedhand:paperworker') === '1';
  } catch {
    return false;
  }
}

function offscreenWorks() {
  try {
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'transferToImageBitmap' in OffscreenCanvas.prototype && !!new OffscreenCanvas(1, 1).getContext('2d');
  } catch {
    return false;
  }
}

function paperWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (!wanted() || !offscreenWorks()) return null;
  try {
    const w = new Worker(new URL('../../workers/paper.worker.ts', import.meta.url), { type: 'module', name: 'paper' });
    w.onmessage = (e: MessageEvent<PaperReply>) => {
      const r = e.data;
      const p = waiting.get(r.id);
      if (!p) return;
      waiting.delete(r.id);
      // a worker that can't paint this one: the page paints it
      p.resolve('bitmap' in r ? r.bitmap : paintHere(p.job));
    };
    // a worker that fails to start or breaks: everything waiting (and everything after) is painted on the page
    w.onerror = () => {
      worker = null;
      w.terminate();
      for (const [id, p] of waiting) { waiting.delete(id); p.resolve(paintHere(p.job)); }
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** True when papers are painted off the main thread. */
export const paintsOffThread = () => !!paperWorker();

/** Paint a job on the page, now. */
export function paintHere(job: Omit<PaperJob, 'id'>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = job.w;
  c.height = job.h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  if (job.fill) {
    ctx.fillStyle = job.fill;
    ctx.fillRect(0, 0, job.w, job.h);
  }
  ctx.translate(job.tx, job.ty);
  paintPaper(ctx, job.paper, job.o);
  return c;
}

/** Paint a job in the worker (or on the page when there's no worker). */
export function paintOff(job: Omit<PaperJob, 'id'>): Promise<PaperBitmap> {
  const w = paperWorker();
  if (!w) return Promise.resolve(paintHere(job));
  const id = nextId++;
  const full = { ...job, id };
  return new Promise((resolve) => {
    waiting.set(id, { job: full, resolve });
    w.postMessage(full);
  });
}

/** Make the shared textures and outlines ahead, where the painting happens. */
export function warmPaper(papers: PaperSpec[]) {
  const w = paperWorker();
  if (w) w.postMessage({ warm: papers });
  else warmPaperArt(papers);
}
