# The writing interaction

Typing that behaves like ink. You edit like a computer user, and the writer corrects like a person: a word you
take back is crossed out, a wrong letter is written over, an afterthought goes above the line with a caret. Nothing
already written ever moves, and nothing is erased.

![A sheet of ruled paper with a short handwritten letter: one word crossed out with a new one written above it, one underlined, one scribbled out](writing/the-writing-page.png)

Everything that makes it work is in this repository, under the MIT License. If you're a design engineer and want to
take it further, or take it somewhere else, this page is the way in.

## Try it

On the site: open [ifthisfindsyou.app](https://ifthisfindsyou.app), click the letter and start typing.

On your computer (you need [Node.js](https://nodejs.org) 24):

```bash
cd app && npm install && npm run dev
```

Then open `http://127.0.0.1:5173/write`, a minimal writing page with nothing but a sheet and a pen. The home page,
`http://127.0.0.1:5173/`, has the same writing on the letter desk.

## What it does

| You | The writer |
|---|---|
| Type | Writes it out by hand, a few letters behind you. No two letters come out the same. |
| Backspace before the pen gets there | It's gone, cleanly. You changed your mind before the ink touched the paper. |
| Backspace once it's ink | The pen hovers for a moment, then crosses the word out, or writes the right letter over the wrong one. |
| Backspace again on a crossed-out word, or hold it down | Crosses it out harder: a heavier line, then a scribble, then inked out (`/write`). |
| Select and delete | Strikes it through, in this writer's own way (a line, two lines, a wave, loops or a scribble). |
| Select and type | Strikes the old words and writes the new ones above them. |
| Type in the middle of a line | Adds it above the line, with a caret. |
| Space inside a word, Enter in the middle | A `/` between the words, a `//` for a new paragraph. |
| ⌘B, ⌘U | Goes over the words again; underlines them by hand (twice for a double underline). |
| ⌘Z | Lifts the ink only while it's wet, about three seconds. Dry ink stays. |

Crossing a word out again, one press at a time:

![The word "terribly" four times: struck through once, struck again more heavily, scribbled over, and inked out](writing/crossing-out-again.png)

## How it works

1. **Input stays native.** A transparent textarea sits over the paper (`app/src/components/PaperEditor.tsx`), so the
   browser keeps doing what it does well: input methods, autocorrect, dictation, selection, screen readers. Each change
   is read as a diff of the old and new text, an `Edit { at, del, ins, kind }` (`app/src/lib/edits.ts`,
   `app/src/hooks/useEditInput.ts`). The edit is your intent, not what the page does.
2. **A planner decides what this writer would do.** `plan()` in `engine/sheet.js` turns an edit into events on paper:
   strike, write over, insert above, a split mark, a fresh sheet. It keeps a small *view* of what's in flight: text
   typed but not yet written (the tail), an insertion being typed (mid), and a deletion the pen is hovering over
   (pending).
3. **The pen is slower than your fingers, and that's the grace.** `penStep()` releases text at handwriting speed:
   about two characters a second, up to four times faster when it's far behind, holding back the last two characters
   until you pause for 700 ms. Whatever it hasn't reached can still be deleted cleanly. This lag is the "timer".
4. **The source of truth is an append-only ink log.** `engine/inklog.js`: `write`, `break`, `strike`, `over`,
   `insert`, `mark`, `underline`, `pen`, `move`, `sheet`. What the letter says is derived from the log, never stored.
   A whole letter fits in a share link.
5. **Corrections are drawn from the writer's habits.** `engine/marks.js` draws every mark from one writer's
   temperament (`fixHabits`): how tidy they are, how they strike a word, how they scribble (tight zig-zags, angry
   blackouts, loopy coils), how hard they press. Each mark is placed once, on the letters it covers.
6. **Crossing out again.** `again()` in `engine/sheet.js` finds the struck run at the caret and adds one more pass, a
   level harder: a heavier strike, then the writer's own scribble with the word still showing through, then inked
   out. Held down, `/write` climbs one level every 700 ms, about as long as the hand takes to draw one.
7. **Drawing.** `app/src/components/LiveSheets.tsx` patches the page word by word as the log grows, and
   `engine/animate.js` (`createPen`, `paintPen`) draws the strokes in writing order. Letters the pen hasn't reached
   show as faint graphite "thoughts".
8. **Deterministic.** The same log gives the same page, byte for byte, live or replayed. Every mark is seeded by its
   event's place in the log, so each one is different and the page never changes after the fact.
   `tools/qa/ink.mjs` checks it, with random editing sessions and a check that nothing already on paper moves.

## Where things are

| File | What it does |
|---|---|
| `engine/sheet.js` | The planner (`plan`), the pen (`penStep`), crossing out again (`again`), replay, undo of wet ink (`dropLast`) |
| `engine/inklog.js` | The ink log: events, the text it reads as, the compact form and share links |
| `engine/marks.js` | Strikes, scribbles, overwrites, carets and underlines, from each writer's habits |
| `engine/animate.js` | The pen that draws the strokes in order |
| `app/src/lib/ink.ts` | `InkSession`: the bridge between the page and the engine |
| `app/src/components/PaperEditor.tsx` | The textarea over the paper, the caret, selection and keys |
| `app/src/components/LiveSheets.tsx` | The live page, patched word by word |
| `app/src/write/` | The minimal writing page: held-key timing, the pile of earlier sheets |
| `tools/qa/ink.mjs`, `tools/qa/again.mjs` | The checks |

The thinking behind it, with prior art and the studies it draws on:
[docs/research/writing-experience.md](research/writing-experience.md) (the interaction model and the ink log),
[human-feel.md](research/human-feel.md), [editor-ux.md](research/editor-ux.md) and
[input-quirks.md](research/input-quirks.md) (what browsers and phones do to typing).

## The numbers to play with

| What | Where | Now |
|---|---|---|
| Pen speed | `penStep` in `engine/sheet.js` | About 2 characters a second, up to 4× when far behind |
| Letters held back while you type | `penStep` (`forgiving`) | The last 2, until 700 ms without a key |
| The pen hovering over a deletion | `penStep` (`pending`) | Until the next word starts, or 1.2 s |
| How long ink stays wet | `InkSession` in `app/src/lib/ink.ts` | 3 s |
| A held key crossing out again | `AGAIN_EVERY` in `app/src/write/WriteApp.tsx` | One level every 700 ms, four levels |
| The drawn pen's pace | `createPen` in `LiveSheets.tsx` | Speed 1.5, faster when behind |

## Take a stab at it

Some things we know aren't right yet, and ideas we haven't built:

- **One clock, not two.** The engine releases letters at its pace and the drawn pen draws at its own, so they drift.
  Ink can trickle in after you stop, and a word can become ink a moment before it looks like ink. The pen on screen
  should be the clock.
- **Phones.** iPhone keyboards don't report a held key, so holding Backspace has to be read from how fast deletions
  arrive. Autocorrect replaces whole words after the pen has written them.
- **Pauses leave a mark.** Stop mid-sentence and the nib rests on the paper; a dot of ink spreads while you think.
- **The hand keeps your tempo.** Type fast and the writing gets hasty; slow down and it gets careful.
- **Undo the way paper does it.** Undo on dry ink could write *stet* ("let it stand") beside a crossed-out word and
  bring it back, the way editors have for centuries.
- **Running out of room.** The last lines squeeze, then "over" and a new sheet; on a postcard, up the margin.
- **Moving text** with a loop and an arrow instead of cut and paste.
- **Pencil.** Erasing that leaves ghosts.

If you make something with it, I'd love to see it: open an issue or a pull request, or find me on X,
[@rafcespedes](https://x.com/rafcespedes). For anything big, open an issue first so we can talk before you spend the
time ([CONTRIBUTING.md](../CONTRIBUTING.md)).

A few things the engine holds to:

- **Nothing already written moves.** Corrections go on top, above or beside, never in place of.
- **The same log gives the same page.** A change to what the engine draws has to keep replays identical.
- **Real hands are allowed to be ugly.** Bugs get fixed, never taste ([PRINCIPLES.md](PRINCIPLES.md)).

Designed by Rafael Cespedes, built with Claude. The code is under the MIT License: fork it, take it into your own
editor, change everything.
