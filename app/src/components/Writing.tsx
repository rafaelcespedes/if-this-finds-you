// The writing layer. This is the one place the app puts handwriting on screen (see lib/writing.ts).
// Today it shows the engine's SVG, drawn once at a reference scale and sized by CSS; a canvas/WebGL
// renderer or the engine's stroke-by-stroke animation (animate.js, page-rhythm session) can replace the
// inside without touching callers.
//
// A new look (`fade`) cross-fades in the DOM: the old writing stays where it is and fades out while the new
// one fades in, opacity only. A change in the middle of a fade takes over from wherever the fade has got to,
// so quick clicks never queue. Everything else (typing, sliders) swaps in place.
//
// `play` writes the sheet out in front of the reader: each pen stroke appears in reading order, paced by
// its size, with a breath at each new line. A stand-in until the engine's write-on animation lands.
import { memo, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { perf } from '@/lib/perf';

export interface Play {
  /** changes to start again */
  token: number;
  /** seconds before this sheet starts, and how long it takes */
  delay: number;
  seconds: number;
}

interface Props {
  svg: string;
  ink: string;
  className?: string;
  /** cross-fade from the writing shown before (a new look) */
  fade?: boolean;
  play?: Play | null;
  /** changes to jump to the end of the writing */
  finishToken?: number;
}

const FADE_MS = 170;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

export const Writing = memo(function Writing({ svg, ink, className, fade, play, finishToken }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // ---------- the layers: one current, at most one fading out ----------
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const current = host.querySelector<HTMLDivElement>(':scope > [data-layer="current"]');
    if (current && current.dataset.svg === svg && current.style.color === ink) return;
    if (current && !fade) {
      // in place: typing, a slider, the same look again
      if (current.dataset.svg !== svg) { current.innerHTML = svg; perf.lookShown(); }
      current.dataset.svg = svg;
      current.style.color = ink;
      return;
    }
    perf.lookShown();
    for (const g of host.querySelectorAll(':scope > [data-layer="ghost"]')) g.remove();
    const layer = document.createElement('div');
    layer.dataset.layer = 'current';
    layer.className = 'writing-fill absolute inset-0';
    layer.style.color = ink;
    layer.innerHTML = svg;
    layer.dataset.svg = svg;
    host.appendChild(layer);
    if (!current) return;
    // fade out from wherever the old layer is now (it may itself be fading in)
    const from = Number(getComputedStyle(current).opacity) || 1;
    for (const a of current.getAnimations()) a.cancel();
    current.dataset.layer = 'ghost';
    current.style.opacity = String(from);
    current.animate([{ opacity: from }, { opacity: 0 }], { duration: FADE_MS * from, easing: EASE_OUT, fill: 'forwards' }).onfinish = () => current.remove();
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: EASE_OUT, fill: 'backwards' });
  }, [svg, ink, fade]);
  useLayoutEffect(() => () => { ref.current?.replaceChildren(); }, []);

  // ---------- the reader's write-out ----------
  useLayoutEffect(() => {
    const root = ref.current?.querySelector(':scope > [data-layer="current"]');
    if (!root || !play) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const paths = [...root.querySelectorAll<SVGPathElement>('svg > g path')];
    if (!paths.length) return;
    // weight each stroke by its size; a new line costs a little extra (the hand travels back)
    const boxes = paths.map((p) => p.getBBox());
    const weights: number[] = [];
    let prevX = -Infinity;
    for (const b of boxes) {
      const newLine = b.x < prevX - 40;
      weights.push(Math.max(2, b.width + b.height) + (newLine ? 60 : 0));
      prevX = b.x;
    }
    const total = weights.reduce((a, w) => a + w, 0);
    const ms = play.seconds * 1000;
    let t = play.delay * 1000;
    const anims = paths.map((p, i) => {
      const d = (weights[i] / total) * ms;
      const a = p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(40, d * 1.6), delay: t, fill: 'backwards', easing: 'ease-out' });
      t += d;
      return a;
    });
    return () => anims.forEach((a) => a.cancel());
  }, [svg, play?.token, play?.delay, play?.seconds]);

  useLayoutEffect(() => {
    if (!finishToken || !ref.current) return;
    for (const a of ref.current.getAnimations({ subtree: true })) a.finish();
  }, [finishToken]);

  return <div ref={ref} aria-hidden className={cn('writing pointer-events-none absolute inset-0', className)} />;
});
