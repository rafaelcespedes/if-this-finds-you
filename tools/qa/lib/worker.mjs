// tools/qa/lib/worker.mjs — renders matrix items in a fresh Node process and prints their layer hashes.
// Used by the determinism check: same input in a brand-new process must give byte-identical output,
// which catches state that leaks between renders (caches, counters, module-level randomness).
// Usage: node worker.mjs <root> <id> [<id> ...]   -> JSON { id: {layout, center, outline, svg} }

import { loadEngine, buildMatrix, renderSpec, layerHashes } from './engine.mjs';

const [root, ...ids] = process.argv.slice(2);
const E = await loadEngine(root);
const want = new Set(ids);
const out = {};
for (const spec of buildMatrix(E)) {
  if (!want.has(spec.id)) continue;
  const r = renderSpec(E, spec);
  out[spec.id] = layerHashes(r.page, r.svg);
}
process.stdout.write(JSON.stringify(out));
