# Checks: what stops a broken update from going live

_Set up 2026-11-03._ Every push to `preview` (the branch https://ifthisfindsyou.app publishes from) and `main`
runs two checks on GitHub. Vercel builds the update as before, but holds it until both checks pass on that
commit. If either fails, the live site stays on the last good version and the failure is on GitHub, in words.

## What runs, and when

| When | Check (its name on GitHub and in Vercel) | What it does | Time on GitHub |
|---|---|---|---|
| Every push and PR to `preview` or `main` | **Site: build and smoke test** | Installs the app, typechecks it (any TypeScript error fails), builds it with Vercel's own command (`npm run build`), checks the Lost Letters texts (`content/check-texts.mjs`), then the smoke test (below) | ~1 min |
| Same, side by side | **Engine: quick QA** | `node tools/qa/regress.mjs --quick`, judged against the version before the update (below) | ~2 min |
| Every night at 03:30 UTC, or by hand | **Engine: full QA (nightly)** | `node tools/qa/regress.mjs`, every matrix item, judged against the version from a day before. Skipped when nothing in `engine/` or `tools/qa/` changed in that day. Not a Vercel check: it's too slow to hold every update | ~35–50 min (~21 min on an M1 Max) |

The workflows are `.github/workflows/checks.yml` and `.github/workflows/engine-full.yml`. A newer push to the
same branch cancels a run that's still going: only the newest update can go live anyway.

**Reading results.** GitHub → the repo → Actions. Each run's page starts with a summary: the smoke test's
page-by-page lines and the engine QA report. The smoke test's screenshots are kept 7 days (Artifacts on the run
page). The full QA's report (`summary.txt`, `results.json`) is kept 30 days. A nightly failure emails whoever
last edited its schedule; it doesn't block the site, but the next intentional baseline update must deal with it.

**Run one by hand.** Actions → Checks (or Engine full QA) → Run workflow → pick a branch.

## Vercel: hold production until the checks pass

One-time setup in the Vercel dashboard, project **rc-idp / if-this-finds-you**
([Vercel's guide](https://vercel.com/docs/deployment-checks)):

1. Settings → Environments → Production: automatic assignment of the production domains stays **on** (the default).
2. Settings → **Deployment Checks** → **Add Checks** → provider **GitHub** → select
   **Site: build and smoke test** and **Engine: quick QA** → Add. They're listed once the workflow has run on
   GitHub at least once.
3. From then on each production deployment shows the two checks; it gets ifthisfindsyou.app only when both pass.

Vercel matches the checks by job name, so the two names above must not change (or change them in Vercel too).
**Emergency:** a deployment's page in Vercel → **Force Promote** puts it live without waiting.

## The smoke test

`tools/smoke/smoke.mjs` serves the built `app/dist` the way Vercel does (`/letters` → `letters.html`) and opens
it in Chrome. Pages: `/` (the desk), `/letters` (all letters) and the first card's letter page
(`/letters#/letter/<id>`), each at desktop (1440×900) and phone (375×812) size. A page fails when it

- logs a console error or throws an uncaught exception,
- gets a 4xx/5xx (or no answer) for one of the site's own files, or
- shows a blank sheet: no handwriting on the letter within 30 s.

The library shuffles its cards, so the letter page it opens changes from run to run; the output names it.
It finds each page's letter by its accessible name or link (`SHEETS` at the top of the script). If a redesign
renames one, the failure says so plainly; update the selector there. About 25 s on an M1 Max.

```bash
cd app && npm ci && npm run build && cd ..
cd tools/smoke && npm ci && npx playwright install chromium && cd ../..
node tools/smoke/smoke.mjs
```

`node tools/smoke/smoke.mjs --url=https://<a-vercel-preview>.vercel.app` checks a running site instead.
Screenshots of every page go to `tools/smoke/out/`.

## Engine QA: quick and full

`regress.mjs` compares the engine's output with `tools/qa/baseline.json` (four hashes per matrix item: layout,
letter centrelines, outlines, final SVG) and checks determinism, character coverage, API contracts, geometry and
letter proportions. The full matrix is 8,619 items; that's ~18 of its ~21 minutes.

`--quick` (every push) runs a fixed sample of 440 items, picked in `quickMatrix` in `tools/qa/lib/engine.mjs`:
every style writes the whole Kernel, the paragraph and a phone-width letter; every pen writes the pangram in
every style; plus a stable 1-in-30 share of everything else. Each is rendered twice, in reverse order and in a
fresh process, as in the full run. Coverage, contracts and proportions run as usual; geometry is left to the
nightly run. ~60–80 s on an M1 Max. A one-line change to a single pen changed 40 of the 440 items, so the sample
catches real changes; a change that only touches rare items may wait for the nightly run.

### Why GitHub doesn't compare with baseline.json directly

The baseline is made on an Apple-silicon Mac. GitHub's machines have other chips, whose maths functions round the
last digit differently, and the ink renderer turns a few of those into visible-in-the-file (not on screen)
differences: the outline simplifier keeps a point 0.4 px to one side. Layout, letter shapes and pen outlines
match exactly; on 440 items the final SVG differed in 36 on Intel/AMD Linux and 6 on ARM Linux. So on GitHub
(`--against=<previous version>`) the QA also renders the version before the update on the same machine, and
asks of every item: did its output change between the two versions? If it did, its line in `baseline.json` must
have changed in the same update, or the check fails, just as `regress.mjs` fails on the Mac. Items whose final
SVG differs from the Mac's only by this rounding are counted, not failed. On the Mac nothing changes:
`regress.mjs` compares with `baseline.json` exactly. (If GitHub ever flags an item that the full run on the Mac
calls unchanged, it's this rounding: say so in the PR and Force Promote.)

## Changing the engine's output on purpose: updating the baseline

Any change to what the engine draws fails the QA (on the Mac and on GitHub) until the baseline is updated. The
update goes in the same branch as the change, so the push that brings the change also brings its baseline lines:

1. Run the full check: `node tools/qa/regress.mjs`. Read the "changed layers" lines: the changes should be only
   where you meant them (one pen, one style, only the `outline` layer…).
2. Accept them: `node tools/qa/regress.mjs --update` (~20 min), on the Mac. `--update` refuses `--quick` and
   `--against`: it would write a partial baseline.
3. Commit `tools/qa/baseline.json` and say why in the commit message ("baseline: felt pen spreads 5% more").

When two merged branches both updated the baseline, re-run `--update` on the merged result: the merged
engine's output is what counts. Failures already accepted are listed under `knownFailures` in the baseline; they
print as KNOWN and only fail again if they get worse.

## Build minutes

The repo is private, so GitHub counts these runs against the account's monthly Actions minutes. Each push
costs about 5–6 billed minutes (two jobs, each rounded up to the minute), and a nightly full run ~40 minutes
on days the engine changed. Pushing several merged branches at once instead of one by one, and the
cancellation of superseded runs, keep this down. The account's usage is under GitHub → Settings → Billing.
