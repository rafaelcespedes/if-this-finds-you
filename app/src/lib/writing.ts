// The writing renderer boundary. Everything that turns laid-out writing into pixels lives here and
// in components/Writing.tsx (plus the worker that calls this off the main thread), so swapping SVG
// for a canvas/WebGL renderer, or adding the write-on animation, stays a small, local change.
//
// Writing is drawn once at a fixed reference scale (REF_PX_PER_MM) and scaled by CSS on screen.
// The JPEG uses the very same SVG, drawn larger, so the download matches the screen exactly
// (the engine's ink filter depends on the drawing scale, so re-rendering at another size would not).
// Ink colour is `currentColor`, so changing ink is instant and needs no re-render.
import { contoursToD, layout, renderSVG, UPM, type Hand } from '@engine';
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

/**
 * The writing of one sheet as an SVG string covering the whole sheet, at the reference scale.
 * inkKey: a swatch key when the engine models ink itself (pens & ink); otherwise the ink is
 * `currentColor` and the page sets the colour.
 */
export function writingSVG(
  p: Hand, sheet: Sheet, emMm: number, wMm: number, uid: string, inkKey: string | null = null,
  extra?: { contours: number[][][]; fill: string; ghost?: Sheet },
) {
  const ink = inkKey && inkKey !== 'auto' ? inkKey : inkKey === 'auto' ? undefined : 'currentColor';
  const emPx = emMm * REF_PX_PER_MM;
  let svg = renderSVG(p, sheet, { width: Math.round(wMm * REF_PX_PER_MM), emPx, ink });
  if (extra && extra.contours.length) {
    // extra ink (underlines) in page font units, y up; same ink edge as the writing when there is one
    const d = contoursToD(extra.contours, 0, 0, emPx / UPM);
    const filter = /id="inkEdge"/.test(svg) ? ' filter="url(#inkEdge)"' : '';
    svg = svg.replace(/<\/svg>\s*$/, `<g fill="${extra.fill}" fill-opacity="0.92"${filter}><path d="${d}"/></g></svg>`);
  }
  if (extra?.ghost && extra.ghost.items.length) {
    // the placeholder: same hand, graphite at 22%, no ink effects
    const g = renderSVG(p, extra.ghost, { width: Math.round(wMm * REF_PX_PER_MM), emPx, ink: '#6f6b66' });
    const inner = g.replace(/^[\s\S]*?<\/defs>/, '').replace(/<\/svg>\s*$/, '').replace(/\sfilter="[^"]*"/g, '');
    svg = svg.replace(/<\/svg>\s*$/, `<g class="placeholder" opacity="0.22">${inner}</g></svg>`);
  }
  return scopeIds(svg, uid);
}

/** Attributes written HTML-style without a value (`<g data-ink>`) are invalid in a standalone SVG image. */
const xmlSafe = (svg: string) => svg.replace(/(<[a-zA-Z][^<>]*?\s)([a-zA-Z_:][\w:.-]*)(?=[\s/>])(?!=)/g, (m, head: string, name: string) =>
  // leave words inside a quoted value alone (an odd number of quotes so far means we're inside one)
  /=\s*$/.test(head) || (head.match(/"/g) || []).length % 2 === 1 ? m : `${head}${name}=""`);

/** Rasterise a sheet's writing SVG at w x h device pixels, in the given ink. */
export async function rasterizeWriting(svg: string, w: number, h: number, ink: string): Promise<HTMLImageElement> {
  const sized = xmlSafe(svg)
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
    .replace('<svg', `<svg width="${w}" height="${h}" preserveAspectRatio="none" style="color:${ink}"`)
    .replace('<defs>', `<defs><style>${MISS_STYLE}</style>`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    // never hang on a drawing the browser can't decode: fail with a reason instead
    await Promise.race([
      img.decode(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('The writing could not be turned into an image.')), 15000)),
    ]);
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * A small one-line SVG of some text in a hand (the writer's signature, picker samples), tight to the writing.
 * Layout places a line the way a page would (indent, a wandering baseline), so the words are moved back to
 * the left edge and onto one baseline here. `ink`: 'currentColor', an engine ink key, or undefined (the pen's own).
 */
export function inlineSVG(p: Hand, text: string, emPx: number, uid: string, ink: string | undefined = 'currentColor') {
  const first = 0.92 * UPM;
  const page = layout(p, text, { maxWidth: 60 * UPM, firstBaseline: first, lineHeight: 1.6 * UPM });
  if (!page.items.length) return '';
  let left = Infinity, right = -Infinity;
  for (const it of page.items) {
    left = Math.min(left, it.x);
    right = Math.max(right, it.x + (it.kind === 'glyph' ? it.g.advance : 560));
  }
  const dx = 60 - left;
  const dy = first - page.items[0].y;
  const items = page.items.map((it) => ({ ...it, x: it.x + dx, y: it.y + dy }));
  const sc = emPx / UPM;
  const svg = renderSVG(p, { items, height: first + 0.42 * UPM }, { width: Math.ceil((right - left + 220) * sc), emPx, ink });
  return scopeIds(svg, uid);
}
