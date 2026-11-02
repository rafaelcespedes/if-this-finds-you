import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The handwriting engine lives one folder up (../engine) as plain ES modules with no build step.
// The app imports it through the `@engine` alias and never copies or edits it.
const engineDir = path.resolve(import.meta.dirname, '../engine');

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
    fs: { allow: [path.resolve(import.meta.dirname, '..')] },
  },
  preview: { host: '127.0.0.1', port: 4173 },
});
