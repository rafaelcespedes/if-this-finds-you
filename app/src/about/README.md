# About (about.html, served at /about)

What If This Finds You is, where the letters and the hands come from, the fonts, how it was made, credits and contact.

- `AboutApp.tsx`: the page and all of its copy, kept short (about 580 words to read); the full credits sit folded in a
  "Full credits and licences" disclosure at the foot, since the licences ask for them. The letters' counts are in
  `LETTERS` at the top: copy them from `node content/check-texts.mjs` whenever letters are switched on or off, and
  change the "Counted on" date in the credits.
- `LiveLine.tsx` + `write.ts`: the one live line ("I hope this finds you well."), written by a writer picked fresh on
  each visit. `write.ts` and the engine load only after the page has painted, so the text never waits for them; if
  the engine can't load, the line shows in type.
- `about.css`: both looks. Today's look (`?look=classic`) uses the letter face and Atkinson capitals; the Reading Room
  (the default) swaps in its book face, small capitals and archival red at the bottom of the file. Nothing in
  `themes/` was touched.

## The header

The site's one header (`components/SiteHeader.tsx`), with About as the fourth and last place (`lib/places.ts`,
docs/NAVIGATION.md). The page renders `<SiteHeader current="about" />`; where the four places don't fit (phones), the
header's Menu takes them. The 404 page's hand-made copy of the header lists About too.

## The words

Rafael's own text (4 November 2026, ifthisfindsyou-about.md), set word for word; only the quotes and apostrophes are
the site's curly ones. The full credits stay folded at the foot, since the licences ask for them.

Numbers in the text to keep true when letters are switched on or off (count them from content/sample-texts.json:
enabled letters whose source URL is on that host):
- Give back: the Internet Archive's letters (and its four copybooks: Arrighi, Palomares, Spencer, Palmer), Project
  Gutenberg's letters, Wikisource's six letters, Project Runeberg's two.
- The hands: eight copybooks, thirteen traditions (engine/sources/*.js), 1522, 1917 and 1967.
- The stats block reads `LETTERS` at the top of AboutApp.tsx.
