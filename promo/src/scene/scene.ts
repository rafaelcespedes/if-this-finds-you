// The whole video as a pure function of the frame number: draw(ctx, frame) paints that frame and nothing else.
// Remotion renders frames in parallel and out of order, so nothing here keeps state between frames except caches.
import { drawFlip, type FlipOpts } from './flip';
import { handList, type Look } from './hands';
import { clamp, easeInOutQuint, easeOutQuint, RR, text } from './ink';
import { drawLetter, letterCam, letterModel, type LetterState } from './letter';
import { centerSheetAt, CELL, drawTable, layoutTable, paintTable, tableReady } from './table';
import { drawEnd } from './endcard';
import { plan, type Plan, type Settings } from './timeline';

export interface SceneOpts extends FlipOpts {
  letterId: string;
  landing: Look;
  /** the bar.beat counter in the corner */
  grid?: boolean;
}

export interface Scene {
  P: Plan;
  hands: Look[];
  draw(ctx: CanvasRenderingContext2D, frame: number): void;
  /** work a frame needs before it can be drawn (the table's sheets), or null */
  prepare(frame: number): Promise<void> | null;
}

export function makeScene(s: Settings, o: SceneOpts): Scene {
  const P = plan(s);
  const hands = handList(P.handsNeeded, o.landing);
  const landing = hands[P.landHand];
  const S = s.size;
  const fps = s.fps;
  const sec = (id: string) => P.sections.find((x) => x.id === id)!;

  const model = () => letterModel(o.letterId, landing);
  const table = () => { const m = model(); return layoutTable(m.id, m.paper); };

  /** the table camera that matches the letter section's framing */
  function startCam() {
    const m = model();
    const t = table();
    const c0 = letterCam(m, S);
    // the letter camera puts the sheet's top-left at (c0.x, c0.y): the frame's centre is then this table point
    return { k: c0.k, cx: t.center.x + (S / 2 - c0.x) / c0.k, cy: t.center.y + (S / 2 - c0.y) / c0.k };
  }

  function letterState(frame: number): LetterState {
    const m = model();
    const L = P.letter;
    if (frame < L.writeTo) {
      const writeSecs = (L.writeTo - L.from) / fps;
      const speed = m.tl.duration / Math.max(0.1, writeSecs * 0.9);
      return { inkT: ((frame - L.from) / fps) * speed, ch: null, step: 0, dim: 0 };
    }
    const span = L.spans.find((x) => frame < x.to) ?? L.spans[L.spans.length - 1];
    if (!span) return { inkT: Infinity, ch: null, step: 0, dim: 0 };
    let step = 0;
    for (let i = 0; i < span.swaps.length; i++) if (frame >= span.swaps[i]) step = i;
    // the rest dims when the first letter lights up (a short ease, about a third of a beat), then stays dim
    const first = L.spans[0];
    const dim = span === first ? easeOutQuint((frame - first.from) / Math.max(1, P.fpb / 3)) : 1;
    return { inkT: Infinity, ch: span.ch, step, dim };
  }

  return {
    P, hands,
    prepare(frame) {
      const id = P.sectionAt(frame).id;
      if (id !== 'canvas') return null;
      table();
      return tableReady() ? null : paintTable();
    },
    draw(ctx, frame) {
      const id = P.sectionAt(frame).id;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (id === 'title' || id === 'flip' || id === 'land') drawFlip(ctx, P, hands, frame, o);
      else if (id === 'letter') {
        const m = model();
        ctx.fillStyle = RR.room;
        ctx.fillRect(0, 0, S, S);
        drawLetter(ctx, m, letterCam(m, S), letterState(frame), S, undefined);
        credit(ctx, m.credit, 1);
      } else if (id === 'canvas') {
        const m = model();
        const t = table();
        const a = sec('canvas');
        const c0 = startCam();
        // pull back over four beats (on a log scale, so the zoom reads as steady), then drift
        const k1 = S / (7.2 * CELL.w);
        const pull = easeInOutQuint((frame - a.from) / (4 * P.fpb));
        const drift = clamp((frame - a.from - 4 * P.fpb) / (a.to - a.from - 4 * P.fpb), 0, 1);
        const k = Math.exp(Math.log(c0.k) + (Math.log(k1) - Math.log(c0.k)) * pull) * (1 - 0.1 * drift);
        const end = { cx: t.center.x + t.center.w / 2 + 0.2 * CELL.w, cy: t.center.y + t.center.h / 2 - 0.1 * CELL.h };
        // the centre follows the zoom (the letter's text stays put on screen while it's big)
        const follow = 1 - (k - k1) / (c0.k - k1);
        const cam = {
          k,
          cx: c0.cx + (end.cx - c0.cx) * clamp(follow, 0, 1) + 0.12 * CELL.w * drift,
          cy: c0.cy + (end.cy - c0.cy) * clamp(follow, 0, 1) + 0.05 * CELL.h * drift,
        };
        drawTable(ctx, S, cam);
        drawLetter(ctx, m, centerSheetAt(S, cam), { inkT: Infinity, ch: null, step: 0, dim: 0 }, S, undefined);
        credit(ctx, m.credit, 1 - clamp((frame - a.from) / (P.fpb / 2), 0, 1));
      } else if (id === 'end') drawEnd(ctx, P, frame, sec('end').from, { writeOn: true });
      if (o.grid) beatGrid(ctx, frame);
      ctx.restore();
    },
  };

  /** bar.beat, the section, and a dot that lights on each beat (brighter on a bar's first beat) */
  function beatGrid(ctx: CanvasRenderingContext2D, frame: number) {
    const k = S / 1080;
    const beat = Math.floor((frame - Math.round(s.offset * fps)) / P.fpb + 1e-6);
    const inBeat = frame - P.beatFrame(beat);
    const bar = Math.floor(beat / 4) + 1, b = (beat % 4) + 1;
    ctx.save();
    ctx.fillStyle = 'rgba(30,39,51,0.82)';
    ctx.fillRect(S - 300 * k, S - 56 * k, 300 * k, 56 * k);
    const lit = inBeat < 3 ? 1 : 0.25;
    ctx.fillStyle = b === 1 ? `rgba(230,120,90,${lit})` : `rgba(255,255,255,${lit})`;
    ctx.beginPath(); ctx.arc(S - 272 * k, S - 28 * k, 11 * k, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    text(ctx, `bar ${bar} · beat ${b}`, S - 248 * k, S - 34 * k, { size: 20 * k, color: '#fff' });
    text(ctx, `${P.sectionAt(frame).label} · ${(frame / fps).toFixed(2)} s`, S - 248 * k, S - 12 * k, { size: 15 * k, color: '#cfd3da' });
  }

  function credit(ctx: CanvasRenderingContext2D, c: { who: string; to: string; year: string }, alpha: number) {
    if (alpha <= 0) return;
    const k = S / 1080;
    const line = `${c.who}, to ${c.to} · ${c.year}`;
    text(ctx, line, S / 2, S - 54 * k, { size: 25 * k, align: 'center', caps: true, tracking: 0.07, color: RR.muted, alpha });
  }
}
