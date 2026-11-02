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
- **Sample letters.** Before anyone writes, the hand writes a short real letter from `content/sample-texts.json`
  (public domain, rights-checked; Dickinson's "Dear Peacock" first). Each New hand brings the next letter in the
  collection's order, preferring one that suits the style (Business: American letters, German school: German,
  Chancery: Italian). The credit sits under the sheet ("Words: Emily Dickinson, 1861", with the source in the
  provenance card), and "Blank page" starts from nothing. The first edit (typing, an underline) makes the text
  yours: from then on New hand changes only the look. Links carry `s=<letter id>` while the text is a sample.
- **The writer.** Their name in their own hand (similar hands share a family name), and one plain line
  about how they write.
- **New hand** (or **R** when not typing) rolls the whole look: a new writer (word seed, the most unlike
  of several candidates), Print or Joined, pen and tip, ink, paper, size, and a fresh offset on every
  slider, each inside a band that stays legible. Small **locks** beside Pen, Ink and Paper keep those
  while everything else rolls (remembered per browser). The next two new hands (and a sibling) are
  rolled and written ahead in a second worker while you look at the current one, so a click shows the next
  hand at once. From the button, paper and writing cross-fade in place (170 ms, opacity only; a click
  mid-fade takes over from where it is); from the keyboard it simply appears. The controls never move,
  fade or reload. The roll is plain note state, so the share link
  captures all of it. `lib/roll.ts` is the local sampler; when `engine/sampler.js` exports
  `sampleLook({ current, locked, variety })`, it takes over and the app fills in only what it leaves out.
- **Similar** (or **Shift R**) gives a sibling and keeps the look: same words, another number, close but
  not a copy.
- **Style** is two steps, so it scales to many styles: **Print or Joined**, then a row of **school cards**
  (Everyday, Business 1915, German school, Chancery, ...), each written in this writer's hand in that
  school, with where and when it was taught (`getStyle(name).tradition`). New styles from the engine show
  up as cards by themselves (`lib/styles.ts`). The cards scroll sideways.
- **Controls** follow `docs/research/controls-and-feel.md`:
  - *How it's written:* Neatness, Hurry, Pressure, Slant, and an Occasion (Thank-you card, Shopping list,
    Love letter, Lecture notes, Postcard) with an Amount.
  - *Pen, ink and paper:* Pen (Their own, Ballpoint, Gel, Fountain, Dip pen, Italic nib, Felt tip, Pencil;
    each swatch is the word "ink" written with that pen), a Fine / Medium / Bold tip, ink families, Paper.
    Size sits with *How it's written*.
  - *More controls* (a disclosure): Tip size (in mm), Ink flow, Ink variation, Paper tooth, Nib angle,
    Line spacing, Line rhythm, Baseline wobble, Margins, Letter spacing (print only), Word spacing,
    Letter height, Letter width, Tremor, Tiredness, Variety (how far New hand jumps).
  - **Every slider is seed-relative.** The thumb starts at this hand's natural value (the small dot on
    the track) and moving it adds an offset; double-click a slider to go back to the dot. Similar hand
    keeps your How and With-what offsets and clears the Who ones (slant, proportions, spacing).
- **Actions.** Share link (copies a URL that restores the exact note; the toast offers the share sheet
  where there is one), Download note (JPEG at 3x the screen, paper and writing exactly as shown; on phones
  it opens the share sheet, so Save Image puts it in Photos), Export font file (.otf from the engine's
  `buildFont`, opentype.js 1.3.4, loaded only when used).
- **On phones** the controls live in a sheet that's always there, at three heights (`ControlSheet.tsx`):
  - *peek:* the writer, New hand, a share button (Share link, Download note, Export font), and three tabs:
    Hand, Writing, Pen & paper. Tap a tab to open it.
  - *half:* that tab's controls. The letter shrinks to fit above the sheet, so every change shows.
  - *full:* everything, scrolling. While a finger slides a control, the rest of the sheet fades away and
    the letter moves into the free space above or below that control.
  - Drag the top (or the content, below full height) to move between heights; a flick goes on to the next
    one. A tap on the letter folds the sheet down; a second tap writes. Writing hides the sheet behind the
    pen tray.
  - Sliders on touch move only on a sideways drag, from where they were. A finger landing on a track never
    changes it (scrolling past is safe), up/down goes to the sheet, and a double tap puts it back.
  - For a moment after the sheet moves, its controls ignore touches, so the tap that opened it can't land
    on whatever slid in under the finger.
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
  App.tsx                 layout: desk + sheets, side panel (desktop) or control sheet (phones), actions
  components/
    Writing.tsx           THE writing renderer on screen (see "Renderer boundary")
    SheetView.tsx         one sheet: paper canvas + writing
    PaperEditor.tsx       typing on the paper: hidden textarea, caret, selection, line-aware keys
    Panel.tsx             the controls, in sections the side panel and the phone sheet share
    ControlSheet.tsx      the phone's control sheet: peek / half / full, tabs, share menu, drag
    StylePicker.tsx       Print or Joined, then school cards with a sample in each school
    PenPicker.tsx         pen swatches (a word in each pen) and the tip
    Specimen.tsx          small handwriting samples, made in idle moments and kept
    PaperCanvas.tsx       paints a sheet (or a swatch crop) on a canvas
    Signature.tsx         the writer's name in their own hand
    DraftSlip.tsx         the plain-text editor
    ui/                   shadcn-style primitives (button, slider, segmented, tooltip, toast)
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
    styles.ts             Print / Joined families and the school cards' names (from getStyle)
    samples.ts            the sample letters: order, pairing with styles, credits
    pens.ts, inks.ts, occasions.ts
    state.ts              the note config and the share-link format
    hands.ts              word seeds, writer names, plain-word descriptions, "very different" new hands
    actions.ts, perf.ts, utils.ts
  workers/write.worker.ts writes the page off the main thread (newest request wins); a second copy writes
                          hands ahead (lib/request.ts builds both from the note state)
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

**New hand**, production build, Chrome on an M-series Mac, 1440 px wide, letters of 1–3 pages, 20 clicks
400 ms apart: new hand on the page in a median 46 ms (p95 77 ms) when written ahead, 78 ms (p95 145 ms)
when not. Looks are written in a worker (lib/write-live.ts on engines with the live page, the same markup
the live page draws); the live page is built only for typing, from the tap, and hands back to the worker's
copy without a visible change. Painted papers are kept, so switching back to a paper is a copy.

Typing, measured in Chrome on an M-series Mac, default letter (270 characters):

- main thread: no long tasks while typing; the input handler takes ~8 ms (dev build, StrictMode)
- the worker writes the page in ~56 ms, so the writing catches up ~58 ms after each key
- a 1,500-character, four-page note takes ~220 ms per write in the worker; typing stays smooth, the
  writing trails a little (see the engine requests in the hand-over notes)

`window.__seedhandPerf.report()` prints the live numbers.
