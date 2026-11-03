# Fonts (fonts.html, /fonts)

Every hand as a free, open-source font, served like a foundry's list: a set of 20 hands, each a big specimen line in
its own hand, with the writer's name, a few quiet words (Joined · Spencerian · fountain pen) and three actions: save it
(heart), write with it (opens the tool in that hand on a fresh sheet), download the font (.otf + .ttf zip).

Run: `cd app && npm run dev`, open `/fonts.html` (the live site serves it at `/fonts`, clean URLs).

## The URL is the state
`/fonts?set=k7f2q&f=script&t=palmer.spencerian&n=careful&s=slight&p=fountain&any=1&text=…&size=72&show=ink&view=saved`

- `set` + the filters (+ `any=1`, Neat hands only off) decide which hands: the same link always gives the same set.
- `text`, `size` and `show` (plain | ink) decide how the specimens are written. Defaults are left out.
- "Another set" pushes a history entry (Back returns to the last set, shown at once from memory); everything else
  replaces it.

## How it works
- The page never loads the engine. `store.ts` starts one or two workers (`fonts.worker.ts`) that load it once.
- Worker 0 draws the set (`sample.ts`): slot by slot, a few candidates that pass the filters and Neat hands only
  (engine `seedFrom` + `lookOf` + `legibility`), keeping the one farthest from the hands already chosen. Each pick is
  sent at once, named (`lib/hands.ts writerName`, no two alike in a set) and given its tool link (`lib/state.ts
  encodeState`).
- Specimens are written only for rows near the screen (`near.ts`), on screen first. Plain = the hand's outlines
  filled flat in the UI's ink, as a small SVG (what the font draws). Ink on paper = the engine's live renderer on a
  strip of the hand's own paper, as a WebP. Row heights are fixed before anything arrives (`protocol.ts BOX`).
- While the size slider moves, the last specimens scale with their row; new ones are written when you let go.
  Typing waits a quarter second.
- Download reuses the tool's font worker (`workers/font.worker.ts`, `buildFontPackage`).
- Saved hands: `favourites.ts`, localStorage `seedhand:fonts:saved`, with everything needed to write them again.

## Filters
`filters.ts` holds them (no engine): label, URL name, choices and the test the worker runs. Print / Joined lives in
the dock; tradition, neatness, slant, pen and Neat hands only in the panel above it (a sheet on phones). These are
placeholders until the research plan lands; a new filter is one more entry in `filterDefs` (and, if the engine
should decide it while sampling, a line in `sample.ts`).
When the engine exports its constrained sampler, `sample.ts` hands over to it.

## Styling
Tokens at the top of `fonts.css` (`--fonts-*`), on top of `index.css` and the library's `archive.css` surfaces.

## QA
`window.__fonts.stats`: firstEntryMs, firstRowMs, tenthRowMs, renderMs per specimen, setMs.
Measured (production build, headless Chrome, this Mac): ten rows written in 0.63 s (0.9 s with the CPU slowed 4x);
scrolling the whole set: no frame over 17 ms, no long tasks.
