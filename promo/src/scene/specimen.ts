// The launch thread's specimens: one hand writing the pangram on its own paper in its own ink, three lines set
// left, the block centred. The hands, their seeds and links are in data/specimens.json (scripts/specimens.ts).
import specimens from '../data/specimens.json';
import { engine, CAP, UPM, drawInk, ground, inkBox, shifted } from './ink';
import { handOf, type Look } from './hands';

export const SPECIMENS = specimens as (Look & { n: number; paper: string; seed: string; name: string })[];
export const LINES = ['The quick brown', 'fox jumps over', 'the lazy dog'];

const REF_XH = 0.47;
/** px per em: halfway (geometrically) between the same em and the same x-height, as the video's phrase */
function emFor(p: any, xh: number) {
  const sameXh = xh / (((p.xHeight || REF_XH) * CAP) / UPM);
  const sameEm = xh / ((REF_XH * CAP) / UPM);
  return Math.sqrt(sameXh * sameEm);
}

export function drawSpecimen(ctx: CanvasRenderingContext2D, i: number, W: number, H: number) {
  const s = SPECIMENS[i];
  if (!s) return;
  const g = ground(W, s.paper);
  ctx.drawImage(g, 0, (W - H) / 2, W, H, 0, 0, W, H);
  const p = handOf(s);
  const xh = 0.085 * H;
  const lines = LINES.map((t, li) => {
    const page = engine.layout(p, t, { maxWidth: 1e6, salt: `spec-${li}` });
    const items = (page.items as any[]).filter((it) => it.kind === 'glyph');
    return { items, box: inkBox(items), base: items[0]?.y ?? 0 };
  });
  const em0 = emFor(p, xh);
  const widest = Math.max(...lines.map((L) => ((L.box[2] - L.box[0]) * em0) / UPM));
  const fit = Math.min(1, (0.84 * W) / widest);
  const emPx = em0 * fit, sc = emPx / UPM, x = xh * fit;
  const pitch = 2.55 * x;
  const block = 1.85 * x + 2 * pitch + 0.95 * x;
  const top = (H - block) / 2 + 1.85 * x;
  const x0 = W / 2 - (widest * fit) / 2;
  const all: any[] = [];
  lines.forEach((L, li) => all.push(...shifted(L.items, x0 / sc - L.box[0], (top + li * pitch) / sc - L.base)));
  drawInk(ctx, p, all, { emPx, width: W, height: H });
}
