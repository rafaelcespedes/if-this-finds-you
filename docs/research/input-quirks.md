# Web text input APIs and mobile keyboard quirks (status 2026-11-02)

A companion to `editor-engineering.md`. That report's §§2.3–2.4 were written from memory; this file
checks those claims against primary sources. **Checked against:**
- mdn/browser-compat-data (BCD)
- web-features explorer
- wpt.fyi runs from 2026-11-02 (Chrome 156, Firefox 159, Safari 27.2, Firefox Nightly 161, Safari TP 255)
- WebKit, Mozilla and Chromium bug trackers
- engine source on main (Chromium `input_event.cc` and `input_method_controller.cc`; WebKit `EditCommand.cpp`, `Editor.cpp` and `TypingCommand.cpp`)
- field evidence in Lexical, CodeMirror 6, ProseMirror and the VS Code textarea input

Items marked **[unverified]** could not be confirmed. The research's web-search budget ran out partway through.

## 1. EditContext: don't build on it

- **Shipping.** Chrome, Chrome Android and Edge since 121 (Jan 2024). Baseline "Limited availability"; used on about 0.25% of page loads. Spec: https://w3c.github.io/edit-context/ (editor's draft, still changing in 2025).
- **WebKit.** No position (https://github.com/WebKit/standards-positions/issues/243). Bug https://bugs.webkit.org/show_bug.cgi?id=269922 is NEW and unassigned. Ryosuke Niwa, 2026-03-30: "no active plan", "likely just an issue of prioritization". Safari TP passes 1/46 WPT tests.
- **Mozilla.** Position is positive, with concerns about compatibility and accessibility (https://github.com/mozilla/standards-positions/issues/199). DOM-based EditContext is targeted for H2 2026 (bug 2046107); canvas support sits behind a later pref (bug 2045111). It is in a 50% Desktop Nightly experiment. Android is blocked.
- **Interop.** Not in any Interop year, including 2026.
- **Limitations:**
  - It attaches only to shadow-host elements or `<canvas>`, never `<textarea>`.
  - It gives **no accessibility**: you must provide your own accessible DOM.
  - On canvas, the browser provides no caret, selection or spellcheck UI.
  - Only 7 inputTypes become `textupdate`. Spellcheck replacement, paste, drop and undo/redo still arrive as `beforeinput` on the host.
- **Field experience.** CodeMirror limited EditContext to Android only on 2025-06-27: "causing more problems than it's solving on browsers that have reasonable keyboard input behavior". Its changelog records crashes, a leak, and missing `compositionend` on Android.
- **Verdict.** Use a hidden `<textarea>` as the input surface. Treat EditContext as a possible later Android-only enhancement at most.

## 2. beforeinput / inputType

- **Support:**
  - `beforeinput`: Chrome 60, Safari 10.1, Firefox 87.
  - `inputType`: Chrome 60, Safari 10.1, Firefox 66.
  - `isComposing`: partial in Safari 16.4+.
- **Composition events.** Level 2 has one non-cancelable `insertCompositionText`. **WebKit still emits the Level 1 types** (`insertFromComposition`, `deleteByComposition`, and so on), and some of them are cancelable. Chromium doesn't emit them.
- **`getTargetRanges()` on textarea** is spec-mandated to be empty. Diff values instead.
- **Undo/redo:**
  - `historyUndo`/`historyRedo` are dispatched by Chromium and WebKit. On contenteditable, Chrome passes WPT, Firefox passes partially, and Safari fails (it fires 8 events where 4 are expected).
  - Setting `.value` from script probably clears native undo **[unverified]**, so keep our own undo stack.
- **Enter** in a textarea gives `insertLineBreak` in all three engines.
- **Backspace with nothing to delete.** Chrome and Firefox fire `beforeinput` but no `input`; Safari fires neither. If the textarea holds only a window of the text, also catch Backspace at offset 0 via `keydown`.

| inputType | Chromium desktop | Chrome Android + Gboard | Firefox | Safari macOS | iOS Safari |
|---|---|---|---|---|---|
| insertText | yes, cancelable | on commit (space/punct.) | yes | yes | yes |
| insertCompositionText | yes, not cancelable | main path for words | yes | yes, not cancelable | CJK, some keyboards |
| Level-1 composition types | no | no | no ? | **yes** | ? |
| deleteContentBackward | yes | **preventDefault ignored** | yes | yes | yes; Korean 10-key sends ranged delete + insertText with no composition |
| deleteSoftLineBackward | yes | — | ? | no (Cmd+Backspace gives deleteHardLineBackward) | same |
| insertReplacementText | yes | not used for Gboard autocorrect ? | yes ? | autocorrect on space: yes; context-menu spelling sent insertText until 2026-08 fix | candidate bar yes; autocorrect fires **before** Enter's insertParagraph |
| insertFromPaste | yes | yes | yes | yes | yes |
| historyUndo/Redo | yes | n/a | partial | dispatched, WPT fails | ? |
| insertFromDictation | not a spec type; dictation arrives with inputType `""` in WebKit source ? | | | | |

Sources:
- Safari spelling and autocorrect behaviour: https://bugs.webkit.org/show_bug.cgi?id=195846, https://bugs.webkit.org/show_bug.cgi?id=304114, https://bugs.webkit.org/show_bug.cgi?id=164077
- Spec discussion: https://github.com/w3c/editing/issues/494, https://github.com/w3c/input-events/issues/134

## 3. Composition and mobile quirks

**Android Chrome + Gboard**
- Each word is one composition, committed on space or punctuation.
- `keydown` reports keyCode 229 / "Unidentified" (Enter is the exception), and `preventDefault` on it does nothing (crbug 737349).
- VS Code: "the data sent with the composition update event is unusable", so diff the value and selection instead.
- Tapping a word re-opens a composition on it.
- Gboard wraps Enter and Backspace in composition events, which can duplicate text if interrupted (CodeMirror). Infer Enter and Backspace from diffs.
- `compositionend` sometimes never fires; ProseMirror drops a stale composition after 5 s.
- Samsung Keyboard: autocompletion during composition (CodeMirror 6.36.3). Other Samsung specifics are **[unverified]**.

**iOS Safari**
- Autocorrect commits as `insertReplacementText` and fires *before* Enter.
- **Never preventDefault Enter on keydown in iOS.** It leaves the keyboard stuck in lowercase (CodeMirror, ProseMirror). Let the newline land, then reconcile.
- No Shift events for auto-capitalization.
- With an external keyboard, Ctrl+D changes text before its keydown fires.
- Dictation and smart-quote event shapes are **[unverified]**.

**Safari IME commit order**
- `compositionend` fires before the committing Enter's `keydown`, so `isComposing` is false on that Enter.
- A fix landed on 2026-04-08 (webkit.org/b/311717) and was **reverted** on 2026-06-15 (webkit.org/b/317127) after regressions. **Assume shipping Safari still has the bug.**
- Workaround: ignore Enter for about 100–500 ms after `compositionend`, or treat keyCode 229 as composing.

**Other platforms**
- Double-space period: CodeMirror detects ". " replacing a space on macOS and Android even with `autocorrect="off"`. iOS is **[unverified]**.
- macOS autocorrect plus auto-capitalize can fire two `beforeinput` events with no `input` between them (Lexical).
- Firefox's final `input` comes after `compositionend`.

**Input hint attributes (BCD)**

| Attribute | Chrome | Firefox | Safari |
|---|---|---|---|
| autocorrect | 153 | 136 | 14.1 / iOS 14.5 |
| autocapitalize | 43 | 111 | iOS only |
| inputmode | 66 | 95 | 12.1 / iOS 12.2 |
| enterkeyhint | 77 | 94 | 13.1 |
| writingsuggestions | 124 | no | 18 |

## 4. Keeping selection in sync

- **`selectionchange` on input and textarea** ships in Firefox 92, Chrome 127 and Safari 18, and it bubbles (WPT 60/60 in all three engines). Before those versions it fired only on `document`.
- **VS Code's pattern:**
  - Ignore `selectionchange` within 100 ms of your own writes or `input` events.
  - Drop duplicates within 5 ms.
  - Map the selection only when the textarea value still matches your last written state.
- **Never assign `value` or call `setSelectionRange` between `compositionstart` and `compositionend`.** Queue model-driven updates until after `compositionend` (on Android, wait a tick). Keep enough text around the caret for predictions to work.

## Practical upshot for Seedhand's hidden-textarea editor

1. Make the diff of textarea value and selection the source of truth; use inputType only as a hint.
2. Never cancel Enter on iOS.
3. Handle `insertReplacementText` as a ranged replace of the previous word. This is where Ink mode must not turn autocorrect into cross-outs.
4. Guard against Safari's out-of-order Enter after an IME commit.
5. Leave EditContext out for now.
