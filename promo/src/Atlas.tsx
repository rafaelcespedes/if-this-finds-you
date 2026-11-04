// The atlas of the canvas of hands: frame n is page n, 16 × 16 cards of 128 px, each "If this / finds you" in one of
// the 4096 writers of src/data/canvas-hands.json, on its paper in its ink. Rendered once into public/atlas/ by
// `npm run canvas`; the Promo's pull back draws its mid-size and tiny cards from these pages.
import { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from 'remotion';
import { ATLAS, paintAtlasPage } from './scene/zoom';

export const Atlas: React.FC = () => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const handle = delayRender(`atlas page ${frame}`, { timeoutInMilliseconds: 240000 });
    const ctx = ref.current?.getContext('2d', { alpha: false });
    if (ctx) paintAtlasPage(ctx, frame);
    continueRender(handle);
  }, [frame]);
  const W = ATLAS.tile * ATLAS.per;
  return (
    <AbsoluteFill>
      <canvas ref={ref} width={W} height={W} style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  );
};
