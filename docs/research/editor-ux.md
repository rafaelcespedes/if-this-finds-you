# Editor UX: writing a letter that is already handwriting

_2026-11-02. Rafael asked how Apple Notes, Notion and other editors handle writing, and how Seedhand should
do it in its own way. This doc covers the editor's feel: postures, caret, selection, formatting, pages,
mobile, undo and sharing. What edits *do* to the ink (strike, overwrite, caret insertions, the ink log) is
in [`writing-experience.md`](writing-experience.md) and isn't repeated. "est." marks a starting value to
tune by eye._

_Sources, in order: Mobbin (read only, nothing saved), Rafael's library, then the open web. **Gap:** the
web pass on Apple's own Notes documentation did not finish before this was written. The Apple Notes rows
lean on Mobbin screens plus facts I know but did not re-check this time; they are marked "(not re-checked)".
Check them before quoting them anywhere public._

## 0. The short version

1. **The editor is the letter.** No toolbar, no format bar, no slash menu. The page has two postures: *at
   the desk* (writer, controls, share) and *writing* (paper, ink, caret). Typing hides the desk; moving
   the pointer, Esc or Done brings it back. It never comes back on a timer.
2. **The caret is the pen, and its shape says what typing will do:** an ink dot at the end, a faint
   proofreader's ‸ mid-text in Ink, a promise to strike over a selection.
3. **UI never looks like ink.** Selection is a warm highlighter swipe in a UI colour. Only the writer marks
   the paper.
4. **Handwriting-native formatting only:** underline by hand (⌘U, and ⌘I, because an underline *is*
   handwriting's italics), press harder (⌘B), P.S. (⌘↩), sign it. Nothing else.
5. **Signature moments:** the pen catches up; the ink dries (and undo lasts exactly as long as it's wet);
   corrections in character; make a fair copy; the letter arrives being written.

---

## 1. What the app does today

From `app/README.md`, `App.tsx` and `PaperEditor.tsx`. A hidden 16 px textarea holds the text, and the
handwriting carries a 1.5 px caret line in the ink colour, blinking, at 85% while focused and 18% at rest.
Selection is the ink colour at 16%. An empty sheet shows *"Start writing your note…"* in italic UI type.
The header says "Click the letter to write on it", and while writing on desktop it says "Writing. Press Esc
when you're done." Up, Down, Home and End follow the written lines. Desktop has a fixed 336 px panel;
mobile has a dock that slides away while editing, and a "Done" pill appears top right. "Edit as plain text"
opens a normal field under the sheet. Everything lives in the URL hash. The worker re-writes the page in
about 56 ms per keystroke, so today's editing is effectively Fair copy. (The live app at localhost:5173
was mid-edit by another session during this research and showed a blank page; observations come from the
code and one earlier screenshot.)

---

## 2. Prior art

### 2.1 Apple Notes

| What | How Notes does it | What we take |
|---|---|---|
| Empty note | Caret on line 1, no chrome; the first line becomes the title, and Settings › Notes › "New Notes Start With" picks Title, Heading or Body (not re-checked) | The first line deserves a role: ours is the salutation, prompted by a handwritten placeholder |
| Aa format sheet | Replaces the keyboard at the same height: Title, Heading, Subheading, Body, Monostyled; B I U S; highlighter and colour; lists, indent, quote ([Mobbin](https://mobbin.com/screens/ec3af570-30ff-42b1-96b3-2856babffc74)) | Swap a panel *into the keyboard's space* rather than stacking bars. Our tray menu does this |
| Keyboard accessory (iOS 26) | One row: Aa, checklist, table, attachment, markup pen ([Mobbin](https://mobbin.com/screens/f3dafb4e-2677-4bde-9b7d-9cd0095b5766)). Keyboard down, the same tools float as a capsule ([Mobbin](https://mobbin.com/screens/f22d177b-8059-4209-b028-2073fbba6a7a)). Top bar: back, undo, share, more, a round yellow ✓ | A single 44 px tray above the keyboard, one accent, one Done |
| **Lines & Grids** | A sheet titled "Lines & Grids": *"Change the line or grid style for handwriting in this note"*, with none, three line pitches and three grids ([Mobbin](https://mobbin.com/screens/cafeca26-6d1e-46d3-a944-09bd77f23ee2)). The rules sit under the drawing area, below the typed text ([Mobbin](https://mobbin.com/screens/8fa54f4b-6d25-4b49-9b8b-8a55a2cedcb6)) | **Apple's paper is for the pencil only; typed text ignores it.** Seedhand's whole point is that typing lands on the rules. That's our gap to own |
| Scribble, Smart Script | Scratch out to delete, circle to select, touch and hold to insert, a vertical line to join or split ([Apple](https://support.apple.com/en-kz/guide/pages-ipad/tan36493d985/ipados)). Smart Script respells words in your hand and pastes typed text as handwriting; it falls short where it's "a little too perfect" or where ink reflows ([MacStories](https://www.macstories.net/stories/ipados-18s-smart-script-a-promising-start-but-dont-toss-your-keyboard-out-yet/)) | Already in `writing-experience.md`: paste is written out with full variation, and ink never reflows |
| Text and drawing | Drawings sit as blocks between paragraphs; Math Notes writes the answer in a handwriting-like style in the accent colour, with a floating pen tray ([Mobbin](https://mobbin.com/screens/f8626939-ad75-4663-89f5-ccc860314327)) | The app's reply in "handwriting" is accepted UX. Our tray floats the same way |
| Caret, selection, undo | Selection handles plus a horizontal edit menu; shake to undo, three-finger swipe left to undo, right to redo (not re-checked). In a web textarea, shake arrives as `inputType: "historyUndo"` ([DEV](https://dev.to/charperbonaroo/undo-typing-2chb)) | Route system undo gestures to our wet-ink rule; also show a visible ↶ |
| Sharing | Share sheet and collaboration, with an activity view and colour-coded highlights of who changed what (not re-checked) | We don't collaborate. We *replay*: the recipient sees the letter being written |
| Quick Note | Summoned from a screen corner (swipe from the bottom-right on iPad, a hot corner or Globe+Q on Mac) as a small floating note (not re-checked) | A note you can summon in one move. A future Seedhand "postcard" could open straight to a fresh card |

### 2.2 Notion

| What | How Notion does it | What we take |
|---|---|---|
| Empty page | A grey "New page" title placeholder and a quiet "Get started with" row (Ask AI, AI Meeting Notes, Database, Form, Templates) at the bottom ([Mobbin](https://mobbin.com/screens/e4e12e4b-a7eb-4e47-a491-502fa8c06b11); Notion's help says starting options sit "at the bottom of the page": [Notion](https://www.notion.com/help/create-your-first-page)). On iOS, only a caret and template chips above the keyboard ([Mobbin](https://mobbin.com/screens/e1f4852b-5b5c-4f70-858d-bb024afd4dc2)) | Placeholders and suggestions that go away on the first keystroke |
| "/" and blocks | Everything is a block with a type, properties and children; "Turn into" changes only the type ([Notion](https://www.notion.com/blog/data-model-behind-notion)). An empty line reads "Press 'space' for AI, '/' for commands…" (2023 wording: [userstyle](https://userstyles.world/style/9202/notion-hide-placeholder-text); current wording unverified). Markdown shortcuts at a line start: `# `, `- `, `[]`, `" ` ([Notion](https://www.notion.com/help/keyboard-shortcuts)) | **No slash menu for us:** a "/" is a real character in a letter, and a letter has no blocks. We do keep one markdown-style shortcut, "- " |
| Selection toolbar | Floats above the selection: bold, italic, strikethrough, code, comment, colour and highlight ([Notion](https://www.notion.com/help/customize-and-style-your-content), [Mobbin](https://mobbin.com/screens/789e9836-c03b-4fb7-a80e-85a38e06d857)) | A selection chip, cut to four things a pen can do |
| Hover handles | **+** in the left margin on a new line, **⋮⋮** on any hovered block: drag to move, click for Turn into, Color, Duplicate, Delete and more ([Notion](https://www.notion.com/help/writing-and-editing-basics)) | Controls appear only where your attention already is. Our margin tag follows this |
| Mobile | No hover and no "/" on mobile; a toolbar above the keyboard (mention, comment, image, indent, colour, •••, +) that changes with the block being edited ([Notion](https://www.notion.com/help/notion-for-mobile), [release notes](https://www.notion.com/releases/2021-07-14)) | One strip above the keyboard |
| Calm | Notion's designer Ryo Lu says tools should arrive "in the simplest, smoothest way possible" ([Notion](https://www.notion.com/blog/the-design-thinking-behind-notion-ai)). Versions save silently every 10 minutes and 2 minutes after the last edit ([Notion](https://www.notion.com/help/duplicate-delete-and-restore-content)) | Calm comes from what is *absent* until asked for, and from never asking you to save |

### 2.3 Journaling: Apple Journal and Day One

- **Apple Journal** opens a sheet of suggestions and reflection prompts, with a two-arrow button for a new
  prompt ([MacRumors](https://www.macrumors.com/how-to/use-apple-journal-app/)); inside an entry the prompt
  is a dismissable card above the text ([Mobbin](https://mobbin.com/screens/8e8b0fd2-c94d-4658-93c6-9b034afa4a88)).
  Formatting started as B, I, U and strikethrough only ([MacStories](https://www.macstories.net/reviews/apples-journal-app-journaling-for-all/));
  iOS 18 added colours, lists and quotes ([9to5Mac](https://9to5mac.com/heres-everything-new-in-the-journal-app-for-ios-18/)).
- **Day One** has one Daily Prompt per date for everyone, with Answer, Shuffle, See more and "Dismiss
  Today's Prompt" ([Day One](https://dayoneapp.com/guides/tips-and-tutorials/daily-writing-prompts/)),
  and Focus Mode only on the web, "a scaled back version of the editor" ([forum](https://forums.dayoneapp.com/forums/topic/distraction-free-mode-aka-hide-the-sidebar/)).
- Smaller journals put the prompt in a serif card above the field ([5 Minute Journal](https://mobbin.com/screens/7f5129e8-0de8-4050-8fe7-d0cf033442f3)).

**Take:** prompts sit *outside* the writing, can be shuffled and dismissed, and never pre-fill the text.

### 2.4 More note-taking: Bear, Craft, Obsidian, Things, Keep, Evernote

- **Bear:** a slim bar (undo, redo, #, format) and a *formatting keyboard* that replaces the keys at the
  same height ([Mobbin](https://mobbin.com/screens/6023ab9e-788e-4fe4-b3bd-d10624e6edac)).
- **Craft:** a floating style card (Heading, Body, Page, Focus, Block, colour), and blocks restyled by
  swiping left or right on them ([Mobbin](https://mobbin.com/screens/443b7d21-d5eb-487a-8aa7-5a79186222cd)).
- **Evernote:** "Title" and "Start writing" placeholders, template chips and a dense format row on the
  empty note ([Mobbin](https://mobbin.com/screens/168c3f9a-1190-4e69-b8d3-c8e24622f99a)). The opposite of calm.
- **Obsidian Live Preview:** "When your cursor enters formatted content, the underlying syntax becomes
  visible" ([Obsidian](https://obsidian.md/help/edit-and-read)). Bear 2 hides markup until you select it
  ([Bear](https://blog.bear.app/2023/07/bear-2-is-here/)), and Bear's new Lettera shows syntax only on the
  line you're editing ([9to5Mac](https://9to5mac.com/2026/06/19/bear-app-developers-announce-lettera-a-beautiful-markdown-editor-for-mac/)).
  Same idea as our "thought before ink" and ‸ preview: machine marks show only where you're working.
- **Things 3** keeps Markdown syntax always visible in notes, with no colour, and caps notes at 10,000
  characters ([Cultured Code](https://culturedcode.com/things/support/articles/4651820/)). **Google Keep**:
  "Take a note", then Done; Esc or Ctrl+Enter finishes ([Google](https://support.google.com/keep/answer/12862970?hl=en)).
  Neither is on Mobbin.

### 2.5 Focus: iA Writer and Ulysses

iA Writer's Focus Mode dims all but the sentence or paragraph; its Typewriter scope holds the caret line
centred, and iA itself says to turn Focus off when editing because selection can make the screen jump
([iA](https://ia.net/writer/support/editor/focus-mode)). Style Check greys and strikes fillers *without
deleting them* ([iA](https://ia.net/topics/introducing-style-check)): a strikethrough as a suggestion, not a
loss. Ulysses dropped its single Typewriter Mode in v39 (November 2025) for separate switches (line marker,
fixed scrolling) and renamed Editor Focus to "Hide Interface" ([Ulysses](https://ulysses.app/release-notes/)).
**Take:** a comfort band, not a fixed line, and no scrolling while selecting.

### 2.6 Typewriters and "no editing"

Freewrite allows only backspace, page review and WASD, because "friction is the enemy" of flow and editing
is a separate session ([Freewrite](https://support.getfreewrite.com/general/can-i-edit-on-a-freewrite)).
Hemingway splits Write from Edit with one button ([Hemingway](https://hemingwayapp.com/help/docs/highlighted-issues)).
Ghost's Hemingway mode only disabled Backspace ([Ghost](https://blog.ghost.org/hemingway-mode)), and leaked
(see `writing-experience.md`). **Take:** drafting and tidying are two moments; ours are Ink and *Make a
fair copy*.

### 2.7 Paper apps: Goodnotes, Notability, Paper, Procreate

- **Goodnotes:** typed text does **not** snap to ruled lines; "Align typed text with a template's
  horizontal bars" is a long-standing request, and users fake it with 38 pt text at 45.51 pt spacing
  ([feedback](https://feedback.goodnotes.com/forums/191274-customer-suggestions-for-goodnotes/suggestions/3593349-align-typed-text-with-a-template-s-horizontal-bars)).
  Text boxes don't flow to the next page. Scrolling is horizontal or vertical by setting
  ([Goodnotes](https://support.goodnotes.com/hc/en-us/articles/7353695996559)).
- **Notability:** tap anywhere with the text tool to type on the page; text boxes have their own paper
  setting ([Notability](https://intercom.help/notability/en/articles/16300260)).
- **Paper by FiftyThree** undid with *Rewind*: circle two fingers anticlockwise to scrub back through
  strokes, faster spins rewind more, from a designer recreating a film editor's jog dial
  ([MIT Tech Review](https://www.technologyreview.com/s/427434/if-an-ipad-and-a-moleskine-had-a-child/),
  [MacStories](https://www.macstories.net/news/paper-1-1-now-available-with-faster-ink-move-duplicate-and-easy-add-features/)).
- **Procreate:** two-finger tap undoes, holding starts rapid undo after 0.65 s by default
  ([Procreate](https://help.procreate.com/procreate/handbook/interface-gestures/gestures)).

**Take:** the gap is real: no paper app puts *typed* text on the rules, and none flows it across sheets.
Undo on a physical medium works best as scrubbing time, which is our replay.

### 2.8 Google Docs suggestion mode

"Suggesting" (from the Editing menu, top right) shows new text in a colour and crosses out deletions,
each change with an ✓/✗ card in the margin and a preview of accept-all
([Google](https://support.google.com/docs/answer/6033474)). Similar on Mobbin: red strike plus coloured
insert ([Contractbook](https://mobbin.com/screens/968997b3-cd88-45df-ba9d-a67c15c5c18e)),
inline ✓ ✗ ([Ditto](https://mobbin.com/screens/1acf2606-62aa-4e11-805f-dd091dcc8d1d)).
**Take:** people already read a strikethrough as "changed my mind, kept visible". Our cross-outs inherit
that literacy. A "clean view" toggle is the Docs preview, and for us it's Fair copy.

### 2.9 Stationery and card apps

- **Givingli** is the closest: you type straight onto the card in a handwriting font inside a draggable
  box, with Card / Message / Envelope tabs, "Write It" vs "Handwrite", and AI "Let Us Help" tones (Casual,
  Sassy, Heartfelt, Funny) ([Mobbin flow](https://mobbin.com/flows/43232496-c1c9-4262-80ff-2c70489c8e68),
  [AI flow](https://mobbin.com/flows/ec22b3ba-4645-42db-9d51-ee4e5379a11f), [web](https://mobbin.com/screens/98ff812c-9d3e-49d9-852d-4dffd9787175)).
  The text is a box *on* the card, not writing *in* it.
- **Apple Invites:** font chips above the keyboard and a Preview button ([Mobbin](https://mobbin.com/screens/1db5ca05-1755-4b55-aeef-841d870bf484)).
- **Gift messages** in commerce apps are plain fields with counters, "250 characters remaining"
  ([Instacart](https://mobbin.com/screens/f4d941ea-cee8-4427-bffe-9cfe37a0c8fc)), 0/300
  ([Uber Eats](https://mobbin.com/screens/2366541a-711d-45e8-b912-cf9ea6eb806c)).
- **Postable** uses handwriting "Smart Fonts" with contextual alternates, one font per card; you can't set
  the size, the text "shrinks as you type" to fill the card, and about 400 characters is the advised
  maximum ([Postable](https://www.postable.com/faq)).
- **Handwrytten** has a "Your Message" box with a character count and "a live preview" to the right, a
  500-character limit, "Maximize" to fill the space, and robots writing "with a real pen"
  ([Handwrytten](https://www.handwrytten.com/resources/how-to-send-a-handwritten-card-online/)).
- **Felt** lets you write with a finger or stylus, or type in fonts; reviewers complain the writing sits in
  different places in preview and draft ([App Store](https://apps.apple.com/us/app/felt-greeting-cards-gifts/id921902664)).
  **Ink Cards** offers "RealScript" handwriting ([App Store](https://apps.apple.com/us/app/-/id477296657)).
  **Paperless Post** shows the actual card and you click anywhere to edit ([Brit + Co](https://www.brit.co/paperless-post/)).
  **Punkpost** had artists hand-letter what you typed ([TechCrunch](https://techcrunch.com/2016/04/11/these-two-apps-let-you-pretend-you-actually-handwrote-that-greeting-card)).

**Take:** card apps either hide the message in a form with a counter, or float a font box over the art.
The best feedback is Postable's: the card fills up and the writing gets smaller. None lets the message
*fill the card the way a hand does*, cramming at the edge. That's ours, and our honest limit is "the sheet
is full", not a character counter.

### 2.10 Text on a canvas

Instagram's text tool: a vertical size slider on the left edge, font chips above the keyboard, a row for
colour, animation ("Typewriter", "Pop"), effects and alignment, and Done top right
([Mobbin](https://mobbin.com/screens/037632e0-7ce7-47f4-b643-fa6afb21c36a),
[Mobbin](https://mobbin.com/screens/07931b0a-c5ba-4d9d-84f7-4f03a2076424)). Canva and Adobe Express put a
full inspector beside the canvas ([Givingli web](https://mobbin.com/screens/98ff812c-9d3e-49d9-852d-4dffd9787175),
[Adobe Express](https://mobbin.com/screens/619f7594-a0b3-4117-a62b-ebfeb5cbb535)). Meta's engineers built
Instagram's Typewriter style as a character-by-character reveal with "a blinking cursor", and warn that
revealing one code point at a time breaks joined scripts such as Persian and multi-part emoji
([Meta](https://engineering.fb.com/2022/07/18/developer-tools/building-text-animations-for-instagram-stories/)).
Snapchat puts caption styles "above the keyboard" ([Snapchat](https://help.snapchat.com/hc/en-us/articles/7012322034196-How-do-I-add-text-to-a-Snap)).
Figma: T, click for auto-width or drag for a fixed box, double-click or Enter to edit
([Figma](https://help.figma.com/hc/en-us/articles/27378154668951-Adjust-text-dimensions-and-resizing)).
Canva on mobile hides the keyboard when you pick a style tool so the options can show
([Canva](https://www.canva.com/help/add-and-edit-text/)). **Take:** on a phone, everything lives in one
strip just above the keyboard; a deeper menu takes the keyboard's place; the canvas stays in view.

### 2.11 Rafael's library

- A typewriter-cursor wordmark where "Make it your" corrects itself to "Make it you", a lesson in how a
  visible correction reads as personality ([Are.na](https://www.are.na/block/22228626)).
- The animation rule "the gesture should be what the object already means, happening once"
  ([bakai.me](https://t.co/AhUEVtBmIH)): the ink dries, the page turns, the sheet lifts. No bounces.
- Vellum pages layered over opaque print ([post](https://x.com/janjirasun/status/2114084960479084830)):
  the fair copy over its draft.
- Hermes, an editor whose AI helps you think but "refuses to write for you"
  ([post](https://x.com/seanxthielen/status/2026354478040182800)).
- A journal worksheet reduced to one circled word and one handwritten line
  ([Pinterest](https://uk.pinterest.com/pin/322077810861082373/)): restraint.

### 2.12 Patterns worth borrowing

| Pattern | Seen in | Our version |
|---|---|---|
| Chrome hides while typing, returns on the pointer | iA, Ulysses "Hide Interface" | The two postures (3.2) |
| Placeholder that vanishes on the first key | Notion, Evernote, Notes | A placeholder *in the writer's hand*, in graphite |
| Floating selection toolbar | Notion | Selection chip: Cross out · Rewrite · Underline · Copy |
| A panel that takes the keyboard's place | Apple Notes Aa, Bear, Notion + | Tray menu on mobile |
| One strip above the keyboard | Notes, Instagram, Apple Invites | The 44 px pen tray |
| Typewriter scrolling | iA, Ulysses | A comfort band, paused while selecting |
| Strikethrough means "changed, still visible" | Google Docs, iA Style Check | Ink cross-outs, with Fair copy as the clean view |
| Prompt beside the writing, shuffle and dismiss | Journal, Day One | Optional starters, never pre-filled |
| Undo as scrubbing time | Paper's Rewind, Procreate hold | Replay, and the recipient's view |
| Paper as a per-note choice | Notes Lines & Grids, Goodnotes | Already ours, and typed text actually lands on it |

---

## 3. Our editor

### 3.1 Principles

1. **The editor is the letter.** One surface: the sheet. Anything that is not the letter is either gone
   while you write or sits in the sheet's margins in small, faint UI type that never prints.
2. **Two postures, not modes of chrome.** *At the desk* (not writing) shows the writer, the hand controls,
   share and download. *Writing* shows paper, ink and a caret. The switch is automatic: typing hides,
   moving the pointer or pressing Esc returns.
3. **The caret tells you what typing will do.** At the end of the letter it is the pen at rest. Mid-text in
   Ink it previews the proofreader's ‸. Over a selection it promises a strike. Nobody should learn the
   correction rules by surprise.
4. **UI never looks like ink.** Selection, caret previews and hints use UI colours and the UI font. Only
   the writer makes marks on the paper (PRINCIPLES rule 5).
5. **Every timing has a physical reason.** The pen trails because hands are slower than fingers. Undo lasts
   as long as the ink is wet. Pages turn when they are full. If a timing has no physical story, it is UI
   and it should be fast (under 200 ms).
6. **Calm by subtraction** (Notion, Notes). No toolbar row, no format bar, no slash menu. Power lives in
   shortcuts, the selection chip and one summoned tray.

### 3.2 Layout and the two postures

Desktop, at the desk (today's layout, unchanged):

```
+--------------------------------------------------------------+------------------+
| Seedhand                         Click the letter to write   |  Yara Bellamy    |
|                                                              |  quiet-heron-17  |
|            +----------------------------+                    |  [New hand]      |
|            |  Dear Ada,                 |                    |  Style  ...      |
|            |  The little letters never  |                    |  Neatness ----o- |
|            |  quite match, and that is  |                    |  Paper  [] [] [] |
|            |  the point. ...            |                    |  Mode  Ink|Pencil|Fair
|            |                  Yours, O. |                    |  [Share] [Download]
|            +----------------------------+                    |                  |
+--------------------------------------------------------------+------------------+
```

Desktop, writing (after the second keystroke):

```
+---------------------------------------------------------------------------------+
|                                                                                 |
|                 +----------------------------------+                            |
|          ink ·  |  Dear Ada,                       |   <- margin tag, 11 px UI, |
|                 |  The little letters never quite  |      40% opacity, clickable|
|                 |  match, and that is the point.   |                            |
|                 |  See you on Sunday at 7:30.●     |   <- ● the pen at rest     |
|                 |                                  |                            |
|                 |                                1 |   <- page number, the hand |
|                 +----------------------------------+                            |
|                                                                                 |
+---------------------------------------------------------------------------------+
   panel: opacity 0, translateX(12px), pointer-events none. Returns on pointer move > 8 px or Esc.
```

The panel *returns on pointer movement only*, never on an idle timer: letter writers pause for a long
time mid-sentence, and chrome that reappears during a thinking pause is the worst kind of interruption
(iA Writer and Ulysses also tie chrome to the pointer).

### 3.3 States

| State | Trigger | Paper | Caret | Chrome |
|---|---|---|---|---|
| **Empty** | Fresh sheet | Faint graphite placeholder in the hand ("Dear …,"), 22% opacity, not ink | Ink dot at line 1, breathing | Desk posture |
| **Typing** | Keystrokes | Ink being laid down; faint "thought" letters ahead of the pen | The moving pen | Hidden after 2nd key within 1.5 s |
| **Idle** | No keys for 1.2 s | Last ink drying | Dot breathing | Still hidden until the pointer moves |
| **Selecting** | Drag, double-click, Shift+arrows | Highlighter tint over the glyphs | Hidden | Selection chip (pointer selections only) |
| **Correcting** | Edit on inked text | Pen hovers over the spot, then strikes / overwrites / inserts | ‸ preview or hovering pen | Hidden |
| **Turning** | Sheet full | New sheet laid below; page number written | Pen moves to line 1 | Hidden |
| **Sharing** | Share or Download | Sheet lifts (shadow deepens) | Hidden | Desk posture plus toast |

### 3.4 Interactions, end to end

**First visit.** The sample letter writes itself in front of you at 3× (about 6 s, any key or click
finishes it), ending with the writer's initial. Under the sheet, one line: *"This is Yara's hand. Click the
letter to change it, or start a fresh sheet."* This is the Apple Notes lesson inverted: Notes opens on an
empty note because everyone knows what a note is. Nobody knows what Seedhand does until they see a hand
write, so the first two seconds must be motion, not an empty page.

**The empty sheet.** The caret waits on line 1 at the left margin. A placeholder sits on the line, written
in the current hand in graphite at 22% (Notion's "Press '/' for commands" placeholder, but in the writer's
own hand, so the page itself teaches that your typing becomes this hand). It disappears on the first
keystroke (120 ms fade). Placeholders rotate by paper: "Dear …," on letter paper, today's date on a
notebook page. No starter chips in v1; if we add them later, use Notion's pattern exactly: a quiet row
below the sheet that vanishes on the first keystroke.

**Starting to write.** Click or tap anywhere on the sheet. Below the last line, the caret goes to the end
of the text (you cannot leave ink floating mid-page by clicking in empty space; a real pen can, but that is
a v2 "write anywhere" feature). The first keystroke starts the pen. The *thought*: characters still in the
pen's buffer are drawn at 14% opacity in their final positions, then the pen inks over them. Backspace on
thought letters fades them in 80 ms, cleanly. That makes the pen trail readable and makes the grace visible:
you can see which letters are still only a thought.

**The caret.** One rule: the caret is the pen, and its shape says what typing will do.

| Where | Ink | Pencil | Fair copy |
|---|---|---|---|
| At the end | **Ink dot** on the baseline: diameter max(3 px, pen width × 1.6) in the ink colour, plus a 1 px hairline up to x-height at 30%. Breathes 0.85 ↔ 0.3 over 1.2 s; solid for 600 ms after each key | Graphite dot, same geometry | Today's 1.5 px line |
| Mid-text | The dot plus a **‸ preview** under the baseline in UI amber at 45%: "typing here goes above the line" | Dot only (pencil rewrites the line) | Line |
| On a selection | No caret; the selection chip explains | same | same |
| While the pen writes | The pen tip itself; no separate caret | same | n/a |
| Blurred | 18% dot, no breathing | same | 18% line |

We reject a drawn pen-nib icon: at text size it reads as a cursor costume and hides the letters you are
looking at. A dot is where a nib touches paper anyway. I found no editor that uses an ink-dot caret, so
this is new ground. Breathing instead of a hard blink is deliberate, but it must stay clearly visible:
a caret that doesn't blink "is much harder for users to recognize"
([Igalia](https://blogs.igalia.com/schenney/caret-customization-on-the-web/)). Windows blinks at 500 ms by
default ([Raymond Chen](https://devblogs.microsoft.com/oldnewthing/20240916-00/?p=110272)); our 1.2 s
cycle is slower, so test it. Apple's 2023 cursor redesign added colour and a dictation glow
([WWDC23](https://developer.apple.com/videos/play/wwdc2023/10058/)): a caret can carry state, which ours does.

**Selection.** Yes to Rafael's highlighter swipe, as UI: a warm translucent amber (`#f3d27a` at 38%,
multiply) per glyph run, following each line's wandering baseline, 3 px radius with a seeded ±1 px wobble
on the ends. On mouse-up or double-click it sweeps left to right in 120 ms. It is never ink-coloured, never
exported, and fades to 15% when the paper loses focus. In Ink and Pencil, a pointer selection shows a
**selection chip** 8 px above it after 200 ms: `Cross out · Rewrite · Underline · Copy` (Notion's floating
toolbar, cut to the four things a pen can do). Keyboard users get the same through keys: ⌫ crosses out,
typing rewrites above, ⌘U underlines.

**Deleting and correcting.** The planner in `writing-experience.md` §3.4 decides *what* happens; this is
how it feels:

| You do | Ink | Pencil | Fair copy |
|---|---|---|---|
| Backspace on thought letters | Clean, 80 ms fade | same | Clean |
| Backspace on wet ink (within the drying window) | Ink lifts: 160 ms fade with 0.5 px blur, like a blot | Erased | Deleted |
| Backspace on dry ink, then retype | Pen hovers 1.2 s (the writer considering), then overwrites one letter or strikes the word and rewrites it after | Erased with a ghost, rewritten in the gap | Deleted, reflows |
| Select + Delete | Strike in the writer's habit, 0.2–0.3 s per line | Erase, smudge halo | Deleted |
| Select + type | Strike, then the replacement written above, smaller | Erase, rewrite over the ghost | Replaced |
| Type mid-text | ‸ and an insertion above the line, written live | Line rewritten to its end | Inserted, reflows |
| Select all + Delete | Fresh sheet; the old one to the drafts pile, "Bring it back" toast for 6 s | same | Cleared, undoable |

After the third visible correction on a sheet, a faint **Make a fair copy** link appears in the bottom
margin (UI type, 40%). It is the one contextual nudge in the editor.

**Handwriting-native formatting.** A pen has no bold or italic, so we map shortcuts to what writers actually
do, and to the old manuscript convention that an underline means "set in italics" and a wavy underline
means "bold" ([Underline](https://en.wikipedia.org/wiki/Underline)):

| Shortcut | Result on paper | Notes |
|---|---|---|
| ⌘U or ⌘I | A hand-drawn underline under the word or selection, drawn after the word like a real afterthought | Press again for a double underline. ⌘I maps here because underlining *is* handwriting's italics |
| ⌘B | "Pressed harder": weight × 1.3, size × 1.06 | Real emphasis is pressure and size |
| Caps Lock | Capitals in the hand | Already works |
| ⌘↩ | **P.S.**: the pen drops below the sign-off after a 1.2-line gap, writes "P.S." smaller and quicker | From `writing-experience.md` |
| "- " at a line start | A hand dash with a hanging indent | Like Notion's markdown shortcuts, but only the ones a letter needs |
| Sign | The panel's **Sign it** writes the writer's signature (the existing `Signature` component) below the last line | Desk action |

No headings, colours, fonts, lists beyond dashes, or alignment. A letter that needs those is a document.

**Paragraphs, lines, pages.** Enter at the pen starts a new line; Enter twice skips a rule. Some hands
indent new paragraphs (a seeded habit, engine side). Wrapping follows `writing-experience.md` §4.4. While
writing, the view keeps the pen line inside a *comfort band* 35–60% down the viewport and scrolls only
when the pen leaves it (280 ms ease-out): iA Writer's typewriter scrolling without the constant motion.
When a sheet fills, a new one is laid below (320 ms, rises 12 px into place), the view scrolls to it, and
**the writer numbers it**: "2" or "– 2 –" in the top corner in their hand, as letter writers did. Earlier
sheets stay stacked above, readable.

**Mobile, keyboard up.** The sheet stays full width and is never zoomed (zooming loses the letter's
shape). With the keyboard up, the visible area is about 360–420 px on a phone; the pen line is held 40%
down that area, so four to six written lines show above it. A **pen tray** floats 8 px above the
keyboard: `[Ink ▾]  [↶]  ···  [Done]`, 44 px tall, 12 px side insets, the panel colour at 94% with blur.
`Ink ▾` opens a sheet with the modes, Underline, P.S. and Make a fair copy. `↶` is the wet-ink undo; it
dims when nothing is wet. Done (or a downward swipe on the paper) drops the keyboard and returns the
dock. Position the tray and the scroll from `visualViewport` height and `offsetTop` (works in every major
browser; iOS Safari doesn't resize the layout viewport for the keyboard:
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API)). Add
`interactive-widget=resizes-content` for Android Chrome and Firefox; Safari doesn't support it yet
([caniuse](https://caniuse.com/mdn-html_elements_meta_name_viewport_interactive-widget)). The VirtualKeyboard
API is Chromium-only ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API)), so treat
it as a bonus. Keep the textarea at 16 px so iOS doesn't zoom, and test on iOS 26, where developers report
`visualViewport.height` staying short after the keyboard closes ([Apple forums](https://developer.apple.com/forums/thread/800125)).

```
+---------------------------+
| 9:41                      |
|  +---------------------+  |
|  | Dear Ada,           |  |
|  | The little letters  |  |
|  | never quite match,  |  |
|  | and that is the     |  |
|  | point. See you on●  |  |  <- pen line held ~40% down the visible area
|  |                     |  |
|  +---------------------+  |
| [Ink v]  [<-]    [Done]   |  <- pen tray, 44 px
| q w e r t y u i o p       |
| a s d f g h j k l         |
|   z x c v b n m   <x]     |
+---------------------------+
```

**Undo.** In Ink, ⌘Z lifts only wet ink, and the drying window depends on the pen, because real inks dry
at different speeds: ballpoint 2 s, felt 3 s, gel 4 s, fountain 6 s (fast fountain inks dry in about
4–7 s: [Pen Chalet](https://www.penchalet.com/blog/fast-drying-fountain-pen-inks-which-ink-dries-the-quickest/)).
After that, ⌘Z shows a quiet note under the sheet: *"That's dry now. Backspace crosses it out."* (shorter and
kinder than "The ink is dry. Cross it out, or start a fresh sheet."). Pencil and Fair copy have a normal
undo stack. On iPhone, shake-to-undo and the three-finger swipe reach the hidden textarea as an input event
with `inputType: "historyUndo"` ([DEV](https://dev.to/charperbonaroo/undo-typing-2chb)), so we route them to
the same wet-tail rule; the tray's ↶ is the visible alternative.

**Share and download.** At the desk: **Share link** and **Download** (exists). The sheet lifts for 180 ms
(shadow deepens, scale 1.01) as the toast appears. New: **Download** offers *Image*, *PDF at true size*
and *Writing only* (a transparent PNG at true scale, to print onto your own notepaper). A shared link
opens in a **reader view**: no panel, the sheet centred, and on first open the letter is *written in
front of the recipient* at 3×, corrections included, tap to finish. Under it: the writer's name and
"Write your own".

### 3.5 Where the controls live

| Control | At the desk | While writing | Summon while writing |
|---|---|---|---|
| Hand, style, sliders, paper, ink | Panel (desktop), drawer (mobile) | Hidden | Move the pointer; on mobile, Done |
| Mode (Ink, Pencil, Fair copy) | Panel | Margin tag (desktop), tray (mobile) | Always visible, faint |
| Undo | ⌘Z | ⌘Z, shake, tray ↶ | n/a |
| Make a fair copy | Panel | Bottom-margin link after 3 corrections; ⇧⌘↩ | Tray menu |
| Underline, P.S. | Shortcuts | Shortcuts, selection chip | Tray menu |
| Share, download | Panel, dock | Hidden | Esc |

So: **hidden** for everything about the hand, **in the margin** for the two things about the letter (mode
and fair copy), and **summoned** by the pointer, Esc or Done. No permanent toolbar.

### 3.6 Signature moments

1. **The pen catches up.** Your words appear first as a faint thought, then the writer's pen inks over
   them a few letters behind you. Quick fixes vanish before ink touches paper. No other editor shows the
   gap between thinking and writing.
2. **The ink dries.** Fresh ink is slightly darker and glossier (density × 1.12, a 4% highlight) and
   settles to its dry tone over the pen's drying window. While it shines you can lift it with ⌘Z; once it
   is matte, it is part of the letter. The undo rule is something you can *see*.
3. **Corrections in character.** Ottilie strikes with one quick rising line; Bram scribbles; Mei overwrites
   the letter in place. The caret warns you with a ‸ before you insert. The writer's card says how they
   fix things ("crosses out with a single neat line").
4. **Make a fair copy.** A fresh sheet slides over the draft (360 ms, rotated −1°, offset 6 px), the draft
   shows faintly through it like vellum, and the writer copies the letter out cleanly at 4× (capped at 6 s,
   tap to finish). The draft goes to the pile.
5. **The letter arrives being written.** The recipient doesn't open an image; they watch the hand write it,
   corrections and all, from the ink log. A letter with a visible history is the whole point of ink.

Turning the page (with the hand numbering the sheet) is the sixth, smaller moment.

### 3.7 Specs

**Spacing.**

| Element | Value |
|---|---|
| Sheet scale | min(3.9 px/mm, desk width ÷ sheet width), as today |
| Margin tag | 11 px Instrument Sans, 40% text colour, in the left margin at the first baseline, 8 px from the paper edge |
| Page number | In the hand, 0.8× size, top right inside the margin |
| Selection chip | 32 px tall, 8 px above the selection's top line, 6 px radius, panel colour, the existing shadow; 10 px gaps between items |
| Pen tray (mobile) | 44 px tall, 8 px above the keyboard, 12 px side insets, 22 px radius |
| Comfort band | Pen line kept 35–60% down the viewport (desktop), 40% of the visible area (mobile) |
| Hit targets | 44 px on touch, as `pointer-coarse` styles already do |

**Motion** (UI uses the existing `--ease-out`; physical motion uses kinematic timing):

| Moment | Duration | Curve |
|---|---|---|
| Chrome hides | 240 ms, after the 2nd key within 1.5 s | `--ease-out` |
| Chrome returns | 180 ms, on pointer move > 8 px or Esc | `--ease-out` |
| Caret breathing | 1.2 s cycle; solid 600 ms after each key | ease-in-out |
| Thought letter appears / is deleted | 60 ms / 80 ms | linear |
| Pen trail | Holds last 2 chars or 700 ms; 1.5×, up to 4× past 12 chars | kinematic |
| Pending fix hover | 1.2 s or the next word boundary | n/a |
| Strike | 0.2–0.3 s per line; scribble 1–2 s | kinematic |
| Ink drying | 2–6 s by pen | ease-out |
| Wet ink lift (undo) | 160 ms fade + 0.5 px blur | `--ease-out` |
| Selection sweep / chip | 120 ms / 140 ms after a 200 ms delay | `--ease-out` |
| Scroll to the pen | 280 ms | `--ease-out` |
| New sheet | 320 ms, rises 12 px | `--ease-drawer` |
| Fair copy sheet | 360 ms; writing capped at 6 s | `--ease-drawer` |
| Share lift | 180 ms | `--ease-out` |
| Reduced motion | Instant writing, no thought letters, no breathing; 120 ms crossfades | linear |

**Keyboard** (Mac shown; Ctrl on Windows):

| Key | Does |
|---|---|
| Click / tap the sheet | Start writing at that spot |
| Esc | Stop writing; the desk returns |
| ⌘Z / ⇧⌘Z | Lift wet ink (Ink) or undo / redo (Pencil, Fair copy) |
| ⌘U, ⌘I | Underline by hand; again for double |
| ⌘B | Press harder |
| ⌘↩ | Add a P.S. |
| ⇧⌘↩ | Make a fair copy |
| ⌘\\ | Show or hide the panel while writing |
| ⇧⌘C | Copy with corrections (transcription) |
| R (not writing) | New hand (exists) |
| Arrows, Home, End | Follow the written lines (exists) |
| Tab | Leaves the paper (focus moves on; no indent, so the paper is never a keyboard trap) |

Avoid ⌘1–9, ⌘N, ⌥⌘I: browsers own them.

### 3.8 What we deliberately leave out

Slash commands (a "/" is a real character in a letter), a format bar, fonts and colours per word, headings,
tables, images, comments, real-time collaboration, AI writing (Rafael's library has Hermes, an editor whose
AI "refuses to write for you", which is the right instinct for a letter tool), and free placement of text
anywhere on the page (v2).

---

## 4. Where Rafael's judgement matters

1. **Default mode for a first visit.** `writing-experience.md` says Ink. I agree, *because* of the
   bottom-margin "Make a fair copy" nudge and the Forgiving trail. If early testers feel trapped, switch the
   default to Fair copy and make Ink the thing you discover.
2. **Thought letters (14% ghosts ahead of the pen).** They make the trail readable and Backspace feel
   honest, but some people may read them as a rendering glitch. This is the first thing to prototype.
3. **Selection colour.** Warm amber highlighter (my pick) or today's ink tint at 16%. Amber is clearly UI;
   the ink tint is calmer but blurs the "UI never looks like ink" rule.
4. **Does the Pencil *pen* imply Pencil *mode*?** It would remove a control: choose the pencil and edits
   erase; choose any ink pen and edits cross out. Fair copy then becomes a single "Clean edits" switch.
5. **Recipient replay on by default.** I'd play it on first open. It is the emotional payoff, but it makes
   the recipient wait about 6 s (tap to finish).

## 5. Build order

1. Postures (chrome hides on the 2nd key, returns on pointer, Esc or Done) and the ink-dot caret: these
   help today's Fair copy editor before Ink exists.
2. Mobile pen tray positioned from `visualViewport`, and the comfort-band scroll.
3. The ‸ preview, selection chip and highlighter selection, alongside the Ink MVP in `writing-experience.md` §7.1.
4. Ink drying with pen-dependent undo windows, and the "That's dry now" note.
5. Handwriting formatting: underline, press harder, P.S., Sign it.
6. Page numbering and the new-sheet motion.
7. Fair copy over the draft, then the reader view with replay.

## Sources

**Mobbin** (screens viewed; nothing saved): Apple Notes [editor](https://mobbin.com/screens/f3dafb4e-2677-4bde-9b7d-9cd0095b5766),
[format sheet](https://mobbin.com/screens/ec3af570-30ff-42b1-96b3-2856babffc74),
[floating bar](https://mobbin.com/screens/f22d177b-8059-4209-b028-2073fbba6a7a),
[Math Notes](https://mobbin.com/screens/f8626939-ad75-4663-89f5-ccc860314327),
[Lines & Grids](https://mobbin.com/screens/cafeca26-6d1e-46d3-a944-09bd77f23ee2),
[lined note](https://mobbin.com/screens/dc7e5d8a-f469-41cc-98c7-2aff7e58b84c),
[lines under text](https://mobbin.com/screens/8fa54f4b-6d25-4b49-9b8b-8a55a2cedcb6) ·
Journal [prompt card](https://mobbin.com/screens/8e8b0fd2-c94d-4658-93c6-9b034afa4a88),
[editor](https://mobbin.com/screens/792366ac-8131-4d8f-96af-f2c1fcdba3f5) ·
Notion [iOS empty](https://mobbin.com/screens/e1f4852b-5b5c-4f70-858d-bb024afd4dc2),
[iOS blocks](https://mobbin.com/screens/23ebacc5-4ddd-4afc-ae8e-3a07063e80cd),
[web empty](https://mobbin.com/screens/e4e12e4b-a7eb-4e47-a491-502fa8c06b11),
[selection toolbar](https://mobbin.com/screens/789e9836-c03b-4fb7-a80e-85a38e06d857) ·
[Bear](https://mobbin.com/screens/6023ab9e-788e-4fe4-b3bd-d10624e6edac) ·
[Craft](https://mobbin.com/screens/443b7d21-d5eb-487a-8aa7-5a79186222cd) ·
[Evernote](https://mobbin.com/screens/168c3f9a-1190-4e69-b8d3-c8e24622f99a) ·
[5 Minute Journal](https://mobbin.com/screens/7f5129e8-0de8-4050-8fe7-d0cf033442f3) ·
Instagram [1](https://mobbin.com/screens/037632e0-7ce7-47f4-b643-fa6afb21c36a),
[2](https://mobbin.com/screens/07931b0a-c5ba-4d9d-84f7-4f03a2076424) ·
Givingli [text flow](https://mobbin.com/flows/43232496-c1c9-4262-80ff-2c70489c8e68),
[AI flow](https://mobbin.com/flows/ec22b3ba-4645-42db-9d51-ee4e5379a11f),
[web](https://mobbin.com/screens/98ff812c-9d3e-49d9-852d-4dffd9787175) ·
[Apple Invites](https://mobbin.com/screens/1db5ca05-1755-4b55-aeef-841d870bf484) ·
[Instacart](https://mobbin.com/screens/f4d941ea-cee8-4427-bffe-9cfe37a0c8fc) ·
[Uber Eats](https://mobbin.com/screens/2366541a-711d-45e8-b912-cf9ea6eb806c) ·
[Contractbook](https://mobbin.com/screens/968997b3-cd88-45df-ba9d-a67c15c5c18e) ·
[Ditto](https://mobbin.com/screens/1acf2606-62aa-4e11-805f-dd091dcc8d1d) ·
[Adobe Express](https://mobbin.com/screens/619f7594-a0b3-4117-a62b-ebfeb5cbb535) ·
[Goodnotes](https://mobbin.com/screens/0ed5e507-a487-4506-8172-290b7b7a2700).
Not on Mobbin: Day One, Things, Google Keep, Obsidian, iA Writer, Ulysses, Freewrite, Postable, Felt,
Paperless Post, Freeform.

**Rafael's library:** [typewriter cursor](https://www.are.na/block/22228626) ·
[icon animation rule](https://t.co/AhUEVtBmIH) · [vellum pages](https://x.com/janjirasun/status/2114084960479084830) ·
[Hermes](https://x.com/seanxthielen/status/2026354478040182800) ·
[journal worksheet](https://uk.pinterest.com/pin/322077810861082373/)

**Apple:** [Scribble gestures](https://support.apple.com/en-kz/guide/pages-ipad/tan36493d985/ipados) ·
[Smart Script (MacStories)](https://www.macstories.net/stories/ipados-18s-smart-script-a-promising-start-but-dont-toss-your-keyboard-out-yet/) ·
[Journal (MacRumors)](https://www.macrumors.com/how-to/use-apple-journal-app/) ·
[Journal (MacStories)](https://www.macstories.net/reviews/apples-journal-app-journaling-for-all/) ·
[Journal iOS 18 (9to5Mac)](https://9to5mac.com/heres-everything-new-in-the-journal-app-for-ios-18/) ·
[WWDC23 text cursor](https://developer.apple.com/videos/play/wwdc2023/10058/)

**Notion and note apps:** [data model](https://www.notion.com/blog/data-model-behind-notion) ·
[editing basics](https://www.notion.com/help/writing-and-editing-basics) ·
[shortcuts](https://www.notion.com/help/keyboard-shortcuts) ·
[styling](https://www.notion.com/help/customize-and-style-your-content) ·
[first page](https://www.notion.com/help/create-your-first-page) ·
[mobile](https://www.notion.com/help/notion-for-mobile) ·
[2021 mobile toolbar](https://www.notion.com/releases/2021-07-14) ·
[history](https://www.notion.com/help/duplicate-delete-and-restore-content) ·
[Notion AI design](https://www.notion.com/blog/the-design-thinking-behind-notion-ai) ·
[placeholder userstyle](https://userstyles.world/style/9202/notion-hide-placeholder-text) ·
[Bear 2](https://blog.bear.app/2023/07/bear-2-is-here/) ·
[Lettera](https://9to5mac.com/2026/06/19/bear-app-developers-announce-lettera-a-beautiful-markdown-editor-for-mac/) ·
[Obsidian](https://obsidian.md/help/edit-and-read) ·
[Things](https://culturedcode.com/things/support/articles/4651820/) ·
[Keep](https://support.google.com/keep/answer/12862970?hl=en)

**Writing apps:** [Day One prompts](https://dayoneapp.com/guides/tips-and-tutorials/daily-writing-prompts/) ·
[Day One focus](https://forums.dayoneapp.com/forums/topic/distraction-free-mode-aka-hide-the-sidebar/) ·
[iA Focus Mode](https://ia.net/writer/support/editor/focus-mode) ·
[iA Style Check](https://ia.net/topics/introducing-style-check) ·
[Ulysses release notes](https://ulysses.app/release-notes/) ·
[Freewrite](https://support.getfreewrite.com/general/can-i-edit-on-a-freewrite) ·
[Hemingway](https://hemingwayapp.com/help/docs/highlighted-issues) ·
[Ghost Hemingway mode](https://blog.ghost.org/hemingway-mode) ·
[Google Docs suggesting](https://support.google.com/docs/answer/6033474)

**Paper apps:** [Goodnotes request](https://feedback.goodnotes.com/forums/191274-customer-suggestions-for-goodnotes/suggestions/3593349-align-typed-text-with-a-template-s-horizontal-bars) ·
[Goodnotes scrolling](https://support.goodnotes.com/hc/en-us/articles/7353695996559) ·
[Notability text](https://intercom.help/notability/en/articles/16300260) ·
[Paper's Rewind (MIT Tech Review)](https://www.technologyreview.com/s/427434/if-an-ipad-and-a-moleskine-had-a-child/) ·
[Paper 1.1 (MacStories)](https://www.macstories.net/news/paper-1-1-now-available-with-faster-ink-move-duplicate-and-easy-add-features/) ·
[Procreate gestures](https://help.procreate.com/procreate/handbook/interface-gestures/gestures)

**Cards and canvases:** [Postable](https://www.postable.com/faq) ·
[Handwrytten](https://www.handwrytten.com/resources/how-to-send-a-handwritten-card-online/) ·
[Felt](https://apps.apple.com/us/app/felt-greeting-cards-gifts/id921902664) ·
[Ink Cards](https://apps.apple.com/us/app/-/id477296657) ·
[Paperless Post](https://www.brit.co/paperless-post/) ·
[Punkpost](https://techcrunch.com/2016/04/11/these-two-apps-let-you-pretend-you-actually-handwrote-that-greeting-card) ·
[Instagram text animation (Meta)](https://engineering.fb.com/2022/07/18/developer-tools/building-text-animations-for-instagram-stories/) ·
[Snapchat](https://help.snapchat.com/hc/en-us/articles/7012322034196-How-do-I-add-text-to-a-Snap) ·
[Figma](https://help.figma.com/hc/en-us/articles/27378154668951-Adjust-text-dimensions-and-resizing) ·
[Canva](https://www.canva.com/help/add-and-edit-text/)

**Web platform and physics:** [Visual Viewport (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API) ·
[interactive-widget (caniuse)](https://caniuse.com/mdn-html_elements_meta_name_viewport_interactive-widget) ·
[VirtualKeyboard (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API) ·
[iOS 26 viewport report](https://developer.apple.com/forums/thread/800125) ·
[shake undo in a textarea](https://dev.to/charperbonaroo/undo-typing-2chb) ·
[caret customisation (Igalia)](https://blogs.igalia.com/schenney/caret-customization-on-the-web/) ·
[caret blink (Raymond Chen)](https://devblogs.microsoft.com/oldnewthing/20240916-00/?p=110272) ·
[Underline conventions](https://en.wikipedia.org/wiki/Underline) ·
[ink dry times (Pen Chalet)](https://www.penchalet.com/blog/fast-drying-fountain-pen-inks-which-ink-dries-the-quickest/)
