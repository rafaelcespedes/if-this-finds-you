# If This Finds You (app)

**If This Finds You** is the product's name: how a message in a bottle begins, a letter that may never have
arrived, and you're the one it found. People see it in the header, the page title ("Yara Rowe – If This Finds
You"), the share sheet and file names (`lib/brand.ts`). *Seedhand* is the code name: it stays in code and in
storage keys, so saved drafts and settings keep working.

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
  (public domain, rights-checked). The seed picks it (a hash over the enabled letters, so a seed always writes
  the same one), preferring letters that suit the style (Business and Spencerian: American letters, German
  school: German, Chancery: Italian, Québec print: French); the oldest spellings (before 1660) only come with
  historical hands (Chancery). "Blank page" starts from nothing. The first edit (typing, an underline) makes the
  text yours: from then on New hand changes only the look. Links carry `s=<letter id>` while the text is a
  sample. There's always a way back: under New hand, "Another letter" / "Read a found letter"; your own letter
  is kept on this device (never in a link, `lib/drafts.ts`) and "Back to my letter" brings it back. A letter
  doesn't come back within ten hands.
- **Desktop: the writer on the letter.** The writer's name, in their own hand, sits on the sheet's top-left corner
  and opens About this hand (how they write, where they learned, the letter's source); the letter's name
  follows it. The panel starts with the ways to other letters and Share (top right), then New hand across its
  width. "Click the letter to write on it" isn't in the top line: after 9 s on the page without writing, a
  small pointer beside the sheet says it (on the label's line when there's no room), and once you've
  written it never comes back (`seedhand:wrote`). Phones keep the name in the control sheet.
- **Swatches are flat colours**: each paper its sheet's colour (the name under it tells near-whites apart),
  each ink its colour; the pen's own ink is split in two of its usual colours.
- **The sheet's label** (`components/SheetLabel.tsx`), like an artboard's name: one quiet line above the first
  sheet's top-left corner, in the app's type. Which letter it is ("Kamma Rahbek, 1813", the credit; the source
  is in About this hand) and how the hand writes ("A meticulous joined hand, upright"). On your first key it
  becomes yours ("Your reply to Kamma Rahbek", or "A letter from you"), a 200 ms cross-fade in place; going
  back to a found letter brings its name back. On the reply desk each sheet has its own. Where the sheet is too
  narrow for both (phones), only the name shows. A translated letter still credits its translator under the
  sheet.
- **Replying** (`components/TheirLetter.tsx`, `lib/found.ts`). The first key on a found letter starts your reply
  on a fresh sheet, and their letter stays on the desk in its own hand, pen, ink and paper (exactly as it was
  read; a link's `re=` carries its look, so it comes back the same). **Your letter never moves**: theirs comes
  to you and goes back, so the caret and anything being composed stay put.
  - *Desktop:* theirs slides off your sheet and is put down beside it, smaller and a little turned (tucked
    under its edge when the desk is narrow). On wide desks (about 1366 px and up) both are readable side by
    side, for answering line by line. Pick it up by clicking it, starting a scroll on it, ⌘[ or Tab + Enter: it
    comes forward at your writing size over your sheet, which waits behind, dimmed. Put it down by typing,
    clicking your sheet, ⌘], Esc or "Back to your letter". 300 ms on `--ease-drawer`, transform and opacity
    only; reduced motion swaps without travelling.
  - *Phones and tablets:* one letter at a time. "In reply to …" under your sheet (or "Their letter" in the pen
    tray while writing) pulls theirs down from the top, above the keyboard, which stays up. Typing, a tap on
    your letter, swiping it up or "Your letter" puts it away.
  - Their words are there for screen readers too (the handwriting is a picture).
- **Ink mode** (the default where the engine writes in ink, `lib/ink.ts`): what's written stays. Typed letters
  wait as faint thoughts and the pen writes them a few letters behind, at handwriting speed, so most slips
  are fixed before ink touches paper. Change something already written and the writer corrects it their own
  way (the engine's planner): strikes a word through and writes it again, writes a letter over another, adds
  a word above the line with a caret; the pen hovers while they consider. Undo lifts only wet ink (3 s).
  "Make a fair copy" writes the letter out cleanly on a fresh sheet; "Fresh sheet" starts over. The first key
  on an untouched sample letter takes a fresh sheet. The mode lives in the small menu under the sheet ("In ink ▾", `WritingMenu.tsx`):
  In ink, In pencil, Fair copy (edits cleanly); a pencil edits cleanly too until the engine has Pencil mode. The ink log travels in links as `k=`, and the worker
  replays it, so New hand keeps the letter, corrections and all, in the new hand.
- **The writer.** Their name in their own hand (similar hands share a family name), and one plain line
  about how they write. The name opens **About this hand**: how they write, where they learned, the letter's
  source, where the letter shapes come from (with links), and the seed.
- **New hand** (or **R** when not typing) rolls the whole look: a new writer (word seed, the most unlike
  of several candidates), Print or Joined, pen and tip, ink, paper, size, and a fresh offset on every
  slider, each inside a band that stays legible. **Keep my paper, pen and ink** (a switch under More) keeps
  those while everything else rolls (remembered per browser). The next two new hands (and a sibling) are
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
- **Controls** follow `docs/research/controls-and-feel.md`, in three levels so a first visit isn't a wall
  of sliders (`Panel.tsx`):
  - *Always there:* the writer's name (opens About this hand), **New hand**, "Another letter" while a found
    letter is on the page, and one **Share** icon. Under the sheet: the letter's credit and the writing menu
    (In ink / In pencil / Fair copy, Make a fair copy, Fresh sheet, Blank page, Sign it, Edit as plain text).
  - *The look,* one scrolling column, no tabs, in this order: **Paper** (a row of swatches, and under it the chosen paper's kinds as small chips: a pad in white A5,
    British blue, binsen or German A4; going on past one sheet the way that stationery does: a postcard's next
    card is numbered, a notecard says "over" and goes on to its plain back, a second aerogramme follows), **Pen** (each
    swatch is the word "ink" written with that pen; Fine / Medium / Bold beside it), **Ink**, **Handwriting**
    (Print or Joined, the school cards, Similar, and **Neat hands only**: on by default, the engine tidies a
    hand a little (slant, pen width, spacing, hurry, capitals) and New hand skips writers below its `NEAT_MIN`
    readability; switched off, the page shows the hand exactly as its seed wrote it (a cross-fade) and New
    hand picks from everyone. "Roll a neat one" appears when the hand on the page still isn't easy to read;
    `neat=0` in links when it's off), **How they write** (Neatness, Hurry, Size, each with plain
    words at its ends: Messy / Neat, Calm / Rushed, Small / Large).
  - *More* (folded): the other sliders (Pressure, Slant), an Occasion with an Amount, Keep my
    paper, pen and ink, Tip size (in mm), Ink flow, Ink variation, Paper tooth, Nib angle, Line spacing,
    Line rhythm, Baseline wobble, Margins, Letter spacing (print only), Word spacing, Letter height, Letter
    width, Tremor, Tiredness, Variety (how far New hand jumps), the seed, and "Back to X's natural hand".
  - **Every slider is seed-relative.** The thumb starts at this hand's natural value (the small dot on
    the track) and moving it adds an offset; double-click a slider to go back to the dot. Similar hand
    keeps your How and With-what offsets and clears the Who ones (slant, proportions, spacing).
- **Share** (one icon): Copy link (a URL that restores the exact note; the toast offers the share sheet
  where there is one), Download image (JPEG at 3x the screen, paper and writing exactly as shown; on phones
  it opens the share sheet, so Save Image puts it in Photos), Download video (the letter writing itself out:
  MP4, 4:5, the first lines, made in a few seconds by `src/export`, loaded when first used; progress and Stop in
  a toast; on phones a Save button opens the share sheet), and under More formats, Animated GIF and Font file
  (.otf from the engine's `buildFont`, opentype.js 1.3.4, loaded only when used). Formats the browser can't
  make are greyed out.
- **On phones** the controls live in a sheet that's always there, at three heights (`ControlSheet.tsx`):
  - *peek:* the writer's name (About this hand), New hand, Share, what's on the page ("A found letter" /
    "Another letter") and "Paper, pen & ink" to open it.
  - *half:* the look from the top (Paper, Pen, Ink). The letter shrinks to fit above the sheet, so every
    change shows.
  - *full:* the same column as the desktop panel, scrolling, More folded at the end. While a finger slides a control, the rest of the sheet fades away and
    the letter moves into the free space above or below that control.
  - Drag the top (or the content, below full height) to move between heights; a flick goes on to the next
    one. A tap on the letter folds the sheet down; a second tap writes. Writing hides the sheet behind the
    pen tray.
  - Sliders on touch move only on a sideways drag, from where they were. A finger landing on a track never
    changes it (scrolling past is safe), up/down goes to the sheet, and a double tap puts it back.
  - For a moment after the sheet moves, its controls ignore touches, so the tap that opened it can't land
    on whatever slid in under the finger.
- Occasions set the scene once when picked: Thank-you card on the notecard, Love letter on laid paper, Postcard
  on the postcard, Lecture notes on US loose-leaf, Shopping list on a legal pad page.

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

Seven papers people really write letters on (`docs/research/stationery.md`), each with variants. A paper id is the
family or family-variant (`notebook-fr`); links with the old ids (plain, college, seyes, feint, squared, dots)
open on their nearest new paper.

| Paper | Variants | Based on |
|---|---|---|
| Letter pad (default) | White A5 · British blue · Binsen · German A4 | A 90 g wove sheet torn off a glued pad, with the pad's lined guide sheet slipped under it. The British pad is 137 × 178 mm in azure; binsen is Japanese cream letter paper with 15 printed rules at 9.5 mm; the German A4 pad has DIN 5008 fold and punch marks |
| Laid paper | Cream · Blue-white · Handmade cotton | Post quarto laid letter paper: laid lines about 1 mm apart, chain lines 26 mm apart, deckled right and foot. Blue-white as 18th-century Dutch writing paper; handmade cotton rag with four deckles, flecks and a rough tooth |
| Airmail | Pale blue · White | B5 onionskin, about 30 g/m²: thin enough for the desk to show through, softly cockled, its lined template plain underneath. Smaller writing |
| Aerogramme | | The inside of an unfolded air letter (US size, three 90.5 mm panels): top and side flaps with gum, two creases, "first fold" and "second fold". Writing runs edge to edge, small |
| Notebook page | US spiral · US loose-leaf · Legal pad · UK exercise book · French cahier | Torn out: a spiral's ragged fringe, three binder holes, a canary legal pad torn along its perforation, a feint-ruled exercise book page or a Seyès cahier page torn at the staples |
| Postcard | A6 · 6 × 4 in | The message side: divided back, address lines, a stamp box. Coated card |
| Notecard | Correspondence card · Ippitsusen | A 6⅜ × 4¼ in ecru cotton card with a navy triple border; a Japanese short-note strip with a few rules and a printed sprig |

**The guide sheet** (pad, airmail) shows while you write and stays in the pad when the letter goes: the reader
view, the found letter and the downloaded JPEG show plain paper. **Edges** that aren't cut straight (deckles,
tears, the spiral fringe, the aerogramme's flaps) clip the sheet and cast their own shadow. **Overflow** per paper:
`sheets` (more sheets), `card` (another card), `back` (a notecard's plain back), `cramp` (an aerogramme squeezes,
then offers a second); see `sheetPaper()` in `lib/papers.ts`.

Sizes come from makers' and retailers' listings, DIN 5008, USPS and Wikipedia; colours and line weights are matched
by eye. Everything is painted by `lib/paper/paint.ts` from small textures made once (grain, formation, cockle)
and stretched, so a sheet paints in a few milliseconds; shared textures and outlines are made in idle time.
`papers.html` (dev only) shows every paper whole, as a swatch and up close: `/papers.html?view=sheets|swatches|close`.

## How it's put together

```
src/
  App.tsx                 layout: desk + sheets, side panel (desktop) or control sheet (phones), actions
  components/
    Writing.tsx           THE writing renderer on screen (see "Renderer boundary")
    SheetView.tsx         one sheet: paper canvas + writing
    PaperEditor.tsx       typing on the paper: hidden textarea, caret, selection, line-aware keys
    Panel.tsx             the controls (About this hand, Share, the look, More), shared by the side panel and the phone sheet
    ControlSheet.tsx      the phone's control sheet: peek / half / full, drag
    WritingMenu.tsx       the menu under the sheet: In ink / In pencil / Fair copy, and what to do with the sheet
    StylePicker.tsx       Print or Joined, then school cards with a sample in each school
    PenPicker.tsx         pen swatches (a word in each pen) and the tip
    Specimen.tsx          small handwriting samples, made in idle moments and kept
    PaperCanvas.tsx       paints a sheet (or a swatch crop) on a canvas
    Signature.tsx         the writer's name in their own hand
    DraftSlip.tsx         the plain-text editor
    ui/                   shadcn-style primitives (button, slider, segmented, tooltip, toast)
  lib/
    compose.ts            hand + text + paper + size -> sheets of positioned writing (mm <-> font units)
    papers.ts             paper specs, variants, old-id redirects, roll weights, overflow per paper
    paper/                the painter (paint.ts), edges and outlines (outline.ts), noise, spec types
    writing.ts            engine SVG at a fixed reference scale, id scoping, rasterising for the JPEG
    write-core.ts         request -> result (runs in the worker, and on the main thread for downloads)
    caret.ts              text index <-> position on the handwriting
    controls.ts           the control registry: ranges, zones (who / how / with), tiers, placeholders
    params.ts             natural hand + offsets + occasion -> engine overrides
    engine-features.ts    what the engine supports now; preview flag; placeholder params
    edits.ts              Edit events (the seed of the ink log)
    styles.ts             Print / Joined families and the school cards' names (from getStyle)
    samples.ts            the sample letters: pick by seed, pairing with styles, no repeats, credits
    drafts.ts             your own letters, kept on this device while you read found ones
    ink.ts                Ink mode: the session (planner + pen), the ink page as a Live, marks and thoughts
    pens.ts, inks.ts, occasions.ts
    state.ts              the note config and the share-link format
    hands.ts              word seeds, writer names, plain-word descriptions, "very different" new hands
    brand.ts              the product's name as people see it (code keeps Seedhand)
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
