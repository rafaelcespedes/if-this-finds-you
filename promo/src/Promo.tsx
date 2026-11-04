// The promo: one <canvas>, painted per frame by the scene (src/scene), which draws with the site's own engine.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { loadPairing, setPairing, type Pairing } from './scene/type';
import { makeScene } from './scene/scene';
import { DEFAULTS, type Settings } from './scene/timeline';

export const promoSchema = z.object({
  bpm: z.number().min(60).max(180).step(0.5),
  /** where beat 1 of the music falls, seconds */
  offset: z.number().min(0).max(4).step(0.01),
  /** the click track (a placeholder to judge the timing; off for the music) */
  click: z.boolean(),
  /** in the flip, each hand in its own ink, or all in one ink */
  ownInk: z.boolean(),
  /** in the flip, each hand on its own paper's colour, or all on one paper */
  ownPaper: z.boolean(),
  /** the "Hand No." counter and the writer's name under the slow cuts */
  labels: z.boolean(),
  /** beats of the every-frame stretch where each word takes its own hand */
  perWordBeats: z.number().int().min(0).max(8),
  /** the hand the flip lands on (the letter is written in it) */
  landingSeed: z.string(),
  landingStyle: z.string(),
  /** the letter's lines */
  letterId: z.string(),
  /** a small bar.beat counter in the corner, to judge the timing against a track */
  grid: z.boolean(),
  /** frame size, px: 540 while we iterate (quick), 1080 for the final */
  size: z.number().int().min(270).max(2160),
  /** the type of the counter, names and credit: the live site's pairing (Newsreader + Schibsted) or the earlier Junicode */
  type: z.enum(['site', 'junicode']),
});
export type PromoProps = z.infer<typeof promoSchema> & { fps?: number };

export const defaultProps: PromoProps = {
  bpm: DEFAULTS.bpm,
  offset: 0,
  click: true,
  ownInk: true,
  ownPaper: true,
  labels: true,
  perWordBeats: DEFAULTS.perWordBeats,
  landingSeed: 'lunar-willow-41',
  landingStyle: 'quebec-print',
  letterId: 'santa-1908-papa',
  grid: false,
  size: 540,
  type: 'junicode',
};

export function settingsOf(props: PromoProps, fps: number): Settings {
  return { ...DEFAULTS, bpm: props.bpm, offset: props.offset, fps, perWordBeats: props.perWordBeats, size: props.size };
}

export const Promo: React.FC<PromoProps & { fpsNow: number }> = (props) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  setPairing(props.type as Pairing);
  const scene = useMemo(() => makeScene(settingsOf(props, props.fpsNow), {
    ownInk: props.ownInk, ownPaper: props.ownPaper, labels: props.labels,
    landing: { seed: props.landingSeed, style: props.landingStyle },
    letterId: props.letterId, grid: props.grid,
  }), [props.bpm, props.offset, props.fpsNow, props.ownInk, props.ownPaper, props.labels, props.perWordBeats, props.landingSeed, props.landingStyle, props.letterId, props.grid, props.size, props.type]);
  // each frame: fonts, then any slow work it needs (the table's sheets), then draw; the render waits for all of it
  useLayoutEffect(() => {
    const handle = delayRender(`frame ${frame}`, { timeoutInMilliseconds: 240000 });
    let done = false;
    const finish = () => { if (!done) { done = true; continueRender(handle); } };
    (async () => {
      await loadPairing(props.type as Pairing);
      const job = scene.prepare(frame);
      if (job) await job;
      if (done) return;
      const ctx = ref.current?.getContext('2d', { alpha: false });
      if (ctx) scene.draw(ctx, frame);
      finish();
    })().catch((e) => { console.error(e); finish(); });
    return finish;
  }, [frame, scene]);
  const S = scene.P.s.size;
  return (
    <AbsoluteFill style={{ backgroundColor: '#f3eee1' }}>
      <canvas ref={ref} width={S} height={S} style={{ width: '100%', height: '100%' }} />
      {props.click ? (
        <Sequence from={Math.round(props.offset * props.fpsNow)}>
          <Audio src={staticFile(`click-${props.bpm}.wav`)} volume={0.5} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
