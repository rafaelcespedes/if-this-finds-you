// The writing layer. This is the one place the app puts handwriting on screen (see lib/writing.ts).
// Today it shows the engine's SVG, drawn once at a reference scale and sized by CSS; a canvas/WebGL
// renderer or the engine's stroke-by-stroke animation (animate.js, page-rhythm session) can replace the
// inside without touching callers.
//
// A new look (`fade`) cross-fades in the DOM: the old writing stays where it is and fades out while the new
// one fades in, opacity only. A change in the middle of a fade takes over from wherever the fade has got to,
// so quick clicks never queue. Everything else (typing, sliders) swaps in place.
//
// `play` writes the sheet out in front of the reader: each pen stroke appears in reading order, paced by
// its size, with a breath at each new line. A stand-in until the engine's write-on animation lands.
import { memo, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { perf } from '@/lib/perf';

export interface Play {
  /** changes to start again */
  token: number;
  /** seconds before this sheet starts, and how long it takes */
  delay: number;
  seconds: number;
}

interface Props {
  svg: string;
  ink: string;
  className?: string;
  /** cross-fade from the writing shown before (a new look) */
  fade?: boolean;
  play?: Play | null;
  /** changes to jump to the end of the writing */
  finishToken?: number;
}

const FADE_MS = 170;

/**
 * Safari (and every browser on iPhone and iPad, which are Safari underneath) draws an SVG image's ink-edge filter at
 * a low resolution, so the letters come out soft at any size: only Chrome-based browsers, checked sharp, get the
 * image; everywhere else the writing stays SVG in the page, as sharp as ever. `?svgwriting` does that anywhere.
 */
const IMAGES_SHARP = (() => {
  if (typeof navigator === 'undefined') return false;
  if (new URLSearchParams(location.search).has('svgwriting')) return false;
  const ua = navigator.userAgent;
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // checked sharp in Chrome-based browsers (Chrome, Edge, Opera, Android); elsewhere the SVG stays in the page
  return !apple && /(Chrome|Chromium|Edg|OPR)\//.test(ua);
})();

/**
 * A still letter is shown as an image of its SVG: the browser draws it once, instead of building thousands of
 * paths (and their ink-edge filter) into the page; a paper change or a new hand then costs a fraction of the time.
 * The reader's write-out animates each stroke, and print for letters a hand can't write uses the page's styles:
 * those stay SVG in the page.
 */
const asImage = (svg: string, playing: boolean) => IMAGES_SHARP && !playing && typeof URL.createObjectURL === 'function' && !svg.includes('class="miss"');

/** Let go of a layer's image (its blob URL). */
function release(layer: HTMLElement) {
  const url = layer.dataset.url;
  if (url) { URL.revokeObjectURL(url); delete layer.dataset.url; }
}
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

export const Writing = memo(function Writing({ svg, ink, className, fade, play, finishToken }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // ---------- the layers: one current, at most one fading out ----------
  // What the current layer shows (kept here, not in the DOM: a letter's SVG is hundreds of kB), and the newest
  // request, so a slower image decode never lands over a newer one.
  const shown = useRef<{ svg: string; ink: string } | null>(null);
  const asked = useRef(0);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const current = host.querySelector<HTMLDivElement>(':scope > [data-layer="current"]');
    if (current && shown.current?.svg === svg && shown.current.ink === ink) return;
    const token = ++asked.current;
    const image = asImage(svg, !!play);
    // fill a layer with the writing, then go on (at once for SVG in the page; once decoded for an image)
    const fill = (layer: HTMLDivElement, then: () => void) => {
      if (!image) {
        release(layer);
        layer.innerHTML = svg;
        layer.style.color = ink;
        then();
        return;
      }
      const url = URL.createObjectURL(new Blob([svg.replace(/currentColor/g, ink)], { type: 'image/svg+xml' }));
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.src = url;
      const done = () => {
        if (token !== asked.current) { URL.revokeObjectURL(url); return; }
        release(layer);
        layer.dataset.url = url;
        layer.replaceChildren(img);
        then();
      };
      img.decode().then(done, done);
    };
    if (current && !fade) {
      // in place: typing, a slider, the same look again
      fill(current, () => { shown.current = { svg, ink }; perf.lookShown(); });
      return;
    }
    const layer = document.createElement('div');
    layer.dataset.layer = 'next';
    layer.className = 'writing-fill absolute inset-0';
    fill(layer, () => {
      perf.lookShown();
      shown.current = { svg, ink };
      for (const g of host.querySelectorAll<HTMLDivElement>(':scope > [data-layer="ghost"]')) { release(g); g.remove(); }
      const old = host.querySelector<HTMLDivElement>(':scope > [data-layer="current"]');
      layer.dataset.layer = 'current';
      host.appendChild(layer);
      if (!old) return;
      // fade out from wherever the old layer is now (it may itself be fading in)
      const from = Number(getComputedStyle(old).opacity) || 1;
      for (const a of old.getAnimations()) a.cancel();
      old.dataset.layer = 'ghost';
      old.style.opacity = String(from);
      // the old writing keeps its own size while it fades (the sheet may have changed size under it)
      const r = old.getBoundingClientRect();
      if (r.width && r.height) Object.assign(old.style, { inset: 'auto', left: '0', top: '0', width: `${r.width}px`, height: `${r.height}px` });
      old.animate([{ opacity: from }, { opacity: 0 }], { duration: FADE_MS * from, easing: EASE_OUT, fill: 'forwards' }).onfinish = () => { release(old); old.remove(); };
      layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: EASE_OUT, fill: 'backwards' });
    });
  }, [svg, ink, fade, play]);
  useLayoutEffect(() => () => {
    for (const l of ref.current?.children ?? []) release(l as HTMLElement);
    ref.current?.replaceChildren();
  }, []);

  // ---------- the reader's write-out ----------
  useLayoutEffect(() => {
    const root = ref.current?.querySelector(':scope > [data-layer="current"]');
    if (!root || !play) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const paths = [...root.querySelectorAll<SVGPathElement>('svg > g path')];
    if (!paths.length) return;
    // weight each stroke by its size; a new line costs a little extra (the hand travels back)
    const boxes = paths.map((p) => p.getBBox());
    const weights: number[] = [];
    let prevX = -Infinity;
    for (const b of boxes) {
      const newLine = b.x < prevX - 40;
      weights.push(Math.max(2, b.width + b.height) + (newLine ? 60 : 0));
      prevX = b.x;
    }
    const total = weights.reduce((a, w) => a + w, 0);
    const ms = play.seconds * 1000;
    let t = play.delay * 1000;
    const anims = paths.map((p, i) => {
      const d = (weights[i] / total) * ms;
      const a = p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(40, d * 1.6), delay: t, fill: 'backwards', easing: 'ease-out' });
      t += d;
      return a;
    });
    return () => anims.forEach((a) => a.cancel());
  }, [svg, play?.token, play?.delay, play?.seconds]);

  useLayoutEffect(() => {
    if (!finishToken || !ref.current) return;
    for (const a of ref.current.getAnimations({ subtree: true })) a.finish();
  }, [finishToken]);

  // clipped to the sheet: the fading old writing keeps its own size and never shows past the new sheet's edge
  return <div ref={ref} aria-hidden className={cn('writing pointer-events-none absolute inset-0 overflow-hidden', className)} />;
});
