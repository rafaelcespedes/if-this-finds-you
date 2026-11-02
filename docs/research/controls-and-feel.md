# Controls and feel: how practitioners fake handwriting, and what the product should expose

_2026-11-02. This is the practitioner side of the research. Motor control, forensics, ink physics and line
statistics live in [`human-feel.md`](human-feel.md). The font survey and its twelve preset hands live in
[`fonts-study.md`](fonts-study.md). This doc links to both instead of repeating them. "est." marks a starting
value to tune by eye._

## 0. Diagnosis

| Rafael's hunch | What the engine does today | What practitioners do |
|---|---|---|
| "Maybe it's the colour" | One flat fill (`--ink: #1c2233` in the lab) for every stroke | Every brush engine varies colour per stroke and per stamp, and real ink shades along the stroke |
| "Pressure densities don't feel right" | Pressure changes **width only**. Stroke opacity stays at 0.85–0.99 (`autoStrokeOpacity`), so overlaps barely darken and no stroke starts light or ends dark | On ballpoint and pencil, pressure reads as **darkness**. Width is the fountain-pen and brush story |
| "Line heights feel too neat" | Every line advances by exactly 1.6 em, the left margin is exactly 0, and lines have no slope of their own | Robot-pen companies name a varying left margin and a bending line as what sells the effect |
| (texture) | One `feTurbulence` roughening for every pen | Each pen has its own texture: pencil grain, ballpoint striations, fountain halo, felt bleed |
| "Each one should feel very unique" | About 25 parameters, each drawn independently from a narrow band. Every hand uses the same skeleton per letter | Pick an archetype, sample correlated traits, then check the result really looks different |

I measured 2,000 consecutive random seeds. In 79% of neighbouring pairs, at least two headline traits (slant,
x-height, width, pen width, pressure, neatness) differ by more than a third of their range. The hands still read
alike, because the ranges are narrow (print x-height 0.50–0.68, width 0.70–0.96), letter construction never
changes, and about 15 of the 25 parameters are texture you can't see at a glance. Section 5 addresses this.

---

## 1. Practitioner techniques

### 1.1 Raster brushes: Procreate and Photoshop

Procreate's Brush Studio is the most complete public vocabulary for convincing ink
([Handbook](https://help.procreate.com/procreate/handbook/5.1/brushes/brush-studio-settings)). Photoshop
builds the same ideas from Shape Dynamics (size follows pressure) and Transfer (opacity and flow follow
pressure). Its brush is "a series of imprints of the brush tip", so the spacing between imprints sets how smooth
the line is ([Photoshop Essentials](https://www.photoshopessentials.com/?p=681)).

| Technique | Effect | How we approximate it |
|---|---|---|
| **Pressure taper** with tip size and opacity fade | Stroke ends thin out *and* fade | Add an opacity taper at the same points as the existing width taper (`taperIn/Out`) |
| **Grain: Texturized vs Moving** | Texturized pins the texture to the canvas, like paper. Moving drags it with the stroke | Pin paper grain to the page, so overlapping strokes hit the same bumps. Ballpoint striations are "moving": noise in stroke coordinates (u along the stroke, v across it) |
| **Wet Edges, Burnt Edges** | Pigment bleeds; overlaps "color burn" | Felt and fountain: a slight edge blur. Overlaps: multiply blending (1.6) |
| **Wet Mix: Charge, Dilution** | Paint loads at the stroke start and depletes as you draw | A per-stroke **ink load**. It decays along the stroke for dip and fountain pens, and rises from an "inkless start" for ballpoint |
| **Stroke and Stamp Color Jitter** | Hue, saturation and lightness vary per stroke and per stamp | Per-stroke OKLCH jitter (L ±0.03, C ±0.015, h ±3°, est.) plus a slow drift across the text |
| **Color Pressure; Speed → size and opacity** | Heavier strokes are darker; fast strokes are thinner and fainter | Pressure and the new Hurry macro (4.1) drive density, not just width |

**The lesson:** a convincing ink brush comes from opacity and colour following pressure and speed, on a grain
that stays still. The tip shape matters much less. Leave stamp-level jitter at zero. The spike already found that
high-frequency wobble reads as fake.

### 1.2 Wet media: Fresco and Rebelle

Fresco's Live Brushes run a "physics-driven simulation engine"
([Adobe](https://helpx.adobe.com/fresco/using/live-brushes.html)). Rebelle simulates "paint and ink flows,
color blending, diffusion, and drying" ([manual](https://www.escapemotions.com/products/rebelle/documents/Rebelle_Manual_v.7.0.pdf)).

We don't need fluid simulation, because handwriting ink spreads less than a millimetre. We only need its visible
results: edge darkening, pooling where the pen dwells, and granulation in paper hollows
([Curtis et al. 1997](https://grail.cs.washington.edu/projects/watercolor/paper_tiny.pdf)). Each can be faked
with a texture lookup (section 2).

### 1.3 Illustrator art and pattern brushes

An art brush stretches one drawn stroke along the whole path. A pattern brush tiles a middle segment and adds
separate start, end and corner tiles ([Pixflow](https://pixflow.net/blog/a-deep-dive-into-adobe-illustrator-brushes/)).
The known failure is a repeated messy detail, which "the eye can pick up on … very quickly"
([Adobe Community](https://community.adobe.com/questions-652/how-can-i-create-wash-me-style-text-816119)).

**For us:** split every along-stroke effect the way pattern brushes do: ends in physical units (a 2 mm entry, a
3 mm exit, est.) and the middle in normalised length. Then a long downstroke and a short tick get the same
pen-down blob and lift-off fade. Seed each stroke's noise offset separately (Procreate's Offset Jitter).

### 1.4 After Effects and Lottie write-on

Motion designers use a **matte reveal**: a thick centreline drawn in writing order, with Trim Paths' End animated,
used as a matte over the finished letters ([Noble Desktop](https://www.nobledesktop.com/learn/after-effects/stroke-animation)).
Lottie can't run AE's Stroke effect, so it uses Trim Paths or masks
([LottieFiles forum](https://forum.lottiefiles.com/t/what-are-the-alternatives-to-achieve-the-stroke-writing-effect-that-works-on-ios-android/6147)).

**For us:** `makeGlyph` already returns each stroke's centreline (`strokes[i].center`) next to its contour. Reveal
each contour through a `stroke-dasharray` mask about 1.5× the pen width. Take the timing from `human-feel.md` §1's
stroke time axis, and pause at pen lifts, the cue motion designers add by hand.

### 1.5 Prop makers and robot pens

These practitioners have to fool someone holding the paper.

**Handwrytten** uses real ballpoints, "programmed to write like a human — not perfect". Its robots vary letter
height and width so double letters differ, "the left margin varies", and they "write with a bend"
([Bangor Daily News](https://www.bangordailynews.com/2022/11/28/business/robot-are-handwriting-notes-joam40zk0w/)).

**Thanks.io** randomises "pen pressure, line angle, glyphs"
([help](https://help.thanks.io/is-the-handwriting-real)). **Annie Atkins's film props** rely on period paper,
stamps and ageing ([Phaidon](https://www.phaidon.com/blogs/phaidon-archive/all-you-need-to-know-about-fake-love-letters-forged-telegrams-and-prison-escape-maps-designing-graphic-props-for-filmmaking)).

**For us:** the page sells the hand as much as the letters do. Margins, line behaviour and paper belong in
Phase 1.

### 1.6 Lettering artists and font designers

- **Bounce must be random per use, not fixed per letter.** A letter that always sits high "will always look
  higher" ([TypeDrawers](https://typedrawers.com/discussion/comment/51938)). Our `quirk` is a fixed per-letter
  warp, so keep its vertical part small.
- **Randomness isn't enough.** Underware's bar for Liza is that type should "always look different, but … always
  look good" ([Print](https://www.printmag.com/print-design-articles/lettercentric-type-as-writing/)).
  Choices that depend on context, such as word ends and letter pairs, beat noise.

### 1.7 Paper, overlays and scan artifacts

**Overlay.** The standard move is a desaturated paper scan set to **Multiply**
([Greenvelope](https://www.greenvelope.com/blog/?p=3293)). Multiply darkens ink where the paper is dark and never
lightens it.

**Bleed.** Commercial packs sell "fuzzy letter edges" from ink soaking into fibre
([Veila](https://veila.gumroad.com/l/ink-bleed-effects-stamp-mockup)). Bleed should scale with pen wetness ×
paper absorbency, not apply globally.

**Scan look.** "Make it look scanned" tools converge on small, seeded values: rotation up to 0.5–0.7°, blur
about 0.6 px, noise, a warm tint and an edge shadow. More quickly looks fake
([make-look-scanned](https://github.com/overflowy/make-look-scanned); [BentoPDF](https://www.bentopdf.com/docs/tools/scanner-effect)).
This belongs in an **export finish**, not the live view.

### 1.8 Colour: ink is never flat

`human-feel.md` §3.2–3.3 has the ink swatches and the Beer–Lambert density model. Practitioners agree:

| Pen | What practitioners observe |
|---|---|
| Fountain | Strokes start lighter and leave a "pool of darker, richer color at the end" ([Goulet](https://www.gouletpens.com/blogs/fountain-pen-blog/top-8-shading-inks-and-how-to-get-the-most-out-of-them)). Some inks dry with a dark outline as dye migrates to the edge ([FPN](https://fountainpennetwork.com/forum/topic/343255-inks-that-create-a-darker-outline-around-the-letters)) |
| Ballpoint | "Gooping" at direction changes ([NIST/OSAC](https://www.nist.gov/glossary-term/46746)), striations, ink concentrated at the edges ([JASQDE](https://journal.asqde.org/articles/10.69525/jasqde.94)) |
| Felt tip | Overlaps darken, which is why digital markers default to Multiply ([Clip Studio](https://assets.clip-studio.com/en-us/detail?id=1985859)) |

**The cheapest convincing recipe, in today's SVG:**
1. Pick an **ink family** rather than a hex colour: a base in OKLCH plus jitter ranges, using `human-feel.md`'s
   swatches.
2. Jitter colour **per stroke**, and drift it slowly across the text.
3. Give each stroke a `linearGradient` from its first centreline point to its last
   (`gradientUnits="userSpaceOnUse"`), with 3–4 stops:
   - ballpoint: a light start,
   - fountain and felt: a dark pool at the exit.

   Strokes are already split at sharp corners, so most runs are short and nearly straight, and the chord is a
   fair stand-in for "along the path".
4. Put `mix-blend-mode: multiply` on stroke paths inside an isolated group
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/mix-blend-mode)). Lower the opacity floor to about 0.6
   for wet pens, so crossings visibly darken.
5. For ballpoint only, add a goop dot at 3–8% of sharp turns.

---

## 2. Generative and creative-coding approaches

| Approach | What it is | Realism / cost | Use it for |
|---|---|---|---|
| **perfect-freehand** ([GitHub](https://github.com/steveruizok/perfect-freehand)) | Points plus pressure become an outline. Options include `thinning`, `easing`, `simulatePressure` (from velocity) and taper easing | Clean and very cheap, but no texture | Ideas only, since our `ribbon()` does the same job. Borrow its pressure easing and velocity-to-pressure |
| **rough.js** ([wiki](https://github.com/rough-stuff/rough/wiki)) | `roughness`, `bowing`, and multiple strokes unless `disableMultiStroke` is set | Sketchy diagrams, not ink | A rare "went over it twice" retrace |
| **p5.brush** ([GitHub](https://github.com/acamposuribe/p5.brush), MIT) | Pressure curves as `[start, mid, end]`, a function or a Gaussian. Watercolour with a pigment ring. Needs WebGL2 and p5 | High realism, heavy | Borrow its vocabulary for pressure profiles, not the dependency |
| **Hobbs watercolour** ([essay](https://www.tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art)) | 30–100 deformed polygon layers at about 4% opacity | Beautiful, far too slow live | Ink-spill decoration at most |
| **Bousseau colour modification** ([INRIA](https://artis.inrialpes.fr/Publications/2006/BKTS06)) | d = 1 + β(T − 0.5); C′ = C − (C − C²)(d − 1), where T is a grey texture ([Brown thesis](https://cs.brown.edu/research/pubs/theses/masters/2010/doran.pdf)) | Excellent per cost: one texture fetch per pixel | **Core of a WebGL ink pass:** T = paper grain + an edge term + stroke noise |
| **SVG filters** ([feTurbulence](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence), feDisplacementMap, feComposite, feComponentTransfer) | Noise, displacement and arithmetic compositing | Good, but the whole filtered area re-rasterises on every change. Slow on iOS, WebKit and Firefox ([GSAP forum](https://greensock.com/forums/topic/33075-gsap-and-feturbulence-mobile-performance/); [WebKit](https://bugs.webkit.org/show_bug.cgi?id=287982)) | Static views and export. One filter per page, never one per path |
| **Canvas 2D stamping** ([losingfight](https://losingfight.com/blog/2007/08/18/how-to-implement-a-basic-bitmap-brush/)) | `drawImage` a tip every ~1/10 of its width | Good. Strokes over-darken themselves unless drawn offscreen first | Pencil, if WebGL is ruled out |
| **WebGL triangle strip** | Ribbon vertices carry u, v, density and speed. A shader computes alpha and colour | Best quality, and a page is only a few thousand triangles | **The live renderer for Phase 1–2** |

**SVG filter recipes:**

**Pencil grain.** Pipe `feTurbulence` into `feColorMatrix` to make a grain alpha, then combine it with the ink
alpha in `feComposite` arithmetic (k2 ≈ 2, k3 ≈ 1.2, k4 ≈ −1.4, est.). Heavy strokes keep all the grain and
light ones keep only the peaks: "pressure fills the valleys" in one self-clamping primitive.

**Fountain halo.** Blur the source alpha (σ ≈ 0.6 px) and subtract the blur from the original to get an
inner-edge mask. Flood that mask with a darker ink.

**Ballpoint.** No edge roughening at all. Ballpoint edges are crisp, and its texture comes from striations and
skips.

**Live-typing performance (measured).** In Node, layout plus `renderSVG` on the lab's 177-character sample takes
**23 ms for print and 31 ms for script**. It produces **600–860 KB** of path data. That's before the browser
parses it and re-filters the whole page, and the lab replaces `innerHTML` on every key. A 1,000-character letter
would take about 150 ms per keystroke. Fix this before adding texture:
1. **Render per line.** Cache glyph instances and re-render only the lines that change.
2. **Stabilise instance seeds.** The current seed `'live:' + charIndex + ':' + ch` means inserting one character
   near the start **re-rolls every letter after it**, so editing makes the page shimmer. Seed by word text,
   occurrence count and position in the word instead.
3. **Simplify paths.** Run the existing `simplify()` at about 0.25 px.
4. **Make paper a static layer** that never re-rasterises.

---

## 3. How comparable tools expose expressive controls

| Tool | Control model | Lesson |
|---|---|---|
| **Calligrapher.ai** ([site](https://www.calligrapher.ai/)) | Speed, Legibility, Stroke Width, Style. Legibility is sampling temperature, Graves's "bias": more legible, less diverse ([CBC](https://www.cbc.ca/arts/robots-have-mastered-the-art-of-handwriting-1.3167089)) | A single "care" scalar that scales all variance feels powerful. Neatness is ours, so keep it first |
| **Procreate** | About 100 Brush Studio settings, but people pick a *named brush* | Raw parameters are for authors. Users want named pens |
| **Midjourney** | `--chaos 0–100` sets grid variety ([docs](https://docs.midjourney.com/chaos)). `--sref random` draws a numbered style that rerolls keep ([docs](https://docs.midjourney.com/docs/style-reference)). Vary (Subtle) and Vary (Strong) ([docs](https://docs.midjourney.com/docs/variations)) | A variety knob, plus "near this one" vs "far from it". A style as a shareable number is our seed |
| **Coolors** | Spacebar regenerates everything that isn't locked ([Elegant Themes](https://www.elegantthemes.com/blog/resources/color-palette-generators)) | Lock-and-reroll is the most learnable generative interaction |
| **Ableton racks** | Macros, a Rand button, "Exclude Macro from Randomization", and saved Variations ([FAQ](https://help.ableton.com/hc/en-us/articles/360019103480)) | Per-control locks plus snapshots |
| **Arturia Analog Lab** | The same four macros on every preset: Brightness, Timbre, Time, Movement ([MusicRadar](https://www.musicradar.com/news/arturia-analog-lab-play-free-plugin)) | Perceptual names, kept constant across patches, each moving many parameters |
| **Lightroom** | A preset or profile plus an Amount slider from 0 to 200 ([LR Killer Tips](https://lightroomkillertips.com/the-difference-between-lightroom-presets-and-creative-profiles/)) | Mood presets need an amount, not an on/off switch |
| **Kittl** | An intensity slider on each effect ([Kittl](https://www.kittl.com/blogs/10-popular-text-effects-in-kittl/)) | One slider per effect is enough for casual users |
| **Figma randomisers** | Randomize keeps the settings and changes the seed ([Samolevsky](https://www.samolevsky.com/blogs/figma-plugins/stroke-width-randomizer)) | A reroll must never reset the settings |

**What makes a small set feel powerful:**
1. **Macros with perceptual names.** Each moves many parameters together, as Neatness already does. Call it
   "Hurry", not "strokeShift".
2. **Every slider position looks good.** That's Underware's bar.
3. **Sliders are seed-relative.** The thumb starts at this hand's natural value, marked with a dot, and moving it
   adds an offset. Today an override *replaces* the hand's value, so touching a slider pulls every hand toward
   the same setting.
4. **The rest comes from the table:** lock-and-reroll, presets with an Amount, one Variety knob plus Similar
   hand, and a history strip.

**The mental model to put on screen:**

| Zone | Contents | Does New hand reroll it? |
|---|---|---|
| **Who** (the writer) | Seed, Print/Joined, letter construction, size habit, slant, proportions, spacing | Yes |
| **How** (today's writing) | Neatness, Hurry, Pressure, tiredness, occasion | The seed sets a resting value, and the user's offsets persist |
| **With what, on what** | Pen, ink, paper | No. Locked by default |

---

## 4. Recommended control set

### 4.1 Primary (7)

The header keeps today's two identity controls:
- **New hand.** A long press (or Shift) gives **Similar hand**.
- **Print / Joined.** This becomes three stops when semi-cursive ships.

**Paper** sits with the page. The panel holds seven controls:

| # | Control | What it changes in the engine | Range | Default |
|---|---|---|---|---|
| 1 | **Pen** | `p.pen` selects a model with its own outline, density, texture and default ink. New `PENS`: Ballpoint, Gel, Fountain, Felt tip, Pencil, each in Fine, Medium or Bold. Today only `auto` exists | 5 × 3 | Ballpoint Medium, locked across rerolls |
| 2 | **Ink** | New `p.ink` family: an OKLCH base, jitter ranges, pooling and edge behaviour (swatches in `human-feel.md` §3.2). Replaces `--ink`. Pencil offers HB, 2B or colour | 6–8 swatches | The pen's natural ink: blue ballpoint, blue-black fountain, black felt, HB pencil |
| 3 | **Size** | Render `emPx` **with a compensating `penWidth`**, so the pen keeps its physical width. Large writing with a fine pen stays thin. Today, scaling `emPx` also fattens the pen. New `p.size` trait | x-height ≈ 2–7 mm | The seed's habit |
| 4 | **Neatness** | The existing macro (quirk, warp, tremor, stroke shift, spacing jitter, drift), extended to line rhythm, margins and variant choice | 0–100% | Seed |
| 5 | **Hurry** *(new)* | Slant +0–8°, width +0–10%, longer flying tapers, higher `strokeShift`, lighter ballpoint and less pooling, more joins, looser lines, effective neatness −0.3 × hurry. Also sets animation speed | Calm ↔ Rushed | Seed |
| 6 | **Pressure** | A property of the hand that each pen interprets: ballpoint → density and coverage; pencil → how much grain fills in; fountain or pointed → swell and pooling; felt → slight width. Also controls the density contrast between downstrokes and upstrokes | Light ↔ Heavy | Seed |
| 7 | **Slant** | Existing `slant` | −15° to +30° | Seed |

### 4.2 Advanced (15)

| # | Control | Engine mapping ("new" = capability needed) | Range | Default |
|---|---|---|---|---|
| **Pens and ink** | | | | |
| A1 | Tip size (mm) | `penWidth`, converted through Size | 0.2–1.5 mm | From the pen |
| A2 | Ink flow (Dry ↔ Wet) | New: mean density, end pools, halo, ballpoint skip rate, felt bleed | 0–100 | 50 |
| A3 | Ink variation | New: per-stroke colour jitter, along-stroke gradient, a slow page drift (extends `autoStrokeOpacity`) | 0–100 | 40 |
| A4 | Paper tooth | New: grain depth and absorbency | Smooth ↔ Toothy | From the paper |
| A5 | Nib angle | Existing `nibAngle`, broad nibs only | 0–90° | Seed |
| **Writing and page** | | | | |
| A6 | Line spacing | `lineHeight` as a writer trait (2.2–3.2 x-heights, per `human-feel.md` §4.1). Snaps to the rules on ruled paper | 1.2–2.4 em | Seed |
| A7 | Line rhythm | New: pitch variation (coefficient of variation 4–10%), per-line slope, end bend, how far words float off the rule | Even ↔ Wandering | Follows Neatness |
| A8 | Baseline wobble | Existing `drift`, word lift, instance baseline | 0–100 | Seed |
| A9 | Margin discipline | New: left-start jitter, inward drift down the page, whether the last word squeezes in (≤15%) or wraps early | Strict ↔ Loose | Follows Neatness |
| A10 | Spacing (letters, words) | Existing `sidebearing`/`tracking`, `wordSpace` | −30% to +50%; 0.6–1.8× | Seed |
| **Letters and variety** | | | | |
| A11 | Proportions | Existing `xHeight`, `width`, `capWidth` (bands widened per 5.2) | Short ↔ Tall, Narrow ↔ Wide | Seed |
| A12 | Age / tremor | Existing `tremor`, plus new slow shake, blunter starts and more pen lifts | 0–100 | Seed |
| A13 | Tiredness | New drift along the text: neatness falls, size and spacing grow, variance rises (`human-feel.md` §4.3) | 0–100 | 25 |
| A14 | Locked letters | New per-letter pins `{ch: {variant, quirkSeed}}` that survive rerolls ("keep this g") | Per letter | None |
| A15 | Variety | How far New hand jumps (5.3) | Sibling ↔ Wild | 60 |

### 4.3 Occasion presets

An occasion is the same writer in a different situation. It moves **How** and **With what**, never **Who**.
Each occasion gets an Amount slider from 0 to 150%. The writers themselves are `fonts-study.md` §6's preset hands,
which section 5 uses as archetypes.

| Occasion | Neatness | Hurry | Pressure | Size | Pen / paper | Page |
|---|---|---|---|---|---|---|
| Thank-you card | +25 | −30 | 0 | +5% | Gel or fountain / card | Even lines |
| Shopping list | −25 | +40 | +10 | +15% | Felt / notepad | Sloping lines, cramming at the edge |
| Love letter | +10 | −15 | +15 | 0 | Fountain / laid paper | More ink variation |
| Lecture notes | −15 | +50 | 0 | −20% | Ballpoint / ruled | Tiredness and margin drift high |
| Postcard | 0 | +10 | 0 | −15% | Ballpoint / card | Tight spacing, squeeze at the edge |

---

## 5. Reroll design

### 5.1 Why rerolls feel alike

**The MIT Media Lab lesson.** Its 2011 identity had 40,000 variants, but "they all looked pretty much the same"
([Gizmodo](https://gizmodo.com/why-mit-media-lab-scrapped-its-old-logo-after-just-thre-1651927638)). Kate
Compton calls this **procedural oatmeal**: output that is unique on paper but not perceived as unique
([Wikipedia](https://en.wikipedia.org/wiki/Procedural_generation)).

In our engine, independent uniform draws pile up in the middle. The few traits that change the overall look
(size, slant, width, construction, joins) get diluted by the many that don't. Uniform randomness also clumps
([Hobbs](https://www.tylerxhobbs.com/words/probability-distributions-for-algorithmic-artists)). And one skeleton
per letter caps how different two hands can look.

### 5.2 Sampling scheme

**The core principle:** the seed → hand mapping stays pure. All the selection logic decides *which seed to show
next*, so share links and determinism survive.

**1. Archetype bag.** `makeHand(seed)` first derives an archetype from the seed: one of `fonts-study.md` §6's
twelve preset hands, each a family of seeds. New hand draws archetypes from a shuffled bag without replacement,
the way modern Tetris deals its pieces so none goes missing for long ([TetrisWiki](https://tetris.wiki/TGM_randomizer)).
It never repeats the last archetype across a refill.

**2. Correlated headline traits.** Each archetype has a mean μₐ and spread σₐ. Draw six latent traits as a
Gaussian copula: trait = μₐ + σₐ·(Lz), where z ~ N(0, I) and L is the Cholesky factor of a shared correlation
matrix. Clip at ±1.5σ, or ±2.5σ in Wild. Starting correlations (est.):

| Pair | ρ |
|---|---|
| Speed ↔ slant | +0.5 |
| Speed ↔ neatness | −0.5 |
| Speed ↔ width | +0.3 |
| Speed ↔ weight | −0.2 |
| Size ↔ roundness | +0.35 |
| Size ↔ weight | +0.2 |
| Slant ↔ roundness | −0.25 |

**3. Discrete traits.** Draw letter construction from archetype-weighted tables over variant tags (`two-storey-a`,
`looped-l`, `open-4`, `crossed-7`). Do the same for dot style, capital style, digit style and join rate. This is
the step that makes hands feel like different people. It needs the Letters workstream to tag its variants.

**4. Derive the ~25 engine parameters** through the same macro mappings the sliders use, plus small personal
noise. Widen the bands: print x-height 0.42–0.78, width 0.62–1.10, slant −14° to +30° (est.).

**5. Best-of-12 maximin.**
1. Generate 12 candidate seeds for the archetype. Each costs one `makeHand`, so microseconds, because no glyphs
   are drawn.
2. Keep the candidate whose minimum distance to the **last 6 hands shown** is largest. This is farthest-point
   selection, the greedy cousin of maximin designs ([Gramacy, ch. 4](https://bookdown.org/rbg/surrogates/chap4.html)).
3. Require d ≥ d_min(Variety).
4. Apply the **two-big-differences rule**: at least two headline traits must differ by more than 0.35 of their range.

The distance weights what you notice at a glance:

| Feature | Weight |
|---|---|
| Letter construction (Hamming distance, weighted by letter frequency) | 1.2 |
| Size, slant, joins | 1.0 |
| Width, x-height | 0.8 |
| Pressure, neatness | 0.6 |
| Spacing | 0.4 |
| Texture traits (quirk, tremor, taper) | 0.1 |

**6. Legibility guard: a chaos budget.** Take the weighted sum of (1 − neatness), speed, tremor, |slant − 8°|, width
extremes and low x-height. It must stay ≤ B. If it doesn't, pull the most extreme latent back toward μₐ. Hard
limits:
- stroke width / x-height between 0.06 and 0.22,
- letter gap ≥ 0.4 × pen width,
- |slant| ≤ 30°.

**7. Locks.** Locked controls and letters pass through unchanged. If Slant is locked at 20°, sample the other
latents *conditioned on it*, so the writer stays coherent: likely fast.

### 5.3 The Variety knob

| Variety | Behaviour | Precedent |
|---|---|---|
| 0–20 **Sibling** | Same archetype, z′ = z + N(0, 0.25²), about 85% of letter constructions kept. "Similar hand" always does this | Vary (Subtle) |
| 21–70 **Stranger** (default 60) | Next archetype from the bag, moderate d_min | Vary (Strong), mid `--chaos` |
| 71–100 **Wild** | σₐ × 1.5, tails to ±2.5σ, rare variants boosted, still within the chaos budget | High `--chaos` |

**Making variety visible:** keep a history strip of the last 8 hands, and fill the planned "desk of 12" with the
same farthest-point selection. For QA, a **squint test**: show 12 consecutive New-hand results at 25% size, ask
whether any two could be the same person, and log the minimum pairwise distance per build.

---

## 6. Top 12 changes, ranked by realism impact ÷ effort

Impact is scored 1–5. Effort is scored 1–5, where 1 means a day or two.

| Rank | Change | Workstream | Impact | Effort | Ratio |
|---|---|---|---|---|---|
| 1 | **Ink families with per-stroke OKLCH colour jitter and slow drift**, replacing the flat `--ink` | Pens and ink | 4 | 1 | 4.0 |
| 2 | **Line rhythm and margins:** pitch variation, per-line slope, end bend, left-start jitter, inward drift, last-word squeeze (values in `human-feel.md` §4.1–4.2) | Writing and page layout | 4 | 1 | 4.0 |
| 3 | **Multiply overlaps and a wider opacity range**, so crossings and re-strokes darken | Pens and ink | 3 | 1 | 3.0 |
| 4 | **Size keeps the pen physical:** pen width in mm, compensated through `emPx` | Pens and ink | 3 | 1 | 3.0 |
| 5 | **Tiredness drift over the text** | Writing and page layout | 3 | 1 | 3.0 |
| 6 | **Density along each stroke:** a gradient along each stroke's chord plus an opacity taper now, a full density field later | Pens and ink | 5 | 2 | 2.5 |
| 7 | **Paper layer:** static page-fixed grain, paper colour, ruled and grid paper with words floating off the rule, an optional scan finish on export | Writing and page layout | 4 | 2 | 2.0 |
| 8 | **Hurry macro** linking slant, width, tapers, stroke shift and joins, with speed feeding ink density | Letters and variety | 4 | 2 | 2.0 |
| 9 | **Reroll sampler:** archetype bag, correlated traits, wider bands, best-of-12 maximin, chaos budget, Variety and Similar hand | Letters and variety | 5 | 3 | 1.7 |
| 10 | **Control panel v2:** seed-relative sliders, a lock per control, a history strip, occasion presets with Amount | Product UI | 3 | 2 | 1.5 |
| 11 | **Ballpoint model:** low width contrast, pressure as coverage, goops at turns, inkless starts, rare skips, crisp edges | Pens and ink | 4 | 3 | 1.3 |
| 12 | **Pencil grain by threshold and fountain halo**, via SVG filter or shader | Pens and ink | 3 | 3 | 1.0 |

**Prerequisite, unranked (Writing and page layout):** per-line rendering and stable per-word instance seeds
(section 2). They add no realism, but without them items 6, 7, 11 and 12 will make typing lag, and edits will keep
re-rolling every letter after the cursor. **Dependency:** item 9 gets most of its power from tagged letter
variants, so ship its archetype and correlation steps first.
