# X post template

A template for a post video for X (Twitter): typing that behaves like ink. A sheet of paper sits above a minimal
keyboard, and the keys press themselves. Every keystroke goes through the same Ink mode as
[If This Finds You](https://ifthisfindsyou.app), so the handwriting is the real engine's, drawn stroke by stroke as
the pen reaches each letter.

What the default video shows, in order:
- a typo the pen hasn't reached yet, deleted cleanly
- a beat later, the same Backspace crossing the word out
- Delete held on it: crossed out harder, then inked out
- select and retype, with the new word written above the old one
- a word added above the line with a caret
- ⌘U to underline by hand, and ⌘B to go over a word again
- undo lifting the ink while it's wet, a letter written over another, and undo refused once the ink is dry

How the writing works is explained in [docs/WRITING.md](../docs/WRITING.md).

The video is made with [Remotion](https://www.remotion.dev), which renders React to video frame by frame.

## What you need

- Node 20 or newer.
- A clone of the whole repository. The template builds from the handwriting engine in `../engine` and the site's
  own code in `../app/src`, through the same `@engine` and `@` aliases the site uses. You don't need to install the
  site itself.

## Make the video

```bash
cd x-post-template
npm install
```

| Command | What it does |
|---|---|
| `npm run studio` | Opens Remotion's Studio in your browser, to scrub through the video and try settings. |
| `npm run draft` | Renders a quick half-size draft (540 × 540) to `out/draft-540.mp4`. Use it while you iterate. |
| `npm run render` | Renders the full video: 1080 × 1080, 30 fps, H.264, to `out/x-post-1080.mp4`. |
| `npm run still` | Renders one frame to `out/still.png`. |
| `npm run session` | Records the typing again after you change the script or the settings (see below). |

If npm asks you to approve esbuild's install script, it's fine to say no: its binary comes as a package of its own.

## Change what's typed

The keystrokes live in `scripts/ink-session.ts`, in the section between `beat('start')` and `const END`. It reads
like a script:

```ts
beat('clean');                // a hint for the bar: one of the CAPTIONS in src/InkDemo.tsx
type('The gardne', 9);        // type these keys, about 9 a second, with a person's uneven rhythm
press('Backspace', 0.12);     // one key, then a pause (seconds)
wait(1.9);                    // let the pen catch up
click('before:miss');         // put the cursor before a word ('at:word' on a crossed-out word, 'end' for the end)
select('so', 'green');        // drag across words, from the first to the last
holdDelete(3);                // hold Delete on a crossed-out word: three passes, harder each time
press('Meta+u');              // ⌘U underlines the selection; 'Meta+b' goes over it again; 'Meta+z' is undo
```

Keys are single characters, plus `Enter`, `Backspace` and `Meta+z`, `Meta+u` and `Meta+b`. Capital letters press
Shift for you. Typing while a selection is held replaces it: the old words are struck and the new ones written above.

After any change, run `npm run session`. It runs every keystroke through the engine (`plan`, `penStep`, `apply`,
`dropLast` and `again` in `../engine/sheet.js`, the same calls the site makes) and writes
`src/data/ink-session.json`, which the video replays. Then open the Studio or render.

Corrections are the writer's own. Whether a slip gets a letter written over it or the whole word struck is a roll
seeded by the letter's salt, so the same keystrokes always give the same page. To see another outcome, try another
salt:

```bash
INK_SALT=b npm run session
```

The hints under the writing are in `CAPTIONS` in `src/InkDemo.tsx`, keyed by the names you give `beat()`. To turn
them off, set `captions` to false in the Studio's props or in `src/Root.tsx`.

## Change the writer, the paper, the shape

All in `src/setup.ts`:
- `HAND`: the writer. A `seed` (any word: the site's look like `soft-thistle-38`) and a `style`, the school of
  handwriting (`print`, `script`, `palmer`, `spencerian`, `arrighi`, `quebec-print` and more), with the `pen`, `tip`
  and `ink`. `params` fine-tune the hand; leave it `{}` for the seed's own hand. You can browse hands, with their
  seeds, at [ifthisfindsyou.app/fonts](https://ifthisfindsyou.app/fonts).
- `PAPER`: one of the site's papers (`pad`, `laid`, `notebook`, `postcard`, `airmail` and more, in
  `../app/src/lib/papers.ts`). `MEASURE` is how much of the paper's line length the writing uses.
- `PEN_SPEED`: letters a second. The site's pen writes 2 and catches up when it falls behind; the template uses 4.5
  so the video doesn't drag.

Run `npm run session` after changing any of these.

The video's size is in `src/Root.tsx`: 1080 × 1080 (square, for X). 1080 × 1350 (4:5) and 1920 × 1080 (16:9) work
too. The keyboard sits at the bottom, as far from the edge as from the sides, and the writing fills the space above.
To try a size without editing anything: `npx remotion still src/index.ts InkDemo out/still.png --width=1080
--height=1350`.

The keyboard shows only the keys the letter uses. Its rows are in `keyboard()` in `src/InkDemo.tsx`.

## Files

| File | What it is |
|---|---|
| `src/InkDemo.tsx` | The video: the paper, the replayed ink, the keyboard with its ghost fingertips, the pointer, and the bar with the hint and the wet-ink timer. |
| `src/setup.ts` | The writer, the paper, the salt and the pen's pace. |
| `src/draw.ts` | Drawing the ink with the engine's own canvas renderer, plus the easing curves. |
| `src/Root.tsx`, `src/index.ts` | The composition (its size, frame rate and length). |
| `src/data/ink-session.json` | The recorded session the video replays. Written by `npm run session`. |
| `scripts/ink-session.ts` | The keystroke script, and the recorder that runs it through the engine. |
| `scripts/node-ts.mjs` | Bundles a TypeScript script with the engine (esbuild) and runs it. |
| `public/fonts/` | Schibsted Grotesk for the hint and timer, with its licence (SIL Open Font License, `OFL-SchibstedGrotesk.txt`). |

## Licences

- **Remotion** has its own licence: free for individuals, companies of up to 3 employees, non-profits, and for
  evaluating it. Bigger companies need a company licence. Read [remotion.dev/license](https://www.remotion.dev/license)
  before you use it at work.
- **This template's code** is MIT, like the rest of this repository ([LICENSE](../LICENSE)). The handwriting
  engine it draws with is the If This Finds You engine (`../engine`), MIT too. Some of the letter shapes it traces
  come from sources with their own credits; see [LICENSES.md](../LICENSES.md).
- **Schibsted Grotesk** (in `public/fonts`) is under the SIL Open Font License; its licence file sits next to it.
