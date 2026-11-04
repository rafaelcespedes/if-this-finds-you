import { Composition } from 'remotion';
import { Promo, defaultProps, promoSchema, settingsOf, type PromoProps } from './Promo';
import { Atlas } from './Atlas';
import { Specimen } from './Specimen';
import { Carousel } from './Carousel';
import { CAROUSEL } from './scene/carousel';
import { SPECIMENS } from './scene/specimen';
import { ATLAS } from './scene/zoom';
import { plan } from './scene/timeline';

// The promo. Change the tempo, the offset, the frame rate or the size and the length and frame follow
// (calculateMetadata). fps comes from the render command (--props='{"fps":60}'); 30 by default, X's limit being 40.
// size is 540 while we iterate and 1080 for the final (--props='{"size":1080}').
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Promo"
      component={Promo as unknown as React.FC<PromoProps>}
      schema={promoSchema}
      defaultProps={defaultProps}
      width={540}
      height={540}
      fps={30}
      durationInFrames={30 * 30}
      calculateMetadata={({ props }) => {
        const p = props as PromoProps;
        const fps = p.fps ?? 30;
        const P = plan(settingsOf(p, fps));
        return { durationInFrames: P.frames, fps, width: p.size, height: p.size, props: { ...props, fpsNow: fps } as PromoProps };
      }}
    />
    {/* the launch thread's specimens: 800 × 450 to choose from (--width/--height or --scale for the chosen ones) */}
    <Composition id="Specimen" component={Specimen} width={800} height={450} fps={1} durationInFrames={Math.max(1, SPECIMENS.length)} />
    {/* the launch thread's carousel: real letters in their own hands, 1080 × 1350 */}
    <Composition id="Carousel" component={Carousel} width={1080} height={1350} fps={1} durationInFrames={CAROUSEL.length} />
    <Composition id="Atlas" component={Atlas} width={ATLAS.tile * ATLAS.per} height={ATLAS.tile * ATLAS.per} fps={1} durationInFrames={ATLAS.pages} />
  </>
);
