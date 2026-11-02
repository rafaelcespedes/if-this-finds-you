// The writing layer. This is the one place the app puts handwriting on screen (see lib/writing.ts).
// Today it shows the engine's SVG, drawn once at a reference scale and sized by CSS; a canvas/WebGL
// renderer or the engine's stroke-by-stroke animation (animate.js, page-rhythm session) can replace the
// inside without touching callers.
//
// `play` writes the sheet out in front of the reader: each pen stroke appears in reading order, paced by
// its size, with a breath at each new line. A stand-in until the engine's write-on animation lands.
import { memo, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

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
  play?: Play | null;
  /** changes to jump to the end of the writing */
  finishToken?: number;
}

export const Writing = memo(function Writing({ svg, ink, className, play, finishToken }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
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

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn('writing writing-fill pointer-events-none absolute inset-0', className)}
      style={{ color: ink }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
