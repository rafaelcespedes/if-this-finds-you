// Imported first by the card worker. The tool's paper painter (lib/papers.ts) makes its grain tile with
// document.createElement('canvas'); in a worker an OffscreenCanvas does the same job. The engine's canvas renderer
// then also finds a WebGL2 context here and draws ink as density, as on the live page.
const g = globalThis as unknown as { document?: unknown };
if (typeof g.document === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
  g.document = { createElement: (tag: string) => (tag === 'canvas' ? new OffscreenCanvas(1, 1) : null) };
}
export {};
