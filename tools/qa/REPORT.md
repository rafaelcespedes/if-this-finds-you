# QA report: baseline review

_2026-11-02 · engine at `412256c` (unchanged since `79d8318` apart from the new, unused `kinematics.js`) · Node 24, Apple M1 Max · reviewer: QA agent_

**Verdict:** the engine is solid as software: it is deterministic, doesn't crash, and covers all of Kernel.
The writing still reads as **a typeset font with jitter**, for four reasons:
- the page layout is mechanical
- the ink is one flat colour
- strokes are assembled from tapered pieces
- hands are near-twins of each other

All three of Rafael's notes are confirmed by measurement: line spacing too even, ink colour and pressure
wrong, and hands not unique enough.

## 1. Using the harness

Everything lives in `tools/qa/` and runs on plain Node 18+, with nothing to install.

| Command | What it does | Time |
|---|---|---|
| `node tools/qa/regress.mjs` | **Gate for every engine change.** Checks determinism, regression vs baseline, coverage, API contracts and geometry | ~20 s |
| `node tools/qa/run.mjs` | Everything above, plus performance, variety, the human-feel rubric and contact sheets | ~55 s |
| `node tools/qa/run.mjs --update` | Accept the current output as the new baseline (hashes, perf, known failures). Say why in the commit | — |
| `--only=geometry,feel` / `--skip=sheets` | Run a subset of checks | — |
| `--quick` | Fewer seeds for variety and feel | ~35 s |
| `--fresh-seeds` | Contact sheets with 12 new random hands (seeds are printed on the sheets) | — |
| `--root=<checkout>` | Test the engine in another worktree or branch without copying the harness | — |

**Outputs:**
- the console summary
- `tools/qa/out/summary.txt` and `out/results.json`, for agents
- `tools/qa/out/index.html`, a gallery of every sheet, at http://127.0.0.1:8765/tools/qa/out/index.html while `tools/serve.py` runs

`out/` is gitignored.

**Exit code.** A run exits with 1 if any check FAILS; warnings never fail a run.

Failures that already existed when the baseline was taken are stored in `baseline.json → knownFailures`. They print as `~ KNOWN` and only fail again if they get worse.

**What each check measures:**
- **determinism:**
  - A 150-item matrix: seeds × styles × pens × 16 texts, plus a paragraph, phone width, and every control at its extremes.
  - Each item is rendered twice, in reverse order, and in a fresh process.
  - It also checks that params are never mutated.
  - A runtime trap catches `Math.random` and clock calls, and a static scan of `engine/` looks for them too.
- **regression:**
  - Each item keeps four layer hashes: `layout`, `center` (glyphs/sources/hand), `outline` (pen) and `svg` (render/ink).
  - A change report names the layers that moved, so each workstream can show it stayed in its lane.
- **coverage:**
  - `has()` against GF Latin Kernel (116) and GF Latin Core (315, derived from Unicode ranges; drop the official list at `tools/qa/data/gf-latin-core.txt` to replace it).
  - Every variant is credited and ids are unique.
  - A missing character produces one `miss` plus the placeholder.
- **contracts:**
  - PARAMS entries are well formed.
  - Natural values stay in range across 200 seeds.
  - 12 hostile inputs (empty, 400-char word, emoji, combining marks, zero-width, CRLF…) never throw or return NaN.
  - `makeGlyph` returns the expected shape.
- **geometry:** 8,352 glyph instances per style:
  - NaN or empty outlines
  - advances
  - overhang
  - vertical limits
  - i/j dots
  - punctuation dot counts
  - loose spacing
  - script join gaps
  - page bounds
  - `maxWidth`
- **perf:**
  - Median layout + render time for 600 characters, normalised by CPU calibration.
  - A slowdown over 30% is re-measured, then flagged.
- **variety:**
  - Feature vectors for 200 hands per style, scaled in just-noticeable-difference units.
  - Reports each feature's spread, nearest-neighbour distances and the closest pairs.
  - NN < 1.5 means near-twins; > 3 means clearly different people.
- **feel:** the 15-point rubric from `docs/research/human-feel.md` §8.2, plus rules 13 and 23. A MISS is a warning.
- **sheets:** 28 SVG contact sheets:
  - stress texts and the repeat sheet
  - a paragraph
  - prices
  - caps
  - punctuation
  - the full Kernel
  - phone width
  - Tier 2 and hostile input
  - every pen
  - control extremes
  - close-ups
  - the closest pairs

**Validated by fault injection.** Each planted fault was caught and located:
- an ink-only change moved only the `svg` layer
- `Math.random` in layout was caught by the runtime trap and the static scan, with file:line
- a NaN advance
- a deeper descender, at both glyph and page level

## 2. Current pass/fail

| Check | Status | Headline |
|---|---|---|
| Determinism & regression | **PASS** | 150/150 byte-identical across re-render, reverse order and a fresh process. No `Math.random` |
| Coverage | **PASS** | Kernel 116/116 in both styles. Core 116/315 (Tier 2 not built yet). No letter has a second design |
| API contracts | **PASS** | 5 controls OK; 24/24 hostile inputs clean |
| Geometry | **FAIL → 4 KNOWN** | No NaN or empty glyphs, dots fine, joins connect 99.8%. Script descenders and `[` leave the page |
| Performance | WARN | 89–104 ms (print) / 113–133 ms (script) per 600 chars; 2.3 / 3.2 MB of SVG |
| Variety | WARN | 66% (print) / 75% (script) of hands have a near-twin; no letter ever changes construction |
| Human feel | WARN | print 4 PASS / 13 MISS; script 5 PASS / 12 MISS |
| Sheets | PASS | 28 sheets, all valid SVG |

## 3. What passed

- Determinism is airtight. The engine survives hostile input and every control extreme.
- Kernel coverage is complete and credited. Missing characters always show a visible placeholder.
- Every i/j has a dot, clear of the stem.
- Script joins connect: median gap 0.17 pen widths, 0.2% broken (mostly around `f`).
- Lines never collide at 1.6 em.
- Rubric passes: ragged right margin, stroke ends (2–5% blunt), wobble spectrum (no fake tremor), script
  i-dots placed to the right, no confusable characters.
- The lab shows no console errors and no horizontal scroll at 375 px.

## 4. What failed or looks wrong

1. **Lines are typeset, not written** (Rafael's "too even").
   - Line pitch varies by only 0.4% (target 3–10%).
   - Line slope σ is 0.07° (target ≥ 0.3°).
   - The left margin is exactly x = 0 on every line.
   - Baseline drift is `n1(x / 1700)`, and gradient noise is zero at every integer, so the baseline snaps back to the rule every ~1.7 em.
   - Neighbouring words bob in opposite directions (ρ −0.39, target ≥ +0.4).
   - The 1.6 em pitch equals 3.9–4.7 x-heights, against the doc's 2.2–3.2, so it reads as double-spaced.
   - **Owner: page layout.**
2. **Ink is a flat, printer-like fill** (Rafael's "colour / pressure").
   - One fill per stroke, with opacity 0.90–0.99.
   - The ratio of downstroke to upstroke density is 1.00, colour ΔE is 4 (target ≥ 10), and the hue is always `#1c2233`.
   - `rng('ink:' + inkIndex + ':' + strokeIndex)` doesn't include the hand seed, so different hands share the same opacity pattern.
   - Every pen uses one `feTurbulence` filter with seed 7.
   - **Owner: pens & ink.**
3. **Strokes are assembled from tapered pieces.**
   - `smoothStroke` splits at corners sharper than 118°, and `pen.js` tapers each piece at both ends. That leaves a needle spike at the bottom of every m/n/u/i minim.
   - In script, upstrokes that retrace a downstroke create darker seams.
   - **Owner: hand.js split (letters) + pen.js taper (pens).**
4. **Hands are near-twins.**
   - Median nearest-neighbour distance is 1.43 / 1.31 JND.
   - 0 of 62 letters and digits ever vary their construction.
   - **Owner: letters & variety.**
5. **Variation is independent per letter and the wrong size.**
   - Adjacent-letter slant correlation r ≈ 0.
   - Size varies more within words than between them.
   - 12% of same-letter neighbours are nearly identical, while warp p95 reaches 6.9–9.0% of x-height (guard: 6%).
   - The Neatness slider is weak: 0 → 1 changes the hand by only 1.8–3.2 JND.
   - No fatigue over a paragraph.
   - **Owner: letters & variety + page layout.**
6. **Script digits and punctuation float apart.**
   - Script keeps Hershey's fixed side bearings.
   - Tabular digits leave 1.19 x-heights of air around a `1`.
   - The apostrophe breaks the join ("Don ’t"), and the em dash is about 1.5 em wide.
   - **Owner: letters.**
7. **Script ALL CAPS is illegible** ("SLL CSPS"; Q reads as "2", G reads like Y). Script `^` is ↑, and `™` reads "Jm".
   - **Owner: letters.**
8. **Ink leaves the page** (KNOWN FAIL).
   - Script Y/Z descenders reach −547 u (limit −450). `[` reaches +958 u.
   - The lab's `overflow: visible` hides this, but exports clip it.
   - **Owner: page layout.**
9. **Long words never break.**
   - Layout only wraps at spaces.
   - Text isn't NFC-normalised, so e + U+0301 shows as two marks.
   - The fixed 560 u placeholder gaps "Crème" into "Cr è me".
   - **Owner: page layout / accents.**
10. **Speed and weight.**
    - 2.3–3.2 MB of SVG per 600 characters.
    - Keystroke-to-paint in the lab is 92 ms for 177 characters.
    - **Owner: render / pens / lab.**

**Smaller findings:**
- Print i-dots sit exactly over the stem.
- The dot angle is re-rolled on every use.
- Word-gap CV is 11% (target 15–30%), while print letter gaps vary 37% (target 10–20%).
- Digits are no steadier than letters.
- `kinematics()` is not used yet.
- On a phone, the lab's type is too large, the writing starts below the fold, and the inputs are under 16 px, so iOS zooms in.

## 5. Human-ness (rubric: human-feel.md §8.2, 24 hands per style)

| # | Check | Print | Script | Measured (print / script) | Target |
|---|---|---|---|---|---|
| 1 | No identical neighbours | M | M | 88% of pairs in band; closest 0.3% / 0.7% xh | 2–12% xh |
| 2 | Correlated variation | M | M | slant r −0.01 / 0.00 | r ≥ 0.4 |
| 3 | Baseline in a line | M | M | σ 2.5% / 3.4% xh; word ρ −0.39 | σ 1–3%; ρ ≥ 0.4 |
| 4 | Line geometry | M | M | slope σ 0.07°; pitch CV 0.4% | ≥ 0.3°; 3–10% |
| 5 | Left margin | M | M | σ 0.22% / 0.60%; no drift | ≥ 0.3%; drifts in |
| 6 | Right margin | P | P | ragged | — |
| 7 | Ink density | M | M | flat; down/up 1.00 | CV 8–20%; ≥ 1.15 |
| 8 | Colour | M | M | ΔE 4.1; one hue | ΔE ≥ 10 |
| 9 | Stroke ends | P | P | 2% / 5% blunt | ≤ 15% |
| 10 | Wobble spectrum | P | P | 2% below 0.3 xh | < 10% |
| 11 | Delayed strokes | M | P | dot offset 0.00 / +0.16 xh | rightward |
| 12 | Fatigue | M | M | size −0.1% / +0.8% | +2–8% |
| 13 | Numbers and caps | M | M | digits not steadier | upright, steadier |
| 14 | Animation | n/a | n/a | none yet | — |
| 15 | Seed coherence | M | M | closest of 10 seeds 1.70 / 1.35 JND | ≥ 3 |

**Overall:** a single short line passes at arm's length. A paragraph doesn't: the lines are even, the ink is flat
and letters repeat. At 2× zoom, the spikes, seams and filter edges give it away.

## 6. Top 10 issues, ranked

1. Mechanical line layout: the baseline is pinned to the rule every 1.7 em and lines read double-spaced (page layout)
2. Flat ink: ΔE 4, one hue, opacity never follows pressure or speed, same pattern in every hand (pens & ink)
3. Near-twin hands; no letter has alternate forms (letters & variety)
4. Spikes and seams from tapered stroke pieces (hand.js + pen.js)
5. Variation is uncorrelated and mis-sized; Neatness is weak; no fatigue (letters + page)
6. Script ALL CAPS illegible; script `^` and `™` wrong (letters)
7. Script digit and punctuation spacing; apostrophe breaks joins (letters)
8. Ink clipped at page edges (KNOWN FAIL) (page layout)
9. No word breaking, no NFC, fixed-width placeholders (page layout / accents)
10. SVG weight and 92 ms keystroke latency (render / pens / lab)

## 7. Notes for the parallel workstreams

- **Before pushing,** run `node tools/qa/regress.mjs` (or, from main, `node tools/qa/regress.mjs --root=.claude/worktrees/<name>`).
- **Check which layers moved:**
  - Pens & ink should move only `outline`/`svg`.
  - Page layout should move only `layout`/`svg`.
  - Accents should change only the accent and edge-case texts.
- **Accepting intentional changes:** use `--update` and give the reason in the commit.
- **New styles, pens and PARAMS** join the matrix automatically.
- **Rubric thresholds** live in `lib/checks/feel.mjs`.
