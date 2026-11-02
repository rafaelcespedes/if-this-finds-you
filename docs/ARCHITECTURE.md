# Architecture

```
engine/            the handwriting engine: plain ES modules, no build step, runs in browsers and Node
  index.js         public API. UIs import from here only
  core.js          seeded randomness (rng), smooth noise, math helpers
  glyphs.js        skeleton library: styles, letter variants (allographs), composers, choose()
  sources/         skeleton data that registers itself into glyphs.js
    hershey.js       'print' + 'script' styles from the public-domain Hershey fonts
    extras.js        smart quotes, dashes, € £ ¥ ¢ © ® ™ ° × ÷ … (GF Latin Kernel extras)
    data/            raw source files + their license notes
  hand.js          seed -> writer params (makeHand); one letter instance -> outlines (makeGlyph)
  pen.js           pen models (centerline -> filled outline) and ink look (SVG defs, stroke opacity)
  layout.js        text -> positioned glyph instances on a page (pure data)
  render-svg.js    laid-out page -> SVG string
  fontbuild.js     hand -> installable .otf (opentype.js passed in), calt cycling alternates
lab/               engine test bench (plain HTML). Controls are generated from engine PARAMS
app/               the product UI (React + shadcn). Imports ../engine
tools/             serve.py (static server), node-export.mjs, check_font.py, embed-hershey.mjs
docs/              status, research, decisions
references/        the open reference library (every source we used)
```

Run the lab: `python3 tools/serve.py 8765`, then open http://127.0.0.1:8765/lab/index.html.
Share a hand: `#seed=quiet-heron-17&style=script`.

## Data flow

```
seed ──makeHand──► hand (writer params)  ──withOverrides(ui)──► p
text ──layout(p)──► page.items[] ──renderSVG──► SVG
           │
           └─ for each character occurrence: makeGlyph(p, ch, inst, ctx)
                choose(p, ch, ctx) picks a skeleton variant  (glyphs.js)
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
- **Variants.** Every variant registered in `glyphs.js` must carry
  `source: { name, credit, url? }`. That is how the provenance card and the reference library stay honest.
- **PARAMS.** User-facing controls are declared as data (`HAND_PARAMS`, `PEN_PARAMS`, ...) and
  merged in `engine/index.js`. The lab renders all of them; the product UI picks a curated subset.
- **Missing characters** never fall back silently. `has(p, ch)` is false, `layout` emits a
  `kind: 'miss'` item, and the UI shows a pencil placeholder.

## Ownership while parallel sessions run (Phase 1)

| Workstream | Owns (may edit) | Must not edit |
|---|---|---|
| Letters & variety | `engine/glyphs.js` (choose), `engine/sources/*` (new source files), and makeHand personality ranges in `hand.js` | pen.js, layout.js, render-svg.js |
| Pens & ink | `engine/pen.js`, ink parts of `render-svg.js` | glyphs, sources, layout.js |
| Writing & page | `engine/layout.js`, `render-svg.js` (structure), new `engine/animate.js`; adds page params | glyphs, sources, pen.js |
| Accents | new `engine/sources/accents.js` (composer + marks) | everything else |
| Product UI | `app/**` only. It consumes the engine API and asks for engine changes rather than making them | `engine/**` |

Each workstream adds its PARAMS export and one import line to `engine/index.js`, and keeps that
edit small. `tools/qa/regress.mjs` must still pass, or the change must be explained as intentional.
