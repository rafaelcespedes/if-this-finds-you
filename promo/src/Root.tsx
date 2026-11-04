import { Composition } from 'remotion';
import { Promo, defaultProps, promoSchema, settingsOf, type PromoProps } from './Promo';
import { Atlas } from './Atlas';
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
    <Composition id="Atlas" component={Atlas} width={ATLAS.tile * ATLAS.per} height={ATLAS.tile * ATLAS.per} fps={1} durationInFrames={ATLAS.pages} />
  </>
);
