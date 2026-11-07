# X post template

A template for a post video for X (Twitter): typing that behaves like ink. A sheet of paper sits above a minimal
keyboard, and the keys press themselves (or, in the version with hands, two ghost hands type them). Every keystroke goes through the same Ink mode as
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
| `npm run hands` | Records the ghost hands' motion for the typing (run it after `npm run session`). |
| `npm run draft:hands`, `npm run render:hands` | The same draft and full video with the ghost hands typing (`InkDemoHands`). |
| `npm run recorder` | Builds the typing recorder, a page you type a real take in, to `out/Typing recorder.html` (see below). |
| `npm run take -- "<take>.zip"` | Turns a take from the recorder into the video's data, `src/data/take-session.json`. |

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

The keyboard shows only the keys the letter uses. Its rows are in `keyboard()` in `src/keyboard.ts`.

## The version with ghost hands

`InkDemoHands` is the same video with two hands of frosted glass typing it: each keystroke pressed by the finger
that would press it, the hand following its fingers, the keys showing through the glass. The hands are a real hand
model (the WebXR generic hands, 25 joints each) posed frame by frame, so the anatomy holds up close.

- `npm run hands` records their motion to `src/data/hand-pose.json`: for every key in the session, which finger
  presses it (`FINGER` in `src/hands/home.ts`), the fingertip's path to it and back (`src/hands/plan.ts`), and each
  joint's angle along the way. Run it again whenever you record a new session.
- The keyboard is smaller in this version (`HAND_KEYS` in `src/keyboard.ts`, three quarters of the plain one's), so
  the backs of the hands fit in the frame. Hands are drawn to scale against it: a key pitch is 19 mm.
- The glass (how much it bends and frosts what's under it, its milkiness, its rim and shine) is `GHOST` in
  `src/hands/ghost.ts`. To judge the hands' shape and motion without the glass, set `handLook` to `clay` in the
  Studio's props. The `HandLab` composition shows one still of the hands at rest or pressing a key.

## Record your own typing

Instead of a script, you can type the letter yourself and record it: your keys, the pointer and your webcam on one
clock, while a phone films your hands from above.

1. `npm run recorder` builds `out/Typing recorder.html` and its guide, `out/Recording guide.html` (how to set up the
   phone, the light and the take). The recorder opens straight from the disk in Google Chrome; it needs no server.
2. Type your letter in it. It writes in ink as you type, with the video's own engine, pen and paper
   (`src/setup.ts`), so what you see there is what the video replays. ⌫, held ⌫, ⌘B, ⌘U, ⌘Z, clicks and drags all
   work as on the site. Press Finish and the take saves itself to Downloads as `Typing take <date> at <time>.zip`:
   what you did, every key down and up, the pointer over the sheet, sync beeps, and the webcam with its sound.
3. `npm run take -- "<take>.zip"` replays the writing on the video's clock, checks it comes out exactly as the
   recorder showed it, and writes `src/data/take-session.json` (and the webcam video to `public/take/`). Both stay
   out of git: a take is yours.

4. Track the hands in the phone's video: `.venv-track/bin/python scripts/track-hands.py "<phone video>" --turn 180
   --preview out/track-preview.mp4` (`--turn` stands the video the right way up: the keyboard at the top, your
   hands coming in from the bottom). It finds the recorder's beeps in the video's sound to line it up with the take,
   and writes `src/data/hand-track.json`: each hand's 21 points in every frame (Google's MediaPipe hand landmarker),
   plus a preview with the tracked hands drawn on. Once, before the first time:
   `python3.12 -m venv .venv-track && .venv-track/bin/pip install mediapipe opencv-python-headless numpy`, and the
   model from `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`
   saved as `.venv-track/models/hand_landmarker.task`.

5. Map the video onto the keyboard and find which finger pressed each key: pick the centres of the letter and number
   keys on a clean frame of the turned video (no hands over them) into `src/data/take-keyboard.json` (key code →
   pixel), then `.venv-track/bin/python scripts/hands-3d.py`. It fits the MacBook's layout (`src/macbook.ts`) to them
   (to about a pixel), works out the phone's lens and where it was, and writes `src/data/hand-3d.json`.
6. `npm run take:pose` turns that into the ghost hands' motion: each hand where his is, turned his way, each fingertip
   where his fingertip is, and each key pressed by the finger that pressed it, where he hit it. It writes
   `public/take/pose.json` and a copy of the take's writing; copy the phone's video, turned upright, to
   `public/take/hands.mp4`.
   Then take the room's hiss out of its sound: `.venv-track/bin/python scripts/take-denoise.py public/take/hands.mp4`.
7. `npm run draft:take` renders the video (`TakeHands`): your face, the move down to your hands, then your hands
   shrinking to the side while the ghost hands write the letter on your keyboard. The cut points are at the top of
   `src/TakeHands.tsx`.

The recorder and the scripted session share one clock (`src/ink-run.ts`): a keystroke at the same moment gives the
same ink in both. The phone's video of your hands is what the ghost hands will follow; its sound carries the
recorder's beeps and your key clicks, which line it up with the take.

## Files

| File | What it is |
|---|---|
| `src/InkDemo.tsx` | The video: the paper, the replayed ink, the keyboard with its ghost fingertips (or hands), the pointer, and the bar with the hint and the wet-ink timer. |
| `src/keyboard.ts` | The keyboard's layout (and its canvas drawing, for the version with hands). |
| `src/hands/` | The ghost hands: the model's skeleton and pose solver (`rig.ts`), its smoothed skin (`mesh.ts`), where the hands rest and which finger takes which key (`home.ts`), the typing motion (`plan.ts`), and the glass and its shadow (`ghost.ts`, `shadow.ts`, `view.ts`). |
| `src/HandLab.tsx` | One still of the hands, to judge them on their own. |
| `src/TakeHands.tsx` | The video of a recorded take: face, hands, then the ghost hands copying them over the letter. |
| `src/macbook.ts`, `src/macbook-draw.ts` | The 16-inch MacBook Pro's keyboard and trackpad in millimetres, and their drawing. |
| `src/ink-view.ts` | The writing of any session on the paper at a moment (InkDemo's drawing, for takes). |
| `scripts/hands-3d.py`, `scripts/take-pose.ts` | A take's tracked hands onto the keyboard, then onto the ghost hands. |
| `src/data/hand-pose.json` | The hands' recorded motion. Written by `npm run hands`. |
| `scripts/hand-session.ts` | The recorder for the hands' motion. |
| `public/hands/` | The hand models, with their licence (MIT). |
| `src/setup.ts` | The writer, the paper, the salt and the pen's pace. |
| `src/draw.ts` | Drawing the ink with the engine's own canvas renderer, plus the easing curves. |
| `src/Root.tsx`, `src/index.ts` | The composition (its size, frame rate and length). |
| `src/data/ink-session.json` | The recorded session the video replays. Written by `npm run session`. |
| `scripts/ink-session.ts` | The keystroke script, run through the engine. |
| `src/ink-run.ts` | Typing that behaves like ink, on the video's clock: the engine calls every 10 ms, and the recording the video replays. Shared by the script, the recorder and the take. |
| `recorder/` | The typing recorder (`main.ts`, `index.html`), its guide (`guide.html`) and the zip it saves (`zip.ts`). Built by `scripts/build-recorder.mjs`. |
| `scripts/take.ts` | Turns a recorded take into the video's data. |
| `scripts/track-hands.py` | Tracks the hands in the phone's video of a take, and lines it up with the take by its beeps. |
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
- **The hand models** (in `public/hands`) are the generic hands of the
  [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles), MIT (© 2019 Amazon); their licence
  file sits next to them. The version with hands also uses [three.js](https://threejs.org) (MIT).
