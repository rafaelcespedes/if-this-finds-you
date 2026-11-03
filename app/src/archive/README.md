# All letters (the library)

The library of If This Finds You: real letters by ordinary people, each written out by hand by a fictional writer,
easy to flip through. A second page of the app (`app/letters.html`, built beside the tool's `index.html`),
code-split from the tool. (Its working title was "Lost Letters"; code names like `lost-letters` remain in cache
keys and the QA handle.)

Run it with the app (`cd app && npm run dev`) and open **/letters.html**.

## Pages

- **Index** (`Index.tsx`, `Card.tsx`): "All letters" written in the logo's hand (#5, `all-letters.svg`, drawn by
  `heading.mjs` with brand/wordmark/wordmark.mjs), then every letter as the letter itself: a sheet of its paper
  with the letter written on it in its own hand, flat on the page (no shadow, nothing behind it), a touch askew, and
  its title underneath (in the letter face).
  Who wrote it, where and when are in the link's hover title and its screen-reader text. Masonry: three columns
  on wide screens, two from a phone up; each card goes into the shortest column, in reading order, so Tab follows
  the eye. Search, filters (era, language, letters or notes) and Shuffle above, bordered like the tool's controls.
  `/` searches.
- **Letter** (`LetterPage.tsx`, loaded on demand with the engine): the whole letter written out in front of you
  (the tool's reader: `ReaderSheets`, engine `timeline` + `playSVG`, about 3x, a tap or key finishes it), the
  provenance (story, writer, recipient, place, date, source, rights, translator), Read it as text, and Write a
  reply, Another (random), Share, Image (JPEG). **Previous / Next** (header, ← →, or a sideways swipe on phones)
  turn through the letters the index was showing. New hand and Keep this hand change the writer. Esc goes back.

Everything is in the URL hash (`route.ts`), so every view can be shared and Back works.

## How a letter gets its hand (`look.ts`)

A letter's own hand comes from its id through the engine's sampler (`sampleLook`, entropy `letter:<id>`), steered
by the letter: the oldest spellings only in hands taught before 1700, a taught hand from the letter's tradition
where the engine has one, a dip pen before 1880 and a fountain or dip pen before 1950, a fine or medium nib (bold
nibs blot small old hands), and the period's letter paper from the tool's stationery: handmade and laid sheets
before 1800, laid and British pads in the 1800s (blue laid for Dutch letters), pads and airmail before 1950 (airmail
for letters that crossed a sea), a torn-out school page for letters to Santa Claus or the Three Kings. A chosen hand travels as `hand=<seed>~<style>`; "Keep this hand" on a letter's own hand
is `hand=of:<letter id>`.

## Cards (`card.worker.ts`, `cards.ts`)

Cards are images written in workers (two on machines with 6+ cores). A card is a sheet of the letter's stationery
at letter size (wide notebook and A4 pages are cut to A5 width, so every hand shows at the same scale), as tall as
`cardAspect(text)` says: worked out from the letter's length alone, so the masonry is laid out before any card is
written and never moves. The worker paints the paper with the tool's painter (its real edges, no shadow, and
transparent around it, so deckled and torn edges and punched holes show the page) and writes the letter with the tool's live layout and the engine's
canvas renderer, whole lines only, as WebP. Visible cards go first (top to bottom), cards scrolled away before
their turn are skipped, and results are kept for the visit and, in production builds, in Cache Storage keyed by
the worker build. The workers start (and warm up the engine) while the letters JSON loads.

## The letter face (`serif.ts`)

A serif beside Instrument Sans for the letters' own words: card titles, and on a letter page the title, the story,
the record and the text. Newsreader by default, and three to compare in place, `?serif=1…4` (kept for the tab,
never in share links), only the chosen one loaded, all SIL Open Font License 1.1 via @fontsource:
1. Newsreader (the default), 2. Source Serif 4, 3. Literata, 4. Fraunces (soft cut, the warmest).

`window.__lostLetters.stats` has the timings (first card written and shown, per-card render times, cache hits).

## Shared code it uses (owned by the tool; not edited here)

`ReaderSheets`, `PaperCanvas`, `ui/*`, `lib/live.ts`, `lib/papers.ts`, `lib/actions.ts` (JPEG, share, copy),
`lib/hands.ts` (writer names), `lib/inks.ts`, `lib/engine-features.ts`, `content/sample-texts.json`.

## Write a reply

Opens the tool on its two-letter desk: a blank sheet for the reader (a new writer, never the letter's) with the
found letter beside it, in the same hand, pen, ink, paper, size and slider values (`replyTo` with its look). The
link is built with the tool's own `encodeState` (lib/state.ts), so its format lives in one place.

Letters written here and sent in are not planned (no submissions for now); `PHASE2.md` notes what the model
already leaves room for. The product name comes from `lib/brand.ts` (`APP_NAME`), shared with the tool.
