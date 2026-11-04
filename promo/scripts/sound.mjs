// sound.mjs: bundle scripts/sound.ts with the scene's own code (the same @engine and @ aliases as the video) and
// run it: writes public/sound.wav. node scripts/sound.mjs [out.wav] [letterId] [landingSeed] [landingStyle]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outfile = path.join(here, '../out/sound.bundle.mjs');
await build({
  entryPoints: [path.join(here, 'sound.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning',
  loader: { '.json': 'json' },
  alias: {
    '@engine': path.join(root, 'engine/index.js'),
    '@': path.join(root, 'app/src'),
    remotion: path.join(here, 'shims/remotion.ts'),
  },
  define: { 'import.meta.env': '{"BASE_URL":"/"}' },
});
await import(pathToFileURL(outfile).href);
