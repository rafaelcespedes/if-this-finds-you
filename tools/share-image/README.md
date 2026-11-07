# The share picture

`app/public/brand/share-2.jpg` (1200 × 630, about 150 kB) is the picture every page's link preview shows (`og:image`
and `twitter:image` in `app/index.html`, `letters.html`, `fonts.html`, `about.html` and `404.html`, the page for unknown
addresses), and the one at the top of the repository's README.

It's nine real letters from the collection spread across a table, each on its own paper, in its own hand, worn and
stamped as the Reading Room shows it. Nothing is faked: `pile.ts` asks the site's own code for each sheet (the letter's
own hand from `archive/look.ts`, the paper painter in `lib/papers.ts`, the wear in `lib/paper/wear.ts`, the catalogue
number and postmark from `lib/paper/marks.ts`, the ink from the engine's `render-canvas.js`) and only lays the sheets
out. Rafael chose "A scattered fan" (`fan` in `compositions.ts`) on 4 Nov 2026, after a few hours of "A tight pile"
(`pile`, which was `share.jpg`; kept so links already shared keep their picture). "Close up" (`close`) is the third.

| Letter | Year | Paper | Where |
|---|---|---|---|
| `stewart-1914-home` (No. 0057) | 1914 | blue laid | on top, in the middle: "Dear, dear Friend, Can you guess how happy I am?" |
| `snetter-1834` | 1834 | laid | left of it, "Dear Mother:" |
| `avellaneda-1845` | 1845 | small blue pad | lower right, "Querido Cepeda" |
| `critica-1924-julia` (No. 0031) | 1924 | ruled notebook, red ink | right of the middle |
| `santa-1908-drum` (No. 0021) | 1908 | loose-leaf | left, its "Lafayette 1908" stamp at the bottom |
| `aibonito-1929` (No. 0124) | 1929 | airmail | top right, its datestamp |
| `goya-1786` (No. 0016) | 1786 | laid | far left, "Martin mio," |
| `sor-juana-1691` | 1691 | handmade cotton | the right edge |
| `macinghi-strozzi-1450` | 1450 | handmade cotton | the left edge |

## Remake it

Once: `cd app && npm install`, and `cd tools/smoke && npm ci` (the smoke test's Chrome).

```sh
node tools/share-image/render.mjs fan --publish      # → app/public/brand/share-2.jpg (the name is PUBLISHED in render.mjs)
node tools/share-image/render.mjs --crops            # every composition, with the crops link previews make, → out/
node tools/share-image/render.mjs pile fan close --compare   # side by side, to choose → out/compare.png
node tools/share-image/render.mjs --contact          # candidate letters side by side → out/contact.png
```

It starts the app's own Vite (`app/vite.config.ts`) with this folder as the root, opens `index.html` in Chrome,
paints at twice the size and steps down to 1200 × 630, then saves a JPEG (quality 0.86: about 100 kB, so WhatsApp and
the slower crawlers take it) and a PNG copy in `out/` (not committed). The same letters always give the same picture:
every hand, sheet and stamp is seeded by the letter's id. A change to the engine, the papers or the marks changes the
picture too; remake it when they do.

To look by hand, run `app/node_modules/.bin/vite tools/share-image --config app/vite.config.ts` from the repo root and open
`?c=pile` (or `fan`, `close`, `contact`).

**A new picture needs a new name.** X, Slack, iMessage and WhatsApp keep a link's picture for days, so publishing a
changed picture under the same name may not show for a while. For a real change, give it the next name (`share-3.jpg`:
`PUBLISHED` in `render.mjs`) and update the nine `og:image` / `twitter:image` lines and the README's picture.

## What the crops do

Most previews show the whole 1.91:1 card (X, Slack, Discord, LinkedIn, iMessage and WhatsApp's large card). WhatsApp's
small card and some others crop a centred square; X on a narrow screen trims a few pixels top and bottom. The top letter sits
in the middle third, so the square keeps it and the letters either side of it; the wordmark and the line on the right only show on the whole card,
where the page's title says the same.

## The writing page's card

`app/public/brand/share-write.jpg` (1200 × 630, about 30 kB) is `/write`'s own link preview (`og:image` and
`twitter:image` in `app/write.html`). It's one line on cream paper with the wordmark small at its foot: "Paper", Rafael's
pick of four on 7 Nov 2026 (Paper, Dark, Typed, Slip), after a look at 25 notes and writing apps' cards. The most
modern ones (Linear, Vercel, tldraw, Arc) show one thing on an empty field.

The line is real ink, written on `/write` by Matteo Carver with a medium tip: "The coffee here is terrible", a pause
for the pen to pass, eight Backspaces, then "wonderful." The pen's own SVG (its filters, pooled ink and the strike) is
kept as it was drawn, cropped to its ink, in `write-line.svg`.

```sh
node tools/share-image/write-card.mjs              # → out/write-card.png
node tools/share-image/write-card.mjs --publish    # → app/public/brand/share-write.jpg
```

A centred square crop (WhatsApp's small card) keeps the middle of the line: "coffee here is". The same rule as above
applies: a changed picture gets a new name.
