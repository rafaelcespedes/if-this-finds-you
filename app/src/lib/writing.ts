// The writing renderer boundary. Everything that turns laid-out writing into pixels lives here and
// in components/Writing.tsx (plus the worker that calls this off the main thread), so swapping SVG
// for a canvas/WebGL renderer, or adding the write-on animation, stays a small, local change.
//
// Writing is drawn once at a fixed reference scale (REF_PX_PER_MM) and scaled by CSS on screen.
// The JPEG uses the very same SVG, drawn larger, so the download matches the screen exactly
// (the engine's ink filter depends on the drawing scale, so re-rendering at another size would not).
// Ink colour is `currentColor`, so changing ink is instant and needs no re-render.
import { renderSVG, UPM, type Hand } from '@engine';
import type { Sheet } from './compose';

export const REF_PX_PER_MM = 4;

const MISS_STYLE =
  'text.miss{fill:#a59f92;font-family:"Bradley Hand","Segoe Print","Comic Sans MS",cursive;font-style:italic;text-anchor:middle;opacity:.75}';

/** Give every id in an engine SVG a unique suffix, so several SVGs on one page don't share filters. */
export function scopeIds(svg: string, uid: string) {
  const ids = new Set<string>();
  svg.replace(/\sid="([^"]+)"/g, (_, id: string) => { ids.add(id); return ''; });
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`id="${esc}"`, 'g'), `id="${id}-${uid}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${id}-${uid})`)
      .replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${id}-${uid}"`);
  }
  return out;
}

/** The writing of one sheet as an SVG string covering the whole sheet, at the reference scale. */
export function writingSVG(p: Hand, sheet: Sheet, emMm: number, wMm: number, uid: string) {
  const svg = renderSVG(p, sheet, { width: Math.round(wMm * REF_PX_PER_MM), emPx: emMm * REF_PX_PER_MM, ink: 'currentColor' });
  return scopeIds(svg, uid);
}

/** Rasterise a sheet's writing SVG at w x h device pixels, in the given ink. */
export async function rasterizeWriting(svg: string, w: number, h: number, ink: string): Promise<HTMLImageElement> {
  const sized = svg
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
    .replace('<svg', `<svg width="${w}" height="${h}" preserveAspectRatio="none" style="color:${ink}"`)
    .replace('<defs>', `<defs><style>${MISS_STYLE}</style>`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** A small one-line SVG of some text in a hand (used for the writer's signature). */
export function inlineSVG(p: Hand, items: Sheet['items'], widthU: number, heightU: number, emPx: number, uid: string) {
  const sc = emPx / UPM;
  const svg = renderSVG(p, { items, height: heightU }, { width: Math.ceil(widthU * sc), emPx, ink: 'currentColor' });
  return scopeIds(svg, uid);
}
