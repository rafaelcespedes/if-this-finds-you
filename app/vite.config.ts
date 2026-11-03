import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The handwriting engine lives one folder up (../engine) as plain ES modules with no build step.
// The app imports it through the `@engine` alias and never copies or edits it.
// SEEDHAND_ENGINE=/path/to/engine points the app at another engine folder (e.g. a session's branch)
// to preview its work in the product UI.
const engineDir = process.env.SEEDHAND_ENGINE
  ? path.resolve(process.env.SEEDHAND_ENGINE)
  : path.resolve(import.meta.dirname, '../engine');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@engine': path.join(engineDir, 'index.js'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
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
    // two pages: the tool (index.html) and the Letters library (letters.html, src/archive/), split apart
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        letters: path.resolve(import.meta.dirname, 'letters.html'),
      },
    },
  },
});
