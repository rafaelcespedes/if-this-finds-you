# All letters (the library)

The library of If This Finds You: real letters by ordinary people, each written out by hand by a fictional writer,
easy to flip through. A second page of the app (`app/letters.html`, built beside the tool's `index.html`),
code-split from the tool. (Its working title was "Lost Letters"; code names like `lost-letters` remain in cache
keys and the QA handle.)

Run it with the app (`cd app && npm run dev`) and open **/letters.html**.

## Pages

- **Index**, two views to compare with `?view=canvas|grid` (kept for the tab, never in share links):
  - **canvas** (`Canvas.tsx`, the default): the letters scattered like paper on a table around "All letters"
    (written in the logo's hand, `all-letters.svg` from `heading.mjs`) and the intro, a field that loops in every
    direction. Drag or swipe (with a glide), trackpad or wheel, arrow keys; a tap opens a letter, a drag never does.
    One wrapped tile, larger than the screen, so each letter shows at most once; only the letters near the screen
    are on the page, and moving updates their positions directly. A search or a century regathers the matching
    letters around the heading. Tab brings each letter into view; "Show the letters as a list" (first in Tab
    order) switches to the grid. Reduced motion: no glide.
  - **grid** (`Index.tsx`, `Card.tsx`): the masonry: three columns on wide screens, two from a phone up, each card
    into the shortest column, in reading order.
  Every card is the letter itself: a sheet of its paper in its own hand, flat on the page (no shadow, nothing behind
  it), a touch askew, and its title (in the letter face). Who wrote it, where and when are in the link's hover
  title and its screen-reader text.
  Browsing controls stay small (research and reasoning in `CONTROLS.md`), three arrangements with
  `?toolbar=1…3`: 1 a search icon in the heading plus a one-sentence filter (grid view only); 2 a floating dock with
  Era and Language menus; 3 the dock with a timeline of every letter by century (the default). No Shuffle and no
  count on screen; screen readers hear the count after each change. Search starts folded to an icon; `/` opens
  it; Esc clears, then closes.
- **Letter** (`LetterPage.tsx`, `LetterParts.tsx`, loaded on demand with the engine): a quiet reading page. The
  letter written out in front of you is the hero (the tool's reader: `ReaderSheets`, engine `timeline` +
  `playSVG`, about 3x, a tap or key finishes it). The words around it are editorial, in the letter face: title,
  an italic dateline (who to whom), where and when, the story, the record (written by, to, from, when, language,
  translator), the letter as text, and numbered notes for the source, the rights and the fictional hand.
  Everything you can do sits in one floating dock (the library's and the tool's right panel's family):
  Previous / Next (also ← →, and a sideways swipe on phones), Another hand, Share, More (read it as text, save as
  an image, a letter at random) and Write a reply. "In Ilse Pryor's hand ⌄" under the sheet holds Another hand,
  Write it out again and Keep this hand (the tool's writer-dropdown pattern). Two layouts to compare with
  `?detail=1|2`: 1 side by side (the letter left, the reading right), 2 letter first, one column (the default).
  Esc goes back to all letters.

Colours, sizes and surfaces for the library are `--lib-*` tokens at the top of `archive.css`.

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
