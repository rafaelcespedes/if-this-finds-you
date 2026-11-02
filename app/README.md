# Seedhand app

The product UI for the live handwriting engine. One letter sheet in the middle, one quiet panel beside it.
Type straight onto the paper; every letter is drawn fresh, in the hand of a fictional writer.

## Run it

```bash
cd app && npm start
```

That installs the pinned dependencies (first run only takes a few seconds) and starts the dev server at
**http://127.0.0.1:5173**. Node 20 or newer.

Other scripts: `npm run dev` (server only), `npm run build` (typecheck + production build into `dist/`),
`npm run preview` (serve the build at http://127.0.0.1:4173), `npm run typecheck`.

## What's here

- **The letter.** A real-proportioned sheet with paper grain and a soft shadow. Baselines land on the
  paper's rules at the chosen size. Long notes continue on further sheets.
- **Typing on the paper.** Click (or tap) the letter and type. The caret and selection follow the
  handwriting; Up/Down/Home/End follow the written lines; Esc finishes. "Edit as plain text" opens a
  normal text box for long edits or pasting.
- **The writer.** Their name in their own hand, a name derived from the seed, and one plain line about
  how they write. **New hand** (or **R** when not typing) meets a new writer: a new word seed, a coin
  flip between print and script, and, of ten candidates, the one most unlike the current hand.
- **Controls.** Style, Neatness, Slant, Pen width, Pressure (ranges from the engine's `PARAMS`, trimmed to
  the part that still looks human, described in words), Paper, Size, Ink.
- **Actions.** Share link (copies a URL that restores the exact note), Download note (JPEG at 3x the
  screen, paper and writing exactly as shown), Export font file (.otf from the engine's `buildFont`,
  opentype.js 1.3.4, loaded only when used).

## Papers

| Paper | Based on |
|---|---|
| Letter | Plain A5 writing paper |
| College ruled | US loose-leaf filler paper, 8 × 10½ in: 33 blue rules at 9/32 in (7.14 mm), pink-red margin 1¼ in from the left, three 5/16 in holes 4¼ in apart |
| Seyès | French cahier 17 × 22 cm: violet writing lines and verticals every 8 mm, three light-blue interlines at 2 mm, red margin. Small letters fill one 2 mm interline, as French schools teach |
| Feint ruled | UK exercise book, 9 × 7 in: pale blue feint rules at 8 mm, single red margin |
| Squared | German Kästchen (DIN 16552 Lineatur 10 style): 5 mm squares on A5, plain margin on the right |
| Dot grid | Rhodia / Leuchtturm1917 style A5: 5 mm grey dots on ivory |

Pitches, sheet sizes, line counts and hole geometry come from manufacturer and retailer listings
(Mead/Staples filler paper, Clairefontaine, Silvine, Rhodia, Leuchtturm), Wikipedia "Ruled paper" and
"Réglure", and DIN 16552 summaries. Colours and line weights are not published anywhere; they are
matched by eye. On small grids (squared, dots) the writing takes every second line, like a real hand.

## How it's put together

```
src/
  App.tsx                 layout: desk + sheets, side panel (desktop) or dock + drawer (mobile), actions
  components/
    Writing.tsx           THE writing renderer on screen (see "Renderer boundary")
    SheetView.tsx         one sheet: paper canvas + writing
    PaperEditor.tsx       typing on the paper: hidden textarea, caret, selection, line-aware keys
    Panel.tsx             the controls (shared by side panel and drawer)
    PaperCanvas.tsx       paints a sheet (or a swatch crop) on a canvas
    Signature.tsx         the writer's name in their own hand
    DraftSlip.tsx         the plain-text editor
    ui/                   shadcn-style primitives (button, slider, segmented, tooltip, drawer, toast)
  lib/
    compose.ts            hand + text + paper + size -> sheets of positioned writing (mm <-> font units)
    papers.ts             paper specs + one painter used for the screen and the JPEG
    writing.ts            engine SVG at a fixed reference scale, id scoping, rasterising for the JPEG
    write-core.ts         request -> result (runs in the worker, and on the main thread for downloads)
    caret.ts              text index <-> position on the handwriting
    state.ts              the note config and the share-link format
    hands.ts              word seeds, writer names, plain-word descriptions, "very different" new hands
    controls.ts, inks.ts, actions.ts, perf.ts, utils.ts
  workers/write.worker.ts writes the page off the main thread (newest request wins)
```

The engine is imported from `../engine/index.js` through the `@engine` alias (see `vite.config.ts`,
`server.fs.allow`). The app never edits or copies it; `src/engine.d.ts` types the parts it uses.

### Renderer boundary

Everything that turns laid-out writing into pixels lives in `lib/writing.ts`, `components/Writing.tsx`
and the worker. The page is written once at a reference scale (4 px/mm) and CSS sizes it to the sheet,
so resizing is free, and the JPEG reuses the very same SVG at 3x (the engine's ink filter depends on the
drawing scale, so re-rendering at another size would not match). Ink is `currentColor`, so changing ink
needs no re-render. Swapping in a canvas/WebGL `renderCanvas`, or a stroke-by-stroke write-on
animation, means changing those three files only.

### Share link

Everything lives in the URL hash, readable where it can be:

```
#seed=quiet-heron-17&style=script&paper=seyes&ink=royal&size=1.1&o=n0.72_s4.5_w50_p0.3&t=<lz-string>
```

`o` holds slider overrides (n = neatness, s = slant, w = pen width, p = pressure); `t` is the text,
compressed with lz-string (omitted when it's the default letter). The hash is kept up to date while you
work, so a reload restores the note too. Invalid values fall back to defaults.

### Performance

Measured in Chrome on an M-series Mac, default letter (270 characters):

- main thread: no long tasks while typing; the input handler takes ~8 ms (dev build, StrictMode)
- the worker writes the page in ~56 ms, so the writing catches up ~58 ms after each key
- a 1,500-character, four-page note takes ~220 ms per write in the worker; typing stays smooth, the
  writing trails a little (see the engine requests in the hand-over notes)

`window.__seedhandPerf.report()` prints the live numbers.
