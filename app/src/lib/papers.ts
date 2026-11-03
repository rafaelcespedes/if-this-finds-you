// Papers: what people really write letters on (docs/research/stationery.md), as physical specs in millimetres,
// and one painter (lib/paper/paint.ts) that draws a sheet on screen and in the downloaded JPEG, so they match.
// Seven papers, each with its own variants: a paper id is the family ('notebook') or family-variant
// ('notebook-fr'). Sizes come from makers' and retailers' listings; colours are matched by eye.
import type { PaperId, PaperSpec } from './paper/types';
import { isShaped } from './paper/outline';

export type { PaperId, PaperSpec } from './paper/types';
export { paintPaper, SHADOW_BLEED, type PaintOptions } from './paper/paint';
import { warmPaperArt } from './paper/paint';
export { isShaped } from './paper/outline';

type Base = Omit<PaperSpec, 'id' | 'family'>;
interface Family {
  id: string;
  base: Base;
  /** each patch is laid over the base; a field set to undefined is taken away */
  variants?: { id: string; variant: string; hint: string; roll: number; patch: Partial<Base> }[];
}

const COLLEGE_LAST = 25.4 + 32 * 7.14;
const LEGAL_LAST = 31 + 29 * 8.73;

const FAMILIES: Family[] = [
  {
    // A plain 90 g wove sheet torn off a writing pad, with the pad's lined guide sheet slipped underneath:
    // British, French and Japanese pads all come with one. The guide shows only while writing.
    id: 'pad',
    base: {
      name: 'Letter pad', variant: 'White A5', hint: 'Plain sheet from a pad, guide lines underneath',
      w: 148, h: 210, tint: '#fcfbf7',
      guide: { color: '#1f2833', weight: 0.45, pitch: 8, first: 30, last: 190, alpha: 0.055, blur: 0.5 },
      finish: { grain: 0.045, mottle: 0.14, gum: true },
      text: { left: 15, right: 133, first: 30, last: 190 },
      pitch: 8, xh: 2.9, overflow: 'sheets', roll: 10,
      swatch: { x: 4, y: 22 },
    },
    variants: [
      {
        // the small British pad, 137 x 178 mm, in azure blue
        id: 'uk', variant: 'British blue', hint: 'Small blue pad, 137 × 178 mm', roll: 5,
        patch: {
          w: 137, h: 178, tint: '#e5edf4',
          guide: { color: '#1c2836', weight: 0.5, pitch: 9, first: 22, last: 166, alpha: 0.06, blur: 0.5 },
          text: { left: 13, right: 124, first: 22, last: 166 }, pitch: 9, xh: 3.1,
          swatch: { x: 4, y: 16 },
        },
      },
      {
        // Japanese binsen, A5 cream: 15 printed rules 9.5 mm apart
        id: 'binsen', variant: 'Binsen', hint: 'Japanese letter paper, printed 9.5 mm rules', roll: 2,
        patch: {
          tint: '#faf6ea', guide: undefined, finish: { grain: 0.035, mottle: 0.15, gum: true },
          lines: { color: '#b9b0a2', weight: 0.2, pitch: 9.5, first: 38, last: 171, x0: 14, x1: 134 },
          text: { left: 16, right: 132, first: 38, last: 171 }, pitch: 9.5, xh: 3.1,
          swatch: { x: 4, y: 30 },
        },
      },
      {
        // a German A4 pad (DIN 5008 Form B): fold marks at 105 and 210 mm, the punch mark at 148.5 mm
        id: 'a4', variant: 'German A4', hint: 'A4 pad with fold and punch marks', roll: 3,
        patch: {
          w: 210, h: 297,
          guide: { color: '#1f2833', weight: 0.45, pitch: 8, first: 45, last: 277, alpha: 0.055, blur: 0.5 },
          ticks: { color: '#a3a7ab', weight: 0.2, marks: [{ y: 105, len: 5 }, { y: 148.5, len: 8 }, { y: 210, len: 5 }] },
          text: { left: 25, right: 190, first: 45, last: 277 }, xh: 3.1,
          swatch: { x: 0, y: 92 },
        },
      },
    ],
  },
  {
    // Cream laid letter paper, post quarto: laid lines about 1 mm apart, chain lines 25-35 mm apart, deckled
    // down the right and along the foot. Most surviving letters before the 1750s are on laid paper.
    id: 'laid',
    base: {
      name: 'Laid paper', variant: 'Cream', hint: 'Cream laid letter paper, deckled edge',
      w: 178, h: 229, tint: '#f7f0de',
      laid: { pitch: 0.95, chain: 26, color: '#7a6a4c' },
      edges: { right: { kind: 'deckle', depth: 2.5 }, bottom: { kind: 'deckle', depth: 2.5 } },
      finish: { grain: 0.05, mottle: 0.28 },
      text: { left: 20, right: 154, first: 32, last: 208 },
      pitch: 0, xh: 3.2, overflow: 'sheets', roll: 8,
      swatch: { x: 142, y: 203 },
    },
    variants: [
      {
        // eighteenth-century Dutch writing paper was tinted blue
        id: 'blue', variant: 'Blue-white', hint: 'Pale blue laid, as Dutch letter paper was', roll: 3,
        patch: { tint: '#ecf0ee', laid: { pitch: 0.95, chain: 27, color: '#56646c' } },
      },
      {
        // handmade cotton rag (khadi): four deckled edges, long fibres, a rough tooth and the odd fleck
        id: 'cotton', variant: 'Handmade cotton', hint: 'Handmade rag paper, four deckled edges', roll: 3,
        patch: {
          w: 148, h: 210, tint: '#f3eee2', laid: undefined,
          edges: {
            top: { kind: 'deckle', depth: 3.5 }, right: { kind: 'deckle', depth: 3.5 },
            bottom: { kind: 'deckle', depth: 3.5 }, left: { kind: 'deckle', depth: 3.5 },
          },
          finish: { grain: 0.08, mottle: 0.6, specks: 1 },
          text: { left: 18, right: 130, first: 30, last: 190 },
          swatch: { x: -4, y: -4 },
        },
      },
    ],
  },
  {
    // Onionskin airmail paper, B5, about 30 g/m²: pale blue, thin enough to see the desk, softly cockled, with
    // the pad's lined template showing plainly through. People wrote small on it to save weight.
    id: 'airmail',
    base: {
      name: 'Airmail', variant: 'Pale blue', hint: 'Thin blue onionskin, B5',
      w: 182, h: 257, tint: '#e7eef5',
      guide: { color: '#17212d', weight: 0.45, pitch: 8, first: 20, last: 244, alpha: 0.2, blur: 0.22 },
      finish: { grain: 0.03, mottle: 0.2, cockle: 0.7, translucency: 0.2 },
      text: { left: 13, right: 169, first: 20, last: 244 },
      pitch: 8, xh: 2.6, overflow: 'sheets', roll: 9,
      swatch: { x: 0, y: 4 },
    },
    variants: [{ id: 'white', variant: 'White', hint: 'Thin white onionskin', roll: 3, patch: { tint: '#f8f8f2' } }],
  },
  {
    // The inside of an unfolded aerogramme: one light-blue sheet in three 90.5 mm panels (184 x 90.5 folded,
    // the US size), a top flap and two side flaps with gum along their edges. Nothing may go inside, so the
    // writing runs edge to edge across the creases, small.
    id: 'aerogramme',
    base: {
      name: 'Aerogramme', variant: 'Air letter', hint: 'Blue air letter that folds into its own envelope',
      w: 208, h: 287.5, tint: '#dde7f0',
      flaps: { top: 16, sides: 12, panel: 90.5, gum: 5 },
      folds: [106.5, 197],
      print: [
        { text: 'NOTHING MAY BE ENCLOSED', x: 104, y: 10.6, size: 1.45, color: '#4a6390', align: 'center' },
        { text: 'SECOND FOLD', x: 193, y: 105, size: 1.45, color: '#4a6390', align: 'right' },
        { text: 'FIRST FOLD', x: 193, y: 195.5, size: 1.45, color: '#4a6390', align: 'right' },
      ],
      finish: { grain: 0.035, mottle: 0.2 },
      text: { left: 21, right: 187, first: 31, last: 279 },
      pitch: 0, xh: 2.45, overflow: 'cramp', fits: 1500, roll: 9,
      swatch: { x: 0, y: 80 },
    },
  },
  {
    // A page torn out of a notebook. One paper; the ruling is the region. Default: a US spiral notebook,
    // college ruled (9/32 in), with the spiral's fringe down the left.
    id: 'notebook',
    base: {
      name: 'Notebook page', variant: 'US spiral', hint: 'Torn from a spiral notebook, college ruled',
      w: 203.2, h: 266.7, tint: '#fcfcf9',
      lines: { color: '#9dc3e6', weight: 0.2, pitch: 7.14, first: 25.4, last: COLLEGE_LAST },
      margin: { color: '#e8737f', weight: 0.24, x: 31.75 },
      edges: { left: { kind: 'fringe', depth: 5.5, pitch: 6.35 } },
      finish: { grain: 0.045, mottle: 0.3 },
      text: { left: 34.5, right: 196, first: 25.4, last: COLLEGE_LAST },
      pitch: 7.14, xh: 2.55, overflow: 'sheets', roll: 4,
      swatch: { x: -3, y: 16 },
    },
    variants: [
      {
        // filler paper: 33 rules, a pink-red margin 1¼ in in, three 5/16 in holes 4¼ in apart
        id: 'loose', variant: 'US loose-leaf', hint: 'Filler paper with three holes', roll: 4,
        patch: { edges: undefined, holes: { x: 11, ys: [25.4, 133.35, 241.3], d: 7.9 }, swatch: { x: 0, y: 10 } },
      },
      {
        // a canary legal pad, 8½ x 11¾ in: wide rules (11/32 in), a double red margin, torn off at the top
        id: 'legal', variant: 'Legal pad', hint: 'Canary yellow, wide ruled', roll: 3,
        patch: {
          w: 215.9, h: 298.5, tint: '#f9ed9f',
          lines: { color: '#8db0cc', weight: 0.2, pitch: 8.73, first: 31, last: LEGAL_LAST },
          margin: { color: '#d9545a', weight: 0.24, x: 31.75, double: 2 },
          edges: { top: { kind: 'perforated', depth: 0.4 } },
          finish: { grain: 0.05, mottle: 0.3 },
          text: { left: 36, right: 209, first: 31, last: LEGAL_LAST }, pitch: 8.73, xh: 3,
          swatch: { x: 14, y: 18 },
        },
      },
      {
        // a 9 x 7 in exercise book: pale blue feint rules at 8 mm, a red margin, torn out at the staples
        id: 'uk', variant: 'UK exercise book', hint: 'Feint ruled 8 mm, torn out', roll: 2.5,
        patch: {
          w: 178, h: 229, tint: '#fdfcf8',
          lines: { color: '#a7c3e3', weight: 0.17, pitch: 8, first: 21, last: 221 },
          margin: { color: '#dc5a62', weight: 0.22, x: 27 },
          edges: { left: { kind: 'torn', depth: 2.5 } },
          text: { left: 29.5, right: 171, first: 21, last: 221 }, pitch: 8, xh: 2.9,
          swatch: { x: -3, y: 14 },
        },
      },
      {
        // a 17 x 22 cm cahier, Seyès ruled: violet lines and verticals every 8 mm, three light-blue
        // interlines at 2 mm, a red margin. Small letters fill one interline, as French schools teach.
        id: 'fr', variant: 'French cahier', hint: 'Seyès ruled, torn out', roll: 2.5,
        patch: {
          w: 170, h: 220, tint: '#fefdfa',
          lines: { color: '#9478bd', weight: 0.24, pitch: 8, first: 24, last: 208 },
          seyes: { fine: { color: '#aac0e6', weight: 0.11 }, vertical: { color: '#9478bd', weight: 0.2 }, square: 8 },
          margin: { color: '#e2505a', weight: 0.26, x: 32 },
          edges: { left: { kind: 'torn', depth: 2.5 } },
          text: { left: 34.5, right: 164, first: 24, last: 208 }, pitch: 8, xh: 2,
          swatch: { x: -3, y: 14 },
        },
      },
    ],
  },
  {
    // The message side of an A6 postcard: a divided back (message left, address right) and a stamp box.
    // Coated card, so a little sheen and almost no tooth. When the message runs on, it takes a second card.
    id: 'postcard',
    base: {
      name: 'Postcard', variant: 'A6', hint: 'The message side of a postcard',
      w: 148, h: 105, tint: '#fbf9f3',
      postcard: { divider: 76, address: { x0: 82, x1: 140, ys: [52, 64, 76, 88] }, stamp: [117, 9, 23, 28], color: '#b6ad9c' },
      print: [
        { text: 'POST CARD', x: 76, y: 6.6, size: 1.7, color: '#a59c8a', align: 'center' },
        { text: 'PLACE STAMP', x: 128.5, y: 21.6, size: 1.05, color: '#b6ad9c', align: 'center' },
        { text: 'HERE', x: 128.5, y: 24.2, size: 1.05, color: '#b6ad9c', align: 'center' },
      ],
      finish: { grain: 0.025, mottle: 0.12, sheen: 1 },
      text: { left: 9, right: 71, first: 17, last: 96 },
      pitch: 0, xh: 2.3, overflow: 'card', fits: 360, roll: 5,
      swatch: { x: 100, y: 4 },
    },
    variants: [
      {
        id: 'us', variant: '6 × 4 in', hint: 'The US postcard size', roll: 3,
        patch: {
          w: 152.4, h: 101.6,
          postcard: { divider: 78, address: { x0: 84, x1: 144, ys: [50, 62, 74, 86] }, stamp: [121, 8, 23, 27], color: '#b6ad9c' },
          print: [
            { text: 'POST CARD', x: 78, y: 6.2, size: 1.7, color: '#a59c8a', align: 'center' },
            { text: 'PLACE STAMP', x: 132.5, y: 20.1, size: 1.05, color: '#b6ad9c', align: 'center' },
            { text: 'HERE', x: 132.5, y: 22.7, size: 1.05, color: '#b6ad9c', align: 'center' },
          ],
          text: { left: 9, right: 73, first: 17, last: 93 },
          swatch: { x: 104, y: 4 },
        },
      },
    ],
  },
  {
    // A flat correspondence card, 6⅜ x 4¼ in: heavy ecru cotton, a navy triple hairline border. A long note
    // says "over" and carries on on the plain back.
    id: 'card',
    base: {
      name: 'Notecard', variant: 'Correspondence card', hint: 'Heavy cotton card with a printed border',
      w: 162, h: 108, tint: '#f6f0e1',
      border: { color: '#2f4f86', weight: 0.16, inset: 5, count: 3, gap: 0.7 },
      finish: { grain: 0.075, mottle: 0.3 },
      text: { left: 15, right: 147, first: 24, last: 94 },
      pitch: 0, xh: 2.6, overflow: 'back', back: { border: undefined }, fits: 420, roll: 6,
      swatch: { x: 0, y: 0 },
    },
    variants: [
      {
        // ippitsusen: a Japanese strip for a few lines tucked into a parcel, about 185 x 82 mm, 4-6 rules
        id: 'ippitsusen', variant: 'Ippitsusen', hint: 'Japanese short-note strip, a few ruled lines', roll: 2,
        patch: {
          w: 185, h: 82, tint: '#fbf8f0', border: undefined, back: undefined,
          lines: { color: '#c4bcb0', weight: 0.18, pitch: 10, first: 23, last: 63, x0: 12, x1: 173 },
          motif: { x: 170, y: 67, size: 22 },
          finish: { grain: 0.04, mottle: 0.2 },
          text: { left: 14, right: 171, first: 23, last: 63 }, pitch: 10, xh: 2.7,
          overflow: 'card', fits: 160,
          swatch: { x: 145, y: 46 },
        },
      },
    ],
  },
];

/** Every paper and variant, resolved. */
export const ALL_PAPERS: PaperSpec[] = FAMILIES.flatMap((f) => [
  { ...f.base, id: f.id, family: f.id },
  ...(f.variants ?? []).map((v) => ({ ...f.base, ...v.patch, variant: v.variant, hint: v.hint, roll: v.roll, id: `${f.id}-${v.id}`, family: f.id })),
]);
const byId = new Map(ALL_PAPERS.map((p) => [p.id, p]));

/** Make the shared paper textures and every outline in idle moments (once), so no New hand waits on them. */
let warmed = false;
export function warmPapers() {
  if (warmed) return;
  warmed = true;
  warmPaperArt(ALL_PAPERS);
}

/** The seven papers, as the picker shows them (each family's first version). */
export const PAPERS: PaperSpec[] = FAMILIES.map((f) => byId.get(f.id)!);

export const DEFAULT_PAPER: PaperId = 'pad';

/** Papers from before this set, so shared links keep working. */
export const PAPER_ALIASES: Record<string, PaperId> = {
  plain: 'pad',
  college: 'notebook-loose',
  seyes: 'notebook-fr',
  feint: 'notebook-uk',
  squared: 'pad',
  dots: 'pad',
};

/** One of today's papers (not an old name). */
export const isPaperId = (id: string | null | undefined): id is PaperId => !!id && byId.has(id);

/** The paper id a link or a sampler means, or null if it names no paper. */
export function resolvePaper(raw: string | null | undefined): PaperId | null {
  if (!raw) return null;
  if (byId.has(raw)) return raw;
  return PAPER_ALIASES[raw] ?? null;
}

export const getPaper = (id: string): PaperSpec => byId.get(resolvePaper(id) ?? DEFAULT_PAPER)!;

/** Every version of this paper (its family's default first). */
export const variantsOf = (id: string) => {
  const fam = getPaper(id).family;
  return ALL_PAPERS.filter((p) => p.family === fam);
};

/** The spec painted for sheet `i` of a letter: a notecard's odd sheets are its plain back. */
export function sheetPaper(paper: PaperSpec, i: number): PaperSpec {
  if (paper.overflow !== 'back' || i % 2 === 0 || !paper.back) return paper;
  return { ...paper, ...paper.back, id: `${paper.id}.back` };
}

/** The sheet's CSS shadow: none for a shaped sheet, whose own canvas paints a shadow that follows its edge. */
export const sheetShadow = (paper: PaperSpec) => (isShaped(paper) ? 'none' : 'var(--sheet-shadow)');

/** How likely New hand is to pick this paper for a letter this long (0 when it won't fit). */
export function paperRollWeight(id: PaperId, textLength: number) {
  const p = byId.get(id);
  if (!p) return 0;
  return p.fits && textLength > p.fits ? 0 : p.roll;
}

/**
 * Where the writing goes, given the em size (mm) of the hand at the chosen size.
 * On rules (printed or a guide sheet) baselines land on them: the first on a rule, the pitch one rule, or
 * two when the hand is too big for one.
 */
export function writingLines(paper: PaperSpec, emMm: number, xhMm: number, spacing = 1) {
  const { text } = paper;
  if (!paper.pitch) {
    // free lines: room for loops and tails, never tighter than ~3.6 x-heights
    const lineMm = Math.max(emMm * 1.28, xhMm * 3.6) * spacing;
    const count = Math.max(1, Math.floor((text.last - text.first) / lineMm) + 1);
    return { first: text.first, lineMm, perPage: count };
  }
  const k = emMm * spacing > paper.pitch * 1.6 ? 2 : 1;
  const lineMm = paper.pitch * k;
  const perPage = Math.max(1, Math.floor((text.last - text.first) / lineMm + 1e-6) + 1);
  return { first: text.first, lineMm, perPage };
}
