// node-ts.mjs: bundle a script with the scene's own code (the same @engine and @ aliases as the video, a shim for
// remotion's staticFile) and run it, passing on the rest of the arguments.
//   node scripts/node-ts.mjs scripts/sound.ts [args…]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const entry = path.resolve(process.argv[2]);
const outfile = path.join(here, `../out/${path.basename(entry, '.ts')}.bundle.mjs`);
await build({
  entryPoints: [entry],
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning',
  loader: { '.json': 'json' },
  alias: {
    '@engine': path.join(root, 'engine/index.js'),
    '@': path.join(root, 'app/src'),
    remotion: path.join(here, 'shims/remotion.ts'),
    'virtual:tool-letters': path.join(here, 'shims/tool-letters.ts'),
  },
  define: { 'import.meta.env': '{"BASE_URL":"/"}' },
});
// the script sees its own arguments from argv[2], as if run directly
process.argv.splice(2, 1);
await import(pathToFileURL(outfile).href);
