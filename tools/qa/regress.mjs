#!/usr/bin/env node
// tools/qa/regress.mjs — the fast gate every engine change must pass (see docs/ARCHITECTURE.md):
// determinism + regression vs baseline.json, coverage, API contracts and geometry sanity.
// No perf, variety, feel or sheets; run tools/qa/run.mjs for the full review.
//   node tools/qa/regress.mjs            check
//   node tools/qa/regress.mjs --update   accept intentional changes into baseline.json (say why in the commit)

import { main } from './run.mjs';

const pass = process.argv.slice(2).filter((a) => !a.startsWith('--only='));
main([...pass, '--only=determinism,coverage,contracts,geometry']).then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
