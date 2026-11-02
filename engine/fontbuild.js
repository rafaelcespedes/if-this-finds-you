// fontbuild.js — turn a hand into an installable OpenType (CFF) font with opentype.js.
//
// - Every character the hand can write gets a default glyph.
// - Letters and digits get extra alternates: a, a.alt1, a.alt2 (each a different sample of the hand).
// - GSUB is written by hand (opentype.js has no high-level API for contextual lookups, but its
//   writer does serialise lookup type 6 format 3), so the font ships with:
//     calt  — cycles default -> alt1 -> alt2 along each run of letters (on by default in most apps)
//     salt  — type-3 alternate lookup (pick alternates in apps with a glyph palette)
//     ss01  — all letters -> .alt1,  ss02 — all letters -> .alt2
// Pass the opentype.js module in (browser global or import) — the engine doesn't bundle it.

import { rng } from './core.js';
import { makeGlyph, has, isLower, isUpper, isDigit } from './hand.js';
import { simplify } from './pen.js';
import { EXTRAS } from './sources/extras.js';

const AGL = {
  ' ': 'space', '!': 'exclam', '"': 'quotedbl', '#': 'numbersign', '$': 'dollar', '%': 'percent',
  '&': 'ampersand', "'": 'quotesingle', '(': 'parenleft', ')': 'parenright', '*': 'asterisk',
  '+': 'plus', ',': 'comma', '-': 'hyphen', '.': 'period', '/': 'slash', '0': 'zero', '1': 'one',
  '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight',
  '9': 'nine', ':': 'colon', ';': 'semicolon', '<': 'less', '=': 'equal', '>': 'greater',
  '?': 'question', '@': 'at', '[': 'bracketleft', '\\': 'backslash', ']': 'bracketright',
  '^': 'asciicircum', '_': 'underscore', '`': 'grave', '{': 'braceleft', '|': 'bar',
  '}': 'braceright', '~': 'asciitilde',
  '\u2018': 'quoteleft', '\u2019': 'quoteright', '\u201C': 'quotedblleft', '\u201D': 'quotedblright',
  '\u2013': 'endash', '\u2014': 'emdash', '\u2212': 'minus', '\u2026': 'ellipsis', '\u2022': 'bullet',
  '\u00B7': 'periodcentered', '\u20AC': 'Euro', '\u00A3': 'sterling', '\u00A5': 'yen', '\u00A2': 'cent',
  '\u00A9': 'copyright', '\u00AE': 'registered', '\u2122': 'trademark', '\u00B0': 'degree',
  '\u00D7': 'multiply', '\u00F7': 'divide', '\u00A0': 'uni00A0',
};
export const glyphName = (ch) => AGL[ch] || (/^[A-Za-z0-9]$/.test(ch) ? ch : 'uni' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));

function toPath(opentype, contours, tol) {
  const path = new opentype.Path();
  for (const c0 of contours) {
    const c = simplify(c0, tol).slice().reverse(); // CFF: counter-clockwise outers
    if (c.length < 3) continue;
    path.moveTo(Math.round(c[0][0]), Math.round(c[0][1]));
    for (let i = 1; i < c.length; i++) path.lineTo(Math.round(c[i][0]), Math.round(c[i][1]));
    path.close();
  }
  return path;
}

function safeName(s) {
  return String(s).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'hand';
}

/**
 * @param opentype  the opentype.js module
 * @param params    effective hand params (withOverrides(...))
 * @param opts      { alts: 3, calt: true }
 * @returns { font, buffer, info }
 */
export function buildFont(opentype, params, opts) {
  opts = Object.assign({ alts: 3, calt: true, tolerance: 0.9 }, opts || {});
  const glyphs = [];
  const notdef = new opentype.Path();
  notdef.moveTo(60, 0); notdef.lineTo(60, 700); notdef.lineTo(440, 700); notdef.lineTo(440, 0); notdef.close();
  notdef.moveTo(100, 40); notdef.lineTo(400, 40); notdef.lineTo(400, 660); notdef.lineTo(100, 660); notdef.close();
  glyphs.push(new opentype.Glyph({ name: '.notdef', unicode: undefined, advanceWidth: 500, path: notdef }));

  // ASCII first (alternate IDs must ascend in the same order), then every other character this hand can write
  const chars = [];
  for (let c = 32; c < 127; c++) chars.push(String.fromCharCode(c));
  for (const ch of opts.extraChars || EXTRAS) if (has(params, ch) && !chars.includes(ch)) chars.push(ch);
  const hasAlts = (ch) => isLower(ch) || isUpper(ch) || isDigit(ch);
  const index = {}; // name -> glyph index
  let yMin = 0, yMax = 0;

  const spaceScale = [1, 0.86, 1.16]; // space alternates double as word-spacing variation
  function addGlyph(name, unicode, ch, k) {
    const inst = ch === ' ' ? null : { seed: 'alt' + k + ':' + ch, amount: 1, baseline: true };
    const g = makeGlyph(params, ch, inst);
    let adv = g.advance;
    if (ch === ' ') adv = g.advance * (params.wordSpace || 1) * spaceScale[k];
    const path = ch === ' ' ? new opentype.Path() : toPath(opentype, g.contours, opts.tolerance);
    for (const c of g.contours) for (const q of c) { if (q[1] < yMin) yMin = q[1]; if (q[1] > yMax) yMax = q[1]; }
    index[name] = glyphs.length;
    glyphs.push(new opentype.Glyph({ name, unicode, advanceWidth: Math.max(0, Math.round(adv)), path }));
  }
  for (const ch of chars) addGlyph(glyphName(ch), ch.codePointAt(0), ch, 0);
  // letters, digits and the space all get alternates; the space ones are blank but carry the cycle
  const altChars = chars.filter((ch) => ch === ' ' || hasAlts(ch));
  for (let k = 1; k < opts.alts; k++) for (const ch of altChars) addGlyph(glyphName(ch) + '.alt' + k, undefined, ch, k);

  const fam = 'Seedhand ' + safeName(params.seed);
  const font = new opentype.Font({
    familyName: fam,
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: Math.max(900, Math.ceil(yMax + 20)),
    descender: Math.min(-300, Math.floor(yMin - 20)),
    designer: 'Seedhand spike',
    description: 'Generated from seed "' + params.seed + '" (' + params.style + '). Skeletons: Hershey fonts.',
    copyright: 'Generated handwriting font. Glyph skeletons derived from the Hershey fonts (Dr. A. V. Hershey, U.S. NBS; .jhf by James Hurt).',
    version: '0.1',
    glyphs,
  });

  let gsubInfo = 'none';
  if (opts.alts >= 3) {
    // glyph sets aligned by character; IDs ascend because glyphs were added in ASCII order
    const set = [];
    for (let k = 0; k < 3; k++) set.push(altChars.map((ch) => index[glyphName(ch) + (k ? '.alt' + k : '')]));
    const cov = (g) => ({ format: 1, glyphs: g.slice() });
    // Each hand gets its own step pattern: a letter steps the variant state by +1 or +2.
    const hr = rng('calt:' + params.seed);
    const step = altChars.map((ch) => (ch === ' ' ? 0 : hr() < 0.5 ? 0 : 1));
    const caltRules = [];
    for (let s = 0; s < 3; s++) for (let c = 0; c < 2; c++) {
      const j = (s + 1 + c) % 3;                  // never equal to s -> neighbours always differ
      if (j === 0) continue;                      // stays default
      const input = set[0].filter((_, i) => step[i] === c);
      if (!input.length) continue;
      caltRules.push({ substFormat: 3, backtrackCoverage: [cov(set[s])], inputCoverage: [cov(input)], lookaheadCoverage: [],
        lookupRecords: [{ sequenceIndex: 0, lookupListIndex: j - 1 }] });
    }
    const lookups = [
      // 0: default -> alt1   (single substitution, format 2)
      { lookupType: 1, lookupFlag: 0, subtables: [{ substFormat: 2, coverage: cov(set[0]), substitute: set[1].slice() }] },
      // 1: default -> alt2
      { lookupType: 1, lookupFlag: 0, subtables: [{ substFormat: 2, coverage: cov(set[0]), substitute: set[2].slice() }] },
      // 2: calt (chaining context, format 3). Backtrack sees glyphs this lookup already replaced,
      //    so the variant "state" (0/1/2) walks along the line, through spaces, never repeating
      //    between neighbours, and depends on which letters came before.
      { lookupType: 6, lookupFlag: 0, subtables: caltRules },
      // 3: salt — alternate substitution (type 3)
      { lookupType: 3, lookupFlag: 0, subtables: [{ substFormat: 1, coverage: cov(set[0]), alternateSets: set[0].map((_, i) => [set[1][i], set[2][i]]) }] },
    ];
    const features = [];
    if (opts.calt) features.push({ tag: 'calt', feature: { featureParams: 0, lookupListIndexes: [2] } });
    features.push({ tag: 'salt', feature: { featureParams: 0, lookupListIndexes: [3] } });
    features.push({ tag: 'ss01', feature: { featureParams: 0, lookupListIndexes: [0] } });
    features.push({ tag: 'ss02', feature: { featureParams: 0, lookupListIndexes: [1] } });
    const langSys = () => ({ reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: features.map((_, i) => i) });
    font.tables.gsub = {
      version: 1,
      scripts: [
        { tag: 'DFLT', script: { defaultLangSys: langSys(), langSysRecords: [] } },
        { tag: 'latn', script: { defaultLangSys: langSys(), langSysRecords: [] } },
      ],
      features,
      lookups,
    };
    gsubInfo = features.map((f) => f.tag).join(', ');
  }

  const buffer = font.toArrayBuffer();
  return {
    font, buffer,
    info: { glyphs: glyphs.length, alternates: opts.alts, features: gsubInfo, bytes: buffer.byteLength, family: fam },
  };
}

// Re-parse the bytes and report what's really in the file.
export function verify(opentype, buffer) {
  const f = opentype.parse(buffer);
  const gsub = f.tables.gsub;
  const feats = gsub ? gsub.features.map((x) => x.tag) : [];
  const types = gsub ? gsub.lookups.map((l) => l.lookupType) : [];
  return {
    ok: f.glyphs.length > 0 && !!f.tables.cff,
    glyphs: f.glyphs.length,
    family: f.names.fontFamily && f.names.fontFamily.en,
    features: feats,
    lookupTypes: types,
    outlines: f.outlinesFormat,
  };
}

