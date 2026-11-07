# Fonts: every hand as an open-source font

Every hand on the site can be downloaded as a font that installs on a computer and works in everyday apps. There is
also a curated pack of named writers for the open-source release. This page covers what's in a font, the licence and
why, how the builder works, and its limits.

> **Not legal advice.** Rafael isn't a lawyer, and neither is whoever wrote this. The licence notes below are a
> careful reading of the licences' own texts. Before a commercial launch, or if anyone objects, ask a lawyer.

## What you get

| | |
|---|---|
| **Formats** | `.otf` (CFF outlines) and `.ttf` (TrueType outlines) in every download. The pack also has `.woff2` for the web. |
| **Characters** | GF Latin Core, all 319, in every tradition: accents, ß ẞ æ œ ø ł đ ħ ð þ ı ȷ, the Romanian ș ț, the Welsh ẁ ẃ ẅ ỳ, quotes, dashes and € £ ¥ © ™. Combining accents too. |
| **The hand** | Its tradition, letter forms (allographs), mixed schooling (blend), style dimensions and pen, drawn by the engine's own `makeGlyph`. Overlapping strokes are merged into clean outlines. |
| **Versions per letter** | 4 for joined hands, 5 for print hands. They are cycled as you type, so two neighbours never match and a repeated word rarely comes out the same twice. |
| **Joined hands** | Each lowercase letter comes in the forms the engine writes it in: joined on both sides (the default), at a word start (lead-in), at a word end (end flick), alone, and beside this writer's own pen lifts. Contextual alternates pick the form from the neighbours, so joins meet. |
| **Spacing** | The engine's own spacing, plus kerning measured from the ink: for print hands everywhere, for joined hands only where nothing joins (punctuation, digits, capitals in a row). |
| **Line height** | Ascender and descender cover every glyph's ink, so descenders and accents never clip. Lines come out at 1.2–1.5 em, a little looser than a book face. |
| **Names** | Family "IfThisFindsYou Yara Rowe", style "Regular". The name table carries the version, the seed, a description, ifthisfindsyou.app, the licence and the credits. fsType 0: installable, embeddable, editable. |

**The honest note** ships in every README: the website writes every letter fresh, but a font file can only hold a few
versions of each letter, so it cycles 4 or 5 of them (PRINCIPLES.md §7).

### What's in a download

`IfThisFindsYou-Yara-Rowe.zip`, a folder with:

- `IfThisFindsYou-Yara-Rowe-Regular.otf` and `.ttf`: either one installs; the `.otf` suits most apps.
- `README.txt`: how to install (Mac, Windows, Linux), how to turn on contextual alternates in Word, and the honest note.
- `LICENSE.txt`: the SIL Open Font License 1.1 with the copyright line.
- `CREDITS.txt`: every source this hand's letters came from, grouped by licence, with links, plus the Hershey notice.

Sizes: the zip is 400 KB to 1.2 MB. The `.otf` is 300–850 KB: 1,500–4,000 glyph slots, made of short line segments.
About half the slots are cheap references to another slot's drawing (see "the cycle" below).

## The licence: SIL Open Font License 1.1

**Recommendation: release the fonts under the SIL Open Font License 1.1 (OFL), with no Reserved Font Name.**

- **It's the norm for open fonts.** Google Fonts, Adobe's open-source families and most libre foundries use it. People
  and apps already know what it allows.
- **It allows everything Rafael wants:** use for anything, commercial work included, embedding in documents, apps and
  websites, changing the font, and sharing it, original or changed.
- **It keeps the fonts open.** Copies and changed versions must stay under the OFL, keep the copyright notice and the
  licence, and can't be sold on their own (bundled with other work is fine). Documents made with the fonts are not affected.
- **No Reserved Font Name.** With one, anyone who changes a font must rename it. The fonts are generated, and people
  will remix them, so the simplest choice is to reserve nothing. The name "If This Finds You" is not licensed by the OFL
  anyway (§4 of the OFL: the authors' names can't be used to promote changed versions).

The copyright line is `Copyright 2026 The If This Finds You Project Authors (https://ifthisfindsyou.app)`. That's the
same wording Google Fonts uses, and it leaves room for contributors.

### Does the OFL fit every source?

The fonts are generated from four kinds of material (the full list is in the reference library, and each font's
CREDITS.txt lists its own).

| Source | Its terms | Fits the OFL? | What we do |
|---|---|---|---|
| **Public-domain copybooks**: Arrighi (1522), Strick (1618), Palomares (1776), Brandt (1849), Spencer (1866), Prószyński (1906), Palmer (1915), Sütterlin (1917) | Public domain (some scans carry the Public Domain Mark) | Yes. No restrictions | Credited anyway, in CREDITS.txt and the name table |
| **The Hershey fonts** (Dr. A. V. Hershey, U.S. National Bureau of Standards, 1967; format by James Hurt) | Free for any purpose, provided (1) the acknowledgement travels with the data and (2) nobody redistributes it in the original U.S. NTIS format | Yes. The OFL also requires the notices to travel with the font | The Hershey acknowledgement is in every font's copyright and licence name records and in CREDITS.txt. The fonts are outlines, not the NTIS format |
| **Present-day handwriting under CC BY 4.0**: Copiste d'un jour (BAnQ, Québec, 2024) and CREMMA-Wikipedia (France, 2022–23), traced into the `quebec-print` and `adult-fr-2023` traditions | Share and adapt for any purpose, with attribution: the creator, a licence link, and a note that it was changed. No extra restrictions on the licensed material itself | Yes, as far as we can tell. CC BY 4.0 lets an adapter license its adaptation under its own terms (§3(a)(4)) as long as attribution is kept and the original material stays free to use under CC BY. The OFL keeps attribution intact and doesn't restrict the original scans | When a font uses these letters, its name table (ID 13) names the projects with their licence link and says the shapes were traced and redrawn. CREDITS.txt gives each page's credit and link, the licence, the change note, the no-endorsement line and the as-is disclaimer |
| **Letters drawn by the project** ("Seedhand allographs", accents, hand-authored symbols) | Ours | Yes | Released with the font under the OFL |

The one wrinkle is the Hershey "not in the NTIS format" condition. The OFL doesn't forbid any format, so in theory
someone could convert an OFL font into the 1970s NTIS format. It's practically meaningless: nobody uses that format,
and our outlines aren't the Hershey centre-line data anymore. It's still worth knowing.

**Alternatives we didn't pick**

- *CC0 / public domain:* can't carry the CC BY and Hershey attribution duties.
- *MIT or Apache 2.0:* fine legally, but they're software licences, they allow selling the font alone, and font users
  rarely expect them.
- *CC BY 4.0:* not written for fonts. Embedding and changed versions are unclear in apps.

**Still to check before a public release:** whether the code gets a licence of its own (MIT is the usual pair with OFL
fonts); a lawyer's read of the CC BY reasoning above if the project ever turns commercial (DECISIONS.md "Open" already
lists a share-alike check); and that the reference library still matches the sources the fonts credit.

## How the builder works (engine/fontbuild.js)

```js
import { buildFontPackage, buildFont } from './engine/index.js';
const pkg = await buildFontPackage(p, { name: 'Yara Rowe', clipper: ClipperLib }); // { zip, filename, files, info }
const { otf, ttf, info } = buildFont(null, p, { name: 'Yara Rowe', clipper: ClipperLib }); // just the files
```

Options: `alts` (versions per letter), `clipper` (the `clipper-lib` 6.4.2 module: merges overlaps; without it the
strokes overlap, which every renderer fills correctly), `ttf: false`, `kern: false`, `calt: false`,
`woff2: async (ttf) => bytes` (adds a .woff2 to the zip, e.g. `wawoff2.compress`), `chars`. Output is deterministic:
the same hand and options give byte-identical files and zip.

1. **Plan.** For every character, the forms this writer uses:
   - Joined hands: lowercase letters get a left state (joined, word start, lift) × a right state (joined, word end,
     lift). The writer's pen lifts are read from the engine pair by pair (`skeleton(...).variant.lift`). Letters with a
     context habit that depends on the letter before (a second s in "ss", an r after o) get a habit form.
   - Capitals: joined or open on the right, plus a form for ALL CAPS.
   - Print hands only keep a form where the letter's construction changes (a word-final s), because elsewhere the
     context only reseeds jitter that the versions already carry.
   - Identical forms share glyphs. Accented and special letters reuse their word-start and word-end forms at lifts.
2. **Draw.** `makeGlyph(p, ch, inst, ctx)` for every form and version: `inst` is one use of the letter (the writer's
   own per-use variation; print letters also get a little baseline bounce), and `ctx` holds the representative
   neighbours. For writers who lift, each context is checked against the engine's lift decision and retried with other
   neighbours, so a "joined" glyph really is joined. Combining accents get zero width and sit over the letter before.
3. **Outline.** Each stroke's pen outline is simplified (0.35 units), merged with the others (Clipper, nonzero),
   simplified again (0.75 units) and rounded. Outer contours run counter-clockwise for CFF and clockwise for TrueType.
4. **Layout tables**, written directly (every subtable sits behind an Extension lookup, so big fonts never overflow):
   - `calt`: (1) context habits; (2) capitals between capitals; (3) the left side of each lowercase letter: after a
     letter it stays joined, after a letter this writer lifts after it takes its lift form, otherwise its word-start
     form (this is also how the start of a line is handled); (4) the right side: joined if the next letter is joined
     on its left, lift if the next one lifted, otherwise word end; (5) the cycle.
   - **The cycle** is a class-based chaining rule. Every letter form, digit, punctuation mark and space has N slots;
     a glyph's "state" is its slot, and each character steps it by its own amount, coprime with N, so a letter never
     meets itself in the same version. A form with fewer drawn versions (an accented letter, a rare form, a comma)
     fills its spare slots with references to its own drawings (slot k shows version k mod n): CFF subroutines in the
     `.otf`, one-component composites in the `.ttf`. That keeps the state intact through every glyph, so a word can't
     lock into one look. The space has real versions (blank, slightly different widths), so word gaps vary too. Each
     writer's steps are chosen from 160 candidates to keep common words (English, French, Spanish, German, Dutch,
     Polish) from repeating exactly. In tests, `the the the …` comes out the same as the word before 0 times in 29.
   - `salt`, `aalt` and `ss01`–`ss04` reach the other versions by hand. `kern` is pair positioning by class (above).
     GDEF marks the combining accents, and the contextual lookups skip them.
5. **Write.** OTF and TTF from the same glyphs: `head hhea maxp OS/2 hmtx cmap name post GSUB GPOS GDEF` plus `CFF ` or
   `glyf loca gasp`. OS/2 v4: weight 400, fsType 0, USE_TYPO_METRICS on, typo = hhea metrics = the ink extremes, win
   metrics at least that, Unicode ranges and code pages from the cmap. `post.italicAngle` and the caret slope follow
   the hand's slant.
6. **Package.** README, LICENSE and CREDITS are generated from the build (writer, tradition, sources actually used),
   then zipped (deflate via `CompressionStream` where available, fixed dates).

### Speed (requirement: about 2 s or less in the browser)

| Where | Typical hand | Slowest seen |
|---|---|---|
| Headless Chrome (`tools/fonts/try.html?bench=15`, 15 random hands, on a Mac with load average 450) | 0.76 s median | 1.18 s (p90 1.14 s) |
| Node, pack build (includes WOFF2 compression) | 1.3–2.5 s | about 4.5 s on the same loaded Mac |

Most of the time goes into the engine drawing each letter (makeGlyph); merging overlaps is about a quarter.
Writers who lift a lot cost more: more forms, and each lift context is checked with the engine. Run it in a worker.

### WOFF2

The pack writes `.woff2` from the `.ttf` with `wawoff2` (Google's woff2 encoder compiled to WebAssembly, MIT).
The in-browser download leaves it out by default: desktop installs don't use it, and the encoder is about 1 MB of
WebAssembly. Pass `woff2` to `buildFontPackage` to include it.

## The curated pack (tools/fonts/)

```sh
cd tools/fonts && npm install && node build-pack.mjs   # writes tools/fonts/out/ (gitignored); nothing is published
```

- **Who's in it:** 75 writers. Each of the 3 print traditions has 5, spanning neat to messy (the neatness quantiles
  4%, 30%, 55%, 80% and 97% of 60 candidate seeds). Each of the 10 joined traditions has 6: those 5 neatness levels plus
  one writer who lifts the pen often. Kurrent and the Dutch running hand are included, since the pack is explicit about
  them. Names come from the app's `writerName(seed)`, so a pack writer is the same person on the site. No name repeats.
- **Per font:** `fonts/<Family>/` has the `.otf`, `.ttf` and `.woff2`, README, LICENSE, CREDITS, and
  `specimen.png` / `specimen.pdf` (name, a letter, calt on and off, all 319 characters, facts and credits). The
  specimens are rendered by headless Chrome, so they show real shaping. `zips/` holds the same zip the app offers, plus
  the `.woff2`.
- **Overview:** `index.html`, `overview.png` and `overview.pdf` (every writer's line in their own hand), plus
  `manifest.json` and a pack `README.md` and `LICENSE.txt`.
- **Checking:** `tools/fonts/check_fonts.py` (fontTools, OTS, metrics, HarfBuzz shaping). Every pack font must pass:
  ```sh
  python3 -m venv .venv && .venv/bin/pip install fonttools uharfbuzz opentype-sanitizer brotli
  .venv/bin/python tools/fonts/check_fonts.py tools/fonts/out/fonts/*/*.otf tools/fonts/out/fonts/*/*.ttf
  ```
  It checks that every table decompiles and re-saves; cmap = GF Latin Core 319/319; no glyph outside the line box;
  fsType 0; the name table has the licence, the Hershey notice and the URLs; calt is present; OTS (the sanitizer Chrome
  and Firefox run) accepts the file; HarfBuzz shaping has no .notdef, doubled letters never repeat a glyph, calt off
  gives no versions, and how often `the the the …` repeats a word.
- **In a browser:** `cd tools/fonts && npm install` once (the page needs `clipper-lib`), then from the top folder
  `python3 tools/serve.py 8765` and open `/tools/fonts/try.html`. It builds any hand the way the
  app does, shows it with calt on and off, and has a download button. `?bench=20` times 20 random hands.

## Tested in real apps (2 November 2026)

| Where | Result |
|---|---|
| **TextEdit** (macOS, CoreText) | Three pack fonts installed for the user (a print hand, a Palmer joined hand, a Sütterlin hand that lifts often). All render; repeated words show different versions and joins connect, so contextual alternates are on by default. |
| **Keynote** (Pages isn't installed on this Mac; both use Apple's text engine) | Same: renders, cycles ("the the" differ). |
| **Chrome** (`try.html`, specimens, overview) | Built in the page and loaded with `FontFace`: calt on cycles, calt off shows one version. The 75 specimens are Chrome screenshots. |
| **HarfBuzz** (`check_fonts.py`) | All 75 pack fonts, OTF and TTF: no errors. Doubled letters never repeat a glyph; `the the the …` repeats a word 0 times in 29. |
| **fontTools + OTS** | Every table decompiles and re-saves; OTS (the browsers' sanitizer) accepts every OTF, TTF and WOFF2. |
| **The lab** (`lab/index.html`, Font view) | Its old `buildFont(opentype, …)` call still works: 975 glyphs, calt and kern, "re-parsed OK". |

Not tested: Word, Windows, Linux, Adobe apps.

### The pack as built

75 writers: 15 print (Hershey print, Québec 2024, French 2023) and 60 joined, across all 13 traditions, neatness 0.28
to 0.93. OTF 312–898 KB (median 630 KB), 1,555–4,043 glyph slots. Totals: OTF 45 MB, TTF 52 MB, WOFF2 24 MB, zips
87 MB; with specimens the `out/` folder is about 260 MB. Building takes about 5 minutes on a quiet Mac (much longer
on a busy one); specimens take about 1.5 minutes through one headless Chrome.

## Limits (say them plainly)

- **A few versions, not infinite.** 4 or 5 per letter, cycled. The site's per-word lean, size, baseline drift, ink
  density and paper are not in the font.
- **Contextual alternates must be on** for the cycle, the word forms and the lifts. Pages, TextEdit, Keynote, browsers,
  Figma, Affinity and InDesign turn them on by default; Word needs Format › Font › Advanced › "Use Contextual
  Alternates". Without them, every letter shows its default version and joined hands show their joined form
  everywhere: joined, with an entry stroke at word starts and an exit at word ends.
- **Pen lifts are a habit per pair.** On the site a pair may lift one time and join the next; in the font the same
  pair always does the same thing. Accented letters beside a lift use their word-start and word-end forms.
- **Context reaches one letter each way.** Habits that depend on more, like the shared bar of "tt", are left out.
- **No hinting.** It's fine at screen sizes on Mac and in browsers. On Windows at very small sizes it can look soft
  (the `gasp` table asks for smoothing).
- **Word gaps follow the engine.** A few writers who lift the pen very often write with very tight word gaps on the
  site, and the font keeps them (Noor Thorne in the pack). Worth a look in the engine.
- **Faithful, including the engine's quirks.** The font draws what the engine draws: crowded Spencerian joins, a hand
  that sprawls, and, at the extreme of the pen-lift range, ascenders whose retraced tops come apart. That last one is
  an engine issue, reported as a follow-up, and the pack avoids that range.
