// Paints paper sheets and swatches off the main thread (OffscreenCanvas), so a new paper never holds up the page.
// The same painter (lib/paper/paint.ts) runs here, on the page when a browser can't paint in a worker, and for the JPEG.
import { paintPaper, warmPaperArt } from '@/lib/paper/paint';
import type { PaperJob, PaperReply } from '@/lib/paper/client';

const post = (r: PaperReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transfer);

self.onmessage = (e: MessageEvent<PaperJob | { warm: PaperJob['paper'][] }>) => {
  const d = e.data;
  if ('warm' in d) {
    warmPaperArt(d.warm);
    return;
  }
  try {
    const c = new OffscreenCanvas(d.w, d.h);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2D context in this worker');
    if (d.fill) {
      ctx.fillStyle = d.fill;
      ctx.fillRect(0, 0, d.w, d.h);
    }
    ctx.translate(d.tx, d.ty);
    paintPaper(ctx, d.paper, d.o);
    const bitmap = c.transferToImageBitmap();
    post({ id: d.id, bitmap }, [bitmap]);
  } catch (err) {
    post({ id: d.id, error: err instanceof Error ? err.message : String(err) });
  }
};
