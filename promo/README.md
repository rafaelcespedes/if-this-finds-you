# The launch video

A square (1080 × 1080) promo for X and Instagram, made in [Remotion](https://www.remotion.dev) and drawn frame by frame
with the site's own code: the handwriting engine (`../engine`) for every hand, the app's paper painter, letter layout
and archive looks (`../app/src`, through the same `@engine` and `@` aliases the app uses). Nothing here is part of the
site build.

Remotion's free licence covers individuals and companies of up to three people (commercial use included). A company of
four or more needs a company licence ($25 per seat a month at the time of writing): <https://www.remotion.pro>.

## Run it

```sh
cd promo
npm install
npm run studio          # Remotion Studio: scrub the timeline, change the settings on the right
npm run render          # out/promo-x-30fps.mp4   (X: 30 fps, with the placeholder click)
npm run render:60       # out/promo-60fps.mp4     (Instagram: 60 fps)
npm run render:timing   # out/promo-timing.mp4    (a bar.beat counter in the corner, to try tracks against)
```

The first render downloads Remotion's headless browser (~140 MB). A full render takes about 80 s on an M-series Mac.
`sh scripts/ff.sh …` runs Remotion's bundled ffmpeg (no Homebrew needed), e.g. to pull stills from a render.

## What's where

| File | What |
|---|---|
| `src/scene/timeline.ts` | The clock: the beat grid (BPM, offset, fps), the sections, every cut of the flip, the letter's highlight spans. Pure; nothing draws. |
| `src/scene/flip.ts`, `phrase.ts` | The title and the flip: "If this / finds you" in each hand on fixed baselines, the Hand No. counter, the writer's name. |
| `src/scene/hands.ts` | The hand list: the wordmark hand first, then the sampled hands (`src/data/hands.json`), the landing hand last. |
| `src/scene/letter.ts` | The letter: laid out on its paper, written out live, and each highlighted letter's other forms (its allographs, pinned, in a few takes). |
| `src/scene/table.ts` | All the letters on the Reading Room table (drawn as the archive's card worker draws them). |
| `src/scene/endcard.ts` | The end card: the title written again where it began, then the stamped lines. |
| `src/Promo.tsx`, `src/Root.tsx` | The Remotion composition and its settings panel (zod schema). |
| `scripts/sample-hands.mjs` | Picks the flip's hands with the engine's sampler (`npm run hands`). |
| `scripts/click.mjs` | Writes the placeholder click track for the tempo. |
| `review/build.mjs` | Builds the private review page from the same timing code. |

## The timing

At 112.5 BPM a beat is exactly 16 frames at 30 fps (32 at 60) and a bar 2.13 s, so every halving of the flip's cut
rate (16, 8, 4, 2, 1 frames) lands on a frame. Any other tempo works: beats are placed from a running total, so they
never drift. When the track is chosen, set `bpm` and `offset` (seconds to its first downbeat) in the Studio panel or with
`--props='{"bpm":120,"offset":0.42}'`, and run `node scripts/click.mjs 120` for a matching click.

## Settings (Studio panel or `--props`)

`bpm`, `offset`, `click`, `ownInk` (each hand in its own ink), `labels` (counter and names), `perWordBeats` (beats at
the end of the flip where each word takes its own hand), `landingSeed` / `landingStyle` (the hand it lands on),
`letterId` (an id from `content/sample-texts.json`), `grid` (the bar.beat counter), `fps` (render only).
