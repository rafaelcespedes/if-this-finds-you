// Section 5: the end card. The title writes itself out again in the wordmark's hand, exactly where the video began
// (so the loop back to the first frame is seamless), then the two lines and the address arrive half a beat apart,
// each like a stamp: there at once, pressed from 102% to 100% over a few frames, then still.
import { drawInk, engine, FLIP_INK, ground, RR, SERIF, text, easeOutQuint } from './ink';
import { drawPlate } from './flip';
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
  // the same three slots as every frame of the flip: the address on the plate where the counter sat, the two lines
  // where the writer's name and descriptor sat. They arrive half a beat apart, from the second beat, like stamps.
  const g = geometry(S);
  const b = (x: number) => Math.round(x * P.fpb);
  stamp(ctx, f - b(2), fps, () => text(ctx, END_LINES.a, S / 2, g.name, { size: 38 * k, align: 'center', italic: true, color: RR.ink }), S / 2, g.name - 12 * k);
  stamp(ctx, f - b(2.5), fps, () => text(ctx, END_LINES.b, S / 2, g.descriptor + 4 * k, { size: 27 * k, align: 'center', caps: true, tracking: 0.07, color: RR.ink }), S / 2, g.descriptor - 8 * k);
  stamp(ctx, f - b(3), fps, () => urlPlate(ctx, S), S / 2, g.plate.y + g.plate.h / 2);
}

/** The address on the counter's plate, in archival red small capitals. */
function urlPlate(ctx: CanvasRenderingContext2D, S: number) {
  const k = S / 1080, g = geometry(S);
  ctx.save();
  ctx.font = `400 ${30 * k}px ${SERIF}`;
  (ctx as any).fontVariantCaps = 'all-small-caps';
  (ctx as any).letterSpacing = `${0.08 * 30 * k}px`;
  const m = ctx.measureText(END_LINES.url);
  const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  ctx.restore();
  drawPlate(ctx, S, w + 48 * k);
  ctx.save();
  ctx.font = `400 ${30 * k}px ${SERIF}`;
  (ctx as any).fontVariantCaps = 'all-small-caps';
  (ctx as any).letterSpacing = `${0.08 * 30 * k}px`;
  ctx.fillStyle = RR.red;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(END_LINES.url, S / 2 - w / 2 + m.actualBoundingBoxLeft, g.plate.y + g.plate.h / 2 + 10 * k);
  ctx.restore();
}
