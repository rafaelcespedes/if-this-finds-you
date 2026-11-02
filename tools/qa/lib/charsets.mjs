// tools/qa/lib/charsets.mjs — the character sets every hand is measured against.
//
// GF Latin Kernel (116) is exact: it is fully listed in docs/character-set.md
//   = printable ASCII U+0020–U+007E (95) + the 21 extras in the table there.
//
// GF Latin Core is DERIVED, because the official googlefonts/glyphsets list is not in this repo.
// docs/character-set.md names the official total (324), the target languages, the special letters,
// the accent marks and the extra punctuation. From that:
//   1. Kernel (116)
//   2. Latin-1 Supplement U+00A1–U+00FF (95, of which 9 are already Kernel extras -> 86 new):
//      Western European letters, ¡ ¿ « » § ¶ ª º, ´ ¨ ¸ ¯ ...
//   3. Latin Extended-A U+0100–U+017F (128), minus 33 letters only needed outside the named languages:
//        Esperanto  Ĉĉ Ĝĝ Ĥĥ Ĵĵ Ŝŝ · Welsh Ŵŵ Ŷŷ · tilde Ĩĩ Ũũ · breve Ĕĕ Ĭĭ Ŏŏ Ŭŭ
//        Sami Ŋŋ Ŧŧ · obsolete ĸ ŉ ſ                                             -> 95 kept
//      (Catalan Ŀŀ and Dutch Ĳĳ are kept because both languages are named.)
//   4. Romanian comma-below Ș ș Ț ț (U+0218–U+021B), dotless ȷ (U+0237), capital sharp s ẞ (U+1E9E)
//   5. The spacing accent marks named in the doc that are not already in Latin-1: ˆ ˇ ˘ ˙ ˚ ˛ ˜ ˝
//   6. The punctuation named in the doc that is not already in Latin-1: ‚ „ ‹ ›
// That gives 116 + 86 + 95 + 6 + 8 + 4 = 315, nine short of the official 324. The gap is most likely
// a few letters excluded in step 3 (e.g. Esperanto) or symbols the doc doesn't name.
// To use the official list instead, put a file at tools/qa/data/gf-latin-core.txt containing the
// characters, `U+XXXX` or `0xXXXX` tokens (any layout); it replaces the derived list.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i));

export const ASCII = range(0x20, 0x7e);
export const KERNEL_EXTRAS = ['‘', '’', '“', '”', '–', '—', '−', '…', '•', '·', '€', '£', '¥', '¢', '©', '®', '™', '°', '×', '÷', ' '];
export const KERNEL = [...ASCII, ...KERNEL_EXTRAS];

const EXT_A_EXCLUDED = new Set([...'ĈĉĜĝĤĥĴĵŜŝŴŵŶŷĨĩŨũĔĕĬĭŎŏŬŭŊŋŦŧĸŉſ']);

function derivedCore() {
  const set = new Set(KERNEL);
  for (const c of range(0xa1, 0xff)) set.add(c);
  for (const c of range(0x100, 0x17f)) if (!EXT_A_EXCLUDED.has(c)) set.add(c);
  for (const c of ['Ș', 'ș', 'Ț', 'ț', 'ȷ', 'ẞ']) set.add(c);
  for (const c of ['ˆ', 'ˇ', '˘', '˙', '˚', '˛', '˜', '˝']) set.add(c);
  for (const c of ['‚', '„', '‹', '›']) set.add(c);
  return [...set];
}

function officialCore() {
  const f = path.join(here, '..', 'data', 'gf-latin-core.txt');
  if (!fs.existsSync(f)) return null;
  const txt = fs.readFileSync(f, 'utf8');
  const set = new Set();
  for (const m of txt.matchAll(/(?:U\+|0x)([0-9A-Fa-f]{4,6})/g)) set.add(String.fromCodePoint(parseInt(m[1], 16)));
  if (!set.size) for (const ch of txt) if (!/\s/.test(ch) || ch === ' ') set.add(ch);
  return [...set];
}

const official = officialCore();
export const CORE = official || derivedCore();
export const CORE_SOURCE = official ? 'official list from tools/qa/data/gf-latin-core.txt' : 'derived (see tools/qa/lib/charsets.mjs)';

// Group a list of characters for compact reporting.
export function groupChars(chars) {
  const groups = { 'ASCII': [], 'Kernel extras': [], 'Latin-1': [], 'Latin Ext-A': [], 'Other': [] };
  for (const c of chars) {
    const u = c.codePointAt(0);
    if (u <= 0x7e) groups['ASCII'].push(c);
    else if (KERNEL_EXTRAS.includes(c)) groups['Kernel extras'].push(c);
    else if (u <= 0xff) groups['Latin-1'].push(c);
    else if (u <= 0x17f) groups['Latin Ext-A'].push(c);
    else groups['Other'].push(c);
  }
  return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length));
}
