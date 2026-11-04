# The Fonts page, redesigned: how leading foundries present type, and what that means for live handwriting

_Research and reasoning for the new Fonts page, 3 November 2026. It became the page at `/fonts` the same day (Rafael:
"I like this new fonts page a lot better"); `?fonts=old` shows the earlier one for now._

Rafael on the current page: "looks like an old fonts page from like 2010s. I can't tell where to look. The hierarchy
is completely messed up. I don't like the way that we're using this font right now… the fonts page is probably the
worst page."

_Method:_ 16 sites, each opened in headless Chromium at 1440 and 390 px. For each one we took screenshots, read the
computed type sizes, tried hover states, testers, filters and dark modes, and checked the phone layout. None of the
work signed in, bought, accepted a cookie banner or downloaded anything. Two sites were studied through the Wayback
Machine: Colophon (its own site closed in March 2025) and Velvetyne (on strike, every page redirects to `/greve/`).
Rafael's Trove library was searched for foundries, specimens and handwriting presentation. The private review page
holds the screenshots.

| Group | Sites |
| --- | --- |
| Display foundries | Klim, Grilli Type, ABC Dinamo, Lineto |
| Text and retail foundries | Commercial Type, Production Type, Sharp Type, Colophon (archived) |
| Independent, trial-led | Pangram Pangram, Displaay, OH no Type, Fontwerk |
| Free, open and large catalogues | Fontshare, Google Fonts (Handwriting), Future Fonts, Velvetyne (archived) |

---

## What the earlier page got wrong

- **Nothing leads.** The first screen is a hand-drawn "Fonts" heading, a sentence, a rail of about 40 boxed chips and,
  far right, rows whose writing hasn't arrived yet. The specimens are 60 px. No single thing is clearly first.
- **Too many voices at one size.** Writers' names, the words about each hand, the rail's labels and the tester all sit
  at 13–15 px. Small capitals in the serif face are used for labels, tags and the tester, so the controls read as
  archival text.
- **The controls compete with the type.** The filters, as a permanent rail of boxed chips, take a third of the width
  and the most ink on the page.

---

## What the sites do

### 1. The specimen is the only big thing
Every site shows its type far bigger than anything else: 40–320 px against interface text of 11–21 px. Each uses one
interface face (Söhne, GT America, Styrene, Enduro, Neue Montreal, Google Sans) at two to four sizes, mostly regular
weight, mostly sentence case. There are almost no headings in between. That gap is what makes the first thing to look
at obvious.
- Klim: interface 16 px, specimen words 217 px. Production Type: 13 px buttons, 128 px specimens. Commercial Type:
  14.6 / 20.9 px interface, specimens 84–117 px. Fontshare: 12–16 px labels, 120 px names. Google Fonts: 14 / 16 px
  labels, 40 px rows.

### 2. One control surface, and one field that rewrites every row
Dinamo's "WRITE HERE…", Commercial's "Type it…", Fontwerk's "Enter your own text", Fontshare's "Your Text" and
Google's "Type something" each rewrite the whole list. The field sits in a sticky bar (Commercial, Fontwerk,
Displaay, Fontshare), the filter bar (Production) or a floating dock (Colophon). Finer tools (size, style, tracking)
only appear on hover (Production, Fontshare, Dinamo) or on the family page. On phones the controls fold into one
surface: Fontshare's full-screen sheet ending in "Show Results (100)", Google's "Filters 1" drawer, Colophon's dock.

### 3. Quiet rows, one loud action
In lists, actions are icons or small words (Production's stacked "Add to cart · Download trial", Velvetyne's
"Download", Commercial's icons). Each family page has exactly one filled, coloured action in one fixed place: Klim's
red "Buy fonts", Grilli's pinned "Purchase", Pangram's red "Buy Now", Google's blue "Get font". The price or promise
is said once, beside it ("Free to try / Licenses start at $40"). The free sites state the licence as a plain line of
metadata ("SIL Open Font License"), never a banner.

### 4. Filters are few, and spelled out when on
Most foundries have none or almost none: Lineto has two three-option pill switches; Klim, Grilli and OH no have none.
The large catalogues have many, kept in a sheet or a drawer, and say what's on beside the count ("286 of 1,959
families · Calligraphy — Handwritten ×", Future Fonts' "Script/Brush × · Clear All · 34 Fonts"). Google sets its
"Handwritten" filter chip in a handwriting font.

### 5. Text has a voice, and can be reshuffled
Klim's specimen words change on every visit; Grilli has "New samples"; Velvetyne and Future Fonts offer "shuffle" and
`sort=random`; Lineto gives each family a tagline. Long lists are one continuous scroll; only the paid marketplace
paginates.

### 6. Motion is small, except where the type itself moves
Interface transitions are 0.1–0.3 s colour or shadow fades. The bigger motion belongs to the type: Production's
hero draws its outlines point by point; Lineto's cards animate their weight on hover; Fontwerk's specimens jump to
their heaviest weight under the pointer; Grilli swaps a row's phrase for its range.

### 7. Dark is a choice
15 of the 16 sites ignore the system's dark setting. Dark appears as the brand's own ground (Klim, Lineto), a manual
toggle (Production, Fontshare, Lineto's ◐, Displaay's tester moon), or both (Google, the only one that also follows the
system).

### 8. Phones keep the specimens and drop the facts
One column, specimens at 40–60 px, metadata cut to a line, the controls in one surface. Klim's phone tester drops to
style, size and reset.

### From Rafael's Trove
- Future Fonts' **Tagada** (Laurent Muller) and Roxane Gataud's **Kleise**: calligraphic specimens shown large, on
  plain ground, with nothing around them.
- A **broad-nib lettering manual page** with construction guides: the stroke logic shown beside the letter.
- **Type layouts annotated with their own metrics**: density from exposing the font's data, not decoration.
- An **exhibition poster whose roman/italic alternation carries all the hierarchy**: two voices are enough.
- A **museum archive where the images stay still and only the labels and colour blocks slide**: restraint in motion.

---

## Principles for presenting live-generated handwriting fonts

1. **The writing is the only big thing.** A hand at poster size first, then rows at the tester's size (28–120 px).
   Everything else is small: one sans (`--rr-ui`; Schibsted Grotesk since 4 Nov, Source Sans 3 when this was written)
   for controls and labels at 13–15 px in sentence case, and the archive's serif (`--rr-book`; Newsreader, then
   Junicode 2) only for names, the page title and the letter's credit. No small capitals.
2. **Open on one hand.** The first thing on the page is a single hand writing a real letter's opening across the full
   width, with its writer's name and one action. That is the "where to look", and it reminds you where these hands come
   from.
3. **One control surface, one field for every hand.** Your words rewrite every hand at once. On wide screens the tester
   is one ruled line that stays under the header (Joined or print, Filters, the line and your words, size, list or
   grid, saved, New set); on phones and tablets it's the floating dock and its sheets. Never both.
4. **Quiet rows, one loud action.** A row is the writing, the writer's name and a few plain words, with three quiet
   actions. The only filled button on the page is the hero's red "Download font", with the promise said once beside it
   ("Free and open source · .otf and .ttf · SIL Open Font License"), where a foundry puts its price.
5. **Show it being written.** Handwriting's own motion is writing, so that's the motion: a line arrives written left to
   right at a writing pace (the hero more slowly); under a resting pointer a row writes its line again over a faint
   trace of itself, so it never vanishes. Every other change takes 150 ms or less. With reduced motion, lines simply
   appear.
6. **The catalogue is endless, so shuffle, don't paginate.** "New set" (or Space) draws another 24; "Show 24 more"
   continues the same set; a set is a link. Nothing pretends to be a finite list.
7. **What you see is what you download.** Every line is set in the hand's real generated font, never a fallback. Until a
   font can set new words, the line keeps the last words it could. The live hand, which varies more, sits in the
   hand's record with a plain note on the difference.
8. **The text has a voice.** By default every hand writes the opening of a real letter from the library, credited
   ("From a letter by Elizabeth Watson, 1823. Read the letter"), so browsing fonts is also a way into the letters.
9. **Say what's chosen.** When filters are on, the count and the choices are spelled out above the list, with
   "Clear filters". When none are on, nothing is said.
10. **Dark is a choice, made from the same room.** A Light/Dark control (and `?theme=dark`), never automatic. The night
    room is the Reading Room's own tokens re-valued (warm blue-black ground, paper-white ink, a lighter archival red), so
    every control, rule and wash follows.

---

## What makes the balance work: old and new on one page

Rafael, on the new page: "we're clearly having a lot of different older techniques and styles, but something about
this modern grid just kind of balances everything really well. That's the type of balance that we should try to
maintain everywhere." These are the moves behind it, with the values, so other pages can use the same ones.

1. **A modern frame around old material.** The structure is a current foundry's: full width (no 1440 cap) inside the
   header's own margins (16 / 32 / 40 px at phone / tablet / desktop), a sticky tester line, a register whose columns
   never move (name 15rem | writing | actions), a grid of equal cards (min 24rem, 2.5rem gaps). What fills it is
   archival: a real letter's opening, its credit, a writer's name in the book face. Keep the frame strict so the old
   material can be as old as it likes.
2. **Three sizes of voice, far apart.** The handwriting is 64–150 px, the book face 18–44 px, the sans 13–15 px. Nothing
   sits between the tiers, so the eye always knows what's first. The specimen is at least five times the interface
   text, as on every foundry site we studied. Old faces look intended, not dusty, when everything around them is
   small, crisp and calm.
3. **Each face has one job.** The book face (`--rr-book`, today Newsreader) is only for what belongs to the archive: the
   page title, writers' names, the intro, the letter's credit (italic). The sans (`--rr-ui`, today Schibsted Grotesk) is
   for everything you operate or scan: controls, labels, the few words about a hand, buttons, counts. Sentence case, no
   small capitals in the interface, no face named outside the tokens. The two never share a line.
4. **Soft rules, no boxes.** Rows are divided by hairlines at 12–16% ink (`--rr-rule`, `--rr-hair`; the hand-drawn
   rules sit on them unchanged), never by cards or fills. Only things that float over the page get an edge or a shadow
   (popovers, the dock, sheets). The room's grey is the one ground; the paper is the letters'.
5. **One colour, one job.** Archival red (`--rr-red`) is for the main action and nothing else: the one filled button
   (Download font), the red words of New set, a count. Everything else is ink and two greys (`--rr-muted`,
   `--rr-faint`). At night the same roles are re-valued (a lighter red, paper-white ink), never re-assigned.
6. **Rhythm from repetition.** Every row has the same height, padding and column edges, so the list reads like a
   ledger: about 128 px a row for 64 px writing, 1.125rem above and below, the actions in the same place on every line.
   Air goes where the hierarchy changes (above the first hand, before the tester line), not between equals.
7. **Modern behaviour, kept quiet; old motion, given room.** Hover is the faint ink wash (`--st-hover`), press the
   deeper one with a slight scale (`--st-press`, `--st-scale-row` 0.985), 150 ms or less, never an underline. The one
   expressive motion is the old medium's own: the pen writing each line in, left to right, at a writing pace (0.9 s a
   row, 1.6 s for the first hand). Reduced motion keeps the writing and drops the movement.
8. **Plain words for the controls, the archive's voice for the content.** Controls say what happens ("Download font",
   "Write with it", "New set", "Clear filters") with 44 px targets and the hand cursor. The content keeps its own
   register: "From a letter by Elizabeth Watson, 1823."

## How the new page applies them

- **Order** (faces as built on 3 Nov; the page now reads them from the tokens): header → "Fonts" and its one sentence
  (Junicode 44 px; light/dark at the right) → the hero hand (88–150 px
  wide screens, 2 lines; 44–56 px phones, 3 lines) → a soft rule and the caption (name in Junicode 28 px; "Print ·
  Québec school · ballpoint · Field journal" in Source Sans; the letter's credit in Junicode italic; Download font, Write
  with it, Save) → the tester line (sticky) → the rest of the set.
- **Rows:** on wide lists, a register: the name and a few words on the left (15rem), the writing (64 px by default, one
  line fading at the right), and the actions (icons only when the list is narrower than 76rem). On phones and in the
  grid: the writing first, then the name and icons. The whole row opens the hand's record; under the pointer it takes
  the faint wash, pressed the press wash, never an underline.
- **Grid** (`?grid=1`, or the toolbar's list/grid control): cards of three lines, about 24rem wide.
- **Width:** no 1440 cap; the writing may run to 1920 with the header's own margins (16 / 32 / 40 px).
- **Shared pieces only:** SiteHeader, Sheet and ActionSheet, Segmented, Slider, Button, Tooltip, the dock, the filter
  groups and the record. Colours, rules and states come from the `--rr-*` and `--st-*` tokens.
- **Speed:** the page is in the main file (1.4 KB more script and 3.5 KB more styles, compressed, than the earlier
  page); the earlier page loads as its own file only for `?fonts=old`. The store and workers are unchanged; the hero
  is the first font built.

## Switches

- The redesign is the page at `/fonts`; `?fonts=old` shows the earlier page for now (kept for the tab), `?fonts=new`
  comes back.
- `?theme=dark`, or the page's sun/moon control, gives the night room.
- `?grid=1` shows cards instead of the list.

## Not done, or for later

- **Filter chips set in handwriting** (Google's idea): a "Joined" chip written joined. It needs a tiny font per chip.
- **Range on hover** (Grilli): a row could show the hand's alphabet or joins under the pointer.
- **Compare pinned hands** (Commercial's "Test pinned"): saved hands side by side with your words.
- Some hands write as black blots at large sizes (Sütterlin with an italic nib, e.g. set k7f2q, row 2). The live hand
  draws the same, so it comes from the engine, not the page or the font; it's with the pens and ink session.
