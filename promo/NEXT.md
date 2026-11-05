# Promo: change log of Rafael's notes

## Done in draft 3 (3 Nov)
- Title lines tighter (baseline gap 2.45 x-heights), phrase lower, counter centred on top, writer's name lower: one
  centred stack (phrase.ts `geometry`), same gap above and below the phrase, fixed for every hand.
- "HAND NO." set exactly as wide as the number; digits at a fixed pitch (the widest figure), so the plate never
  shifts; counter ~18% larger; plate sized to the pair.
- Frame 1 shows "HAND NO. 0001" (the wordmark hand); no writer's name on the title.
- End card in the same three slots: address on the plate, title, "Open source" / "Thousands of handwritten fonts"
  where the name and descriptor sit.
- Canvas → letter, option 1: pull back 7 beats, a still beat, dive back in 2 beats into the card we stopped on
  (tracked by a light red plate that becomes a red dot among the specks); the card dissolves over half a beat as the
  same hand starts the letter.

## Done in draft 4 (3 Nov)
- The letter shows one sentence ("Papa did not have time to write, so I wrote for him.") in a narrow column (half
  the sheet's measure), framed close: each e is about 2.5× bigger than in draft 3.
- The pull back stops at cards 1/150 of the frame (small coloured squares, not grey noise); the red dot is at least
  ~22 px at 1080 and swells once on the still beat.
- A cut on the bar into the letter (`handoffFrames: 0`).
- Title is a two-beat lead-in (the music's first downbeat goes on the first cut, 1.07 s); r's dropped (e 6, a 2
  beats); every section from the first cut starts on a bar. 26.7 s.
- The canvas takes 5000 − the flip's hands (4908 at 30 fps, 4841 at 60), so the counter ends on 5000 in both.

## Done in draft 5 (3 Nov)
- Twice the time on the changing letters: e 8 beats, a 4, then 4 beats where every letter in the sentence changes on
  each half beat, unmarked ('*' in `letters`; 12 takes, every multi-form letter pinned to another form each take).
  The e's and a's now cycle six of the hand's own takes of each school form.
- The flip in colour: each hand on its own paper's tint in its own ink (`ownPaper`, `ownInk`, both on); the
  wordmark's hand stays on the laid ground in the flip's ink. The one-ink version is a switch.
- Backgrounds are only the paper's tint and finish (no postcard lines, rules or stamp boxes).
- No red tracking plate on the card through the canvas.
- The end card is the title alone (6 beats; with the 2-beat lead-in the loop is whole bars). 29.9 s.

## Decided
- The flip stays in colour, red ink included (Rafael, 3 Nov).

## Done in drafts 6–7 (3–4 Nov)
- The video's own type is the site's: Schibsted Grotesk for the counter, descriptions and credit, Newsreader for the
  writers' names (type.ts; confirmed with the coordinator: Alegreya + Plex Mono was a mix-up).
- "HAND NO." in capitals (Schibsted has no small capitals), as wide as the number, the pair centred in a 104 px plate.
- Sound made from the handwriting (scripts/sound.ts): taps, press, air, nib scratches, change taps.

## Done in draft 8 (4 Nov)
- The counter 10% smaller (number 47 px at 1080, plate 94 px) and higher: the plate starts 52 px from the top, and the
  descriptor's baseline (and the letter's credit) sits 52 px from the bottom, the same margin. The phrase stays put.
- For the thread: 120 hands writing "The quick brown fox jumps over the lazy dog", each with its seed and a link that
  opens the tool writing it in that exact hand (a private page with hearts and Copy picks).

## Launch thread (4 Nov, drafts only: nothing posted)
- Brought up to date with the live site's code (preview): the engine now caps a pen's width against the writing's
  size. The pangram page was re-rendered with it; the final video must be rendered after this too (atlas re-rendered).
- Post 1, 2 and 3 drafts in review/thread-copy.json (2–3 options each, X lengths checked by review/x-count.mjs).
- The count: 36 × 34 × 90 = 110,160 seed names × 13 traditions = 1,432,080 hands, before pen, ink, paper and the
  19 sliders (scripts/count-hands.ts); 19,500 random seeds across the 13 traditions gave no two identical hands
  (scripts/count-check.ts).
- Carousel: 11 real letters in their own hands (scene/carousel.ts, `npm run carousel`, 1080 × 1350), Rafael picks 4.
- Review page: review/thread-review.mjs → out/thread-review/ (private artifact "Launch thread: drafts").

## Final (4 Nov)
- The number a little smaller, so its four figures end under the O of "HAND NO." rather than the period (which
  hardly shows); a little more room under the number (plate 98 px, 4 px more below than above). Tracked text is
  measured by hand: Chrome's ink box for tracked text counted spacing after the last letter.
- Final video: out/if-this-finds-you-x-1080.mp4 (1080 × 1080, 30 fps, sound), with the site's current engine.
- Rafael's 15 pangram favourites as 1080 × 1350 cards (writer, school and pen, seed, evenly spaced), and the post
  text with alt text, in ~/Downloads/If This Finds You launch/. Post 2: A; post 3: B; post 1 still to choose.
- X takes 4 images per post: 15 cards → post 2 plus three replies, or fewer cards.

## Open
- Rafael: post options, the four letters, About link in post 3 or not.
- Rafael picks the thread's hands; render the chosen ones large (size and format to decide: 1600 × 900, or square?).
- Sound alone, or a licensed track under it?
- The final renders (1080, 30 fps for X; 60 fps for Instagram?).
- The plate on frame 1 makes the loop not exact (the end card has none): drop it from frame 1?

## The fonts video (5 Nov, for the second post)
- src/FontList.tsx, timing in src/scene/fontlist-plan.ts; 1920 × 1080, 30 fps, 14.0 s (a 0.7 s pause in the list before it scrolls), no sound (Rafael: "it's for
  Twitter"). `npm run fonts` builds the fonts and renders out/fonts-x-1080.mp4.
- Opens close on one row with a serif text cursor flush with the rule; "The quick brown fox…" typed in Rafael's #13
  (Hana Hartmann, joined, fountain pen) while every row types with it; the camera zooms out from the line's start to
  the list (1600-wide page, edge to edge); scroll picks up from rest, doubles every 0.65 s to ~2.5 rows a frame, stops
  dead on row 110; pulls back to the live page's header and tester bar in a browser window (no shadow); the pointer
  glides in, clears the tester, types "Over a million handwritten fonts" (true: 1,432,080), every row following.
- Every row is set in its hand's real font (buildFont, as the page's worker), 120 list hands + Rafael's 15 favourites.

## The LinkedIn cut (5 Nov)
- src/LinkedIn.tsx: 1080 × 1350 (4:5, the safest feed shape on phones per 2026 guides; LinkedIn's own help pages
  didn't turn up), 38.5 s, no sound. The square on top, a strip below with one line at a time (LinkedIn autoplays
  muted): the title and flip to the stop ("Every hand here is generated by one engine"), the letter and its changing
  forms ("Real letters, written out by writers who never existed"), the fonts video reframed square on a 1024 × 1150
  photo of the live page ("Every hand is a font you can download"), the title ("Free and open source ·
  ifthisfindsyou.app"). The canvas of hands is cut. FontList now takes a frame size and a page variant.

## The ink demo (5 Nov, first cut for the coordinator)
- src/InkDemo.tsx, 1080 × 1080, 34.3 s, no sound. The sheet (the site's letter pad, Rafael's #13 Hana Hartmann in
  royal blue) above a minimal keyboard with ghost fingertips. The typing is recorded by scripts/ink-session.ts
  through the site's own Ink mode (engine plan/penStep/apply/dropLast, the calls lib/ink.ts InkSession makes; pen at
  4.5 letters a second, the site's is 2) and replayed frame by frame; letters drawn stroke by stroke in writing
  order; the letters the pen hasn't reached faint graphite, as on the site.
- Beats: "yuo" fixed before the pen gets there (clean); "quite" struck and "so green" written after it; the 8 written
  over the 3 (salt 'a' gives this writer the overwrite); "all" above the line with a caret; "Love," lifted by undo
  while wet (a 3 s ring); undo on dry ink gets the site's toast ("The ink is dry · Cross it out, or start a fresh
  sheet."). A caption per beat (prop `captions`).
