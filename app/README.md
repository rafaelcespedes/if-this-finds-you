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
- **The writer.** Their name in their own hand (similar hands share a family name), and one plain line
  about how they write. **New hand** (or **R** when not typing) meets a new writer: a new word seed, a coin
  flip between Print and Joined, and, of several candidates, the one most unlike the current hand.
  **Similar** (or **Shift R**) gives a sibling: same words, another number, close but not a copy.
- **Controls** follow `docs/research/controls-and-feel.md`:
  - *How it's written:* Neatness, Hurry, Pressure, Slant, and an Occasion (Thank-you card, Shopping list,
    Love letter, Lecture notes, Postcard) with an Amount.
  - *Pen, ink and paper:* Pen (Their own, Ballpoint, Gel, Fountain, Felt tip, Pencil) with Fine / Medium /
    Bold, ink families, Paper, Size.
  - *More controls* (a disclosure): Tip size (in mm), Ink flow, Ink variation, Paper tooth, Nib angle,
    Line spacing, Line rhythm, Baseline wobble, Margins, Letter spacing (print only), Word spacing,
    Letter height, Letter width, Tremor, Tiredness, Variety (how far New hand jumps).
  - **Every slider is seed-relative.** The thumb starts at this hand's natural value (the small dot on
    the track) and moving it adds an offset; double-click a slider to go back to the dot. New hand keeps
    your How and With-what offsets and clears the Who ones (slant, proportions, spacing), so a new writer
    is never dragged toward the last one's settings.
- **Actions.** Share link (copies a URL that restores the exact note; the toast offers the share sheet
  where there is one), Download note (JPEG at 3x the screen, paper and writing exactly as shown; on phones
  it opens the share sheet, so Save Image puts it in Photos), Export font file (.otf from the engine's
  `buildFont`, opentype.js 1.3.4, loaded only when used).
- Occasions set the scene once when picked: Thank-you card and Love letter on laid paper, Postcard on the
  postcard, Lecture notes on college ruled, Shopping list on squared.

### Controls waiting for the engine

Controls the engine can't draw yet are built and wired, but hidden until the engine supports them, so
nothing ships dead. `?preview` in the URL (or `localStorage['seedhand:preview'] = '1'`) shows them with a
"soon" tag. Each lights up by itself once the engine lists the key in `PARAMS` (or, for pens and inks,
exports `PENS`/`INKS`/`inkModel`):

| Control | Placeholder param | What the engine should do |
|---|---|---|
| Pen | `p.pen`: `ballpoint` `gel` `fountain` `felt` `pencil` (+ `auto`) | the pens & ink branch has these |
| Ink | `p.ink`: `blue-black` `royal-blue` `ballpoint-blue` `black` `sepia` `iron-gall` `red` `green` `graphite` (+ `auto`) | the pens & ink branch has these; the app then passes the key to `renderSVG` instead of a colour |
| Hurry | `hurry` 0..1 | slant +0–8°, width +0–10%, longer tapers, more stroke shift, lighter ink, looser lines, neatness −0.3× |
| Ink flow | `inkFlow` 0..1 | dry ↔ wet: density, end pools, halo, ballpoint skips, felt bleed |
| Ink variation | `inkVariation` 0..1 | per-stroke colour jitter, along-stroke gradient, page drift |
| Paper tooth | `paperTooth` 0..1 | grain depth and absorbency |
| Line rhythm | `lineRhythm` 0..1 | pitch variation, per-line slope, end bend, float off the rule |
| Margins | `marginDiscipline` 0..1 | left-start jitter, inward drift, last-word squeeze |
| Tiredness | `tiredness` 0..1 | neatness falls and size grows along the text |

Tested against the pens & ink branch with `SEEDHAND_ENGINE` (below): the pen picker and modelled inks
switch on without code changes, and the JPEG keeps the modelled ink.

### Edits are events

Every change to the text, from the paper or from the plain-text box, arrives as one
`Edit { at, del, ins, kind, t, source }` (`lib/edits.ts`, `hooks/useEditInput.ts`). The browser applies the
edit (so IME, autocorrect, dictation and undo keep working); `beforeinput` supplies the kind, and a diff of
the old and new value is the truth. Today's document model simply applies each edit ("fair copy"); the
ink mode in `docs/research/writing-experience.md` can replace it with an append-only ink log without
touching the inputs. The textarea always holds the logical text, labelled with the writer's name, for
screen readers. `window.__seedhandEdits.events` shows the stream.

### Previewing another engine

```bash
cd app && SEEDHAND_ENGINE=/path/to/another/worktree/engine npx vite --port 5175
```

Points the `@engine` alias at another engine folder (for example a parallel session's branch), so its
work can be seen in the product UI without merging.

## Papers

| Paper | Based on |
|---|---|
| Letter | Plain A5 writing paper |
| Laid | Cream laid writing paper, A5: fine laid lines about 1 mm apart, chain lines about 25 mm apart |
| College ruled | US loose-leaf filler paper, 8 × 10½ in: 33 blue rules at 9/32 in (7.14 mm), pink-red margin 1¼ in from the left, three 5/16 in holes 4¼ in apart |
| Seyès | French cahier 17 × 22 cm: violet writing lines and verticals every 8 mm, three light-blue interlines at 2 mm, red margin. Small letters fill one 2 mm interline, as French schools teach |
| Feint ruled | UK exercise book, 9 × 7 in: pale blue feint rules at 8 mm, single red margin |
| Squared | German Kästchen (DIN 16552 Lineatur 10 style): 5 mm squares on A5, plain margin on the right |
| Dot grid | Rhodia / Leuchtturm1917 style A5: 5 mm grey dots on ivory |
| Postcard | The message side of an A6 postcard: centre divider, four address lines, a stamp box |

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
    controls.ts           the control registry: ranges, zones (who / how / with), tiers, placeholders
    params.ts             natural hand + offsets + occasion -> engine overrides
    engine-features.ts    what the engine supports now; preview flag; placeholder params
    edits.ts              Edit events (the seed of the ink log)
    pens.ts, inks.ts, occasions.ts
    state.ts              the note config and the share-link format
    hands.ts              word seeds, writer names, plain-word descriptions, "very different" new hands
    actions.ts, perf.ts, utils.ts
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
#seed=quiet-heron-17&style=script&pen=fountain&tip=fine&ink=royal-blue&paper=seyes&size=1.1&o=ne0.12_sl-3&occ=love&amt=1.2&t=<lz-string>
```

`o` holds the seed-relative offsets, each a two-letter code from `lib/controls.ts` plus a number
(ne = neatness, sl = slant, pw = tip size, ...); `t` is the text, compressed with lz-string (omitted when
it's the default letter). Preview flags are never put in a shared link. The hash is kept up to date while you
work, so a reload restores the note too. Invalid values fall back to defaults.

### Performance

Measured in Chrome on an M-series Mac, default letter (270 characters):

- main thread: no long tasks while typing; the input handler takes ~8 ms (dev build, StrictMode)
- the worker writes the page in ~56 ms, so the writing catches up ~58 ms after each key
- a 1,500-character, four-page note takes ~220 ms per write in the worker; typing stays smooth, the
  writing trails a little (see the engine requests in the hand-over notes)

`window.__seedhandPerf.report()` prints the live numbers.
