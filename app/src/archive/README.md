# Letters (the library)

The library of If This Finds You: real letters by ordinary people, each written out by hand by a fictional writer,
easy to flip through. A second page of the app (`app/letters.html`, built beside the tool's `index.html`),
code-split from the tool. (Its working title was "Lost Letters"; code names like `lost-letters` remain in cache
keys and the QA handle.)

Run it with the app (`cd app && npm run dev`) and open **/letters.html**.

## Pages

- **Index** (`Index.tsx`, `Card.tsx`): every letter as a card, the top of its first sheet with the opening lines in
  the letter's own hand. Search (text, writer, recipient, place), filters (era, language, letters or notes) and
  Shuffle (a random letter, from what's shown, in a random hand). `/` searches.
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

Cards are images written in workers (two on machines with 6+ cores): the tool's paper painter, then the opening
lines laid out by the tool's live layout and inked by the engine's canvas renderer, encoded as WebP. A card shows a
window onto the top left of the sheet at about 2.3 CSS px per mm, with the letter wrapped to the window, so the
hand reads at a natural size. Visible cards go first (top to bottom), cards scrolled away before their turn are
skipped, and results are kept for the visit and, in production builds, in Cache Storage keyed by the worker build.
The workers start (and warm up the engine) while the letters JSON loads.

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
