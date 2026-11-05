// node-ts.mjs: bundle a TypeScript script with the engine and the site's code (the same @engine and @ aliases as
// the video) and run it with the rest of the arguments.   node scripts/node-ts.mjs scripts/ink-session.ts
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const entry = path.resolve(process.argv[2]);
fs.mkdirSync(path.join(here, '../out'), { recursive: true });
const outfile = path.join(here, `../out/${path.basename(entry, '.ts')}.bundle.mjs`);
await build({
  entryPoints: [entry],
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning',
  loader: { '.json': 'json' },
  alias: { '@engine': path.join(root, 'engine/index.js'), '@': path.join(root, 'app/src') },
  define: { 'import.meta.env': '{"BASE_URL":"/"}' },
});
process.argv.splice(2, 1); // the script sees its own arguments from argv[2], as if run directly
await import(pathToFileURL(outfile).href);
