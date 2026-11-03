# Concept C, "Postmarked" (`?look=postmarked`)

"Every letter is something in transit that finally found you." A look to compare with today's design; the
default never changes. Open any page with `?look=postmarked` (kept for the tab; `?look=default` goes back).

## What it changes
- **Tool:** a found letter's sheet wears a postmark (its town and year, "found 2026" on the lower arc) and, where
  the provenance says so, a red INTERCEPTED or UNDELIVERED cancellation. "Find another" is a round red stamp: pressing
  it lands a postmark on it (with the next letter's town and year) and the next letter arrives at once. Beside it:
  "4 of 127 in the bag". A shared link arrives in its envelope first.
- **All letters:** a wall of envelopes, each addressed "To: …" as the letter really was and postmarked, the letter
  itself standing out of the top (it rises a little under the pointer).
- **A letter:** the title, then the envelope it came in (from, to, postmark, cancellation); the provenance as the
  letter's route (written → intercepted / how it survived → first printed → today: it found you); the dock with
  "4 of 127 in the bag", Write back (the airmail edge) and the Find another stamp. Opening a letter (a link, or from
  the wall) plays the envelope arrival once; turning to the next letter doesn't.

## Decisions made (Rafael asleep, "feel free to make any decisions")
- **Type:** IBM Plex Sans for the interface, IBM Plex Mono for addresses, postmarks, stamps, counts and group
  names (SIL OFL 1.1, @fontsource, self-hosted; only fetched in this look). Piazzolla stays the reading face; the
  letter stays the only handwriting.
- **Palette:** envelope `#F1EBDC` desk, `#FAF6EC` envelopes, postmark ink `#2F2C28` text, airmail blue `#2A4A8A`
  for buttons, focus and chosen controls, airmail red `#C2362B` only for the stamp, cancellations and "Today".
  All text pairs meet WCAG AA (numbers in postmarked.css).
- **One device plus the postmark:** the airmail edge appears only on Write back (and the reader's "Write your own")
  and on the arriving envelope. The wall's envelopes stay plain, or thirty striped borders would be kitsch.
- **Every word is the curator's:** addresses are the first clause of `recipient`; routes use `place`, `year`,
  `story`, `rights.firstPublished`, `source`. A letter with no place says "Place unknown"; a letter's own words
  are never shortened into an invented address.
- **Invented marks only:** no real office, country, stamp or postal brand. The stamp's perforated ring is ours.
- **Envelope arrival:** about 0.65 s, any tap or key skips it (that key does nothing else), absent under reduced
  motion; the writing starts underneath and never waits for it.
- **Not done:** the Fonts page (not on this branch yet); the grid view (`?view=grid`) keeps sheets in this palette.

## Where it hooks in (each one line, behind `LOOK === 'postmarked'`)
App.tsx (sheet postmark, shared-link envelope), Panel.tsx and ControlSheet.tsx (the stamp), archive/Canvas.tsx
(envelope cards), archive/LetterParts.tsx (title, route, dock), archive/LetterPage.tsx (arrival).
