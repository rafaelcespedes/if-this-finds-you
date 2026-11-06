// build-recorder.mjs: the typing recorder (recorder/), with the engine and the site's code, as one HTML file that
// opens straight from the disk (no server): out/Typing recorder.html, with its guide (out/Recording guide.html).
//   npm run recorder
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const res = await build({
  entryPoints: [path.join(here, '../recorder/main.ts')],
  bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', minify: true, write: false, logLevel: 'warning',
  loader: { '.json': 'json' },
  alias: { '@engine': path.join(root, 'engine/index.js'), '@': path.join(root, 'app/src') },
  define: { 'import.meta.env': '{"BASE_URL":"/"}' },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync(path.join(here, '../recorder/index.html'), 'utf8').replace('/*SCRIPT*/', () => js);
const out = path.join(here, '../out/Typing recorder.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
fs.copyFileSync(path.join(here, '../recorder/guide.html'), path.join(path.dirname(out), 'Recording guide.html'));
console.log(`${path.relative(process.cwd(), out)}: ${(html.length / 1e6).toFixed(2)} MB, and out/Recording guide.html`);
