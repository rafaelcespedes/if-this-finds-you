import { createContext, memo, useContext, useLayoutEffect, useRef } from 'react';
import { isShaped, paintPaper, SHADOW_BLEED, warmPapers, type PaperSpec } from '@/lib/papers';
import { perf } from '@/lib/perf';
import { cn } from '@/lib/utils';

/**
 * Whether the pad's guide sheet shows through (pad, airmail). It's there while you write and stays in the pad
 * when the letter is sent, so the reader view and the found letter set this to false (and the JPEG has none).
 */
export const PaperGuide = createContext(true);

interface Props {
  paper: PaperSpec;
  /** CSS px per mm */
  pxPerMm: number;
  /** paint only this part of the sheet (mm), for swatches */
  crop?: { x: number; y: number; w: number; h: number };
  /** cross-fade from the paper shown before (a new look) */
  fade?: boolean;
  /** which sheet of the letter (a deckle, a tear and the guide sit a little differently on each) */
  sheet?: number;
  className?: string;
}

// Painted sheets, kept so switching back to a paper costs a copy, not a repaint (a few sheet-sized bitmaps).
// Swatches have their own, larger store so the picker never pushes a sheet out.
const painted = new Map<string, HTMLCanvasElement>();
const swatches = new Map<string, HTMLCanvasElement>();
const KEEP = 6;
const KEEP_SWATCHES = 48;

function desk() {
  return getComputedStyle(document.documentElement).getPropertyValue('--desk').trim() || '#eeebe4';
}

/** A sheet of paper painted on a canvas at the screen's pixel density. */
export const PaperCanvas = memo(function PaperCanvas({ paper, pxPerMm, crop, fade, sheet = 0, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = useRef<string | null>(null);
  const guide = useContext(PaperGuide);
  const region = crop ?? { x: 0, y: 0, w: paper.w, h: paper.h };
  // a shaped sheet (deckle, tear, flaps) paints its own shadow just outside itself
  const bleed = !crop && isShaped(paper) ? SHADOW_BLEED : 0;
  const cssW = region.w * pxPerMm;
  const cssH = region.h * pxPerMm;

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || cssW <= 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const k = pxPerMm * dpr;
    const b = Math.round(bleed * dpr);
    const w = Math.round(region.w * k) + 2 * b;
    const h = Math.round(region.h * k) + 2 * b;
    const key = `${paper.id}|${guide ? 'g' : ''}|${sheet}|${region.x}|${region.y}|${w}x${h}`;
    if (shown.current === key) return;
    // the old paper fades out over the new one
    if (fade && shown.current && c.width && !crop) ghost(c, cssW, cssH);
    const store = crop ? swatches : painted;
    let src = store.get(key);
    if (!src) {
      src = document.createElement('canvas');
      src.width = w;
      src.height = h;
      const ctx = src.getContext('2d');
      if (!ctx) return;
      // a swatch may look past the sheet's edge, onto the desk
      if (crop) {
        ctx.fillStyle = desk();
        ctx.fillRect(0, 0, w, h);
      }
      ctx.translate(b - region.x * k, b - region.y * k);
      perf.time(crop ? 'paper swatch paint' : 'paper sheet paint', () =>
        paintPaper(ctx, paper, {
          pxPerMm: k,
          grainScale: dpr,
          // a swatch shows its cut edges against the desk; a sheet lets the real desk show
          holeFill: crop ? desk() : 'clear',
          guide,
          sheet,
          shadow: bleed ? 'full' : 'contact',
        }),
      );
      store.set(key, src);
      while (store.size > (crop ? KEEP_SWATCHES : KEEP)) store.delete(store.keys().next().value!);
    }
    c.width = w;
    c.height = h;
    c.getContext('2d')?.drawImage(src, 0, 0);
    shown.current = key;
    warmPapers();
  }, [paper, pxPerMm, region.x, region.y, region.w, region.h, cssW, fade, crop, guide, sheet, bleed]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn('block', className)}
      style={bleed ? { left: -bleed, top: -bleed, width: cssW + 2 * bleed, height: cssH + 2 * bleed, maxWidth: 'none' } : { width: cssW, height: cssH }}
    />
  );
});

/** A copy of the canvas as it is now, laid over it and fading away, clipped to the new sheet. */
function ghost(c: HTMLCanvasElement, newW: number, newH: number) {
  const g = document.createElement('canvas');
  g.width = c.width;
  g.height = c.height;
  g.getContext('2d')?.drawImage(c, 0, 0);
  g.className = c.className;
  g.style.cssText = c.style.cssText;
  g.style.pointerEvents = 'none';
  // the old sheet may be bigger: it never shows past the new one
  const left = -(parseFloat(c.style.left) || 0), top = -(parseFloat(c.style.top) || 0);
  const oldW = parseFloat(c.style.width) || newW, oldH = parseFloat(c.style.height) || newH;
  g.style.clipPath = `inset(${top}px ${Math.max(0, oldW - left - newW)}px ${Math.max(0, oldH - top - newH)}px ${left}px)`;
  g.setAttribute('aria-hidden', 'true');
  c.after(g);
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).onfinish = () => g.remove();
}
