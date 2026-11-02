# Editing over custom-rendered handwriting: the engineering

_2026-11-02. How to build a robust editor when the DOM holds no visible text: a caret, selection, mobile
keyboards, IME, autocorrect, dictation and screen readers over `layout()` output drawn as SVG today and
WebGL2 soon. It builds on [`writing-experience.md`](writing-experience.md) (the Ink log, the planner and the
pen trail) and doesn't repeat them. "est." marks a starting value to tune._

> **How sure this is.** I verified these this session: the codebase review (§7.7), the engine benchmark
> (§6.1), and the web sources for GTK caret blink, Windows caret timing, `Intl.Segmenter`,
> `scheduler.yield`, OffscreenCanvas WebGL in Safari, Grammarly attributes and editor latency. The Google
> Docs, Figma, Flutter, Freeform, Excalidraw and tldraw entries in §1 were checked against primary sources
> (source code, Google and Figma posts, issue trackers) by research passes this session, as were Monaco,
> CodeMirror, ProseMirror, Lexical, Slate, xterm.js, and the viewport, touch-selection, accessibility and
> layout-library material in §§3–5. The inputType and composition details in §§2.3–2.5 come from
> well-known primary sources that I didn't re-open today. Items marked **[unverified]** need a check before anyone
> relies on them. Everything in the event table (§7.3) gets confirmed on real devices in Phase 1 anyway,
> because the design reads diffs and treats `inputType` only as a hint.

## 0. The short version

1. **Keep the hidden `<textarea>`.** Every product that renders its own text and still supports IME and
   screen readers ends up with a real editable element somewhere: Monaco, Flutter web, xterm.js, Google
   Docs (a contenteditable iframe), Excalidraw. The textarea is the most predictable of these. EditContext
   is Chromium-only and gives no accessibility on its own. VS Code made it the default in 2025 and still
   has IME casualties, and CodeMirror pulled it back to Android-only. It's a later experiment, not the
   base.
2. **Let the browser edit; diff the result.** On `input`, diff the old and new values into
   `{from, to, insert}`, and use `beforeinput.inputType` only to label the intent (typed, pasted,
   autocorrected). Android keyboards make event types unreliable; diffs never lie.
3. **Never touch the textarea while composing.** No value writes, no selection writes, no
   `preventDefault` on arrows or Escape. Draw the composing text yourself, underlined, because the
   textarea is invisible.
4. **The engine must own the geometry.** Caret stops for every boundary (spaces and line ends included),
   per-line baseline curves and the slant. The caret is a slanted pen-tip on the wandering baseline, and
   hit-testing un-shears the point before searching.
5. **Touch selection is custom work.** A hidden input gives you no usable native handles or magnifier
   over your own glyphs. Build tap, double-tap, long-press-drag, two handles and a small Cut/Copy/Paste
   bar, and keep "Edit as plain text" as the escape hatch.
6. **Performance is the biggest gap today.** A 250-word note costs about 340 ms of layout and SVG per
   keystroke on an M1 Max. The word being typed costs about 1 ms. Stable seeds, a per-word outline cache,
   keyed runs and a draft-then-final render tier fix it.

---

## 1. How others do it

| Product | Input surface | Rendering | What to take |
|---|---|---|---|
| **Google Docs** | A hidden, same-origin `iframe.docs-texteventtarget-iframe` holding an off-screen contenteditable takes keys, IME and paste ([userscript source](https://openuserjs.org/scripts/ffactory/Block_Google_Docs_keyboard_shortcuts_(ALT_OPTION)/source); the [EditContext explainer](https://w3c.github.io/editing/docs/EditContext/explainer.html) cites Docs' off-screen contenteditable, and notes the emoji picker opens near the top of the app, not at the caret, because the OS can't see the caret). Google has never documented the iframe | Canvas since 2021 ([Workspace Updates](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html), [The New Stack](https://thenewstack.io/google-docs-switches-to-canvas-rendering-sidelining-the-dom/)) | Accessibility is a *separate mode*: screen reader support (⌘⌥Z / Ctrl+Alt+Z, automatic with ChromeVox) and braille support (⌘⌥H) ([help](https://support.google.com/docs/answer/6282736), [braille](https://support.google.com/docs/answer/6057417)). It began as aria-live announcements, which Orca users called a "hack" ([orca-list 2015](https://lists.gnome.org/archives/orca-list/2015-June/msg00018.html)). Allow-listed extensions set `window._docs_annotate_canvas_by_ext` to get hidden SVG `rect`s with `aria-label` text per run ([Yomichan source](https://raw.githubusercontent.com/FooSoft/yomichan/master/ext/js/accessibility/google-docs.js); undocumented). Lesson: input, drawing and the accessible representation are three separate layers, and an input surface the OS can't locate puts IME UI in the wrong place |
| **Figma** | The canvas has "only one `<input>` element that holds focus" ([Figma, July 2026](https://www.figma.com/blog/building-accessibility-into-a-canvas-based-product/)). Its IME and caret handling are **unpublished**; user reports show web-only IME bugs (e.g. Sogou duplicating a colon) | Own text engine by Evan Wallace, first with "platform-native interactions" ([madebyevan.com/figma](https://madebyevan.com/figma/)); WebGL, now WebGPU ([blog](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)) | The **Mirror DOM**: one React element per layer, fed by an incremental accessibility tree, *laid out at the layer's real transform* (rotation and skew included) rather than visually hidden, so magnifiers, high-contrast outlines and voice control land on the right spot. Selection syncs both ways; other changes go to a coalesced live region ("Moved five pixels"). FigJam lets screen reader users read and edit stickies ([2023](https://www.figma.com/blog/announcing-figjam-screen-reader-support/)) |
| **VS Code / Monaco** | A hidden `<textarea>` at the cursor, 1 px normally, one line tall on macOS or with a screen reader, never 0 × 0 because "setting the textarea to 0x0 breaks IME badly" ([`textAreaEditContext.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/controller/editContext/textArea/textAreaEditContext.ts)). Edits are *deduced* by diffing value-and-selection snapshots (`deduceInput`, with an Android-specific variant, in [`textAreaEditContextState.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/controller/editContext/textArea/textAreaEditContextState.ts)). With a screen reader it holds a page of lines, capped at 500 characters either side ([`screenReaderUtils.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/controller/editContext/screenReaderUtils.ts)). The textarea is never written during composition; instead it becomes visible, styled like the token, so the browser draws the uncommitted text | DOM lines (not canvas), but text input works as if it were canvas | The closest match to Seedhand. EditContext arrived as an experiment in 1.94 and became the default in 1.101, May 2025 ([1.94](https://code.visualstudio.com/updates/v1_94), [1.101](https://code.visualstudio.com/updates/v1_101), [#207700](https://github.com/microsoft/vscode/issues/207700)). It costs a rebuilt screen-reader layer on divs, and the Microsoft Simplified Chinese IME's candidate window vanishes, closed "not planned" with "turn the setting off" ([#285013](https://github.com/microsoft/vscode/issues/285013)) |
| **CodeMirror 5 → 6** | CM5 used a hidden textarea at the cursor, diffed its value instead of clearing it ("clearing breaks half-composed characters"), and moved it under the mouse for the context menu ([Faking an editable control](https://marijnhaverbeke.nl/blog/browser-input-reading.html)). CM5 added contenteditable because it was "the only way we can get the native selection interface to show up" on mobile ([5.0 notes](https://discuss.codemirror.net/t/new-releases-4-13-and-5-0/163)); CM6 is contenteditable plus a `MutationObserver` ([guide](https://codemirror.net/docs/guide/)) | DOM | Gboard "often surrounds the effect of enter or backspace with a bunch of composition events that, when interrupted, cause text duplication", so CM waits a frame, reads the DOM, and fakes the key only if nothing changed ([`input.ts`](https://github.com/codemirror/view/blob/main/src/input.ts)). About 80 mobile and composition fixes in the changelog since 2021. EditContext shipped in 6.28 (2024), then was **disabled on non-Android browsers in June 2025** "since it's causing more problems than it's solving" ([commit 6ea9dd61](https://github.com/codemirror/view/commit/6ea9dd610bec3a366eb8946f4c9fb1c1a61f208e)). CM now draws its own selection handles on iOS (6.39.17, March 2026) |
| **ProseMirror** and **Wordgard** | ProseMirror re-parses the changed DOM range and diffs it (`findDiff` never splits surrogate pairs); on Android it infers Enter and Backspace from the change shape, and on iOS it never blocks Enter because "the virtual keyboard gets confused" ([`domchange.ts`](https://github.com/ProseMirror/prosemirror-view/blob/master/src/domchange.ts), [`input.ts`](https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts)) | DOM | Marijn's 2026 successor, Wordgard, "just handles `beforeinput` events for everything except composition text input", draws its own cursor, and keeps native touch selection so the context menu survives ([Wordgard 0.1](https://marijnhaverbeke.nl/blog/wordgard-0.1.html)). The field is converging on *beforeinput for intent, composition left to the browser* |
| **Lexical** | `beforeinput`-first: most types are cancelled and turned into commands, but composition is left alone ("We let the browser do its own thing"), and text-only DOM changes are read back ([`LexicalEvents.ts`](https://github.com/facebook/lexical/blob/main/packages/lexical/src/LexicalEvents.ts)). Code notes: Chromium Android ignores `preventDefault` on `deleteContentBackward`; iOS Korean Chunjiin never reports composing | DOM | `beforeinput` works on desktop; mobile needs a fallback path |
| **Slate** | `beforeinput` on most platforms; on Android, because "beforeInput events on android aren't cancelable", an `AndroidInputManager` stores diffs and applies them after composition or on 25 ms and 200 ms timers ([PR #4988](https://github.com/ianstormtaylor/slate/pull/4988), [source](https://github.com/ianstormtaylor/slate/blob/main/packages/slate-react/src/hooks/android-input-manager/android-input-manager.ts)) | DOM | Android needs its own strategy. Diffing is the portable version of the same idea |
| **Excalidraw** | While editing, a visible `<textarea>` replaces the canvas text, matched in font, line height, colour, zoom and rotation, and the renderer skips that element ([`textWysiwyg.tsx`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/wysiwyg/textWysiwyg.tsx), [`Renderer.ts`](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/scene/Renderer.ts)). The first caret comes from un-rotating the click; focus uses `preventScroll`, and browser scroll-to-caret is converted into canvas panning. Its only IME guard is `isComposing \|\| keyCode === 229` on Ctrl/⌘+Enter, and a Japanese IME + Tab duplicate-text bug ([#6218](https://github.com/excalidraw/excalidraw/issues/6218)) shows why every key handler needs one | Canvas | Works because the text uses a real font. Seedhand can't show handwriting inside a textarea, so this only fits the "Edit as plain text" slip. Steal the un-rotate hit-test and the scroll-to-pan idea |
| **tldraw** | A TipTap (ProseMirror) contenteditable mounted over the label while editing, since v3.10 (March 2025); the static copy is hidden with CSS ([`RichTextArea.tsx`](https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/text/RichTextArea.tsx)). Mobile notes in [`useEditablePlainText.ts`](https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/shared/useEditablePlainText.ts): React StrictMode double renders stop the iOS keyboard opening, and Safari needs `blur()`+`focus()` to "shake the caret awake" | SVG/DOM shapes | Same trade-off as Excalidraw. The iOS focus notes apply directly to Seedhand |
| **Flutter web** | A hidden `<input>`/`<textarea>` with transparent `color`, `background` and `caret-color`, sized and placed over the painted field with a `matrix3d` transform and the field's own font metrics, with per-browser strategies ([`text_editing.dart`](https://raw.githubusercontent.com/flutter/flutter/master/engine/src/flutter/lib/web_ui/lib/src/engine/text_editing/text_editing.dart)). While composing it updates geometry only, because re-placing the element interrupted IME ([#98817](https://github.com/flutter/flutter/issues/98817)). Firefox gets `keyup`/`select` polling instead of `selectionchange`; iOS gets 100 ms focus delays | Canvas (CanvasKit/Skwasm) | Semantics are opt-in, behind a 1 × 1 "Enable accessibility" placeholder button ([Flutter blog](https://flutter.dev/blog/accessibility-in-flutter-on-the-web)). On iOS it forces 16 px and **turns autocorrect off because the transparent field still shows the autocorrect highlight**, and Safari ignores `::selection` on it, so a grey layer shows through ([#99918](https://github.com/flutter/flutter/issues/99918)). Its custom handles overlap native ones ([#118111](https://github.com/flutter/flutter/issues/118111)). The umbrella issue proposes going back to real native inputs and lists open Korean and Chinese IME bugs ([#120613](https://github.com/flutter/flutter/issues/120613)) |
| **xterm.js** | A hidden `<textarea>` on the cursor cell, not moved during composition. `CompositionHelper` draws its own composition overlay with the textarea under it, keeps a minimum size or "certain IMEs may break", and reads the result from the textarea after `setTimeout 0` because `compositionend.data` is "unreliable" ([source](https://github.com/xtermjs/xterm.js/blob/master/src/browser/input/CompositionHelper.ts)). Opt-in screen reader mode adds a row list and a capped assertive live region with typed-echo de-duplication ([AccessibilityManager](https://github.com/xtermjs/xterm.js/blob/master/src/browser/AccessibilityManager.ts), [design doc](https://github.com/xtermjs/xterm.js/wiki/Design-Document:-Screen-Reader-Mode)) | Canvas/WebGL | The cleanest open example of *hidden textarea + canvas + own composition overlay*: exactly Seedhand's shape |
| **Apple Freeform** | Native only: `icloud.com/freeform` now redirects to a support page listing iPhone, iPad, Mac and Vision Pro ([Apple](https://support.apple.com/127946)). Nothing technical is published | Native | Nothing transferable beyond the interaction design |

**Text-layout libraries.** Skia's paragraph API (CanvasKit `Paragraph`) exposes exactly the queries an
editor needs, `getGlyphPositionAtCoordinate` and `getRectsForRange`
([CanvasKit](https://skia.org/docs/user/modules/canvaskit/)), and is a good model for `GeometryIndex`
(§7.2). Cheng Lou's **Pretext** (`@chenglou/pretext`, March 2026) does DOM-free layout: `prepare()`
measures once, then `layout()` is cheap arithmetic on every resize, with grapheme-level cursors
([GitHub](https://github.com/chenglou/pretext)). It has no point-to-index hit-testing and needs a
canvas-measurable font, so it's the *pattern* for §6 (prepare once, re-flow cheaply), not a dependency.
**HTML-in-Canvas** shipped stable in Chrome 157 (October 2026): `<canvas content="drawable">`,
`drawElementImage()`, and `texElementSubImage2D` for WebGL, with drawn elements staying in the
accessibility tree and keeping selection, copy and paste
([Chrome](https://developer.chrome.com/blog/html-in-canvas), [WICG](https://github.com/WICG/html-in-canvas)).
It draws the *browser's* text, so it can't draw handwriting; Chromium-only, it could later host a
geometry-synced accessible layer inside the WebGL scene. Enhanced Canvas `TextMetrics`
(`getSelectionRects`, `getIndexFromOffset`) is in an origin trial and is font-bound too
([whatwg #10677](https://github.com/whatwg/html/issues/10677)). For the WebGL2 renderer, Eric Lengyel's
**Slug** GPU curve-rendering technique was dedicated to the public domain in March 2026, with reference
shaders on GitHub ([Gigazine](https://gigazine.net/gsc_news/en/20260323-slug-font-text-rendering/)).
That makes it worth evaluating for crisp stroke outlines at any zoom.

**What they agree on.** (1) A real editable element always exists, near the caret, for the OS. (2) The
app owns the model; the DOM editable is a transport. (3) Accessibility is either the editable itself
(Monaco, Seedhand) or a deliberate mirror (Docs, Figma, Flutter, xterm.js), never an afterthought.
(4) Nothing repositions, re-renders or resets the input element mid-composition (Flutter #98817,
tldraw's StrictMode note). (5) Mobile and IME quirks are handled by observing results, not trusting
events.

---

## 2. Input capture options

### 2.1 The three surfaces

| | Hidden `<textarea>` | Hidden `contenteditable` | **EditContext** |
|---|---|---|---|
| Browser support | Everywhere | Everywhere | Chrome and Edge 121+; Firefox Nightly only; no WebKit position ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/EditContext_API), [web-features](https://web-platform-dx.github.io/web-features-explorer/features/edit-context)); see 2.2 |
| IME, dictation, autocorrect | Native and best-tested | Native, but the browser mutates DOM you then repair | Native text services without a DOM editable; you report character bounds |
| What the OS "sees" | Plain text with a selection: ideal for logical text | Rich DOM, plus formatting commands you don't want | Whatever text you hand it |
| Screen readers | Read value, caret and selection natively | Read the DOM; quirkier | **Nothing by itself.** You still need an accessible element ([spec](https://w3c.github.io/edit-context/)) |
| IME window placement | Move the element to the caret | Same | `updateControlBounds`/`updateSelectionBounds`/`updateCharacterBounds`: exact, even on slanted text |
| Risks | Its own undo dies when you write `value`; its native selection UI is wrong on touch | Spellcheck squiggles, drag, formatting, paste of HTML | One engine; spec still moving; Android behaviour less proven |

**Pick: the textarea.** It's what the app already has, it works in every browser, and it gives screen
readers the logical text for free. EditContext is a Phase 5 experiment for Chromium desktop, where its
exact character bounds would place IME candidates against slanted glyphs.

### 2.2 EditContext status

Chromium shipped it in 121 (January 2024), and writing-experience §7.2 notes the W3C charter targets a
Candidate Recommendation in Q4 2026 ([charter](https://www.w3.org/groups/wg/webediting/charters/active/)).
As of late 2026, Firefox has it in Nightly only, and WebKit hasn't stated a position
([web-features](https://web-platform-dx.github.io/web-features-explorer/features/edit-context),
[WebKit positions](https://github.com/WebKit/standards-positions/issues?q=EditContext)). Two open spec
issues matter to Seedhand: accessibility for canvas-rendered EditContext is unsolved
([w3c/edit-context #139](https://github.com/w3c/edit-context/issues/139)), and whether to drop the
canvas-only variant altogether is on the TPAC 2026 agenda
([#151](https://github.com/w3c/edit-context/issues/151)). Chrome's own introduction notes that canvas
editors must build caret navigation themselves and that browser spellcheck doesn't work
([Chrome](https://developer.chrome.com/blog/introducing-editcontext-api)). The two biggest adopters split:
VS Code kept it as the default despite IME casualties, and CodeMirror restricted it to Android. Plan as
if Safari won't have it in 2027.

### 2.3 `beforeinput` inputType coverage

`beforeinput` is Baseline (Chrome 60, Safari 10.1, Firefox 87). Composition input **can't be
cancelled**: Level 1 existed because "it was not possible to have composition be cancelable on Chrome on
Android", Blink never implemented all of Level 2, Safari fires Level 2's `deleteCompositionText`, and
Level 1 was discontinued in November 2024
([w3c/input-events #115](https://github.com/w3c/input-events/issues/115)). Whether the last
`beforeinput` before `compositionend` may be cancelled is still open
([#134](https://github.com/w3c/input-events/issues/134)). On a `<textarea>`, `getTargetRanges()` returns
an empty array; ranges only exist for contenteditable ([spec](https://w3c.github.io/input-events/)). So
the *range* always comes from the diff.

| inputType | Typical source | Coverage notes **[verify on devices in Phase 1]** |
|---|---|---|
| `insertText` | Typing; tapping a suggestion; some dictation | All engines |
| `insertCompositionText` | IME, Gboard (every Latin word), dead keys, Korean | All engines; not cancelable in Chrome |
| `insertReplacementText` | Spell-check menu; macOS/iOS autocorrect; Writing Tools rewrites | Safari fires it for autocorrect; Chrome fires it for spell-check replacement; Android autocorrect usually arrives as a composition commit instead |
| `insertLineBreak` | Enter in a textarea | All engines (textarea never sends `insertParagraph`) |
| `insertFromPaste`, `insertFromPasteAsQuotation` | ⌘V, context menu, keyboard clipboard strip | All; `dataTransfer` carries the text |
| `insertFromDrop` / `deleteByDrag` | Drag and drop | Can't target the hidden textarea in practice; handle `drop` on the paper |
| `insertFromYank`, `insertTranspose` | macOS Ctrl+Y, Ctrl+T | Safari, Chrome on macOS |
| `deleteContentBackward/Forward` | Backspace/Delete; Android sends Backspace in composition as this, with `keydown` keyCode 229 | All |
| `deleteWordBackward/Forward`, `deleteSoftLineBackward`, `deleteHardLineBackward` | ⌥/Ctrl+Backspace, ⌘Backspace | All desktop engines |
| `deleteByCut` | ⌘X | All |
| `historyUndo` / `historyRedo` | ⌘Z, ⇧⌘Z, Ctrl+Y; iPad keyboard undo; iOS shake | All; cancelable on desktop. Also catch `keydown` as a belt |

### 2.4 Composition, autocorrect and dictation in practice

- **Gboard** composes the current Latin word: each letter is a `compositionupdate`, Backspace inside it
  is `keydown` keyCode 229 plus a composition change, and the word commits on space or on any selection
  move. **Samsung Keyboard** behaves similarly, with more aggressive re-composition of a word you
  backspace into. Both reopen composition on the *previous* word when you backspace into it.
- **iOS** QuickType and autocorrect replace the previous word when you type a space or punctuation.
  Double-space becomes ". ", and Smart Punctuation turns quotes and dashes curly. Each arrives as a
  replacement of text *behind* the caret. Diffing sees it as `replace(from, to, text)` whatever the event.
- **Dictation** (iOS, macOS, Windows Win+H, Gboard voice) streams text and *revises recent words*,
  sometimes as composition and sometimes as replacements. Treat everything since dictation started as
  provisional until 1.2 s of quiet (est.), the same as writing-experience §6.
- **Safari's Enter after an IME commit.** WebKit can fire `compositionend` before the Enter `keydown`,
  which then has `isComposing === false`; a naive Enter handler inserts a newline *and* commits. Guard
  with "composition ended within the last 50 ms → ignore this Enter keydown" (est.).
- **Attributes.** `autocapitalize="sentences"`, `autocorrect="on"` (Safari; newly standardised
  [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/autocorrect)),
  `spellcheck` (squiggles are invisible in a hidden textarea anyway, but on some platforms it also gates
  suggestions **[unverified]**), `enterkeyhint="enter"`, `inputmode="text"`, and `writingsuggestions`
  where supported ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/writingsuggestions)).
  Inline AI writing suggestions would appear *inside the invisible textarea*, so set
  `writingsuggestions="false"`. Add `data-gramm="false" data-gramm_editor="false"
  data-enable-grammarly="false"`, because Grammarly attaches to textareas and would float its UI at
  the hidden one ([Oracle](https://docs.oracle.com/en/cloud/saas/sales/fasqa/how-can-i-turn-off-the-grammarly-extension-while-loading-an-oracle-intelligent-advisor-interview.html),
  [CodeMirror forum](https://discuss.codemirror.net/t/codemirror6-and-grammarly/3917): presence may be
  what counts, not the value).

### 2.5 Keeping selection in sync

- **Surface → model:** `selectionchange` (on `document`, and on the textarea where supported), plus
  `select`, `keyup` and `input`, all routed through one `readSel()` that bails if nothing changed. The app
  already does this.
- **Model → surface:** after the model changes, compare. If the textarea's value already matches (the
  normal case), only fix the selection. If it differs (Ink normalisation, a refused undo, a fresh sheet),
  apply the *minimal* `setRangeText(insert, from, to, 'preserve')` rather than assigning `value`, so the
  browser keeps its selection and the IME keeps its context.
- **Never during composition.** Queue the write and flush on `compositionend` (and on the following
  `input`, since engines order these differently). Writing mid-composition makes Gboard duplicate letters
  and Japanese IMEs drop the clause.
- **Property test:** random intent traces → `textarea.value === doc.text` and the selection matches,
  after every step.

---

## 3. Caret and selection over handwriting

### 3.1 Offsets to positions

- **Caret stops are grapheme boundaries** (`Intl.Segmenter` with `'grapheme'`, Baseline since April 2024,
  [web-features](https://web-platform-dx.github.io/web-features-explorer/features/intl-segmenter)), so
  é, flags and ZWJ emoji are one stop. The textarea already steps by grapheme with the arrow keys; the
  geometry must agree.
- **Every boundary needs a stop from the engine**, including spaces, runs of spaces, line ends and empty
  lines. Today `layout()` emits glyphs and misses only, so the app guesses space positions with a nominal
  `spaceU` while the engine jitters word gaps (`layout.js`: `spaceAdv * (1 + gauss·…)`). Ask Writing & page
  for `stops[]` (§7.2).
- **Affinity at wraps.** The offset at a soft wrap has two positions: the end of the upper line and the
  start of the lower. Store `affinity: 'before' | 'after'`. End and a click past a line end give
  `'before'`; arrows and typing give `'after'`.
- **The baseline wanders.** `layout()` computes `wob = drift·(12 + 34·messy)·n1(x/1700 + line·13.37) +
  wordLift`. Export it as `LineGeom.baseline(x)` so a caret between words, at a line end or on an empty
  line sits on the curve the letters sit on, not on the ruled line.

### 3.2 Hit-testing (click and tap → offset)

1. **Sheet** from the page offset (as today).
2. **Line:** for each line on that sheet, the distance from the point to `baseline(x) − 0.35·xh` (the
   middle of the x-height band). Take the nearest line, with a band from the previous line's descender to
   this line's ascender. This replaces the nominal-grid `lineAtY` plus its 0.72 fudge.
3. **Un-shear:** `x' = x − (baseline(x) − y)·tan(slant)`. The hand's slant is in `p.slant`, up to 30° in
   the UI range (`hand.js`), so at cap height (0.7 em) a letter's top sits up to 0.4 em right of its foot.
   Without this, a click on an ascender lands a letter late.
4. **Nearest stop** on that line by `x'`: binary search the stop midpoints. Return the affinity.
5. Missing-glyph placeholders and struck runs (Ink) are ordinary stops; insertions above the line (Ink)
   are their own mini-line with their own baseline.

### 3.3 Drawing the caret and the selection

- **Caret:** a line segment along the slant, from `baseline + 0.2 em` to `baseline − 0.74 em`, sheared by
  `tan(slant)`, 1.5 px in the ink colour at 85% (est.). It matches the writing-experience "pen-tip caret".
  At an empty line, use the hand's slant on the line's baseline.
- **Blink:** about 500–530 ms on and off, the Windows convention
  ([GetCaretBlinkTime](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcaretblinktime),
  [Mozilla 1518196](https://bugzilla.mozilla.org/show_bug.cgi?id=1518196)); browsers don't expose the OS
  setting. Restart it on every move (the app does). **Stop blinking after 10 s idle**, as GTK does by
  default ([GTK](https://docs.gtk.org/gtk4/property.Settings.gtk-cursor-blink-timeout.html)), which also
  keeps WCAG 2.2.2's "blinking over 5 s" concern at bay
  ([Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). Only blink
  under `prefers-reduced-motion: no-preference`; macOS's "Prefer non-blinking cursor" setting doesn't
  reach web content ([Adrian Roselli](https://adrianroselli.com/2025/09/custom-carets-and-users-when-the-caret-is-no-longer-a-stick-yes-thats-a-poor-attempt-at-a-pun.html)).
  Keep the caret at 3:1 contrast against the paper, and offer a thicker-caret option, since Windows
  users can't thicken browser carets either (same source).
- **Selection:** one closed path per written line, from the first selected stop to the last, top edge at
  `baseline(x) − ascent` and bottom at `baseline(x) + descent`, both sheared by the slant, so the band is a
  leaning ribbon that follows the wander. Sample `baseline(x)` every ~0.5 em. Round the corners slightly
  (VS Code's `editor.roundedSelection` look). Include selected trailing spaces, and show a selected newline
  as a short tab at the line end. Colour: the ink at 16% focused and 9% unfocused (as today); in Ink mode,
  a cool UI tint that can never be mistaken for ink.
- **Preedit:** a dotted underline under the composing range on the baseline curve, in UI colour.

### 3.4 Pointer gestures

- **Pointer events with capture.** `pointerdown`: hit-test, set anchor, `preventDefault()` (keeps focus
  in the textarea and stops native page selection), `setPointerCapture`. `pointermove`: extend.
  Auto-scroll when within 40 px of the viewport edge (est.).
- **Click count** from `event.detail`: 2 = word (`Intl.Segmenter` `'word'`, `isWordLike`), 3 = written
  line. Dragging after a double-click extends by whole words.
- **Shift-click** extends (the app does). **Alt-drag** has no meaning here.
- **Context menu:** on `contextmenu`, move the textarea into a 30 × 30 px box under the pointer at
  `opacity: .05`, so the native menu offers Paste, Spelling and Services, then restore it 20–50 ms later
  (CodeMirror 5's trick, verified in [`TextareaInput.js`](https://raw.githubusercontent.com/codemirror/codemirror5/master/src/input/TextareaInput.js)).
- **Drop:** handle `dragover`/`drop` on the paper and turn the text into an `insert` at the drop point.

### 3.5 Touch: handles and the callout

A hidden textarea's native selection UI (handles, loupe, the Copy/Paste callout) is drawn around *its*
invisible text, in the wrong place, or not at all. Since 2019 WebKit has deliberately **suppressed
selection gestures and UI for a focused editable that is transparent or fully clipped**, to stop double
carets on CodeMirror pages ([r249296](https://trac.webkit.org/r249296),
[bug 193180](https://bugs.webkit.org/show_bug.cgi?id=193180)). So an `opacity: 0` textarea on iOS gets no
native caret, handles or callout. That suits Seedhand, which draws its own. Nobody gets native handles
over custom-rendered text. The options:

| Option | Verdict |
|---|---|
| Native handles from the hidden textarea | Wrong positions. Hide them as far as possible (`caret-color: transparent`, transparent `::selection`), but iOS Safari ignores `::selection` on such fields and shows a grey layer and duplicate handles (Flutter [#99918](https://github.com/flutter/flutter/issues/99918), [#118111](https://github.com/flutter/flutter/issues/118111)). One report says a transparent caret also hides the first composed character on iPadOS 27 ([pi-web #309](https://github.com/jmfederico/pi-web/issues/309), **[unverified]**) |
| Swap to a real text view while selecting on touch | Breaks the "it's paper" illusion; already available as "Edit as plain text" |
| **Custom gestures and handles** (Flutter's route, and CodeMirror's on iOS since March 2026) | **Do this.** Handle hit areas at least 24 × 24 CSS px (WCAG 2.5.8). Tap places the caret. Double-tap selects a word. Long-press then drag selects (with the caret under the finger offset 40 px up so it's visible, est.). Two teardrop handles at the selection ends, dragged with pointer capture. A small floating bar: Cut, Copy, Paste, Select all |
| Clipboard | Copy: `navigator.clipboard.writeText` from the tap. Paste: `navigator.clipboard.readText()`, Baseline since April 2024 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText)). Safari has shown a native "Paste" callout for it since 13.1 when it's called synchronously inside a gesture ([WebKit](https://webkit.org/blog/10855/async-clipboard-api/)); Firefox shows its own popup; Chromium asks for `clipboard-read` permission. Keyboard clipboard strips (Gboard, iOS) already work through the textarea |
| iOS space-bar trackpad, VoiceOver rotor | Move the textarea's selection; `selectionchange` brings it into the model. Works today |

### 3.6 Keyboard navigation

- **Left/Right, ⌥/Ctrl+Left/Right, ⌘↑/↓:** let the textarea do it. It moves by grapheme and word in
  *logical* order, which is right.
- **Up/Down:** app-owned, with a sticky goal x in un-sheared coordinates, moving to the nearest stop on
  the next *written* line (the app does this, minus the shear).
- **Home/End, ⌘←/→:** the written line's first and last stop, with affinity `'before'` at End.
- **PageUp/PageDown:** the same goal x, one viewport of lines.
- **Skip all of this when composing** (`e.isComposing || e.keyCode === 229`) and when a modifier the app
  doesn't own is held.
- In Ink mode, insertions above a line are visited in logical order; spatial Up/Down through them is v2
  (writing-experience §6).

---

## 4. Accessibility

- **The textarea *is* the accessible editor.** Its implicit role is `textbox`, multi-line. Screen readers
  read its value, the caret position, the selection and typing echo natively. Don't add `role="textbox"`
  to a div, and don't use `aria-live` for the text: live regions announce changes but can't be navigated by
  character, word or line, and they repeat what the textarea's echo already says.
- **A positioned word mirror, later (Phase 5).** Figma's lesson is that the accessible layer should be
  *laid out where the visuals are*, not visually hidden, so magnifiers, high-contrast outlines and voice
  control ("click John") hit the right spot. For Seedhand: transparent, `aria-hidden` word spans placed
  over each written word at its slant, used for pointer and voice targeting only, while the textarea
  stays the single reading source.
- **Make it findable.** NVDA ignores 0 × 0 elements by design
  ([nvda #16398](https://github.com/nvaccess/nvda/discussions/16398)); `opacity: 0` works with Windows
  screen readers in that thread, and off-screen controls aren't found by VoiceOver touch exploration
  ([W3C](https://lists.w3.org/Archives/Public/public-mobile-a11y-tf/2015Nov/0017.html)). VS Code makes
  its textarea one line tall when a screen reader is on. So: give the textarea **real geometry**, one
  written line tall, from the caret x to the line's end, moved with the caret. Keep `opacity: 0` rather
  than Flutter's transparent colours: on iOS, transparent colours bring back misplaced native handles, a
  grey selection layer and the autocorrect highlight (Flutter turns autocorrect off for that reason),
  while `opacity: 0` triggers WebKit's hidden-editable rule (§3.5). Whether VoiceOver iOS still finds
  an `opacity: 0` field of that size by touch is **[unverified; test case 24]**.
- **Label and describe.** `aria-label="Letter in Ottilie Marsh's hand"`, `aria-describedby` → a hidden
  line that says the mode ("Ink: deleting crosses out"). The sheet group gets `role="group"` and a label
  (it already does for multiple sheets). SVG and WebGL stay `aria-hidden`.
- **One polite status region** for things that aren't text: "The ink is dry. Cross it out or start a
  fresh sheet", "Crossed out 'Jon'", "Fresh sheet". The header's `aria-live` hint already exists; reuse
  it, debounced.
- **Ink mode** keeps the textarea on the logical text (writing-experience §6). The diplomatic
  transcription ("Dear [struck: Jon] John") sits behind a "Read corrections" toggle as
  `aria-description`, not as a second copy that screen readers would read twice.
- **How the big ones do it.** Google Docs needs an explicit screen reader mode that renders an accessible
  DOM ([Docs help](https://support.google.com/docs/answer/6282736)). Flutter web needs an "Enable
  accessibility" press before its semantics tree exists ([Flutter](https://docs.flutter.dev/ui/accessibility-and-internationalization/accessibility)).
  xterm.js keeps a parallel row tree and a live region
  ([AccessibilityManager](https://github.com/xtermjs/xterm.js/blob/master/src/browser/AccessibilityManager.ts)).
  Seedhand's plain-text document is simpler than any of them: a single real textarea is enough, with no
  mode switch.
- **Focus visible.** The slanted caret is the focus indicator while editing; when the paper has focus but
  isn't editing, draw a 2 px outline around the writing area.
- **Test with:** VoiceOver (macOS Safari, iOS Safari), NVDA with Firefox and Chrome, JAWS with Chrome,
  TalkBack with Gboard, and Narrator with Edge.

---

## 5. Mobile keyboard and viewport

- **Declare** `<meta name="viewport" content="width=device-width, initial-scale=1,
  interactive-widget=resizes-content">`. Chrome on Android (108+), Firefox Android (132+) and Samsung
  Internet then shrink the layout viewport when the keyboard opens, so `dvh` layouts and fixed bars
  behave ([Chrome](https://developer.chrome.com/blog/viewport-resize-behavior),
  [HTMHell](https://htmhell.dev/adventcalendar/2024/4/)). **Safari doesn't support it**; WebKit bug
  [259770](https://bugs.webkit.org/show_bug.cgi?id=259770) has been unassigned since 2023.
- **iOS Safari** keeps the layout viewport full-height and pans the visual viewport instead. `position:
  fixed` elements are laid out against the layout viewport, so a top-fixed "Done" button can scroll out
  of view while the keyboard is up. Use the **VisualViewport API**
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)): on `resize` and `scroll`,
  `keyboard = innerHeight − (vv.height + vv.offsetTop)`, then translate floating controls by
  `vv.offsetTop` (for top bars) or place them at `vv.offsetTop + vv.height` (for bottom bars).
  **Re-measure on every event and cache nothing:** on iOS 26, `visualViewport.height` can stay about 24 px
  short and `offsetTop` can fail to reset after the keyboard closes, misplacing fixed elements
  ([Apple forums](https://developer.apple.com/forums/thread/800125),
  [WebKit 297779](https://bugs.webkit.org/show_bug.cgi?id=297779)).
- **Keep the caret line visible.** After each caret move, if the caret's bottom is below
  `vv.offsetTop + vv.height − 3 lines` (est.) or above `vv.offsetTop + 1 line`, scroll by the difference
  with `window.scrollBy`, smoothly unless reduced motion is on. Because the textarea follows the caret
  line, iOS's own "scroll the focused field into view" usually agrees (CodeMirror 5 kept its textarea
  "near the cursor to prevent scrolling artifacts"). `focus({ preventScroll: true })` is supported from
  iOS Safari 15.5, but iOS still pans to reveal a field when the keyboard appears. Flutter works around
  this by focusing the input off-screen and moving it into place about 100 ms later. Where it fights (jumps on each new
  line), the fix is the `focus({ preventScroll: true })` already used, plus not resizing the textarea
  while typing.
- **VirtualKeyboard API** (`navigator.virtualKeyboard.overlaysContent`, `env(keyboard-inset-height)`) is
  Chromium-only, since 94 ([Chrome](https://developer.chrome.com/docs/web-platform/virtual-keyboard);
  WebKit [230225](https://bugs.webkit.org/show_bug.cgi?id=230225) untouched since 2021). It isn't
  needed if `interactive-widget` and VisualViewport are in place.
- **Opening the keyboard** needs `focus()` inside the tap's own handler (iOS refuses async focus). The app
  does this in `onClick`.
- **Don't zoom:** the textarea must stay ≥ 16 px (it is).

---

## 6. Performance

### 6.1 What it costs today (measured)

I timed the engine in Node 24 on an M1 Max (2026-11-02; hand `quiet-heron-17`, `layout()` then
`renderSVG()`, mean of 8 runs after warm-up). Phones are slower, typically 2–4× (est.).

| Note | `layout()` | `renderSVG()` | SVG size | One 7-letter word of `makeGlyph` |
|---|---|---|---|---|
| 50 words, print / script | 41 / 39 ms | 23 / 28 ms | 1.1 / 1.4 MB | 0.7 / 1.2 ms |
| 250 words | 217 / 162 ms | 189 / 174 ms | 5.7 / 7.5 MB | 0.8 / 1.2 ms |
| 800 words | 486 / 859 ms | 583 / 913 ms | 19 / 25 MB | 1.8 / 1.2 ms |

The app does all of this **on every keystroke**: the worker re-lays out and re-renders the whole note,
posts the SVG strings back, and the main thread parses each changed sheet with `innerHTML`, re-runs the
id-scoping regexes, and repaints a sheet-wide `feTurbulence` + `feDisplacementMap` filter. The worker
coalesces bursts, so the page doesn't freeze, but on a 250-word letter it updates three or so times a
second while the caret waits for it. Paths are dense absolute polylines (about 4.7 KB per glyph).

The useful number is the last column: **regenerating the one word being typed costs about 1 ms.** Almost
all of the 160–860 ms is redoing words that didn't change.

### 6.2 Budget

Pavel Fatin's measurements argue that editors should aim well under a frame, and that even 20 ms of
added latency isn't clearly harmless ([Typing with pleasure](https://pavelfatin.com/typing-with-pleasure/)).
Targets for Seedhand (est.): **the caret and a draft glyph in the same frame as the key** (input handler
plus paint under 8 ms); the full ink look within 150 ms of the last key; never more than one long task
(over 50 ms) on the main thread per edit.

### 6.3 How to get there

1. **Stable seeds first** (writing-experience §7.3 #3). Without them nothing can be cached, because an
   insertion changes every later letter. Key each instance on the word and its occurrence, so `"the"` the
   third time keeps its shape however much text moves around it.
2. **Cache outlines, re-flow positions.** Split `layout()` into *shape* (per word: `makeGlyph` for each
   letter, the expensive part, cached by `hand key + word + occurrence seed`) and *flow* (word gaps, line
   breaks, baseline wander: cheap arithmetic over cached advances). An edit dirties one word; flow runs
   from the start of that paragraph and stops as soon as a line ends where it ended before. Most
   keystrokes reshape one word and re-flow one line.
3. **Keyed output.** Emit one `<g data-run="…">` (SVG) or one vertex range (WebGL) per word, so the
   renderer replaces only dirty runs. No whole-sheet `innerHTML`, and no regex over megabytes.
4. **Two tiers.**
   - *Draft, this frame, main thread:* the dirty word from the cache, or freshly made (about 1 ms),
     filled flat in the ink colour, no filter. Caret and selection are computed from the draft geometry,
     so they never wait.
   - *Final, idle:* the ink look (edge displacement, density, texture) runs in the worker or as a
     shader, debounced to about 120 ms after the last key (est.), and swaps per run with a short
     cross-fade. Once glyph geometry is frozen (stable seeds), the final pass changes texture only, never
     shape, so the swap is invisible apart from the ink "settling", which suits the product.
5. **WebGL2 renderer.** Move the ink filter into a fragment shader (noise displacement on the edge
   distance) so it costs nothing per edit; upload each word's triangles once. Rendering can move to a
   worker with `OffscreenCanvas` (`transferControlToOffscreen`, Baseline 2023): Chrome and Firefox support
   WebGL there, and Safari does from 17 on iOS 17 and macOS Sonoma, not on older OSes
   ([WebKit 183720](https://bugs.webkit.org/show_bug.cgi?id=183720),
   [WebKit 253431](https://bugs.webkit.org/show_bug.cgi?id=253431)). Feature-detect inside the worker,
   since `getContext('webgl2')` returning `null` there is the only reliable test. Keep the caret and
   selection overlay in the DOM or a separate 2D canvas on the main thread, so they never wait on the
   worker.
6. **Slim the paths.** Run the engine's `simplify()` (or fit quadratic curves) before output, and use
   relative coordinates; 5–10× smaller is plausible (est.). This also helps the share-image export.
7. **Keep React out of the hot path.** Draw the caret and selection from a ref in `requestAnimationFrame`,
   not through state that re-renders `PaperEditor`. Break up long main-thread work with
   `scheduler.yield()` where it exists (Chrome 129, Firefox 142; not Safari) and fall back to a
   `setTimeout` promise ([Chrome](https://developer.chrome.com/blog/use-scheduler-yield),
   [corewebvitals.io](https://corewebvitals.io/pagespeed/yield-to-main-thread)).
8. **Measure what users feel.** Extend `lib/perf.ts` to log `keydown → draft painted` (rAF after the
   handler) and `keydown → final painted`, and add a QA trace: a recorded 250-word typing session replayed
   on a mid-range Android phone.

---

## 7. Recommendation for Seedhand

### 7.1 Architecture

```
            ┌───────────────────── main thread ─────────────────────────────────────────────┐
 keys, IME, │ InputAdapter (hidden <textarea>; EditContext later)                            │
 dictation, │   beforeinput → hint      input → diff(old,new) → RawEdit                      │
 paste ───► │   composition* → Preedit  selectionchange → Sel                                │
            │        │                                                                       │
            │        ▼                                                                       │
 pointer ─► │ Intents  (insert · delete · replace · compose · break · undo · select · nav)   │
 (Gestures) │        │                                                                       │
            │        ▼                                                                       │
            │ Doc  ── FairCopyDoc: string + own undo stack                                    │
            │      └─ InkDoc: append-only log + buffer + planner (writing-experience §3.5)    │
            │        │ logicalText, changed ranges                                           │
            │        ▼                                                                       │
            │ Layout (incremental: dirty paragraph → words → lines)  ── GeometryIndex        │
            │        │ positions now, outlines from cache          caret stops, line curves  │
            │        ▼                                                    │                  │
            │ Renderer: draft tier (this frame) ──► final tier (worker, idle) │              │
            │ Overlay: caret, selection, preedit underline, handles  ◄────────┘              │
            │ A11y: the textarea itself + status live region + transcription                │
            └────────────────────────────────────────────────────────────────────────────────┘
```

Rules that keep it robust:

1. **One way in.** Every edit, from keys, IME, dictation, paste, drop, the context menu or the custom
   touch toolbar, becomes an `Intent`, and only intents touch the document. (This is the Hemingway-mode
   lesson in writing-experience §1 and the Ink "no leaks" rule.)
2. **The browser applies, we diff.** Let the textarea do its own editing, then diff the value on `input`.
   `inputType` is a hint for *intent* (paste vs type vs autocorrect), never the source of truth for *what
   changed*.
3. **The textarea always holds the logical text** (plus the Ink buffer). We write to it only when the model
   disagrees, never during composition, and through `setRangeText` so the browser's selection survives.
4. **Geometry is derived, never guessed.** The engine returns caret stops for every boundary, including
   spaces and line ends, plus per-line baseline curves and the slant. The app stops recomputing spacing.
5. **Two render tiers.** A cheap glyph for the keystroke's own frame, and the full ink later.

### 7.2 TypeScript interfaces

```ts
// ---------- 1. Input adapter: the only code that touches DOM input events ----------
interface Sel { anchor: number; head: number }                  // UTF-16 offsets into logical text
interface Preedit { from: number; to: number; text: string }    // the composing range, in the textarea value

interface RawEdit {
  from: number; to: number; insert: string;   // from diff(before, after); offsets in `before`
  inputType: string;                          // beforeinput hint, '' if none arrived
  composing: boolean;                         // inside compositionstart..compositionend
  data?: string;                              // paste/drop text from the beforeinput DataTransfer
  t: number;                                  // event.timeStamp
}

interface InputAdapter {
  attach(host: HTMLElement): void;
  dispose(): void;
  /** Model -> surface. Queued while composing; applied with setRangeText + setSelectionRange. */
  sync(text: string, sel: Sel): void;
  /** Move the surface to the caret so IME windows, iOS scroll and SR focus rings land there. */
  place(caret: CaretGeom, px: number): void;
  readonly composing: boolean;
  on(type: 'edit', fn: (e: RawEdit) => void): void;
  on(type: 'select', fn: (s: Sel) => void): void;
  on(type: 'preedit', fn: (p: Preedit | null) => void): void;
  on(type: 'command', fn: (c: Command) => void): void;     // undo/redo/nav keys the app owns
}

type Command =
  | { k: 'undo' } | { k: 'redo' } | { k: 'escape' }
  | { k: 'move'; unit: 'line' | 'lineEdge' | 'page'; dir: -1 | 1; extend: boolean };

// ---------- 2. Edit intents: what the user meant ----------
type How = 'type' | 'paste' | 'drop' | 'dictation' | 'autocorrect' | 'compose' | 'yank' | 'transpose' | 'cut';

type Intent =
  | { k: 'insert'; at: number; text: string; how: How }
  | { k: 'delete'; from: number; to: number; unit: 'char' | 'word' | 'line' | 'selection'; how: How }
  | { k: 'replace'; from: number; to: number; text: string; how: How }
  | { k: 'preedit'; p: Preedit | null }                  // display only, never committed
  | { k: 'break'; at: number }
  | { k: 'undo' } | { k: 'redo' }
  | { k: 'select'; sel: Sel; granularity?: 'char' | 'word' | 'line' };

function toIntent(e: RawEdit, sel: Sel): Intent { /* table in 7.3 */ }

// ---------- 3. Documents ----------
interface Change { from: number; to: number; insert: string }  // in logical-text offsets

interface EditorDoc {
  readonly text: string;                               // what the letter says
  apply(i: Intent, now: number): DocResult;            // pure: returns the next doc, never mutates
}
interface DocResult {
  doc: EditorDoc;
  changes: Change[];            // for incremental layout and the textarea sync
  sel: Sel;
  notice?: 'ink-dry' | 'sheet-full' | 'fresh-sheet';   // spoken via the status live region
}
// FairCopyDoc: { text, undo: Change[][] }   InkDoc: { log: InkEvent[], buffer: string, planner } (writing-experience §4)

// ---------- 4. Layout + geometry (engine-side contract, requested from Writing & page) ----------
interface CaretStop {
  offset: number;                 // grapheme boundary in logical text
  sheet: number; line: number;
  x: number; y: number;           // font units; y = baseline at x (wander included)
  kind: 'glyph' | 'space' | 'lineEnd' | 'lineStart' | 'empty';
}
interface LineGeom {
  sheet: number; line: number; from: number; to: number;
  x0: number; x1: number;
  baseline(x: number): number;    // the same wander function layout() used
  slant: number;                  // radians, the hand's slant (positive leans right)
  ascent: number; descent: number;
}
interface CaretGeom { sheet: number; x: number; y: number; top: [number, number]; bottom: [number, number]; line: number }

interface GeometryIndex {
  readonly version: number;       // the layout this came from
  readonly text: string;
  caretAt(offset: number, affinity?: 'before' | 'after'): CaretGeom;  // 'after' = end of the upper line at a wrap
  hitTest(sheet: number, x: number, y: number): { offset: number; affinity: 'before' | 'after' };
  selectionPaths(from: number, to: number): { sheet: number; d: string }[];   // one closed path per line
  lineOf(offset: number): LineGeom;
  wordAt(offset: number): [number, number];     // Intl.Segmenter('word')
  remap(offset: number, from: string): number;  // stale-layout translation (today's translateIndex)
}

// ---------- 5. Rendering ----------
interface RunKey { word: string; seed: string }          // stable per word occurrence (writing-experience 7.3 #3)
interface Renderer {
  mount(host: HTMLElement): void;
  draft(runs: PlacedRun[]): void;     // this frame: cached or canonical outlines, flat ink
  final(runs: PlacedRun[]): void;     // later: full pen + ink look, per-run swap
  overlay(o: { caret?: CaretGeom; sel?: { sheet: number; d: string }[]; preedit?: [number, number] }): void;
}
interface PlacedRun { key: string; sheet: number; glyphs: { id: number; x: number; y: number; ch: string }[] }
```

### 7.3 Event handling, by inputType

"Apply" means the browser edits the textarea and we diff on `input`. "Cancel" means `preventDefault()` in
`beforeinput`. The Ink column follows writing-experience §3.4; "at the pen" means at the pen head.

| inputType | Fair copy | Ink | Cancel? |
|---|---|---|---|
| `insertText` | Apply → `insert` (or `replace` if a selection was overwritten) | Buffer at the pen; mid-text → caret insertion; over a selection → strike + write above | No |
| `insertCompositionText` | Apply; show preedit underline; don't write the URL hash until `compositionend` | Preedit lives in the buffer, drawn as a faint draft; never inked until commit | Never (can't on Android) |
| `insertReplacementText` | Apply → `replace(how: 'autocorrect')` | Range still in the buffer → clean; already inked → planner `replace` (strike + above). The one-word touch trail makes this rare | No |
| `insertLineBreak` | Apply → `break` | At the pen → `break`; mid-text → `//` para mark | No |
| `insertFromPaste` (+`AsQuotation`) | Apply; normalise `\r\n` → `\n` afterwards via `setRangeText` | Buffer, written out by hand, "Finish writing" to skip | No |
| `insertFromDrop` | Cancel; handle the paper's `drop` instead | Same → buffer | Yes |
| `deleteByDrag` | Cancel (nothing visible to drag) | Cancel | Yes |
| `insertFromYank`, `insertTranspose` | Apply | Yank = paste; transpose = `replace` of two letters (planner overwrite) | No |
| `deleteContentBackward/Forward` | Apply → `delete(char)` | In buffer → clean; at the pen on ink → pending fix; elsewhere → strike | No |
| `deleteWordBackward/Forward` | Apply → `delete(word)` | Strike the word as one stroke | No |
| `deleteSoftLineBackward/Forward`, `deleteHardLineBackward` | Apply → `delete(line)` | Strike the run, one stroke per written line | No |
| `deleteByCut` | Apply; the clipboard gets the logical text | Strike + copy | No |
| `deleteContent` / anything unknown | Apply; trust the diff | Trust the diff; the planner decides | No |
| `historyUndo` / `historyRedo` | Cancel → own undo stack (the native one dies on any programmatic write) | Cancel → wet-tail undo, or the "ink is dry" notice | Yes |
| `format*` | Not sent to a textarea | | |
| `keydown` ⌘/Ctrl+Z, ⇧⌘Z, Ctrl+Y | Same as history*, for engines that skip `beforeinput` | Same | Yes |
| `keydown` arrows, Home/End, PageUp/Down | Up/Down, Home/End, PageUp/Down app-owned (§3.6), **unless composing** | Same | Yes, when handled |
| `keydown` Escape | Blur, **unless composing** (Escape cancels the IME) | Same | Only when handled |
| `keydown` Enter just after `compositionend` | Ignore (Safari ordering) | Same | — |

### 7.4 Mobile and IME test cases

Record each as a trace (events, values, selections, timings) so it becomes a regression test that
replays through the adapter in CI.

**iOS Safari (iPhone, iPad)**
1. Type `teh ` with autocorrect on → "the " in one `replace`; Ink: no strike (still in the trail).
2. Tap a QuickType suggestion mid-word, and after a space.
3. Double-space → ". "; smart quotes and dashes.
4. Dictate two sentences, then keep typing; dictation revising its last word.
5. Space-bar trackpad caret move; VoiceOver rotor by character, word and line.
6. Shake to undo; three-finger swipe undo; iPad hardware keyboard ⌘Z, arrows, ⌘←/→, Globe emoji.
7. Emoji with ZWJ and skin tone: one caret stop, placeholder glyph.
8. Japanese flick input with conversion; Chinese Pinyin; Korean.
9. Keyboard opens: caret line stays visible, Done stays visible; rotate the device; split iPad keyboard.
10. Long-press, drag handles, Paste callout via `readText`, Copy, Cut.

**Android Chrome**
11. Gboard: type, Backspace inside the composing word, Backspace into the previous word (re-composition),
    autocorrect on space, tap a suggestion, glide typing (whole word plus auto-space), voice typing.
12. Samsung Keyboard: the same set, predictive text on and off.
13. SwiftKey: glide and autocorrect.
14. Gboard Pinyin and Korean (each jamo updates the syllable); Japanese.
15. Keyboard clipboard strip paste; long-press paste through the custom bar.
16. TalkBack: explore by touch, read by character, typing echo.

**Desktop**
17. macOS dead keys (⌥e e → é); press-and-hold accent menu; Japanese (Kotoeri) candidate window position
    and arrow-key candidate selection; Pinyin; Ctrl+⌘Space emoji; dictation; Text Replacements; Writing
    Tools rewriting a paragraph.
18. Windows: Microsoft Japanese, Chinese and Korean IMEs; Win+. emoji; Win+H voice typing; touch
    keyboard on a tablet.
19. Linux IBus and Fcitx (one pass).
20. Right-click paste on the paper; drag text in from another app; select all + delete.
21. A held key (auto-repeat) and a 120 wpm burst: no dropped characters, caret never behind.
22. Blur mid-composition (click a slider): the composition commits once, not twice.
23. A 1,000-word, four-sheet note: draft paint within one frame on a mid-range Android phone.
24. Screen readers: VoiceOver macOS, NVDA (Firefox and Chrome), JAWS, Narrator.
25. Grammarly installed: no floating widget at the hidden textarea.

### 7.5 Phased plan

| Phase | Scope | Done when |
|---|---|---|
| **0. Hot fixes** (1–2 days) | Critique items 1, 2, 10, 11, 12 and 14 (§7.7): composition guards, preedit underline, textarea sizing and attributes, VisualViewport, the platform check | CJK IMEs work on the paper; Done stays visible on iOS |
| **1. Input adapter** | `InputAdapter`, `diff`, `toIntent`, own undo stack, the trace recorder, and the property test. Record traces 1–22 on real devices | Replaying every trace yields `value === doc.text`; `inputType` table confirmed or corrected |
| **2. Geometry** | Engine `stops[]` and `LineGeom` (request to Writing & page); `GeometryIndex`; slanted caret; selection ribbons; hit-testing; drag, double- and triple-click; context-menu paste; drop | Click accuracy on a 25° hand within half a letter (est.); no caret jump after spaces |
| **3. Performance** | Stable seeds; per-word cache and flow split; keyed SVG runs; draft and final tiers; path slimming; perf marks | Draft paint within one frame and final within 150 ms on a 250-word note on a mid-range phone |
| **4. Ink mode** | Buffer and preedit drafting, the planner and the log (writing-experience §§3–4), wet-tail undo, status announcements | The "Dear Jon → John" moment works with every input path, IME included |
| **5. Touch and enhancement** | Custom handles and bar; WebGL2 renderer behind the same `Renderer` interface; EditContext experiment on Chromium desktop behind a flag | Touch editing without "Edit as plain text"; EditContext A/B shows better IME placement or it's dropped |

### 7.6 Risks

| Risk | Mitigation |
|---|---|
| Mobile keyboards change behaviour with every release | Diff-based core, recorded traces, a quarterly device pass |
| Writing to the textarea mid-composition corrupts IME state | One queued `sync()`, flushed only after `compositionend`; tests 11, 14, 22 |
| The model and the textarea drift apart | Property test and a dev-mode assertion on every `input` |
| Custom touch selection feels worse than native | Ship tap and double-tap first; keep "Edit as plain text" one tap away; usability test before handles |
| Screen-reader experience regresses invisibly | Screen-reader cases in every release checklist; the textarea stays the single source |
| Incremental layout diverges from full layout | QA: incremental result must equal a fresh `layout()` byte for byte (`tools/qa/regress.mjs`) |
| Stable seeds change every existing shared link's look | Version the seed scheme in the hash; old links say "re-penned" (PRINCIPLES rule 6) |
| EditContext stays Chromium-only | It's an enhancement behind the same adapter interface; nothing depends on it |
| Workstream ownership: geometry lives in `engine/layout.js` | Ask Writing & page for `stops[]`, `LineGeom` and the shape/flow split; the app owns everything else |

### 7.7 The current app: what's right, what to fix

Read from `.claude/worktrees/peaceful-dhawan-528fb2/app/src/` (`components/PaperEditor.tsx`, `lib/caret.ts`,
`hooks/useWriting.ts`, `workers/write.worker.ts`, `lib/write-core.ts`).

**What it gets right.** It made the same core bet as Monaco, Flutter web and xterm.js: a real `<textarea>`
holds the text, selection, native undo, IME and screen-reader access, and the app paints the caret and
selection. The textarea follows the caret, so IME candidate windows open in the right place. It listens to
`selectionchange`, so caret moves that arrive without keys (iOS space-bar trackpad, VoiceOver) are picked
up. `translateIndex` keeps the caret honest while the worker is a frame or two behind, which is the right
idea. Up/Down keep a goal column, `focus({ preventScroll: true })` is used, the textarea is 16 px, so iOS
won't zoom, the blink restarts on every move, reduced motion stops the blink, and the SVG is `aria-hidden`.
The render boundary (`Writing.tsx`, `lib/writing.ts`) is already the right seam for WebGL.

**Bugs and gaps, most important first.**

| # | Problem | Where | Fix |
|---|---|---|---|
| 1 | **Key handlers run during IME composition.** ArrowUp/Down, Home/End and ⌘←/→ are `preventDefault`ed, and Escape blurs, even while an IME is composing. In Japanese and Chinese IMEs, arrows move through the candidate list and Escape cancels the composition, so these break CJK input | `PaperEditor.onKeyDown` | First line: `if (e.nativeEvent.isComposing \|\| e.keyCode === 229) return;` |
| 2 | **The composing text has no marked range.** The composing word is written into the page like committed text, with no underline, and each `compositionupdate` triggers a full worker re-write and a hash update | `onChange` → `onText` | Track `compositionstart/update/end`. Draw a dotted underline under the preedit range. Skip the URL-hash write while composing |
| 3 | **The caret lags the keystroke.** The caret is placed from the last *finished* layout, so a new letter has no box until the worker returns; the caret sits still, then jumps | `caretAt(map, toMap(…))` | Draft tier (§6): place and draw the new glyph's box on the main thread this frame, then let the worker refine |
| 4 | **Mid-text edits reshape every later letter.** `layout()` seeds instances with `'live:' + charIndex`, so inserting one letter re-rolls all the letters after it; the text under the caret shimmers | `engine/layout.js` | Word-occurrence seeds (writing-experience §7.3 #3) |
| 5 | **Hit-testing ignores slant and baseline wander.** `lineAtY` uses the nominal ruled grid plus a 0.72 fudge, and `indexOnLine` compares x only. With slant up to 30° (`hand.js`), a cap-height point sits up to 0.4 em right of its base, so clicks near ascenders land a letter late | `lib/caret.ts` | Unshear by the slant around the line's actual baseline, then search caret stops (§3.2) |
| 6 | **The caret after a space is a guess.** The caret uses the nominal `spaceU`, but `layout()` jitters word gaps, so the caret jumps when the next letter lands; runs of spaces collapse to one caret position | `caretAt` | Have `layout()` emit space and line-end stops (§7.2) |
| 7 | **The selection is ragged.** One rect per glyph, each at its own baseline, all the same height; selected spaces at line ends and empty lines don't show | `rects` | One path per line along the baseline curve, sheared by the slant (§3.3) |
| 8 | **No drag, double- or triple-click selection, and no context-menu paste.** Right-click on the paper shows the page menu, not Paste | `onMouseDown/onClick` | Pointer events with capture, `detail` for click count, `Intl.Segmenter` for words, and on `contextmenu` move the textarea under the pointer (the CodeMirror 5 trick, §3.5) |
| 9 | **Touch has tap-to-place only.** No long-press, handles or Paste callout. Mobile users can paste only through the keyboard's clipboard strip | | Custom handles and a small toolbar (§3.5). Keep "Edit as plain text" as the escape hatch |
| 10 | **The textarea is 2 × 16 px, `opacity: 0`, `pointer-events: none`.** `opacity: 0` is right (it trips WebKit's hidden-editable rule, so iOS draws no misplaced native handles), but a 2 px sliver is a poor target for VoiceOver and NVDA | textarea style | Keep `opacity: 0`; make it one line tall and as wide as the rest of the line; give the sheet a labelled group (§4) |
| 11 | **`spellCheck={false}` and no `autocorrect` attribute.** Spelling help is invisible anyway, but autocorrect behaviour is then left to platform defaults | textarea attrs | Fair copy: keep autocorrect on and say so; Ink: on, with the one-word trail (writing-experience §6). Add `enterkeyhint="enter"` and the Grammarly opt-out attributes |
| 12 | **No keyboard-aware viewport.** The "Done" button is `position: fixed; top: 0`, which on iOS is relative to the layout viewport and can scroll off while the keyboard is up; nothing keeps the caret line above the keyboard when the textarea doesn't move | `App.tsx` | VisualViewport listener and `interactive-widget=resizes-content` (§5) |
| 13 | **Every keystroke rewrites and re-parses the whole sheet's SVG,** including the id-scoping regexes | worker + `Writing.tsx` | Per-word cache and keyed nodes (§6) |
| 14 | `navigator.platform` is deprecated | `onKeyDown` | `navigator.userAgentData?.platform ?? navigator.platform`, or check `e.metaKey` and `e.ctrlKey` both |
| 15 | Native undo is the only undo, and it dies whenever React writes `value` (the plain-text slip, a loaded link) | textarea | Own undo stack in both modes; route `historyUndo/Redo` to it |

---

## Sources

**Verified this session:** [Pavel Fatin, Typing with pleasure](https://pavelfatin.com/typing-with-pleasure/) ·
[GTK cursor-blink-timeout](https://docs.gtk.org/gtk4/property.Settings.gtk-cursor-blink-timeout.html) ·
[GetCaretBlinkTime](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getcaretblinktime) ·
[Mozilla 1518196 (530 ms blink)](https://bugzilla.mozilla.org/show_bug.cgi?id=1518196) ·
[Intl.Segmenter (web-features)](https://web-platform-dx.github.io/web-features-explorer/features/intl-segmenter) ·
[scheduler.yield (Chrome)](https://developer.chrome.com/blog/use-scheduler-yield) ·
[scheduler.yield support (corewebvitals.io)](https://corewebvitals.io/pagespeed/yield-to-main-thread) ·
[WebKit 183720: OffscreenCanvas WebGL](https://bugs.webkit.org/show_bug.cgi?id=183720) ·
[WebKit 253431](https://bugs.webkit.org/show_bug.cgi?id=253431) ·
[Grammarly opt-out (Oracle)](https://docs.oracle.com/en/cloud/saas/sales/fasqa/how-can-i-turn-off-the-grammarly-extension-while-loading-an-oracle-intelligent-advisor-interview.html) ·
[Grammarly and CodeMirror](https://discuss.codemirror.net/t/codemirror6-and-grammarly/3917)

**Primary sources not re-opened this session** (stable references; check before quoting details):
[Google Docs canvas](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html) ·
[The New Stack on Docs](https://thenewstack.io/google-docs-switches-to-canvas-rendering-sidelining-the-dom/) ·
[Docs screen reader help](https://support.google.com/docs/answer/6282736) ·
[VS Code editContext source](https://github.com/microsoft/vscode/tree/main/src/vs/editor/browser/controller/editContext) ·
[VS Code accessibility](https://code.visualstudio.com/docs/editor/accessibility) ·
[CodeMirror guide: the view](https://codemirror.net/docs/guide/#the-view) ·
[prosemirror-view source](https://github.com/ProseMirror/prosemirror-view/tree/master/src) ·
[slate-react source](https://github.com/ianstormtaylor/slate/tree/main/packages/slate-react/src) ·
[Excalidraw textWysiwyg](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/wysiwyg/textWysiwyg.tsx) ·
[tldraw](https://github.com/tldraw/tldraw) ·
[Flutter web text editing](https://github.com/flutter/flutter/tree/master/engine/src/flutter/lib/web_ui/lib/src/engine/text_editing) ·
[Flutter accessibility](https://docs.flutter.dev/ui/accessibility-and-internationalization/accessibility) ·
[xterm.js AccessibilityManager](https://github.com/xtermjs/xterm.js/blob/master/src/browser/AccessibilityManager.ts) ·
[CanvasKit](https://skia.org/docs/user/modules/canvaskit/) ·
[WICG html-in-canvas](https://github.com/WICG/html-in-canvas) ·
[EditContext (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/EditContext_API) ·
[EditContext spec](https://w3c.github.io/edit-context/) ·
[Web Editing WG charter](https://www.w3.org/groups/wg/webediting/charters/active/) ·
[Input Events spec](https://w3c.github.io/input-events/) ·
[MDN inputType](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/inputType) ·
[w3c/input-events #115](https://github.com/w3c/input-events/issues/115) ·
[#134](https://github.com/w3c/input-events/issues/134) ·
[autocorrect (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/autocorrect) ·
[writingsuggestions (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/writingsuggestions) ·
[WebKit Async Clipboard API](https://webkit.org/blog/10855/async-clipboard-api/) ·
[Chrome viewport resize behaviour](https://developer.chrome.com/blog/viewport-resize-behavior) ·
[VisualViewport (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) ·
[VirtualKeyboard API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API) ·
[WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

**Checked by the research passes (primary sources):** Docs iframe, screen reader and annotated-canvas
details; Figma's Mirror DOM post; Flutter's `text_editing.dart` and issues #98817, #99918, #118111 and
#120613; Excalidraw's `textWysiwyg.tsx`; tldraw's `RichTextArea.tsx`; Freeform's support page;
EditContext status and issues #139 and #151; VS Code's textarea and native EditContext sources, release
notes and issues #207700 and #285013; CodeMirror's blog, `input.ts`, changelog and commit 6ea9dd61;
Wordgard 0.1; ProseMirror's `domchange.ts`; Lexical's `LexicalEvents.ts`; Slate PR #4988; xterm.js's
`CompositionHelper.ts`; input-events #115 and #134; `interactive-widget` (WebKit 259770); iOS 26
viewport bugs; WebKit's hidden-editable rule (r249296); NVDA #16398; HTML-in-Canvas; Pretext; Slug;
Adrian Roselli on custom carets.

**Not verified at all:** Figma's IME handling, the per-engine inputType table and the composition
quirks in §§2.3–2.4 (Phase 1 confirms them on devices), and VoiceOver iOS behaviour with an
`opacity: 0` textarea. Each is flagged inline.
