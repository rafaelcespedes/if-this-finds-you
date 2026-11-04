// The launch thread's specimens: frame n is hand n of data/specimens.json writing the pangram. `npm run specimens`
// renders them all into out/specimens/ (low resolution, to choose from; the chosen ones get rendered large).
import { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import { drawSpecimen } from './scene/specimen';

export const Specimen: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const handle = delayRender(`specimen ${frame}`, { timeoutInMilliseconds: 120000 });
    const ctx = ref.current?.getContext('2d', { alpha: false });
    if (ctx) drawSpecimen(ctx, frame, width, height);
    continueRender(handle);
  }, [frame, width, height]);
  return (
    <AbsoluteFill>
      <canvas ref={ref} width={width} height={height} style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  );
};
