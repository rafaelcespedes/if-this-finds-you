# Wordmark options

Options for the "If This Finds You" logo, numbered so Rafael can pick one ("#7"). Review page (private artifact):
https://claude.ai/artifact/VvWLGb2Sbayia3QvEiS2wG

- `options.mjs`: every option. #1–33 are hands from our engine (seed, style, pen, layout); #34–43 are open-licence
  Google Fonts references (OFL, Special Elite is Apache 2.0), the last three paired with a handwritten "you".
- `top.mjs`: the top 3 and why.
- `wordmark.mjs`: draws a phrase in one or more hands as a tightly cropped SVG, using only the public engine API.
- `build.mjs`: `node brand/wordmark/build.mjs` redraws `svg/`, `manifest.json` and the review page (`out/wm/review.html`).
- `svg/NN-slug.svg` real ink · `-mono.svg` one colour (currentColor) · `-icon.svg` square tab icon · `-you.svg` hybrids' "you".
- `manifest.json`: per option, the exact hand(s): seed, requested style, and the resolved style, pen, slant and neatness.

To make a font from an option: `buildFontPackage(withOverrides(makeHand(seed, { style }), { pen }), { name })`.

## The logo: #32 (chosen 2 Nov 2026)

Writer: seed `saffron-pebble-77`, style `spanish-1776` (Spanish 1776 copybook), the hand's own pen (fountain),
slant −10.2°, ink `#1c2233` on paper `#fffdf8`. Exact settings live in `production.mjs` (`STACKED`, `SMALL`, `ICON`).

| File (app/public/brand/) | What | Settings |
|---|---|---|
| `wordmark.svg` | Stacked "If this finds / you", one colour (`currentColor`) | Option #32 exactly: "you" at 1.7×, salt `you`, indent 1.6 em, leading 1.25 em |
| `wordmark-32.svg` | Same file as `wordmark.svg`, under its option number | |
| `wordmark-small.svg` | One line "If this finds you", one colour | Same writer, `penWidth` 88 (hand's own ≈ 70), "you" at 1.45×, gap 0.2 em |
| `favicon.svg` | "If" in ink on a paper rounded square | Same writer, salt `icon`, `penWidth` 125 (heavy, so it holds at 16 px) |
| `favicon.ico` | 32 and 16 px, transparent corners | Rasterized from `favicon.svg` |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | "If" on paper, square (the OS rounds it) | Glyph fills 72% of the side |
| `og-image.png` | 1200×630 share image | Stacked wordmark, "Real letters by ordinary people, written out by hand.", ifthisfindsyou.app, Instrument Sans |

### For comparison: #5

| File (app/public/brand/) | What | Settings |
|---|---|---|
| `wordmark-5.svg` | One line "If This Finds You", one colour (`currentColor`) | Option #5 exactly: seed `linen-thistle-82`, style `quebec-print`, the hand's own pen (felt), slant 6.5° |
| `favicon-5.svg` | "IF" in ink on a paper rounded square | Same writer, salt `icon` |
| `favicon-5.ico` | 32 and 16 px | Rasterized from `favicon-5.svg` |
| `apple-touch-icon-5.png`, `icon-5-192.png`, `icon-5-512.png` | "IF" on paper, square | Glyph fills 72% of the side, so maskable crops keep it |
| `og-image-5.png` | 1200×630 share image | Same layout as `og-image.png`, the one-line mark 900 px wide |

Rafael made #5 the default logo on 2 Nov 2026 (the app shows `wordmark-5.svg` and `favicon-5.svg`).

#5 is a single line in a heavy marker, so one file works at every size from about 24 px tall up.

**Which wordmark when (#32):** use `wordmark.svg` when the mark is at least **56 px tall**. Below that the first line's
lowercase gets smaller than about 7 px and turns to mush, so the header (28–36 px desktop, smaller on phones) uses
`wordmark-small.svg`.

The SVGs are outlines only: the engine's ink effects (edge roughening, ink pools, per-stroke opacity) are dropped,
transforms baked in, the viewBox starts at 0 0, and points are simplified to 0.3 units (0.03 em).

Regenerate: `node brand/wordmark/production.mjs && sh brand/wordmark/rasterize.sh` (needs Google Chrome and Pillow).
