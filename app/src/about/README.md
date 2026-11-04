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

## Lines waiting for Rafael

Trimmed on 3 November 2026 (Rafael: "way too long"; about 580 words to read, from about 1,700, credits folded away).
The earlier "The hope is to bring letters, people and handwriting traditions…" line was cut.

1. "Designed by Rafael Cespedes and built with Claude." (How it started)
2. "It's a free lab experiment with nothing to sell. He wanted to use AI in ways he finds clever. Drawing hundreds of
   handwriting fonts, for one, used to take too many resources to try."
3. "The fonts are open source now, and the code will follow once it's polished."
4. "Every source the project used, 484 so far, is listed with what it decided in a reference library, to be published
   with the code." (Full credits, folded)
5. "Spotted a mistake in a letter or its story? Rafael would like to know." (Contact)
6. Give back: the intro, the five sources and the Red Cross, each with one short line, and "Each link opens the
   organisation's own donation page. We get nothing from it." Links checked on each organisation's own site on
   3 November 2026; the Library of Congress was left out because its site's bot check blocked verification.
7. "It started as a search for a font. Rafael Cespedes, a designer, was looking for a handwritten face for Rueca,
   another project of his. He couldn't find the hand he had in mind, so he tried making one. It grew from there, a
   happy accident that got a little out of hand." (Rueca isn't linked: no public address in the repo.)
8. "Each visit opens on a writer and a letter picked at random." (What this is; true since 237360d.)
