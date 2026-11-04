// The whole video as a pure function of the frame number: draw(ctx, frame) paints that frame and nothing else.
// Remotion renders frames in parallel and out of order, so nothing here keeps state between frames except caches.
import { drawCaption, drawCounter, drawFlip, styleOf, type FlipOpts } from './flip';
import { handList, type Look } from './hands';
import { clamp, easeInOutQuint, easeOutQuint, RR, text } from './ink';
import { drawLetter, letterCam, letterModel, type LetterState } from './letter';
import { drawCanvas, landedFrame, loadAtlas, useWriters, writers } from './zoom';
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

/** the counter ends here: the flip's hands plus the canvas's writers (the canvas takes as many as that needs) */
const TOTAL = 5000;
/** how small a card gets at the farthest point, as a share of the frame (1/150: small coloured squares, still cards;
 *  much further and they turn to a fine grey noise that X's re-encoding would break into blocks) */
const ZOOM_END = 1 / 150;

export function makeScene(s: Settings, o: SceneOpts): Scene {
  const P = plan(s);
  const hands = handList(P.handsNeeded, o.landing);
  const landing = hands[P.landHand];
  useWriters(TOTAL - P.handsShown);
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
    const dim = span.ch === '*' ? 0 : span === first ? easeOutQuint((frame - first.from) / Math.max(1, P.fpb / 3)) : 1;
    return { inkT: Infinity, ch: span.ch, step, dim };
  }

  /** the landing card's size on screen: S at the stop; out to a speck (gathering speed), a still beat, then the
   *  dive back in (fast in the middle, settling as the card fills the frame on the bar). On a log scale throughout. */
  function cardSize(frame: number) {
    const Z = P.zoom;
    let f: number;
    if (frame < Z.out) { const u = (frame - Z.from) / Math.max(1, Z.out - Z.from); f = 0.3 * u + 0.7 * u * u; }
    else if (frame < Z.hold) f = 1;
    else f = 1 - easeInOutQuint((frame - Z.hold) / Math.max(1, Z.to - Z.hold));
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
        const Z = P.zoom;
        const onScreen = drawCanvas(ctx, S, cardSize(frame), landing, styleOf(landing, o));
        if (o.labels) {
          // the counter keeps going: the hands of the flip, then every writer on the canvas (it never counts down:
          // on the way back in it stays at the most it reached), and it fades over the dive's second beat
          const most = frame < Z.out ? onScreen : writers() + 1;
          const fade = 1 - clamp((frame - (Z.hold + (Z.to - Z.hold) / 2)) / ((Z.to - Z.hold) / 2), 0, 1);
          drawCounter(ctx, S, P.handsShown + Math.max(0, most - 1), fade);
          // the landed writer's name goes as the card shrinks
          const a = 1 - clamp((frame - Z.from) / (P.fpb / 2), 0, 1);
          if (a > 0) drawCaption(ctx, S, landing, a);
        }
      } else if (id === 'letter') {
        const m = model();
        ctx.fillStyle = RR.room;
        ctx.fillRect(0, 0, S, S);
        drawLetter(ctx, m, letterCam(m, S), letterState(frame), S, undefined);
        credit(ctx, m.credit);
        // the hand-off: the card we dived into dissolves over half a beat as the same hand starts the letter
        // (s.handoffFrames = 0: a cut on the bar)
        const a = s.handoffFrames > 0 ? 1 - easeOutQuint((frame - P.letter.from) / s.handoffFrames) : 0;
        if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(landedFrame(landing, S, styleOf(landing, o)), 0, 0, S, S); ctx.globalAlpha = 1; }
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
    const fromCut = beat - s.titleBeats; // bars count from the first cut; the title is a lead-in
    const bar = Math.floor(fromCut / 4) + 1, b = ((fromCut % 4) + 4) % 4 + 1;
    ctx.save();
    ctx.fillStyle = 'rgba(30,39,51,0.82)';
    ctx.fillRect(S - 300 * k, S - 56 * k, 300 * k, 56 * k);
    const lit = inBeat < 3 ? 1 : 0.25;
    ctx.fillStyle = b === 1 ? `rgba(230,120,90,${lit})` : `rgba(255,255,255,${lit})`;
    ctx.beginPath(); ctx.arc(S - 272 * k, S - 28 * k, 11 * k, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    text(ctx, fromCut < 0 ? `lead-in · beat ${b}` : `bar ${bar} · beat ${b}`, S - 248 * k, S - 34 * k, { size: 20 * k, color: '#fff' });
    text(ctx, `${P.sectionAt(frame).label} · ${(frame / fps).toFixed(2)} s`, S - 248 * k, S - 12 * k, { size: 15 * k, color: '#cfd3da' });
  }

  function credit(ctx: CanvasRenderingContext2D, c: { who: string; to: string; year: string }) {
    const k = S / 1080;
    text(ctx, `${c.who}, to ${c.to} · ${c.year}`, S / 2, S - 54 * k, { size: 25 * k, align: 'center', role: 'credit', color: RR.muted });
  }
}
