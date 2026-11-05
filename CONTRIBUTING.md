# Contributing

Thank you for looking. Contributions of every size are welcome: a fix, an experiment, a screen recording of something
that felt wrong, a better sentence in the docs. If This Finds You is a lab experiment by one person, so replies can take
a while, but everything gets read.

## Where to start

- **Try the writing** on [ifthisfindsyou.app/write](https://ifthisfindsyou.app/write) (a work in progress) or on any
  letter on the [home page](https://ifthisfindsyou.app). If it does something a person with a pen wouldn't, tell us:
  [the writing doesn't feel right](https://github.com/rafaelcespedes/if-this-finds-you/issues/new?template=writing-feel.yml).
- **Take a stab at an open problem.** [docs/WRITING.md](docs/WRITING.md#take-a-stab-at-it) lists what isn't right yet
  in the writing, and ideas nobody has built. Issues marked
  [good first issue](https://github.com/rafaelcespedes/if-this-finds-you/labels/good%20first%20issue) and
  [help wanted](https://github.com/rafaelcespedes/if-this-finds-you/labels/help%20wanted) are ready to pick up.
- **Show what you made** in [Show and tell](https://github.com/rafaelcespedes/if-this-finds-you/discussions/categories/show-and-tell),
  even if it's a fork that goes somewhere else entirely. A video helps.
- **Ask anything** in [Q&A](https://github.com/rafaelcespedes/if-this-finds-you/discussions/categories/q-a).

## Ways to help

| Area | What's there | Start with |
|---|---|---|
| The writing | Typing that behaves like ink: the planner, the pen, corrections, the ink log | [docs/WRITING.md](docs/WRITING.md) |
| The handwriting engine | Hands, traditions, variation, pens and ink | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PRINCIPLES.md](docs/PRINCIPLES.md) |
| The fonts | Any hand as an `.otf` or `.ttf`, built in the browser | [docs/FONTS.md](docs/FONTS.md) |
| The site | Accessibility, phones, speed, the pages themselves | `app/`, [docs/NAVIGATION.md](docs/NAVIGATION.md) |
| The letters | Corrections to a letter or its story (no new letters for now) | [content/SAMPLE-TEXTS.md](content/SAMPLE-TEXTS.md) |
| The docs | Anything that confused you: that's a bug too | Any `.md` file |

## Set up

You need [Node.js](https://nodejs.org) 24. From the project's top folder:

```bash
cd app && npm install && npm run dev
```

Then open `http://127.0.0.1:5173` (the letter desk) or `http://127.0.0.1:5173/write` (the writing page). The engine's
own test bench needs Python 3: `python3 tools/serve.py 8765`, then open `http://127.0.0.1:8765/lab/index.html`.

## Something's broken

[Open an issue](https://github.com/rafaelcespedes/if-this-finds-you/issues/new/choose). Say what you did, what you
expected and what happened instead, with your browser and device. If it happened on a letter or a hand, paste the link
from *Share*: it brings back the same letter, hand and settings.

A security problem? Please report it privately instead: see [SECURITY.md](SECURITY.md).

## A mistake in a letter or its story

Open an issue with the letter's link and, if you can, the page of the source that shows the mistake. Each letter's
page names its source and links to it. The letters' texts are kept as their sources print them, old spellings
included, so a correction needs the source to back it.

## New letters

The collection doesn't take new letters for now. Every letter has to pass the rights rules in
[content/SAMPLE-TEXTS.md](content/SAMPLE-TEXTS.md), and the collection keeps its own balance of writers.

## Changes to the code

For a small fix, a pull request is welcome. For anything bigger, open an issue or an
[idea](https://github.com/rafaelcespedes/if-this-finds-you/issues/new?template=idea.yml) first, so we can talk before
you spend the time. A few things to know:

- **Show it.** For anything you can see or feel, add a screenshot or a short recording, before and after. For the
  writing, a recording says more than words.
- **Real hands are allowed to be ugly.** Overlap, cramping and sprawl are part of handwriting, so the engine fixes only
  bugs, never taste. Read [docs/PRINCIPLES.md](docs/PRINCIPLES.md) before changing how a hand writes.
- **Nothing already written moves, and the same ink log gives the same page.** Writing changes keep both
  (`node tools/qa/ink.mjs` checks them).
- **Words follow [docs/VOICE.md](docs/VOICE.md)**: plain, warm and exact, and the words are real while the hand is not.
- **Every pull request runs the checks**: the site is built and opened in a browser, the letters are checked, and the
  engine's output is compared with the version before. To run them yourself, from the project's top folder:

  ```bash
  node content/check-texts.mjs
  ```

  ```bash
  cd app && npm install && npm run build
  ```

  ```bash
  node tools/qa/regress.mjs --quick
  ```

  A change to what the engine draws fails the engine check until its baseline is updated.
  [docs/CHECKS.md](docs/CHECKS.md) explains how.

By sending a change, you agree that it's offered under the licence of the part it changes (see
[LICENSES.md](LICENSES.md)).

## Be kind

These are real people's letters. Treat them, and each other, with care. The
[code of conduct](CODE_OF_CONDUCT.md) says what that means here.
