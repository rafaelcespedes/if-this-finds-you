# Decisions log

Rafael's calls, newest first. Builders follow these. If one conflicts with a research recommendation, this log wins.

## 2026-11-07

- **The cursor is a red pencil, not the pen** (the writing app). The pen writes in ink; every mark that only shows what
  will happen is an editor's red pencil, a UI colour no ink uses, readable on every paper and never mistaken for a
  letter (the old ink-coloured caret read as an "l"). Rafael picked all four recommendations:
  1. Red pencil for every editing mark (not a quieter grey-blue).
  2. While the pen is behind you, a small ink dot marks where it has got to; the caret stays at the end of what's typed.
  3. Press harder / lean pending: a heavier or leaning caret, plus a small B or I badge.
  4. Typing after a word crossed out mid-line replaces it, written above it (as select-and-type does); at the end of
     the writing the pen still carries on after it.
  - With it: a red ‸ in the line and a dashed ghost caret above for insertions, typed insertions shown grey above at
    once; a strike tick on the caret where Backspace will cross out, and a dashed red preview of the strike; a red bar
    under one selected letter (written over); a red wash and underline for selections; a loupe and thin handles on
    phones. And the behaviour fixes the audit found (typing after an insertion overprinting it, the caret jumping after a
    strike, presses that did nothing, arrow keys skipping struck words). Proposal: the "Red Pencil Cursor" page.
- **Share a note as a picture for X** (the writing app): Square by default, also Wide and The page; Post on X copies it and
  opens X's post box (the share sheet on a phone); made on the device, nothing kept. **The writing page's link picture:**
  "Paper", one handwritten line with its mistake crossed out.
- **Ship as things are made:** Rafael reviews on the live site; options he hasn't picked go out as the recommended one.

## 2026-11-06

- **The writing page becomes its own app** (for now still at `/write`, unlinked, out of search): a modern writing tool
  where a generated hand is used the way any font is used in TextEdit or Notes. If This Finds You stays about the
  fonts and the letters; the writing tool may be separated from it later. It should look and feel modern and snappy,
  not like the rest of the site, and its interactions should be new but intuitive, using what a font made on the fly
  can do (hinting, feedback, formatting by hand).
  - Built that way on 6 Nov: notes in a library (in place of the pile), the writer as the font menu, In ink or
    Clean per note, formatting by hand (titles, lists, checklists, leaning, pressing harder, the highlighter), wet
    ink you can see, notes in the margin that teach the hidden gestures, a neutral frame with dark mode.
  - Open, for Rafael: the tool's name (it's called "Write" for now); softer 10–12 px corners for this app's controls
    (the site's 4 px rule is for the site); ⌘I leans the words (rather than underlining).
- **GitHub issues #4 (the hand keeps your tempo), #5 (stet) and #6 (holding Backspace on a phone) are built.** #3
  (pauses leave a dot) stays open as the good first issue for newcomers.

## 2026-11-05

- **Buttons match across the site:** the site's own corners (`--radius`, about 4px) everywhere, no pills (the Reading
  Room's "slips, not pills"). Round shapes only for badges, swatches and switches.
- **The writing interaction is open for design engineers:** docs/WRITING.md and a README section explain it, and
  link the live `/write` page as a work in progress. Not linked from the site or posted about yet; still kept out of
  search.
- **A writing page, `/write`** (not linked from the site, kept out of search): a sheet and a pen, a minimal editor that builds on
  typing that behaves like ink. Micro-interactions and intuition first; a blank desk, not a word processor.
  - Pressing Backspace or Delete again on a crossed-out word (or holding it) crosses it out harder: a heavier strike,
    a scribble, then inked out. Nothing is ever deleted.
  - New sheet sends the sheet on the desk down into a pile at the bottom; old sheets can be brought back or thrown
    away (with Undo). Kept in the browser only.
  - Phones: Change writer is the main action (a warm blush of the room's red), New sheet a page-with-a-plus icon in
    warm paper; a tap anywhere on the desk opens the keyboard (a page can't open it by itself).
  - The site's logo top left.

## 2026-11-03 (evening)

- **Stamps:** the organic stamps with era adornments (folds, rust, seal traces, folio notes) are the default.
- **Nav:** the current page shows a light-red fill; other places take a faint ink wash on hover. No underlines on hover anywhere.
- **Type:** Source Sans 3 for all controls and labels, sentence case; the small-caps serif labels are retired. The serif is under review (?type=1…7, free fonts only).
- **Dividers:** hand-drawn by default (?rules=plain for hairlines).
- **Letter pages:** the big title. **All letters canvas:** no numbers, no hover copy (the list keeps numbers).
- **Hand cursor** on everything clickable.
- **Click to write (desktop):** a click shows a clear caret and "Start typing", and opens the writing materials partway.
- **Fonts page:** the redesign (?fonts=new) replaces the old page; it sets the balance for the whole site (Principle 12).
- **Project home:** moved to ~/Developer/if-this-finds-you; ~/Documents/Dynamic Font is a link to it.

## 2026-11-02

### Purpose (Rafael's own words, the frame for every other decision)
- **How it started (Rafael, 2026-11-03):** a happy accident. Rafael was looking for the perfect handwritten font for
  his other project, Rueca, couldn't find the exact hand he wanted, and decided to try making one. The experiment
  grew from there into If This Finds You.
- A lab experiment for Rafael's portfolio: **free, fun, no revenue, no usage expectations.** "Using AI in ways
  that I think is clever." It does what couldn't be done before because it took too many resources, e.g.
  hundreds of usable fonts that nobody would draw by hand.
- **Fonts are to be downloadable and open source.**
- Goal: bring underrepresented content, people and techniques into the spotlight, and inspire other designers.
  Rafael plans to share it on X.
- **Scope from this purpose:** keep "Write a reply" and "write your own letter"; **no submissions for now** (add later
  only if it gets popular); an easy-to-browse library of all letters; **share-ready video/GIF** of a letter writing
  itself (prototype first); **open-source fonts** (every hand downloadable, plus a curated pack); an **open-source
  release** of the project when polished. No case study for now. The X posts get planned in a few days.

### Editor and writing experience
- **First visit starts in Ink mode.** Edits behave like real ink: deleting crosses words out, a retyped letter
  overwrites the old one, and mid-line insertions go in with a ^. Fair copy stays one click away.
- **"Thought" letters before the pen catches up: yes, it should feel like magic.** Make it as natural as
  possible: faint, graphite-like, and quickly inked over. Avoid anything that reads as a glitch or a loading state.
- **Selection is a warm amber highlighter swipe** (a UI colour, so it never looks like ink).
- **Choosing the Pencil pen switches to Pencil mode** (erasable, leaves ghosting). That removes one control.
- **Shared links autoplay the writing animation for the recipient.**

### Writers and variety
- **The main button is "Find another"** (Rafael, 2026-11-02; replaces "New hand"). On a found letter it brings a new letter in
  a new hand; "Change writer" (same letter, new hand) lives in the writer-name dropdown. On your own letter it finds
  another writer for your text.
- **Ugly is allowed.** "Some overlap and some ugliness is acceptable. A lot of handwritings are ugly. So unless
  it's a bug, don't fix it." Builders and QA fix only unintended behaviour (scaling mistakes, missing ink,
  clipping). They never beautify, normalise or tighten hands. QA guards catch only values a bug could produce.
- **"Neat hands only" setting, on by default:** New hand skips hard-to-read writers (based on a legibility score)
  and gently tidies extremes. Turning it off allows every hand ("ugly is allowed" still holds).
- **New hand randomizes everything:** writer, print or joined, pen, ink, paper, size, every slider, and each
  writer's own mistakes and corrections (cross-outs, letters rewritten over others). Small locks let people keep a setting.
- **Blend between traditions.** A writer can be schooled in one tradition and influenced by another
  ("taught Palmer, later lived in France"), so letter construction is continuous, not a fixed menu.
- **Hands are presented as fictional writers.**
- **Inclusive sources:** European and global traditions, famous and ordinary writers, every source credited.
- **No hard rule that isn't a hard rule in real life** (see PRINCIPLES.md).

### Product
- **Reading Room direction approved in full** (Rafael, 2026-11-03): the layout study's seven house rules and four
  proposals (tool as a ledger; All letters canvas on a hidden table grid with museum labels; the letter page as a spread;
  Fonts with a foundry's manners) and the type study's pick, Junicode 2 + Ysabeau Office, with its icon set.
- **Focus: the Reading Room look** (Rafael, 2026-11-03). Postmarked is paused as is at `?look=postmarked`; today's look
  stays the default for now while the Reading Room is refined (layout, type, icons research under way).
- **All letters: the infinite canvas** is the default (Rafael, 2026-11-03); the grid stays at `?view=grid`.
- **Printed marks:** a letter's place/year mark and its number (No. 0004) are printed into the paper (ink-stamp feel, mostly
  random position and size, may overlap the writing), never animated in. Several badge variants, QA'd.
  The number is always a numbering-machine stamp, never handwritten (it fought the letter's own hand); the pencilled
  archivist's note stays as one of the place-mark variants (Rafael, 2026-11-03).
- **Colour: "Rubric"** (the colour research's recommendation) is the default palette, replacing the navy CTA (Rafael,
  2026-11-03). **Type:** Atkinson Hyperlegible Next (UI) and Piazzolla (letters), for now.
- **Two looks to compare, today's design stays the default:** `?look=reading-room` (concept A, the reading room with a
  catalogue card) and `?look=postmarked` (concept C, letters in transit). Builders may decide details overnight.
- **All letters controls: the timeline dock** (option 3, Rafael 2026-11-03): a floating dock with search and a
  timeline of every letter by century. No count, no Shuffle. Next to explore: the letters floating on an infinite,
  looping canvas around a centred heading (drag in any direction), on desktop and phones.
- **Panel density:** controls one step tighter (shorter controls, 13.5 px text, 8 px corners, 320 px panel), but the roomier
  spacing between sections stays (Rafael, 2026-11-02).
- **Logo: wordmark #5** (Rafael, 2026-11-02; replaces #32 the same day): "If This Finds You" on one line in a Québec school
  print, felt marker. #32 (stacked, Spanish copybook) stays viewable with `?logo=32`. Files and settings in brand/wordmark/.
- **Name: "If This Finds You"** (Rafael, 2026-11-02, "for now"). It's how a message in a bottle begins: a letter
  that may never have arrived, and you're the one it found. Domain: ifthisfindsyou.app (Rafael is buying it
  himself; .com is taken). Light trademark check only (no live marks found); since it's open source and
  non-commercial, Rafael considers a lawyer's clearance optional. Runners-up on record: Stray Letters, In Another Hand, These Few Lines, Manent. "Seedhand"
  stays only as the code placeholder. The "Lost Letters" archive working title is superseded by the product
  name unless Rafael says otherwise. Copy in docs/brand/naming-and-copy.md (naming branch) still says
  "Plumín" and needs a pass.
- **Latin script only for now.** No Vietnamese stacked tones, Cyrillic or Greek until later; the letters
  collection keeps Vietnamese switched off.
- **Sample letters:** letters only (no poems). Keep "…" for cuts, keep letters printed without greeting or
  signature, very old spellings (1390–1659) only with older-looking hands, 51% English is fine, keep the
  Luxemburg bird letter. Van Gogh letters held until re-checked against the 1914 printing.
- **Concept: "Lost Letters" (working title for the archive; the tool keeps the placeholder "Seedhand").**
  The product is also an archive of letters by ordinary people, mostly undelivered or everyday letters,
  each with its *true* origin (never invented). Anyone can browse, shuffle (random letter + random hand),
  read a letter written in a hand, and "Write a reply". The engine is unchanged.
  - **Collection:** shift toward ordinary and undelivered letters (emigrant, family, everyday, undelivered);
    about 20 famous letters is fine. **No permission requests to institutions** (keep it low effort): use
    only sources that already pass the rights rules (this rules out Brienne and the Prize Papers
    transcriptions for now).
  - **Inclusive writers (hard targets):** a lot of women (≥55% of enabled letters), a lot of African American
    and African writers (≥15), and a lot of Hispanic/Latin American writers (≥15). A letter written in Spanish
    (or Brazilian Portuguese) counts as Hispanic even when the source gives no nationality. The Hispanic set
    being mostly children's letters is fine for now (adult letters would need manual archive browsing).
  - **Submissions (phase 2):** anyone can submit a letter. Each writer chooses whether to be credited. Letters
    go to a private queue; Claude approves them in batches (daily or every couple of days, depending on traffic),
    with an automatic screening step built later.
  - **Phase 1 (approved 2026-11-02):** the archive pages, no backend.
- **Typing on a sample letter in Ink mode:** (a) "Write a reply": the first keystroke starts the writer's own
  letter on a fresh sheet; the found letter stays one tap away. (Provisional; Rafael didn't object.)
- **The live web tool is the product.** Font export is secondary and honest about its limits.
- **UI:** minimal, shadcn-style, warm tones, the letter sheet as the hero, desktop and mobile.
- **Paper:** plain, school-ruled (US, Seyès, UK feint), grid, and dot. Writing sits on the lines, with natural drift.
- **Actions:** Share a link (full configuration), Download the note as a JPEG, Export font.

### Open
- Two "caution" sources (Austria 1969, Vietnam 2002): proposed to leave them out of the first batch. Awaiting Rafael.
- A legal check on share-alike sources: proposed for before any commercial launch. Awaiting Rafael.
- (Name decided; see below.)
