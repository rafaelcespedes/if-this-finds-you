// Hands as fictional writers: word seeds, a name derived from the seed, plain-word descriptions,
// and a "new hand" that always lands somewhere clearly different from the current one.
import { makeHand, rng, styleNames, type Hand } from '@engine';

const ADJECTIVES = [
  'quiet', 'amber', 'salt', 'misty', 'lunar', 'velvet', 'cedar', 'honey', 'wild', 'copper', 'olive', 'north',
  'soft', 'linen', 'ember', 'fern', 'maple', 'paper', 'still', 'early', 'hollow', 'silver', 'rusty', 'gentle',
  'brisk', 'dusky', 'woolen', 'pale', 'sunday', 'winter', 'tidal', 'mossy', 'flint', 'clover', 'saffron', 'slate',
];
const NOUNS = [
  'heron', 'river', 'harbor', 'sparrow', 'meadow', 'lantern', 'pebble', 'orchard', 'comet', 'thistle', 'willow',
  'canyon', 'garden', 'atlas', 'quill', 'moth', 'tide', 'birch', 'kettle', 'fable', 'finch', 'lark', 'hazel',
  'ferry', 'attic', 'parcel', 'compass', 'marrow', 'juniper', 'inkwell', 'postcard', 'cobble', 'wren', 'harvest',
];

// Fictional writers. First names and surnames come from many places, and the pairing is chance.
const FIRST = [
  'Ada', 'Ottilie', 'Bastien', 'Mirela', 'Ines', 'Tomasz', 'Hugo', 'Wren', 'Linnea', 'Matteo', 'Noor', 'Elif',
  'Anouk', 'Søren', 'Clara', 'Teodor', 'Yara', 'Emil', 'Margit', 'Rosa', 'Felix', 'Ilse', 'Niamh', 'Arlo',
  'Leonie', 'Pilar', 'Henrik', 'Saoirse', 'Jules', 'Mira', 'Oskar', 'Beatrix', 'Amara', 'Kenji', 'Lucia',
  'Viggo', 'Dorothea', 'Idris', 'Hana', 'Magnus', 'Esme', 'Aurelio', 'Signe', 'Thea', 'Casimir', 'Odile',
];
const LAST = [
  'Marsh', 'Lindqvist', 'Moreau', 'Hale', 'Okafor', 'Brandt', 'Castell', 'Novak', 'Ferrante', 'Ashby', 'Halloran',
  'Varga', 'Quint', 'Rowe', 'Sandoval', 'Thorne', 'Weller', 'Bellamy', 'Carver', 'Dunmore', 'Eskildsen', 'Fairley',
  'Gallo', 'Hartmann', 'Ivers', 'Juhl', 'Kessler', 'Lowell', 'Mendes', 'Nyberg', 'Orsini', 'Pryor', 'Sorel',
  'Tamura', 'Ulrich', 'Vance', 'Whitlock', 'Ybarra', 'Zielinski', 'Achterberg', 'Belmonte', 'Kowal', 'Rautio',
];

function cryptoInt(n: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

/** A fresh word seed like `quiet-heron-17`. */
export function randomSeed(): string {
  const a = ADJECTIVES[cryptoInt(ADJECTIVES.length)];
  const b = NOUNS[cryptoInt(NOUNS.length)];
  return `${a}-${b}-${cryptoInt(90) + 10}`;
}

/** The writer's name, fixed for the seed (style does not change who they are). */
export function writerName(seed: string): string {
  const r = rng('writer:' + seed.trim().toLowerCase());
  return `${r.pick(FIRST)} ${r.pick(LAST)}`;
}

// ---------- plain words for the controls ----------
export const words = {
  neatness: (v: number) => (v < 0.25 ? 'Scrawled' : v < 0.45 ? 'Hurried' : v < 0.65 ? 'Relaxed' : v < 0.85 ? 'Careful' : 'Meticulous'),
  slant: (v: number) =>
    v < -7 ? 'Leans back' : v < -2 ? 'Slightly back' : v <= 2 ? 'Upright' : v <= 8 ? 'Slight lean' : v <= 16 ? 'Leans forward' : 'Strong lean',
  penWidth: (v: number) => (v < 34 ? 'Fine' : v < 52 ? 'Medium' : v < 72 ? 'Broad' : 'Bold'),
  pressure: (v: number) => (v < 0.18 ? 'Even' : v < 0.4 ? 'Light' : v < 0.62 ? 'Medium' : v < 0.8 ? 'Firm' : 'Heavy'),
  size: (v: number) => (v < 0.88 ? 'Small' : v <= 1.12 ? 'Medium' : 'Large'),
};

/** One short line about the hand, from its actual params: "A careful script, leaning forward". */
export function describeHand(p: Hand): string {
  const neat = words.neatness(p.neatness).toLowerCase();
  const style = p.style === 'script' ? 'script' : 'print';
  const s = p.slant;
  const lean = s < -2 ? 'leaning back' : s <= 2 ? 'upright' : s <= 9 ? 'with a slight lean' : 'leaning forward';
  const article = /^[aeiou]/.test(neat) ? 'An' : 'A';
  return `${article} ${neat} ${style}, ${lean}`;
}

// ---------- "New hand": a new person, not a near neighbour ----------
// Style is a fair coin (print or script). The seed decides everything else, so we draw several
// candidate writers in that style and keep the one furthest from the current hand on the traits
// people notice first.
const TRAITS: [keyof Hand, number][] = [
  ['neatness', 0.5], ['slant', 21], ['penWidth', 36], ['pressure', 0.55],
  ['xHeight', 0.18], ['width', 0.26], ['roundness', 0.85],
];
function distance(a: Hand, b: Hand) {
  let d = 0;
  for (const [k, span] of TRAITS) d += Math.abs((a[k] as number) - (b[k] as number)) / span;
  return d;
}

export function pickNewHand(current: { seed: string; style: string } | null, candidates = 10) {
  const styles = styleNames();
  const style = styles[cryptoInt(styles.length)];
  const base = current ? makeHand(current.seed, current.style) : null;
  let best = randomSeed();
  let bestD = -1;
  for (let i = 0; i < candidates; i++) {
    const seed = randomSeed();
    if (current && seed === current.seed) continue;
    const d = base ? distance(base, makeHand(seed, style)) : 0;
    if (d > bestD) { best = seed; bestD = d; }
  }
  return { seed: best, style };
}
