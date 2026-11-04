// Ink and paper, drawn by the site's own code: the engine's canvas renderer (ink as density, the pen's own texture,
// colour from the ink model) multiplied over the tool's paper painter.
import * as E from '@engine';
import { getPaper, paintPaper } from '@/lib/papers';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const engine = E as any;
export const UPM: number = engine.UPM;
export const CAP: number = engine.CAP;

// Reading Room colours (app/src/themes/reading-room.css)
export const RR = {
  room: '#e6e4de',
  card: '#f3eee1',
  slip: '#f8f5ec',
  ink: '#1e2733',
  red: '#9b3b2a',
  redDeep: '#7e2f21',
  muted: '#575146',
  faint: '#666052',
  edge: '#d6ccb7',
};
/** The ink the flip writes in (one ink for every hand, so only the hand changes). */
export const FLIP_INK = '#1f2a3a';

let scratch: HTMLCanvasElement | null = null;
const canvas = () => (scratch ??= document.createElement('canvas'));

export interface InkOpts {
  emPx: number;
  width: number;
  height: number;
  ink?: string;
  reveal?: (item: any, stroke: number) => number;
  alpha?: number;
  /** where the drawing's top-left goes on ctx (default 0, 0) */
  x?: number;
  y?: number;
}

/** Write items (page units) onto ctx at 1 px = emPx / UPM page units, multiplied into what's below. */
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
  ctx.drawImage(c, o.x ?? 0, o.y ?? 0, o.width, o.height);
  ctx.restore();
}

/** Items moved by (dx, dy) page units (the posed letter comes along). */
export const shifted = (items: any[], dx: number, dy: number) =>
  items.map((it) => ({ ...it, x: it.x + dx, y: it.y + dy, box: it.box && [it.box[0] + dx, it.box[1] + dy, it.box[2] + dx, it.box[3] + dy] }));

/** The union of the items' ink boxes, page units. */
export function inkBox(items: any[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    if (!it.box) continue;
    x0 = Math.min(x0, it.box[0]); y0 = Math.min(y0, it.box[1]);
    x1 = Math.max(x1, it.box[2]); y1 = Math.max(y1, it.box[3]);
  }
  return [x0, y0, x1, y1];
}

// ---------- paper ----------

const papers = new Map<string, HTMLCanvasElement>();
/** A full-frame ground of the tool's paper (its tint, grain and laid lines; no edges), painted once and kept. */
export function ground(size: number, id = 'laid', mm = 210): HTMLCanvasElement {
  const key = `${id}:${size}:${mm}`;
  let c = papers.get(key);
  if (!c) {
    const base = getPaper(id) as any;
    // only the paper itself: its tint and finish (grain, mottle), nothing printed, cut or folded into it
    const spec = { id: base.id, family: base.family, name: base.name, variant: base.variant, hint: '', w: mm, h: mm, tint: base.tint, finish: base.finish, text: base.text, pitch: 0, xh: base.xh };
    c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    paintPaper(ctx, spec, { pxPerMm: size / mm, grainScale: size / 1080, holeFill: RR.card, shadow: 'none' });
    papers.set(key, c);
  }
  return c;
}

// ---------- type (Junicode, the Reading Room's book face) ----------

export const SERIF = '"RR Junicode", Junicode, Georgia, serif';
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: {
  size: number; color?: string; align?: CanvasTextAlign; caps?: boolean; italic?: boolean; weight?: number; tracking?: number; alpha?: number; stretch?: string;
}) {
  ctx.save();
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${o.size}px ${SERIF}`;
  (ctx as any).fontVariantCaps = o.caps ? 'all-small-caps' : 'normal';
  (ctx as any).fontKerning = 'normal';
  (ctx as any).fontStretch = o.stretch ?? 'normal';
  (ctx as any).letterSpacing = `${(o.tracking ?? 0) * o.size}px`;
  ctx.fillStyle = o.color ?? RR.ink;
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** cubic-bezier easing (x1, y1, x2, y2), as CSS */
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
export const easeOutExpo = bezier(0.16, 1, 0.3, 1);
export const easeInOutQuint = bezier(0.77, 0, 0.175, 1);
export const easeOutQuint = bezier(0.23, 1, 0.32, 1);
