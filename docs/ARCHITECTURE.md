# Architecture

```
engine/            the handwriting engine: plain ES modules, no build step, runs in browsers and Node
  index.js         public API. UIs import from here only
  core.js          seeded randomness (rng), smooth noise, math helpers
  glyphs.js        skeleton library: styles, letter variants (allographs), composers, a writer's habits, choose()
  sources/         skeleton data that registers itself into glyphs.js
    hershey.js       'print' + 'script' styles from the public-domain Hershey fonts
    extras.js        smart quotes, dashes, € £ ¥ ¢ © ® ™ ° × ÷ … (GF Latin Kernel extras)
    allographs.js    alternative letter constructions (§4 of hand-traditions.md) + schooling bundles
    data/            raw source files + their license notes
  hand.js          seed -> writer params (makeHand: tradition, archetype, correlated traits, letters);
                   one letter instance -> outlines (makeGlyph)
  sampler.js       New hand: which seed to show next (archetype bag, farthest of 12, legibility cap, Variety)
  pen.js           pen models (centerline -> filled outline) and ink look (SVG defs, stroke opacity)
  layout.js        text -> positioned glyph instances on a page (pure data)
  render-svg.js    laid-out page -> SVG string
  inklog.js        the ink log: append-only events (write, strike, over, insert, ...), what they say
                   (logicalText, transcription), compact form and #ink= share links
  marks.js         how a writer corrects (fixHabits) and the marks: strikes, overwrites, carets, insertions
  sheet.js         Ink mode: replay a log onto paper (nothing placed ever moves), plan edits into events,
                   the pen trailing the typing (penStep), fair copy, P.S.
  corrections.js   the writer's journey: a draft with this writer's slips and fixes, planned as an ink log
                   and replayed by sheet.js (writeWithJourney)
  fontbuild.js     hand -> open-source font: .otf + .ttf, word forms and joins, cycling samples, kern; the zip download (docs/FONTS.md)
lab/               engine test bench (plain HTML). Controls are generated from engine PARAMS
app/               the product UI (React + shadcn). Imports ../engine
tools/             qa/ (engine checks), smoke/ (the site in a browser), trace/ (tracing letter shapes), fonts/ (font checks),
                   share-image/, serve.py (static server), node-export.mjs, check_font.py, embed-hershey.mjs
docs/              principles, decisions, voice, research and how each part works (WRITING.md, FONTS.md, CHECKS.md)
x-post-template/   a video of the writing for a post on X (Remotion)
```

Run the lab: `python3 tools/serve.py 8765`, then open `http://127.0.0.1:8765/lab/index.html`.
Share a hand: `#seed=quiet-heron-17&style=script`.

## Data flow

```
seed ──makeHand──► hand (writer params)  ──withOverrides(ui)──► p
text ──layout(p)──► page.items[] ──renderSVG──► SVG
           │
           └─ for each character occurrence: makeGlyph(p, ch, inst, ctx)
                choose(p, ch, ctx) picks a skeleton variant from the writer's habits  (glyphs.js)
                → zone remap, smoothing, per-hand quirk + per-use warp, bow/tremor, slant  (hand.js)
                → penOutline(p, centerline)  (pen.js)
```

## Contracts other modules rely on

- **Determinism.** Same seed + same overrides + same text = byte-identical output. All randomness goes
  through `rng(string)` and `makeNoise(string)`, never `Math.random()`. Seed strings are namespaced
  (`'hand:'`, `'inst:'`, `'variant:'`, ...). Add new namespaces; don't reuse existing ones.
- **Units.** Font units, UPM 1000, cap height 700. Glyph contours are y-up. Page coordinates in
  `layout()` are y-down, and `item.y` is the baseline.
- **makeGlyph(p, ch, inst, ctx)** returns `{ advance, contours, strokes, variant }`.
  - `strokes[i] = { center, contour, dot }`, in drawing order (for animation).
  - `inst = null` is the canonical form; `{ seed, amount, baseline? }` is one specific use.
- **Writers.** `makeHand(seed, family | style | { family, style, historical })` picks a tradition (style) in the
  family first, never a `legibility: 'historical'` one unless asked by name. `seed~k` is a sibling of `seed`.
  `p.habits` holds the writer's letters (schooling, quirks, context forms); `choose()` reads it. Variants tag
  their construction (`tags.allograph`, §4 names or short IDs); see the header of `glyphs.js`.
- **Skeleton pieces.** A stroke split where the pen turns back carries `joinFrom` / `joinInto`: one pen
  movement, so pens don't taper there and the pieces mustn't drift apart.
- **Variants.** Every variant registered in `glyphs.js` must carry
  `source: { name, credit, url? }`. That is how the provenance card and the reference library stay honest.
- **PARAMS.** User-facing controls are declared as data (`HAND_PARAMS`, `PEN_PARAMS`, ...) and
  merged in `engine/index.js`. The lab renders all of them; the product UI picks a curated subset.
- **Missing characters** never fall back silently. `has(p, ch)` is false, `layout` emits a
  `kind: 'miss'` item, and the UI shows a pencil placeholder.

## Ownership while parallel sessions run (Phase 1)

_Kept for the record: how the work was split while the project was being built._

| Workstream | Owns (may edit) | Must not edit |
|---|---|---|
| Letters & variety | `engine/glyphs.js` (choose), `engine/sources/*` (new source files), and makeHand personality ranges in `hand.js` | pen.js, layout.js, render-svg.js |
| Pens & ink | `engine/pen.js`, ink parts of `render-svg.js` | glyphs, sources, layout.js |
| Writing & page | `engine/layout.js`, `render-svg.js` (structure), new `engine/animate.js`; adds page params | glyphs, sources, pen.js |
| Accents | new `engine/sources/accents.js` (composer + marks) | everything else |
| Product UI | `app/**` only. It consumes the engine API and asks for engine changes rather than making them | `engine/**` |

Each workstream adds its PARAMS export and one import line to `engine/index.js`, and keeps that
edit small. `tools/qa/regress.mjs` must still pass, or the change must be explained as intentional.
