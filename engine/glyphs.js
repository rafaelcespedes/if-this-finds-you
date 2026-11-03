// glyphs.js — the skeleton library: every letter design a hand can draw, and how a writer picks among them.
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
//   tags     = { allograph?: 'a.double-storey' | 'seven.crossed' | ..., position?: 'initial'|'medial'|'final',
//                speed?: 'fast', caps?: true, writer? }
//              allograph: the letter's construction. Names follow docs/research/hand-traditions.md §4, written
//                out ('a.double-storey', 'seven.crossed'); §4's short IDs ('a.1', '7.2') are accepted as aliases
//                (see sources/allographs.js). Several variants may share an allograph: they are different
//                drawings of one construction, and the chooser alternates them so neighbours differ.
//              position: a contextual form, only used there (a word-final s). Never a writer's everyday form.
//              speed 'fast': a simplified form that hurried writers favour. caps: reads well in a row of capitals.
//              writer: which real writer a traced drawing came from (a hand follows one where it can).
//   source  = { name, credit, url? } — shown in the provenance card; required.
//   metrics = per-variant override of the style's metrics (for sources traced at another scale).
//   weight  = how common the form is in its style (default 1; 0 = kept for provenance, never chosen).
//
// Sources register themselves (sources/*.js). Composers build characters on demand
// (e.g. accented letters = base letter + mark) when no direct variant exists. A composer that keeps its base's
// tags (allograph) gets the writer's habit for free: é follows the hand's e.

import { rng, clamp } from './core.js';
import { morph } from './blend.js';

const STYLES = new Map();
const COMPOSERS = [];
const TRANSFORMS = [];

// meta: { label, family, tradition, connected, metrics }
//   family:    'print' | 'script' — what the UI's Print / Joined switch and New hand choose between
//   tradition: { name, region, language?, era, legibility: 'modern' | 'historical' | 'specialist', notes?,
//                schooling? }  (where and when this hand was taught; 'historical' = hard for today's readers,
//                e.g. Kurrent, and only used when asked for by name). schooling: the defineSchooling() bundle its
//                letters belong to; without it, a writer of this style draws a schooling at random.
//   connected: lowercase letters join (entry/exit pinned so joins meet)
//   fallback:  another style to borrow characters from when this one lacks them (e.g. a 1741 copybook
//              has no € or @). Borrowed variants keep their own metrics, so they scale correctly.
//   weight:    how often New hand picks this style within its family (default 1).
//   proportions: 'print' | 'script' — which x-height and width ranges the skeletons were drawn against
//              (default 'print'; Hershey script's narrow skeletons are the only 'script' ones so far).
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
export const families = () => [...new Set([...STYLES.values()].map((s) => s.family).filter(Boolean))];
// traditions that today's readers struggle with are opt-in only (never picked by New hand or by family)
export const isHistorical = (name) => { const s = STYLES.get(name); return !!(s && s.tradition && s.tradition.legibility === 'historical'); };

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
// Change an already registered variant in place (add tags, retire it with weight 0). Returns it, or null.
export function amend(style, ch, id, patch) {
  const st = STYLES.get(style);
  const v = st && st.glyphs.has(ch) ? st.glyphs.get(ch).find((x) => x.id === id) : null;
  if (!v) return null;
  if (patch.tags) patch = { ...patch, tags: { ...(v.tags || {}), ...patch.tags } };
  return Object.assign(v, patch);
}

// fn(style, ch) -> variants[] | null. Called only when a style has no direct variant for ch.
export function addComposer(fn) { COMPOSERS.push(fn); }

// fn(styleName) runs once per style, the first time a writer uses it (so after every source has loaded). It may
// register forms derived from the style's own letters, e.g. a crossed 7 for any tradition's 7, so writers of a
// traced copybook still differ in the letters that travel with their schooling.
const DERIVERS = [];
export function addDeriver(fn) { DERIVERS.push(fn); }
function derive(style) {
  const st = STYLES.get(style);
  if (!st || st.derived) return;
  st.derived = true;
  for (const fn of DERIVERS) fn(style);
}

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

// Composed and borrowed characters are cached apart from the registered ones (st.lazy), so a style's own
// letter table (st.glyphs) never depends on what was drawn earlier: writers' habits are made from it, and they
// must come out the same in any order and in a fresh process.
export function variants(style, ch) {
  const st = STYLES.get(style);
  if (!st) return [];
  const direct = st.glyphs.get(ch);
  if (direct && direct.length) return direct;
  if (!st.lazy) st.lazy = new Map();
  if (st.lazy.has(ch)) return st.lazy.get(ch);
  for (const fn of COMPOSERS) {
    const v = fn(style, ch);
    if (v && v.length) { st.lazy.set(ch, v); return v; }
  }
  if (st.fallback && st.fallback !== style) {
    const fb = STYLES.get(st.fallback);
    const v = fb ? variants(st.fallback, ch) : [];
    if (v.length) {
      const borrowed = v.map((x) => ({ ...x, metrics: x.metrics || fb.metrics, borrowedFrom: st.fallback }));
      st.lazy.set(ch, borrowed);
      return borrowed;
    }
  }
  return [];
}

// true if this style can actually draw ch (no silent fallback)
export const has = (style, ch) => variants(style, ch).length > 0;

// Typographic characters that may fall back to a plainer form when a style lacks them.
const CHAR_FALLBACK = { '‘': "'", '’': "'", '“': '"', '”': '"', '—': '-', '–': '-', '…': '.', ' ': ' ' };

// ---------------------------------------------------------------------------------------------------------
// Allographs and a writer's habits (docs/research/human-feel.md rule 9, fonts-study.md principles 2-3,
// hand-traditions.md §4 "which variants travel together").
//
// Real writers are consistent: one dominant form per letter, set mostly by where they learned to write
// (their *schooling*, a bundle of forms that travel together), plus two or three personal quirks. Only
// 3-6 letters get a real second form, and that one is picked by context (word-final s, a straight tail on a
// word-final y), never by a coin flip.
// ---------------------------------------------------------------------------------------------------------

const ALIASES = new Map();   // short or alternative allograph name -> canonical name
const SCHOOLINGS = new Map();
const AFFINITIES = [];       // { if, then, x }: a writer who uses `if` favours `then` x times
const CONTEXTS = [];         // { ch, when, forms, weight }: candidate second forms picked by context
const DIGIT_WORDS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

export function defineAllographAliases(map) { for (const [k, v] of Object.entries(map)) ALIASES.set(k, v); }
const canon = (name) => ALIASES.get(name) || name;
// A variant's construction (canonical allograph name, or its id when untagged)
export const allographOf = (v) => canon((v && v.tags && v.tags.allograph) || (v && v.id) || '');
// The character an allograph name belongs to: 'a.open' -> 'a', 'seven.crossed' -> '7'
export const allographChar = (name) => { const k = canon(name).split('.')[0]; return DIGIT_WORDS[k] || k; };

// def: { label, region?, weight (how common, default 1), families? (['print'] etc.; default all),
//        prefer: { allograph: multiplier }, printCaps? (chance a joined-hand writer prints every capital),
//        traits?: { latent: shift in σ } (read by makeHand), note? }
export function defineSchooling(name, def) {
  const prefer = {};
  for (const [k, v] of Object.entries(def.prefer || {})) prefer[canon(k)] = v;
  SCHOOLINGS.set(name, { name, weight: 1, ...def, prefer });
}
export const getSchooling = (name) => SCHOOLINGS.get(name);
const sch = (name) => SCHOOLINGS.get(name) || {};
export const schoolingNames = () => [...SCHOOLINGS.keys()];
// Decided in character order: '1' before '7', 'Z' before 'z'; an affinity from a later character is ignored.
export function addAffinity(ifForm, thenForm, x) { AFFINITIES.push({ if: canon(ifForm), then: canon(thenForm), x }); }
// when: 'initial' | 'final' | 'medial' | 'double' (second of a pair: ll, ss) | 'after-round' (after o b p)
// forms: allographs to use there, in order of preference; '*' = any other form this style has.
export function addContextHabit(def) { CONTEXTS.push({ weight: 1, ...def, forms: (def.forms || []).map(canon) }); }

const isLetter = (c) => !!c && /\p{L}/u.test(c);
const isUpperCh = (c) => !!c && c !== c.toLowerCase() && c === c.toUpperCase();
const ROUND_RIGHT = new Set([...'obpv']);
function inContext(when, ch, ctx) {
  const prev = ctx.prev, next = ctx.next;
  switch (when) {
    case 'initial': return !isLetter(prev) && isLetter(next);
    case 'final': return !isLetter(next) && isLetter(prev);
    case 'medial': return isLetter(prev) && isLetter(next);
    case 'double': return prev === ch;
    case 'after-round': return !!prev && ROUND_RIGHT.has(prev);
    default: return false;
  }
}

// Group a character's variants by construction. Positional variants are kept apart: they only appear in context.
function groupsOf(list) {
  const main = new Map(), positional = new Map();
  for (const v of list) {
    const a = allographOf(v);
    const m = v.tags && v.tags.position ? positional : main;
    if (!m.has(a)) m.set(a, []);
    m.get(a).push(v);
  }
  // retired forms (weight 0) stay out unless nothing else is left
  for (const [a, vs] of main) if (main.size > 1 && vs.every((v) => v.weight === 0)) main.delete(a);
  return { main, positional };
}
const groupWeight = (vs) => vs.reduce((s, v) => s + (v.weight == null ? 1 : v.weight), 0);

// The habits a writer brings to a style. Made once per hand (makeHand) and per style on demand.
// seed: the writer's identity seed (siblings share it); traits: { hurry, neatness } natural values (0..1);
// opts: { schooling?, quirks? (0..1 how many off-bundle letters), rare? (boost uncommon forms),
//        sibling? (a sibling's seed: about 15% of its letters are re-rolled from it, the rest kept),
//        second? ({ style, schooling }: the school this writer later mixed in; see blendWith) }.
// Where this writer learned (a schooling name, or null if none is defined). A style may fix it.
export function pickSchooling(seed, style) {
  const st = STYLES.get(style);
  const own = st && st.tradition && st.tradition.schooling;
  if (own && SCHOOLINGS.has(own)) return own;
  const fam = st ? st.family : null;
  const pool = [...SCHOOLINGS.values()].filter((s) => !s.families || !fam || s.families.includes(fam));
  return pool.length ? rng('schooling:' + seed + ':' + (fam || style)).weighted(pool).name : null;
}

export function makeHabits(seed, style, traits = {}, opts = {}) {
  for (const name of STYLES.keys()) derive(name); // every style at once: habits read other styles' letters too
  const st = STYLES.get(style);
  const r = rng('habits:' + seed + ':' + style);
  const schooling = opts.schooling && SCHOOLINGS.has(opts.schooling) ? opts.schooling : pickSchooling(seed, style);
  const H = { seed: String(seed), style, schooling, traits, rare: opts.rare || 0, sibling: opts.sibling || null, quirks: new Set(), context: new Map(), letters: new Map(), borrow: new Map(), morphs: new Map(), second: null };
  // the second school (opts.second: { style, schooling }): only its everyday forms matter
  if (opts.second && STYLES.has(opts.second.style)) H.second = makeHabits(seed + '/2', opts.second.style, traits, { schooling: opts.second.schooling });
  if (!st) return H;
  // a traced style may keep several real writers (tags.writer): this hand follows one of them where it can
  const writers = new Map();
  for (const list of st.glyphs.values()) for (const v of list) if (v.tags && v.tags.writer) writers.set(v.tags.writer, (writers.get(v.tags.writer) || 0) + 1);
  H.writer = writers.size ? r.weighted([...writers].sort().map(([w, n]) => ({ w, weight: n }))).w : null;
  // some writers of a joined hand print every capital (a bundle, not a per-letter coin flip)
  H.printCaps = r() < (sch(schooling).printCaps ?? 0.2);
  // which letters can differ at all
  const multi = [];
  for (const [ch, list] of st.glyphs) if (groupsOf(list).main.size > 1) multi.push(ch);
  multi.sort();
  // two or three personal, off-bundle forms
  const nq = Math.round(1.6 + r() * 1.8 + (opts.quirks || 0) * 2);
  for (let i = 0; i < nq && multi.length; i++) H.quirks.add(multi[Math.floor(r() * multi.length)]);
  // A copybook with few forms of its own: the writer keeps it, but has picked up two or three letters from other
  // traditions of the same family (hand-traditions.md §8: "borrows two or three letters ... within compatible
  // bundles"). Joined letters only come from joined styles, so joins still meet.
  if (multi.length < 12) {
    const donors = [...STYLES.values()].filter((d) => d.name !== style && d.family === st.family && !isHistorical(d.name)).sort((a, b) => (a.name < b.name ? -1 : 1));
    const pool = [];
    for (const [ch, list] of [...st.glyphs].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (!/\p{L}|\p{N}/u.test(ch) || list.some((v) => v.borrowedFrom)) continue;
      const own = new Set(list.map(allographOf));
      for (const d of donors) {
        if (/\p{Ll}/u.test(ch) && (!!d.connected !== !!st.connected || !joinsMeet(style, d.name, ch))) continue;
        for (const v of d.glyphs.get(ch) || []) if (v.weight !== 0 && !(v.tags && v.tags.position) && !v.borrowedFrom && !own.has(allographOf(v)) && fitsHeight(v, d, list, st)) pool.push({ ch, d, v });
      }
    }
    const nb = Math.round(1.6 + r() * 1.8);
    for (let i = 0; i < nb && pool.length; i++) {
      const c = pool[Math.floor(r() * pool.length)];
      if (H.borrow.has(c.ch)) continue;
      H.borrow.set(c.ch, borrowed(c.d, c.ch, c.v));
    }
  }
  // 3-6 letters with a second form picked by context
  const cands = CONTEXTS.filter((c) => st.glyphs.has(c.ch)).map((c) => ({ ...c, w: c.weight * (0.5 + r()) }));
  cands.sort((a, b) => b.w - a.w || (a.ch < b.ch ? -1 : 1));
  const want = 3 + Math.floor(r() * 4);
  for (const c of cands) {
    if (H.context.size >= want) break;
    if (H.context.has(c.ch)) continue;
    const alt = altFor(H, c);
    if (alt) H.context.set(c.ch, { when: c.when, allograph: alt });
  }
  return H;
}

function altFor(H, c) {
  const st = STYLES.get(H.style);
  const { main, positional } = groupsOf(st.glyphs.get(c.ch) || []);
  const dominant = mainForm(H, c.ch);
  const avail = new Set([...main.keys(), ...positional.keys()]);
  for (const f of c.forms) {
    if (f === '*') { const other = [...main.keys()].filter((a) => a !== dominant).sort(); if (other.length) return other[Math.floor(rng('alt:' + H.seed + ':' + c.ch)() * other.length)]; continue; }
    if (f !== dominant && avail.has(f)) return f;
  }
  return null;
}

// A letter may only be lent when it stays within the height of the borrower's own form of it (cap-height units
// above and below the baseline): a lender's deep descender or tall loop would leave the borrower's page.
function fitsHeight(v, donor, ownList, host) {
  const span = (x, m) => { let up = 0, down = 0; for (const s of x.s) for (const [, y] of s) { up = Math.max(up, (m.base - y) / (m.base - m.cap)); down = Math.max(down, (y - m.base) / (m.base - m.cap)); } return [up, down]; };
  const [u, dn] = span(v, v.metrics || donor.metrics);
  const own = ownList.find((x) => x.weight !== 0 && !(x.tags && x.tags.position));
  if (!own) return true;
  const [ou, od] = span(own, own.metrics || host.metrics);
  return u <= ou + 0.1 && dn <= od + 0.08;
}

// A variant lent by another style keeps that style's metrics, so it scales into this hand correctly.
const LENT = new Map();
function borrowed(donor, ch, v) {
  const k = donor.name + '\u0000' + ch + '\u0000' + v.id;
  if (!LENT.has(k)) LENT.set(k, { ...v, metrics: v.metrics || donor.metrics, borrowedFrom: donor.name });
  return LENT.get(k);
}

// The writer's everyday form of ch in their style (canonical allograph name).
// Affinities only look at characters that sort before ch, so the decisions form a chain, never a loop.
function mainForm(H, ch) {
  if (H.letters.has(ch)) return H.letters.get(ch);
  const st = STYLES.get(H.style);
  const list = st ? variants(H.style, ch) : [];
  const { main } = groupsOf(list);
  if (main.size <= 1) { const a = main.size ? [...main.keys()][0] : ''; H.letters.set(ch, a); return a; }
  const sch = SCHOOLINGS.get(H.schooling);
  const quirk = H.quirks.has(ch);
  const hurry = H.traits.hurry == null ? 0.4 : H.traits.hurry;
  const entries = [...main].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([a, vs]) => {
    let w = groupWeight(vs);
    if (H.writer && vs.some((v) => v.tags && v.tags.writer === H.writer)) w *= 6;
    const pref = sch && sch.prefer[a] != null ? sch.prefer[a] : 1;
    // a quirk letter ignores the schooling and leans away from its favourite
    w *= quirk ? (pref > 1 ? 0.35 : 1) : pref;
    if (vs[0].tags && vs[0].tags.speed === 'fast') w *= 0.35 + 2.2 * hurry;
    if (vs[0].tags && vs[0].tags.caps && isUpperCh(ch)) w *= H.printCaps ? 10 : 0.3;
    if (H.rare && w < 1) w = Math.pow(w, 1 - 0.6 * H.rare); // Wild: uncommon forms come up more often
    for (const af of AFFINITIES) {
      if (af.then !== a) continue;
      const c = allographChar(af.if);
      if (c < ch && mainForm(H, c) === af.if) w *= af.x;
    }
    return { a, weight: w };
  }).filter((e) => e.weight > 0);
  const who = H.sibling && rng('sibling-letter:' + H.sibling + ':' + ch)() < 0.15 ? H.sibling : H.seed;
  const a = entries.length ? rng('allograph:' + who + ':' + H.style + ':' + ch).weighted(entries).a : [...main.keys()][0];
  H.letters.set(ch, a);
  return a;
}

// Habits for p's current style (a hand made for one style can still be asked to write in another).
function habitsFor(p) {
  const h = p.habits;
  if (h && h.style === p.style) return h;
  const root = h || { byStyle: new Map() };
  if (!root.byStyle) root.byStyle = new Map();
  if (!root.byStyle.has(p.style)) {
    root.byStyle.set(p.style, makeHabits(h ? h.seed : p.seed, p.style, h ? h.traits : { hurry: p.hurry, neatness: p.neatness }, h ? { schooling: h.schooling } : {}));
  }
  return root.byStyle.get(p.style);
}

// A summary of a writer's letters for a style: { schooling, letters: { ch: { main, alt?: { allograph, when } } } }.
// Used by the lab, the sampler's distance and the provenance card.
export function describeHabits(p, chars) {
  const H = habitsFor(p);
  const st = STYLES.get(p.style);
  const letters = {};
  const list = chars ? [...chars] : st ? [...st.glyphs.keys()] : [];
  for (const ch of list) {
    if (groupsOf(variants(p.style, ch)).main.size <= 1 && !H.context.has(ch)) continue;
    letters[ch] = { main: mainForm(H, ch) };
    if (H.context.has(ch)) letters[ch].alt = H.context.get(ch);
  }
  for (const [ch, v] of H.borrow) letters[ch] = { main: allographOf(v), from: v.borrowedFrom };
  const w = 0.6 * clamp(p.blend == null ? 0 : p.blend, 0, 1);
  if (H.second && w > 0) for (const ch of list) {
    const t = letterBlend(H, ch, w), B = t > 0 && secondForm(H, ch);
    if (!B || allographOf(B.v) === mainForm(H, ch) && B.style === H.style) continue;
    if (!letters[ch]) letters[ch] = { main: mainForm(H, ch) };
    letters[ch].blend = { toward: allographOf(B.v), style: B.style, t: +t.toFixed(2) };
  }
  return { schooling: H.schooling, second: H.second && { style: H.second.style, schooling: H.second.schooling, weight: +w.toFixed(2) },
    printsCapitals: H.printCaps, quirks: [...H.quirks], letters };
}

// Which variant does this hand use for ch here?
// ctx (optional, from layout): { prev, next, index, wordStart, wordEnd }. Without ctx: the writer's everyday form.
//  1. pinned letters (p.pins = { ch: variant id or allograph }) win: locked letters, lab close-ups
//  2. capitals in a row use a form that reads in a row (tags.caps): joined capitals turn ALL CAPS into a scrawl
//  3. the writer's second form for this letter, when its context matches
//  4. otherwise the everyday form; if it has several drawings, neighbours get different ones (preferring the
//     drawings of the writer this hand follows, when a traced style keeps several real writers: tags.writer)
//  A variant with resolve(p, ctx) is then built for this writer (accented letters, sources/accents.js).
export function choose(p, ch, ctx) {
  const v = pick(p, ch, ctx);
  // a variant may be built for this writer (composed letters: their own base letter and mark habits)
  return v && v.resolve ? v.resolve(p, ctx) || v : v;
}
function pick(p, ch, ctx) {
  let list = variants(p.style, ch);
  if (!list.length && CHAR_FALLBACK[ch]) list = variants(p.style, CHAR_FALLBACK[ch]);
  if (!list.length) list = variants(p.style, '?');
  if (!list.length) return undefined;
  const pin = p.pins && p.pins[ch];
  if (pin) { const v = list.find((x) => x.id === pin) || list.find((x) => allographOf(x) === canon(pin)); if (v) return v; }
  const H = habitsFor(p);
  const run = ctx && isUpperCh(ch) && (isUpperCh(ctx.prev) || isUpperCh(ctx.next));
  if (H.borrow.has(ch) && !run && !(neat(p) && CONFUSABLE.has(allographOf(H.borrow.get(ch))))) return blendWith(p, H, ch, H.borrow.get(ch));
  if (list.length === 1) return blendWith(p, H, ch, list[0]);
  const { main, positional } = groupsOf(list);
  let form = mainForm(H, ch), special = false;
  if (neat(p) && CONFUSABLE.has(form)) form = readableForm(main, form) || form;
  if (ctx) {
    const alt = H.context.get(ch);
    if (run && !(main.get(form) || [])[0]?.tags?.caps) {
      const capsForm = [...main.keys(), ...positional.keys()].sort().find((a) => ((main.get(a) || positional.get(a))[0].tags || {}).caps);
      if (capsForm) { form = capsForm; special = true; }
    } else if (alt && inContext(alt.when, ch, ctx)) { form = alt.allograph; special = true; }
  }
  let takes = main.get(form) || positional.get(form) || main.get(mainForm(H, ch)) || list;
  if (H.writer && takes.length > 1) { const own = takes.filter((v) => v.tags && v.tags.writer === H.writer); if (own.length) takes = own; }
  let v = takes[0];
  if (takes.length > 1) {
    // several drawings of one construction: alternate along the word so a double letter never repeats a shape
    const off = Math.floor(rng('take:' + H.seed + ':' + ch)() * takes.length);
    const i = ctx && Number.isFinite(ctx.index) ? ctx.index : 0;
    v = takes[(i + off) % takes.length];
  }
  return special ? v : blendWith(p, H, ch, v);
}

// ---------- blending: a writer schooled twice ----------
// A hand may carry a second schooling (and, when its family has several traditions, a second tradition) with a
// weight: 0.6 x p.blend ("Mixed schooling"). Each letter has its own blend amount around that weight: some stay
// purely from the first school, some are fully adopted from the second, the rest sit in between. Letters built
// the same way are morphed (blend.js); letters built differently are one or the other, by the mix.
const CONTINUA = new Map(); // allograph -> continuum id: different names that are one shape, drawn further or less
export function defineContinuum(names) { const id = names.map(canon).join('|'); for (const n of names) CONTINUA.set(canon(n), id); }
const isLowerCh = (c) => /^\p{Ll}$/u.test(c);

// Where a joined style's lowercase letters meet (exit height as a fraction of x-height; null if not joined).
// Joined letters only move between traditions that meet at about the same height, or the joins break.
function joinHeight(style) {
  const st = STYLES.get(style);
  if (!st || !st.connected) return null;
  if (st.joinHeight == null) {
    const m = st.metrics, hs = [];
    for (const ch of 'acdehiklmnstu') {
      const v = (st.glyphs.get(ch) || []).find((x) => x.weight !== 0 && !(x.tags && x.tags.position) && !x.borrowedFrom);
      if (!v || !v.s.length) continue;
      const mm = v.metrics || m, last = v.s[v.s.length - 1], e = last[last.length - 1];
      hs.push((mm.base - e[1]) / (mm.base - mm.xHeight));
    }
    hs.sort((a, b) => a - b);
    st.joinHeight = hs.length ? hs[Math.floor(hs.length / 2)] : 0.5;
  }
  return st.joinHeight;
}
const joinsMeet = (a, b, ch) => { if (!isLowerCh(ch) || a === b) return true; const ha = joinHeight(a), hb = joinHeight(b); return ha == null || hb == null || Math.abs(ha - hb) <= 0.15; };

// How far this letter has moved toward the second school (0..1), for a second-school weight w.
function letterBlend(H, ch, w) {
  if (!(w > 0)) return 0;
  const r = rng('blend-letter:' + H.seed + ':' + ch);
  const u = r(), g = r.gauss();
  if (u < 0.55 * (1 - w)) return 0;      // kept from the first school
  if (u > 1 - 0.45 * w) return 1;        // adopted outright
  return clamp(w * (1 + 0.55 * g), 0.05, 0.95);
}

// The second school's form of ch: { v, style } or null
function secondForm(H, ch) {
  const S = H.second;
  if (!S) return null;
  const list = variants(S.style, ch);
  if (!list.length) return null;
  const g = groupsOf(list).main.get(mainForm(S, ch)) || list.filter((v) => v.weight !== 0);
  return g && g.length ? { v: g[0], style: S.style } : null;
}

// Neat only: forms that read as another character (Hershey Simplex Script's looped A reads as S or L, its Q as a
// 2, its G and I as Y and J) give way to the writer's next most likely readable form.
export const CONFUSABLE = new Set(['A.looped', 'Q.two', 'G.looped', 'I.looped']);
const neat = (p) => p.neatOnly === 'on' || p.neatOnly === true;
function readableForm(main, form) {
  let best = null;
  for (const [a, vs] of [...main].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (a === form || CONFUSABLE.has(a)) continue;
    const w = groupWeight(vs);
    if (w > 0 && (!best || w > best.w)) best = { a, w };
  }
  return best && best.a;
}

function blendWith(p, H, ch, vA) {
  const w = 0.6 * clamp(p.blend == null ? 0 : p.blend, 0, 1);
  if (!vA || !H.second || !(w > 0) || vA.resolve) return vA;
  const t = Math.round(letterBlend(H, ch, w) * 100) / 100;
  if (t <= 0) return vA;
  const B = secondForm(H, ch);
  if (!B || B.v === vA || !joinsMeet(p.style, B.style, ch) || (neat(p) && CONFUSABLE.has(allographOf(B.v)))) return vA;
  const stA = STYLES.get(p.style), stB = STYLES.get(B.style);
  const vB = B.style === p.style ? B.v : borrowed(stB, ch, B.v);
  const aA = allographOf(vA), aB = allographOf(vB);
  if (aA === aB || (CONTINUA.has(aA) && CONTINUA.get(aA) === CONTINUA.get(aB))) {
    const key = ch + '\u0000' + vA.id + '\u0000' + B.style + '\u0000' + vB.id + '\u0000' + t;
    if (!H.morphs.has(key)) {
      const mA = vA.metrics || stA.metrics, mB = vB.metrics || stB.metrics;
      const m = morph(vA, mA, vB, mB, t, isLowerCh(ch), aA === aB ? 0.26 : 0.2);
      H.morphs.set(key, m && { ...vA, ...m, id: t < 0.5 ? vA.id : vB.id, tags: t < 0.5 ? vA.tags : vB.tags, blend: { from: vA.id, to: vB.id, style: B.style, t } });
    }
    const mv = H.morphs.get(key);
    if (mv) return mv;
  }
  // built differently: one or the other, by the mix (never a broken in-between)
  return rng('blend-pick:' + H.seed + ':' + ch)() < t ? vB : vA;
}
