import { memo, useLayoutEffect, useRef } from 'react';
import { paintPaper, type PaperSpec } from '@/lib/papers';
import { cn } from '@/lib/utils';

interface Props {
  paper: PaperSpec;
  /** CSS px per mm */
  pxPerMm: number;
  /** paint only this part of the sheet (mm), for swatches */
  crop?: { x: number; y: number; w: number; h: number };
  className?: string;
}

/** A sheet of paper painted on a canvas at the screen's pixel density. */
export const PaperCanvas = memo(function PaperCanvas({ paper, pxPerMm, crop, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const region = crop ?? { x: 0, y: 0, w: paper.w, h: paper.h };
  const cssW = region.w * pxPerMm;
  const cssH = region.h * pxPerMm;

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || cssW <= 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const k = pxPerMm * dpr;
    c.width = Math.round(region.w * k);
    c.height = Math.round(region.h * k);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(-region.x * k, -region.y * k);
    paintPaper(ctx, paper, { pxPerMm: k, grainScale: dpr, holeFill: 'clear' });
    ctx.restore();
  }, [paper, pxPerMm, region.x, region.y, region.w, region.h, cssW]);

  return <canvas ref={ref} aria-hidden className={cn('block', className)} style={{ width: cssW, height: cssH }} />;
});
