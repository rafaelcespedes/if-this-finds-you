#!/usr/bin/env node
// tools/qa/regress.mjs — the fast gate every engine change must pass (see docs/ARCHITECTURE.md):
// determinism + regression vs baseline.json, coverage, API contracts, geometry sanity and letter proportions.
// No perf, variety, feel or sheets; run tools/qa/run.mjs for the full review.
//   node tools/qa/regress.mjs            check (the whole matrix; CI runs this nightly)
//   node tools/qa/regress.mjs --quick    a few minutes: a fixed sample of the matrix (quickMatrix in lib/engine.mjs),
//                                        coverage, contracts and proportions; no geometry. CI runs it on every push.
//   node tools/qa/regress.mjs --update   accept intentional changes into baseline.json (say why in the commit)
//   --against=<checkout of the previous version>   judge regression by rendering both versions on this machine
//                                        (CI: its CPU rounds a few SVGs differently from the Mac that made the baseline)
// See docs/CHECKS.md for what runs where.

import { main } from './run.mjs';

const argv = process.argv.slice(2);
const pass = argv.filter((a) => !a.startsWith('--only='));
const only = argv.includes('--quick') ? 'determinism,coverage,contracts,proportions' : 'determinism,coverage,contracts,geometry,proportions';
main([...pass, `--only=${only}`]).then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
