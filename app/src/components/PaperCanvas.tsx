import { memo, useLayoutEffect, useRef } from 'react';
import { paintPaper, type PaperSpec } from '@/lib/papers';
import { cn } from '@/lib/utils';

interface Props {
  paper: PaperSpec;
  /** CSS px per mm */
  pxPerMm: number;
  /** paint only this part of the sheet (mm), for swatches */
  crop?: { x: number; y: number; w: number; h: number };
  /** cross-fade from the paper shown before (a new look) */
  fade?: boolean;
  className?: string;
}

// painted sheets, kept so switching back to a paper costs a copy, not a repaint (a few sheet-sized bitmaps)
const painted = new Map<string, HTMLCanvasElement>();
const KEEP = 6;

/** A sheet of paper painted on a canvas at the screen's pixel density. */
export const PaperCanvas = memo(function PaperCanvas({ paper, pxPerMm, crop, fade, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = useRef<string | null>(null);
  const region = crop ?? { x: 0, y: 0, w: paper.w, h: paper.h };
  const cssW = region.w * pxPerMm;
  const cssH = region.h * pxPerMm;

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || cssW <= 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const k = pxPerMm * dpr;
    const w = Math.round(region.w * k);
    const h = Math.round(region.h * k);
    const key = `${paper.id}|${region.x}|${region.y}|${w}x${h}`;
    if (shown.current === key) return;
    // the old paper fades out over the new one
    if (fade && shown.current && c.width && !crop) ghost(c);
    let src = painted.get(key);
    if (!src) {
      src = document.createElement('canvas');
      src.width = w;
      src.height = h;
      const ctx = src.getContext('2d');
      if (!ctx) return;
      ctx.translate(-region.x * k, -region.y * k);
      paintPaper(ctx, paper, { pxPerMm: k, grainScale: dpr, holeFill: 'clear' });
      painted.set(key, src);
      while (painted.size > KEEP) painted.delete(painted.keys().next().value!);
    }
    c.width = w;
    c.height = h;
    c.getContext('2d')?.drawImage(src, 0, 0);
    shown.current = key;
  }, [paper, pxPerMm, region.x, region.y, region.w, region.h, cssW, fade, crop]);

  return <canvas ref={ref} aria-hidden className={cn('block', className)} style={{ width: cssW, height: cssH }} />;
});

/** A copy of the canvas as it is now, laid over it, fading away. */
function ghost(c: HTMLCanvasElement) {
  const g = document.createElement('canvas');
  g.width = c.width;
  g.height = c.height;
  g.getContext('2d')?.drawImage(c, 0, 0);
  g.className = c.className;
  g.style.cssText = c.style.cssText;
  g.style.pointerEvents = 'none';
  g.setAttribute('aria-hidden', 'true');
  c.after(g);
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).onfinish = () => g.remove();
}
