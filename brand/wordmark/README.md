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
