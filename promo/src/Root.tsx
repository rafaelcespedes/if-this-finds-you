import { Composition } from 'remotion';
import { Promo, defaultProps, promoSchema, settingsOf, type PromoProps } from './Promo';
import { plan } from './scene/timeline';

// One composition. Change the tempo, the offset or the frame rate and the length follows (calculateMetadata).
// fps comes from the render command (--props='{"fps":60}'); 30 by default, X's limit being 40.
export const RemotionRoot: React.FC = () => (
  <Composition
    id="Promo"
    component={Promo as unknown as React.FC<PromoProps>}
    schema={promoSchema}
    defaultProps={defaultProps}
    width={1080}
    height={1080}
    fps={30}
    durationInFrames={30 * 28}
    calculateMetadata={({ props }) => {
      const fps = (props as PromoProps).fps ?? 30;
      const P = plan(settingsOf(props as PromoProps, fps));
      return { durationInFrames: P.frames, fps, props: { ...props, fpsNow: fps } as PromoProps };
    }}
  />
);
