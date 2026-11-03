# Decisions log

Rafael's calls, newest first. Builders follow these. If one conflicts with a research recommendation, this log wins.

## 2026-11-02

### Purpose (Rafael's own words, the frame for every other decision)
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
