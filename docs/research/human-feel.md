# What makes handwriting look and feel human

_Research for the Dynamic Font (Seedhand) engine, 2026-11-02. Covers motor control, forensic examination,
ink and pen physics (including colour and density), page layout (including line spacing), allographs, the
uncanny valley, prior art, a QA rubric, and a prioritised list of engine rules._

**How to read the numbers.** Figures with a link come from a source. Figures marked **est.** are my
starting values for tuning. They are not literature values. Units: **xh** = the writer's x-height;
**u** = font units (cap height = 700 u, so xh is about 350–475 u in the current engine).

**Limits of this research.** Many forensic claims come from training notes and practitioner blogs, not
from controlled studies. I found no published within-writer spreads for slant or letter height, so those
ranges are estimates. The search budget ran out before I could look up the three late additions (ink
colour, density, line spacing). Those sections rest on a few fetched sources and on general knowledge,
and their numbers are marked est.

---

## 0. Diagnosis

The engine varies **shape** but has no **time**. Width comes from direction (nib angle, or the downstroke
swell), tapers from distance, and each letter's variation is independent of its neighbours. Real
handwriting is a time signal. Speed sets curvature, thickness, ink density, how strokes start and end,
and where joins and lifts fall. Its variation is also **correlated**: a whole word leans and grows
together, and a whole line rises together. Uncorrelated variation on top of uniform ink is what reads as
"a neat typeface with jitter". Rafael's three notes (colour and pressure density feel off, and lines are
too evenly spaced) are specific cases of these two gaps.

---

## 1. Motor control and kinematics

### 1.1 Kinematic theory: the lognormal stroke

Plamondon's Kinematic Theory treats handwriting as overlapping neuromuscular strokes. Each stroke has a
**lognormal speed profile**: a quick rise and a long tail. The delta-lognormal model pairs two opposing
lognormals for one movement. The **sigma-lognormal** model adds many time-shifted strokes as vectors to
build words and signatures ([Berio, Leymarie & Plamondon 2017](https://doc.gold.ac.uk/autograff/post/papers/igs2017/);
[Polytechnique Montréal](https://www.polymtl.ca/expertises/en/node/103/publications)).

Each stroke has a start time t0, a log-time delay μ, a spread σ, a length D, a direction θ and a
curvature δ, which bends it into an arc. Speed peaks at t0 + e^(μ−σ²). Berio sets the overlap between
strokes with Δt in [0, 1], where t0ᵢ = t0ᵢ₋₁ + Δt·sinh(3σ). **More overlap gives smoother curves, and
less overlap gives sharper, slower corners.** He treats μ and σ as fixed traits of a writer
([Berio et al.](https://eprints-gro.gold.ac.uk/20616/1/lognormality_2017.pdf)). That maps well onto a
seed: μ and σ belong to the writer, and Δt is the "fluency" control. Synthesis work perturbs these
parameters around their means, and warns that beyond certain bounds letters become unrecognisable
([Albo et al., ICFHR 2014](https://iapr.org/archives/icfhr2014/wp-content/uploads/2015/02/ICFHR2014-Albo.pdf);
[IGS 2015](https://hal.univ-antilles.fr/hal-01165871/file/IGS_2015_submission_11.pdf), where σ
distortions stay within about −32% to +29%).

A typical stroke lasts about **100 ms**, at about **10 strokes per second**. A stroke runs between two
points of high curvature, with a dip in speed at each end
([Schomaker, MIAMI](https://www.ai.rug.nl/~lambert/projects/miami/taxonomy/node145.html)).

### 1.2 The two-thirds power law and isochrony

Speed falls in tight curves: **v = K · R^β with β ≈ 1/3**, where R is the radius of curvature
([Lacquaniti et al. 1983](https://www.ece.uvic.ca/~bctill/papers/mocap/Lacquaniti_etal_1983.pdf)). K
stays roughly constant within a movement unit. The exponent is close to 2/3 in adults
([Viviani & Schneider 1991](https://ece.uvic.ca/~bctill/papers/mocap/Viviani_Schneider_1991.pdf)).
**Isochrony:** average speed rises with movement size, so a big loop takes about as long as a small one.
Larger writing is faster writing.

What this does to the trace:
- **Slow points are curvature peaks:** the bottoms of u and n, the tops of loops, and the cusps of r, v
  and w. They carry more ink, wider pointed-pen swells, ballpoint goops and fountain-pen pools.
- **Fast points are straight runs and connecting upstrokes.** They are thinner and lighter, and that is
  where skips and ink starvation happen. In genuine signatures, upstrokes were about **15% faster and 19%
  longer** than downstrokes ([AAFS 2012](https://www.aafs.org/sites/default/files/media/documents/AAFS-2012-J13.pdf)).
- **Corners round off with speed.** A fast writer turns an n's arch into a garland.

### 1.3 Where pen lifts happen

- **Print:** between letters, and inside multi-stroke letters (E, F, H, k, t, x, f). Hurried printers
  join some pairs anyway.
- **Cursive:** at word ends, before **delayed strokes** (i and j dots, t-bars, x-crosses, accents),
  after most capitals, and often before letters that start at the top or counterclockwise (a, c, d, g,
  o, q) after a high exit (b, o, v, w). The last point is a heuristic from teaching models. Sassoon
  treats joins along the baseline as the natural ones ([Sassoon](https://studysites.uk.sagepub.com/sassoon/files/pupilpages/12%20rules%20of%20legibility.pdf)).
- **Adults write mixed hands.** In 600 students in grades 4–9, mixed print and cursive was the
  **fastest** style, and "mostly cursive" mixed writing was the **most legible**
  ([Graham, Weintraub & Berninger 1998](https://cris.huji.ac.il/en/publications/the-relationship-between-handwriting-style-and-speed-and-legibili/)).
  A believable print hand joins some pairs, and a believable script hand breaks some joins.
- **Delayed-stroke timing differs by writer.** Some writers dot after each word, others after a
  sentence or a paragraph ([Wikipedia](https://en.wikipedia.org/wiki/Delayed_stroke)).

### 1.4 Stroke order and direction

- **Latin, right-handed:** top to bottom, left to right. Ovals run counterclockwise. Crossbars run left
  to right. In a 2024 forensic study, right-handers drew 98–100% of t-crosses left to right. More than
  36% right-to-left crosses classified a writer as left-handed
  ([JFS 2024 via EBSCO](https://www.ebsco.com/articles/applied-sciences/13f7e4cd-c15a-50b6-a4d7-489cfe3000bf/the-t-time-investigating-handedness-through-strokes-and-slopes)).
  Left-handers also lean backward more often ([DOAJ 2024](https://doaj.org/article/5b444d6680bb4e5a8f3b7fb68ef6f55d)).
- **Chinese:** top before bottom, left before right, horizontal before vertical, and enclosures closed
  last. Some orders differ between mainland and traditional forms
  ([Skritter](https://blog.skritter.com/2020/03/chinese-stroke-order-rules/)).
- **Arabic and Farsi:** right to left in joined runs, with dots and diacritics often added afterwards.
  Delayed strokes are a much bigger issue there ([Biadsy et al.](https://www.cs.columbia.edu/nlp/papers/2006/biadsy_al_06.pdf)).
  Japanese kana and Devanagari were not researched in depth.

In a static render, order matters only at overlaps, where the later stroke sits on top and crossings
darken. In the planned animation, order and direction are what make it read as a person.

### 1.5 Faking kinematics cheaply

1. **Give each stroke a time axis.** Split skeleton strokes at curvature peaks. Within each piece,
   v(s) = K·κ(s)^(−1/3), with κ clamped, times a bell envelope that dips at each split. Set K per piece
   from isochrony and integrate ds/v. This is O(n) per stroke.
2. **Let fluency change geometry.** The corner-rounding radius grows with speed.
3. **Drive everything downstream from time:** width, density, ends, skips, animation and delayed strokes.
4. **Later:** fit sigma-lognormal parameters to each skeleton offline (Berio's method), then vary μ, σ
   and Δt per writer and per use.

---

## 2. Forensic document examination

### 2.1 Class, individual and natural variation

**Class characteristics** come from the copybook a writer learned. **Individual characteristics** are
personal habits: proportions, connections, i-dots, t-bars, slant, alignment, lifts and spacing
([Forensic Field](https://forensicfield.blog/individual-characteristics-of-handwriting/)). A founding
premise is that no writer can exactly repeat their writing
([US DOJ, citing Huber & Headrick](https://www.justice.gov/archives/dag/file/877751/dl)), and variation is
wider between sessions than within one ([Wrocław](https://www.repozytorium.uni.wroc.pl/Content/118422/download)).

- **Stable over decades:** in 51 writers followed for decades, slant changed in only 2. Relative size,
  height, baseline habit and pen lifts stayed largely consistent ([JASQDE](https://journal.asqde.org/articles/224)).
- **Ratios are more individual than sizes.** The d's ascender-to-bowl ratio separated writers better
  than the l/e height ratio ([Wing & Nimmo-Smith 1987](https://www.mrc-cbu.cam.ac.uk/bibliography/articles/2127)).
  So: lock **proportions** tightly and let **absolute size** float.
- **Identical repeats are suspicious.** Examiners read identical signatures as tracing or machine
  reproduction ([Hawkeye Forensic](https://hawkeyeforensic.com/science-behind-signature-verification-forensic-analysis/)).

Starting estimates for one page by one adult (est.): slant ±2–4° between letters and ±1–2° between
words; x-height CV 4–8% between letters; word baseline offsets ±2–4% xh; line slope 0–2° on plain paper.

### 2.2 Tells of simulated writing: the "never do" list

| Tell | Cause | Engine rule |
|---|---|---|
| **Blunt starts and ends** | Pen set down and lifted while still | Taper or hook in the direction of motion. Blunt ends only at real stops. |
| **Irregular tremor** | Slow, careful drawing ([NIST OSAC](https://www.nist.gov/glossary-term/47856)) | No visible wobble. A "shaky" preset uses **regular** tremor, because natural tremor is more uniform than forged tremor ([QDE notes](https://www.academia.edu/6861524/Questioned_Document_Examination_Lecture_Notes)). |
| **Hesitation blobs** mid-stroke | Checking the model | Pools only at curvature peaks and stroke ends. |
| **Uniform pressure and speed** | Drawing at constant speed | Vary within strokes and between up and down strokes. |
| **Lifts in odd places** | Stopping to look | Lift at word ends, before delayed strokes and at join breaks. Never mid-curve. |
| **Patching and retouching** | Fixing strokes | Overlaps only at natural crossings or deliberate corrections. |
| **Small direction changes in smooth runs** ([forgery notes](https://www.scribd.com/document/945235083/Forgery-Practical)) | Slow drawing | Wobble wavelength ≥ 0.5 xh. Fast strokes stay smooth. |

Genuine fast writing has "flying" starts and finishes, lighter upstrokes and conspicuous lifts
([Forensic Field](https://forensicfield.blog/individual-characteristics-of-handwriting/)).

---

## 3. Ink, pen, colour and density

### 3.1 Pen behaviour

| Pen | What real ink does | Cheap rendering |
|---|---|---|
| **Ballpoint** | Oil-based paste, 25–40% dye, released by a rolling ball under pressure ([Wikipedia](https://en.wikipedia.org/wiki/Ballpoint_pen)). Striations along the stroke, goops at direction changes, a trough under pressure, ink concentrated at the edges ([NIST](https://www.nist.gov/glossary-term/46746); [JASQDE](https://journal.asqde.org/articles/267)). Skips on fast, light strokes. | Density follows **pressure**, as coverage with gaps. Striation noise along the stroke. Goops at 3–8% of sharp turns, skips of 0.05–0.2 xh on fast upstrokes (est.). |
| **Gel / rollerball** | Wetter and opaque. Can track, skip and goop ([JASQDE](https://journal.asqde.org/articles/267)). | Near-uniform density, slight pools at stops. |
| **Fountain (firm nib)** | Dye ink flowing by capillary action ([Wikipedia](https://en.wikipedia.org/wiki/Fountain_pen_ink)). Nearly constant width. Density follows **dwell time**: slow points and ends pool and dry darker ("shading"). | Ink per length ∝ (v̄/v)^γ, γ 0.3–0.6 (est.), with edge darkening on pools. |
| **Flex / pointed pen** | Pressure spreads the tines: wide dark swells, thin hairlines. Fast flexed strokes **railroad** into two rails with a starved middle ([Goldspot](https://goldspot.com/blogs/magazine/how-to-write-with-a-flex-nib-fountain-pen); [FPN](https://fountainpennetwork.com/forum/topic/230626-inks-for-flex-to-kick-those-railroads)). | Width ∝ pressure on downstrokes. If width × speed passes a supply limit, split into rails. Dip pens drain a reservoir, like Liza's brush, which runs out after **3–8 letters** ([Underware](https://gwern.net/doc/www/www.underware.nl/754c2ec289a0b66bf7805a92bb12d5456b40b9df.html)). |
| **Felt tip** | Solid stroke, no trough, sometimes feathered edges ([JASQDE](https://journal.asqde.org/articles/267)). Bleeds at slow points. | Edge blur ∝ dwell (0.5–2% xh, est.). A dot at starts and stops. |
| **Pencil** | Graphite catches on paper fibre peaks, and pressure fills the valleys ([Sousa & Buchanan](https://graphicsinterface.org/proceedings/gi1999/gi1999-21)). | Density = pressure × thresholded grain. Overlaps build up but saturate. |

### 3.2 Ink colour (Rafael's first note)

Real ink is never one flat colour at one opacity.

**Hue depends on the ink family.** Approximate sRGB on off-white paper (#F6F3EC), est.:

| Ink | Look | Swatch |
|---|---|---|
| Ballpoint blue | Violet-leaning, from dyes such as methyl violet, crystal violet and Victoria blue ([Wikipedia](https://en.wikipedia.org/wiki/Ballpoint_pen)). Faint bronze sheen where heavy. | (38, 48, 132) |
| Royal / washable blue | Bright triarylmethane blue ([Wikipedia](https://en.wikipedia.org/wiki/Fountain_pen_ink)). Pale where thin, saturated where pooled. Not lightfast. | (45, 82, 180) |
| Blue-black (dye) | Desaturated dark slate blue. | (35, 50, 80) |
| Iron gall | Goes on pale blue (a temporary dye) and darkens to grey-black as it oxidises ([Wikipedia](https://en.wikipedia.org/wiki/Iron_gall_ink)). Old documents turn brown (general knowledge, not fetched). | fresh (42, 44, 56); aged (110, 82, 52) |
| Sepia | Brown, originally cuttlefish ink. Reference colour #704214 ([Wikipedia](https://en.wikipedia.org/wiki/Sepia_(color))). | (112, 66, 20) |
| Black ballpoint | Not pure black: slightly cool and grey. | (40, 40, 48) |

Handwrytten's founder says blue looks more realistic than black
([Business Insider](https://www.businessinsider.nl/need-to-send-a-handwritten-note-you-can-hire-a-robot-to-write-it-instead)).

**Darkness and saturation move together.** A thin dye layer is light. A pool is dark, more saturated and
shifted in hue. The cheap physical model is **Beer–Lambert per channel**: colour = paper × exp(−k·d),
where d is the local ink density and k_c = −ln(swatch_c / paper_c). Royal blue gives k ≈ (1.70, 1.09,
0.27): d = 0.4 renders a pale (125, 157, 212), d = 1 the swatch, and d = 1.8 a deep (12, 34, 145).
Blue-black gives k ≈ (1.95, 1.58, 1.08), and sepia gives k ≈ (0.79, 1.30, 2.47). This one change brings
in pooling, darker crossings (densities add) and a believable range of saturation. A flat fill with
`opacity` can't do this. Ballpoint ink is close to opaque, so model its variation mostly as coverage
(gaps and striations) rather than layer thickness.

**Colour is a writer trait plus a pen state.** Most people use one colour. Ageing (iron gall browning,
washable blue fading) is a page setting.

### 3.3 Pressure and density along a stroke (Rafael's second note)

Density varies at four scales:
- **Within a stroke:** downstrokes darker than upstrokes (pressure plus slowness), hairlines and
  connectors light. Fountain and felt pens pool at the start and the stop. Ballpoints fade on the
  lift-off tail.
- **Between strokes:** the first stroke after a pause is often wetter in a fountain pen and drier in a
  ballpoint. Delayed dots and bars are quick and light.
- **Across a line:** dip pens and brushes cycle from heavy to light between dips.
- **Across the stroke width:** pooled fountain ink dries darker at the edges (the coffee-ring effect:
  drying flow carries dye to the rim ([Wikipedia](https://en.wikipedia.org/wiki/Coffee_ring_effect))).
  Ballpoint ink gathers at the edges with white striations in the middle.

Targets (est.): down/up density ratio 1.2–1.6 for pointed and fountain pens, 1.1–1.3 for ballpoint.
Pools at stops and cusps 1.3–1.8× the stroke mean. Within-stroke density CV 8–20%.

**Rendering, cheapest first:**
1. **SVG only (exportable):** keep the ribbon at base density. Overlay **pool ellipses** (radial
   gradients, multiply) at slow points and stroke ends, and a narrower darker **core path** on
   downstrokes. Browsers can't draw a gradient along a path, so the other option is to cut the ribbon
   into quads every 0.03–0.05 xh with their own fills, overlapped slightly to hide seams.
2. **Canvas dab brush:** stamp soft discs at **equal time steps**, not equal distances. Slow sections
   get more dabs and darken without extra logic. Accumulate each stroke into a density buffer, convert
   to colour with Beer–Lambert, and add strokes in density so crossings darken.
3. **WebGL (best for the live view):** triangle strips with per-vertex density, speed and arc length.
   Accumulate density additively into a float buffer. A final pass adds edge rings, striations and grain,
   then applies Beer–Lambert colour.

### 3.4 Paper

Paper texture multiplies the ink, so grain shows through light strokes and is covered by heavy ones. Edge
roughness should depend on the pen: low for ballpoint and gel, higher for felt and fountain pens on cheap
paper. The current single `feTurbulence` roughening should scale per pen and move hairline edges by no
more than about 10% of the stroke width (est.). Robot-pen companies sell ballpoint **indentation**
([Simply Noted](https://simplynoted.com/)). A faint emboss on heavy downstrokes is an optional extra.

---

## 4. Page-level behaviour

### 4.1 Line spacing, line slope and margins (Rafael's third note)

He is right: **evenly spaced, parallel lines are a strong "computer" tell.** Graves points out the wide
variation in line angle in real online handwriting ([Graves 2013](https://arxiv.org/pdf/1308.0850)), and
line-segmentation research exists because real lines skew, curve, touch and vary in spacing
([arXiv 1708.05545](https://arxiv.org/abs/1708.05545)). I found no published distribution of line
spacing, so the numbers here are est.

**Plain paper:**
- **Each line has its own slope:** a writer habit (−1.5° to +2°) plus a per-line deviation (σ 0.5–1.2°).
  Consecutive slopes are correlated (ρ 0.5–0.8), because each line takes the one above as its guide.
- **Lines fan.** Because slopes differ, the gap between two lines differs at the left and right ends by
  5–15%.
- **Pitch varies.** Baseline-to-baseline distance is 2.2–3.2 xh as a writer trait, with a CV of 4–10%.
- **Lines bend:** a slight sag or arch (0.5–2% of line length), or a droop at the end as the hand
  reaches.
- **Collisions are avoided locally.** Where a descender would hit an ascender below, the lower line
  dips there or the descender shortens.

**Ruled paper** (wide 8.7 mm, college 7.1 mm, UK adult 8 mm ([Wikipedia](https://en.wikipedia.org/wiki/Ruled_paper));
French Seyès uses 8 mm main lines with 2 mm guides):
- Pitch is fixed, but **writing doesn't sit exactly on the rule.** Word baselines float 0–8% xh above
  it and sometimes dip below. Some writers float across a whole line.
- Descenders cross the rule below, and tall capitals may touch the rule above.
- Writers occasionally skip a line or squeeze one in.

**Margins:** writers drift inward down a page, so the left edge slopes toward the centre. The right
margin comes out "rounded", because writers overpack a line and then underfill the next few
([Eugene Wei](https://www.eugenewei.com/blog/tag/turingtest)). Handwrytten's robots deliberately vary the
left margin, line spacing, letter shapes and joins ([TechNewsWorld](https://www.technewsworld.com/?p=177010)).
Starting values (est.): per-line left-start σ 0.3–0.8% of line width; inward drift 0–0.5% per line, reset
per paragraph; paragraph indent σ 15–25% of the mean indent.

### 4.2 Line ends and spacing

- **Line ends:** writers either squeeze the last word or two (5–15% narrower, est.) or break early.
  Doing both at different times produces Wei's rounded margin.
- **Word spacing:** pauses between words are reliably longer than pauses within words
  ([KICSS 2025](https://arxiv.org/pdf/2512.20628)). Spatial gaps should be lognormal (word CV 15–30%,
  letter CV 10–20%, est.) and wider when the writer is faster.

### 4.3 Fatigue and care over a paragraph

In a preliminary study of 23 writers, fatigue most often caused **departure from the writing line**,
larger letters, longer ascenders and descenders, **wider letter and word spacing**, and **faster
writing**. Skilled fast writers barely changed ([IJFDE 1999, NCJRS](https://www.ncjrs.gov/App/Publications/abstract.aspx?ID=186084)).
Children in a 10-minute copy task lost speed and legibility, non-linearly
([HUJI](https://cris.huji.ac.il/en/publications/does-fatigue-influence-childrens-handwriting-performance/)).

Engine curve (est.): careful first lines, then over about 150 words size +2–8%, spacing +5–10%, speed
+5–15%, and slant and line variance ×1.3, all scaled by (1 − skill).

### 4.4 Delayed strokes, punctuation, capitals, numbers, signatures

- **i-dots and t-bars land late and to the right:** 0.1–0.6 xh right of the stem, more for fast writers,
  at varying height (est.). A bar can cross "tt" in one stroke and is sometimes skipped (1–3%). The dot
  shape is a habit: dot, dash, arc, tick or circle.
- **Punctuation habits are fixed per writer:** dot or dash periods, tailed commas, tick apostrophes, fast
  rising dashes.
- **Capitals** are slower, more deliberate, and more flourished at line starts. Liza gives line starts a
  calligraphic capital and words a proper ending ([Underware](https://gwern.net/doc/www/www.underware.nl/754c2ec289a0b66bf7805a92bb12d5456b40b9df.html)).
- **Numbers** are, in practitioners' accounts, more careful, more separate and more upright (not a
  measured result).
- **Signatures** are the fastest and most automated writing, and often the least legible
  ([AAFS 2012](https://www.aafs.org/sites/default/files/media/documents/AAFS-2012-J13.pdf)).

### 4.5 Corrections (optional)

Real samples contain scribbled-out letters and repeated words (Graves's IAM-OnDB examples). Options:
a fast, heavy, slightly rising strike-through; a scribble; an overwritten letter; a caret insertion.
Rate 0–1 per 100 words, off by default.

---

## 5. Allographs

- **Writers are consistent.** Identification from allograph distributions reached 99.2% on 120 French
  documents and 87% on 200 English texts ([Viard-Gaudin, Tan & Kot](https://www.iieta.org/journals/ts/paper/10.3166/ts.26.365-376)).
  Schomaker and Bulacu model a writer as a generator of a personal set of letter fragments
  ([TPAMI 2004](https://www.ai.rug.nl/~mbulacu/tpami2004-schomaker-bulacu.pdf)).
- **A believable mix (est.):** each letter has one dominant form (85–100% of uses). Only 3–6 letters per
  writer have a real second form, chosen by **context**, not coin flip:
  - **Position:** word-initial capitals and flourishes; word-final s, e, d, t, y (final s often
    shrinks to a tick).
  - **Neighbours:** high exits (b, o, v, w) change the next entry; doubles (ll, ss, tt, ff) often get a
    linked or reduced second form.
  - **Speed:** fast passages switch to simplified forms (a one-stroke r, an open o).
- **Never let identical shapes sit together.** LettError found three alternates per glyph solve most
  repeats, and Kosmik never sets the same shape twice in a row ([LettError](https://letterror.com/fonts/kosmik.html)).
  Nick Shinn notes true randomness would often double a glyph
  ([TypeDrawers](https://typedrawers.com/discussion/3448/random-glyph-variation-to-mimic-handwritten-font)).
  The live-engine version is a **minimum shape distance between nearby instances of a letter**.

---

## 6. The uncanny valley of fake handwriting

| Failure | Why it reads fake | Fix |
|---|---|---|
| **Identical repeats** ("coffee") | The eye catches same-shape pairs at once ([DesignRush](https://www.designrush.com/best-designs/logo/handwritten-fonts)) | Minimum distance between neighbours |
| **Uncorrelated per-letter jitter** | Each letter fights its neighbour, so words look shaky | Hierarchical, autocorrelated variation |
| **Noise at the wrong frequency** | High-frequency wobble reads as tremor. Kinross said Beowolf had "an excess of variation, and to no great effect" ([LettError](https://letterror.com/fonts/randomfonts.html)) | Vary at stroke, word and line scale, not point scale |
| **Perfect baselines, parallel lines** | Robots know exactly how much space each word takes ([Wei](https://www.eugenewei.com/blog/tag/turingtest)) | Line slope, fan, pitch noise, margin drift |
| **Uniform weight, flat colour** | Looks like printer ink. Robot firms sell visible ink variation and indentation ([Simply Noted](https://simplynoted.com/)) | Density field with Beer–Lambert colour |
| **Symmetric tapers** | Real starts (hooks, blobs) differ from real exits (flying tapers) | Asymmetric, motion-driven ends |
| **Mechanical joins** | Every connector has the same curve and height | Joins vary with speed, and some break |
| **Over-neatness** | Graves found a bias of about 0.15 balanced diversity and legibility ([Graves 2013](https://arxiv.org/pdf/1308.0850)) | One "care" scalar scaling all variance |

Robot-pen companies use real pens (Handwrytten uses a blue Pilot G2), vary shapes, spacing, margins and
joins, and offer 23–35 stock styles, with custom styles from about $1,000
([TechNewsWorld](https://www.technewsworld.com/?p=177010)). What still gives them away: one style across
many recipients, font-like letter structure, and the right margin.

---

## 7. Existing generative work worth studying

- **calligrapher.ai (Graves RNN):** an LSTM with mixture density outputs, trained on IAM-OnDB (221
  writers, about 25 points per letter). It gets **within-sample consistency** right: slant and size are
  picked early and kept. It models pen lifts and delayed strokes. Its legibility slider is the sampling
  bias ([Graves 2013](https://arxiv.org/pdf/1308.0850); [demo](https://www.cs.toronto.edu/~graves/handwriting.html);
  [TechSpot](https://www.techspot.com/community/topics/calligrapher-ai-is-using-ai-for-handwriting-generation.278888/)).
  It still garbles rare words. Lesson: set traits once per sample, and use one knob for variance.
- **Apple Smart Script:** re-renders strokes to look like your writing, only neater, and pastes typed
  text in your hand ([TechCrunch](https://techcrunch.com/2024/06/10/smart-script-in-ipados-18-will-clean-up-your-handwriting-when-using-an-apple-pencil);
  [MacStories](https://www.macstories.net/stories/ipados-18s-smart-script-a-promising-start-but-dont-toss-your-keyboard-out-yet/)).
  It gets identity-preserving cleanup right. Pasted text doesn't always match.
- **Google InkSight:** turns photos into pen trajectories. 87% were valid tracings and 67% looked like a
  human trajectory ([arXiv 2402.05804](https://arxiv.org/html/2402.05804v4)). A candidate tool for
  turning copybook scans or contributed samples into ordered skeletons.
- **perfect-freehand:** simulates pressure from point spacing (speed), with thinning, streamline and
  eased tapers ([GitHub](https://github.com/steveruizok/perfect-freehand)). Width from speed, but no ink
  model.
- **rough.js:** seeded bowing and double strokes ([roughjs.com](https://roughjs.com/)). One bow per
  stroke instead of point noise, which the engine already does.
- **Berio's Autograff:** sigma-lognormal graffiti and calligraphy with plausible kinematics
  ([Goldsmiths](https://research.gold.ac.uk/id/eprint/23409)). The best reference for rule 1.
- **Asemic and plotter sketches:** inconvergent kept 420 glyphs out of thousands
  ([inconvergent](https://inconvergent.net/2020/asemic-writing)). Others: a p5 flat nib
  ([onetwothree](https://onetwothree.net/portfolio/2022/asemic-writing)) and an RNN in p5
  ([otoro](https://blog.otoro.net/2017/01/01/recurrent-neural-network-artist)). Lessons: curate, and
  expect thick plotter pens to blob at slow points.
- **Tyler Hobbs:** no handwriting piece found. He combines plotter and hand, such as plotted outlines
  filled in charcoal ([Euronews](https://www.euronews.com/2023/03/23/how-generative-artist-tyler-hobbs-blurs-boundaries-between-machine-and-hand-made-art)).
- **AxiDraw / Hershey Text:** single-stroke plotter fonts that get realism from glyph substitution.
  Hershey Advanced's handwriting defects are discontinued ([EMS wiki](https://wiki.evilmadscientist.com/AxiDraw_Fonts)).
  Relevant to single-line export.
- **Font precedents:** Beowolf (six pre-randomised outlines), Kosmik (three flipping alternates) and
  Liza (about 200 ligatures, ink run-out, LetterSwapper, line-start and word-end forms). Liza is the best
  model of context-aware choice.

---

## 8. QA rubric for "human-ness"

### 8.1 Test texts

1. **Repeats:** `bookkeeper committee coffee balloon Mississippi assess llama little letters tttt`
2. **Same word ×10:** `the the the the the the the the the the`
3. **Long paragraph:** 150–200 words of prose, on plain paper and on college ruled paper.
4. **Numbers and prices:** `$1,249.99 · 07/11/2026 · 3 × 4 = 12 · 415-555-0132 · 98.6° · 1st, 2nd, 3rd · 7 ≠ 1`
5. **All caps:** `PLEASE HANDLE WITH CARE — FRAGILE — THIS SIDE UP`
6. **Punctuation:** `Wait — really? Yes! (Probably.) "Fine," she said; it's 5 o'clock…`
7. **Sign-off:** `Thanks so much for everything! See you soon, — Ottilie`
8. **Dots and bars:** `itinerary: titillating, jitter, quintet, fixity, Tutti-frutti`

### 8.2 Checklist (measured from stroke geometry, plus a visual pass)

| # | Check | Pass if |
|---|---|---|
| 1 | No identical neighbours (text 1) | Same-letter instances within 10 letters differ by RMS ≥ 2% xh after alignment, and by ≤ 12% xh |
| 2 | Correlated variation (text 2) | Adjacent-letter slant correlation r ≥ 0.4. Word-level size spread exceeds the spread within words |
| 3 | Baseline within a line | Letter-bottom residuals per word σ 1–3% xh. Word offsets autocorrelated (ρ ≥ 0.4) |
| 4 | Line geometry (text 3) | Line slopes not all equal (σ ≥ 0.3°). Pitch CV 3–10%. At least one line pair fans by ≥ 4% |
| 5 | Left margin | Line starts vary (σ ≥ 0.3% of width) and drift down the page |
| 6 | Right margin | Ragged, and no last word compressed by more than 15% |
| 7 | Ink density | Within-stroke CV 8–20%. Down/up ratio ≥ 1.15. Crossings darker than either stroke |
| 8 | Colour | 10th and 90th density percentiles differ in lightness and saturation (ΔE ≥ 10) |
| 9 | Stroke ends | ≤ 15% blunt full-width caps (excluding periods and stops). Starts differ from ends |
| 10 | Wobble spectrum | Under 10% of lateral deviation power at wavelengths below 0.3 xh (normal hands) |
| 11 | Delayed strokes (text 8) | Mean i-dot offset to the right. Offset σ > 0. Dot shape consistent per writer |
| 12 | Fatigue (text 3) | Last third vs first: size +2–8%, spacing +5–10% (writers with skill < 1) |
| 13 | Numbers and caps (texts 4–5) | Digits more upright and less varied than lowercase. Caps are not scaled lowercase |
| 14 | Animation (if on) | Speed dips at curvature peaks. Word pauses ≥ 2× letter pauses. Dots after the word |
| 15 | Seed coherence | Same seed, same writer across texts. Ten seeds, ten clearly different writers |

### 8.3 Blind comparisons

- **Material:** real samples of the same texts at the same size and in the same ink colour. Use the
  team's own handwriting, because most public datasets (IAM, for example) are research-only. Match the
  paper texture and resolution.
- **Two-alternative forced choice:** real versus generated side by side, "Which was written by a
  person?" Run 20 pairs per rater and at least 10 raters. **Target:** detection at or below 60% (50% is
  chance).
- **Odd one out:** four samples, three generated and one real, or the reverse. This catches repetition
  better than pairs do.
- **Squint test:** a 0.5× thumbnail shows uniform texture, and a 4× crop shows blunt ends and flat colour.
- **Model judge (optional, noisy):** ask a vision model "real or generated, and why?" Use the reasons
  to find tells, not as the score.

---

## 9. Prioritised engine rules

Cost: S = days, M = about a week, L = several weeks. Impact on realism: 1–5. Ranges are est. unless
cited above.

| # | Rule | Parameters | Cost | Impact |
|---|---|---|---|---|
| 1 | **Time axis per stroke.** Split at curvature peaks. v = K·κ^(−β), a bell dip at each split, K from isochrony. Integrate to time. | β 0.28–0.38; κ clamp [1/(2 xh), 1/(0.04 xh)]; dip 40–80%; K ∝ length^0.3–0.5 | M | 5 |
| 2 | **Hierarchical, correlated variation.** Writer → page → line → word → letter → stroke, using AR(1) or smooth noise along the text, not independent per-letter draws. | Slant: line σ 0.7°, word σ 1–1.5° (ρ 0.6–0.8), letter σ 1–2°. Size: word σ 3–5%, letter σ 2–4% | M | 5 |
| 3 | **Ink as a density field with Beer–Lambert colour.** Colour = paper·exp(−k·d). Densities add at crossings. Canvas or WebGL live, pools plus core path for SVG export. | k per ink (3.2); d 0.3–2.0 | M | 5 |
| 4 | **Pen-specific density along strokes.** Ballpoint: pressure as coverage with striations. Fountain: d ∝ (v̄/v)^γ, pools at stops, edge darkening. Pointed: darker downstroke swells. | Down/up 1.2–1.6 (ballpoint 1.1–1.3); pools 1.3–1.8×; γ 0.3–0.6; CV 8–20% | M | 5 |
| 5 | **Lines neither parallel nor evenly spaced.** Per-line slope (habit plus correlated noise), pitch noise, fan, slight bow, local dips at collisions. On ruled paper, words float off the rule. | Habit −1.5° to +2°; σ 0.5–1.2° (ρ 0.5–0.8); pitch 2.2–3.2 xh, CV 4–10%; bow 0.5–2%; float 0–8% xh | S | 5 |
| 6 | **Asymmetric, motion-driven ends.** Small arrival hook or blob at starts. Flying taper along the exit. Blunt only at real stops. | Hook 0.03–0.08 xh on 20–60% of starts; exit taper 0.15–0.5 xh; blunt ≤ 15% | S | 4 |
| 7 | **Delayed strokes written late.** Dots, bars and crosses after the word, offset right, varied height and shape. | +0.1–0.6 xh, σ 0.1 xh; height ±0.15 xh; skip 0–3%; one bar for "tt" | S | 4 |
| 8 | **No high-frequency wobble.** Long-wavelength drift only, scaled by slowness. The "shaky" preset uses regular tremor. | Wavelength ≥ 0.5 xh; amplitude 0.3–1.2% xh; preset 0.5–2% xh | S | 4 |
| 9 | **Allograph repertoire per writer.** One dominant form per letter. 3–6 letters with a second form chosen by context. Minimum distance between nearby same letters. | Dominant 85–100%; min RMS 2% xh within 10 letters | M | 4 |
| 10 | **Mixed joins and lifts.** Join probability per pair from exit and entry heights and speed. Restart after a lift with a small gap or overlap. | Script breaks 10–30% of joins; print joins 5–25%; gap −0.05 to +0.1 xh | M–L | 4 |
| 11 | **Margin drift and line-end planning.** Left start drifts inward, resets per paragraph. Ragged ends with occasional squeezing. | Left σ 0.3–0.8% of width, drift 0–0.5%/line; squeeze ≤ 15% | S–M | 4 |
| 12 | **Baseline within a line.** Word offsets as an AR process, a small letter bob, slight sag or rise at the end. | Word σ 2–4% xh (ρ 0.5); letter σ 1–2% xh | S | 4 |
| 13 | **Spacing rhythm.** Lognormal gaps, wider when faster and after punctuation. | Word CV 15–30%; letter CV 10–20% | S | 3 |
| 14 | **Fatigue and care arc.** Careful first lines, then drift in size, spacing, speed and variance, scaled by (1 − skill). | Over ~150 words: size +2–8%, spacing +5–10%, speed +5–15%, variance ×1.3 | S | 3 |
| 15 | **Stable proportions, floating size.** Lock ratios per writer and vary absolute size per word. | Ratio σ 2–4%; size σ 3–6% | S | 3 |
| 16 | **One "care" scalar** (like Graves's bias) scaling all variance together. Neatness = care. | Default about bias 0.15; variance ×0.5–1.5 | S | 3 |
| 17 | **Modes for caps, digits and signatures.** Caps slower and flourished at line starts. Digits separate, upright, less varied. Signatures fastest and most stylised. | Digit slant ×0.5–0.8, variance ×0.6; caps speed ×0.8; signature ×1.3 | M | 3 |
| 18 | **Pen defects.** Ballpoint goops and skips (more at session start), flex railroading, dip run-out, felt bleed, pencil grain. | Goop 3–8% of cusps; skips 0.05–0.2 xh; run-out every 3–8 letters (dip); bleed 0.5–2% xh | M | 3 |
| 19 | **Realistic ink presets and ageing.** Violet-leaning ballpoint blue, bright royal blue, slate blue-black, iron gall darkening then browning, sepia. Never pure #000. | Swatches in 3.2; ageing 0–1 | S | 3 |
| 20 | **Paper interaction per pen.** Grain shows through light ink only. Edge roughening scaled per pen, capped on hairlines. Optional emboss. | Edge displacement ≤ 10% of width; grain contrast 3–8% | S | 2 |
| 21 | **Stroke order, direction, handedness.** Conventional order, counterclockwise ovals, layered crossings. Left-handed option with right-to-left bars and more backhand. | Left-hander: 40–80% right-to-left bars; slant −10° to +5° | S–M | 2 (4 animated) |
| 22 | **Animation timing from the time axis.** Stroke speeds, pen-up gaps, word pauses, delayed strokes last. | Stroke ~100 ms; pen-up 50–150 ms; word pause 150–400 ms | S | 5 (animated) |
| 23 | **Legibility guard.** Bound total per-use deformation and check against the rubric. | Warp RMS ≤ 6% xh; slant within ±8° of the writer mean | S | 3 |
| 24 | **Punctuation habits per writer.** | 2–3 fixed habits per seed | S | 2 |
| 25 | **Corrections (optional).** Strike-throughs, scribbles, overwrites, carets. | 0–1 per 100 words, off by default | M | 2 |

**Suggested order:** 1 → 3 → 4 (time plus ink fixes the "colour and pressure" note) → 5, 11, 12 (fixes
"too evenly spaced") → 2 → 6, 7, 8 → 9, 10 → the rest.
