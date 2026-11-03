# Filters: what a visitor can sift the hands by

The Fonts view shows 20–30 generated hands at a time and regenerates the set when a filter changes. This page lists
every quality of a hand that is worth filtering on, what the engine calls it, its range, whether a filter on it is
**hard** (never broken) or **soft** (nudged into range when the search comes up short), and what it moves with.
`sampleLooks()` (engine/sampler.js) implements all of it; `LOOK_FILTERS` is the same list in code.

Measured on 800 hands (400 print, 400 joined, Neat only on, natural values). "p5–p95" is where 90% of hands fall.
The engine's slider ranges are wider, so a filter can ask for values only a slider would give. sampleLooks then
nudges a near miss into range and says so.

## The set, in one call

```js
import { sampleLooks, LOOK_FILTERS } from '@engine';
const set = sampleLooks('fonts-7', 24, { family: 'script', slant: [15, null], loops: [0.3, null] });
// set.looks[i]: lookOf's shape (seed, family, style, archetype, schooling, traditions, pen, tip, ink, paper, size,
//   params, legibility) + distance, matches, nudged { key: [natural, shown] }, misses [keys]
// set.matched: how many met every filter as the seed is; set.note: plain words when the filters were too tight
// draw one: withOverrides(makeHand(look.seed, { style: look.style }, { neatOnly }), look.params)
// look.about: what a row can say without drawing: { tradition: 'Business 1915', era, region, movement (joined only),
//   character: ['careful', 'elegant'], lean (visible °), width (n in x-heights), laterLearned: { style, schooling, label } }

// the Fonts page's shape of the same call (pages of one set: offset 0, 24, 48...)
sampleSet({ setSeed: 'fonts-7', count: 24, offset: 0, filters: { family: 'script' }, neatOnly: true })
// -> { looks, exhausted (fewer than count met every filter), note, matched }
```

- **Deterministic.** The same set seed, n, filters and options give the same set. A "Shuffle" button passes a new set
  seed. "Load more" passes `{ shown: looksOnScreen }`, and the next set keeps away from those hands and never
  repeats one.
- **Diverse.** About 3n hands that meet every filter go into a pool. The set is picked by farthest point: each pick is
  the hand farthest (lookDistance: letter forms, slant, size, width, weight, movement, pen, ink, paper) from those
  already picked. Unfiltered sets of 16–24 have a nearest-neighbour distance of about 1.4–1.7, where 1 already reads
  as a clearly different writer. Very wild hands (over the chaos budget) come last.
- **Fast enough to run on every filter change.** 24 hands take 0.2–0.4 s on a laptop in Node, and tight filters
  stay under about 0.9 s. Run it in the worker.
- **Graceful when too tight.** A choice filter (print or joined, tradition, era, schooling, kind of writer,
  movement, pen, tip, ink, paper) is never broken. When ranges leave fewer than n hands within the search budget,
  the set is topped up with the closest misses. Their slider-like values are nudged a little inside the range
  (`look.nudged`), and what still misses is listed (`look.misses`, usually legibility, which can only be measured).
  `set.note` says it in words, for example: "9 of 24 hands meet every filter. The other 15 are the closest we found,
  adjusted for slant, loops." A tradition and a family that can't go together (Palmer + print) return no hands and a
  note.
- **Print and joined-only qualities.** Loops, lead-ins, end flicks, swash capitals and pen lifts don't apply to print
  hands. For filtering, print counts as "none" (no loops, no lead-ins, plain capitals) and "always lifts". So "no
  loops" includes print hands, and "loopy" means joined hands. A join-length filter means joined hands only.

## The dimensions

Hard = never broken. Soft = nudged into range when the filters are too tight. Specimen = a property of how the
hand is shown (pen, ink, paper, size), not of the writer.

### Who the writer is

| Filter | Plain label | Engine | Values | Kind | Moves with |
|---|---|---|---|---|---|
| `family` | Print or joined | `hand.family` | `print`, `script` (joined) | hard | Everything: every letter is built differently. Joined-only qualities follow from it. |
| `style` | Tradition | `hand.style` | 13 traditions (below) | hard | Fixes family, era, built-in slant and letter forms. Pinning one picks from it evenly; otherwise each seed keeps its natural tradition. |
| `historical` | Include historical hands | `isHistorical(style)` | false (default) / true | hard | Kurrent 1849 and Dutch 1618 are illegible to most visitors, so a random set leaves them out. Named in `style`, they come up, and their legibility isn't marked down for being historical, so Neat only still finds tidy ones (0.82–1.0). |
| `era` | Taught | `tradition.era` → bucket | `early` (before 1750), `c19`, `c20a` (1900–49), `c20b` (1950–99), `now` | hard | Derived from the tradition: early = Arrighi, Dutch; c19 = Spencerian, Norwegian, Kurrent, Spanish; c20a = Palmer, Sütterlin, Polish; c20b = Hershey print and script; now = Québec 2024, French 2023. |
| `schooling` | Schooling | `hand.schooling` | continental, american, british, french, italic, polish, latin-american, adult-print | hard | Drawn per seed and tradition. It shapes letter habits (allographs), paper and movement. The share in a random set runs from american/adult-print (about 25% each) down to polish (3%). |
| `blend` | Mixed schooling | `hand.blend` (and `hand.traditions[1]`) | 0–1 (median 0.2; about 45% are 0) | soft | Independent of the rest. The second school is `hand.traditions[1].style` / `.schooling`. Filtering by *which* second school isn't in sampleLooks yet. |
| `archetype` | Kind of writer | `archetypeOf(seed)` | friend, thanks, architect, field, whiteboard, margin, postcard, recipe, first, italic, signature, backhand | hard | Correlated by design with pen, paper, size, neatness, slant (backhand leans left, signature is fast). The cheapest filter: it is known from the seed alone. |
| `character` | Character (one word) | `characterOf(hand, look)` | careful, everyday, hurried, elegant, schoolroom, childlike, technical, cramped, airy, angular | hard | A hand can carry several words. Rules below. Each word covers 4–33% of hands. |
| `later` | Later learned | `hand.traditions[1].style` or `.schooling` (needs blend > 0) | a tradition or schooling id | hard | Only mixed hands (about 55%) have one. Rare pairs are slow to find (about 1.4 s for Palmer). |
| `movement` | Movement | `movementOf(hand).id` (style-dims) | copperplate, business, round, schoolroom, italic, printscript, angular, scrawl, cramped, airy | hard | A cluster that sets the ten movement dimensions below together. Most meaningful for joined hands; for print only angularity, loop height, bowls and rhythm show. |

Traditions (`style`): Print and Script (Hershey, 1967), Business 1915 (Palmer), German school 1917 (Sütterlin),
Chancery 1524 (Arrighi), Print 2024 (Québec), Spencerian 1866, Norwegian school 1849, Polish school 1906, Spanish
bastarda 1776, Everyday French 2023, plus historical Kurrent 1849 and Dutch running hand 1618. A random set leans
on print (about a third each for Hershey, Québec and French) and spreads joined hands across the eight joined
traditions.

### How readable and how careful

| Filter | Plain label | Engine | Range (p5–p95) | Kind | Moves with |
|---|---|---|---|---|---|
| `neatOnly` | Neat hands only | `makeHand(.., { neatOnly })`, `legibility ≥ NEAT_MIN` (0.77) | on (default) / off | soft | On also tidies the hand (slant, pen, spacing, hurry, movement kept off extremes; confusable capitals swapped). |
| `legibility` | Readable at a glance | `legibility(hand)` | 0–1. Neat on: print 0.96–1.00, joined 0.83–1.00. Neat off: down to 0. | soft (measured only) | neatness +0.69, mistakes −0.64, hurry −0.36 (print); slant −0.33 (joined). Can't be nudged directly. |
| `neatness` | Neatness | `hand.neatness` | 0.44–0.89 | soft | mistakes −0.85, hurry −0.55, size −0.33 (bigger writers are looser), fatigue −0.31. |
| `hurry` | Hurry | `hand.hurry` | 0.14–0.75 | soft | mistakes +0.77, rhythm +0.4–0.5, spacing +0.33, width +0.30. |
| `mistakes` | Mistakes | `hand.mistakes` (Journey) | 0.12–0.46 | soft | Almost a function of neatness and hurry (r ≈ −0.85 / +0.77): a separate filter adds little. |
| `tremor` | Shaky | `hand.tremor` | 0.6–2.0 (tidy caps it at 2) | soft | Independent. Barely visible below about 1.5. |

### Shape and proportion

| Filter | Plain label | Engine | Range (p5–p95) | Kind | Moves with |
|---|---|---|---|---|---|
| `slant` | Slant | `builtInSlant(style) + hand.slant` (visible degrees from upright, + = right) | print −8…17°, joined −6…28° | soft | Mostly independent. The tradition sets the centre (Palmer about 22°, Spencerian and Norwegian steep, Sütterlin and French upright). Backhand writers lean left. |
| `xHeight` | X-height | `hand.xHeight` (share of capital height) | 0.47–0.74 | soft | width −0.44…−0.52, spacing −0.33, weight −0.36 (joined). Small-x-height hands look taller, narrower and lighter. |
| `width` | Width | measured: advance of `n` ÷ x-height (`hand.width` and `bowls` drive it) | print 0.68–1.40, joined 0.64–1.91 | soft | spacing +0.51 (print), xHeight −0.4…−0.5, joinLength +0.34 (joined). |
| `spacing` | Letter spacing | `hand.sidebearing` ÷ x-height | 0.05–0.18 | soft | width +0.51, xHeight −0.33, hurry +0.33. Word spacing isn't a filter: Neat only keeps words apart. |
| `bowls` | Round or compressed | `hand.bowls` (style-dims) | −0.7…0.7 | soft | angularity −0.33…−0.60: round hands are rarely pointed. |
| `angularity` | Pointed turns | `hand.angularity` | −0.96…0.55 | soft | bowls −0.6, rhythm +0.5, loops and lead-ins −0.56 (joined). |
| `rhythm` | Rhythm | `hand.rhythm` (follows hurry) | −0.6…0.6 | soft | hurry +0.4…+0.5, joinLength +0.58, angularity +0.50. |

### Weight and pen

| Filter | Plain label | Engine | Range (p5–p95) | Kind | Moves with |
|---|---|---|---|---|---|
| `weight` | Weight | `hand.penWidth` ÷ x-height | 0.09–0.16 (tidy caps it at 0.16) | soft | xHeight −0.36 (joined). Visible weight also depends on pen, tip and display size. |
| `pressure` | Pressure | `hand.pressure` | 0.06–0.88 | soft | Independent. Shows as thick-thin contrast with fountain, pointed and italic pens; barely at all with ballpoint or gel. |
| `pen` | Pen | `look.pen` | ballpoint, gel, fountain, pointed, italic, felt, pencil | hard, specimen | Chosen to suit the writer (archetype, schooling, era). A list draws one evenly per hand. For a type person, pen is the contrast filter: pointed, italic and fountain give contrast; ballpoint, gel, felt and pencil are monoline. |
| `tip` | Tip | `look.tip` | fine, medium, bold | hard, specimen | Follows the pen. |

### Movement (joined hands)

All are `hand.<key>` from style-dims, −1…1 (lifts 0…1). For print: loops, lead-ins, end flicks and capitals count
as −1, lifts as 1, and a join-length filter excludes print.

| Filter | Plain label | Joined p5–p95 | Moves with |
|---|---|---|---|
| `loops` | Loops | −1.0…0.6 | lead-ins +0.82, capitals +0.77, lifts −0.70, loop height +0.61. One "loopy, flourished, fully joined" axis: copperplate at one end, print-script at the other. |
| `leadIns` | Lead-ins | −1.0…0.5 | loops +0.82, capitals +0.80, lifts −0.77 |
| `endFlicks` | End flicks | −0.64…0.6 | lifts −0.49, capitals +0.45. Fairly independent. |
| `flourish` | Capitals (plain or swash) | −1.0…0.4 | lead-ins +0.80, loops +0.77, lifts −0.71 |
| `lifts` | Pen lifts (connectedness) | 0…0.82 | loops, lead-ins and capitals −0.7…−0.77. The "connectedness" filter: 0 = always joined, about 0.4 = semi-joined (italic), 0.8+ = print-script. A lifts filter never asks for more than 0.85: near 1, the retraced ascenders of Palmer's h, l, k and b come apart. |
| `joinLength` | Join length | −0.71…0.6 | rhythm +0.58, width +0.34 |
| `loopHeight` | Loop height (ascenders against x-height) | −0.69…0.6 | loops +0.61, capitals +0.53 |

Because loops, lead-ins, capitals and lifts move together (|r| 0.7–0.8), a visitor-facing UI could merge them into one
"Plain ↔ Flourished" slider (or offer the `movement` kinds) and keep end flicks, join length and loop height as
refinements. Filtering on two of them in opposite directions (loopy *and* no lead-ins) is possible but rare. Expect
a note.

### The page and the ink (specimen only)

| Filter | Plain label | Engine | Values | Kind | Notes |
|---|---|---|---|---|---|
| `ink` | Ink | `look.ink` | ballpoint-blue, royal-blue, blue-black, iron-gall, sepia, black, red, green, graphite | hard | Only inks that suit the pen come up (graphite only in pencil). |
| `paper` | Paper | `look.paper` | the app's 19 paper ids | hard | Correlated with schooling, era, archetype and pen. A Fonts view may prefer to show all hands on one plain paper. |
| `size` | Size | `look.size` (x-height, mm) | 2.3–6.1 | hard (clamped) | xHeight +0.47, neatness −0.33. Whiteboard and first-letters writers are large. |
| `inkAge`, `inkVariation` | Ink age, ink variation | `look.inkAge`, `look.inkVariation` | 0–1 | hard (clamped) | Recipe cards and iron-gall or sepia inks come up aged. |
| `lineWander`, `fatigue` | Line wander, tires over a page | `hand.lineWander`, `hand.fatigue` | 0.6–1.25, 0.75–1.25 | soft | Only visible over several lines. A one-line specimen won't show them. |

## Character words

One word a visitor can pick a hand by (`CHARACTER`, `characterOf`). Rules come from the Fonts view research, with
edges set from the measured ranges. "Lean" is visible slant; "width" is n in x-heights.

| Word | A hand is it when | Print / joined share |
|---|---|---|
| Careful | neatness ≥ 0.72 and hurry ≤ 0.45 | 24% / 26% |
| Everyday | kind of writer: letter to a friend, postcard, recipe card | 31% / 31% |
| Hurried | hurry ≥ 0.68; or joined fast scrawl; or hurry ≥ 0.55 for margin notes, signature, field journal | 27% / 32% |
| Elegant | joined copperplate or business movement; or thank-you card, italic hand | 14% / 33% |
| Schoolroom | joined: schoolroom or round movement. Print: careful and within 6° of upright | 11% / 27% |
| Childlike | first letters | 4% / 4% |
| Technical | architect's notes | 10% / 10% |
| Cramped | joined cramped movement, or n narrower than 0.80 (print) / 0.82 (joined) x-heights | 13% / 27% |
| Airy | joined airy movement, or n wider than 1.3 (print) / 1.5 (joined) x-heights | 11% / 24% |
| Angular | joined angular movement, or pointed turns ≥ 0.45 | 16% / 24% |

## Not filters (yet), and why

- **Making** a hand learn a given second school (a makeHand option): `later` filters on the second school a hand
  already has; forcing one is engine work for later.
- **A census** (per-option counts, "about N writers match", greying out impossible options): not built. Impossible
  choice combinations return at once with a note, and searches that can't fill the set stop after about 300 tries.
- **Region and language** (`tradition.region`, `.language`): today these follow the tradition one to one, so the
  tradition filter covers them. Worth adding when several traditions share a region.
- **Letter forms people notice** (single- or double-storey a and g, crossed 7, open 4, looped f): `describeHabits(p)`
  has them per hand. A "single-storey a" filter is possible, but every tradition mixes forms, so most sets would be
  near-even. Better shown on the specimen than filtered.
- **Nib angle, roundness, quirk, tapers, dot height and size, drift**: real engine parameters that read as texture
  rather than character. They vary within a set and are counted in the diversity measure.
- **Word spacing**: Neat only keeps it readable. A filter would rarely change the set.

## Independence in one paragraph

Three groups move together: carefulness (neatness, hurry, mistakes, legibility), flourish (loops, lead-ins, swash
capitals, fewer pen lifts, taller loops) and proportion (small x-height ↔ wide, loose and light). Slant, pressure,
tremor, end flicks, blend and the specimen choices are close to independent. Filters within one group reinforce each
other (neat + unhurried is easy). Filters that pull a group apart (neat + many mistakes) are where sampleLooks has
to nudge, and its note says so.
