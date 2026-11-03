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
import { makeHand, archetypeOf, latentOf, baseSeed, ARCHETYPES, care, skeleton, builtInSlant, CAP, pickStyle } from './hand.js';
import { describeHabits, families, getStyle, choose, allographOf, isHistorical, CONFUSABLE, styleNames, schoolingNames, stylesInFamily, pickSchooling } from './glyphs.js';
import { layout } from './layout.js';

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
// a history item says whether it was a Neat only hand; when it doesn't, it follows the current setting
const asHand = (x, neat = true) => (x && x.habits ? x : makeHand(x.seed, x.style ? { style: x.style } : x.family || 'print',
  { neatOnly: x.neatOnly == null ? neat : x.neatOnly !== 'off' && x.neatOnly !== false }));
const neatOpt = (opts) => opts.neatOnly !== false && opts.neatOnly !== 'off'; // Neat only is on unless switched off

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

// How readable a hand is at a glance, 0..1 (1 = a stranger reads it straight off). Not pretty: readable. Sums
// penalties for what makes our hands hard to read: little care, a lot of hurry, extreme lean, letters far wider or
// narrower than usual, a small x-height or a pen heavy enough to fill the counters, extreme movement (huge loops,
// long lead-ins, flourishes, hard angles), a historical tradition, capitals that read as another character.
// Cheap: two skeletons and a few capitals. Neat only keeps hands at NEAT_MIN or above.
export const NEAT_MIN = 0.77;
const CTX = { prev: 'a', next: 'a', index: 1 };
export function legibility(p) {
  const parts = legibilityParts(p);
  let pen = 0;
  for (const k in parts) pen += parts[k];
  return Math.max(0, Math.min(1, 1 - 0.6 * pen)); // about 0.4 = hard work; Neat only asks for 0.77
}
// The ink gap between two words, in x-heights ('an an', laid out as the page would)
function wordGap(p) {
  const items = layout(p, 'an an', { maxWidth: 1e6 }).items.filter((it) => it.kind === 'glyph');
  if (items.length < 4) return 1;
  const edge = (it, right) => { let m = right ? -Infinity : Infinity; for (const c of it.g.contours) for (const q of c) m = right ? Math.max(m, it.x + q[0]) : Math.min(m, it.x + q[0]); return m; };
  return (edge(items[2], false) - edge(items[1], true)) / (p.xHeight * CAP);
}

// The penalties behind legibility(p), by cause (for calibration, the lab and the provenance card)
export function legibilityParts(p) {
  const st = getStyle(p.style) || {};
  const joined = !!st.connected;
  const xhU = p.xHeight * CAP;
  const P = {};
  P.careless = 1.3 * Math.max(0, 0.55 - care(p));
  P.rushed = 0.9 * Math.max(0, (p.hurry || 0) - 0.7);
  const lean = builtInSlant(p.style) + (p.slant || 0);
  P.lean = 0.035 * Math.max(0, lean - 28) + 0.04 * Math.max(0, -10 - lean);
  const nW = skeleton(p, 'n', CTX).advance / xhU, oW = skeleton(p, 'o', CTX).advance / xhU;
  const band = (w, lo, hi) => 0.45 * (Math.max(0, w - hi) + Math.max(0, lo - w));
  P.proportions = joined ? band(nW, 0.6, 2.05) + band(oW, 0.35, 1.9) : band(nW, 0.5, 1.55) + band(oW, 0.4, 1.5);
  // words must stand apart: the ink gap between two laid-out words (exit strokes and lead-ins eat into the space)
  P.wordsRunTogether = 2 * Math.max(0, 0.7 - wordGap(p));
  P.smallXHeight = 3 * Math.max(0, (joined ? 0.4 : 0.47) - p.xHeight);
  P.heavyPen = 5 * Math.max(0, p.penWidth / xhU - 0.17);
  P.tremor = 0.15 * Math.max(0, (p.tremor || 0) - 2.1);
  // only the 'more' side of a movement dimension hurts reading (fewer loops or no lead-ins read fine); rhythm both ways
  const dim = (k, at, w = 0.5, both = false) => (typeof p[k] === 'number' ? w * Math.max(0, (both ? Math.abs(p[k]) : p[k]) - at) : 0);
  P.movement = dim('loops', 0.7, 0.25) + dim('leadIns', 0.6, 0.35) + dim('flourish', 0.6, 0.15) + dim('angularity', 0.6, 0.4) + dim('loopHeight', 0.7, 0.2) + dim('joinLength', 0.7, 0.3) + dim('rhythm', 0.7, 0.3, true);
  P.tradition = isHistorical(p.style) ? 0.5 : st.tradition && st.tradition.legibility === 'specialist' ? 0.2 : 0;
  P.confusable = 0;
  for (const ch of 'AGIQT') { const v = choose(p, ch); if (v && CONFUSABLE.has(allographOf(v))) P.confusable += ch === 'A' || ch === 'I' || ch === 'T' ? 0.12 : 0.06; }
  return P;
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
  const recent = history.map((x) => profile(asHand(x, neatOpt(opts))));

  // Sibling: a relative of the last hand, same family, about one notch away
  if (variety === 'sibling' && last) {
    const fam = opts.family || last.family || 'print';
    const base = baseSeed(last.seed);
    let best = null;
    for (let i = 0, tries = 0; i < (opts.candidates || 12) && tries < 60; tries++) {
      const seed = `${base}~${1 + Math.floor(r() * 998)}`;
      const h = makeHand(seed, fam, { neatOnly: neatOpt(opts) });
      if (neatOpt(opts) && legibility(h) < NEAT_MIN && tries < 48) continue; // Neat only: skip unreadable relatives
      i++;
      const P = profile(h);
      const d = handDistance(P, recent[recent.length - 1]);
      const score = -Math.abs(d - 0.32);                    // close, but visibly someone else
      if (!best || score > best.score) best = { seed, family: fam, P, d, score };
    }
    return result(best, variety, neatOpt(opts));
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
  let spare = null; // the most readable hand seen, if none clears Neat only
  for (let k = 0; cands.length < n && k < 4000; k++) {
    const seed = seedFrom(rng('sampler-seed:' + r() + ':' + k));
    if (archetypeOf(seed).id !== target) continue;
    const h = makeHand(seed, family, { neatOnly: neatOpt(opts) });
    const L = neatOpt(opts) ? legibility(h) : 1;
    if (L < NEAT_MIN) { if (!spare || L > spare.L) spare = { seed, family, h, L }; continue; }
    cands.push({ seed, family, h, P: profile(h), chaos: chaos(h) });
  }
  if (!cands.length && spare) cands.push({ ...spare, P: profile(spare.h), chaos: chaos(spare.h) });
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
  return result(best, variety, neatOpt(opts));
}

function result(b, variety, neat = true) {
  if (!b) return null;
  const arch = archetypeOf(b.seed);
  const h = b.h || makeHand(b.seed, b.family, { neatOnly: neat });
  return { seed: b.seed, family: b.family, style: h.style, archetype: arch.id, label: arch.label, variety, distance: b.d, neatOnly: h.neatOnly, legibility: +legibility(h).toFixed(2) };
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
  return lookFor(makeHand(seed, family, { neatOnly: neatOpt(opts) }), seed, locked, opts);
}
// lookOf for a hand already made (makeHand(seed, family, { neatOnly })); opts.legibility skips measuring it again
function lookFor(h, seed, locked = {}, opts = {}) {
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
    neatOnly: h.neatOnly, legibility: +(opts.legibility != null ? opts.legibility : legibility(h)).toFixed(2),
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
//                 opts.neatOnly (default true): only hands with legibility >= NEAT_MIN, tidied (hand.js tidyHand);
//                 false offers every hand, ugly ones too. The look carries neatOnly and legibility for share links.
//   Compatible with the earlier shape: { current: { seed, style }, locked: ['style'], variety: 60 }.
export function sampleLook(opts = {}) {
  let variety = opts.variety == null ? 'stranger' : opts.variety;
  if (typeof variety === 'number') variety = variety <= 20 ? 'sibling' : variety <= 70 ? 'stranger' : 'wild';
  if (!VARIETY[variety]) variety = 'stranger';
  const famOf = (x) => x.family || (getStyle(x.style) || {}).family || 'print';
  const cur = opts.current && opts.current.seed ? { ...opts.current, family: famOf(opts.current) } : null;
  const hist = (opts.history || (cur ? [cur] : [])).map((x) => (typeof x === 'string' ? { seed: x, family: 'print' } : x)).slice(-6);
  const looks = hist.map((x) => (x.pen && x.paper && x.ink ? x : { ...lookOf(x.seed, famOf(x), {}, { neatOnly: x.neatOnly == null ? neatOpt(opts) : x.neatOnly }), ...x }));
  let locked = opts.locked || {};
  if (Array.isArray(locked)) {
    const ref = cur ? { ...lookOf(cur.seed, cur.family, {}, { neatOnly: neatOpt(opts) }), ...cur } : looks[looks.length - 1] || {};
    locked = Object.fromEntries(locked.map((k) => [k === 'style' ? 'family' : k, k === 'style' ? ref.family : ref[k]]).filter(([, v]) => v != null));
  }
  const family = locked.family || opts.family;
  const lockedLook = Object.fromEntries(Object.entries(locked).filter(([k]) => LOOK_KEYS.includes(k)));
  const r = rng('look-sampler:' + (opts.entropy == null ? '' : opts.entropy) + ':' + looks.map((x) => x.seed + '/' + x.family + '/' + x.pen + '/' + x.paper).join(',') + ':' + JSON.stringify(locked));
  const P = looks.map((x) => ({ ...x, P: profile(asHand(x, neatOpt(opts))) }));
  const last = P[P.length - 1];
  const finish = (best) => best && { ...best.look, variety, distance: +best.d.toFixed(3) };

  if (variety === 'sibling' && last) {
    const fam = family || last.family;
    const lastLocks = { ...lockedLook };
    for (const k of ['pen', 'paper']) if (lastLocks[k] == null && last[k]) lastLocks[k] = last[k]; // same desk, a relative
    let best = null;
    for (let i = 0, tries = 0; i < (opts.candidates || 12) && tries < 60; tries++) {
      const seed = `${baseSeed(last.seed)}~${1 + Math.floor(r() * 998)}`;
      const look = lookOf(seed, fam, lastLocks, { textLength: opts.textLength, neatOnly: neatOpt(opts) });
      if (neatOpt(opts) && look.legibility < NEAT_MIN && tries < 48) continue; // Neat only: skip unreadable relatives
      i++;
      const d = lookDistance({ ...look, P: profile(makeHand(seed, fam, { neatOnly: neatOpt(opts) })) }, last);
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
  let best = null, spare = null;
  for (let k = 0, n = 0; n < (opts.candidates || 12) && k < 4000; k++) {
    const seed = seedFrom(rng('look-seed:' + r() + ':' + k));
    if (archetypeOf(seed).id !== target) continue;
    const h = makeHand(seed, fam, { neatOnly: neatOpt(opts) });
    const look = lookOf(seed, fam, lockedLook, { wild: variety === 'wild', textLength: opts.textLength, neatOnly: neatOpt(opts) });
    // Neat only: hands a stranger can't read at a glance are skipped (the most readable is kept in case none pass)
    if (neatOpt(opts) && look.legibility < NEAT_MIN) { if (!spare || look.legibility > spare.look.legibility) spare = { look, d: 0, score: -9 }; continue; }
    n++;
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
  return finish(best || spare);
}

// ---------------------------------------------------------------------------------------------------------
// A set of hands for the Fonts view: sampleLooks(setSeed, n, constraints) -> n diverse looks that meet the filters.
// docs/FILTERS.md explains every filter; LOOK_FILTERS below is the same list for code (labels, values, ranges).
//
// How: a stream of candidate seeds (a pure function of setSeed) is filtered; the hands that meet every filter form
// a pool (about 3n), and the set is chosen from it by farthest-point selection on lookDistance (each pick is the
// candidate farthest from the hands already picked). Same setSeed, n, constraints and opts -> the same set.
// When the filters are too tight to find n hands within the search budget, the set is topped up with the closest
// misses: their slider-like values are nudged into the asked range (look.nudged) and anything still outside is
// listed in look.misses; the result says so in plain words (result.note). Choice filters (print/joined,
// tradition, schooling, kind of writer, movement, era, pen, tip, ink, paper) are never broken.
// ---------------------------------------------------------------------------------------------------------

// movementOf comes from style-dims.js; index.js hands it over (importing it here would change module order)
let movementHook = null;
export function useMovements(fn, list) { movementHook = { fn, list }; }

// what each range filter reads, and how a near miss is nudged into range (null: can't be nudged)
const xhUnits = (h) => h.xHeight * CAP;
const nWidth = (h) => skeleton(h, 'n', CTX).advance / xhUnits(h);
const param = (k) => (look, h) => (look.params[k] != null ? look.params[k] : h[k]);
const setParam = (k) => (look, h, v) => { look.params[k] = v; };
const RANGES = {
  legibility: { get: (look) => look.legibility, span: 1, nudge: null },
  neatness: { get: param('neatness'), span: 1, nudge: setParam('neatness') },
  hurry: { get: param('hurry'), span: 1, nudge: setParam('hurry') },
  slant: { get: (look, h) => builtInSlant(h.style) + param('slant')(look, h), span: 45, nudge: (look, h, v) => { look.params.slant = +(v - builtInSlant(h.style)).toFixed(2); } },
  xHeight: { get: (look, h) => h.xHeight, span: 0.4, nudge: setParam('xHeight') },
  width: { get: (look, h) => nWidth(h), span: 1, nudge: (look, h, v) => { look.params.width = +(h.width * v / nWidth(h)).toFixed(3); } },
  spacing: { get: (look, h) => h.sidebearing / xhUnits(h), span: 0.2, nudge: (look, h, v) => { look.params.sidebearing = +(v * xhUnits(h)).toFixed(1); } },
  weight: { get: (look, h) => (look.params.penWidth != null ? look.params.penWidth : h.penWidth) / xhUnits(h), span: 0.16, nudge: (look, h, v) => { look.params.penWidth = +(v * xhUnits(h)).toFixed(1); } },
  pressure: { get: param('pressure'), span: 1, nudge: setParam('pressure') },
  blend: { get: param('blend'), span: 1, nudge: setParam('blend') },
  tremor: { get: param('tremor'), span: 3, nudge: setParam('tremor') },
  lineWander: { get: param('lineWander'), span: 1.5, nudge: setParam('lineWander') },
  fatigue: { get: param('fatigue'), span: 1.5, nudge: setParam('fatigue') },
  mistakes: { get: param('mistakes'), span: 1, nudge: setParam('mistakes') },
  size: { get: (look) => look.size, span: 4.8, nudge: (look, h, v) => { look.size = +v.toFixed(1); } },
  inkAge: { get: (look) => look.inkAge, span: 1, nudge: (look, h, v) => { look.inkAge = +v.toFixed(2); } },
  inkVariation: { get: (look) => look.inkVariation, span: 1, nudge: (look, h, v) => { look.inkVariation = +v.toFixed(2); } },
};
// joined-hand movement doesn't apply to print: a print hand has no loops, lead-ins, flicks or swash capitals, lifts the
// pen after every letter, and has no joins to be long or short (NaN: a join-length filter means joined hands only)
const PRINT_AS = { loops: -1, leadIns: -1, endFlicks: -1, flourish: -1, lifts: 1, joinLength: NaN };
for (const k of ['loops', 'leadIns', 'endFlicks', 'flourish', 'lifts', 'joinLength', 'angularity', 'loopHeight', 'bowls', 'rhythm']) {
  const own = param(k), set = setParam(k);
  RANGES[k] = k in PRINT_AS
    ? { get: (look, h) => (h.family === 'script' ? own(look, h) : PRINT_AS[k]), span: k === 'lifts' ? 1 : 2, nudge: (look, h, v) => { if (h.family === 'script') set(look, h, v); } }
    : { get: own, span: 2, nudge: set };
}
// look settings: always met (the look is drawn with them), so they never count as a miss
const LOOK_RANGE = new Set(['size', 'inkAge', 'inkVariation']);

// Pen lifts near 1 pull retraced ascenders apart (Palmer h, l, k, b): a lifts filter never asks for more than this
const LIFTS_MAX = 0.85;

// Character: one word a visitor picks a hand by (a hand can carry several). Rules from the Fonts view research
// (side notes fonts-view-filters.md), edges checked against the measured ranges in docs/FILTERS.md.
export const CHARACTER = [
  { id: 'careful', label: 'Careful', test: (x) => x.neatness >= 0.72 && x.hurry <= 0.45 },
  { id: 'everyday', label: 'Everyday', test: (x) => ['friend', 'postcard', 'recipe'].includes(x.archetype) },
  { id: 'hurried', label: 'Hurried', test: (x) => x.hurry >= 0.68 || (x.joined && x.movement === 'scrawl') || (x.hurry >= 0.55 && ['margin', 'signature', 'field'].includes(x.archetype)) },
  { id: 'elegant', label: 'Elegant', test: (x) => (x.joined && ['copperplate', 'business'].includes(x.movement)) || ['thanks', 'italic'].includes(x.archetype) },
  { id: 'schoolroom', label: 'Schoolroom', test: (x) => (x.joined ? ['schoolroom', 'round'].includes(x.movement) : x.neatness >= 0.72 && x.hurry <= 0.45 && Math.abs(x.lean) < 6) },
  { id: 'childlike', label: 'Childlike', test: (x) => x.archetype === 'first' },
  { id: 'technical', label: 'Technical', test: (x) => x.archetype === 'architect' },
  { id: 'cramped', label: 'Cramped', test: (x) => (x.joined && x.movement === 'cramped') || x.width < (x.joined ? 0.82 : 0.8) },
  { id: 'airy', label: 'Airy', test: (x) => (x.joined && x.movement === 'airy') || x.width > (x.joined ? 1.5 : 1.3) },
  { id: 'angular', label: 'Angular', test: (x) => (x.joined && x.movement === 'angular') || x.angularity >= 0.45 },
];
// what a specimen row can say about a hand without drawing it
function traitsOf(h, look) {
  const P = (look && look.params) || {};
  const v = (k) => (P[k] != null ? P[k] : h[k]);
  return { joined: h.family === 'script', archetype: h.archetype, movement: movementHook ? movementHook.fn(h).id : null,
    neatness: v('neatness'), hurry: v('hurry'), lean: builtInSlant(h.style) + v('slant'), width: nWidth(h), angularity: v('angularity') || 0 };
}
export function characterOf(h, look) {
  const x = traitsOf(h, look);
  return CHARACTER.filter((c) => c.test(x)).map((c) => c.id);
}
// { tradition: 'Business 1915', era, region, movement: 'Business cursive (Palmer, Zaner-Bloser)', character: [...],
//   lean (visible degrees), width (n in x-heights), laterLearned: style or null }
export function aboutOf(h, look) {
  const st = getStyle(h.style) || {}, t = st.tradition || {};
  const x = traitsOf(h, look);
  const second = h.blend > 0 && h.traditions && h.traditions[1];
  return { tradition: st.label || h.style, era: eraOf(h.style), region: t.region || null,
    movement: movementHook && h.family === 'script' ? movementHook.fn(h).label : null, character: CHARACTER.filter((c) => c.test(x)).map((c) => c.id),
    lean: +x.lean.toFixed(1), width: +x.width.toFixed(2), laterLearned: second ? { style: second.style, schooling: second.schooling, label: second.label } : null };
}

// The filters, for UIs (labels in plain words; docs/FILTERS.md has the why). kind: 'choice' (one value or a list),
// 'range' ([min, max], either may be null), 'toggle'. hard: never broken; soft: may be nudged when too tight.
export const LOOK_FILTERS = [
  { key: 'family', label: 'Print or joined', kind: 'choice', hard: true, values: () => families() },
  { key: 'style', label: 'Tradition', kind: 'choice', hard: true, values: () => styleNames() },
  { key: 'historical', label: 'Include historical hands', kind: 'toggle', hard: true, default: false },
  { key: 'era', label: 'Taught', kind: 'choice', hard: true, values: () => ['early', 'c19', 'c20a', 'c20b', 'now'] },
  { key: 'schooling', label: 'Schooling', kind: 'choice', hard: true, values: () => schoolingNames() },
  { key: 'archetype', label: 'Kind of writer', kind: 'choice', hard: true, values: () => ARCHETYPES.map((a) => a.id) },
  { key: 'movement', label: 'Movement', kind: 'choice', hard: true, values: () => (movementHook ? movementHook.list.map((m) => m.id) : []) },
  { key: 'character', label: 'Character', kind: 'choice', hard: true, values: () => CHARACTER.map((c) => c.id) },
  { key: 'later', label: 'Later learned', kind: 'choice', hard: true, values: () => [...styleNames(), ...schoolingNames()] },
  { key: 'neatOnly', label: 'Neat hands only', kind: 'toggle', hard: false, default: true },
  { key: 'legibility', label: 'Readable at a glance', kind: 'range', hard: false, range: [0, 1] },
  { key: 'neatness', label: 'Neatness', kind: 'range', hard: false, range: [0, 1] },
  { key: 'hurry', label: 'Hurry', kind: 'range', hard: false, range: [0, 1] },
  { key: 'slant', label: 'Slant', kind: 'range', hard: false, range: [-20, 45], unit: '° from upright' },
  { key: 'xHeight', label: 'X-height', kind: 'range', hard: false, range: [0.36, 0.78], unit: 'of capital height' },
  { key: 'width', label: 'Width', kind: 'range', hard: false, range: [0.4, 2], unit: 'n width in x-heights' },
  { key: 'spacing', label: 'Letter spacing', kind: 'range', hard: false, range: [0, 0.3], unit: 'x-heights' },
  { key: 'weight', label: 'Weight', kind: 'range', hard: false, range: [0.04, 0.24], unit: 'stroke / x-height' },
  { key: 'pressure', label: 'Pressure', kind: 'range', hard: false, range: [0, 1] },
  { key: 'blend', label: 'Mixed schooling', kind: 'range', hard: false, range: [0, 1] },
  { key: 'loops', label: 'Loops', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'leadIns', label: 'Lead-ins', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'endFlicks', label: 'End flicks', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'flourish', label: 'Capitals', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'lifts', label: 'Pen lifts', kind: 'range', hard: false, range: [0, 1] },
  { key: 'joinLength', label: 'Join length', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'angularity', label: 'Pointed turns', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'loopHeight', label: 'Loop height', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'bowls', label: 'Round or compressed', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'rhythm', label: 'Rhythm', kind: 'range', hard: false, range: [-1, 1] },
  { key: 'tremor', label: 'Shaky', kind: 'range', hard: false, range: [0, 3.5] },
  { key: 'mistakes', label: 'Mistakes', kind: 'range', hard: false, range: [0, 1] },
  { key: 'lineWander', label: 'Line wander', kind: 'range', hard: false, range: [0, 1.5] },
  { key: 'fatigue', label: 'Tires over a page', kind: 'range', hard: false, range: [0, 1.5] },
  { key: 'pen', label: 'Pen', kind: 'choice', hard: true, values: () => LOOK_PENS, specimen: true },
  { key: 'tip', label: 'Tip', kind: 'choice', hard: true, values: () => LOOK_TIPS, specimen: true },
  { key: 'ink', label: 'Ink', kind: 'choice', hard: true, values: () => Object.keys(INK_RGB), specimen: true },
  { key: 'paper', label: 'Paper', kind: 'choice', hard: true, values: () => LOOK_PAPERS, specimen: true },
  { key: 'size', label: 'Size', kind: 'range', hard: true, range: [2, 6.8], unit: 'mm x-height', specimen: true },
  { key: 'inkAge', label: 'Ink age', kind: 'range', hard: true, range: [0, 1], specimen: true },
  { key: 'inkVariation', label: 'Ink variation', kind: 'range', hard: true, range: [0, 1], specimen: true },
];

const listOf = (v) => (v == null || v === '' ? null : (Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== ''));
// how far a value lies outside [lo, hi], in units of the filter's usual span (0 = inside)
const outside = (v, [lo, hi], span) => (Number.isNaN(v) ? 1 : v == null ? 0 : lo != null && v < lo ? (lo - v) / span : hi != null && v > hi ? (v - hi) / span : 0);

// sampleLooks(setSeed, n = 24, constraints = {}, opts = {}) ->
//   { setSeed, n, looks: [look...], matched, relaxed: [keys some looks miss or were nudged on], note, tried, pool,
//     constraints (as understood) }
//   constraints: any LOOK_FILTERS key. Choice keys take a value or a list (family: 'script'; style: ['palmer',
//     'spencerian']); range keys take [min, max] (either may be null: slant: [10, null]); historical: true lets
//     historical traditions in when no style is named; neatOnly (default true) = legibility >= NEAT_MIN, tidied hands.
//   opts: { shown: looks already on screen (the new set keeps away from them), exclude: seeds not to repeat,
//     variety: 'stranger' (default, a chaos budget keeps extremes rare) | 'wild', pool, maxTries }
//   look: lookOf's shape (seed, family, style, ..., pen, tip, ink, paper, size, params, offsets, legibility) plus
//     { distance (to the nearest hand picked before it), matches (met every filter as the seed is), nudged:
//       { key: [natural, shown] }, misses: [keys still outside] }. Draw it with withOverrides(makeHand(seed,
//       { style }, { neatOnly }), look.params): nudged structural keys (xHeight, width, sidebearing, penWidth) are in
//       params too.
export function sampleLooks(setSeed, n = 24, constraints = {}, opts = {}) {
  n = Math.max(0, Math.min(200, Math.floor(n) || 0));
  const C = constraints || {};
  const neat = C.neatOnly !== false && C.neatOnly !== 'off';
  const ranges = {};
  for (const k in RANGES) if (Array.isArray(C[k]) && C[k].length === 2 && (C[k][0] != null || C[k][1] != null)) ranges[k] = [C[k][0] ?? null, C[k][1] ?? null];
  if (neat) ranges.legibility = [Math.max(NEAT_MIN, (ranges.legibility || [0])[0] ?? 0), (ranges.legibility || [])[1] ?? null];
  const choice = {};
  for (const k of ['family', 'style', 'era', 'schooling', 'archetype', 'movement', 'later', 'character', 'pen', 'tip', 'ink', 'paper']) { const l = listOf(C[k]); if (l && l.length) choice[k] = l; }
  if (ranges.lifts) ranges.lifts = [ranges.lifts[0], Math.min(ranges.lifts[1] ?? LIFTS_MAX, LIFTS_MAX)];
  // a historical tradition picked by name is wanted as it is: its legibility isn't marked down for being historical
  const legible = (h) => { const L = legibility(h); return choice.style && isHistorical(h.style) ? Math.min(1, L + 0.6 * 0.5) : L; };
  // the traditions that can come up: named ones (any, historical too), else the families' modern ones (+ historical)
  let styles = choice.style ? choice.style.filter((s) => getStyle(s)) : styleNames().filter((s) => C.historical || !isHistorical(s));
  if (choice.family) styles = styles.filter((s) => choice.family.includes(getStyle(s).family || 'print'));
  if (choice.era) styles = styles.filter((s) => choice.era.includes(eraOf(s)));
  const fams = [...new Set(styles.map((s) => getStyle(s).family || 'print'))];
  const understood = { ...Object.fromEntries(Object.entries(choice)), ...ranges, neatOnly: neat, historical: !!C.historical };
  const out = { setSeed: String(setSeed), n, looks: [], matched: 0, relaxed: [], note: null, tried: 0, pool: 0, constraints: understood };
  if (!n) return out;
  if (!styles.length) { out.note = 'No tradition fits these filters together (print or joined, tradition and era).'; return out; }

  const cfg = VARIETY[opts.variety === 'wild' ? 'wild' : 'stranger'];
  const poolTarget = opts.pool || Math.max(3 * n, 48);
  const maxTries = opts.maxTries || 1500 + 40 * n;
  const exclude = new Set(listOf(opts.exclude) || []);
  for (const x of opts.shown || []) if (x && x.seed) exclude.add(String(x.seed));
  const r = rng('looks:' + setSeed);
  const pool = [], near = [];
  const keepNear = (c) => { near.push(c); near.sort((a, b) => a.miss - b.miss); if (near.length > n) near.pop(); };
  let tried = 0;
  for (let k = 0; tried < maxTries && pool.length < poolTarget && k < maxTries * 4; k++) {
    // stop early when the rest of the budget can't reach n matches at the rate seen so far
    if (tried >= 300 && pool.length + (maxTries - tried) * (pool.length / tried) < n) break;
    const seed = seedFrom(rng('looks-seed:' + setSeed + ':' + k));
    if (exclude.has(seed)) continue;
    exclude.add(seed); // seed names can repeat in the stream; each writer once
    if (choice.archetype && !choice.archetype.includes(archetypeOf(seed).id)) continue; // cheap: from the seed alone
    tried++;
    // the tradition: the family first (evenly), then the seed's own tradition when every one of the family's is
    // allowed (so the seed means what it means elsewhere), else one of the allowed ones by their usual odds
    const fam = fams.length === 1 ? fams[0] : fams[Math.floor(r() * fams.length)];
    const inFam = styles.filter((s) => (getStyle(s).family || 'print') === fam);
    const natural = stylesInFamily(fam).filter((s) => C.historical || !isHistorical(s));
    const style = !choice.style && natural.every((s) => inFam.includes(s)) ? pickStyle(seed, fam, { historical: !!C.historical })
      : r.weighted(inFam.map((s) => ({ s, weight: getStyle(s).weight ?? 1 }))).s;
    // who the writer is (schooling, kind of movement) is known before the hand is made: filter on it first
    const who = { seed, style, archetype: archetypeOf(seed).id, schooling: pickSchooling(baseSeed(seed), style) };
    if (choice.schooling && !choice.schooling.includes(who.schooling)) continue;
    if (choice.movement && !(movementHook && choice.movement.includes(movementHook.fn(who).id))) continue;
    const h = makeHand(seed, { style }, { neatOnly: neat });
    if (choice.later && !(h.blend > 0 && h.traditions && h.traditions[1] && (choice.later.includes(h.traditions[1].style) || choice.later.includes(h.traditions[1].schooling)))) continue;
    // the look, with the specimen choices locked (a list: one of them, drawn evenly)
    const locked = {};
    for (const k of ['pen', 'tip', 'ink', 'paper']) if (choice[k]) locked[k] = choice[k][Math.floor(r() * choice[k].length)];
    let look = lookFor(h, seed, locked, { neatOnly: neat, wild: opts.variety === 'wild', legibility: 1 });
    look.params = { ...look.params };
    for (const k of LOOK_RANGE) if (ranges[k]) look[k] = +clamp(look[k], ranges[k][0] ?? -Infinity, ranges[k][1] ?? Infinity).toFixed(k === 'size' ? 1 : 2);
    if (choice.character && !characterOf(h, look).some((w) => choice.character.includes(w))) continue;
    // range filters, legibility last (it lays text out); a candidate that misses is remembered if it is close
    let miss = 0;
    const misses = [];
    for (const k in ranges) {
      if (k === 'legibility' || LOOK_RANGE.has(k)) continue;
      const o = outside(RANGES[k].get(look, h), ranges[k], RANGES[k].span);
      if (o > 0) { miss += o; misses.push(k); }
    }
    if (!miss) {
      look.legibility = +legible(h).toFixed(2);
      if (ranges.legibility) { const o = outside(look.legibility, ranges.legibility, 0.3); if (o > 0) { miss += o; misses.push('legibility'); } }
    }
    const c = { seed, h, look, miss, misses };
    if (miss > 0) { keepNear(c); continue; }
    pool.push(c);
  }
  out.tried = tried;
  out.pool = pool.length;

  // farthest-point selection: start from the first match (the set's own random start), then always the candidate
  // farthest from everything picked or already shown; hands over the variety's chaos budget only when nothing else is left
  const shown = (opts.shown || []).filter((x) => x && x.seed).map((x) => ({ ...x, P: profile(asHand(x, neat)) }));
  for (const c of pool) { c.P = profile(c.h); c.L = { ...c.look, P: c.P }; c.chaos = chaos(c.h); c.dmin = Infinity; }
  for (const s of shown) for (const c of pool) c.dmin = Math.min(c.dmin, lookDistance(c.L, s));
  const picked = [];
  while (picked.length < n && pool.length) {
    let bi = 0, best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const score = (picked.length || shown.length ? c.dmin : -i) - (c.chaos > cfg.budget ? 10 : 0);
      if (score > best) { best = score; bi = i; }
    }
    const c = pool.splice(bi, 1)[0];
    picked.push(c);
    for (const o of pool) o.dmin = Math.min(o.dmin, lookDistance(o.L, c.L));
  }
  const fromPool = picked.length;
  // too tight: the closest misses, nudged into range where a slider can do it
  for (const c of near) {
    if (picked.length >= n) break;
    c.look.nudged = {};
    for (const k of c.misses) {
      const R = RANGES[k];
      if (!R.nudge) continue;
      const v = R.get(c.look, c.h), [lo, hi] = ranges[k];
      const inset = 0.08 * Math.min(R.span, lo != null && hi != null ? hi - lo : R.span); // a little inside the edge
      const to = lo != null && v < lo ? (hi != null ? Math.min(lo + inset, hi) : lo + inset) : hi != null ? (lo != null ? Math.max(hi - inset, lo) : hi - inset) : v;
      R.nudge(c.look, c.h, to);
      if (outside(R.get(c.look, c.h), ranges[k], R.span) === 0) c.look.nudged[k] = [+v.toFixed(3), +to.toFixed(3)];
    }
    // legibility can't be set, only measured: the nudges may have fixed it (or not)
    c.look.legibility = +legible(withParams(c.h, c.look.params)).toFixed(2);
    c.look.misses = c.misses.filter((k) => !(k in c.look.nudged) && k !== 'legibility');
    if (ranges.legibility && outside(c.look.legibility, ranges.legibility, 1) > 0) c.look.misses.push('legibility');
    picked.push(c);
  }
  // distances in the final order (to the nearest earlier pick or shown hand)
  const seen = shown.slice();
  for (const c of picked) {
    const L = c.L || { ...c.look, P: profile(c.h) };
    let d = Infinity;
    for (const s of seen) d = Math.min(d, lookDistance(L, s));
    seen.push(L);
    out.looks.push({ ...c.look, distance: +(Number.isFinite(d) ? d : 0).toFixed(3), matches: c.miss === 0, nudged: c.look.nudged || {}, misses: c.look.misses || [],
      about: aboutOf(withParams(c.h, c.look.params), c.look) });
  }
  out.matched = fromPool;
  const nudged = [...new Set(out.looks.flatMap((l) => Object.keys(l.nudged)))], missed = [...new Set(out.looks.flatMap((l) => l.misses))];
  out.relaxed = [...new Set([...nudged, ...missed])];
  const label = (k) => (LOOK_FILTERS.find((f) => f.key === k) || { label: k }).label.toLowerCase();
  if (out.looks.length < n) out.note = `Only ${out.looks.length} hand${out.looks.length === 1 ? '' : 's'} came close to these filters; loosen one to see more.`;
  else if (fromPool < n) out.note = (fromPool ? `${fromPool} of ${n} hands meet every filter. The other ${n - fromPool} are the closest we found` : 'No hand meets every filter. These are the closest we found') +
    (nudged.length ? `, adjusted for ${nudged.map(label).join(', ')}` : '') + (missed.length ? `; some are still outside on ${missed.map(label).join(', ')}` : '') + '.';
  return out;
}
// a hand with a look's absolute params applied (as withOverrides does, without leaving the sampler)
function withParams(h, params) {
  const p = Object.assign(Object.create(null), h);
  for (const k in params) if (params[k] != null) p[k] = params[k];
  return p;
}

// The Fonts page's shape of the same call: sampleSet({ setSeed, count, offset, filters, neatOnly, exclude })
//   -> { looks, exhausted, note, matched }. offset (a multiple of count) gives later pages of the same set: each page
//   keeps away from the pages before it. exhausted: fewer hands meet every filter than were asked for (the rest
//   of looks, if any, are the closest misses, each with look.matches false).
export function sampleSet({ setSeed = '', count = 24, offset = 0, filters = {}, neatOnly, exclude, entropy } = {}) {
  const seed = String(setSeed || entropy || '');
  const C = { ...filters };
  if (neatOnly != null) C.neatOnly = neatOnly;
  let shown = [], page = null;
  for (let k = 0; k <= Math.floor(Math.max(0, offset) / Math.max(1, count)); k++) {
    page = sampleLooks(k ? seed + '#' + k : seed, count, C, { shown, exclude });
    shown = shown.concat(page.looks);
  }
  return { looks: page.looks, exhausted: page.matched < count, note: page.note, matched: page.matched };
}
