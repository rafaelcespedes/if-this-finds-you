// Drawing the ink: the handwriting engine's own canvas renderer (ink as density, the pen's texture, the ink's
// colour), multiplied over the paper below. And the easing curves the motion uses.
import * as E from '@engine';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const engine = E as any;
export const UPM: number = engine.UPM;

let scratch: HTMLCanvasElement | null = null;
const canvas = () => (scratch ??= document.createElement('canvas'));

export interface InkOpts {
  emPx: number;
  width: number;
  height: number;
  ink?: string;
  /** how far each stroke of an item is drawn, 0 to 1 (the pen writing) */
  reveal?: (item: any, stroke: number) => number;
  alpha?: number;
}

/** Write items (page units) onto ctx at emPx pixels per em, multiplied into what's below. */
export function drawInk(ctx: CanvasRenderingContext2D, p: any, items: any[], o: InkOpts) {
  if (!items.length) return;
  const c = canvas();
  const sc = o.emPx / UPM;
  engine.renderCanvas(c, p, { items, height: o.height / sc }, {
    width: o.width, height: o.height, emPx: o.emPx, dpr: 1, ink: o.ink, paper: { transparent: true }, style: false, reveal: o.reveal,
  });
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.drawImage(c, 0, 0, o.width, o.height);
  ctx.restore();
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** cubic-bezier easing (x1, y1, x2, y2), as in CSS */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t;
  const Y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    x = clamp(x, 0, 1);
    let t = x;
    for (let i = 0; i < 8; i++) { const d = X(t) - x; if (Math.abs(d) < 1e-6) break; const s = dX(t); if (Math.abs(s) < 1e-6) break; t -= d / s; }
    return Y(clamp(t, 0, 1));
  };
}
export const easeInOutQuint = bezier(0.77, 0, 0.175, 1);
export const easeOutQuint = bezier(0.23, 1, 0.32, 1);
