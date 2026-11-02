# The writing experience: typing that behaves like ink

_2026-11-02. Research plus a buildable spec for typing directly on the paper. Rafael's question: can typing
feel like handwriting, where you can't delete, only cross out? Motor control and ink physics are in
[`human-feel.md`](human-feel.md), and pens and paper are in [`controls-and-feel.md`](controls-and-feel.md).
This doc doesn't repeat them. "est." marks a starting value to tune by eye. PRINCIPLES.md rule 5 ("once
written, ink stays put") points here._

## 0. The short version

1. **You edit like a computer user, and the writer corrects like a person.** Your keystrokes are intent. A
   small *correction planner* turns them into what this writer would do on paper: strike it out, overwrite a
   letter, add a caret and write above the line, erase (in pencil), or take a fresh sheet. You press
   Backspace, and Ottilie crosses it out her way.
2. **Grace comes from the pen being slower than your fingers.** The hand writes at about handwriting speed
   and trails your typing by a few letters. Anything it hasn't reached yet can be deleted cleanly, which is
   honest: you changed your mind before the ink touched the paper. Typists press Backspace constantly
   (3.1), so without the trail every page would be a mess.
3. **Three modes:** **Ink** (permanent, the default when typing on the paper), **Pencil** (erasable, with
   ghosts), and **Fair copy** (today's editing). Ink always has a one-click exit, **Make a fair copy**: the
   writer copies the letter out cleanly onto a fresh sheet, as people really did.
4. **The source of truth is an append-only ink log** of *write, strike, overwrite, insert, erase, move,
   sheet* events. Each glyph gets a permanent id and is placed once. The plain text (what the letter now
   says) is derived from the log. A 250-word letter fits in a share link of about 1,350 characters
   (measured).
5. **MVP:** Ink on one sheet, with the pen trail, word-level strike-and-rewrite, single-letter overwrite,
   select-and-delete as a strike, caret insertions, paste written out by hand, a hidden textarea for input
   and accessibility, the share link, and Make a fair copy.

---

## 1. Prior art

| Tool | The constraint | Why it works (or doesn't), and what we take |
|---|---|---|
| **Freewrite** (Astrohaus) | A drafting machine. The original has no arrow keys, only Backspace; editing happens later on a computer. Newer models add WASD navigation ([review](https://ianbetteridge.com/writing-with-the-freewrite), [FAQ](https://getfreewrite.com/pages/faq)) | The purpose is stated up front, there's an exit (edit later), and a mercy for the commonest slip. **Take:** name the purpose, always offer Fair copy, forgive the tiny slip |
| **The Most Dangerous Writing App** | Stop for 5 s and everything is deleted. Hardcore mode blurs your text ([Wikipedia](https://en.wikipedia.org/wiki/The_Most_Dangerous_Writing_App)) | Opt-in, time-boxed, self-chosen stakes: a game. **Take:** strictness is opt-in and scoped |
| **Write or Die** | Kamikaze mode eats words when you stall. Grace is "Forgiving, Strict or Evil", and there's a Reward mode ([PCWorld](https://www.pcworld.com/article/447502/write-or-die-review-write-or-be-punished-for-your-crimes.html)) | The user holds the dial. **Take:** one Forgiving toggle |
| **Hemingway mode** (Draft; Ghost, Obsidian, Atom) | No deleting ([Draft](https://ninjasandrobots.com/draft-announcements-hemingway-mode-wordgoogle-docs-support-kindle-exports-and-more)) | Annoying where it leaks: Ghost blocked Backspace but not mouse edits ([Ghost forum](https://forum.ghost.org/t/a-stricter-hemingway-mode/1188)). **Take:** every edit path (keys, mouse, paste, IME) goes through one rule |
| **Hanx Writer** (2014) | With "Modern Delete" off, Backspace x-es the letter out instead of removing it ([Time](https://time.com/3112027/hanx-writer/), [Cayman Compass](https://www.caymancompass.com/?p=262707)) | Our mechanic, proven popular as an option. Sound and the visible mark do the work |
| **OverType** | A web typewriter: no delete, but "correction paper", with adjustable brokenness and ribbon wear ([The Loop](https://www.loopinsight.com/2016/07/16/overtype-a-typewriter-simulator-on-the-web)) | Humour, and a correction tool rather than a punishment |
| **OmmWriter, iA Writer Focus** | Ambient and keystroke sounds ([Macworld](https://www.macworld.com/article/217142/ommwriter_dana_helps_you_focus_when_writing.html)); dimming everything but the sentence ([iA](https://ia.net/writer/support/editor/focus-mode)) | Constraint as ritual and attention, not prohibition. **Take:** a calm page, sensory feedback |
| **iPadOS Scribble** | The mirror image of our idea: paper gestures make clean digital edits. Scratch out to delete, touch and hold to insert, a vertical line to join or separate, circle to select ([Apple](https://support.apple.com/en-kz/guide/pages-ipad/tan36493d985/ipados)) | The vocabulary is already in people's hands. **Take:** reuse it (a slash splits a word, a caret inserts) |
| **Apple Notes Smart Script** | Scratch-out erases. A spelling fix rewrites the word in your hand. Paste comes out "in your handwriting" ([MacStories](https://www.macstories.net/stories/ipados-18s-smart-script-a-promising-start-but-dont-toss-your-keyboard-out-yet/)) | The magic is the hand redoing it. It fails where it's "a little too perfect" (paste) or where ink moves (reflow drifted margins and mangled lines). **Take:** paste is *written out* with full variation; ink never reflows |
| **Goodnotes, MyScript Notes** | Scribble to erase (i-dots outside the scribble survive); partial vs whole-stroke eraser; strike-through can be set to format, erase or nothing ([Goodnotes](https://support.goodnotes.com/hc/en-us/articles/7353718249231-Erasing-content), [MyScript](https://help.myscript.com/notes/edit-content/pen-gestures-and-interactions/)) | Users ask for an off switch after accidental erases ([feedback](https://feedback.goodnotes.com/forums/191274-customer-suggestions-for-goodnotes/suggestions/47210687-toggle-on-or-off-scrible-option)). **Take:** a predictable planner, and a way to turn it off |
| **reMarkable** | Paper feel from surface friction. It still has undo and an eraser ([Macworld](https://www.macworld.com/article/3583603/remarkable-2-review.html)) | "Paper" comes from texture, not punishment |
| **Pentiment** (Obsidian, 2022) | Dialogue written live, stroke by stroke, in scripts that mark class and education. Misspellings are erased and rewritten, and simpler scripts err more often. Anger splashes ink; a whisper is small ([Language at Play](https://languageatplay.de/?p=3624), [Lettermatic](https://lettermatic.basement.studio/custom/pentiment)) | Corrections *are* characterisation. **Take:** correction style is part of the writer (5.6) |
| **Papers, Please** | Every stamp is final, and it sounds final ([Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-)) | Finality is felt through tactility. **Take:** give the moment of committing ink a small physical cue |
| **Heaven's Vault, Signalis** | Mistranslations stay in the story until revised ([PC Gamer](https://pcgamer.com/heavens-vault-review)); Signalis tells its story through found notes ([Gamepressure](https://www.gamepressure.com/editorials/the-best-games-of-2022-you-might-have-missed/signalis/z25f7)) | Errors carry meaning. I found nothing documenting Signalis's handwriting treatment |
| **Slowly** | Letters take hours or days to arrive, by distance ([help](https://help.slowly.app/hc/en-us/articles/115001835772-When-will-my-penpal-receive-my-letter)) | Thoughtful to some, a "gimmick" to others ([Tildes](https://tildes.net/~talk/1teb/does_anyone_have_experience_exchanging_actual_letters_with_a_pen_pal)). A constraint must serve the content |
| **Draftback, Calligrapher.ai** | Replays a doc's keystroke history, "the archaeology of writing" ([FiveThirtyEight](https://fivethirtyeight.com/features/watch-me-write-this-article)); RNN handwriting with a legibility slider ([Gigazine](https://gigazine.net/gsc_news/en/20230127-calligrapher-ai)) | The process is worth watching (log replay, v2), and people like dialling neatness |

**What separates meaningful from annoying.** The constraints that work are opt-in or clearly framed. They
make the artefact *better* (the marks are characterful, not damage). They always have an exit, give
sensory feedback, put the strictness dial in the user's hands, and interpret intent generously. The
annoying ones leak, punish without consent, or look too perfect.

---

## 2. How people actually correct handwriting

Examiners classify alterations as **additions, deletions, obliterations and substitutions**
([ANSI/ASB 035](https://www.aafs.org/sites/default/files/media/documents/035_Std_e1.pdf)). Manuscript editors
encode the same moves in TEI: `<del rend="strikethrough|overstrike">`, `<add place="above|margin">`,
`<subst>` (a deletion paired with its replacement), `<delSpan>` for multi-line strikes, and `<restore>` for
"stet" ([TEI](https://tei-c.org/Vault/P5/1.7.0/doc/tei-p5-doc/en/html/examples-del.html)). That vocabulary
maps almost one-to-one onto our events (section 4).

| Correction | Looks like | Pressure and speed | How common, where |
|---|---|---|---|
| **Single-line strike** | A line through mid x-height, overshooting both ends, rising slightly. The original stays legible | One fast, firm stroke ("fast, heavy, slightly rising", `human-feel.md` §4.5) | The most common method in a studied medieval manuscript ([Columbia MS 097](https://liturgicalmanuscripts.sandbox.library.columbia.edu/exhibits/show/scribalmistakes/corrections)). Mandatory in regulated records (one line, legible, initialled, no fluid, no overwriting: [GDP SOP](https://www.gmpsop.com/gmp_documents/qms-165-good-documentation-practice/)). UK schools ask for one ruled line and discourage scribbling ([Earley St Peter's](https://www.earley-st-peters.wokingham.sch.uk/assets/Documents/Attachments/Presentation-of-Pupils-Work-Policy.pdf), [St Anthony's](https://st-anthonys.lancs.sch.uk/wp-content/uploads/2025/10/Presentation-Policy-2025.26.pdf)) |
| **Double, wave, loops, diagonal, cross** | Variants. Strike-removal research uses seven types: single, double, diagonal, cross, zig-zag, wave, scratch ([Heil, Vats & Hast 2022](https://arxiv.org/pdf/2201.09633v2.pdf)) | Waves and "eeee" loops are cursive habits. Diagonals and crosses cover blocks | Japan: a double line plus a seal (二重線 + 訂正印) on official forms ([tkgje](https://www.tkgje.jp/entries/10000/10288_nijuusen.html)) |
| **Scribble-out / blot** | Dense zig-zag until unreadable, ink pooling at each turn | Fast runs that dip at every reversal (our kinematics: slow means more ink, so dark beads at the ends) | Private notes, hurried writers. Discouraged anywhere the original must stay legible |
| **Overwriting** | The new letter drawn over the old, heavier, sometimes traced twice. The old letter shows at the edges | Slower and heavier; can show through to the back ([Forensic Field](https://forensicfield.blog/alteration-in-documents-addition-and-overwriting/)) | Very common for single letters and digits (1→7, 3→8, J→G). Genuine corrections tend to be frequent and unconcealed (same source) |
| **Caret ‸ and text above** | A small ∧ at the baseline, with the missing text above, smaller and cramped. *Caret* = Latin "it lacks", a proofreading mark since the 1680s ([Etymonline](https://www.etymonline.com/word/caret)) | Insertions shrink when space is tight (Forensic Field) | Letters and drafts; medieval scribes wrote fixes above the line (Columbia); Darwin's pages are full of interlineations ([AMNH](https://amnh.org/research/darwin-manuscripts/symbols-and-editing)) |
| **Arrows, marginal additions** | A circled phrase with an arrow; text up the margin or at the foot with a matching symbol | Quick, small | Drafts, notes, long insertions |
| **Correction fluid / tape** | Opaque white, brighter than the paper. Fluid is blobby and ridged; tape is a straight band. Ink on top skips. Invented in 1956 by Bette Nesmith Graham ([USPTO](https://www.uspto.gov/learning-and-resources/journeys-innovation/historical-stories/perseverance-thy-name-bette)) | (none) | School pen work from the 1970s to the 2000s. Banned in exams because it scans badly and leaves answers incomplete ([Cambridge English](https://support.cambridgeenglish.org/hc/en-gb/articles/205802836-Can-I-use-correction-fluid-correcti), [SEAB](https://ask.gov.sg/seab/questions/cm1ugigk9008dux9ss8je4ejh)) |
| **Erased pencil** | A grey ghost, a smear halo, roughened paper. Heavy strokes leave grooves and more residue. The eraser also lightens the neighbours | (none) | Maths, drafts, children ([Maidensbridge](https://maidensbridge.sch.life/Files/Download/8fb74eac-fb57-4428-8701-2857302694d3/c12f4d7e-6419-46c2-b17b-d546687ab000/Presentation%20Policy%20.pdf)). Erasing disturbs fibres; erased pencil is notoriously hard to recover ([Hilton, NCJRS](https://www.ncjrs.gov/App/Publications/abstract.aspx?ID=129272)) |
| **A fresh sheet** | The old one crumpled or kept | (none) | Formal letters: draft, then a "fair copy" ([Villanova](https://blog.library.villanova.edu/?p=3668)) |
| **P.S.** | Below the signature, smaller and faster, sometimes up the margin | Fast | Personal letters; it exists because inserting into a finished page was impractical (*post scriptum*, "written afterward", [Grammarly](https://www.grammarly.com/blog/acronyms-abbreviations/what-does-ps-mean/)) |

**Frequency.** I found no corpus measuring corrections per 100 handwritten words. Detection researchers say
only that crossed-out words are few compared with regular ones ([Heil et al.](https://arxiv.org/pdf/2201.09633v2.pdf)).
Working targets: a careful letter 0–1 per 100 words, an everyday note 1–3, a first draft 5–15 (est.).

**Culture (nice-to-have, v2).** Japan: a double line and a seal. Vietnam: cross out with a ruler. UK: one
ruled line, no rubbers in pen work. Medieval scribes: dots under the error, scraping with a knife, writing
above the line. Nineteenth-century letters were *crossed*, written at right angles over the page to save
postage ([Wikipedia](https://en.wikipedia.org/wiki/Crossed_letter)). These could feed "where you learned to
write" (`controls-and-feel.md`).

Sketches (`~` = ink through the letters at mid x-height):

```
 single line      double           wave             loops            scribble-out
 ~J~o~h~n~~       =J=o=h=n==       ~J~o~h~n~~       eJeoeheneeee     ##########
 (rises ~2°,      (2nd line runs   (amp 0.15 xh)    (cursive coil)   (zig-zag passes,
  overshoots)      back leftward)                                     ink pools at turns)

 overwrite J→G             caret insertion               substitution above a strike
   G drawn heavier                      very                       John
   over J; J shows        It was a  ‸ good day.          Dear  ~J~o~n~,
   at the edges           (insertion at 0.65×, cramped)  (written above the struck run)

 pencil erase + rewrite              fresh sheet / fair copy
   receive      <- new graphite      sheet 1 (kept as draft)     sheet 2 (fair copy)
  .r:e:c:i:e:v:e.  <- ghost 10%,     Dear ~Jon~ John,            Dear John,
   smudge halo                       It was a ‸good day.         It was a very good day.
```

---

## 3. The interaction model

### 3.1 Why grace is required

Fast typists leave 1.0–3.2% errors uncorrected ([Dhakal et al., CHI 2018](https://www.pokristensson.com/pubs/DhakalEtAlCHI2018.pdf)),
and a secondary summary of the same data reports about 2.3 corrections per sentence, around 6% of keystrokes
([Speakwise](https://speakwiseapp.com/blog/typing-speed-statistics); not verified against the paper). If every
Backspace became a mark, a normal typist would cross something out every two or three words: 30–40 marks
per 100 words, ten times a messy first draft. **A naive "Backspace = strike" makes an unreadable page.**
The grace has to absorb the immediate fixes, which are most of them, and keep the deliberate ones.

### 3.2 The pen trail: "the hand hasn't got there yet"

Adults copy by hand at about 68 letters a minute (about 13 wpm), and people compose on a keyboard at about
19 wpm, in fast bursts ([Wikipedia](https://en.wikipedia.org/wiki/Words_per_minute)). A pen at roughly real
kinematic speed (`kinematics.js`: about 100 ms per sub-stroke, 2–4 per letter) therefore falls a word behind
in bursts and catches up at pauses. So:

- Typed characters go into a **thought buffer**, and the pen consumes it one glyph at a time.
- **Backspace inside the buffer deletes cleanly**, because nothing was written.
- **Forgiving (default on):** the pen holds back the last 2 typed characters until more arrive or 700 ms
  pass. It writes at 1.5× kinematic speed, rising to 4× when the buffer passes 12 characters (all est.).
- **Forgiving off ("Honest"):** each key is written as it lands. Every Backspace on ink becomes a mark.
- **Reduced motion:** writing is instant, and the trail is the 700 ms hold only.

The buffer also lets the pen look ahead at line ends (4.4).

### 3.3 Modes

| | **Ink** | **Pencil** | **Fair copy** |
|---|---|---|---|
| What | Nothing written ever moves or disappears | Erasable, with ghosts and smudge | Today's tool: the page is redrawn cleanly on every edit |
| Default for | Typing *on the paper* | The pencil pen (planned in `controls-and-feel.md`) | The sidebar field, and anyone who just wants the output |

Two controls only: the mode, and **Forgiving**. **Make a fair copy** and **Fresh sheet** are always
available.

### 3.4 Mapping computer edits to physical outcomes

"At the pen" means at the end of the main text. "Inked" means already on the page.

| Action | **Ink** | **Pencil** |
|---|---|---|
| Type at the end | Into the buffer, then written | same |
| Backspace on buffered text | Clean delete | same |
| Backspace on inked text at the pen, then retype | The pen pauses and waits for a word boundary or 1.2 s idle (est.). **One letter for one letter, with compatible shapes →** overwrite. **Otherwise →** strike the whole word and write the corrected word after it: "teh⌫⌫he" becomes `~teh~ the` | Erase the letters, then rewrite in the gap |
| Backspace on inked text, nothing retyped | Strike the run | Erase |
| Delete anywhere earlier | Strike in place; nothing reflows | Erase, leaving a gap |
| Select + Delete | Strike in the writer's style. One stroke per line; a block of 3+ lines gets a diagonal or a cross | Erase |
| Select all + Delete | **Fresh sheet**, with the old sheet sent to a drafts pile and a "Bring it back" toast. Nobody strikes a whole page | same |
| Select + type, one letter | Overwrite, heavier (J→G) | Erase + rewrite |
| Select + type, any other length | Strike, then write the replacement **above the struck run**, smaller (TEI `<subst>`). Very long → margin note (v2); MVP writes above, running right | Erase and rewrite in the gap, or to the end of that line, with ghosts under |
| Type in the middle | **Caret ‸** with the text above the line at 0.65× (est.), written live. Continued typing grows the same insertion | Erase and rewrite to the line's end with the insertion included (ghosts under) |
| Space inside a word, or Enter mid-text | A "/" split mark, or a `//` paragraph mark (est.) | same |
| Delete a space or newline mid-text | Logical join. A close-up mark comes in v2; MVP shows nothing. Deleting a newline the pen hasn't written past just moves the pen back up (newlines aren't ink) | same |
| Enter at the pen | New line | same |
| Copy | The logical text ("Copy with corrections" gives a transcription, section 6) | same |
| Cut | Strike + copy | Erase + copy |
| Paste | **Written out by hand** through the buffer, with "Finish writing" to fast-forward. In the middle, it's a caret insertion | same |
| Drag text | v2: circle it and draw an arrow to the target | Erase + rewrite |
| Undo ⌘Z | **Only while the ink is wet:** the newest event, within 3 s of finishing (est.), lifts cleanly. After that: "The ink is dry. Cross it out, or start a fresh sheet." Honest mode never undoes ink | Undo = erase |
| Sheet full | MVP: "This sheet is full". v2: the next page | same |
| Add a P.S. | Command (MVP if time): the pen moves below the last line after a 1.2-line gap, writes "P.S.", at 0.92× size, slightly hurried (est.) | same |

### 3.5 The correction planner

A pure function that runs at input time. Its *decisions* go into the log, so replay never re-runs it.

```ts
interface Edit { at: number; del: number; ins: string; kind: InputKind; t: number } // from a textarea diff (7.4)
type InputKind = 'type' | 'delete' | 'paste' | 'cut' | 'drop' | 'compose' | 'replace' | 'undo';

function plan(doc: InkDoc, view: SheetState, edit: Edit, habits: FixHabits): InkEvent[] {
  // 1. Characters still in the buffer: edit freely, emit nothing.
  // 2. Inked glyphs touched at the pen head: open a pending fix; resolve on a word boundary or 1.2 s idle:
  //    a. one glyph for one glyph, overwriteOK(old, new), roll < habits.overwrite -> over
  //    b. inside a word, roll < habits.wordStrike                                    -> strike word, rewrite it
  //    c. otherwise                                                                  -> strike the range, continue
  // 3. Away from the pen head: delete -> strike; replace -> strike + insert{over}; insert -> insert{after}.
  // 4. A deletion covering more than 60% of the sheet -> sheet('fresh').
}
// overwriteOK: the shapes cover each other (o→a, c→e, l→t, n→h, i→l, 1→7, 3→8, u→y, J→G).
// MVP: a hand-made pair table. v2: measured skeleton coverage.
// roll = rng('plan:' + salt + ':' + eventCount), so the same session typed twice gives the same page.
```

### 3.6 Not frustrating

- Target 1–3 visible corrections per 100 words for an average typist with Forgiving on (est.). Check it
  in QA with recorded keystroke traces.
- Every computer edit maps to *something* physical. Nothing is refused.
- A pending fix shows the pen hovering, so the pause reads as the writer considering, not as lag.
- Fair copy is one click away, and it's a pleasure to watch.
- First run: one line on the paper, in the hand: "This is ink. What's written stays written."

---

## 4. The data model: an append-only ink log

### 4.1 Types

```ts
interface InkDoc {
  v: 1;                       // format version
  ev: string;                 // engine version that wrote it (4.6)
  salt: string;               // per letter: same hand, two letters, different letter instances
  hand: { seed: string; style: string; o?: Record<string, number | string> };   // seed + UI overrides
  paper: { kind: 'plain' | 'ruled' | 'grid'; size: 'card' | 'a5' | 'a4' | 'letter'; margin?: number };
  mode: 'ink' | 'pencil';     // Fair copy docs stay plain strings, as today
  log: InkEvent[];
}

type GlyphId = number;        // the n-th glyph ever placed in this letter. Never reused or renumbered
type EventId = number;        // index into log

type InkEvent =
  | { t: 'write'; text: string }                                  // written at the pen head
  | { t: 'break' }                                                // Enter at the pen head
  | { t: 'strike'; from: GlyphId; to: GlyphId; how?: StrikeHow }  // inclusive; no `how` = writer's habit
  | { t: 'over'; at: GlyphId; ch: string }                        // a new letter drawn on top
  | { t: 'insert'; after: GlyphId; text: string;
      over?: [GlyphId, GlyphId];                                  // a substitution, written above that run
      where?: 'above' | 'margin' | 'foot' }
  | { t: 'mark'; after: GlyphId; kind: 'para' | 'split' | 'join' }
  | { t: 'erase'; from: GlyphId; to: GlyphId }                    // pencil
  | { t: 'rewrite'; after: GlyphId; text: string; through?: GlyphId } // pencil: fill a gap or redo to `through`
  | { t: 'move'; to: 'ps' | { sheet: number; line: number; x: number } }
  | { t: 'sheet'; why: 'next' | 'fresh' | 'fair' }                // 'fair' = fresh sheet + write the logical text
  | { t: 'session' };                                             // reopened later (v2: another pen, another day)

type StrikeHow = 'line' | 'double' | 'wave' | 'loops' | 'scribble' | 'slash' | 'cross';

// ---- derived by replay, never stored ----
interface Placed {
  id: GlyphId; ev: EventId; ch: string; role: 'main' | 'insert' | 'over' | 'hyphen' | 'ps';
  sheet: number; line: number; x: number; y: number;      // page units; y = baseline, as layout.js
  size: number; weight: number;                           // insertions 0.55–0.8; overwrites 1.2–1.4
  g: Glyph;                                               // makeGlyph() result, computed once
  state: 'ink' | 'struck' | 'erased' | 'covered';         // flags from later events; geometry never changes
}
interface Mark { ev: EventId; kind: 'strike' | 'caret' | 'para' | 'split' | 'ghost' | 'smudge'; contours: Contour[]; density: number }
interface SheetState { placed: Placed[]; marks: Mark[]; head: PenHead; lines: LineInfo[]; sheet: number }
interface PenHead { sheet: number; line: number; x: number; wordStartX: number }
interface LineInfo { baseline: (x: number) => number; slope: number; occupied: Box[] }  // for fitting insertions
```

### 4.2 Frozen vs recomputed

Glyph positions, shapes, sizes and weights are **frozen at write time**: computed once from the page as it
was, and never revisited. Line baselines are seeded per `(salt, sheet, line)`, so a later insertion above
line 3 knows exactly where line 3 sits. Mark geometry is fixed by its event. Only cheap things are
recomputed: glyph `state` flags and the logical text. Positions aren't stored, yet nothing ever moves,
because replay places each glyph exactly once and later events can only add ink.

### 4.3 Logical text

This is the "reading text"; the page is the diplomatic version, in TEI terms.

1. Keep glyph ids in reading order. `write` appends. `insert after: X` splices directly after X. The caret
   always sits right of a specific glyph, so anchors are never ambiguous (a single-user RGA-style list).
2. Drop `struck`, `erased` and `hyphen` glyphs. `over` replaces a glyph's character; the newest wins.
3. `break` and `mark para` emit `\n`, `mark split` a space, `mark join` removes the whitespace there.
4. `sheet fresh` starts a new text (older sheets become drafts). `fair` and `next` keep it.

The same walk produces the **transcription**: `Dear [struck: Jon] John, It was a [inserted: very] good day.`

### 4.4 Line breaks and the right margin

Wrapping is decided only at the pen head, the way a writer decides:

1. **Look ahead:** if the buffer holds the whole next word, wrap before it when it won't fit.
2. **Anticipate:** otherwise, wrap at the space when less than 3.5 em remains (est.). A ragged right
   margin is natural.
3. **Cram:** mid-word, past the margin, shrink width to 0.8× over the last 1.5 em and allow an overrun of
   up to half the margin (est.).
4. **Hyphenate:** if letters remain, write a hyphen (role `hyphen`, not in the logical text) and continue.

```
 |the quick brown fox jumped over the la-|   <- crammed, slight overrun, hyphen
 |zy dog and then                         |
```

Typing in the middle never creates a line. Enter there makes a `//` mark, and insertions go above the line.

### 4.5 Undo: the wet tail

The persisted log is append-only. Only the **wet tail** (the newest event, within 3 s of the pen
finishing it, est.) can be popped by ⌘Z. Once the next event starts, or the ink dries, the event is
sealed. "Restore an earlier version" (v2) copies `log.slice(0, n)` into a *new* letter.

### 4.6 Serialisation, share links, determinism

- **Encoding:** compact JSON arrays (`["w","Dear Ada,"]`, `["x",12,15]`, `["o",40,"G"]`,
  `["i",52,"very "]`), then `CompressionStream('deflate-raw')` (available in all major browsers,
  [web.dev](https://web.dev/blog/compressionstreams)), then base64url in the hash: `#ink=1.<data>`. The hash
  never reaches a server.
- **Measured sizes** (varied English prose, 3 corrections per 100 words):

  | Letter | Text | Share link | Plain text alone |
  |---|---|---|---|
  | 50 words | 298 chars | 346 | 248 |
  | 120 words | 750 | 727 | 550 |
  | 250 words | 1,454 | 1,356 | 1,082 |
  | 400 words | 2,282 | 2,058 | 1,668 |
  | 800 words | 4,650 | 3,835 | 3,142 |

  The log costs about 25% more than plain text. Chromium accepts 2 MB URLs
  ([Willison 2025](https://simonwillison.net/2025/Dec/23/url-limits-investigation/)), but messaging apps
  and email break much sooner. About 2,000 characters is the practical ceiling
  ([nuqs](https://nuqs.dev/docs/limits)). **So: hash links up to about 300 words, and a stored short link
  or a `.letter` file above that.**
- **Timestamps** (v2, for replay): keep only pauses over 0.5 s, quantised to 100 ms. They cost a byte or
  two per event.
- **Determinism:**
  - Glyph seeds become `'ink:' + salt + ':' + id + ':' + ch`, which is stable because ids never shift.
  - Marks use `'fix:' + salt + ':' + ev`, and lines use `'line:' + salt + ':' + sheet + ':' + line`. These
    are new namespaces, per ARCHITECTURE.md.
  - Replay reads no clock. Every timing outcome (buffer vs ink, overwrite vs strike) is already an event.
  - Same log + same `ev` = byte-identical SVG.
  - After an engine change, an old link shows "the same letter, re-penned". Golden logs in QA make sure
    that change is always intentional.

---

## 5. Rendering corrections

Marks are centerlines passed through the same `penOutline()`, ink and `kinematics()` as letters. They're
drawn in event order, so later ink sits on top. xh = the hand's x-height. Every number here is est.

### 5.1 Strike-throughs

| Style | Geometry |
|---|---|
| `line` | At baseline − 0.5 xh (caps and digits: 0.45 cap), from x₀ − o to x₁ + o, with overshoot o = 0.05–0.4 em by habit. Rises 0–8°, bows 0–3%. Flying start: short taper in, long taper out with a flick |
| `double` | A second line 0.15–0.2 xh above, drawn right to left, slope ±1° off the first |
| `wave` | Sine, amplitude 0.12–0.2 xh, wavelength 0.45–0.7 xh |
| `loops` | Prolate trochoid ("eeee"): loops 0.3 xh wide and 0.5 xh tall, advancing 0.25 xh per loop |
| `scribble` | Zig-zag over (x₀ − o … x₁ + o) × (baseline − 1.0 xh … baseline + 0.1 xh), reversing every 0.08–0.15 em, then a second pass tilted 20–40°. Density 1.4× gives a near-opaque blot with dark beads at the turns |
| `slash`, `cross` | One diagonal through a single letter; an X over a block of 3+ lines. Alternative: a vertical wavy line in the margin (TEI `verticalStrike`) |

Wrapped runs get one stroke per line. A word-long line takes about 0.2–0.3 s; a scribble takes 1–2 s.

### 5.2 Overwrite

The new glyph is drawn at the old one's anchor, jittered by N(0, 0.03 em), at 1.05–1.12× size so it
covers. Pen width is ×1.25, density ×1.3, and it's drawn 1.3× slower. Messy hands retrace the main
downstroke half the time. The old glyph stays at full density, and the overlap darkens (5.5).

### 5.3 Caret and cramped insertion

- **Caret ‸:** two strokes 0.35–0.5 xh tall and 0.3–0.4 xh wide, from 0.2 xh below the baseline to an apex
  0.2 xh above it, in the gap. Some writers draw a ∨ above the line instead (habit).
- **Band:** from the line above (its baseline + 0.6 × descender) to this baseline − (xh + 0.15 em), minus
  `LineInfo.occupied`.
- **Size:** min(habit 0.55–0.8, what fits the band). Tracking −10%, width 0.9×, and messy hands slope up
  to 4°.
- **Position:** centred over the caret, or over the struck run for a substitution.
- **Same pen width.** Small writing with the same pen looks bolder, as in life, so insertions scale the
  *skeleton* before the pen outline (engine change 5, in 7.3).

### 5.4 Pencil: erase and ghost

- **Ghost:** the erased glyph at 6–25% density (by habit and pressure) with a 0.5–1 px blur at 58 px/em.
  Optionally, a faint lighter line where the groove catches light.
- **Smudge:** a rounded, slightly rotated eraser footprint over the run + 0.15 em, with an 8–12% graphite
  haze modulated by paper grain. Neighbouring ink inside the footprint is lightened by 20–40%.
- **Burnish:** paper grain is reduced inside the footprint, so new graphite there comes out patchier.
- **Rewriting** lands new letters at new positions over the ghosts. That doubling is the pentimento, and
  it's the most beautiful part.

### 5.5 Ink interactions

- **Overlaps must darken.** Today each path is 0.85–0.99 opaque with no blending, so they barely do. Use
  multiply blending and densities that add (`controls-and-feel.md` item 3; Beer–Lambert in `human-feel.md`).
- **Fast strokes carry less ink**, so a ballpoint strike is lighter and may skip. Offset this with ×1.2
  pressure, because people cross out firmly.
- **Fountain and felt pens** pool at scribble turns into small blots.
- **v2:**
  - A strike made within 1 s over wet fountain ink smears.
  - After a `session` event, the ink shifts slightly (ΔL ±0.03, Δh ±4°): another pen, another day.
  - Correction fluid or tape, with old ink showing through at 5% and skipping ink on top.

### 5.6 Personality: how a writer corrects

Correction style is a **fixed habit**, like letter construction. Writers are consistent, which is what
forensic identification relies on. Derive it from `rng('fix:' + seed)`, correlated with neatness and the
planned Hurry macro:

```ts
interface FixHabits {
  strike: StrikeHow; strikeAlt: StrikeHow;  // usual stroke; for long runs and a second fix at the same spot
  overwrite: number;                        // 0..1, chance of overwriting a one-letter fix
  wordStrike: number;                       // 0..1, chance of striking the whole word, not just the wrong letters
  caret: 'below' | 'above' | 'slash';
  insertSize: number; overshoot: number; angle: number;   // 0.55–0.8; em; degrees of rise
  ghost: number;                            // pencil: density left after erasing
}
```

| | Neat (≥ 0.75) | Middle | Messy (< 0.45) or hurried |
|---|---|---|---|
| Strike | `line`, ruler-like: bow < 1%, 0–2°, overshoot 0.05–0.1 em; sometimes `double` | `line`, bow 1–3%, 1–4°; cursive hands sometimes `loops` | `scribble` or `loops`, overshoot 0.2–0.4 em, 3–8° |
| One-letter fix | Strike the word and rewrite (overwrite 15%) | Overwrite 50% | Overwrite 75%, often retraced |
| Insertion | Caret below, 0.7×, level | Caret, 0.65×, slight slope | ∨ or slash, 0.6×, sloping into the margin |
| Block deletion | A diagonal | An X | Heavy scribble |
| Pencil | Clean erase, ghost 6–10% | Ghost 10–15%, some smudge | Ghost 15–25%, or crosses it out instead |
| Second fix at the same spot | Same style | `strikeAlt` | Scribble, heavier |

As in Pentiment, a reader should be able to tell who wrote the letter from how they fix things.

---

## 6. Accessibility and practicality

- **Screen readers read the logical text.** Input goes through a real, focusable `<textarea>` whose value
  is always the logical text plus the buffer. It's labelled with the writer's name ("Letter in Ottilie
  Marsh's hand"), and the SVG is `aria-hidden`. Screen readers, braille, dictation and selection all work
  natively. Google Docs did the same after moving to canvas: a hidden "side DOM" for assistive technology
  ([Workspace Updates](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html),
  [The New Stack](https://thenewstack.io/google-docs-switches-to-canvas-rendering-sidelining-the-dom/)).
  An opt-in **Read corrections aloud** setting adds the transcription and a summary ("3 crossings-out,
  1 insertion") as an `aria-description`.
- **Copy and search** use the logical text. **Copy with corrections** gives the transcription, or Markdown
  with `~~struck~~`.
- **Keyboard-only:**
  - Arrows and Shift+arrows move and select in logical order (the textarea's own behaviour).
  - A pen-tip caret is drawn at the glyph's frozen position. Selection is a soft UI tint, never ink-like.
  - ⌘↩ adds a P.S. ⌘⇧↩ makes a fair copy. The controls are reachable with Tab.
  - Up and Down follow logical lines, which can feel odd around insertions. Spatial navigation is v2.
- **Reduced motion:** instant writing; corrections still render.
- **IME and mobile keyboards.** How much composition breaks an append-only model: hardly at all, *if*
  composing text counts as unwritten.
  - Composition `beforeinput` events can't be cancelled, because Android IMEs make it impossible
    ([w3c/input-events #115](https://github.com/w3c/input-events/issues/115),
    [#134](https://github.com/w3c/input-events/issues/134)).
  - Gboard composes the whole current word, and macOS dead keys (⌥e e → é) compose too. Keep composing text
    in the buffer and ink it after `compositionend`.
  - Autocorrect replaces the *previous* word, as `insertReplacementText`, on space. If that word were
    already inked, autocorrect would strike it. So **on touch devices the pen trails by a whole word**: it
    inks a word only once the next has started, or after 1.2 s idle (est.).
  - Dictation revises recent words as it goes, so hold ink while dictation is streaming (v2).
  - Use a 16 px textarea font so iOS doesn't zoom. Leave autocorrect on; people rely on it.
- **Android sends imprecise `inputType` values** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/inputType)).
  That's why the core reads *diffs*, not event types (7.4). Test on iOS Safari, Android Chrome with Gboard
  and with Samsung Keyboard, macOS dead keys, and Windows IME.

---

## 7. Recommendation

### 7.1 MVP: the smallest version that delivers the magic

1. Ink mode on one sheet (plain or ruled), with Forgiving on and the pen trail.
2. Word-level fixes at the pen (strike and rewrite), plus single-letter overwrite using a pair table.
3. Select + Delete → a strike, in two styles: `line` (neat and middle hands) and `scribble` (messy).
4. Select + type → a strike with the replacement written above.
5. Typing in the middle → a caret with a cramped insertion above the line.
6. Paste → written out by hand, with "Finish writing".
7. Select all + Delete → a fresh sheet, plus the Make a fair copy button. Fair copy mode stays as today.
8. Hidden textarea input, logical text for screen readers and copying, and wet-tail undo.
9. The ink log, hash share links, and golden-log determinism tests.
10. If time allows: Add a P.S.

The moment to protect: you type "Dear Jon", select "Jon", type "John", and watch Ottilie strike it with her
quick rising line and write "John" small above it.

### 7.2 v2

- Pencil mode: ghosts, smudge, and a local line rewrite.
- Multi-page letters. Margin and foot notes with ① or * marks. Arrows for moved text.
- The remaining strike styles, blots, and a second fix at the same spot that gets messier.
- `session` ink shifts.
- Stet (TEI `<restore>`): a dotted underline and "stet" in the margin.
- Timed replay (the Draftback idea), and "restore this point" as a new letter.
- Correction fluid and tape as a desk accessory. Close-up and join marks.
- Spatial caret navigation.
- EditContext as an enhancement: Chromium-only since version 121 and not Baseline
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/EditContext_API)), with a Candidate
  Recommendation targeted for Q4 2026 ([W3C charter](https://www.w3.org/groups/wg/webediting/charters/active/)).
- Cultural correction conventions as part of "where you learned to write".

### 7.3 Engine changes

Owners follow ARCHITECTURE.md, and `tools/qa/regress.mjs` must keep passing.

| # | Change | Where (owner) |
|---|---|---|
| 1 | **`engine/sheet.js`:** `createSheet(p, paper, salt)`, an incremental `applyEvent(state, ev) → { placed, marks }`, `replay(doc)`, `logicalText(doc)` and `transcription(doc)`. It owns the pen head, line bands, frozen placement and the wrap policy (4.4) | new (Writing & page) |
| 2 | **Shared placement:** pull the per-glyph placement (word gaps, baseline wander, jitter) out of `layout()` into a `placeGlyph(state, ch, opts)` that Ink and Fair copy both use | layout.js (Writing & page) |
| 3 | **Stable instance seeds.** `layout()` seeds glyphs with `'live:' + charIndex + ':' + ch`, so typing one letter early re-rolls *every later letter* (a visible shimmer in today's tool too). Ink uses glyph ids. Fair copy should key on word plus occurrence (`'live:' + hash(word) + ':' + n + ':' + i`), so unedited words keep their shape | layout.js |
| 4 | **`engine/marks.js`:** `fixHabits(p)`, and centerlines for strikes, carets, split and paragraph marks, and ghosts and smudges, all passed through `penOutline()` and `kinematics()` | new (Writing & page) |
| 5 | **`makeGlyph` options:** `inst.size` (scale the skeleton before the pen) and `inst.weight` (width and pressure multiplier) | hand.js (*request to* Letters & variety) |
| 6 | **Renderer:** draw in event order; `kind: 'mark'` items; per-item density and a ghost filter; multiply blending; stable `data-ev`/`data-id` attributes so the UI appends paths instead of re-rendering | render-svg.js |
| 7 | **Ink:** overlap darkening, speed → density, the pencil pen and its erase look | pen.js (*request to* Pens & ink) |
| 8 | **`engine/animate.js`** (already planned): a pen queue that drains the buffer at kinematic speed with catch-up, with marks on the same timeline | new |
| 9 | Export the sheet API and `SHEET_PARAMS` (mode, Forgiving) | index.js |
| 10 | **QA:** golden logs (byte-identical SVG), and a corrections-per-100-words check driven by keystroke traces | tools/qa |

### 7.4 UI changes (`app/**`)

- **Input: a transparent `<textarea>`**, not contenteditable or a canvas.
  - It sits under the on-paper caret, so IME candidate windows appear in the right place.
  - It gives IME, autocorrect, dictation, selection and accessibility for free. contenteditable brings
    rich-DOM quirks we don't need. EditContext comes later.
- **Event handling:**
  - Read `beforeinput` for hints: `inputType`, `getTargetRanges()`, and paste or drop data.
  - Let the browser apply the edit, then on `input`, **diff** the old and new values into
    `Edit { at, del, ins }`. This stays robust where Android's events aren't.
  - `preventDefault()` only `historyUndo`/`historyRedo` (routed to the wet tail), `insertFromDrop`, and
    formatting.
  - Composing text stays in the buffer until `compositionend`.
  - After planning, reset the value to `logicalText + buffer` and restore the selection.
- **On the paper:** a pen-tip caret, a selection tint, and a hovering pen while a fix is pending. Clicking
  a glyph places the caret there.
- **Controls:** the mode, Forgiving, Make a fair copy, Fresh sheet, a drafts pile, "Finish writing", and the
  "The ink is dry" note.

### 7.5 Risks

| Risk | Mitigation |
|---|---|
| Typing noise makes messy pages (~6% of keystrokes are corrections) | The pen trail, word-level planning, and the QA corrections gate |
| People who want clean output feel trapped | Fair copy is one click away, the mode is always visible, and the sidebar field stays Fair copy |
| Mobile autocorrect, IME and dictation strike words by accident | A one-word trail on touch devices, composing text kept in the buffer, and testing on real devices |
| The caret moving through insertions confuses people | Logical order plus a clear on-paper caret; spatial navigation in v2 |
| Engine updates change old links | The `ev` field, golden logs, and saying plainly "re-penned" (PRINCIPLES rule 6) |
| URL length | Hash links up to ~300 words; stored links or files beyond |
| Replay cost on long letters | Incremental `applyEvent`, each glyph computed once, appended SVG nodes, a snapshot per sheet |
| Corrections become a gimmick (`fonts-study.md` warns about this) | They're only ever user-caused, never random. Subtle styles by default; scribble only for messy hands |
| Leaky rules (the Ghost lesson) | One planner for keys, mouse, paste, drop, IME and dictation |
| The textarea and the model drift apart | Diff and reset on every edit, plus property tests: random edit traces → `logicalText(replay(log)) === textarea.value` |
| Workstream ownership | Request changes 5 and 7. Ink can ship on today's pen; it just darkens less |

---

## Sources

**Tools and games:** [Freewrite review](https://ianbetteridge.com/writing-with-the-freewrite) ·
[Freewrite FAQ](https://getfreewrite.com/pages/faq) ·
[The Most Dangerous Writing App](https://en.wikipedia.org/wiki/The_Most_Dangerous_Writing_App) ·
[Write or Die (PCWorld)](https://www.pcworld.com/article/447502/write-or-die-review-write-or-be-punished-for-your-crimes.html) ·
[Draft's Hemingway mode](https://ninjasandrobots.com/draft-announcements-hemingway-mode-wordgoogle-docs-support-kindle-exports-and-more) ·
[Ghost forum](https://forum.ghost.org/t/a-stricter-hemingway-mode/1188) ·
[Hanx Writer (Time)](https://time.com/3112027/hanx-writer/) ·
[Hanx Writer (Cayman Compass)](https://www.caymancompass.com/?p=262707) ·
[OverType](https://www.loopinsight.com/2016/07/16/overtype-a-typewriter-simulator-on-the-web) ·
[OmmWriter (Macworld)](https://www.macworld.com/article/217142/ommwriter_dana_helps_you_focus_when_writing.html) ·
[iA Writer Focus mode](https://ia.net/writer/support/editor/focus-mode) ·
[Scribble gestures](https://support.apple.com/en-kz/guide/pages-ipad/tan36493d985/ipados) ·
[Smart Script (MacStories)](https://www.macstories.net/stories/ipados-18s-smart-script-a-promising-start-but-dont-toss-your-keyboard-out-yet/) ·
[Goodnotes erasing](https://support.goodnotes.com/hc/en-us/articles/7353718249231-Erasing-content) ·
[Goodnotes feedback](https://feedback.goodnotes.com/forums/191274-customer-suggestions-for-goodnotes/suggestions/47210687-toggle-on-or-off-scrible-option) ·
[MyScript gestures](https://help.myscript.com/notes/edit-content/pen-gestures-and-interactions/) ·
[reMarkable 2 (Macworld)](https://www.macworld.com/article/3583603/remarkable-2-review.html) ·
[Pentiment (Language at Play)](https://languageatplay.de/?p=3624) ·
[Pentiment fonts (Lettermatic)](https://lettermatic.basement.studio/custom/pentiment) ·
[Papers, Please (Game Developer)](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-) ·
[Heaven's Vault (PC Gamer)](https://pcgamer.com/heavens-vault-review) ·
[Signalis (Gamepressure)](https://www.gamepressure.com/editorials/the-best-games-of-2022-you-might-have-missed/signalis/z25f7) ·
[Slowly](https://help.slowly.app/hc/en-us/articles/115001835772-When-will-my-penpal-receive-my-letter) ·
[Slowly critique (Tildes)](https://tildes.net/~talk/1teb/does_anyone_have_experience_exchanging_actual_letters_with_a_pen_pal) ·
[Draftback (FiveThirtyEight)](https://fivethirtyeight.com/features/watch-me-write-this-article) ·
[Calligrapher.ai (Gigazine)](https://gigazine.net/gsc_news/en/20230127-calligrapher-ai)

**Correction practice:** [ANSI/ASB 035](https://www.aafs.org/sites/default/files/media/documents/035_Std_e1.pdf) ·
[SWGDOC altered documents](https://www.swgdoc.org/documents/SWGDOC%20Standard%20for%20Examination%20of%20Altered%20Documents.pdf) ·
[Forensic Field](https://forensicfield.blog/alteration-in-documents-addition-and-overwriting/) ·
[Columbia MS 097](https://liturgicalmanuscripts.sandbox.library.columbia.edu/exhibits/show/scribalmistakes/corrections) ·
[TEI del examples](https://tei-c.org/Vault/P5/1.7.0/doc/tei-p5-doc/en/html/examples-del.html) ·
[AMNH Darwin manuscripts](https://amnh.org/research/darwin-manuscripts/symbols-and-editing) ·
[GDP SOP](https://www.gmpsop.com/gmp_documents/qms-165-good-documentation-practice/) ·
[Earley St Peter's](https://www.earley-st-peters.wokingham.sch.uk/assets/Documents/Attachments/Presentation-of-Pupils-Work-Policy.pdf) ·
[St Anthony's](https://st-anthonys.lancs.sch.uk/wp-content/uploads/2025/10/Presentation-Policy-2025.26.pdf) ·
[Maidensbridge](https://maidensbridge.sch.life/Files/Download/8fb74eac-fb57-4428-8701-2857302694d3/c12f4d7e-6419-46c2-b17b-d546687ab000/Presentation%20Policy%20.pdf) ·
[Cambridge English](https://support.cambridgeenglish.org/hc/en-gb/articles/205802836-Can-I-use-correction-fluid-correcti) ·
[SEAB](https://ask.gov.sg/seab/questions/cm1ugigk9008dux9ss8je4ejh) ·
[二重線](https://www.tkgje.jp/entries/10000/10288_nijuusen.html) ·
[Heil, Vats & Hast 2022](https://arxiv.org/pdf/2201.09633v2.pdf) ·
[Chaudhuri & Adak](https://opus.lib.uts.edu.au/handle/10453/125478) ·
[Caret (Etymonline)](https://www.etymonline.com/word/caret) ·
[P.S. (Grammarly)](https://www.grammarly.com/blog/acronyms-abbreviations/what-does-ps-mean/) ·
[Liquid Paper (USPTO)](https://www.uspto.gov/learning-and-resources/journeys-innovation/historical-stories/perseverance-thy-name-bette) ·
[IBM Selectric](https://en.wikipedia.org/wiki/IBM_Selectric) ·
[Crossed letter](https://en.wikipedia.org/wiki/Crossed_letter) ·
[Villanova on fair copies](https://blog.library.villanova.edu/?p=3668) ·
[Hilton on pencil erasures (NCJRS)](https://www.ncjrs.gov/App/Publications/abstract.aspx?ID=129272)

**Typing and the web platform:** [Dhakal et al. 2018](https://www.pokristensson.com/pubs/DhakalEtAlCHI2018.pdf) ·
[Speakwise](https://speakwiseapp.com/blog/typing-speed-statistics) ·
[Words per minute](https://en.wikipedia.org/wiki/Words_per_minute) ·
[MDN inputType](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/inputType) ·
[w3c/input-events #115](https://github.com/w3c/input-events/issues/115) ·
[#134](https://github.com/w3c/input-events/issues/134) ·
[MDN EditContext](https://developer.mozilla.org/en-US/docs/Web/API/EditContext_API) ·
[W3C Web Editing charter](https://www.w3.org/groups/wg/webediting/charters/active/) ·
[Google Docs canvas](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html) ·
[The New Stack](https://thenewstack.io/google-docs-switches-to-canvas-rendering-sidelining-the-dom/) ·
[Willison on URL limits](https://simonwillison.net/2025/Dec/23/url-limits-investigation/) ·
[nuqs limits](https://nuqs.dev/docs/limits) ·
[Compression Streams (web.dev)](https://web.dev/blog/compressionstreams)
