# Seedhand spike: a seed becomes a handwriting font

A technical proof of concept with no machine learning. You type a seed such as `maple-river-42` and get one
consistent "writer". Every letter in the live preview is drawn fresh, so no two `e`s are identical. You can also
export an installable `.otf` that carries three samples of every letter and swaps between them as you type.

## How to open it

The page loads its scripts from this folder and opentype.js from cdnjs, so it needs an internet connection.

- **Easiest:** `python3 tools/serve.py` and open `http://127.0.0.1:8765/index.html`. The server sends no-cache
  headers, so edits show up on reload.
- **Or:** open `index.html` straight from Finder (file://). It uses no `fetch`, so this works in Chrome and Safari.
- **URL options:** `#seed=…&style=print|script` sets the hand and is shareable. `?size=120` renders the preview
  large for close-ups.
- Press **R**, or click **New hand**, to reroll.

## What it proves

| Claim | Status | How |
|---|---|---|
| 1. A seed gives one coherent hand across a–z, A–Z, 0–9 and punctuation | **Yes** | The seed feeds a seeded PRNG (xmur3 → sfc32), which sets about 25 writer parameters: slant, x-height, ascender and descender length, width, side bearings, word spacing, corner roundness, per-letter "quirk" distortion, tremor, baseline drift, pen width, nib angle, pressure contrast, tapers and dot placement. Every glyph runs through the same parameters, so the result reads as one person's writing. |
| 2. Every use of a letter is slightly different but clearly the same writer | **Yes** | Each instance gets a sub-seed (hand seed + character index). That seed drives a low-frequency warp, a small rotation, scale and shear, a one-arc bow per stroke, loose placement of secondary strokes (t-bars, i-dots, the second stroke of x), baseline wander and ink density. The per-letter quirk stays fixed for the hand, so the variation stays bounded. |
| 3. An installable font with bounded variation, generated in the browser | **Yes** | opentype.js 1.3.4 writes a CFF `.otf`: 243 glyphs, which is the 95 ASCII characters, the 21 GF Latin Kernel extras, and `.alt1`/`.alt2` for every letter, digit and the space. GSUB contains a **working `calt`** plus `salt`, `ss01` and `ss02`. I checked this by shaping with HarfBuzz; see the findings below. The **Font** preview mode loads the exported bytes back into the page through `FontFace`, so what you see there is the real font rendered by Chrome's shaper. |

## Pipeline (`hand.js`)

1. **Skeletons:** the stroke centerlines from the Hershey fonts. Print uses `futural.jhf` and script uses `scripts.jhf`.
2. **Zone remap:** lowercase letters are stretched piecewise (baseline → x-height → ascender, plus the descender),
   so each hand gets its own x-height ratio. Capitals and digits are scaled uniformly.
3. **Smoothing:** centripetal Catmull–Rom splines. Sharp corners (over 118°, or any corner on a crisp hand) split
   the stroke into separate pen segments with round joins. Medium corners get a fillet whose size depends on roundness.
4. **Variation:** a 2D gradient-noise warp gives the fixed per-letter quirk plus a per-instance offset. The
   per-instance affine is applied about the glyph centre. In **script**, the warp is pinned at each letter's entry
   and exit points, so the joins between letters still meet.
5. **Stroke life:** each stroke bows once along its length and gets a faint slow tremor. I tried high-frequency
   jitter first; it read as fake and shaky, so I removed it.
6. **Pen:** the outline is a ribbon whose width comes from one of two pen models:
   - **Print** uses a broad nib, so width depends on stroke direction relative to the nib angle.
   - **Script** uses a pointed pen, so downstrokes swell.

   Both also get tapers at stroke entry and exit, plus noise-driven pressure. Each stroke becomes one closed
   polygon with round caps. Union is by the nonzero fill rule, and all contours share one orientation.
7. **Live renderer only** (`app.js`): one SVG path per stroke with slightly varying ink opacity, so crossings and
   pen lifts darken like real ink. A faint `feTurbulence` displacement roughens the edges like ink on paper.

## Character set

- **Basic ASCII (95):** from Hershey, in both styles.
- **GF Latin Kernel extras (21), in `extras.js`:** ‘ ’ “ ” – — − … • · € £ ¥ ¢ © ® ™ ° × ÷ and the non-breaking
  space. Together with ASCII that is all 116 characters of GF Latin Kernel, and the exported font's cmap
  covers all 116 (checked with fontTools).
  - **Derived from each style's own glyphs:** smart quotes (Hershey's apostrophe is already a raised comma, and
    the opening quotes are that shape rotated 180°), dashes (a stretched hyphen, and the minus is the
    horizontal stroke of `+`), the ellipsis and middle dot (from the period), × and ÷ (from `+`), and
    © ® ™ (that style's own C, R, T and M, scaled down).
  - **Hand-authored in the same skeleton format:** € £ ¥ ¢ ° and the bullet, which is drawn as an inward spiral
    so it reads as a filled-in dot. These are drawn once and given an italic shear for script.
- **Unknown characters** (accented letters, emoji and so on) are never skipped. The live view shows a light gray
  pencil-style placeholder with a tooltip ("This hand hasn't learned ‹ç› yet"). The page logs each miss once to the
  console and counts misses in `Seedhand.missLog`. The count goes up on every re-render, so treat it as "seen",
  not as a usage count.
- **Accented letters (Tier 2) are not done.** Composing a base letter with a mark is straightforward in this
  pipeline, because marks are just extra strokes, but I left it out to keep the focus on live quality.

## opentype.js and calt: findings

1. **opentype.js 1.3.4 can write `calt`, just not through its public API.** `font.substitution` only offers
   `addSingle`, `addMultiple`, `addAlternate` and `addLigature` (lookup types 1–4). However, the GSUB *writer*
   (`subtableMakers` in `tables/gsub.js`) also serialises **lookup type 6, chaining context, formats 1 and 3**.
   Format 2 raises "not yet supported". Writing a raw `font.tables.gsub` object by hand is therefore enough. I
   checked 1.3.5 and 2.0.0: they add a type-5 writer, but there is still no high-level contextual API.
2. **The exported GSUB:**
   - lookup 0: single substitution, default → `.alt1`
   - lookup 1: single substitution, default → `.alt2`
   - lookup 2: chaining context, format 3 (the calt cycle)
   - lookup 3: alternate substitution (for salt)
   - features: `calt`→2, `salt`→3, `ss01`→0, `ss02`→1, under both the `DFLT` and `latn` scripts
3. **How the calt cycle works:** within a single lookup, the backtrack sees glyphs that the same lookup has
   already replaced. Each glyph therefore carries a "variant state" (0, 1 or 2). The next letter steps that state
   by +1 or +2, and which step it takes is a per-hand choice for each letter. The space has invisible
   alternates, so the state carries across words; those space alternates are also slightly different widths,
   which gives natural word-spacing variation.
   - **Guarantee:** neighbouring glyphs never share a variant, so `ll`, `ee` and `tt` always differ.
4. **Verified with HarfBuzz** (`uharfbuzz` 0.51.7) and **fontTools** 4.60.2, using `tools/check_font.py`. The font
   re-saves cleanly. Shaping `hello hello little mammoth` gives
   `h e.alt1 l.alt2 l o.alt1 space.alt2 … l i.alt1 t.alt2 t l.alt1 e.alt2 … m.alt2 a.alt1 m m.alt2 …`. With calt
   off it gives all defaults. With ss01 on it gives all `.alt1`.
5. **Verified in Chrome:** in Font mode the exported bytes are loaded as a webfont and the "Contextual
   alternates" toggle visibly changes the text. Chrome shapes with HarfBuzz.
6. **Limitations:**
   - Three samples per letter with a deterministic cycle cannot be truly random. The same word repeated
     back-to-back can come out identical, and roughly one word in three will, depending on the hand.
   - Punctuation such as `’` resets the cycle.
   - An exported font cannot reproduce the live view's per-use warp, baseline drift or ink density. It shows
     three samples, not infinite variation.
   - Apps without default `calt` show only the default glyphs; ss01 and ss02 still work as manual style sets.
   - Contours overlap (each stroke is its own contour). CoreText, DirectWrite, FreeType and browsers handle
     this fine, but a production build should remove overlaps (skia-pathops) and hint.
   - **Server-side alternative,** if richer rules are wanted (longer contexts, more samples, per-letter
     repeats): generate the glyphs the same way, then write a `.fea` file and compile it with
     `fontTools.feaLib`. I did not build this because export was deprioritised.

## What still looks fake (candid)

- **Skeleton monoculture.** Every hand is the same two Hershey designs: a geometric sans for print and a formal
  copperplate script. Seeds change proportions, slant, pen and rhythm, but never letter *construction*. Nobody
  gets a two-storey `a`, a looped `l`, an open `4` or a crossed `7`. More skeleton sources would be the biggest
  quality win, ideally several hand-drawn variants per letter that the seed chooses between.
- **Script digits and capitals are formal,** close to engraved copperplate, which looks less casual than the
  lowercase.
- **Print letters never join,** and script joins come from Hershey's own design. There is no logic for real
  ligatures or connecting strokes.
- **The pen model is a ribbon,** not a simulated nib or ballpoint. At extreme Pressure settings, very tight
  curves can pinch slightly.
- **Ink texture is a single SVG filter.** It suits a felt pen, but there is no ballpoint skip or dry-brush effect.
- **The exported font is clean and identical per sample.** It has no texture, and its variation is three samples,
  not infinite.

## Files

| File | What it does |
|---|---|
| `index.html` | The page: layout and styles |
| `app.js` | UI, live SVG renderer, font preview, export, URL hash |
| `hand.js` | The engine: PRNG, noise, hand parameters, skeleton → outline |
| `extras.js` | The 21 GF Latin Kernel extras (derived and hand-authored skeletons) |
| `hershey-data.js` | Generated by `tools/embed-hershey.mjs` from `data/*.jhf` |
| `fontbuild.js` | opentype.js font builder plus hand-written GSUB (calt, salt, ss01, ss02) |
| `tools/serve.py` | No-cache local server |
| `tools/node-export.mjs` | Builds the same font from Node: `node tools/node-export.mjs <seed> [print|script]` |
| `tools/check_font.py` | fontTools validation plus HarfBuzz shaping (needs `.venv`) |
| `out/` | Sample exports for `maple-river-42` |
| `.venv/` | Python venv (about 25 MB) with `uharfbuzz` and `fonttools`, created only for verification. Safe to delete. Recreate it with `python3 -m venv .venv && .venv/bin/pip install uharfbuzz fonttools`. |

## Data sources and licenses

- **Hershey fonts:** `data/futural.jhf`, `scripts.jhf`, `rowmans.jhf`, `cursive.jhf` and `scriptc.jhf`, fetched
  from <https://github.com/kamalmostafa/hershey-fonts> (`hershey-fonts/` directory). That repo's library code is
  GPLv2, but the glyph data has its own permissive terms, reproduced in `data/hershey-fonts.notes.txt`:
  - The data may be used for any purpose, commercial or otherwise.
  - The acknowledgements must be distributed with the data. The fonts were created by Dr. A. V. Hershey at
    the U.S. National Bureau of Standards, and the data format by James Hurt, Cognition, Inc.
  - The data may not be redistributed in the original NTIS format.

  Generated fonts carry this acknowledgement in their copyright and description name fields. Only `futural`
  and `scripts` are used; the others were downloaded for comparison.
- **opentype.js 1.3.4 (MIT):** loaded from
  `https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js`. `tools/node-export.mjs` fetches the
  same version from jsdelivr.
