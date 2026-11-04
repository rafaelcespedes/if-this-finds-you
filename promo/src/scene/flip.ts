// Sections 1 and 2: the title, already written in the site's wordmark hand, then the flip through the engine's hands
// on the beat, faster and faster, and the dead stop. The paper never changes; only the ink does.
// Every frame is one centred stack (phrase.ts geometry): the counter's plate on top, the phrase, the writer's name.
import { drawInk, FLIP_INK, ground, RR, text } from './ink';
import { fontOf, pairing, role } from './type';
import { caption, type Look } from './hands';
import { geometry, phrase } from './phrase';
import type { Plan } from './timeline';
import { WORDS } from './timeline';

export interface FlipOpts {
  /** every hand in its own ink (true) or all in one ink (false) */
  ownInk: boolean;
  /** every hand on its own paper's colour (true) or all on one paper (false) */
  ownPaper: boolean;
  /** the "Hand No." counter and the writer's name */
  labels: boolean;
}

export interface FrameStyle {
  /** the tool's paper id for the ground */
  paper: string;
  /** the ink to write in; undefined = the hand's own */
  ink: string | undefined;
}
/** The paper and ink a hand's frame is drawn in. The wordmark's hand (no look of its own) is always on the laid
 *  ground in the flip's ink, so the title and the end card never change. */
export function styleOf(look: Look, o: { ownInk: boolean; ownPaper: boolean }): FrameStyle {
  const l = look as Look & { paper?: string };
  return {
    paper: o.ownPaper && l.paper ? String(l.paper) : 'laid',
    ink: o.ownInk && l.ink ? undefined : FLIP_INK,
  };
}

const NUM = 52; // the number's size at 1080 px
const PAD_X = 20;

interface CounterMetrics { pitch: number; numW: number; zeroL: number; label: number; labelH: number; numH: number }
const metricsCache = new Map<string, CounterMetrics>();
/** the label as the pairing sets it: small capitals ("hand no." drawn as caps) or sentence case */
const labelText = () => { const r = role('label'); return r.upper ? 'HAND NO.' : r.caps ? 'hand no.' : 'Hand no.'; };
/** Digit pitch (the widest figure: the number never changes width), the number's ink width, and the label size that
 *  makes "HAND NO." exactly as wide as the number. */
function counterMetrics(ctx: CanvasRenderingContext2D, k: number): CounterMetrics {
  const key = `${pairing()}@${k}`;
  const hit = metricsCache.get(key);
  if (hit) return hit;
  ctx.save();
  ctx.font = fontOf('number', NUM * k);
  (ctx as any).letterSpacing = '0px';
  (ctx as any).fontVariantCaps = 'normal';
  let pitch = 0;
  for (let d = 0; d <= 9; d++) pitch = Math.max(pitch, ctx.measureText(String(d)).width);
  const z = ctx.measureText('0');
  const zeroW = z.actualBoundingBoxRight + z.actualBoundingBoxLeft;
  const numH = z.actualBoundingBoxAscent;
  // ink from the first digit's left edge to the last one's right edge, four digits centred in their cells
  const numW = 3 * pitch + zeroW;
  const L = role('label');
  ctx.font = fontOf('label', 100);
  (ctx as any).fontVariantCaps = L.caps ? 'all-small-caps' : 'normal';
  (ctx as any).letterSpacing = `${L.tracking * 100}px`;
  const m = ctx.measureText(labelText());
  const labelW100 = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
  ctx.restore();
  const label = (100 * numW) / labelW100;
  const out = { pitch, numW, zeroL: (pitch - zeroW) / 2, label, labelH: (m.actualBoundingBoxAscent * label) / 100, numH };
  metricsCache.set(key, out);
  return out;
}

/** The plate in the top slot, centred: light red on a solid card, so it reads over anything. */
export function drawPlate(ctx: CanvasRenderingContext2D, S: number, w: number, alpha = 1) {
  const g = geometry(S), k = S / 1080;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(S / 2 - w / 2, g.plate.y, w, g.plate.h, 7 * k);
  ctx.fillStyle = RR.card;
  ctx.fill();
  ctx.fillStyle = 'rgba(155, 59, 42, 0.13)';
  ctx.fill();
  ctx.restore();
}

/** "HAND NO." over the number, the two exactly as wide as each other, on the plate. */
export function drawCounter(ctx: CanvasRenderingContext2D, S: number, count: number, alpha = 1) {
  if (alpha <= 0) return;
  const k = S / 1080, g = geometry(S);
  const M = counterMetrics(ctx, k);
  drawPlate(ctx, S, M.numW + 2 * PAD_X * k, alpha);
  const x0 = S / 2 - M.numW / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = RR.red;
  ctx.textBaseline = 'alphabetic';
  // the label: its ink spans the number's ink (its tracking scales with its size, as measured)
  const L = role('label');
  ctx.font = fontOf('label', M.label);
  (ctx as any).fontVariantCaps = L.caps ? 'all-small-caps' : 'normal';
  (ctx as any).letterSpacing = `${L.tracking * M.label}px`;
  const lm = ctx.measureText(labelText());
  // the label over the number, the pair centred in the plate (the same room above as below)
  const gap = 11 * k;
  const top = g.plate.y + (g.plate.h - (M.labelH + gap + M.numH)) / 2;
  const labelBase = top + M.labelH, numBase = labelBase + gap + M.numH;
  ctx.fillText(labelText(), x0 + lm.actualBoundingBoxLeft, labelBase);
  // the number: each digit centred in a fixed cell
  ctx.font = fontOf('number', NUM * k);
  (ctx as any).fontVariantCaps = 'normal';
  (ctx as any).letterSpacing = '0px';
  ctx.textAlign = 'center';
  const digits = String(Math.min(9999, count)).padStart(4, '0');
  for (let i = 0; i < 4; i++) ctx.fillText(digits[i], x0 - M.zeroL + (i + 0.5) * M.pitch, numBase);
  ctx.restore();
}

/** The writer's name and the school and pen, in the bottom slot. */
export function drawCaption(ctx: CanvasRenderingContext2D, S: number, look: Look, alpha = 1) {
  const k = S / 1080, g = geometry(S), c = caption(look);
  text(ctx, c.name, S / 2, g.name, { size: 34 * k, color: RR.ink, align: 'center', role: 'name', alpha });
  text(ctx, `${c.school} · ${c.pen}`, S / 2, g.descriptor, { size: 24 * k, color: RR.muted, align: 'center', role: 'meta', alpha });
}

export function looksAt(P: Plan, hands: Look[], frame: number): { looks: Look[]; count: number; gap: number; index: number } {
  const c = P.cutAt(frame);
  const at = (i: number) => hands[Math.min(hands.length - 1, i)];
  const looks = c.perWord ? Array.from({ length: WORDS }, (_, k) => at(c.hand + k)) : [at(c.hand)];
  return { looks, count: c.count, gap: c.gap, index: c.hand };
}

export function drawFlip(ctx: CanvasRenderingContext2D, P: Plan, hands: Look[], frame: number, o: FlipOpts) {
  const S = P.s.size;
  const g = geometry(S);
  const { looks, count, gap } = looksAt(P, hands, frame);
  const st = styleOf(looks[0], o);
  ctx.drawImage(ground(S, st.paper), 0, 0, S, S);
  for (const gr of phrase(looks, g, st.ink)) drawInk(ctx, gr.p, gr.items, { emPx: gr.emPx, width: S, height: S, ink: st.ink });
  if (!o.labels) return;
  // the counter, from the first frame: the wordmark's hand is hand no. 0001
  drawCounter(ctx, S, count);
  // the writer the site names for this hand, while the cuts are slow enough to read it (not on the title)
  const sec = P.sectionAt(frame).id;
  const slow = gap >= P.fpb / 2 || sec === 'land';
  if (slow && looks.length === 1 && sec !== 'title') drawCaption(ctx, S, looks[0]);
}
