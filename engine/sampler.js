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
    letters: Object.fromEntries(Object.keys(FREQ).map((c) => [c, letters[c] ? letters[c].main : '-'])),
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
    t('weight', 0.6) + t('spacing', 0.4) + t('round', 0.3) + t('texture', 0.1);
  return Math.sqrt(d2);
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

// For the product UI (app/src/lib/roll.ts asks for this shape):
// sampleLook({ current: { seed, style }, locked: string[], variety: 0..100, history?, entropy? })
//   -> { seed, style, family, archetype, label }. The app fills in pen, ink, paper and the sliders itself.
//   variety 0-20 = Sibling, 21-70 = Stranger (default 60), 71-100 = Wild. locked 'style' or 'family' keeps the
//   current family. history: the hands shown so far (as for sampleHand); defaults to the current one.
export function sampleLook(opts = {}) {
  const v = opts.variety == null ? 60 : opts.variety;
  const variety = v <= 20 ? 'sibling' : v <= 70 ? 'stranger' : 'wild';
  const cur = opts.current && opts.current.seed ? { seed: opts.current.seed, family: (getStyle(opts.current.style) || {}).family || opts.current.family || 'print' } : null;
  const history = opts.history || (cur ? [cur] : []);
  const locked = opts.locked || [];
  const family = cur && (locked.includes('style') || locked.includes('family')) ? cur.family : undefined;
  const r = sampleHand({ history, variety, family, entropy: opts.entropy == null ? (cur ? cur.seed : '') : opts.entropy });
  return r && { seed: r.seed, style: r.style, family: r.family, archetype: r.archetype, label: r.label };
}
