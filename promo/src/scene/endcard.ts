// Section 5: the end card. The title writes itself out again in the wordmark's hand, exactly where the video began
// (so the loop back to the first frame is seamless), then three lines arrive half a beat apart, each like a stamp:
// it's there at once, pressed from 102% to 100% over a few frames, then still.
import { drawInk, engine, FLIP_INK, ground, RR, text, easeOutQuint } from './ink';
import { BRAND } from './hands';
import { geometry, phrase } from './phrase';
import type { Plan } from './timeline';

export const END_LINES = {
  a: 'Open source',
  b: 'Thousands of handwritten fonts',
  url: 'ifthisfindsyou.app',
};

let tlCache: { key: string; tl: any; items: any[]; p: any; emPx: number } | null = null;
function titleInk(S: number) {
  const key = String(S);
  if (tlCache?.key === key) return tlCache;
  const [gr] = phrase([BRAND], geometry(S), FLIP_INK);
  const items = gr.items.map((it: any, i: number) => ({ ...it, __i: i }));
  const tl = engine.timeline({ items, seed: 'end', xh: gr.p.xHeight * 700 }, { lead: 0 });
  tlCache = { key, tl, items, p: gr.p, emPx: gr.emPx };
  return tlCache;
}

function stamp(ctx: CanvasRenderingContext2D, f: number, fps: number, draw: () => void, cx: number, cy: number) {
  if (f < 0) return;
  const press = Math.round(0.17 * fps); // ~5 frames at 30 fps
  const s = f >= press ? 1 : 1.02 - 0.02 * easeOutQuint(f / press);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  draw();
  ctx.restore();
}

export function drawEnd(ctx: CanvasRenderingContext2D, P: Plan, frame: number, from: number, opts: { writeOn: boolean }) {
  const S = P.s.size, fps = P.s.fps, k = S / 1080;
  ctx.drawImage(ground(S), 0, 0, S, S);
  const T = titleInk(S);
  const f = frame - from;
  // the title writes itself out over a beat and a half (or is simply there)
  const writeFrames = 1.5 * P.fpb;
  let reveal: ((it: any, si: number) => number) | undefined;
  if (opts.writeOn && f < writeFrames) {
    const t = (f / writeFrames) * T.tl.duration;
    const fr = engine.frameAt(T.tl, t);
    const evOf = new Map<number, Int32Array>();
    T.tl.events.forEach((e: any, n: number) => {
      let a = evOf.get(e.item);
      if (!a) { a = new Int32Array(T.items[e.item].g.strokes.length).fill(-1); evOf.set(e.item, a); }
      a[e.stroke] = n;
    });
    reveal = (it, si) => {
      const a = evOf.get(it.__i);
      const n = a ? a[si] : -1;
      if (n < 0) return 0;
      return n < fr.done ? 1 : fr.active && n === fr.done ? fr.frac : 0;
    };
  }
  drawInk(ctx, T.p, T.items, { emPx: T.emPx, width: S, height: S, ink: FLIP_INK, reveal });
  // the three stamps, half a beat apart, from the second beat
  const b = (x: number) => Math.round(x * P.fpb);
  const yA = S - 196 * k, yB = S - 140 * k, yU = S - 66 * k;
  stamp(ctx, f - b(2), fps, () => text(ctx, END_LINES.a, S / 2, yA, { size: 44 * k, align: 'center', italic: true, color: RR.ink }), S / 2, yA - 15 * k);
  stamp(ctx, f - b(2.5), fps, () => text(ctx, END_LINES.b, S / 2, yB, { size: 33 * k, align: 'center', caps: true, tracking: 0.07, color: RR.ink }), S / 2, yB - 12 * k);
  stamp(ctx, f - b(3), fps, () => urlStamp(ctx, S / 2, yU, k), S / 2, yU - 10 * k);
}

/** The address as a small rubber stamp in archival red: small capitals in a thin ruled box, a touch askew. */
function urlStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, k: number) {
  ctx.save();
  ctx.translate(cx, cy - 9 * k);
  ctx.rotate((-1.6 * Math.PI) / 180);
  ctx.font = `400 ${29 * k}px "RR Junicode", serif`;
  (ctx as any).fontVariantCaps = 'all-small-caps';
  (ctx as any).letterSpacing = `${0.09 * 29 * k}px`;
  const w = ctx.measureText(END_LINES.url).width;
  const padX = 18 * k, h = 46 * k;
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = RR.red;
  ctx.lineWidth = 2 * k;
  ctx.strokeRect(-w / 2 - padX, -h / 2, w + 2 * padX, h);
  ctx.lineWidth = 0.8 * k;
  ctx.strokeRect(-w / 2 - padX + 4 * k, -h / 2 + 4 * k, w + 2 * padX - 8 * k, h - 8 * k);
  ctx.fillStyle = RR.red;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(END_LINES.url, 0, 1.5 * k);
  ctx.restore();
}
