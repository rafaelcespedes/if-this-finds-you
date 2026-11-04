// One line written live on the About page, by a writer picked fresh on each visit. Loaded only after the page has
// painted (LiveLine.tsx imports this file on demand), so the engine never holds up the reading.
// The writer comes from the engine's own sampler (neat hands only, as the tool's Find another), drawn the way the
// library draws a hand (archive/look.ts), and written stroke by stroke with the engine's player.
import * as E from '@engine';
import { getStyle, layout, UPM } from '@engine';
import { handLook, renderingOf } from '@/archive/look';
import { writerName } from '@/lib/hands';
import { liftInkEdge } from '@/lib/writing';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;

export interface Writer {
  /** the fictional writer's name, from the seed (the tool's writerName) */
  name: string;
  /** the taught hand they started from, as the tool names it ("Business 1915") */
  tradition: string;
  /** the pen, in the engine's words ("Fountain pen") */
  pen: string;
}

export interface Written {
  writer: Writer;
  /** draw into this element: the line, fully written; play() then writes it stroke by stroke */
  mount(host: HTMLElement): { play(onEnd?: () => void): void; destroy(): void };
}

/**
 * A new writer for `text`, sized for a line `widthPx` wide at `emPx` pixels to the em. With `oneLine`, a wide hand
 * that would wrap is written a little smaller instead (about 1 in 20 at desktop width), so the line keeps the room the
 * page held for it.
 */
export function write(text: string, entropy: string, widthPx: number, size: number, opts: { oneLine?: boolean } = {}): Written | null {
  const s = engine.sampleLook({ entropy, textLength: text.length, neatOnly: true });
  const look = handLook(`${s.seed}~${s.style}`);
  if (!look) return null;
  const r = renderingOf(look);
  let emPx = size;
  let page = layout(r.p, text, { maxWidth: widthPx / (emPx / UPM) });
  while (opts.oneLine && page.lines > 1 && emPx > size * 0.6) {
    emPx = Math.floor(emPx * 0.92);
    page = layout(r.p, text, { maxWidth: widthPx / (emPx / UPM) });
  }
  const svg: string = engine.renderSVG(r.p, page, { width: widthPx, emPx, strokeIds: true, ink: r.inkKey ?? r.inkColor });
  const style = getStyle(look.style) as { label?: string } | undefined;
  const pen = (engine.PENS?.[look.pen] as { label?: string } | undefined)?.label ?? '';
  return {
    writer: { name: writerName(look.seed), tradition: style?.label ?? look.style, pen },
    mount(host) {
      host.innerHTML = svg;
      const el = host.querySelector('svg');
      if (!el) return { play: () => {}, destroy: () => {} };
      // the words are on the page as text; the drawing is only its picture
      el.removeAttribute('aria-label');
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('focusable', 'false');
      // just the ink and a little air: the page's own box leaves room for lines that aren't there
      const ink = (page as unknown as { ink?: { top: number; bottom: number } }).ink;
      if (ink && Number.isFinite(ink.top) && Number.isFinite(ink.bottom)) {
        const sc = emPx / UPM, pad = 0.12 * emPx;
        const y0 = Math.floor(ink.top * sc - pad), hgt = Math.ceil((ink.bottom - ink.top) * sc + 2 * pad);
        el.setAttribute('viewBox', `0 ${y0} ${widthPx} ${hgt}`);
        el.setAttribute('height', String(hgt));
      }
      let player: { replay(): void; destroy(): void } | null = null;
      // the ink's rough edge is off while the pen writes (lib/writing.ts liftInkEdge) and comes back when it's done
      let edgeBack = () => {};
      return {
        play(onEnd) {
          player?.destroy();
          edgeBack();
          edgeBack = liftInkEdge(el);
          // a little quicker than life, so the line is written while you're still reading the page's opening
          player = engine.playSVG(el, page, { emPx, rate: 1.35, onEnd: () => { edgeBack(); onEnd?.(); } });
          player!.replay();
        },
        destroy() { player?.destroy(); player = null; edgeBack(); },
      };
    },
  };
}
