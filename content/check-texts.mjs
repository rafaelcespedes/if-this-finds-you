#!/usr/bin/env node
// content/check-texts.mjs — validates content/sample-texts.json ("Lost Letters"). Plain Node (>= 18), no installs.
//
//   node content/check-texts.mjs            check, print a summary, exit 1 on any ERROR
//   node content/check-texts.mjs --list     also print every enabled item (id, words, origin, author)
//
// What it checks:
//   - the file is a JSON array and every entry has the right fields and types
//   - ids are unique, lowercase kebab-case; texts are not duplicated
//   - origin (undelivered | seized | family | emigrant | everyday | notable) and story (one true sentence) on every item
//   - ORDINARY PEOPLE: at least 70% of enabled items must be by ordinary, non-famous people (origin other than "notable")
//   - INCLUSION (Rafael, 2026-11-02): among enabled items, writer.gender "f" on at least 55%; at least 15 letters by
//     African or African American writers; at least 15 by Hispanic or Latin American writers. writer = { gender?,
//     heritage?, basis? } is filled only where the source states it plainly; heritage maps to the groups below, and
//     a letter written in Spanish (or Brazilian Portuguese) also counts as Hispanic / Latin American.
//   - word count: 15–90 words (ERROR above 90 or below 8; WARN for 8–14)
//   - line count: at most 12 written lines, not counting blank lines between paragraphs (WARN above)
//   - layout: "\n\n" separates paragraphs, "\n" separates lines (greeting, dateline, closing lines). layout is "source"
//     when the breaks follow the printed source, "inferred" when the source runs on and only the greeting and closing
//     were set on their own lines. The summary reports how many enabled letters have paragraphs.
//   - characters: every ENABLED item uses only GF Latin Core plus a line break. The set is imported from
//     tools/qa/lib/charsets.mjs (the derived list the engine QA uses); if that file is missing, the same derivation runs
//     here. Disabled items (e.g. Vietnamese, waiting for Tier-3 stacked tones) are reported, not failed.
//   - rights: every ENABLED item must be public domain in BOTH the US and the EU, and rights.us / rights.eu must agree
//     with the recorded facts:
//       US passes if  U1: rights.firstPublished < 1931
//                 or  U2: first made public in 2003 or later (or never) AND the writer died before 1956
//                         (or, writer unknown, the letter was written before 1906)   [17 U.S.C. §302, §303(a)]
//                 First publication 1931–2002 fails (1978–2002 publications are protected to at least 2047).
//       EU passes if  E1: rights.authorDied (or rights.authorDiedBy, a justified upper bound) < 1956   [life + 70]
//                 or  E2: rights.anonymous is true and the letter was first published before 1956  [70 years from publication]
//       EU publication right: a letter first made public in 2001 or later must come from a source with an open licence
//                 (source.licence: CC0, CC BY, CC BY-SA, Public Domain Mark, Open Government Licence; no NC or ND).
//     A translation also needs translator.died < 1956 and translator.published < 1931.
//   - traditions: ids must be from the known list below (WARN otherwise)
//   - olderHandsOnly: letters written before 1700 should carry it (decision 2026-11-02: very old spellings go with
//     older-looking hands) (WARN otherwise)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, 'sample-texts.json');
const LIST = process.argv.includes('--list');

// ---------- character set ----------
async function loadCore() {
  const lib = path.join(here, '..', 'tools', 'qa', 'lib', 'charsets.mjs');
  if (fs.existsSync(lib)) {
    const m = await import(pathToFileURL(lib).href);
    return { core: new Set(m.CORE), source: `tools/qa/lib/charsets.mjs (${m.CORE_SOURCE})` };
  }
  // Fallback: the same derivation as tools/qa/lib/charsets.mjs.
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i));
  const set = new Set([...range(0x20, 0x7e),
    '‘', '’', '“', '”', '–', '—', '−', '…', '•', '·', '€', '£', '¥', '¢', '©', '®', '™', '°', '×', '÷', ' ']);
  for (const c of range(0xa1, 0xff)) set.add(c);
  const excluded = new Set([...'ĈĉĜĝĤĥĴĵŜŝŴŵŶŷĨĩŨũĔĕĬĭŎŏŬŭŊŋŦŧĸŉſ']);
  for (const c of range(0x100, 0x17f)) if (!excluded.has(c)) set.add(c);
  for (const c of ['Ș', 'ș', 'Ț', 'ț', 'ȷ', 'ẞ', 'ˆ', 'ˇ', '˘', '˙', '˚', '˛', '˜', '˝', '‚', '„', '‹', '›']) set.add(c);
  return { core: set, source: 'derived locally (tools/qa/lib/charsets.mjs not found)' };
}

// ---------- schema ----------
const KINDS = new Set(['letter', 'postcard', 'note']);
const ORIGINS = new Set(['undelivered', 'seized', 'family', 'emigrant', 'everyday', 'notable']);
const ORDINARY_MIN = 0.7;
const WOMEN_MIN = 0.55;
const GROUP_MIN = 15;
// writer.heritage → inclusion groups (plain descriptors recorded from the sources)
const GROUPS = {
  'African or African American': /\bAfric|\bAfro-|Liberian|Sierra Leon|Ghanaian|Gold Coast|Nigerian|Yoruba|Black\b|\bNegro\b|of colou?r/i,
  'Hispanic or Latin American': /Hispanic|Latin[oa]?\b|Latin American|Spanish|Spaniard|Mexican|New Spain|Californio|Tejan[oa]|Nuevomexican|Cuban|Puerto Ric|Dominican|Argentine|Chilean|Peruvian|Colombian|Venezuelan|Uruguayan|Paraguayan|Bolivian|Ecuadorian|Guatemalan|Honduran|Salvadoran|Nicaraguan|Costa Rican|Panamanian|Brazilian|Galician|Asturian|Canarian|Andalusian|Basque|Catalan/i,
};
// Provisional style ids for the 13 v1 traditions in docs/research/hand-traditions.md §8.
const TRADITIONS = new Set([
  'english-roundhand', 'american-business', 'german-kurrent', 'sutterlin', 'austrian-1969', 'french-school',
  'spanish-letra-espanola', 'italian-chancery', 'dutch-running', 'polish-copperplate', 'norwegian-roundhand',
  'modern-adult', 'vietnamese-chu-thao',
]);
const BCP47 = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;
const OPEN_LICENCE = /^(CC0|CC BY(-SA)?( \d\.\d)?|Public Domain( Mark)?|PDM|Open Government Licence)/i;
const US_PRINTED_BEFORE = 1931; // U1
const US_UNPUBLISHED_FROM = 2003; // U2: made public in 2003 or later
const US_UNKNOWN_AUTHOR_BEFORE = 1906; // U2 with no known death year: 120 years from creation
const EU_DIED_BEFORE = 1956; // E1
const EU_PUBLICATION_RIGHT_FROM = 2001; // 25-year right for first publishing an old unpublished work

const words = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const errors = [];
const warns = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warns.push(`${id}: ${msg}`);

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isYear = (v) => Number.isInteger(v) && v > 0 && v < 2100;

function checkRights(e, id) {
  const r = e.rights;
  if (!r || typeof r.us !== 'boolean' || typeof r.eu !== 'boolean' || !isStr(r.basis)) {
    return err(id, 'rights needs { us: boolean, eu: boolean, basis: string }');
  }
  const pub = r.firstPublished; // null = never published (e.g. read from an openly licensed archive image)
  if (pub !== null && !isYear(pub)) return err(id, 'rights.firstPublished must be a year (or null if never published)');
  const died = isYear(r.authorDied) ? r.authorDied : isYear(r.authorDiedBy) ? r.authorDiedBy : null;
  if (died === null && r.anonymous !== true) err(id, 'rights needs authorDied, authorDiedBy (upper bound) or anonymous: true');
  if (pub !== null && isYear(e.year) && pub < e.year) err(id, 'first published before it was written?');

  const unpublishedLong = pub === null || pub >= US_UNPUBLISHED_FROM;
  const usOK = (pub !== null && pub < US_PRINTED_BEFORE)
    || (unpublishedLong && ((died !== null && died < EU_DIED_BEFORE) || (died === null && e.year < US_UNKNOWN_AUTHOR_BEFORE)));
  const euOK = (died !== null && died < EU_DIED_BEFORE) || (r.anonymous === true && pub !== null && pub < EU_DIED_BEFORE);
  if (r.us !== usOK) err(id, `rights.us=${r.us} but the recorded facts say ${usOK} (firstPublished ${pub}, died ${died})`);
  if (r.eu !== euOK) err(id, `rights.eu=${r.eu} but the recorded facts say ${euOK} (died ${died}, anonymous ${!!r.anonymous})`);

  // EU publication right: a first publication from 2001 on must be openly licensed.
  if (pub === null || pub >= EU_PUBLICATION_RIGHT_FROM) {
    const lic = e.source?.licence;
    if (!isStr(lic) || !OPEN_LICENCE.test(lic) || /\b(NC|ND)\b/.test(lic)) {
      err(id, `first made public ${pub ?? '(never)'}: needs source.licence to be an open licence (got "${lic ?? ''}")`);
    }
  }
  if (e.enabled && !(r.us && r.eu)) err(id, 'enabled but not public domain in both the US and the EU');
}

function checkEntry(e, i, core) {
  const id = isStr(e?.id) ? e.id : `#${i}`;
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return err(id, 'entry is not an object');

  if (!isStr(e.id)) err(id, 'missing id');
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) err(id, 'id must be lowercase kebab-case');
  if (!isStr(e.text)) err(id, 'missing text');
  if (!KINDS.has(e.kind)) err(id, `kind must be one of ${[...KINDS].join(', ')}`);
  if (!isStr(e.lang) || !BCP47.test(e.lang)) err(id, `lang "${e.lang}" is not a BCP-47 tag like "en-GB" or "fr"`);
  if (e.title !== undefined && !isStr(e.title)) err(id, 'title must be a non-empty string when present');
  if (!isStr(e.author)) err(id, 'missing author');
  if (!isYear(e.year)) err(id, 'year must be an integer');
  if (!e.source || !isStr(e.source.name) || !isStr(e.source.url) || !/^https?:\/\//.test(e.source.url)) {
    err(id, 'source needs { name, url } with an http(s) url');
  }
  if (e.writer !== undefined) {
    const w = e.writer;
    if (typeof w !== 'object' || w === null) err(id, 'writer must be an object { gender?, heritage?, basis? }');
    else {
      if (w.gender !== undefined && !['f', 'm'].includes(w.gender)) err(id, 'writer.gender must be "f" or "m" (leave it out if the source does not say)');
      if (w.heritage !== undefined && !isStr(w.heritage)) err(id, 'writer.heritage must be a non-empty string when present');
    }
  }
  if (!ORIGINS.has(e.origin)) err(id, `origin must be one of ${[...ORIGINS].join(', ')}`);
  if (!isStr(e.story)) err(id, 'missing story (one true sentence about where the letter came from)');
  else if (words(e.story) > 45) warn(id, `story is ${words(e.story)} words (keep it to one sentence)`);
  for (const f of ['place', 'recipient']) if (e[f] !== undefined && !isStr(e[f])) err(id, `${f} must be a non-empty string when present`);
  if (!Array.isArray(e.tags) || e.tags.some((t) => !isStr(t))) err(id, 'tags must be an array of strings');
  if (e.traditions !== undefined) {
    if (!Array.isArray(e.traditions)) err(id, 'traditions must be an array');
    else for (const t of e.traditions) if (!TRADITIONS.has(t)) warn(id, `unknown tradition id "${t}"`);
  }
  if (e.olderHandsOnly !== undefined && typeof e.olderHandsOnly !== 'boolean') err(id, 'olderHandsOnly must be true or false');
  if (isYear(e.year) && e.year < 1700 && e.olderHandsOnly !== true) warn(id, 'written before 1700: set olderHandsOnly (very old spellings go with older-looking hands)');
  if (typeof e.enabled !== 'boolean') err(id, 'enabled must be true or false');
  if (!e.enabled && !isStr(e.disabledReason)) warn(id, 'disabled without a disabledReason');

  checkRights(e, id);
  if (e.translator !== undefined && e.translator !== null) {
    const t = e.translator;
    if (!isStr(t.name) || !isYear(t.died) || !isYear(t.published)) err(id, 'translator needs { name, died, published }');
    else if (e.enabled && !(t.died < EU_DIED_BEFORE && t.published < US_PRINTED_BEFORE)) {
      err(id, `translation not cleared (translator died ${t.died}, published ${t.published})`);
    }
  }

  if (!isStr(e.text)) return;
  const n = words(e.text);
  if (n > 90) err(id, `${n} words (max 90)`);
  else if (n < 8) err(id, `${n} words (min 8)`);
  else if (n < 15) warn(id, `${n} words (a one-liner; fine if rare)`);
  const lines = e.text.split('\n').filter((l) => l.trim());
  if (lines.length > 12) warn(id, `${lines.length} lines (aim for 12 or fewer)`);
  if (e.text.split('\n').some((l) => l !== l.trim())) warn(id, 'a line has leading or trailing spaces');
  if (/\n[ \t]*\n[ \t]*\n/.test(e.text)) warn(id, 'more than one blank line between paragraphs');
  if (/^\s|\s$/.test(e.text)) warn(id, 'text starts or ends with whitespace');
  if (e.layout !== undefined && !['source', 'inferred'].includes(e.layout)) err(id, 'layout must be "source" or "inferred"');

  const bad = [...new Set([...e.text].filter((c) => c !== '\n' && !core.has(c)))];
  if (bad.length) {
    const list = bad.map((c) => `${c} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(', ');
    if (e.enabled) err(id, `characters outside GF Latin Core: ${list}`);
    else warn(id, `(disabled) needs characters outside GF Latin Core: ${list}`);
  }
  return n;
}

// ---------- run ----------
const { core, source } = await loadCore();
let data;
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`ERROR: cannot read ${path.relative(process.cwd(), FILE)}: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(data)) {
  console.error('ERROR: sample-texts.json must be a JSON array');
  process.exit(1);
}

const seenId = new Map();
const seenText = new Map();
const wordCounts = [];
data.forEach((e, i) => {
  const n = checkEntry(e, i, core);
  if (n && e.enabled) wordCounts.push(n);
  if (isStr(e?.id)) {
    if (seenId.has(e.id)) err(e.id, `duplicate id (entries #${seenId.get(e.id)} and #${i})`);
    else seenId.set(e.id, i);
  }
  if (isStr(e?.text)) {
    const key = e.text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (seenText.has(key)) err(e.id, `same text as ${seenText.get(key)}`);
    else seenText.set(key, e.id);
  }
});

// ordinary-people share
const enabled = data.filter((e) => e.enabled);
const ordinary = enabled.filter((e) => e.origin && e.origin !== 'notable').length;
const share = enabled.length ? ordinary / enabled.length : 0;
if (share < ORDINARY_MIN) {
  errors.push(`collection: only ${ordinary}/${enabled.length} enabled items (${Math.round(share * 100)}%) are by ordinary people; need at least ${ORDINARY_MIN * 100}%`);
}

// inclusion targets
const women = enabled.filter((e) => e.writer?.gender === 'f').length;
const men = enabled.filter((e) => e.writer?.gender === 'm').length;
if (enabled.length && women / enabled.length < WOMEN_MIN) {
  errors.push(`collection: ${women}/${enabled.length} enabled items (${Math.round((100 * women) / enabled.length)}%) are by women; need at least ${Math.round(WOMEN_MIN * 100)}%`);
}
// A letter written in Spanish (or Brazilian Portuguese) is by a Hispanic / Latin American writer by definition, so the
// language counts too; heritage is only recorded where the source states it.
const inGroup = (g, e) => GROUPS[g].test(e.writer?.heritage || '')
  || (g === 'Hispanic or Latin American' && (/^es(-|$)/.test(e.lang || '') || e.lang === 'pt-BR'));
const groupCounts = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, enabled.filter((e) => inGroup(g, e)).length]));
for (const [g, n] of Object.entries(groupCounts)) if (n < GROUP_MIN) errors.push(`collection: ${n} enabled items by ${g} writers; need at least ${GROUP_MIN}`);

// ---------- summary ----------
const count = (arr, f) => arr.reduce((m, e) => ((m[f(e)] = (m[f(e)] || 0) + 1), m), {});
const fmt = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const en = enabled.filter((e) => e.lang?.startsWith('en')).length;
const sorted = [...wordCounts].sort((a, b) => a - b);

console.log(`sample-texts.json: ${data.length} items, ${enabled.length} enabled, ${data.length - enabled.length} disabled`);
console.log(`character set: ${source}, ${core.size} characters`);
console.log(`ordinary people (enabled): ${ordinary}/${enabled.length} = ${pct(ordinary, enabled.length)}% (minimum ${ORDINARY_MIN * 100}%)`);
console.log(`origins (enabled): ${fmt(count(enabled, (e) => e.origin))}`);
console.log(`women (enabled): ${women}/${enabled.length} = ${pct(women, enabled.length)}% (minimum ${Math.round(WOMEN_MIN * 100)}%); men ${men}; not stated ${enabled.length - women - men}`);
for (const [g, n] of Object.entries(groupCounts)) console.log(`${g} writers (enabled): ${n} (minimum ${GROUP_MIN})`);
console.log(`kinds (enabled): ${fmt(count(enabled, (e) => e.kind))}`);
const withParas = enabled.filter((e) => /\n\n/.test(e.text || '')).length;
console.log(`layout (enabled): ${withParas} with paragraph breaks; ${fmt(count(enabled, (e) => e.layout || 'not recorded'))}`);
console.log(`languages (enabled): ${fmt(count(enabled, (e) => e.lang?.split('-')[0]))}`);
console.log(`English share (enabled): ${en}/${enabled.length} = ${pct(en, enabled.length)}%`);
console.log(`writers (enabled): ${new Set(enabled.map((e) => e.author)).size} distinct`);
if (sorted.length) console.log(`words (enabled): min ${sorted[0]}, median ${sorted[Math.floor(sorted.length / 2)]}, max ${sorted.at(-1)}`);
if (LIST) for (const e of enabled) console.log(`  ${e.id.padEnd(34)} ${String(words(e.text)).padStart(3)}w  ${(e.origin || '').padEnd(11)} ${e.lang.padEnd(6)} ${e.author}`);

for (const w of warns) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `\n${errors.length} error(s), ${warns.length} warning(s)` : `\nOK (${warns.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
