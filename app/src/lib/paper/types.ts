// The shape of a paper spec. All lengths in millimetres, measured from the sheet's top-left corner.

export type PaperId = string;
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Rule {
  color: string;
  /** line weight in mm */
  weight: number;
}

export interface Edge {
  /** deckle: a mould-made or handmade edge; torn: ripped from a stapled book; fringe: ripped off a spiral;
   *  perforated: torn along a perforation; worn: a straight cut softened by age (lib/paper/wear.ts) */
  kind: 'deckle' | 'torn' | 'fringe' | 'perforated' | 'worn';
  /** how far the edge may reach into the sheet, mm */
  depth: number;
  /** fringe: the spiral's hole pitch, mm */
  pitch?: number;
}

export interface PrintedWord {
  text: string;
  x: number;
  y: number;
  /** cap height, mm */
  size: number;
  color: string;
  align?: 'left' | 'center' | 'right';
}

export interface PaperSpec {
  /** this letter's sheet of it, aged (lib/paper/wear.ts wornPaper); absent: as new */
  wear?: import('./wear').Wear;
  /** a family ('notebook') or a family and its variant ('notebook-fr') */
  id: PaperId;
  /** the paper, as the picker shows it ('Notebook page') */
  family: string;
  name: string;
  /** this version of it ('French cahier') */
  variant: string;
  /** short plain-words hint: what it is and where it's from */
  hint: string;
  /** sheet size, mm (for the aerogramme, the whole unfolded sheet, flaps included) */
  w: number;
  h: number;
  tint: string;
  /** printed horizontal rules you write on */
  lines?: Rule & { pitch: number; first: number; last: number; x0?: number; x1?: number };
  /** Seyès: fine lines between the main lines, and the vertical lines of the big squares */
  seyes?: { fine: Rule; vertical: Rule; square: number };
  /** laid writing paper: fine laid lines (mm apart) crossed by chain lines, seen in the sheet itself */
  laid?: { pitch: number; chain: number; color: string };
  /** postcard back: centre divider, address lines, stamp box */
  postcard?: { divider: number; address: { x0: number; x1: number; ys: number[] }; stamp: [number, number, number, number]; color: string };
  /** vertical margin line(s), x from the left edge */
  margin?: Rule & { x: number; double?: number };
  /** binder holes (centre x, centre ys, diameter) */
  holes?: { x: number; ys: number[]; d: number };
  /** a lined guide sheet slipped under the page and seen through it; shown only while writing */
  guide?: Rule & { pitch: number; first: number; last: number; alpha: number; blur: number };
  /** edges that aren't cut straight */
  edges?: Partial<Record<Side, Edge>>;
  /** grain strength, cloudy formation, cockle (thin paper's waviness), translucency (the desk shows through),
   *  gum residue along the top (a sheet torn off a glued pad), inclusions (handmade paper), a coated card's sheen */
  finish?: { grain?: number; mottle?: number; cockle?: number; translucency?: number; gum?: boolean; specks?: number; sheen?: number };
  /** creases across the sheet (y from the top) */
  folds?: number[];
  /** short marks at the left edge (DIN 5008 fold and punch marks), mm long */
  ticks?: Rule & { marks: { y: number; len: number }[] };
  /** printed hairline border(s), inset from the edge */
  border?: Rule & { inset: number; count?: number; gap?: number };
  /** aerogramme: the main sheet sits inside the flaps (top flap `top` mm high, side flaps `sides` mm wide along
   *  the first `panel` mm); the outer `gum` mm of each flap carries the gum */
  flaps?: { top: number; sides: number; panel: number; gum: number };
  /** small printed words */
  print?: PrintedWord[];
  /** a small printed motif (ippitsusen): a flowering sprig, centred at x, y */
  motif?: { x: number; y: number; size: number };
  /** where the panel swatch looks (mm, top-left of a 40 x 30 mm crop) */
  swatch: { x: number; y: number };
  /** writing area: left/right edges and the first/last baseline, mm */
  text: { left: number; right: number; first: number; last: number };
  /** the pitch the writing keeps to (mm): printed rules or a guide sheet; 0 = free */
  pitch: number;
  /** comfortable x-height for this paper at size 1, mm */
  xh: number;
  /** what happens when the letter doesn't fit: more sheets, another card, the back of the card, or the last
   *  lines squeeze in (aerogramme) */
  overflow: 'sheets' | 'card' | 'back' | 'cramp';
  /** the back of a card (painted for sheets that are its back) */
  back?: Partial<PaperSpec>;
  /** New hand only picks it for letters up to this many characters */
  fits?: number;
  /** how often New hand picks it (the app's own roll) */
  roll: number;
}
