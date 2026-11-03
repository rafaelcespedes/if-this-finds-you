// The Fonts view's filters: what each one is called, its choices, how it reads and writes the URL, and how a hand is
// tested against it. No engine here (the page never loads it); the worker reads the same definitions and tests the
// hands it draws (fonts.worker.ts). New filters from the research plan are one more entry in FILTERS.
//
// Every choice is plain words. A filter with nothing chosen means "any". Several choices in one filter mean "any of
// these"; two filters mean "both".

/** What a filter can test, worked out once per hand in the worker. */
export interface Profile {
  family: 'print' | 'script';
  style: string;
  pen: string;
  /** 0 scrawled … 1 meticulous (the value the hand is written with) */
  neatness: number;
  /** how far the writing leans, degrees (the tradition's own slant plus the writer's) */
  lean: number;
}

export interface Choice {
  value: string;
  label: string;
  /** the worker's test (absent: the worker handles this filter itself, e.g. by asking the sampler for it) */
  test?: (p: Profile) => boolean;
  /** shown only with this family (traditions) */
  family?: 'print' | 'script';
}

export interface FilterDef {
  key: FilterKey;
  /** its name in the URL */
  param: string;
  label: string;
  /** one choice (segmented) or any number (chips) */
  multi: boolean;
  options: Choice[];
}

export type FilterKey = 'family' | 'style' | 'neat' | 'slant' | 'pen';
export type Filters = Record<FilterKey, string[]>;
export const NO_FILTERS: Filters = { family: [], style: [], neat: [], slant: [], pen: [] };

/** Traditions by their short name (the engine adds the rest of what it knows; unknown ones fall back to its label). */
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
/** The traditions as the engine had them when this was written; the worker sends the live list (catalogue). */
const STYLE_FAMILY: Record<string, 'print' | 'script'> = {
  print: 'print', 'quebec-print': 'print', 'adult-fr-2023': 'print',
  script: 'script', palmer: 'script', suetterlin: 'script', arrighi: 'script', spencerian: 'script', 'norwegian-1849': 'script',
  'kurrent-1849': 'script', 'polish-1906': 'script', 'spanish-1776': 'script', 'dutch-1618': 'script',
};

export const PEN_LABEL: Record<string, string> = {
  ballpoint: 'Ballpoint', gel: 'Gel pen', fountain: 'Fountain pen', pointed: 'Dip pen', italic: 'Italic nib', felt: 'Felt tip', pencil: 'Pencil',
};
/** For the row's quiet line: "fountain pen", "pencil". */
export const penWords = (pen: string) => (PEN_LABEL[pen] ?? pen).toLowerCase();

const between = (lo: number, hi: number) => (v: number) => v >= lo && v < hi;
const neat = (lo: number, hi: number) => (p: Profile) => between(lo, hi)(p.neatness);
const lean = (lo: number, hi: number) => (p: Profile) => between(lo, hi)(p.lean);

export interface Catalogue {
  styles: { id: string; family: 'print' | 'script'; label: string }[];
  pens: string[];
}
export const STATIC_CATALOGUE: Catalogue = {
  styles: Object.keys(STYLE_FAMILY).map((id) => ({ id, family: STYLE_FAMILY[id], label: STYLE_LABEL[id] })),
  pens: Object.keys(PEN_LABEL),
};

/** The filters, in the order the panel shows them. */
export function filterDefs(cat: Catalogue = STATIC_CATALOGUE): FilterDef[] {
  return [
    {
      key: 'family', param: 'f', label: 'Letters', multi: false,
      options: [{ value: 'print', label: 'Print' }, { value: 'script', label: 'Joined' }],
    },
    {
      key: 'style', param: 't', label: 'Tradition', multi: true,
      options: cat.styles.map((s) => ({ value: s.id, label: s.label, family: s.family })),
    },
    {
      key: 'neat', param: 'n', label: 'Neatness', multi: true,
      options: [
        { value: 'loose', label: 'Loose', test: neat(-1, 0.45) },
        { value: 'relaxed', label: 'Relaxed', test: neat(0.45, 0.65) },
        { value: 'careful', label: 'Careful', test: neat(0.65, 0.85) },
        { value: 'meticulous', label: 'Meticulous', test: neat(0.85, 2) },
      ],
    },
    {
      key: 'slant', param: 's', label: 'Slant', multi: true,
      options: [
        { value: 'back', label: 'Leans back', test: lean(-90, -2) },
        { value: 'upright', label: 'Upright', test: lean(-2, 6) },
        { value: 'slight', label: 'Slight lean', test: lean(6, 16) },
        { value: 'forward', label: 'Leans forward', test: lean(16, 90) },
      ],
    },
    {
      key: 'pen', param: 'p', label: 'Pen', multi: true,
      options: cat.pens.map((id) => ({ value: id, label: PEN_LABEL[id] ?? id })),
    },
  ];
}

/** Does a hand pass every filter? (Filters the sampler decides itself — family, tradition, pen — pass here.) */
export function matches(f: Filters, p: Profile, defs = filterDefs()) {
  for (const d of defs) {
    const chosen = f[d.key];
    if (!chosen.length) continue;
    const tests = d.options.filter((o) => chosen.includes(o.value) && o.test);
    if (tests.length && !tests.some((o) => o.test!(p))) return false;
  }
  return true;
}

/** A filter's chosen values, kept to the ones it has (and for traditions, to the chosen family). */
export function cleanFilters(f: Partial<Filters>, cat: Catalogue = STATIC_CATALOGUE): Filters {
  const defs = filterDefs(cat);
  const out = { ...NO_FILTERS };
  for (const d of defs) {
    const ok = new Set(d.options.map((o) => o.value));
    let v = [...new Set((f[d.key] ?? []).filter((x) => ok.has(x)))];
    if (!d.multi) v = v.slice(0, 1);
    out[d.key] = v.sort();
  }
  const fam = out.family[0];
  if (fam) out.style = out.style.filter((s) => (cat.styles.find((x) => x.id === s)?.family ?? fam) === fam);
  return out;
}

export const filterCount = (f: Filters) => Object.values(f).reduce((n, v) => n + v.length, 0);
/** One string for a set of filters (the set's seed mixes it in, so the same filters give the same set). */
export const filterKey = (f: Filters) => (Object.keys(NO_FILTERS) as FilterKey[]).map((k) => `${k}:${[...f[k]].sort().join('.')}`).join('|');

/** Filters ⇄ URL search params (`f=script&t=palmer.spencerian&n=careful`). */
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

const PLURAL: Record<FilterKey, string> = { family: 'kinds', style: 'traditions', neat: 'kinds of care', slant: 'slants', pen: 'pens' };

/** "Joined · Careful · Fountain pen": the chosen filters in a few words (the dock's caption). */
export function describeFilters(f: Filters, cat: Catalogue = STATIC_CATALOGUE) {
  const parts: string[] = [];
  for (const d of filterDefs(cat)) {
    const labels = d.options.filter((o) => f[d.key].includes(o.value)).map((o) => o.label);
    if (!labels.length) continue;
    parts.push(labels.length > 2 ? `${labels.length} ${PLURAL[d.key]}` : labels.join(' or '));
  }
  return parts.join(' · ');
}
