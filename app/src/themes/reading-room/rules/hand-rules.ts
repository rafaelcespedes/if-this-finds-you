// Hand-ruled lines for the Reading Room (?rules=hand, lib/rules.ts): every hairline divider on the page, whoever's
// stylesheet drew it (the running head, the ledger, the record, the shelves, the finding aid, the spread, Fonts, About,
// the sheets), is redrawn with one of the dip-pen rules in engine-rules.ts. Loaded only with the switch on.
//
// A rule is found by what it is, not by its class: an element whose top or bottom border is a hairline (1 px, no side
// borders) or an empty 1 px bar, at least 2 rem long. A light line is always a divider; a dark one is too, unless it
// edges a surface with its own opaque ground (a sheet's inked top), which stays crisp. Its border is
// then painted with border-image: the drawing sits in a 4 px band around the 1 px the crisp rule took, so the layout
// never moves, in the rule's own colour and opacity. Neighbouring rules never share a drawing: the drawing is picked by
// a hash of the rule's place in the page plus its index among its siblings. Short rules stay crisp, and so does
// everything in high contrast or forced colours (the drawings live inside one media query).
//
// The drawings are a handful of data URIs made once per colour and cached as CSS rules; the DOM is rescanned only
// when it changes (added nodes, a class or state flipping), at most once a frame, and on resize. No engine at runtime.
import { BAND, ENGINE_RULES } from './engine-rules';

type Side = 't' | 'b' | 'tb';
type Rgba = readonly [number, number, number, number];
const MIN = 32; // px: a rule shorter than 2 rem stays crisp
const LONG = 640; // px: from here the long drawings, so the wobble keeps its scale
const ATTR = 'data-rr-hr';
const LINE = 'data-rr-hr-line';
const SCOPE = "html[data-look='reading-room'][data-rules='hand']";
// a rule's drawing takes its hairline's own soft colour as it is: no line in the room is ever dark (Rafael, 3 Nov)
const WEIGHT = 1;

let media: CSSMediaRule | null = null;
const made = new Set<string>();

function sheet(): CSSMediaRule {
  if (media) return media;
  const el = document.createElement('style');
  el.dataset.rrRules = '';
  el.textContent = '@media (forced-colors: none) and (not (prefers-contrast: more)) {}';
  document.head.append(el);
  media = (el.sheet!.cssRules[0] as CSSMediaRule) ?? null;
  // an empty bar (h-px) becomes a 1 px border so border-image can draw it; its box is the same 1 px
  media?.insertRule(`${SCOPE} [${LINE}] { border-top: 1px solid transparent; background-color: transparent; }`, 0);
  return media!;
}

// ---------- colours: whatever the stylesheet wrote (oklab, color-mix…), read back as sRGB ----------
const ctx = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  return c.getContext('2d', { willReadFrequently: true });
})();
const colours = new Map<string, Rgba | null>();
function rgba(css: string): Rgba | null {
  let v = colours.get(css);
  if (v !== undefined) return v;
  v = null;
  if (ctx) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3]) v = [d[0], d[1], d[2], +(d[3] / 255).toFixed(3)];
  }
  colours.set(css, v);
  return v;
}
// how much a line darkens the page: its opacity times how dark its colour is
const cover = (c: Rgba) => c[3] * (1 - (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255);
const divider = (c: Rgba | null, surface: boolean): c is Rgba => !!c && c[3] > 0 && (cover(c) <= 0.45 || !surface);

// ---------- the drawings ----------
function svg(set: 'short' | 'long', parts: { v: number; c: Rgba }[]) {
  const { len, rules } = ENGINE_RULES[set];
  const h = BAND * parts.length;
  const body = parts.map(({ v, c }, i) => {
    const r = rules[v % rules.length];
    const stops = r.ink.map((k, j) => `<stop offset='${(j / (r.ink.length - 1)).toFixed(3)}' stop-color='rgb(${c[0]},${c[1]},${c[2]})' stop-opacity='${Math.min(1, c[3] * WEIGHT * k).toFixed(3)}'/>`).join('');
    return `<linearGradient id='g${i}' gradientUnits='userSpaceOnUse' x1='0' x2='${len}' y1='0' y2='0'>${stops}</linearGradient><path transform='translate(0 ${i * BAND})' fill='url(#g${i})' d='${r.d}'/>`;
  }).join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${len}' height='${h}' viewBox='0 0 ${len} ${h}' preserveAspectRatio='none'>${body}</svg>`)}")`;
}
// the band: 4 px around the border's 1 px, reaching 1.5 px outside the box
const GEOMETRY: Record<Side, string> = {
  t: '100% 0 0 0 / 4px 0 0 0 / 1.5px 0 0 0',
  b: '0 0 100% 0 / 0 0 4px 0 / 0 0 1.5px 0',
  tb: '50% 0 50% 0 / 4px 0 4px 0 / 1.5px 0 1.5px 0',
};
function ensure(set: 'short' | 'long', v: number, side: Side, top: Rgba | null, bottom: Rgba | null) {
  const n = ENGINE_RULES[set].rules.length;
  const parts = side === 't' ? [{ v, c: top! }] : side === 'b' ? [{ v, c: bottom! }] : [{ v, c: top! }, { v: v + Math.ceil(n / 2), c: bottom! }];
  const key = `${set[0]}${v}${side}-${parts.map((p) => p.c.join('.')).join('-')}`;
  if (!made.has(key)) {
    made.add(key);
    const m = sheet();
    m.insertRule(`${SCOPE} [${ATTR}="${key}"] { border-image: ${svg(set, parts)} ${GEOMETRY[side]} stretch; }`, m.cssRules.length);
  }
  return key;
}

// ---------- which drawing: a hash of the rule's place, plus its index among its siblings ----------
function indexOf(el: Element) {
  let i = 0;
  for (let e = el.previousElementSibling; e; e = e.previousElementSibling) i++;
  return i;
}
function pick(el: Element, n: number) {
  let h = 2166136261;
  let e = el.parentElement;
  for (let depth = 0; e && depth < 6; depth++, e = e.parentElement) h = Math.imul(h ^ (indexOf(e) + 1) ^ (e.tagName.length << 8), 16777619);
  return ((h >>> 0) + indexOf(el)) % n;
}

// ---------- finding the rules ----------
const bars = new WeakMap<Element, Rgba>(); // an empty bar's colour, from before it was turned into a border
function apply(el: Element) {
  const cs = getComputedStyle(el);
  let side: Side | null = null;
  let top: Rgba | null = null;
  let bottom: Rgba | null = null;
  let line = false;
  const w = (s: string) => parseFloat(s) || 0;
  const noSides = w(cs.borderLeftWidth) === 0 && w(cs.borderRightWidth) === 0;
  const surface = noSides && (rgba(cs.backgroundColor)?.[3] ?? 0) >= 0.9;
  const hairline = (c: Rgba | null) => divider(c, surface);
  if (noSides) {
    const tw = cs.borderTopStyle === 'none' ? 0 : w(cs.borderTopWidth);
    const bw = cs.borderBottomStyle === 'none' ? 0 : w(cs.borderBottomWidth);
    if (tw > 0 && tw <= 1.5) { const c = rgba(cs.borderTopColor); if (hairline(c)) top = c; }
    if (bw > 0 && bw <= 1.5) { const c = rgba(cs.borderBottomColor); if (hairline(c)) bottom = c; }
    side = top && bottom ? 'tb' : top ? 't' : bottom ? 'b' : null;
    // an empty bar drawn with its background (Tailwind's h-px dividers); once converted, its own colour is remembered
    if (!side && el.childElementCount === 0 && cs.backgroundImage === 'none' && w(cs.height) > 0 && w(cs.height) <= 1.5) {
      const was = el.hasAttribute(LINE) ? bars.get(el) : undefined;
      const c = was ?? (tw === 0 && bw === 0 ? rgba(cs.backgroundColor) : null);
      if (divider(c, false)) { bars.set(el, c!); top = c; side = 't'; line = true; }
    }
  }
  if (side) {
    const width = el.getBoundingClientRect().width;
    if (width >= MIN) {
      const set = width >= LONG ? 'long' : 'short';
      const key = ensure(set, pick(el, ENGINE_RULES[set].rules.length), side, top, bottom);
      if (el.getAttribute(ATTR) !== key) el.setAttribute(ATTR, key);
      if (line !== el.hasAttribute(LINE)) el.toggleAttribute(LINE, line);
      return;
    }
    if (width === 0 && el.hasAttribute(ATTR)) return; // hidden for now: keep its drawing for when it shows
  }
  if (el.hasAttribute(ATTR)) el.removeAttribute(ATTR);
  if (el.hasAttribute(LINE)) el.removeAttribute(LINE);
}
const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'svg', 'SVG', 'CANVAS', 'IMG', 'VIDEO', 'TEMPLATE', 'NOSCRIPT', 'BR']);
function scan(root: Element) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (SKIP.has((n as Element).tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  if (!SKIP.has(root.tagName)) apply(root);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) apply(n as Element);
}

// ---------- keeping up: at most one pass a frame, over what changed ----------
const queued = new Set<Element>();
let frame = 0;
function queue(el: Element) {
  queued.add(el);
  if (!frame) frame = requestAnimationFrame(flush);
}
function flush() {
  frame = 0;
  const roots = [...queued];
  queued.clear();
  for (const r of roots) {
    if (!r.isConnected) continue;
    // a root inside another queued root is scanned with it
    let inside = false;
    for (let p = r.parentElement; p && !inside; p = p.parentElement) inside = queued.has(p) || roots.includes(p);
    if (!inside) scan(r);
  }
}

let started = false;
export function startHandRules() {
  if (started || typeof document === 'undefined') return;
  started = true;
  queue(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') { for (const n of r.addedNodes) if (n.nodeType === 1) queue(n as Element); }
      else if (r.target.nodeType === 1) queue(r.target as Element);
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'data-state', 'aria-expanded'] });
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(() => queue(document.body), 200); });
  // the faces arriving can move a rule across the long/short line
  document.fonts?.ready.then(() => queue(document.body));
}
