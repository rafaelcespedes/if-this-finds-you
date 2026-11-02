# Dynamic Font: status and plan

_Last updated 2026-11-02_

## The idea
Each person gets a **seed**, and the seed is **a hand**: a writer. Reroll to meet a new writer, save the
seed to keep one. Every letter varies slightly each time it's written, as real handwriting does. The main
product is the **live tool on the website**. A downloadable font is optional and secondary (Rafael's
call, 2026-11-02).

## What's built
`spike/` holds a working prototype. To run it: `python3 spike/tools/serve.py`, then open
http://127.0.0.1:8765/index.html
- Seed → a consistent hand (print or script). Same seed, same hand.
- Live view: every letter is drawn fresh, with an ink texture and pointed-pen shading in script.
- 116 characters (Google Fonts "Latin Kernel"). Unknown characters show a pencil placeholder.
- An .otf export with 3 versions per letter that rotate. It works, but it's deprioritised.

## What the research settled
1. **No off-the-shelf AI.** Almost every handwriting dataset and model is licensed for research only.
   Build procedurally (letter skeletons + seeded writer + simulated pen) now. Train our own model later, on
   handwriting people contribute with consent.
2. **Source material:** public-domain copybooks (Palmer 1915, Spencerian, Bickham 1743) and the Hershey
   stroke fonts. Avoid OFL fonts as sources if we ever want to sell font files.
3. **Exported fonts can only rotate 3–6 versions of each letter**, and Word turns that off by default.
   Endless variation is only possible live, which is why the website is the product.
4. **Market gap:** a good handwriting without having to write anything yourself, reproducible from a seed,
   with clean licensing. B2B (robot-pen card companies, direct mail) pays the most: they currently pay
   $1,750–2,000 per custom style.
5. **Biggest quality gap in the prototype:** every hand uses the same letter *designs*. Seeds change
   proportions and pen, but never how a letter is built (one- vs two-storey a, looped l, crossed 7).
   The fix is several skeleton variants per letter.

Full research lives in the reference library: `references/`, built by a separate session.

## Roadmap for the live tool

**Phase 1: make the hands real**
- Several skeleton variants per letter, traced from copybooks and/or drawn by Rafael, with the seed
  choosing among them
- Stroke-by-stroke writing animation (the "it's a person" moment)
- Pen models: ballpoint (with skips), fountain/broad nib, pointed pen, felt marker, pencil (grain)
- Variation that's correlated within a word (slant and pressure drift together), plus fatigue over a
  paragraph
- Print hands that sometimes join, like real semi-cursive
- Accents (Tier 2 character set, built as base letter + mark)

**Phase 2: meet, keep, shape a hand**
- Word seeds plus a writer name (`ottilie-harbor-quill` → "Ottilie Marsh"), with the share link as the save
- A "desk" of 12 hands all writing your sentence, plus a trail of recent hands
- Keep or banish individual letter versions ("I love it, but the g is ugly")
- Mixing two hands into children (a family tree)
- Paper and layout: lined, grid, blank, or envelope; margins; a baseline that drifts across the page

**Phase 3: take it off the site**
- A web embed snippet (`<script>` that makes text on any site handwritten, live)
- Export as SVG, PNG or PDF, plus single-line SVG for pen plotters and robot pens
- A Figma plugin
- Optional "Breathing" .otf

**Phase 4: learned hands**
- A contribution flow (CC0, consented): people write a pangram on their phone or iPad
- Train our own model on that data, so hands go beyond what skeletons and parameters can express

## Open decisions (Rafael)
See the latest conversation. These are: who draws the skeletons, the name and voice, and fictional
writers vs real ancestors.
