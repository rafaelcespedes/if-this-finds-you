# About (about.html, served at /about)

What If This Finds You is, where the letters and the hands come from, the fonts, how it was made, credits and contact.

- `AboutApp.tsx`: the page and all of its copy. The letters' counts are in `LETTERS` at the top: copy them from
  `node content/check-texts.mjs` whenever letters are switched on or off, and change the "Counted on" date.
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

1. "Designed by Rafael Cespedes and built with Claude, an AI model made by Anthropic." (How it was made)
2. "Rafael wanted to use AI in ways he finds clever, on things that used to take too many resources to try. Nobody
   would draw hundreds of handwriting fonts by hand, trace copybooks letter by letter, or check the rights of two
   hundred letters on two continents for a side project. With AI, one designer could."
3. "It's free, and it isn't a business."
4. "The hope is to bring letters, people and handwriting traditions that rarely get the spotlight into it, and maybe to
   give other designers an idea or two."
5. "The fonts are open source now; the rest of the project, code and all, will follow once it's polished."
6. "Every source the project used, 484 so far, … is listed … in a reference library, to be published with the code."
7. "If you spot a mistake in a letter or its story, he'd like to know." (Contact)
