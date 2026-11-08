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
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  if (!ids.size) return svg;
  // every id="…", url(#…) and href="#…" in one pass (it was three passes over the whole sheet per id, ~80 ids a
  // sheet: opening a letter froze a phone for over a second)
  return svg.replace(/(id="|url\(#|href="#)([^")]+)(?=[")])/g, (m, pre: string, id: string) => (ids.has(id) ? `${pre}${id}-${uid}` : m));
}

/**
 * The ink's rough edge taken off while the pen writes, and the way to put it back (call it when the pen is done; more
 * than once is fine). The edge is an SVG filter over the whole sheet (engine ink-svg.js: turbulence and displacement),
 * and Safari runs it again over the whole sheet on every frame the writing changes: about 12 frames a second on an
 * iPhone, 60 without it. It moves the edges by a fraction of a pixel, so the ink looks the same while it's moving.
 * A pen whose filter does more than roughen (felt's bleed, pencil's grain) keeps it.
 */
export function liftInkEdge(svg: Element): () => void {
  const lifted: [Element, string][] = [];
  // (on a touch screen it stays off: see EDGE_OFF)
  for (const el of svg.querySelectorAll('[filter]')) {
    const ref = el.getAttribute('filter') ?? '';
    const id = /^url\(#([^)]+)\)$/.exec(ref)?.[1];
    if (!id || !id.startsWith('inkEdge')) continue;
    const def = svg.querySelector(`filter[id="${id}"]`);
    const parts = def ? [...def.children].map((c) => c.localName) : [];
    // (felt's bleed is a blur on top. Safari draws a blur no finer than about a pixel, so the engine leaves it out there
    // on every screen (ink-svg.js WEBKIT; felt measured 3.7-4.4 px edges on an iPhone against 1.5 for type). On another
    // browser's touch screen it goes with the edge; elsewhere it stays. Pencil's grain is more than an edge, and stays)
    if (!parts.length || parts.some((n) => n !== 'feTurbulence' && n !== 'feDisplacementMap' && !(EDGE_OFF && n === 'feGaussianBlur'))) continue;
    el.removeAttribute('filter');
    lifted.push([el, ref]);
  }
  if (EDGE_OFF) return () => {};
  return () => {
    for (const [el, ref] of lifted.splice(0)) el.setAttribute('filter', ref);
  };
}

/**
 * Phones and tablets keep the ink's rough edge off for good. Safari draws that filter at the page's unzoomed size and
 * stretches it, so pinching in, or the page zoomed in Safari's aA menu, turned the writing soft while the type stayed
 * sharp (Rafael, 7 Nov: "on mobile … the text rendering … looks a little blurry"; measured in the iOS Simulator: ink
 * edges 5 px wide at a 2.5x pinch with the filter, 1 px without). At 100% it moves edges by a fraction of a pixel: the
 * same ink, measured identical. Felt's bleed goes too (it blurred, see liftInkEdge); pencil's grain stays.
 */
export const EDGE_OFF = typeof window !== 'undefined' && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Take the rough edge off a sheet's SVG on a touch screen (EDGE_OFF); elsewhere leave it be. */
export function edgeForScreen(svg: Element | null | undefined) {
  if (EDGE_OFF && svg) liftInkEdge(svg);
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
