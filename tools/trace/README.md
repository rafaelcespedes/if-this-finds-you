# tools/trace — real handwriting into engine skeletons

Turns public-domain and openly licensed handwriting scans into the single-line skeletons the engine draws
with, one `engine/sources/<style>.js` per tradition. Every letter keeps its source and credit.

```
manifest/<id>.json   one file per scan source: URL, holder, and the rights checked on the holder's own page
sources/<id>.md      full credits per source, for the reference library (SOURCES.md is the index)
hands/<style>.json   one hand: style metadata, crop box + guide lines per glyph, and any hand fixes
trace.py             fetch · grid · comps · build (extract -> review sheets -> engine source)
skel.py              ink -> centerline strokes (skeleton graph, stroke order and direction)
viacheck.py          large overlay of one glyph's waypoints and snapped strokes on its plate
htr.py               labelled letters from HTR ground truth (ALTO lines + page images)
preview.mjs          render traced styles through the real engine, large, several seeds
review/              compact copies of the review sheets (source crop | normalised skeleton)
raw/ out/ .venv/     downloads, working output, Python env (gitignored)
```

## Setup (once)

```bash
python3 -m venv tools/trace/.venv
```

```bash
tools/trace/.venv/bin/python -I -m pip install numpy scipy scikit-image Pillow
```

Downloaded scans are untrusted data: they live only in `tools/trace/raw/<source-id>/`, scripts stay in
`tools/trace/`, and Python always runs with `-I`.

## Adding a tradition (the quick path)

1. **Rights first.** Open the item's page at the holding library, read its rights statement, and add
   `manifest/<source-id>.json` (`rights.statement`, `where`, `checked`, `verdict`; copy an existing file).
   Skip anything non-commercial (NC) or share-alike (SA). Then download: `trace.py fetch <source-id>`.
   Add `sources/<source-id>.md` and one line in SOURCES.md. Several sessions trace in parallel: only
   ever add your own files; never edit another source's.
2. **Find the letters.** `trace.py comps hands/<style>.json <image-key> x0 y0 x1 y1` numbers the ink
   components in a region and prints their boxes. `trace.py grid <image> x0 y0 x1 y1 --scale 4` gives a
   zoomed crop with a pixel grid, for reading guide lines and drawing fixes.
3. **Write the hand file.** Copy `hands/suetterlin.json`. Per row: `base` (a y, or a sloped line
   `[x0, y0, x1, y1]`) and a scale (`capH`, `cap`, `xH` or `x`). Per glyph: `ch`, `row`, `box`, optional
   `var` (second form), `tags.allograph` (hand-traditions.md §4). Measure guides on the stroke
   centerline, not the ink edge.
4. **Build and look.** `trace.py build hands/<style>.json` writes `out/<style>/review-*.png` and
   `engine/sources/<style>.js`. Read every sheet. `--only abc` rebuilds a few letters; `--sheet-only`
   skips the engine file.
5. **Fix by hand where needed** (per glyph, image coordinates):
   `erase` / `erasePoly` (a neighbour's ink), `own` (keep only ink components mostly inside the box),
   `reverse`, `order`, `drop` (stroke indices), `retraceJoin` ([[i, j]]: one gesture through a retrace),
   `noDots`, `manual` (draw the strokes yourself: lists of [x, y]; use when the skeleton can't separate
   strokes, e.g. a broad-nib woodcut), `noJoin` (a joined-hand letter that lifts), `entryStroke`,
   `skeleton.dotMax`.
6. **Register** the style with one import line in `engine/index.js`, then check it:
   `node tools/trace/preview.mjs <style>` (open `/tools/trace/out/preview.html` through
   `python3 tools/serve.py <port>`), the lab, and `node tools/qa/regress.mjs`.

## How to trace the next tradition: choosing the method

Look at the plate first, then pick the cheapest method that gives clean centerlines:

| The plate shows | Method | Example |
|---|---|---|
| Letters standing apart, crisp ink, no ruling | automatic: `box` per glyph, `build`, fix a few by hand | Palmer 1915, Sütterlin 1917 |
| Ruled guide lines through the letters | add `"rules": "auto"` (and `ruleHalf`, `ruleFrac`) to `binarize`: level rules are blanked and every hairline that crossed one is bridged. Needs a level plate (see warp) | Spencerian 1866 |
| A tilted or steeply slanted plate, letters joined on one line | an image entry with `"warp": {"crop": [...], "rotate": deg, "shear": deg}`: a levelled, upright copy, so joined letters separate along vertical cuts and rules lie flat. Then set `units.slant.source` 0 and `units.slant.natural` to the copybook's slant | Spencerian 1866 |
| Thin hairlines, crossings and loops the skeleton can't untangle | **waypoints**: per glyph `"via": [[[x, y], ...], ...]`, a few rough points per stroke in writing order; each stroke is snapped through the ink's centre (shortest path weighted by stroke width, gaps bridged). Check with `viacheck.py <hand> <char> --scale 2`. `{"line": [...]}` draws a stroke exactly as given (a faint shaded oval, a t-bar) | Spencerian 1866 (all small letters) |
| A broad-nib woodcut whose strokes merge | `manual` strokes drawn over a `grid` view | Arrighi 1524 (m n p r ſ) |
| A partly joined hand (italic, running hand) whose letters touch only some neighbours | `"joins": "natural"` with `connected: true`: no common join height, letters keep their own entries and exits and are spaced on their x-height band (`units.naturalGap`) | Arrighi 1524 |
| Ordinary people's writing with line transcriptions | `htr.py` (below) | Québec volunteers 2024 |

Register what makes the tradition's movement distinct rather than normalising it away: keep its own
connector angle (measured automatically from the lead-ins it had to cut; `units.entryAngle` overrides),
join height (`units.join`), loop sizes and ascender proportion (`units.xRatio`), which letters lift
(`noJoin`), and its capitals' flourishes. Each emitted style records a `natural` block (slant, built-in
slant, x-height, ascender, descender, advance, joins) for the engine's hand sampler.

## What the pipeline does

- **Binarize:** flatten the paper (closing + blur), Otsu or a fixed threshold, optional opening to drop
  ruled lines, specks and pinholes removed.
- **Skeleton graph** (skel.py): skeletonize; nodes are stroke ends and junctions; prune whiskers;
  contract junction pairs; at each junction pair the edges that continue most straight (a loop's crossing
  stays one stroke). Joined hands also re-insert **retraces** (the stem of u, i, t; the turn of m, n;
  the return of an e's loop), so letters come out as the one gesture the copybook teaches.
- **Direction and order:** top-to-bottom, left-to-right; ovals counter-clockwise from about 1 o'clock;
  bars and dots last. `autoJoin` keeps the pen down when the jump between two strokes runs along ink
  already drawn (a print a or d stays one gesture).
- **Normalise:** to style units (baseline 0, cap height 200, y down), deslant from the source's slant to
  the style's target, and limit heights so nothing leaves the page.
- **Joined hands:** every small letter starts and ends at one join height (`units.join`, a fraction of
  the x-height): lead-ins are cut where they rise through it or extended; oval letters (a c d g o q) get
  the copybook lead-in merging into the top of the oval; top exits (o v w b) curve down to it.
- **Waypoint strokes** (`via`): waypoints snap to the nearest ink centre; between them the cheapest path
  runs down the stroke's middle; the pixel path is resampled, gaussian-smoothed (ends pinned) and simplified.
- **Metrics:** the descender line comes from the source (deepest small-letter descender, or the median
  via `units.descender` when many writers are pooled).

## HTR ground truth (ordinary people's print)

`htr.py letters <source-id> <page>... --writer <key>` splits each transcribed line into words at its widest
gaps, joins the pieces of letters broken by a faint pen, and labels a word's ink clusters with its
letters only when the counts match **and** each cluster rises and falls where its letter should (ascender,
descender, x-height). Shifted labels fail that test, so what survives is reliable. Only print hands
align; joined writing is skipped, never forced. `htr.py sheet` shows the labelled letters;
`htr.py pick <cands.json>... --hand hands/<style>.json [--chars ...]` adds each writer's most typical
instance of every letter, tagged `tags.writer`, with the writer's own slant measured from their stems.
Then review the sheets and mark rejects with `"skip": true`.
