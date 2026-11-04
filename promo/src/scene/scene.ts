// The whole video as a pure function of the frame number: draw(ctx, frame) paints that frame and nothing else.
// Remotion renders frames in parallel and out of order, so nothing here keeps state between frames except caches.
import { drawCounter, drawFlip, type FlipOpts } from './flip';
import { caption, handList, type Look } from './hands';
import { clamp, easeOutQuint, RR, text } from './ink';
import { drawLetter, letterCam, letterModel, type LetterState } from './letter';
import { drawCanvas, loadAtlas } from './zoom';
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
  /** work a frame needs before it can be drawn (the canvas of hands' atlas), or null */
  prepare(frame: number): Promise<void> | null;
}

/** how small a card gets by the end of the pull back, as a share of the frame (1/400: a speck) */
const ZOOM_END = 1 / 400;

export function makeScene(s: Settings, o: SceneOpts): Scene {
  const P = plan(s);
  const hands = handList(P.handsNeeded, o.landing);
  const landing = hands[P.landHand];
  const S = s.size;
  const fps = s.fps;
  const sec = (id: string) => P.sections.find((x) => x.id === id)!;
  const model = () => letterModel(o.letterId, landing);

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

  /** the landing card's size on screen: S at the stop, a speck at the end; the pull back gathers speed */
  function cardSize(frame: number) {
    const z = sec('zoom');
    const u = clamp((frame - z.from) / Math.max(1, z.to - z.from), 0, 1);
    const f = 0.3 * u + 0.7 * u * u;
    return S * 2 ** (Math.log2(ZOOM_END) * f);
  }

  return {
    P, hands,
    prepare(frame) {
      return P.sectionAt(frame).id === 'zoom' ? loadAtlas() : null;
    },
    draw(ctx, frame) {
      const id = P.sectionAt(frame).id;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (id === 'title' || id === 'flip' || id === 'land') drawFlip(ctx, P, hands, frame, o);
      else if (id === 'zoom') {
        const z = sec('zoom');
        const onScreen = drawCanvas(ctx, S, cardSize(frame), landing);
        if (o.labels) {
          // the counter keeps going: the hands of the flip, then every writer on the canvas
          drawCounter(ctx, S, P.handsShown + Math.max(0, onScreen - 1));
          // the landed writer's name goes as the card shrinks
          const a = 1 - clamp((frame - z.from) / (P.fpb / 2), 0, 1);
          if (a > 0) {
            const k = S / 1080, c = caption(landing);
            text(ctx, c.name, S / 2, S - 118 * k, { size: 34 * k, color: RR.ink, align: 'center', italic: true, alpha: a });
            text(ctx, `${c.school} · ${c.pen}`, S / 2, S - 78 * k, { size: 24 * k, color: RR.muted, align: 'center', caps: true, tracking: 0.06, alpha: a });
          }
        }
      } else if (id === 'letter') {
        const m = model();
        ctx.fillStyle = RR.room;
        ctx.fillRect(0, 0, S, S);
        drawLetter(ctx, m, letterCam(m, S), letterState(frame), S, undefined);
        credit(ctx, m.credit);
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

  function credit(ctx: CanvasRenderingContext2D, c: { who: string; to: string; year: string }) {
    const k = S / 1080;
    text(ctx, `${c.who}, to ${c.to} · ${c.year}`, S / 2, S - 54 * k, { size: 25 * k, align: 'center', caps: true, tracking: 0.07, color: RR.muted });
  }
}
