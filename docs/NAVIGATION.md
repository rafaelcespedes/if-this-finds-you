# Navigation

_Set up 2026-11-03._ How people move around the site, in the same words and the same places on every page. Every
page draws its header with one component, `app/src/components/SiteHeader.tsx`; the names, order and addresses come
from `app/src/lib/places.ts`. Change them there, never in a page. The 404 is a built page like the others
(`app/404.html` with `src/notfound/`, built as `dist/404.html`, which Vercel serves for any address that isn't
there): the same `<SiteHeader />` with no place marked, and its words and two ways on written in the page itself, so
they show even if the script can't load.

## The places

Four places, always in this order, always in these words:

| Place | What it is | Address |
|---|---|---|
| **Write a letter** | the writing tool: a found letter on the desk, Find another, your own letter | `/` |
| **All letters** | the library: the canvas (and the grid, `?view=grid`); a letter's page sits inside it | `/letters` |
| **Fonts** | every hand as a free font | `/fonts` |
| **About** | what this is, where the letters and hands come from, credits | `/about` |

**My letters** is not a place: it's your own letters kept on this device. It appears only when at least one is
kept, before the four places (with a hairline between, so it reads as yours, not as a page), with the count.
It opens a short list; picking one brings that letter back onto the desk. It works from every page: away from the
tool, it opens the tool at `/?kept=<savedAt>`, and the tool takes it off the address once it's open.

Words we don't use for these: "Letters", "Library", "Archive", "Home", "Write" on its own, "Fonts page", icons
without words.

**Adding a place.** A new page that people should be able to reach from anywhere gets one line in `PLACES`
(`lib/places.ts`), after the others, and its page renders `<SiteHeader current="<its id>" />`. **About** (`/about`) is the fourth and last place, in that one word. Nothing else changes:
every header picks it up, and where the line no longer fits, the Menu takes over.

## Where you are

- The place you're on has a light-red fill behind its words, and the words in the look's red (Rafael: "I like the
  light red fill"; Rubric's vermilion in Classic, the archival red of "No. 0004" in the Reading Room). The places you
  can go, and My letters, take a faint ink wash under the pointer and a firmer one when pressed (with a 0.97 press),
  in the same shape; no underlines. The same in the phone Menu's rows. It's said to screen readers
  (`aria-current="page"`), isn't a link (clicking where you already are does nothing), and in forced colours its
  words are underlined.
- A letter's page sits inside All letters: All letters is marked too, and stays a link, the way back to the
  list as you left it (search and era kept).
- A shared letter (the reader view, `?read=1`) isn't one of the places, so nothing is marked there.

## The running head

The header is the site's running head (the Reading Room layouts, house rule 2): the wordmark on the left, the page's
**middle**, and the places on the right, on one line. In the Reading Room it sits over one hairline and is set in
the label role's small capitals; the letter's number is archival red. Other looks keep the plain header.

- **The middle** says what this page holds, on desktops and tablets. Pages pass it as `centre`:
  - a letter's page: the counter "‹ No. 0004 · 4 of 127 ›" (the library builds it);
  - All letters: where you are on the canvas, the decade under the middle of the screen (the library builds it).
  Mark the number with `data-site-number` so the looks can colour it.
- **The desk has no middle** (Rafael, launch day: "I don't think we need it. And I think it's just weirdly
  centered"): its found letter's number, place and year are the record's, beside the letter. (It had them as
  "No. 0115 · Millsburg · 1838", centred over the letter's side with `beside`.)
- It's centred over the page; `beside` (a column's width kept aside, the middle centred over the rest) is there for a
  page that needs it, and no page passes it now.
- **Phones (under 40rem) have no middle** (Rafael, 3 Nov: "keep the navigation on mobile minimal"): the wordmark,
  the page's action (Share on the desk) and the Menu. The number, place and year stay on the page itself.
- When the line gets tight on a larger screen, the header gives way in this order: the middle moves off-centre, then
  the places go into the Menu, then the middle steps aside (`useFits` in SiteHeader.tsx).

## The band and its layer

- The header is a solid band of the page's own ground (`--background`: the Reading Room's room, Classic's desk) from
  the top of the window to just under the line, fading out over 12 px below it, so nothing scrolling under it (the
  desk's side column, the canvas) shows through. In the Reading Room on a desktop it spans the side column too.
- Its layer is 30: above the page and the desk's side column, below the docks' menus, the phone's control sheet
  (40) and every menu, sheet, tooltip and toast (50). It stays `pointer-events-none` with its controls `auto`, so
  the band never blocks a drag on the canvas.

## Pinned at the top, full width

- One treatment on every page (Rafael: "make all of them full width"): the header is fixed to the window and runs its
  full width, the band and its 12 px fade edge to edge, the row and its rule between the side margins. The desk's
  header too, in every look (Classic's panel starts under it); it no longer zooms on a wide screen.
- The side margins have one source, `--site-margin` in index.css: 16 px on a phone, 32 px from 40rem, 40 px from
  64rem (the safe-area inset wins when wider). So the wordmark and the last place sit at the same x on every page
  (40 and 1400 at 1440; 40 and 1880 at 1920). The Reading Room's --rr-margin and the editorial grid's --ed-margin
  carry the same values; the header never takes a max-width.
- It pins on every screen, a short one too: a phone on its side, a window under 32rem tall, a laptop at 200%. (It used
  to scroll away there, but it still drew over the page's top, which kept no room for it: launch-day phone QA.) Print
  is unchanged: at the top of the first page.
- It floats over the page (nothing moves on first paint; pages keep their own top space). Its height is
  `--site-head-box`; it covers `--site-head`, and with its fade `--site-head-clear`, on every screen and in print.
  Pages start below it with them (`padding-top: calc(var(--site-head-clear) + …)`). `html` has
  `scroll-padding-top: var(--site-head-clear)`, so a jump to an anchor stops below it, and anything else that sticks
  to the top uses `top: var(--site-head-clear)` (the Fonts bar and rail, About's titles).

## When the words fit (desktops, tablets)

```
[wordmark]                         [page action]  My letters 3 | Write a letter  All letters  Fonts
```

- The wordmark sits at the same spot on every page: 16 px from the window's edge on phones, 32 px from 640 px,
  40 px from 1024 px; 16 px from the top, 20 px from 1024 px. On the tool the header runs over the letter's
  column (the panel has the right side); elsewhere it runs the width of the window.
- 12.5 px words, the interface face, medium weight; hover darkens them.
- The words never wrap. The header measures whether they fit on one line beside the wordmark (and the page's
  action); when they don't, they go into the Menu. That decides it on phones, but also beside the tool's panel on
  a narrow window, with large text (200 % text on a 1440 px screen gets the Menu on the desk), with a look's wider
  capitals, and when My letters or a fourth place adds width. It's measured again whenever any of those change.

## When they don't (phones, large text, narrow windows)

```
[wordmark]                                         [page action] [≡]
```

- Everything goes into one **Menu** chip at the top right (drawn 32 px, a 44 px target, the same chip as Share): a
  quiet icon button, only its icon at rest, a wash in 4 px corners under the pointer and while pressed or open.
  It opens the shared Sheet (`components/ui/sheet.tsx`): on a phone a bottom sheet that slides up, follows your
  finger, and closes on a swipe or flick down, the backdrop or Escape; the four places as big 56 px rows (the
  current one marked), then "My letters, kept on this device" with the list. On a larger screen (large text, a
  narrow window) the same list opens as a popover from the chip. With letters kept, the chip carries their count.
- **Why one menu and not a row of icons.** Before this, the tool's phone header had four icon chips (My letters,
  All letters, Fonts, Share). A grid icon and an "Aa" don't say "All letters" or "Fonts"; at 320 px the chips ran
  over the wordmark; and the library and Fonts pages showed words instead, a different set on each page.
  The wordmark is wide (about 150 px) and the words don't fit beside it on any phone (they need about 450 px), so
  the choice is icons, two rows, or a menu. A menu keeps the words, keeps the letter the first thing you see, and is the same on
  every page. Editorial sites do the same on phones (The New York Times, Substack: wordmark plus menu), and the
  bottom of each page is already taken by its own tools (the desk's sheet, the timeline dock, the letter's dock,
  the Fonts dock), so a tab bar would collide with all of them.
- **What stays out in the open:** the wordmark (the way to Write a letter) and the page's one action. Getting from
  the desk to All letters is two taps; from a letter back to the list it's the browser's Back (the way most people
  came), Escape on a keyboard, or the menu.

## Page actions and the site's places

The header is for moving between places. A page's own actions live with what they act on: Share and Find
another in the desk's panel (on phones, the sheet), Previous / Next / Reply in a letter's dock, filters in the
library's and Fonts' docks, In ink beside the letter's label.

The one exception is the **page action slot**, just before the places: an action that would otherwise have no home
on that screen. Today it holds only **Share on the tool when there's no panel** (under 1024 px). On desktop Share
stays in the panel. Keep it to one action, and only when the page has nowhere else to put it.

## The wordmark and Back

- The wordmark links to Write a letter on every page except the tool, where it's plain: a link there would load a
  fresh desk and drop the letter you're writing. Its name for screen readers: "If This Finds You: write a letter".
- Back is the browser's. Every move between places is a real page, so Back always returns. Inside a page the
  established rules hold: turning letters replaces the page in the history (Back still goes to the list), and
  Find another / a new hand are steps Back can undo.
- No back arrows in the header. On a letter's page, All letters is the way up; Escape does the same on a keyboard.

## Accessibility

- Order for keyboards and screen readers is the order on screen: wordmark, page action, My letters, the places
  (or the Menu chip). The places are a `<nav aria-label="Site">` list.
- Every target is at least 44 px (the words carry an invisible larger hit area so the line stays compact).
- The Menu is a button (`aria-expanded`) that opens a dialog (the sheet, or the popover). Opening it moves focus to
  the first place; Tab stays inside; **Escape closes it** and returns focus to the chip (on a phone once the sheet
  has slid away), without also leaving a letter's page (that page goes back on Escape); a tap on the backdrop or
  outside closes it, and so does a swipe down on a phone.
- The current place says so (`aria-current`). My letters says how many are kept ("Menu, 2 letters kept").
- While you're writing on a phone, the header steps aside and its controls leave the tab order (`inert`).
- Focus rings use `--ring`; the chips and words keep their look in forced colours.

## For the looks

Looks restyle the header only through these hooks (never through its utility classes, which may change):

| Hook | What it is |
|---|---|
| `header[data-site-header]` | the header |
| `[data-site-link]` | a place (header and phone menu); `[aria-current]` on the one you're in |
| `[data-site-words]` | a place's words (carries the current rule as `::before`) |
| `[data-site-kept]` | My letters and its count |
| `[data-site-divider]` | the hairline between My letters and the places |
| `[data-site-chip]` | the phone Menu chip (Share is `[data-chip]`) |
| `[data-site-action]` | the page action slot |
| `[data-site-menu]`, `[data-site-label]` | the phone menu sheet and its "My letters" label |

The Reading Room sets the words in its small capitals (and the menu's too); Postmarked in small postal capitals.

## Before this (the audit, 2026-11-03)

| | Tool | All letters | A letter | Fonts | 404 |
|---|---|---|---|---|---|
| Desktop links | My letters, All letters, Fonts | Write a letter, Fonts | All letters | Write a letter, All letters, Fonts | none |
| Current page shown | no | no | no | yes (darker only) | – |
| Phone header | 4 icon chips (My letters, All letters, Fonts, Share) | Write a letter, Fonts | All letters | All letters, Fonts (Write a letter dropped) | none |
| Wordmark position | window edge (40 px) | inside the 1180 px column (170 px at 1440) | same as library | same as library | 16 px |
| Wordmark a link | no | yes | yes | yes | yes ("home") |
| My letters | yes | no | no | no | no |

Other differences: Postmarked set the tool's My letters in sentence case beside capitals; the Reading Room set every
`header a` in small caps by guessing at markup; the library's header blocked dragging the canvas under it; at 320 px
the tool's chips covered the wordmark; the 404 had no way to Fonts.

## Open questions for Rafael

1. **"Write a letter" as the tool's name.** It's the established label (library, Fonts, 404) and reads as an
   invitation, but the tool opens on a found letter. Alternatives: "Write", "The desk". Kept for now.
2. **One more link out on phones?** At 375 px there's room for "All letters" beside the Menu (not at 320 px).
   Showing it would make the desk-to-library hop one tap, at the cost of a header that changes with the width.
3. **The current-place rule in Rubric vermilion.** It's a guiding mark, which Rubric allows, but it's one more red
   mark on the desk. Ink would be quieter.
