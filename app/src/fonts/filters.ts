// The Fonts view's filters, from the research plan (side-session-notes …/fonts-view-filters.md, "Aligned with the
// engine spec"): what each is called, its choices in plain words, how it reads and writes the URL, and the
// constraints each choice asks the engine's sampler for (sampleLooks / sampleSet, docs/FILTERS.md). No engine here:
// the page never loads it; the worker passes `constraintsOf(filters, neatOnly)` to the sampler.
//
// Every filter has an "Any" state (nothing chosen). Kinds:
//   one   a single choice (segmented or word chips)
//   many  any of these (traditions, schooling): a list for the engine
//   run   one stop or a run of neighbouring stops on a scale (tidy to wild, slant): one range for the engine
//   flag  on or off

export type Range = [number | null, number | null];
export type Constraints = Record<string, Range | string[] | string | boolean>;

export interface Choice {
  value: string;
  label: string;
  /** what this choice asks the sampler for */
  c?: Constraints;
  /** traditions: the era group it's shown in, and a note on its card */
  group?: string;
  note?: string;
}

export interface FilterDef {
  key: FilterKey;
  /** its name in the URL */
  param: string;
  label: string;
  kind: 'one' | 'many' | 'run' | 'flag';
  /** shown above the fold of the panel, or under "More" */
  more?: boolean;
  /** the engine key a many-filter lists its values under */
  list?: string;
  /** a short line under the label */
  hint?: string;
  options: Choice[];
}

export type FilterKey =
  | 'family' | 'style' | 'character' | 'tidy' | 'slant' | 'width' | 'pen'
  | 'shape' | 'joins' | 'contrast' | 'weight' | 'xh' | 'spacing' | 'pace' | 'turns' | 'shaky' | 'mixed' | 'schooling' | 'later';
export type Filters = Record<FilterKey, string[]>;
const KEYS: FilterKey[] = ['family', 'style', 'character', 'tidy', 'slant', 'width', 'pen', 'shape', 'joins', 'contrast', 'weight', 'xh', 'spacing', 'pace', 'turns', 'shaky', 'mixed', 'schooling', 'later'];
export const NO_FILTERS: Filters = Object.fromEntries(KEYS.map((k) => [k, []])) as unknown as Filters;

/** Traditions by their short name (the engine's own label is the fallback for new ones). */
export const STYLE_LABEL: Record<string, string> = {
  print: 'Everyday print',
  script: 'Everyday joined',
  palmer: 'Palmer',
  suetterlin: 'Sütterlin',
  arrighi: 'Chancery italic',
  'quebec-print': 'Québec print',
  spencerian: 'Spencerian',
  'norwegian-1849': 'Norwegian roundhand',
  'kurrent-1849': 'Kurrent',
  'polish-1906': 'Polish copperplate',
  'spanish-1776': 'Spanish bastarda',
  'dutch-1618': 'Dutch running hand',
  'adult-fr-2023': 'French everyday',
};
/** Where a tradition sits in time (the engine's era buckets, docs/FILTERS.md). */
export const ERA_GROUPS: { id: string; label: string }[] = [
  { id: 'now', label: 'Today' },
  { id: 'c20b', label: 'Late 1900s' },
  { id: 'c20a', label: 'Early 1900s' },
  { id: 'c19', label: '1800s' },
  { id: 'early', label: 'Before 1750' },
];
const STYLE_ERA: Record<string, string> = {
  arrighi: 'early', 'dutch-1618': 'early',
  spencerian: 'c19', 'norwegian-1849': 'c19', 'spanish-1776': 'c19', 'kurrent-1849': 'c19',
  palmer: 'c20a', suetterlin: 'c20a', 'polish-1906': 'c20a',
  print: 'c20b', script: 'c20b',
  'quebec-print': 'now', 'adult-fr-2023': 'now',
};
/** Hard to read today: they come up only when picked by name. */
export const HISTORICAL = new Set(['kurrent-1849', 'dutch-1618']);

export const PEN_LABEL: Record<string, string> = {
  ballpoint: 'Ballpoint', gel: 'Gel pen', fountain: 'Fountain pen', pointed: 'Dip pen', italic: 'Italic nib', felt: 'Felt tip', pencil: 'Pencil',
};
/** For the row's quiet line: "fountain pen", "pencil". */
export const penWords = (pen: string) => (PEN_LABEL[pen] ?? pen).toLowerCase();

const SCHOOLING_LABEL: Record<string, string> = {
  american: 'American', british: 'British', french: 'French', continental: 'Continental', italic: 'Italic',
  polish: 'Polish', 'latin-american': 'Latin American', 'adult-print': 'Adult print',
};

/** What the engine has: its traditions (with family) and the pens and schoolings a look can have. */
export interface Catalogue {
  styles: { id: string; family: 'print' | 'script'; label: string }[];
  pens: string[];
  schoolings: string[];
}
export const STATIC_CATALOGUE: Catalogue = {
  styles: Object.keys(STYLE_LABEL).map((id) => ({ id, family: ['print', 'quebec-print', 'adult-fr-2023'].includes(id) ? 'print' : 'script', label: STYLE_LABEL[id] })),
  pens: Object.keys(PEN_LABEL),
  schoolings: Object.keys(SCHOOLING_LABEL),
};

const r = (lo: number | null, hi: number | null): Range => [lo, hi];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The filters, in the panel's order. */
export function filterDefs(cat: Catalogue = STATIC_CATALOGUE): FilterDef[] {
  return [
    { key: 'family', param: 'f', label: 'Joined or print', kind: 'one', options: [
      { value: 'print', label: 'Print', c: { family: 'print' } },
      { value: 'script', label: 'Joined', c: { family: 'script' } },
    ] },
    { key: 'style', param: 't', label: 'Where they learned', kind: 'many', list: 'style', options: cat.styles.map((s) => ({
      value: s.id, label: s.label, group: STYLE_ERA[s.id] ?? 'now', note: HISTORICAL.has(s.id) ? 'Hard to read today' : undefined,
    })) },
    { key: 'character', param: 'c', label: 'Character', kind: 'one', options:
      ['careful', 'everyday', 'hurried', 'elegant', 'schoolroom', 'childlike', 'technical', 'cramped', 'airy', 'angular'].map((id) => ({ value: id, label: cap(id), c: { character: id } })) },
    { key: 'tidy', param: 'n', label: 'Tidy to wild', kind: 'run', options: [
      { value: 'careful', label: 'Careful', c: { neatness: r(0.75, null) } },
      { value: 'relaxed', label: 'Relaxed', c: { neatness: r(0.6, 0.75) } },
      { value: 'loose', label: 'Loose', c: { neatness: r(0.45, 0.6) } },
      { value: 'messy', label: 'Messy', c: { neatness: r(null, 0.45) } },
    ] },
    { key: 'slant', param: 's', label: 'Slant', kind: 'run', options: [
      { value: 'back', label: 'Leans back', c: { slant: r(null, -3) } },
      { value: 'upright', label: 'Upright', c: { slant: r(-3, 6) } },
      { value: 'forward', label: 'Leans forward', c: { slant: r(6, 18) } },
      { value: 'strong', label: 'Strong lean', c: { slant: r(18, null) } },
    ] },
    { key: 'width', param: 'w', label: 'Width', kind: 'one', options: [
      { value: 'narrow', label: 'Narrow', c: { width: r(null, 0.94) } },
      { value: 'regular', label: 'Regular', c: { width: r(0.94, 1.18) } },
      { value: 'wide', label: 'Wide', c: { width: r(1.18, null) } },
    ] },
    { key: 'pen', param: 'p', label: 'Pen', kind: 'one', options: cat.pens.map((id) => ({ value: id, label: PEN_LABEL[id] ?? cap(id), c: { pen: [id] } })) },
    // ---------- More ----------
    { key: 'shape', param: 'fl', label: 'Plain or flourished', kind: 'one', more: true, options: [
      { value: 'plain', label: 'Plain', c: { loops: r(null, -0.35), flourish: r(null, -0.3) } },
      { value: 'flourished', label: 'Flourished', c: { loops: r(0.3, null), flourish: r(0.1, null) } },
    ] },
    { key: 'joins', param: 'j', label: 'Joins', kind: 'one', more: true, options: [
      { value: 'always', label: 'Always joined', c: { lifts: r(null, 0.1) } },
      { value: 'sometimes', label: 'Now and then', c: { lifts: r(0.1, 0.5) } },
      { value: 'lifted', label: 'Mostly lifted', c: { lifts: r(0.5, null) } },
    ] },
    { key: 'contrast', param: 'ct', label: 'Contrast', kind: 'one', more: true, hint: 'Set by the pen.', options: [
      { value: 'even', label: 'Even', c: { pen: ['ballpoint', 'gel', 'felt', 'pencil'] } },
      { value: 'thick', label: 'Thick and thin', c: { pen: ['fountain', 'pointed', 'italic'], pressure: r(0.55, null) } },
    ] },
    { key: 'weight', param: 'wt', label: 'Weight', kind: 'one', more: true, options: [
      { value: 'fine', label: 'Fine', c: { weight: r(null, 0.12) } },
      { value: 'medium', label: 'Medium', c: { weight: r(0.12, 0.15) } },
      { value: 'bold', label: 'Bold', c: { weight: r(0.15, null) } },
    ] },
    { key: 'xh', param: 'x', label: 'Small letters', kind: 'one', more: true, options: [
      { value: 'short', label: 'Short', c: { xHeight: r(null, 0.56) } },
      { value: 'medium', label: 'Medium', c: { xHeight: r(0.56, 0.63) } },
      { value: 'tall', label: 'Tall', c: { xHeight: r(0.63, null) } },
    ] },
    { key: 'spacing', param: 'sp', label: 'Spacing', kind: 'one', more: true, options: [
      { value: 'tight', label: 'Tight', c: { spacing: r(null, 0.09) } },
      { value: 'regular', label: 'Regular', c: { spacing: r(0.09, 0.13) } },
      { value: 'airy', label: 'Airy', c: { spacing: r(0.13, null) } },
    ] },
    { key: 'pace', param: 'pc', label: 'Pace', kind: 'one', more: true, options: [
      { value: 'steady', label: 'Steady', c: { hurry: r(null, 0.35) } },
      { value: 'lively', label: 'Lively', c: { hurry: r(0.35, 0.55) } },
      { value: 'rushed', label: 'Rushed', c: { hurry: r(0.55, null) } },
    ] },
    { key: 'turns', param: 'tu', label: 'Turns', kind: 'one', more: true, options: [
      { value: 'round', label: 'Round', c: { angularity: r(null, -0.3) } },
      { value: 'pointed', label: 'Pointed', c: { angularity: r(0.3, null) } },
    ] },
    { key: 'mixed', param: 'mx', label: 'Schooling', kind: 'one', more: true, options: [
      { value: 'one', label: 'One school', c: { blend: r(null, 0) } },
      { value: 'mixed', label: 'Mixed', c: { blend: r(0.15, null) } },
    ] },
    { key: 'schooling', param: 'sc', label: 'Schooled in', kind: 'many', more: true, list: 'schooling',
      options: cat.schoolings.map((id) => ({ value: id, label: SCHOOLING_LABEL[id] ?? cap(id) })) },
    // a second school a mixed hand picked up later (a tradition or a schooling; only mixed hands have one)
    { key: 'later', param: 'l', label: 'Later learned', kind: 'many', more: true, list: 'later', options: [
      ...cat.schoolings.map((id) => ({ value: id, label: SCHOOLING_LABEL[id] ?? cap(id) })),
      ...cat.styles.filter((s) => s.id !== 'print' && s.id !== 'script' && !HISTORICAL.has(s.id)).map((s) => ({ value: s.id, label: s.label })),
    ] },
    { key: 'shaky', param: 'sh', label: 'A little shaky', kind: 'flag', more: true, options: [{ value: 'yes', label: 'A little shaky', c: { tremor: r(1.5, null) } }] },
  ];
}

// With Neat hands only on, the open ends of ranges stop where the engine keeps hands readable (so nudges stay safe);
// "Bold" is weight 0.15–0.16, "Mostly lifted" pen lifts 0.5–0.85. Pen lifts never ask for more than 0.85.
const NEAT_CLAMP: Record<string, Range> = {
  slant: [-8, 28], weight: [null, 0.16], hurry: [null, 0.7], neatness: [0.5, null], loops: [null, 0.6], leadIns: [null, 0.5],
  endFlicks: [null, 0.6], flourish: [null, 0.4], joinLength: [null, 0.6], angularity: [null, 0.55], loopHeight: [null, 0.6],
  bowls: [-0.7, 0.7], rhythm: [-0.6, 0.6], tremor: [null, 2], lifts: [null, 0.85],
};
const ALWAYS_CLAMP: Record<string, Range> = { lifts: [null, 0.85] };

const isRange = (v: unknown): v is Range => Array.isArray(v) && v.length === 2 && v.every((x) => x === null || typeof x === 'number');
function intersect(a: Range, b: Range): Range {
  const lo = a[0] == null ? b[0] : b[0] == null ? a[0] : Math.max(a[0], b[0]);
  const hi = a[1] == null ? b[1] : b[1] == null ? a[1] : Math.min(a[1], b[1]);
  return [lo, hi];
}
function merge(out: Constraints, c: Constraints) {
  for (const [k, v] of Object.entries(c)) {
    const had = out[k];
    if (isRange(v)) out[k] = isRange(had) ? intersect(had, v) : v;
    else if (Array.isArray(v)) out[k] = Array.isArray(had) && !isRange(had) ? (had as string[]).filter((x) => v.includes(x)) : v;
    else out[k] = v;
  }
}

/** What the filters ask the sampler for (docs/FILTERS.md keys), with Neat hands only's safe ends. */
export function constraintsOf(f: Filters, neatOnly: boolean, cat?: Catalogue): Constraints {
  const out: Constraints = {};
  for (const d of filterDefs(cat)) {
    const chosen = f[d.key];
    if (!chosen.length) continue;
    // contrast is decided by the pen: once a pen is picked, it steps aside
    if (d.key === 'contrast' && f.pen.length) continue;
    if (d.kind === 'many') { merge(out, { [d.list!]: chosen }); continue; }
    const opts = d.options.filter((o) => chosen.includes(o.value));
    if (d.kind === 'run') {
      // a run of stops is one range: from the lowest stop's start to the highest stop's end
      const ranges = opts.flatMap((o) => Object.values(o.c ?? {})).filter(isRange);
      const key = Object.keys(opts[0]?.c ?? {})[0];
      if (!key || !ranges.length) continue;
      const lo = ranges.some((x) => x[0] == null) ? null : Math.min(...ranges.map((x) => x[0] as number));
      const hi = ranges.some((x) => x[1] == null) ? null : Math.max(...ranges.map((x) => x[1] as number));
      merge(out, { [key]: [lo, hi] });
      continue;
    }
    for (const o of opts) if (o.c) merge(out, o.c);
  }
  if (f.style.some((s) => HISTORICAL.has(s))) out.historical = true;
  for (const [k, [lo, hi]] of Object.entries(neatOnly ? NEAT_CLAMP : ALWAYS_CLAMP)) {
    const v = out[k];
    if (!isRange(v)) continue;
    let [a, b] = v;
    if (a == null && lo != null) a = lo;
    if (b == null && hi != null) b = hi;
    if (a != null && lo != null) a = Math.max(a, lo);
    if (b != null && hi != null) b = Math.min(b, hi);
    if (a != null && b != null && a > b) a = b;
    out[k] = [a, b];
  }
  return out;
}

/** A filter's chosen values, kept to the ones it has (runs kept contiguous; traditions kept to the chosen family). */
export function cleanFilters(f: Partial<Filters>, cat: Catalogue = STATIC_CATALOGUE): Filters {
  const out = { ...NO_FILTERS };
  for (const d of filterDefs(cat)) {
    const order = d.options.map((o) => o.value);
    let v = [...new Set((f[d.key] ?? []).filter((x) => order.includes(x)))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (d.kind === 'one' || d.kind === 'flag') v = v.slice(0, 1);
    if (d.kind === 'run' && v.length > 1) v = order.slice(order.indexOf(v[0]), order.indexOf(v[v.length - 1]) + 1);
    out[d.key] = v;
  }
  const fam = out.family[0];
  if (fam) out.style = out.style.filter((s) => (cat.styles.find((x) => x.id === s)?.family ?? fam) === fam);
  return out;
}

/** Tap a stop on a run: the first picks it, the next stretches the run to it, a tap inside the run ends it there. */
export function tapRun(def: FilterDef, current: string[], value: string): string[] {
  const order = def.options.map((o) => o.value);
  if (!current.length) return [value];
  if (current.length === 1 && current[0] === value) return [];
  const i = order.indexOf(value), a = order.indexOf(current[0]), b = order.indexOf(current[current.length - 1]);
  if (i >= a && i <= b) return current.length > 1 && (i === a || i === b) ? order.slice(i === a ? a + 1 : a, i === b ? b : b + 1) : [value];
  return order.slice(Math.min(i, a), Math.max(i, b) + 1);
}

export const filterCount = (f: Filters) => KEYS.reduce((n, k) => n + (f[k].length ? 1 : 0), 0);
/** One string for a set of filters (part of a set's key). */
export const filterKey = (f: Filters) => KEYS.map((k) => `${k}:${[...f[k]].sort().join('.')}`).join('|');

/** Filters ⇄ URL search params (`f=script&t=palmer.spencerian&n=careful.relaxed`). */
export function readFilters(q: URLSearchParams, cat?: Catalogue): Filters {
  const raw: Partial<Filters> = {};
  for (const d of filterDefs(cat)) {
    const v = q.get(d.param);
    if (v) raw[d.key] = v.split('.').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return cleanFilters(raw, cat);
}
export function writeFilters(q: URLSearchParams, f: Filters) {
  for (const d of filterDefs()) {
    if (f[d.key].length) q.set(d.param, f[d.key].join('.'));
    else q.delete(d.param);
  }
}

/** "Joined · Careful · Fountain pen": the chosen filters in a few words (the dock's caption). */
export function describeFilters(f: Filters, cat: Catalogue = STATIC_CATALOGUE) {
  const parts: string[] = [];
  for (const d of filterDefs(cat)) {
    const labels = d.options.filter((o) => f[d.key].includes(o.value)).map((o) => o.label);
    if (!labels.length) continue;
    if (d.kind === 'run') parts.push(labels.length > 1 ? `${labels[0]} to ${labels[labels.length - 1].toLowerCase()}` : labels[0]);
    else if (d.key === 'later') parts.push(`later ${labels.length > 2 ? `${labels.length} schools` : labels.join(' or ')}`);
    else parts.push(labels.length > 2 ? `${labels.length} ${d.key === 'style' ? 'traditions' : 'schools'}` : labels.join(' or '));
  }
  return parts.join(' · ');
}
