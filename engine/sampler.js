// sampler.js — the New hand sampler: which seed to show next (docs/research/controls-and-feel.md §5).
//
// The seed -> hand mapping stays makeHand's, so share links and determinism survive. All the selection logic
// here only decides which seed comes next:
//   1. family: print or joined, at random unless the UI pins it (long runs of one family are broken up)
//   2. archetype bag: no archetype repeats within the last 6 hands shown (a history randomizer, like Tetris)
//   3. 12 candidate seeds of that archetype; keep the one farthest from the last 6 hands (farthest-point)
//   4. legibility cap: a chaos budget on messiness, speed, tremor, extreme slant and proportions
//   5. Variety: 'sibling' (a close relative of the last hand), 'stranger' (default), 'wild' (extremes welcome)
// Pure: the same opts give the same pick. The UI passes fresh `entropy` (any string) on each click.

import { rng, clamp } from './core.js';
import { makeHand, archetypeOf, latentOf, baseSeed, ARCHETYPES } from './hand.js';
import { describeHabits, families, getStyle } from './glyphs.js';

export const VARIETY = {
  sibling: { label: 'Sibling', note: 'a close relative of the current hand' },
  stranger: { label: 'Stranger', note: 'someone new, clearly different from the last few hands', budget: 1.55, dMin: 0.55 },
  wild: { label: 'Wild', note: 'anyone, extremes and rare letter forms welcome', budget: 2.25, dMin: 0.5 },
};

const WORDS_A = ['maple', 'quiet', 'amber', 'salt', 'river', 'paper', 'velvet', 'cedar', 'misty', 'lunar', 'honey', 'wild', 'copper', 'olive', 'north', 'ink', 'soft', 'linen', 'ember', 'fern', 'pale', 'brisk', 'dusky', 'sable', 'tawny', 'bright', 'still', 'rusty', 'mossy', 'winter'];
const WORDS_B = ['river', 'harbor', 'sparrow', 'meadow', 'lantern', 'pebble', 'orchard', 'comet', 'thistle', 'willow', 'canyon', 'heron', 'garden', 'atlas', 'quill', 'moth', 'tide', 'birch', 'kettle', 'fable', 'finch', 'ledger', 'lark', 'harvest', 'cobble', 'ferry', 'aster', 'beacon', 'hollow', 'parcel'];
// A fresh, readable seed: 'amber-comet-12'
export function seedFrom(r) {
  const a = WORDS_A[Math.floor(r() * WORDS_A.length)];
  let b = WORDS_B[Math.floor(r() * WORDS_B.length)];
  if (b === a) b = WORDS_B[(WORDS_B.indexOf(b) + 1) % WORDS_B.length];
  return `${a}-${b}-${10 + Math.floor(r() * 90)}`;
}

// Letters whose construction people notice first, weighted roughly by how often they appear in text.
const FREQ = { e: 12, t: 9, a: 8, r: 6, s: 6, g: 2, f: 2.2, k: 0.8, y: 2, z: 0.3, d: 4, 1: 1.5, 7: 1, 4: 1, 9: 0.8, A: 0.6, E: 0.5, F: 0.3, G: 0.3, M: 0.4, Q: 0.1, R: 0.4, T: 0.9 };
const FREQ_SUM = Object.values(FREQ).reduce((a, b) => a + b, 0);

// What you notice at a glance about a writer, normalised to 0..1 per trait.
function profile(h) {
  const letters = describeHabits(h, Object.keys(FREQ)).letters;
  return {
    seed: h.seed, family: h.family, style: h.style, archetype: h.archetype,
    // a letter mostly taken from the second school counts as that school's form
    letters: Object.fromEntries(Object.keys(FREQ).map((c) => [c, !letters[c] ? '-' : letters[c].blend && letters[c].blend.t >= 0.5 ? letters[c].blend.toward : letters[c].main])),
    blend: h.blend || 0,
    // traits other modules add to every hand (addHandTraits, e.g. style dimensions), when they are numbers in
    // -1..1 (movement: loops, joinLength, rhythm...) or 0..1 (lifts); compared on a 0..1 scale
    extra: Object.fromEntries(addedNumbers(h).map((k) => [k, h[k] < 0 || k in NEG ? (h[k] + 1) / 2 : h[k]])),
    slant: clamp((h.slant + 15) / 45, 0, 1),
    size: h.family === 'script' ? clamp((h.xHeight - 0.36) / 0.26, 0, 1) : clamp((h.xHeight - 0.42) / 0.36, 0, 1),
    width: h.family === 'script' ? clamp((h.width - 0.72) / 0.52, 0, 1) : clamp((h.width - 0.6) / 0.48, 0, 1),
    weight: clamp((h.penWidth - 16) / 88, 0, 1),
    pressure: h.pressure, neatness: h.neatness, hurry: h.hurry,
    spacing: clamp((h.sidebearing - 18) / 64, 0, 1),
    round: h.roundness,
    texture: clamp((h.tremor - 0.4) / 2.8, 0, 1),
  };
}
const asHand = (x) => (x && x.habits ? x : makeHand(x.seed, x.style ? { style: x.style } : x.family || 'print'));

// Perceived distance between two writers (controls-and-feel.md §5.2 step 5 weights). About 1 = clearly different.
export function handDistance(a, b) {
  const A = a.letters ? a : profile(asHand(a)), B = b.letters ? b : profile(asHand(b));
  let construction = 0;
  if (A.family !== B.family) construction = 1;              // joined vs print: every letter is built differently
  else for (const c in FREQ) if (A.letters[c] !== B.letters[c]) construction += FREQ[c] / FREQ_SUM;
  const t = (k, w) => w * (A[k] - B[k]) ** 2;
  const d2 = 1.2 * construction ** 2 * 2.2 + (A.family !== B.family ? 1 : 0) +
    t('size', 1) + t('slant', 1) + t('width', 0.8) + t('pressure', 0.6) + t('neatness', 0.6) + t('hurry', 0.5) +
    t('weight', 0.6) + t('spacing', 0.4) + t('round', 0.3) + t('texture', 0.1) + t('blend', 0.3) + extraD2(A, B);
  return Math.sqrt(d2);
}

const NEG = {}; // keys seen below zero: compared on the -1..1 scale from then on
function addedNumbers(h) {
  const ks = (h.addedTraits || []).filter((k) => typeof h[k] === 'number' && h[k] >= -1 && h[k] <= 1);
  for (const k of ks) if (h[k] < 0) NEG[k] = true;
  return ks;
}
function extraD2(A, B) {
  let d2 = 0;
  for (const k in A.extra || {}) if (B.extra && k in B.extra) d2 += 0.5 * (A.extra[k] - B.extra[k]) ** 2;
  return d2;
}

// Legibility cap (§5.2 step 6): a writer may be messy, fast, shaky, steep or extreme in proportion, not all at once.
export function chaos(h) {
  const xhLow = h.family === 'script' ? clamp((0.44 - h.xHeight) / 0.08, 0, 1) : clamp((0.52 - h.xHeight) / 0.1, 0, 1);
  const wide = h.family === 'script' ? Math.abs(h.width - 0.98) / 0.26 : Math.abs(h.width - 0.84) / 0.24;
  return 1.1 * (1 - h.neatness) + 0.7 * h.hurry + 0.25 * (h.tremor / 3.2) + 0.9 * Math.abs(h.slant - 8) / 30 + 0.35 * wide + 0.5 * xhLow;
}

const HEADLINE = ['slant', 'size', 'width', 'weight', 'neatness', 'hurry'];

// sampleHand(opts) -> { seed, family, style, archetype, label, variety, distance }
//   opts.history: the hands shown so far, oldest first: [{ seed, family }] or seed strings (family 'print').
//                 The last 6 count. The UI keeps it and appends each pick.
//   opts.family:  'print' | 'script' to pin the family (the Print / Joined switch); omit for a random family
//   opts.variety: 'sibling' | 'stranger' (default) | 'wild'
//   opts.entropy: any string, fresh per click (a counter, a timestamp): the only source of randomness
//   opts.candidates: how many seeds to compare (default 12)
export function sampleHand(opts = {}) {
  const history = (opts.history || []).map((x) => (typeof x === 'string' ? { seed: x, family: 'print' } : x)).slice(-6);
  const variety = VARIETY[opts.variety] ? opts.variety : 'stranger';
  const r = rng('sampler:' + (opts.entropy == null ? '' : opts.entropy) + ':' + history.map((x) => x.seed + '/' + x.family).join(','));
  const fams = families();
  const last = history[history.length - 1];
  const recent = history.map((x) => profile(asHand(x)));

  // Sibling: a relative of the last hand, same family, about one notch away
  if (variety === 'sibling' && last) {
    const fam = opts.family || last.family || 'print';
    const base = baseSeed(last.seed);
    let best = null;
    for (let i = 0; i < (opts.candidates || 12); i++) {
      const seed = `${base}~${1 + Math.floor(r() * 998)}`;
      const P = profile(makeHand(seed, fam));
      const d = handDistance(P, recent[recent.length - 1]);
      const score = -Math.abs(d - 0.32);                    // close, but visibly someone else
      if (!best || score > best.score) best = { seed, family: fam, P, d, score };
    }
    return result(best, variety);
  }

  // Family: pinned, or random with long runs broken up
  let family = opts.family;
  if (!family || !fams.includes(family)) {
    const runOf = (f) => { let n = 0; for (let i = history.length - 1; i >= 0 && history[i].family === f; i--) n++; return n; };
    const pool = fams.map((f) => ({ f, weight: 1 / (1 + 1.5 * runOf(f)) }));
    family = pool.length ? r.weighted(pool).f : 'print';
  }

  // Archetype bag: none of the last hands' archetypes again
  const seen = new Set(history.map((x) => archetypeOf(x.seed).id));
  const bag = ARCHETYPES.filter((a) => !seen.has(a.id));
  const target = r.weighted(bag.length ? bag : ARCHETYPES).id;

  // Candidates of that archetype, farthest from what was just shown, within the legibility budget
  const cfg = VARIETY[variety];
  const n = opts.candidates || 12;
  const cands = [];
  for (let k = 0; cands.length < n && k < 4000; k++) {
    const seed = seedFrom(rng('sampler-seed:' + r() + ':' + k));
    if (archetypeOf(seed).id !== target) continue;
    const h = makeHand(seed, family);
    cands.push({ seed, family, h, P: profile(h), chaos: chaos(h) });
  }
  let best = null;
  for (const c of cands) {
    const ds = recent.map((P) => handDistance(c.P, P));
    const dmin = ds.length ? Math.min(...ds) : 1;
    // two big differences from the last hand: at least two headline traits apart by more than 0.35 of their range
    const big = last ? HEADLINE.filter((k) => Math.abs(c.P[k] - recent[recent.length - 1][k]) > 0.35).length + (c.P.family !== recent[recent.length - 1].family ? 2 : 0) : 2;
    let score = dmin + (big >= 2 ? 0.25 : 0) + (dmin >= cfg.dMin ? 0.25 : 0);
    if (c.chaos > cfg.budget) score -= 2 + (c.chaos - cfg.budget);
    if (variety === 'wild') {
      const L = latentOf(c.seed);
      score += 0.12 * Object.values(L).reduce((s, v) => s + Math.abs(v), 0) / 7;
    }
    if (!best || score > best.score) best = { ...c, d: dmin, score };
  }
  return result(best, variety);
}

function result(b, variety) {
  if (!b) return null;
  const arch = archetypeOf(b.seed);
  return { seed: b.seed, family: b.family, style: (b.h || makeHand(b.seed, b.family)).style, archetype: arch.id, label: arch.label, variety, distance: b.d };
}

// ---------------------------------------------------------------------------------------------------------
// The whole look: pen, tip, ink, paper, size and the sliders, chosen together so they are believable (a fountain
// pen with blue-black on Seyès, a pencil on squared paper, a fat felt tip big and loose), not dealt as noise.
// lookOf(seed, family, locked) is a pure function of the seed (and the locks), so a share link that carries the
// seed and locks reproduces the look; sampleLook() decides which seed comes next, as sampleHand() does.
// Keys follow engine/pen.js on the pens branch (PENS, TIPS, INKS); papers are keys the UI renders.
// ---------------------------------------------------------------------------------------------------------

export const LOOK_PENS = ['ballpoint', 'gel', 'fountain', 'pointed', 'italic', 'felt', 'pencil'];
export const LOOK_TIPS = ['fine', 'medium', 'bold'];
// Papers are the app's ids (app/src/lib/papers.ts, docs/research/stationery.md): a family or family-variant.
export const LOOK_PAPERS = ['pad', 'pad-uk', 'pad-binsen', 'pad-a4', 'laid', 'laid-blue', 'laid-cotton', 'airmail', 'airmail-white',
  'aerogramme', 'notebook', 'notebook-loose', 'notebook-legal', 'notebook-uk', 'notebook-fr', 'postcard', 'postcard-us', 'card', 'card-ippitsusen'];
// how common each is on its own (the app's own roll uses the same numbers)
const PAPER_BASE = { pad: 10, 'pad-uk': 5, 'pad-binsen': 2, 'pad-a4': 3, laid: 8, 'laid-blue': 3, 'laid-cotton': 3, airmail: 9, 'airmail-white': 3,
  aerogramme: 9, notebook: 4, 'notebook-loose': 4, 'notebook-legal': 3, 'notebook-uk': 2.5, 'notebook-fr': 2.5, postcard: 5, 'postcard-us': 3, card: 6, 'card-ippitsusen': 2 };
// papers that only hold so much text (characters); sampleLook({ textLength }) skips them for longer letters
const PAPER_FITS = { postcard: 360, 'postcard-us': 360, card: 420, 'card-ippitsusen': 160, aerogramme: 1500 };
// Which inks go in which pen (mirrors pen.js SPECS[pen].inks on the pens branch)
const PEN_INKS = {
  ballpoint: { 'ballpoint-blue': 50, black: 38, 'blue-black': 5, red: 4, green: 3 },
  gel: { black: 45, 'blue-black': 25, 'royal-blue': 20, red: 5, green: 5 },
  fountain: { 'blue-black': 32, 'royal-blue': 30, black: 22, sepia: 8, 'iron-gall': 6, green: 2 },
  pointed: { black: 40, 'iron-gall': 30, sepia: 20, 'blue-black': 10 },
  italic: { black: 50, sepia: 18, 'blue-black': 17, 'iron-gall': 10, red: 5 },
  felt: { black: 60, 'blue-black': 15, 'royal-blue': 12, red: 8, green: 5 },
  pencil: { graphite: 1 },
};
const INK_RGB = { 'ballpoint-blue': [38, 48, 132], 'royal-blue': [45, 82, 180], 'blue-black': [35, 50, 80], 'iron-gall': [42, 46, 66], sepia: [98, 66, 40], black: [38, 38, 46], red: [176, 36, 42], green: [30, 104, 70], graphite: [82, 82, 88] };
const PEN_TIPS = { ballpoint: { fine: 2, medium: 3, bold: 0.6 }, gel: { fine: 2, medium: 2.5, bold: 1 }, fountain: { fine: 2.2, medium: 2.5, bold: 0.8 }, pointed: { fine: 1.5, medium: 2, bold: 0.8 }, italic: { fine: 0.6, medium: 2.4, bold: 1.6 }, felt: { fine: 1.2, medium: 2.4, bold: 2.4 }, pencil: { fine: 1, medium: 3, bold: 0.8 } };
const PEN_PAPER = {
  pencil: { notebook: 2, 'notebook-loose': 2, 'notebook-legal': 1.5, 'notebook-fr': 1.2, 'notebook-uk': 1.2, card: 0.6, laid: 0.4, airmail: 0.3, 'airmail-white': 0.3 },
  fountain: { laid: 1.8, 'laid-blue': 1.5, pad: 1.5, 'pad-uk': 1.5, 'pad-binsen': 1.4, airmail: 1.3, 'notebook-fr': 1.6, card: 1.2, postcard: 0.8, notebook: 0.7, 'notebook-legal': 0.5 },
  ballpoint: { aerogramme: 2, postcard: 1.8, 'postcard-us': 1.8, notebook: 1.6, 'notebook-loose': 1.6, 'notebook-legal': 1.6, airmail: 1.2, pad: 1, 'laid-cotton': 0.5 },
  gel: { card: 1.5, 'card-ippitsusen': 1.2, pad: 1.2, notebook: 1.2, postcard: 1.2 },
  felt: { 'notebook-legal': 1.5, card: 1.2, postcard: 1, laid: 0.6, airmail: 0.3, 'airmail-white': 0.3, aerogramme: 0.5 },
  pointed: { laid: 3, 'laid-blue': 2.5, 'laid-cotton': 1.5, pad: 1, airmail: 0.4, postcard: 0.4, notebook: 0.2, 'notebook-loose': 0.2, 'notebook-legal': 0.2, aerogramme: 0.2 },
  italic: { laid: 2, 'laid-cotton': 1.5, card: 1.5, pad: 1.2, notebook: 0.3, 'notebook-legal': 0.3 },
};
// where a writer learned shows in the paper they reach for: the cahier in France, filler paper and legal pads in the
// US, the blue pad and exercise book in Britain, A4 pads in Germany, airmail home from Latin America
const SCHOOL_PAPER = {
  french: { 'notebook-fr': 4, pad: 1.3, laid: 1.2 },
  american: { notebook: 2, 'notebook-loose': 2.5, 'notebook-legal': 2, 'postcard-us': 2, card: 1.4, postcard: 0.5, 'pad-uk': 0.4, 'pad-a4': 0.3 },
  british: { 'pad-uk': 3, 'notebook-uk': 2.5, postcard: 1.3, card: 1.2, 'notebook-loose': 0.4, 'notebook-legal': 0.3, 'postcard-us': 0.3 },
  continental: { 'pad-a4': 2.5, pad: 1.5, 'notebook-fr': 0.6, 'notebook-loose': 0.3, 'notebook-legal': 0.2, 'postcard-us': 0.4 },
  polish: { pad: 1.5, 'pad-a4': 1.5, 'notebook-uk': 0.8, 'notebook-legal': 0.2, 'postcard-us': 0.3 },
  'latin-american': { notebook: 1.5, 'notebook-loose': 1.2, pad: 1.2, airmail: 1.5, aerogramme: 1.5, 'notebook-legal': 0.5 },
  italic: { laid: 2, 'laid-cotton': 1.5, card: 1.5, 'pad-binsen': 0.8 },
  'adult-print': { pad: 1.2, notebook: 1.4, card: 1.2, 'notebook-legal': 0.8 },
};
// when the hand was taught (the style's tradition.era): laid sheets before envelopes, airmail and aerogrammes in the
// 20th century, pads and notebook pages now
const ERA_PAPER = {
  early: { laid: 3, 'laid-blue': 2, 'laid-cotton': 1.5, card: 0.3, pad: 0.3, 'pad-uk': 0.2, 'pad-a4': 0.2, 'pad-binsen': 0.2, airmail: 0.05, 'airmail-white': 0.05, aerogramme: 0.05,
    notebook: 0.1, 'notebook-loose': 0.1, 'notebook-legal': 0.05, 'notebook-uk': 0.1, 'notebook-fr': 0.1, postcard: 0.1, 'postcard-us': 0.1, 'card-ippitsusen': 0.2 },
  c19: { laid: 2.5, 'laid-blue': 1.5, card: 1.2, pad: 0.8, postcard: 0.6, 'postcard-us': 0.6, notebook: 0.4, 'notebook-loose': 0.4, 'notebook-legal': 0.3, airmail: 0.2, 'airmail-white': 0.2, aerogramme: 0.1 },
  c20a: { airmail: 2, 'airmail-white': 1.6, aerogramme: 1.5, pad: 1.5, 'pad-uk': 1.5, postcard: 1.4, 'postcard-us': 1.4, card: 1, laid: 1, notebook: 0.8 },
  c20b: { aerogramme: 1.8, airmail: 1.6, pad: 1.6, 'pad-uk': 1.4, notebook: 1.2, 'notebook-loose': 1.2, postcard: 1.2, card: 1 },
  now: { notebook: 1.8, 'notebook-loose': 1.6, 'notebook-legal': 1.4, pad: 1.4, card: 1.2, postcard: 1.1, laid: 0.6, airmail: 0.4, 'airmail-white': 0.4, aerogramme: 0.25 },
};
const eraOf = (style) => {
  const y = parseInt((String(((getStyle(style) || {}).tradition || {}).era || '').match(/\d{4}/) || [])[0], 10);
  return !y ? 'now' : y < 1750 ? 'early' : y < 1900 ? 'c19' : y < 1950 ? 'c20a' : y < 2000 ? 'c20b' : 'now';
};
// what each kind of writer writes with and on (fonts-study.md §6); size = x-height in mm
const ARCH_LOOK = {
  friend: { pens: { ballpoint: 4, fountain: 2, gel: 2, pencil: 0.5, felt: 0.5 }, papers: { pad: 3, 'pad-uk': 1.5, airmail: 1.5, aerogramme: 1.2, notebook: 1, 'notebook-loose': 1, laid: 1, postcard: 0.6 }, size: [2.8, 3.6] },
  thanks: { pens: { gel: 3, fountain: 3, ballpoint: 1.5, pointed: 0.6 }, papers: { card: 4, 'card-ippitsusen': 1.5, laid: 2, 'laid-cotton': 1.2, 'pad-binsen': 1.2, pad: 1 }, size: [3, 4] },
  architect: { pens: { felt: 2.5, ballpoint: 1.5, pencil: 2.5, gel: 1 }, papers: { 'pad-a4': 2, 'notebook-legal': 1.5, pad: 1.5, card: 1 }, size: [2.4, 3.2], tips: { fine: 3, medium: 1 } },
  field: { pens: { pencil: 4, ballpoint: 2, felt: 0.8, gel: 0.8 }, papers: { notebook: 2, 'notebook-uk': 1.2, 'notebook-legal': 1, airmail: 1, aerogramme: 1.4, postcard: 1 }, size: [2.2, 2.9], tips: { fine: 2, medium: 1 } },
  whiteboard: { pens: { felt: 6, gel: 0.6, ballpoint: 0.5 }, papers: { 'notebook-legal': 2, 'pad-a4': 1.5, notebook: 1 }, size: [4.2, 6.4], tips: { bold: 3, medium: 1 } },
  margin: { pens: { felt: 3, gel: 2, ballpoint: 1.5 }, papers: { 'notebook-legal': 1.5, 'notebook-loose': 1.2, pad: 1, card: 0.6 }, size: [3.6, 5], inks: { red: 8, green: 3 } },
  postcard: { pens: { fountain: 2.5, ballpoint: 2.5, gel: 1.5, felt: 0.5 }, papers: { postcard: 5, 'postcard-us': 3, card: 1 }, size: [2.3, 3.1] },
  recipe: { pens: { fountain: 3, pointed: 1.4, ballpoint: 2, pencil: 0.6 }, papers: { card: 3, 'notebook-uk': 1.5, pad: 1.5, 'notebook-legal': 0.8 }, size: [2.8, 3.8], inks: { sepia: 3, 'iron-gall': 3, 'blue-black': 1.5 }, age: [0.35, 0.95] },
  first: { pens: { pencil: 6, felt: 1.4, ballpoint: 0.5 }, papers: { 'notebook-fr': 2, 'notebook-loose': 2, 'notebook-uk': 1.5, notebook: 1.5, pad: 0.5 }, size: [4.4, 6.6], tips: { medium: 2, bold: 1 } },
  italic: { pens: { italic: 5, fountain: 2, pointed: 0.8 }, papers: { laid: 2.5, 'laid-cotton': 2, 'laid-blue': 1.2, card: 1.5, 'pad-binsen': 1 }, size: [3.2, 4.4] },
  signature: { pens: { fountain: 3, gel: 2, ballpoint: 2, felt: 0.8 }, papers: { card: 2, laid: 2, pad: 1.5 }, size: [3.4, 5] },
  backhand: { pens: { gel: 3, ballpoint: 2, felt: 1.2, pencil: 1 }, papers: { notebook: 1.5, pad: 1.5, 'notebook-loose': 1, 'card-ippitsusen': 0.8 }, size: [2.4, 3.2] },
};
// printed rules and guide sheets keep lines close (writers follow a guide sheet under airmail paper too)
const RULED = new Set(['pad', 'pad-uk', 'pad-binsen', 'pad-a4', 'airmail', 'airmail-white', 'notebook', 'notebook-loose', 'notebook-legal', 'notebook-uk', 'notebook-fr', 'card-ippitsusen']);
const LOOK_KEYS = ['pen', 'tip', 'ink', 'paper', 'size', 'inkAge', 'inkVariation'];

// pick a key from { key: weight } tables multiplied together (a key a table doesn't list gets its __floor, else 1);
// flat < 1 flattens the odds (Wild: rare pairings come up)
function draw(r, keys, tables, flat = 1) {
  const items = keys.map((k) => {
    let w = 1;
    for (const t of tables) if (t) w *= t[k] == null ? (t.__floor ?? 1) : t[k];
    return { k, weight: Math.pow(Math.max(0, w), flat) };
  }).filter((x) => x.weight > 0);
  return items.length ? r.weighted(items).k : keys[0];
}
const inkFits = (pen, ink) => (PEN_INKS[pen] && PEN_INKS[pen][ink] ? 1 : ink === 'graphite' || pen === 'pencil' ? 0 : 0.15);

// The natural look of a seed (family: 'print' | 'script'; locked: { pen?, tip?, ink?, paper?, size?, inkAge? } kept
// as given, with everything else chosen to suit them). opts.wild flattens the odds; opts.textLength (characters) leaves
// out papers too small for the letter (postcards, notecards, ippitsusen, aerogrammes). Pure.
//   -> { seed, family, style, archetype, label, schooling, pen, tip, ink, inkAge, inkVariation, paper, size,
//        params: { neatness, slant, pressure, hurry, blend, lineWander, fatigue, ...traits other modules add to
//                  every hand, e.g. the style dimensions loops, joinLength, rhythm }  (absolute values)
//        offsets: { same keys }  (params minus this hand's natural values: the look's nudges) }
export function lookOf(seed, family = 'print', locked = {}, opts = {}) {
  const h = makeHand(seed, family);
  const base = baseSeed(seed);
  const A = ARCH_LOOK[h.archetype] || ARCH_LOOK.friend;
  // a sibling keeps most of the base seed's look, and re-rolls a few parts of it
  const rFor = (part) => (String(seed).includes('~') && rng('look-sib:' + seed + ':' + part)() < 0.25 ? rng('look:' + seed + ':' + part) : rng('look:' + base + ':' + part));
  const flat = opts.wild ? 0.45 : 1;
  const script = h.family === 'script';
  const L = { ...locked };
  const famBias = script ? { fountain: 1.6, pointed: 1.8, felt: 0.6 } : { felt: 1.2 };
  const pen = L.pen && LOOK_PENS.includes(L.pen) ? L.pen : draw(rFor('pen'), LOOK_PENS, [
    { ...A.pens, __floor: 0.08 }, famBias,
    L.paper ? Object.fromEntries(LOOK_PENS.map((p) => [p, (PEN_PAPER[p] || {})[L.paper] ?? 0.7])) : null,
    L.ink ? Object.fromEntries(LOOK_PENS.map((p) => [p, inkFits(p, L.ink)])) : null,
    L.tip ? Object.fromEntries(LOOK_PENS.map((p) => [p, PEN_TIPS[p][L.tip]])) : null,
  ], flat);
  // paper: how common it is, what this kind of writer uses, where and when they learned, what suits the pen; papers too
  // small for opts.textLength are left out
  const fits = opts.textLength > 0 ? Object.fromEntries(Object.entries(PAPER_FITS).filter(([, n]) => opts.textLength > n).map(([k]) => [k, 0])) : null;
  const paper = L.paper && LOOK_PAPERS.includes(L.paper) ? L.paper : draw(rFor('paper'), LOOK_PAPERS,
    [PAPER_BASE, { ...A.papers, __floor: 0.35 }, SCHOOL_PAPER[h.schooling], ERA_PAPER[eraOf(h.style)], { ...PEN_PAPER[pen], __floor: 0.7 }, fits], flat);
  const tip = L.tip && LOOK_TIPS.includes(L.tip) ? L.tip : draw(rFor('tip'), LOOK_TIPS, [PEN_TIPS[pen], A.tips ? { ...A.tips, __floor: 0.4 } : null], flat);
  // the pen's usual inks; an archetype's own inks (red for margin notes, sepia for recipes) can go in most pens
  const inkPool = { ...PEN_INKS[pen] };
  if (A.inks && pen !== 'pencil') for (const k of Object.keys(A.inks)) if (!inkPool[k]) inkPool[k] = 3;
  const ink = L.ink ? L.ink : draw(rFor('ink'), Object.keys(inkPool), [inkPool, A.inks || null], flat);
  const ra = rFor('age');
  const inkAge = L.inkAge != null ? L.inkAge : A.age ? +(A.age[0] + (A.age[1] - A.age[0]) * ra()).toFixed(2)
    : ink === 'iron-gall' || ink === 'sepia' ? +(0.15 + 0.5 * ra()).toFixed(2) : +(0.12 * ra() * ra()).toFixed(2);
  const rv = rFor('variation');
  const VAR = { fountain: [0.45, 0.8], pointed: [0.5, 0.85], italic: [0.4, 0.7], ballpoint: [0.25, 0.5], gel: [0.2, 0.4], felt: [0.2, 0.45], pencil: [0.3, 0.5] };
  const inkVariation = L.inkVariation != null ? L.inkVariation : +(VAR[pen][0] + (VAR[pen][1] - VAR[pen][0]) * rv()).toFixed(2);
  const rs = rFor('size');
  const tipMm = { fine: -0.2, medium: 0, bold: 0.45 }[tip] + (pen === 'felt' ? 0.4 : 0) + (pen === 'pencil' && h.archetype !== 'first' ? -0.1 : 0);
  const size = L.size != null ? L.size : +clamp(A.size[0] + (A.size[1] - A.size[0]) * rs() + tipMm, 2, 6.8).toFixed(1);
  // the sliders: this writer's own values, nudged by what they write with and on
  const nat = { neatness: h.neatness, slant: h.slant, pressure: h.pressure, hurry: h.hurry, blend: h.blend, lineWander: h.lineWander, fatigue: h.fatigue };
  const off = { neatness: 0, slant: 0, pressure: 0, hurry: 0, blend: 0, lineWander: 0, fatigue: 0 };
  if (pen === 'felt') { off.neatness -= 0.06; off.hurry += 0.05; off.pressure -= 0.1; }
  if (pen === 'pointed' || pen === 'italic') off.pressure += 0.25;
  if (pen === 'pencil') off.pressure += 0.1;
  if (pen === 'fountain') off.pressure += 0.08;
  if (RULED.has(paper)) off.lineWander -= 0.22 * nat.lineWander; else off.lineWander += 0.08 * nat.lineWander;
  if (paper === 'notebook-fr') off.neatness += 0.04;
  for (const k of addedNumbers(h)) { nat[k] = h[k]; off[k] = 0; } // e.g. style dimensions, as the writer has them
  const params = {};
  const lo = (k) => (k in NEG || nat[k] < 0 ? -1 : 0);
  for (const k in nat) params[k] = +(k === 'slant' ? nat[k] + off[k] : clamp(nat[k] + off[k], lo(k), k === 'lineWander' || k === 'fatigue' ? 1.5 : 1)).toFixed(3);
  for (const k in off) off[k] = +(params[k] - nat[k]).toFixed(3);
  const arch = archetypeOf(seed);
  return { seed: String(seed), family: h.family, style: h.style, archetype: arch.id, label: arch.label, schooling: h.schooling, traditions: h.traditions,
    pen, tip, ink, inkAge, inkVariation, paper, size, params, offsets: off };
}

// How different two looks are at a glance: the writer (handDistance), then pen, ink colour, paper and size.
export function lookDistance(a, b) {
  const dh = handDistance(a.P || profile(asHand(a)), b.P || profile(asHand(b)));
  const ca = INK_RGB[a.ink] || [40, 40, 50], cb = INK_RGB[b.ink] || [40, 40, 50];
  const dInk = Math.min(1, Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) / 150);
  const d2 = dh * dh + (a.pen !== b.pen ? 0.25 : 0) + (0.6 * dInk) ** 2 + (a.paper !== b.paper ? 0.2 : 0) +
    (0.7 * (a.size - b.size) / 3) ** 2 + (a.tip !== b.tip ? 0.015 : 0);
  return Math.sqrt(d2);
}

// sampleLook(opts) -> a look (lookOf's shape) + { variety, distance }: what New hand shows next.
//   opts.history: looks shown so far, oldest first (lookOf results, or { seed, family } and the look is rebuilt);
//                 the last 6 count. opts.variety: 'sibling' | 'stranger' (default) | 'wild', or 0..100
//                 (0-20 Sibling, 21-70 Stranger, 71-100 Wild). opts.locked: { family?, pen?, tip?, ink?, paper?, size?,
//                 inkAge? } kept as given; a list of keys keeps opts.current's values. opts.entropy: any fresh string.
//                 opts.textLength: the letter's length in characters, so a postcard isn't offered for a long letter.
//   Compatible with the earlier shape: { current: { seed, style }, locked: ['style'], variety: 60 }.
export function sampleLook(opts = {}) {
  let variety = opts.variety == null ? 'stranger' : opts.variety;
  if (typeof variety === 'number') variety = variety <= 20 ? 'sibling' : variety <= 70 ? 'stranger' : 'wild';
  if (!VARIETY[variety]) variety = 'stranger';
  const famOf = (x) => x.family || (getStyle(x.style) || {}).family || 'print';
  const cur = opts.current && opts.current.seed ? { ...opts.current, family: famOf(opts.current) } : null;
  const hist = (opts.history || (cur ? [cur] : [])).map((x) => (typeof x === 'string' ? { seed: x, family: 'print' } : x)).slice(-6);
  const looks = hist.map((x) => (x.pen && x.paper && x.ink ? x : { ...lookOf(x.seed, famOf(x)), ...x }));
  let locked = opts.locked || {};
  if (Array.isArray(locked)) {
    const ref = cur ? { ...lookOf(cur.seed, cur.family), ...cur } : looks[looks.length - 1] || {};
    locked = Object.fromEntries(locked.map((k) => [k === 'style' ? 'family' : k, k === 'style' ? ref.family : ref[k]]).filter(([, v]) => v != null));
  }
  const family = locked.family || opts.family;
  const lockedLook = Object.fromEntries(Object.entries(locked).filter(([k]) => LOOK_KEYS.includes(k)));
  const r = rng('look-sampler:' + (opts.entropy == null ? '' : opts.entropy) + ':' + looks.map((x) => x.seed + '/' + x.family + '/' + x.pen + '/' + x.paper).join(',') + ':' + JSON.stringify(locked));
  const P = looks.map((x) => ({ ...x, P: profile(asHand(x)) }));
  const last = P[P.length - 1];
  const finish = (best) => best && { ...best.look, variety, distance: +best.d.toFixed(3) };

  if (variety === 'sibling' && last) {
    const fam = family || last.family;
    const lastLocks = { ...lockedLook };
    for (const k of ['pen', 'paper']) if (lastLocks[k] == null && last[k]) lastLocks[k] = last[k]; // same desk, a relative
    let best = null;
    for (let i = 0; i < (opts.candidates || 12); i++) {
      const seed = `${baseSeed(last.seed)}~${1 + Math.floor(r() * 998)}`;
      const look = lookOf(seed, fam, lastLocks, { textLength: opts.textLength });
      const d = lookDistance({ ...look, P: profile(makeHand(seed, fam)) }, last);
      const score = -Math.abs(d - 0.38);
      if (!best || score > best.score) best = { look, d, score };
    }
    return finish(best);
  }

  // family and archetype as sampleHand does, then 12 candidates scored on the whole look
  const fams = families();
  let fam = family && fams.includes(family) ? family : null;
  if (!fam) {
    const runOf = (f) => { let n = 0; for (let i = P.length - 1; i >= 0 && P[i].family === f; i--) n++; return n; };
    fam = fams.length ? r.weighted(fams.map((f) => ({ f, weight: 1 / (1 + 1.5 * runOf(f)) }))).f : 'print';
  }
  const seen = new Set(P.map((x) => archetypeOf(x.seed).id));
  const bag = ARCHETYPES.filter((a) => !seen.has(a.id));
  const target = r.weighted(bag.length ? bag : ARCHETYPES).id;
  const cfg = VARIETY[variety];
  let best = null;
  for (let k = 0, n = 0; n < (opts.candidates || 12) && k < 4000; k++) {
    const seed = seedFrom(rng('look-seed:' + r() + ':' + k));
    if (archetypeOf(seed).id !== target) continue;
    n++;
    const h = makeHand(seed, fam);
    const look = lookOf(seed, fam, lockedLook, { wild: variety === 'wild', textLength: opts.textLength });
    const C = { ...look, P: profile(h) };
    const ds = P.map((x) => lookDistance(C, x));
    const dmin = ds.length ? Math.min(...ds) : 1;
    let score = dmin + (dmin >= cfg.dMin ? 0.25 : 0);
    if (last && C.pen !== last.pen) score += 0.1;
    if (last && C.paper !== last.paper) score += 0.08;
    const ch = chaos(h);
    if (ch > cfg.budget) score -= 2 + (ch - cfg.budget);
    if (variety === 'wild') score += 0.12 * Object.values(latentOf(seed)).reduce((s, v) => s + Math.abs(v), 0) / 7;
    if (!best || score > best.score) best = { look, d: dmin, score };
  }
  return finish(best);
}
