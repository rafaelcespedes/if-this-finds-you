# Decisions log

Rafael's calls, newest first. Builders follow these. If one conflicts with a research recommendation, this log wins.

## 2026-11-02

### Editor and writing experience
- **First visit starts in Ink mode.** Edits behave like real ink: deleting crosses words out, a retyped letter
  overwrites the old one, and mid-line insertions go in with a ^. Fair copy stays one click away.
- **"Thought" letters before the pen catches up: yes, it should feel like magic.** Make it as natural as
  possible: faint, graphite-like, and quickly inked over. Avoid anything that reads as a glitch or a loading state.
- **Selection is a warm amber highlighter swipe** (a UI colour, so it never looks like ink).
- **Choosing the Pencil pen switches to Pencil mode** (erasable, leaves ghosting). That removes one control.
- **Shared links autoplay the writing animation for the recipient.**

### Writers and variety
- **Ugly is allowed.** "Some overlap and some ugliness is acceptable. A lot of handwritings are ugly. So unless
  it's a bug, don't fix it." Builders and QA fix only unintended behaviour (scaling mistakes, missing ink,
  clipping). They never beautify, normalise or tighten hands. QA guards catch only values a bug could produce.
- **New hand randomizes everything:** writer, print or joined, pen, ink, paper, size, every slider, and each
  writer's own mistakes and corrections (cross-outs, letters rewritten over others). Small locks let people keep a setting.
- **Blend between traditions.** A writer can be schooled in one tradition and influenced by another
  ("taught Palmer, later lived in France"), so letter construction is continuous, not a fixed menu.
- **Hands are presented as fictional writers.**
- **Inclusive sources:** European and global traditions, famous and ordinary writers, every source credited.
- **No hard rule that isn't a hard rule in real life** (see PRINCIPLES.md).

### Product
- **The live web tool is the product.** Font export is secondary and honest about its limits.
- **UI:** minimal, shadcn-style, warm tones, the letter sheet as the hero, desktop and mobile.
- **Paper:** plain, school-ruled (US, Seyès, UK feint), grid, and dot. Writing sits on the lines, with natural drift.
- **Actions:** Share a link (full configuration), Download the note as a JPEG, Export font.

### Open
- Two "caution" sources (Austria 1969, Vietnam 2002): proposed to leave them out of the first batch. Awaiting Rafael.
- A legal check on share-alike sources: proposed for before any commercial launch. Awaiting Rafael.
- Name: the naming session is running.
