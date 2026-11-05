# Licences

This project is made of several kinds of material, and each keeps its own terms. This page says which licence covers
which part, and what each one asks of you. It's a careful reading of the licences' own texts, not legal advice.

## At a glance

| What | Where | Licence |
|---|---|---|
| The code: the site, the engine, the tools and the lab | `app/`, `engine/`, `tools/`, `lab/`, `brand/`, and everything else the project made that isn't listed below | MIT ([LICENSE](LICENSE)) |
| The fonts the site makes from each hand | built by `engine/fontbuild.js`; each download carries its own `LICENSE.txt` | SIL Open Font License 1.1, no Reserved Font Name |
| The letters' texts | `content/sample-texts.json` | Public domain, except two transcriptions (below) |
| Letter forms traced from copybooks printed 1522–1917 | `engine/sources/`, `tools/trace/` | The copybooks are in the public domain; the tracings are MIT |
| Letter forms traced from present-day volunteers | `engine/sources/quebec-print.js`, `engine/sources/adult-fr-2023.js` and their files in `tools/trace/` | Adapted from material under CC BY 4.0: keep the credits (below) |
| The Hershey fonts data | `engine/sources/data/`, `engine/sources/hershey-data.js` | The Hershey distribution's own terms (below) |
| Typefaces the site sets its own words in | npm packages from Fontsource, and `app/src/themes/reading-room/fonts/` | SIL Open Font License 1.1, with the licence text beside the files or in each package |
| The X post template | `x-post-template/` | MIT, like the code; it runs on [Remotion](https://www.remotion.dev), whose own licence is free for individuals and companies of up to three people (larger companies need a company licence) |
| Code packages the site is built with | `app/package.json`, `tools/*/package.json` | Their own licences: MIT, ISC, Apache-2.0, BSD, Boost (`clipper-lib`) and MPL-2.0 (`lightningcss`, a build tool) |

## The code: MIT

Use it, change it and share it, for anything, as long as the copyright notice and the licence travel with it.
The full text is in [LICENSE](LICENSE).

## The fonts: SIL Open Font License 1.1

Every hand on the site downloads as a font under the [SIL Open Font License 1.1](https://openfontlicense.org), with
the copyright line `Copyright 2026 The If This Finds You Project Authors (https://ifthisfindsyou.app)` and no Reserved
Font Name. You can use the fonts for anything, commercial work included, embed them, change them and share them.
Copies and changed versions stay under the OFL and can't be sold on their own. Documents made with the fonts are
yours. Each download's `CREDITS.txt` lists the sources that hand's letters came from. Why this licence, and how it
fits every source: [docs/FONTS.md](docs/FONTS.md).

## The letters

Every letter switched on in the collection is in the public domain in both the US and the EU. The rules, and the
reasoning for each letter, are in [content/SAMPLE-TEXTS.md](content/SAMPLE-TEXTS.md) and in each letter's `rights`
field. The titles, notes and stories the project wrote about the letters are under MIT, like the code.

Two letters were first made public recently, under open licences, and keep them:

- **`peter-1744`**, *To his sister at the convent*: transcribed by The National Archives (UK) in *Secrets of the Prize
  Papers: Trade, Loot and Letters*, On the Record podcast, episode 1, show notes and transcript (2024). Crown
  copyright, under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
  Contains public sector information licensed under the Open Government Licence v3.0.
- **`pochet-1706`**, *Please forward my letter quickly*: from Ahrendt and van der Linden, *French History* (2026),
  [doi:10.1093/fh/crag034](https://doi.org/10.1093/fh/crag034), note 20, under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original is in the Brienne Collection, Sound &
  Vision, Hilversum.

## Handwriting traced from present-day volunteers: CC BY 4.0

Two traditions were traced from the handwriting of volunteers who copied out texts for handwriting-recognition
research. Their letters were cut out, traced as single-line skeletons and redrawn; their texts are not used.

- **Print 2024** (`quebec-print`, also the hand the logo is written in): *Copiste d'un jour*, Bibliothèque et
  Archives nationales du Québec (2024), [github.com/banq-dcn/Copiste-d-un-jour](https://github.com/banq-dcn/Copiste-d-un-jour),
  under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Everyday French 2023** (`adult-fr-2023`): *CREMMA-Wikipedia* (HTR-United), volunteers' handwritten copies of
  Wikipedia excerpts, 2022–23, [github.com/HTR-United/cremma-wikipedia](https://github.com/HTR-United/cremma-wikipedia),
  under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: letters cropped from the page images, traced as centrelines, straightened and redrawn by hand where needed.
The review sheets in `tools/trace/review/` show each crop beside its tracing. The page each letter came from is listed
in `tools/trace/sources/copiste-2024.md` and `tools/trace/sources/cremma-wikipedia.md`. Neither project endorses this
one. The material is offered as-is.

If you reuse these letter forms, keep this credit with them.

## The Hershey fonts

The print and script hands, and the punctuation and symbols of every hand, start from the Hershey fonts. Their
distribution may be used by anyone for any purpose, provided that the following acknowledgements travel with the font
data, and that the data is not converted into the format distributed by the U.S. NTIS:

- The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S. National Bureau of
  Standards.
- The format of the Font data in this distribution was originally created by James Hurt, Cognition, Inc., 900
  Technology Park Drive, Billerica, MA 01821.

The full notice is in [engine/sources/data/hershey-fonts.notes.txt](engine/sources/data/hershey-fonts.notes.txt).

## The name and the logo

The files are under MIT like the rest. If you make your own version, please give it its own name, so nobody mistakes
it for this one.
