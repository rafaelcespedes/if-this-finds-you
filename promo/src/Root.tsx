import { Composition } from 'remotion';
import { Promo, defaultProps, promoSchema, settingsOf, type PromoProps } from './Promo';
import { Atlas } from './Atlas';
import { Specimen } from './Specimen';
import { Carousel } from './Carousel';
import { FontList, fontListSchema } from './FontList';
import { OpenOptions } from './OpenOptions';
import { LinkedIn, LINKEDIN_FRAMES } from './LinkedIn';
import { SECONDS as FONTLIST_SECONDS } from './scene/fontlist-plan';
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
    {/* the same hands as the thread's carousel cards: 1080 × 1350 with the writer, school, pen and seed underneath */}
    <Composition id="SpecimenCard" component={Specimen} width={1080} height={1350} fps={1} durationInFrames={Math.max(1, SPECIMENS.length)} />
    {/* the launch thread's carousel: real letters in their own hands, 1080 × 1350 */}
    <Composition id="Carousel" component={Carousel} width={1080} height={1350} fps={1} durationInFrames={CAROUSEL.length} />
    {/* the fonts video: the Fonts page's list scrolling, every row in its real font (16:9 for X) */}
    <Composition id="FontList" component={FontList} schema={fontListSchema} defaultProps={{ openHand: 13, endText: 'Over a million handwritten fonts', variant: 'wide' as const, w: 0, h: 0 }} width={1920} height={1080} fps={30} durationInFrames={Math.round(30 * FONTLIST_SECONDS)} />
    {/* the candidates for the fonts video's opening line: Rafael's favourites, each writing it */}
    <Composition id="OpenOptions" component={OpenOptions} width={1600} height={2160} fps={1} durationInFrames={1} />
    {/* the LinkedIn cut: 4:5, the square on top, one line at a time under it */}
    <Composition id="LinkedIn" component={LinkedIn} width={1080} height={1350} fps={30} durationInFrames={LINKEDIN_FRAMES} />
    <Composition id="Atlas" component={Atlas} width={ATLAS.tile * ATLAS.per} height={ATLAS.tile * ATLAS.per} fps={1} durationInFrames={ATLAS.pages} />
  </>
);
