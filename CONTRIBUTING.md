# Contributing

Thank you for looking. If This Finds You is a lab experiment by one person, so replies can take a while.

## Something's broken

Open an issue. Say what you did, what you expected and what happened instead, with your browser and device. If it
happened on a letter or a hand, paste the link from *Share*: it brings back the same letter, hand and settings.

## A mistake in a letter or its story

Open an issue with the letter's link and, if you can, the page of the source that shows the mistake. Each letter's
page names its source and links to it. The letters' texts are kept as their sources print them, old spellings
included, so a correction needs the source to back it.

## New letters

The collection doesn't take new letters for now. Every letter has to pass the rights rules in
[content/SAMPLE-TEXTS.md](content/SAMPLE-TEXTS.md), and the collection keeps its own balance of writers.

## Changes to the code

For a small fix, a pull request is welcome. For anything bigger, open an issue first, so we can talk before you spend
the time. A few things to know:

- **Real hands are allowed to be ugly.** Overlap, cramping and sprawl are part of handwriting, so the engine fixes only
  bugs, never taste. Read [docs/PRINCIPLES.md](docs/PRINCIPLES.md) before changing how a hand writes.
- **Words follow [docs/VOICE.md](docs/VOICE.md)**: plain, warm and exact, and the words are real while the hand is not.
- **Every pull request runs the checks**: the site is built and opened in a browser, the letters are checked, and the
  engine's output is compared with the version before. To run the first two yourself, from the project's top folder:

  ```bash
  node content/check-texts.mjs
  ```

  ```bash
  cd app && npm install && npm run build
  ```

  A change to what the engine draws fails the engine check until its baseline is updated.
  [docs/CHECKS.md](docs/CHECKS.md) explains how.

By sending a change, you agree that it's offered under the licence of the part it changes (see
[LICENSES.md](LICENSES.md)).

## Be kind

These are real people's letters. Treat them, and each other, with care.
