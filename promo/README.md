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
npm run canvas          # once: the 4908 writers of the canvas and their atlas pages (public/atlas, ~20 s)
npm run studio          # Remotion Studio: scrub the timeline, change the settings on the right
npm run sound           # public/sound.wav: the sound, made from the handwriting (the render scripts run it too)
npm run render          # out/draft-540.mp4       (the working draft: 540 × 540, 30 fps, with sound; ~30 s)
npm run render:timing   # out/timing-540.mp4      (a bar.beat counter and a click, to try tracks against)
npm run render:final    # out/promo-x-30fps.mp4   (X: 1080 × 1080, 30 fps)
npm run render:60       # out/promo-60fps.mp4     (Instagram: 1080 × 1080, 60 fps, silent)
```

The first render downloads Remotion's headless browser (~140 MB). Drafts render at 540 px (`size`), the final at
1080 (about 80 s).
`sh scripts/ff.sh …` runs Remotion's bundled ffmpeg (no Homebrew needed), e.g. to pull stills from a render.

## What's where

| File | What |
|---|---|
| `src/scene/timeline.ts` | The clock: the beat grid (BPM, offset, fps), the sections, every cut of the flip, the letter's highlight spans. Pure; nothing draws. |
| `src/scene/flip.ts`, `phrase.ts` | The title and the flip: "If this / finds you" in each hand on fixed baselines, the Hand No. counter, the writer's name. |
| `src/scene/hands.ts` | The hand list: the wordmark hand first, then the sampled hands (`src/data/hands.json`), the landing hand last. |
| `src/scene/letter.ts` | The letter: laid out on its paper, written out live, and each highlighted letter's other forms (its allographs, pinned, in a few takes). |
| `src/scene/zoom.ts`, `src/Atlas.tsx` | The pull back into the canvas of hands and the dive back: live cards when big, atlas pages when small, ~70 × 70 blocks when they're specks. |
| `scripts/canvas-hands.mjs` | The canvas's writers, from the site's sampler (`lookOf`). |
| `src/scene/endcard.ts` | The end card: the title written again where it began, then the stamped lines. |
| `src/Promo.tsx`, `src/Root.tsx` | The Remotion composition and its settings panel (zod schema). |
| `scripts/sample-hands.mjs` | Picks the flip's hands with the engine's sampler (`npm run hands`). |
| `scripts/sound.ts`, `sound.mjs` | The sound, made from the same clock and pen strokes as the pictures: taps on the cuts, a press on the stop, air on the pull back, the nib along every stroke, taps on the letter changes. `sound.mjs` bundles it with the scene's code (esbuild) and writes `public/sound.wav`. |
| `src/scene/type.ts` | The video's own type by role: the site's Newsreader + Schibsted Grotesk (default) or the earlier Junicode. |
| `scripts/click.mjs` | A click track for the tempo (the timing version). |
| `review/build.mjs` | Builds the private review page from the same timing code. |

## The timing

At 112.5 BPM a beat is exactly 16 frames at 30 fps (32 at 60) and a bar 2.13 s. The flip runs one hand a beat, then
speeds up smoothly (`rampBeats`: the rate doubles until there's a new hand every frame, each cut snapped to the beat's
eighths, sixteenths…), holds full speed (`peakBeats`) and stops dead on a bar's first beat. Any other tempo works: beats are placed from a running total, so they
never drift. When the track is chosen, set `bpm` and `offset` (seconds to its first downbeat) in the Studio panel or with
`--props='{"bpm":120,"offset":0.42}'`, and run `node scripts/click.mjs 120` for a matching click.

## Settings (Studio panel or `--props`)

`bpm`, `offset`, `audio` (`pen`, `click`, `none`), `type` (`site`, `junicode`), `ownInk`, `ownPaper` (each hand in its own ink and on its own paper), `labels` (counter and names), `perWordBeats` (beats at
the end of the flip where each word takes its own hand), `landingSeed` / `landingStyle` (the hand it lands on),
`letterId` (an id from `content/sample-texts.json`), `grid` (the bar.beat counter), `size` (540 drafts, 1080 final),
`fps` (render only). Section lengths and the flip's curve are in `DEFAULTS` in `src/scene/timeline.ts`.
