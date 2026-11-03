// Builds the open font package (the .otf and .ttf, how to install it, the licence and the credits, zipped) off the
// main thread: about a second of work for a hand, and the page keeps writing meanwhile.
import * as E from '@engine';
import { makeHand, withOverrides, type Hand } from '@engine';

export interface FontRequest { seed: string; style: string; overrides: Record<string, number | string>; name: string }
export type FontReply =
  | { ok: true; zip: ArrayBuffer; filename: string; info: { family: string; glyphs: number; alternates?: number; zipBytes?: number } }
  | { ok: false; error: string };

type Package = { zip: Uint8Array; filename: string; info: { family: string; glyphs: number; alternates?: number; zipBytes?: number } };
const build = (E as unknown as { buildFontPackage?: (p: Hand, o: { name: string; clipper?: unknown; clock?: () => number }) => Promise<Package> | Package }).buildFontPackage;

self.onmessage = async (e: MessageEvent<FontRequest>) => {
  try {
    if (!build) throw new Error('This engine has no font package yet');
    const r = e.data;
    // clipper merges each letter's overlapping strokes into clean outlines (what a font editor expects, ~7% smaller)
    const mod = (await import('clipper-lib')) as { default?: unknown };
    const ClipperLib = mod.default ?? mod;
    const pkg = await build(withOverrides(makeHand(r.seed, r.style), r.overrides), { name: r.name, clipper: ClipperLib, clock: () => performance.now() });
    const zip = pkg.zip.buffer.slice(pkg.zip.byteOffset, pkg.zip.byteOffset + pkg.zip.byteLength) as ArrayBuffer;
    (self as unknown as Worker).postMessage({ ok: true, zip, filename: pkg.filename, info: pkg.info } satisfies FontReply, [zip]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies FontReply);
  }
};
