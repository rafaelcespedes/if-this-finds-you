// glyphs.js — the skeleton library: every letter design a hand can draw.
//
// A *style* is a family of skeletons that share a coordinate system (metrics), e.g. 'print', 'script'.
// Each character in a style has one or more *variants* (allographs): different ways to build the
// letter (single- vs double-storey a, looped vs plain l, crossed 7...). A hand chooses among them.
//
// Skeleton format (same as the Hershey data): { l, r, s: [[ [x,y], ... ], ...] }
//   l / r  = left / right side bearing (source units), s = strokes as polylines, y down.
// Variant = skeleton + { id, source, weight?, metrics?, tags?, marks?, resolve? }.
//   marks    = indices of strokes in `s` that are marks (accents...), written after the letter
//   resolve  = (p, ctx) => concrete variant, for composed characters that depend on the hand
//   tags     = { allograph?: 'a.double-storey' | 'seven.crossed' | ..., position?: 'initial'|'medial'|'final' }
//              allograph names follow docs/research/hand-traditions.md §4.
//   source  = { name, credit, url? } — shown in the provenance card; required.
//   metrics = per-variant override of the style's metrics (for sources traced at another scale).
//
// Sources register themselves (sources/*.js). Composers build characters on demand
// (e.g. accented letters = base letter + mark) when no direct variant exists.

import { rng } from './core.js';

const STYLES = new Map();
const COMPOSERS = [];
const TRANSFORMS = [];

// meta: { label, family, tradition, connected, metrics }
//   family:    'print' | 'script' — what the UI's Print / Joined switch and New hand choose between
//   tradition: { name, region, language?, era, legibility: 'modern' | 'historical' | 'specialist', notes? }
//              (where and when this hand was taught; 'historical' = hard for today's readers, e.g. Kurrent)
//   connected: lowercase letters join (entry/exit pinned so joins meet)
//   fallback:  another style to borrow characters from when this one lacks them (e.g. a 1741 copybook
//              has no € or @). Borrowed variants keep their own metrics, so they scale correctly.
// metrics: { base, cap, xHeight, descender, descRatio } in source units, y down.
//   base/cap: baseline and cap-height y; xHeight: lowercase x-height y; descender: lowercase
//   descender y; descRatio: rendered descender depth as a fraction of cap height.
export function defineStyle(name, meta) {
  if (!STYLES.has(name)) STYLES.set(name, { name, glyphs: new Map(), ...meta });
  else Object.assign(STYLES.get(name), meta);
  return STYLES.get(name);
}
export const getStyle = (name) => STYLES.get(name);
export const styleNames = () => [...STYLES.keys()];
export const stylesInFamily = (family) => [...STYLES.values()].filter((s) => s.family === family).map((s) => s.name);

export function register(style, ch, variant) {
  const st = STYLES.get(style);
  if (!st) throw new Error(`register: unknown style "${style}"`);
  if (!variant.source) throw new Error(`register: variant for "${ch}" in ${style} has no source`);
  if (!st.glyphs.has(ch)) st.glyphs.set(ch, []);
  const list = st.glyphs.get(ch);
  const i = list.findIndex((v) => v.id === variant.id);
  if (i >= 0) list[i] = variant; else list.push(variant);
  return variant;
}

// fn(style, ch) -> variants[] | null. Called only when a style has no direct variant for ch.
export function addComposer(fn) { COMPOSERS.push(fn); }

// Skeleton transforms reshape the chosen variant per hand before it is drawn: style dimensions such as
// loopiness, lead-ins and end flicks, connectivity, join length, angularity. fn(p, ch, variant, ctx, metrics)
// -> variant (same skeleton format, source units; return the input unchanged to skip). Must be deterministic,
// keep `source` and `marks`, and never mutate the input. Applied in registration order.
export function addTransform(fn) { TRANSFORMS.push(fn); }
export function transform(p, ch, v, ctx) {
  if (!v || !TRANSFORMS.length) return v;
  const st = STYLES.get(p.style);
  const m = v.metrics || (st && st.metrics);
  for (const fn of TRANSFORMS) v = fn(p, ch, v, ctx, m) || v;
  return v;
}

export function variants(style, ch) {
  const st = STYLES.get(style);
  if (!st) return [];
  const direct = st.glyphs.get(ch);
  if (direct && direct.length) return direct;
  for (const fn of COMPOSERS) {
    const v = fn(style, ch);
    if (v && v.length) { st.glyphs.set(ch, v); return v; } // cache
  }
  if (st.fallback && st.fallback !== style) {
    const fb = STYLES.get(st.fallback);
    const v = fb ? variants(st.fallback, ch) : [];
    if (v.length) {
      const borrowed = v.map((x) => ({ ...x, metrics: x.metrics || fb.metrics, borrowedFrom: st.fallback }));
      st.glyphs.set(ch, borrowed); // cache
      return borrowed;
    }
  }
  return [];
}

// true if this style can actually draw ch (no silent fallback)
export const has = (style, ch) => variants(style, ch).length > 0;

// Typographic characters that may fall back to a plainer form when a style lacks them.
const CHAR_FALLBACK = { '‘': "'", '’': "'", '“': '"', '”': '"', '—': '-', '–': '-', '…': '.', ' ': ' ' };

// Which variant does this hand use for ch here?
// ctx (optional, from layout): { prev, next, index, wordStart, wordEnd }.
// Default: each hand settles on one variant per letter (weighted by `weight`), fixed for the seed.
export function choose(p, ch, ctx) {
  let list = variants(p.style, ch);
  if (!list.length && CHAR_FALLBACK[ch]) list = variants(p.style, CHAR_FALLBACK[ch]);
  if (!list.length) list = variants(p.style, '?');
  const v = list.length <= 1 ? list[0] : rng('variant:' + p.seed + ':' + p.style + ':' + ch).weighted(list);
  // a variant may resolve per hand (e.g. é = this hand's own e + this writer's accent habit)
  return v && v.resolve ? v.resolve(p, ctx) : v;
}
