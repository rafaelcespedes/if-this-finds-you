<!-- Thank you! A few words help a lot. Delete what doesn't apply. -->

## What this changes

<!-- One or two sentences. -->

## Why

<!-- What was wrong, or what it makes possible. Link the issue if there is one. -->

## How it looks or feels

<!-- For anything you can see or feel (the writing, a hand, the pages): a screenshot or a short screen recording,
     before and after. For the writing interaction, a recording says more than words. -->

## Checks

- [ ] `cd app && npm run build` passes
- [ ] `node tools/qa/regress.mjs --quick` passes (a change to what the engine draws needs its baseline updated: see `docs/CHECKS.md`)
- [ ] For writing changes: `node tools/qa/ink.mjs` passes, and the same ink log still replays to the same page
