// Section 5: the end card. The title writes itself out again in the wordmark's hand, exactly where the video began,
// and holds. Nothing else: no address, no tagline.
import { drawInk, engine, FLIP_INK, ground } from './ink';
import { BRAND } from './hands';
import { geometry, phrase } from './phrase';
import type { Plan } from './timeline';

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

export function drawEnd(ctx: CanvasRenderingContext2D, P: Plan, frame: number, from: number, opts: { writeOn: boolean }) {
  const S = P.s.size;
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
}
