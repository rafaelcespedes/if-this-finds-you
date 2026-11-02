// tools/qa/lib/config.mjs — what the QA harness renders and the thresholds it judges by.
// Change texts or seeds here only on purpose: every change shows up as a regression diff
// (run `node tools/qa/run.mjs --update` afterwards and say why in the commit).

import { KERNEL } from './charsets.mjs';
import { seedList } from './util.mjs';

// Render settings mirror lab/app.js renderLive(): 720 px wide, 1 em = 58 px, line height 1.6 em.
export const RENDER = { width: 720, emPx: 58, lineEm: 1.6 };
export const NARROW_WIDTH = 320; // a phone column

// exactly 600 characters of ordinary correspondence: punctuation, digits, capitals, a date, a question.
export const PARAGRAPH = 'Dear Margot, thank you for the parcel. The quince jam arrived in one piece, which felt like ' +
  'a small miracle after the week we have had. It rained for nine days, the cellar flooded twice, and ' +
  'the dog refused to go out at all. Still, the garden looks wonderful: the roses are back, the beans are ' +
  'climbing, and Theo has finally fixed the gate. I am writing this at the kitchen table with your old fountain ' +
  'pen. Do you remember buying it in Lisbon, in 1998? Come and visit in June if you can. We will walk to the ' +
  'lighthouse, eat far too much, and talk until two in the morning. With love, Ada & the boys.';

// Kernel as text: ASCII in rows, then the 21 extras (U+00A0 sits between the brackets in "[ ]").
const kernelText = () => {
  const ascii = KERNEL.slice(1, 95).join('');                 // without the space
  const extras = KERNEL.slice(95).filter((c) => c !== ' ').join(' ');
  return [ascii.slice(0, 26), ascii.slice(26, 52), ascii.slice(52, 70), ascii.slice(70), extras, 'nbsp:[ ]'].join('\n');
};

export const TEXTS = {
  pangram: 'The quick brown fox jumps over the lazy dog.',
  repeat: 'eeeeeeee llllll 1111 ssss',
  prices: '$1,249.99 – 15% off · €3,50 · £7.20 · 7:30pm',
  caps: 'ALL CAPS: PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS!',
  punct: '“Don’t,” she said — it’s 3/4 done…',
  kernel: kernelText(),
  letter: 'Dear Ada,\nthe little letters never quite match, and that is the point.\nSee you at 7:30 - bring the old maps & a good pen!\nThe quick brown fox jumps over the lazy dog. 0123456789',
  // Tier 2 characters: misses today; these items are expected to change when accents land.
  accents: 'Crème brûlée à la façade — naïve Ærøskøbing, Łódź, İstanbul, Straße',
  // hostile input: leading/double spaces, a tab, an emoji, a decomposed é (e + U+0301), a very long URL
  edge: '  two  spaces,\ta tab, an emoji 😀, decomposed é, and https://example.com/a-very-long-path/without-any-spaces/at-all',
  paragraph: PARAGRAPH,
  // docs/research/human-feel.md §8.1 test texts (the human-ness rubric is measured on these)
  rRepeats: 'bookkeeper committee coffee balloon Mississippi assess llama little letters tttt',
  rSameWord: 'the the the the the the the the the the',
  rNumbers: '$1,249.99 · 07/11/2026 · 3 × 4 = 12 · 415-555-0132 · 98.6° · 1st, 2nd, 3rd · 7 ≠ 1',
  rCaps: 'PLEASE HANDLE WITH CARE — FRAGILE — THIS SIDE UP',
  rPunct: 'Wait — really? Yes! (Probably.) "Fine," she said; it\'s 5 o\'clock…',
  rSignoff: 'Thanks so much for everything! See you soon, — Ottilie',
  rDots: 'itinerary: titillating, jitter, quintet, fixity, Tutti-frutti',
};
// §8.1 text 3: 150–200 words of prose in one paragraph (line geometry, margins, fatigue)
TEXTS.long = PARAGRAPH + ' P.S. The neighbours finally cut down the old walnut tree, so the kitchen gets ' +
  'light in the afternoon now, and the cat sleeps on the windowsill from two until five. I have started ' +
  'baking bread again, badly. Theo says the third loaf was almost edible, which from him is high praise. ' +
  'If you still have the recipe for your mother\'s plum cake, please send it; I promised it to half the street.';
// sign-offs whose capital descenders (script Y, Z) hang deepest on a last line: page clipping test
TEXTS.clip = 'Love, Zoe — Yours, Yvonne';
export const RUBRIC_TEXTS = ['rRepeats', 'rSameWord', 'rNumbers', 'rCaps', 'rPunct', 'rSignoff', 'rDots'];

// Regression matrix: seeds x styles x pens x texts (+ a few targeted extras, see lib/engine.mjs).
export const MATRIX_SEEDS = ['maple-river-42', 'quiet-heron-17', 'amber-comet-88', 'ink-moth-51'];
export const MATRIX_TEXTS = ['pangram', 'repeat', 'prices', 'caps', 'punct', 'kernel', 'letter', 'accents', 'edge', ...RUBRIC_TEXTS];

// Seeds for the contact sheets (12 per style) and for statistics. Deterministic unless --fresh-seeds.
export const sheetSeeds = (random) => seedList(12, 'sheets', random);
export const statSeeds = (n = 24) => seedList(n, 'stats');
export const varietySeeds = (n = 200) => seedList(n, 'variety');

export const PERF = { iterations: 7, warmup: 2, regressionRatio: 1.3 };

// Geometry limits, in font units (UPM 1000, cap height 700, glyph contours y-up).
export const GEOM = {
  // layout(): first baseline at 0.95 em, page height = last baseline + 0.45 em. Ink beyond is cut off.
  topLimit: 950, bottomLimit: -450,
  advanceMin: 40, advanceMax: 1500,
  overhangWarn: 0.35,        // ink sticking out of the advance box, as a fraction of the advance (print only)
  joinBrokenPenWidths: 1.5,  // script join counts as broken if the exit is this many pen widths from the next letter
  joinBrokenRateWarn: 0.05,
};
