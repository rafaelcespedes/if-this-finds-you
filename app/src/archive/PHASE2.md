# Later, maybe: letters written here

Not planned now (DECISIONS.md, 2 Nov 2026: no submissions; add them only if the project gets popular). This note
only records what the library already leaves room for, so adding them later is small.

- **The model has the room.** `ArchiveLetter.origin` is `'found' | 'written'`. A written letter would carry its
  text, `credit: { name?, anonymous }` (the writer's choice, made on every letter), a `license` (CC BY when
  credited, CC0 when anonymous), `createdAt`, and the `look` it was written in (seed, style, pen, tip, ink, paper,
  size, slider values; optionally the Ink-mode log, so its corrections replay). No images: the engine draws it.
- **The library already draws stored looks.** `lookFor()` uses `letter.look` as is, so a written letter's card
  and page come out exactly as the writer saw them.
- **If it happens:** a "Send to the library" action in the tool; a private queue approved in batches (daily or
  every couple of days, per DECISIONS.md), with automatic screening sorting the queue and a person deciding; the
  approved letters published as a static file the library loads beside the found ones, so browsing still needs no
  backend; a way for writers to withdraw a letter.
