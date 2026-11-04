// The launch thread's specimens: one hand writing the pangram on its own paper in its own ink, three lines set
// left, the block centred. The hands, their seeds and links are in data/specimens.json (scripts/specimens.ts).
import specimens from '../data/specimens.json';
import { engine, CAP, UPM, RR, drawInk, ground, inkBox, shifted, text } from './ink';
import { handOf, type Look } from './hands';

export const SPECIMENS = specimens as (Look & { n: number; paper: string; seed: string; name: string; school: string; penLabel: string })[];
export const LINES = ['The quick brown', 'fox jumps over', 'the lazy dog'];
/** the tall card (4:5, for the thread's carousel): four shorter lines, so the writing can be big */
export const TALL_LINES = ['The quick', 'brown fox', 'jumps over', 'the lazy dog'];
const CAPTION = 214; // the tall card's caption band at 1080 wide, as the letter cards (carousel.ts)

const REF_XH = 0.47;
/** px per em: halfway (geometrically) between the same em and the same x-height, as the video's phrase */
function emFor(p: any, xh: number) {
  const sameXh = xh / (((p.xHeight || REF_XH) * CAP) / UPM);
  const sameEm = xh / ((REF_XH * CAP) / UPM);
  return Math.sqrt(sameXh * sameEm);
}

export function drawSpecimen(ctx: CanvasRenderingContext2D, i: number, W: number, H0: number) {
  const s = SPECIMENS[i];
  if (!s) return;
  // a tall frame is a carousel card: the writing above, the caption band (writer, school and pen, seed) below
  const tall = H0 > W;
  const k0 = W / 1080;
  const H = tall ? H0 - CAPTION * k0 : H0;
  const g = ground(Math.max(W, H), s.paper);
  ctx.drawImage(g, 0, 0, W, H, 0, 0, W, H);
  const p = handOf(s);
  const xh = tall ? 0.068 * W : 0.085 * H;
  const lines = (tall ? TALL_LINES : LINES).map((t, li) => {
    const page = engine.layout(p, t, { maxWidth: 1e6, salt: `spec-${li}` });
    const items = (page.items as any[]).filter((it) => it.kind === 'glyph');
    return { items, box: inkBox(items), base: items[0]?.y ?? 0 };
  });
  const em0 = emFor(p, xh);
  const widest = Math.max(...lines.map((L) => ((L.box[2] - L.box[0]) * em0) / UPM));
  const fit = Math.min(1, (0.84 * W) / widest);
  const emPx = em0 * fit, sc = emPx / UPM, x = xh * fit;
  const pitch = 2.55 * x;
  const n = lines.length;
  const block = 1.85 * x + (n - 1) * pitch + 0.95 * x;
  const top = (H - block) / 2 + 1.85 * x;
  const x0 = W / 2 - (widest * fit) / 2;
  const all: any[] = [];
  lines.forEach((L, li) => all.push(...shifted(L.items, x0 / sc - L.box[0], (top + li * pitch) / sc - L.base)));
  drawInk(ctx, p, all, { emPx, width: W, height: H });
  if (!tall) return;
  const band = H;
  ctx.fillStyle = RR.card;
  ctx.fillRect(0, band, W, H0 - band);
  ctx.fillStyle = RR.edge;
  ctx.fillRect(0, band, W, Math.max(1, 1.5 * k0));
  const cx = 0.08 * W;
  text(ctx, s.name, cx, band + 70 * k0, { size: 36 * k0, color: RR.ink, role: 'name' });
  text(ctx, `${s.school} · ${s.penLabel}`, cx, band + 118 * k0, { size: 24 * k0, color: RR.ink, role: 'meta' });
  text(ctx, `Seed ${s.seed}`, cx, band + 158 * k0, { size: 22 * k0, color: RR.red, role: 'credit' });
}
