// The launch thread's carousel: frame n is letter n of scene/carousel.ts CAROUSEL, in its own hand on its paper.
// `npm run carousel` renders them all into out/carousel/.
import { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import { drawCarousel } from './scene/carousel';
import { loadPairing, setPairing } from './scene/type';

export const Carousel: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const handle = delayRender(`carousel ${frame}`, { timeoutInMilliseconds: 120000 });
    setPairing('site');
    loadPairing('site').then(() => {
      const ctx = ref.current?.getContext('2d', { alpha: false });
      if (ctx) drawCarousel(ctx, frame, width, height);
      continueRender(handle);
    });
  }, [frame, width, height]);
  return (
    <AbsoluteFill>
      <canvas ref={ref} width={width} height={height} style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  );
};
