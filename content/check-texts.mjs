#!/usr/bin/env node
// content/check-texts.mjs — validates content/sample-texts.json. Plain Node (>= 18), no installs.
//
//   node content/check-texts.mjs            check, print a summary, exit 1 on any ERROR
//   node content/check-texts.mjs --list     also print every enabled item (id, words, author)
//
// What it checks:
//   - the file is a JSON array and every entry has the right fields and types
//   - ids are unique, lowercase kebab-case; texts are not duplicated
//   - word count: 15–90 words (ERROR above 90 or below 8; WARN for 8–14, a few one-liners are fine)
//   - line count: at most 12 written lines (WARN above)
//   - characters: every ENABLED item uses only GF Latin Core plus a line break. The set is imported from
//     tools/qa/lib/charsets.mjs (the same derived list the engine QA uses); if that file is missing, the same
//     derivation runs here. Disabled items (e.g. Vietnamese, waiting for Tier-3 stacked tones) are reported, not failed.
//   - rights: every ENABLED item must be public domain in BOTH the US and the EU, and the booleans must agree with
//     the recorded dates: US = rights.firstPublished before 1931; EU = rights.authorDied (or rights.authorDiedBy,
//     an upper bound when the exact year is unknown) before 1956 (life + 70).
//     A translation also needs translator.died < 1956 and translator.published < 1931.
//   - traditions: ids must be from the known list below (WARN otherwise)

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
// Provisional style ids for the 13 v1 traditions in docs/research/hand-traditions.md §8.
const TRADITIONS = new Set([
  'english-roundhand', 'american-business', 'german-kurrent', 'sutterlin', 'austrian-1969', 'french-school',
  'spanish-letra-espanola', 'italian-chancery', 'dutch-running', 'polish-copperplate', 'norwegian-roundhand',
  'modern-adult', 'vietnamese-chu-thao',
]);
const BCP47 = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;
const US_CUTOFF = 1931; // first published before this year
const EU_CUTOFF = 1956; // author died before this year

const words = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const errors = [];
const warns = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warns.push(`${id}: ${msg}`);

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isYear = (v) => Number.isInteger(v) && v > 0 && v < 2100;

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
  if (!Array.isArray(e.tags) || e.tags.some((t) => !isStr(t))) err(id, 'tags must be an array of strings');
  if (e.traditions !== undefined) {
    if (!Array.isArray(e.traditions)) err(id, 'traditions must be an array');
    else for (const t of e.traditions) if (!TRADITIONS.has(t)) warn(id, `unknown tradition id "${t}"`);
  }
  if (typeof e.enabled !== 'boolean') err(id, 'enabled must be true or false');

  // rights
  const r = e.rights;
  if (!r || typeof r.us !== 'boolean' || typeof r.eu !== 'boolean' || !isStr(r.basis)) {
    err(id, 'rights needs { us: boolean, eu: boolean, basis: string }');
  } else {
    if (!isYear(r.firstPublished)) err(id, 'rights.firstPublished (year) is required to verify the US rule');
    else if (r.us !== r.firstPublished < US_CUTOFF) err(id, `rights.us=${r.us} disagrees with firstPublished ${r.firstPublished}`);
    // authorDied: the death year. authorDiedBy: an upper bound when the exact year is unknown (e.g. a 1613 letter-writer).
    const died = isYear(r.authorDied) ? r.authorDied : r.authorDiedBy;
    if (!isYear(died)) err(id, 'rights.authorDied (or authorDiedBy, an upper bound) is required to verify the EU rule');
    else if (r.eu !== died < EU_CUTOFF) err(id, `rights.eu=${r.eu} disagrees with the author's death year ${died}`);
    if (isYear(r.firstPublished) && isYear(e.year) && r.firstPublished < e.year) err(id, 'first published before it was written?');
    if (e.enabled && !(r.us && r.eu)) err(id, 'enabled but not public domain in both the US and the EU');
  }
  if (e.translator !== undefined && e.translator !== null) {
    const t = e.translator;
    if (!isStr(t.name) || !isYear(t.died) || !isYear(t.published)) err(id, 'translator needs { name, died, published }');
    else if (e.enabled && !(t.died < EU_CUTOFF && t.published < US_CUTOFF)) {
      err(id, `translation not cleared (translator died ${t.died}, published ${t.published})`);
    }
  }

  if (!isStr(e.text)) return;
  // length
  const n = words(e.text);
  if (n > 90) err(id, `${n} words (max 90)`);
  else if (n < 8) err(id, `${n} words (min 8)`);
  else if (n < 15) warn(id, `${n} words (a one-liner; fine if rare)`);
  const lines = e.text.split('\n');
  if (lines.length > 12) warn(id, `${lines.length} lines (aim for 12 or fewer)`);
  if (lines.some((l) => l !== l.trim())) warn(id, 'a line has leading or trailing spaces');
  if (/\n\s*\n/.test(e.text)) warn(id, 'empty line inside the text');

  // characters
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
  if (n) wordCounts.push(n);
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

// ---------- summary ----------
const enabled = data.filter((e) => e.enabled);
const count = (arr, f) => arr.reduce((m, e) => ((m[f(e)] = (m[f(e)] || 0) + 1), m), {});
const fmt = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const en = enabled.filter((e) => e.lang?.startsWith('en')).length;
const sorted = [...wordCounts].sort((a, b) => a - b);

console.log(`sample-texts.json: ${data.length} items, ${enabled.length} enabled, ${data.length - enabled.length} disabled`);
console.log(`character set: ${source}, ${core.size} characters`);
console.log(`kinds (enabled): ${fmt(count(enabled, (e) => e.kind))}`);
console.log(`languages (enabled): ${fmt(count(enabled, (e) => e.lang?.split('-')[0]))}`);
console.log(`English share (enabled): ${en}/${enabled.length} = ${pct(en, enabled.length)}%`);
console.log(`authors: ${new Set(data.map((e) => e.author)).size} distinct`);
if (sorted.length) console.log(`words: min ${sorted[0]}, median ${sorted[Math.floor(sorted.length / 2)]}, max ${sorted.at(-1)}`);
if (LIST) for (const e of enabled) console.log(`  ${e.id.padEnd(34)} ${String(words(e.text)).padStart(3)}w  ${e.lang.padEnd(6)} ${e.author}`);

for (const w of warns) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `\n${errors.length} error(s), ${warns.length} warning(s)` : `\nOK (${warns.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
