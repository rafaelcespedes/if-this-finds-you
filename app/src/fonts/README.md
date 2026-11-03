# Fonts (fonts.html, /fonts)

Every hand as a free, open-source font, served like a foundry's list: a set of 24 hands, each a big line set **in its
own generated font**, with the writer's name (lib/hands.ts `writerName`, as the tool's label), tags (Joined · Palmer ·
fountain pen · Field journal; a tag filters by itself) and three actions: save it (heart), write with it (opens the
tool in that exact hand on a fresh sheet), download the font (.otf + .ttf zip). "Show 24 more" carries on with the same
set; "New set" (dock, or Space) draws another.

Run: `cd app && npm run dev`, open `/fonts.html` (the live site serves it at `/fonts`, clean URLs).

## Honest about limits (PRINCIPLES.md #7)
- **As a font** (default): the row's line is set in the hand's real font, built in a worker for the characters the row
  shows (`buildFont` with `chars`, stroke-merged with clipper, every alternate, join and kerning pair the download has)
  and loaded with `FontFace`. What you see is what you download. New characters (your own words) rebuild that row's
  font; until then the row keeps the last words it could set (never a fallback font).
- **Live hand**: the engine's live writing with the writer's own pen, ink and paper (renderCanvas on a strip of the
  paper), labelled as such with a line saying the font keeps a few versions of each letter.

## The URL is the state
`/fonts?set=k7f2q&f=script&t=palmer.spencerian&c=elegant&n=careful.relaxed&s=forward&w=wide&p=fountain&any=1&line=pangram&text=…&size=60&show=live&view=saved`

- `set` + the filters (+ `any=1`, Neat hands only off) decide the hands: the same link always gives the same set.
- `line` (letter, pangram, alphabet, figures, name) or `text` (your words), `size` and `show` decide the specimens.
- The default line is the opening of a real letter from the library, a different one per set, credited under the bar.

## How it works
- The page never loads the engine. `store.ts` starts up to four workers (`fonts.worker.ts`); the first draws sets.
- Sets: the engine's `sampleLooks` (docs/FILTERS.md), page k as `sampleSet({ offset })` gives it (seed, then `seed#k`,
  each page kept away from the earlier ones). `set.note` is shown above the rows when filters were too tight.
- Filters (`filters.ts`, engine-free) follow the research plan (side-session-notes …/fonts-view-filters.md, "Aligned
  with the engine spec"). Each choice maps to engine constraints; runs of stops (Tidy to wild, Slant) become one range;
  with Neat hands only on, open range ends are clamped to the engine's safe edges. Picking Messy turns Neat only off.
  Kurrent and Dutch come up only when picked (`historical: true`).
- Specimens only for rows near the screen (`near.ts`), on screen first; row heights fixed before anything arrives.
- Download: `buildFontPackage` in a worker of its own, for the very hand the row shows (neat or not).
- Saved hands: `favourites.ts`, localStorage `seedhand:fonts:saved`.

## Styling
Tokens at the top of `fonts.css` (`--fonts-*`), on top of `index.css` and the library's `archive.css` surfaces. The page
follows `?look=` like the tool and the library.

## QA
`window.__fonts.stats`: setShownMs, firstRowMs, tenthRowMs, fontMs (per font build), liveMs.
Measured (production build, headless Chrome, this Mac, cold): set on screen 0.55 s, first row 0.73 s, ten rows 1.3 s;
fonts build in 45–540 ms (joined hands are the slow ones). Scrolling the set: no frame over 19 ms.
