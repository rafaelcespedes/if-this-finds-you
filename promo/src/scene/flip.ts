// Sections 1 and 2: the title, already written in the site's wordmark hand, then the flip through the engine's hands
// on the beat, faster and faster, the brake, and the hand it lands on. The paper never changes; only the ink does.
import { drawInk, FLIP_INK, ground, RR, text } from './ink';
import { caption, type Look } from './hands';
import { geometry, phrase } from './phrase';
import type { Plan } from './timeline';
import { WORDS } from './timeline';

export interface FlipOpts {
  /** every hand in its own ink (true) or all in one ink (false) */
  ownInk: boolean;
  /** the "Hand No." counter and the writer's name */
  labels: boolean;
}

export function looksAt(P: Plan, hands: Look[], frame: number): { looks: Look[]; count: number; gap: number; index: number } {
  const c = P.cutAt(frame);
  const at = (i: number) => hands[Math.min(hands.length - 1, i)];
  const looks = c.perWord ? Array.from({ length: WORDS }, (_, k) => at(c.hand + k)) : [at(c.hand)];
  return { looks, count: c.count, gap: c.gap, index: c.hand };
}

export function drawFlip(ctx: CanvasRenderingContext2D, P: Plan, hands: Look[], frame: number, o: FlipOpts) {
  const S = P.s.size;
  ctx.drawImage(ground(S), 0, 0, S, S);
  const g = geometry(S);
  const { looks, count, gap } = looksAt(P, hands, frame);
  const ink = o.ownInk ? undefined : FLIP_INK;
  for (const gr of phrase(looks, g, ink)) drawInk(ctx, gr.p, gr.items, { emPx: gr.emPx, width: S, height: S, ink: ink ?? undefined });
  if (!o.labels) return;
  // the counter: every hand gets a number, as every letter in the archive does
  const k = S / 1080;
  const sec = P.sectionAt(frame).id;
  const showCount = sec !== 'title';
  if (showCount) {
    text(ctx, 'hand no.', 72 * k, 92 * k, { size: 25 * k, color: RR.red, caps: true, tracking: 0.06 });
    text(ctx, String(count).padStart(4, '0'), 72 * k, 136 * k, { size: 44 * k, color: RR.red, tracking: 0.02 });
  }
  // the writer the site names for this hand, while the cuts are slow enough to read it
  const slow = gap >= P.fpb / 2 || sec === 'land';
  if (slow && looks.length === 1 && sec !== 'title') {
    const c = caption(looks[0]);
    text(ctx, c.name, S / 2, S - 118 * k, { size: 34 * k, color: RR.ink, align: 'center', italic: true });
    text(ctx, `${c.school} · ${c.pen}`, S / 2, S - 78 * k, { size: 24 * k, color: RR.muted, align: 'center', caps: true, tracking: 0.06 });
  }
}
