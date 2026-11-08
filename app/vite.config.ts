import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The handwriting engine lives one folder up (../engine) as plain ES modules with no build step.
// The app imports it through the `@engine` alias and never copies or edits it.
// SEEDHAND_ENGINE=/path/to/engine points the app at another engine folder (e.g. a session's branch)
// to preview its work in the product UI.
const engineDir = process.env.SEEDHAND_ENGINE
  ? path.resolve(process.env.SEEDHAND_ENGINE)
  : path.resolve(import.meta.dirname, '../engine');

// The tool's found letters: content/sample-texts.json without what only the library shows (sources' full
// citations, rights, stories, tags) and without letters switched off. About a third of the file, so the tool's
// first load carries 38 kB of letters instead of 113 kB (gzip). The library reads the whole file itself.
const LETTERS_FILE = path.resolve(import.meta.dirname, '../content/sample-texts.json');
const TOOL_FIELDS = ['id', 'text', 'kind', 'lang', 'title', 'author', 'year', 'translator', 'traditions', 'recipient', 'origin', 'place', 'writer', 'olderHandsOnly'];
// A page from one version of the site whose files are already gone (a deploy moved on in between) reloads once, or
// says so, instead of staying empty: src/lib/stale-guard.inline.js, inlined as the first script of every page so it
// is listening before the page's own files are asked for.
// (right after the charset, which must stay in the page's first 1024 bytes; its comments left out)
const STALE_GUARD = fs.readFileSync(path.resolve(import.meta.dirname, 'src/lib/stale-guard.inline.js'), 'utf8')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').trim();
function staleGuard(): Plugin {
  return {
    name: 'stale-guard',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/(<meta charset="[^"]*"\s*\/?>)/i, `$1\n    <script>${STALE_GUARD}</script>`),
    },
  };
}

function toolLetters(): Plugin {
  const id = 'virtual:tool-letters';
  return {
    name: 'tool-letters',
    resolveId: (s) => (s === id ? '\0' + id : undefined),
    load(s) {
      if (s !== '\0' + id) return;
      this.addWatchFile(LETTERS_FILE);
      const all = JSON.parse(fs.readFileSync(LETTERS_FILE, 'utf8')) as Record<string, unknown>[];
      const kept = all
        .filter((l) => l.enabled !== false && l.text)
        .map((l) => {
          const o: Record<string, unknown> = {};
          for (const k of TOOL_FIELDS) if (l[k] != null) o[k] = l[k];
          const src = l.source as { url?: string } | undefined;
          if (src?.url) o.source = { url: src.url };
          return o;
        });
      return `export default ${JSON.stringify(kept)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), toolLetters(), staleGuard()],
  // the writing, roll and font workers read the letters too
  worker: { format: 'es', plugins: () => [toolLetters()] },
  resolve: {
    alias: [
      { find: '@engine', replacement: path.join(engineDir, 'index.js') },
      // the Reading Room's icons: every 'lucide-react' import (exactly that name) goes through its icon file, which
      // swaps in the icons drawn with the engine's pen in that look and passes Lucide's through otherwise
      { find: /^lucide-react$/, replacement: path.resolve(import.meta.dirname, 'src/themes/reading-room/icons/lucide.tsx') },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // allow Vite to serve files from the engine folder outside the app root
    fs: { allow: [path.resolve(import.meta.dirname, '..'), engineDir] },
  },
  preview: { host: '127.0.0.1', port: 4173 },
  // the main chunk is React + the engine's letter data; opentype.js and the writer worker load separately
  build: {
    chunkSizeWarningLimit: 800,
    // five pages: the tool (index.html), the Letters library (letters.html, src/archive/), Fonts (fonts.html,
    // src/fonts/), About (about.html, src/about/) and the 404 (404.html, src/notfound/: Vercel serves dist/404.html
    // for any address that isn't here), split apart
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        letters: path.resolve(import.meta.dirname, 'letters.html'),
        fonts: path.resolve(import.meta.dirname, 'fonts.html'),
        about: path.resolve(import.meta.dirname, 'about.html'),
        // the notes app (notes.html at /notes, src/write/; /write redirects there, vercel.json): typing that behaves
        // like ink. Not linked yet
        notes: path.resolve(import.meta.dirname, 'notes.html'),
        notfound: path.resolve(import.meta.dirname, '404.html'),
      },
    },
  },
});
