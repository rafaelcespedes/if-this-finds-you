// Printed marks: what an archive or a post office stamps on a letter (a datestamp, a cancellation, a receipt oval, a
// registry box, a straight-line town mark, an archivist's pencilled note) and the letter's number. They're printed
// into the sheet, never laid over it: rubber-stamp ink is uneven, the impression is fuller on one side, voids show
// where the rubber missed, the ink spreads a hair, and now and then the stamp bounced and struck twice. Everything
// multiplies with what's under it, so the paper's tooth shows through.
//
// planMarks() decides where and how, seeded by the letter and the hand (a letter is stable on reload); printMarks()
// paints them. Marks stamped before the letter was written sit under the handwriting (painted into the paper);
// marks stamped later sit over it (a layer above the writing). All invented: no real office, brand or postmark.
// Lengths in mm.
import type { PaperSpec } from './types';
import type { Ctx2D } from './paint';
import { rng } from './rng';
import { outlineOf, outlinePath } from './outline';
import { paintAdornment, type AdornKind } from './adorn';

export type MarkLook = 'reading-room' | 'postmarked' | 'default';

/** What a look knows about the letter. */
export interface MarkInput {
  /** the letter (found letters: their id; your own: anything stable) */
  id: string;
  /** the hand writing it (its seed), so another hand gets another stamping */
  hand: string;
  place?: string | null;
  year?: number | null;
  /** the archive's number for it */
  number?: number | null;
  /** a boxed cancellation, where the provenance says so ("UNDELIVERED") */
  cancel?: string | null;
  look: MarkLook;
  /** force one badge kind (1-6) for review; the URL's ?badge=N does the same */
  badge?: number | null;
  /** the letter's provenance and kind, for the marks of its era (adorned set) */
  origin?: string | null;
  kind?: string | null;
  /** plain, organic or adorned (else the URL's ?marks=, else the default) */
  mode?: MarkMode;
}

/** 1 double-ring datestamp · 2 ring with bars · 3 receipt oval · 4 registry box · 5 straight-line mark · 6 pencil note */
export type BadgeKind = 1 | 2 | 3 | 4 | 5 | 6;
type Kind = 'datestamp' | 'duplex' | 'oval' | 'registry' | 'line' | 'pencil' | 'number' | 'cancel' | 'folio' | AdornKind;
const ADORN = new Set<Kind>(['fold', 'seal', 'pin', 'clip', 'fox', 'tide']);
const BADGES: Kind[] = ['datestamp', 'duplex', 'oval', 'registry', 'line', 'pencil'];

export interface Mark {
  kind: Kind;
  /** centre, mm */
  x: number;
  y: number;
  /** the mark's main size, mm (a ring's diameter, a box's width) */
  size: number;
  /** radians */
  rot: number;
  ink: string;
  layer: 'under' | 'over';
  text: { place?: string; year?: string; number?: string; label?: string };
  /** how much ink reached the paper, 0..1 */
  press: number;
  /** the side the impression is fuller on (radians) and how uneven it is, 0..1 */
  lean: number;
  uneven: number;
  /** a second, faint strike (the stamp bounced), offset in mm */
  bounce: [number, number] | null;
  seed: string;
  /** an adornment's numbers (a fold's creases, foxing's spots) */
  data?: number[];
  /** how this impression went wrong, if it did (the organic set; most marks have none) */
  flaws?: Flaw[];
  /** the numbering machine's wheels: which one sat a hair off (mm, + is low) and how much ink each figure took */
  wheel?: { at: number; dy: number; ink: number[] };
}

/**
 * What can go wrong with a hand stamp: the ink feathering into the fibres, an over-inked stamp filling its counters,
 * a starved one breaking where it rocked, a faint second strike, a thumb smudge, the pad's weave in the fill, and
 * for the numbering machine a wheel sitting off its line.
 */
export type Flaw = 'bleed' | 'fill' | 'starved' | 'ghost' | 'smudge' | 'pad' | 'wheel';

/**
 * Which marks print: 'plain' (clean impressions), 'organic' (a seeded minority hand-applied, with one or two flaws) or
 * 'adorned' (organic, plus the small marks of the letter's era: folds, a pin's rust, an endorsement, a foliation).
 * ?marks=plain|organic|adorned in the URL picks one for the session.
 */
export type MarkMode = 'plain' | 'organic' | 'adorned';
export const DEFAULT_MARK_MODE: MarkMode = 'plain';
const MODES: MarkMode[] = ['plain', 'organic', 'adorned'];
let urlMode: MarkMode | null | undefined;
export function markMode(input?: Pick<MarkInput, 'mode'>): MarkMode {
  if (input?.mode) return input.mode;
  if (urlMode === undefined) {
    try {
      const q = new URLSearchParams(location.search).get('marks') as MarkMode;
      urlMode = MODES.includes(q) ? q : null;
    } catch {
      urlMode = null;
    }
  }
  return urlMode ?? DEFAULT_MARK_MODE;
}

export interface MarkPlan {
  marks: Mark[];
  /** changes whenever anything printed changes (for caches) */
  key: string;
}

const INKS = {
  red: '#a3322b', // archival red
  violet: '#3d3050', // violet-black
  blue: '#3f5f93', // faded blue
  pencil: '#55555b',
};

/**
 * Badge weights per look, [datestamp, ring and bars, oval, registry, line, pencil]. The reading room leans to the
 * archive's own stamps and never uses the ring with bars (its bars read as crossed-out writing); postmarked leans to
 * the post's. The pencilled note stays rare until it's written in the engine's own hand.
 */
const WEIGHTS: Record<MarkLook, number[]> = {
  'reading-room': [1.2, 0, 1.8, 1.4, 1.0, 0.4],
  postmarked: [2.4, 1.2, 0.4, 0.3, 1.4, 0],
  default: [1.2, 0, 1.8, 1.4, 1.0, 0.4],
};

/** Each mark's ink box around its centre, in units of its size: [left, right, top, bottom]. */
const BOX: Record<Kind, [number, number, number, number]> = {
  datestamp: [-0.5, 0.5, -0.5, 0.5],
  duplex: [-0.975, 1.2, -0.5, 0.5],
  oval: [-0.6, 0.6, -0.38, 0.38],
  registry: [-0.5, 0.5, -0.25, 0.25],
  line: [-0.95, 0.95, -0.34, 0.34],
  pencil: [-1.05, 1.05, -0.22, 0.22],
  number: [-0.9, 0.9, -0.25, 0.25],
  cancel: [-0.73, 0.73, -0.22, 0.22],
  folio: [-0.5, 0.5, -0.3, 0.3],
  // adornments (painted into the paper; these boxes keep other marks off them)
  fold: [0, 0, 0, 0],
  seal: [-0.6, 0.6, -0.6, 0.6],
  pin: [-0.75, 0.75, -0.3, 0.3],
  clip: [-0.2, 0.2, 0, 1],
  fox: [0, 0, 0, 0],
  tide: [0, 0, 0, 0],
};
/** the duplex's bars, which must never cross the writing */
const BARS: [number, number, number, number] = [0.3, 1.2, -0.42, 0.42];
/** how far each kind tilts, degrees */
const TILT: Record<Kind, number> = { datestamp: 15, duplex: 15, oval: 15, registry: 8, line: 8, pencil: 3, number: 8, cancel: 8, folio: 2, fold: 0, seal: 0, pin: 0, clip: 0, fox: 0, tide: 0 };
const RINGS = new Set<Kind>(['datestamp', 'duplex']);

type Box = [number, number, number, number];
/** A local box rotated and moved to (x, y): the axis-aligned box it covers, [x0, y0, x1, y1] in mm. */
function boxAt(local: Box, size: number, rot: number, x: number, y: number): Box {
  const c = Math.cos(rot), s = Math.sin(rot);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[local[0], local[2]], [local[1], local[2]], [local[1], local[3]], [local[0], local[3]]]) {
    const px = x + (u * c - v * s) * size, py = y + (u * s + v * c) * size;
    x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
  }
  return [x0, y0, x1, y1];
}
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const area = (a: Box) => (a[2] - a[0]) * (a[3] - a[1]);

/** The ink box of a placed mark (mm), for layers sized to their marks. */
export const markBox = (m: Pick<Mark, 'kind' | 'x' | 'y' | 'size' | 'rot'>) => boxAt(BOX[m.kind], m.size, m.rot, m.x, m.y);

/** A place as a stamp prints it: tidy spacing, no "Township of", never cut inside a word, never a non-place. */
export function stampPlace(raw: string | null | undefined, max = 16) {
  let p = (raw || '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  // someone else's cut ("AT SEA OFF THE AMERIC…"): drop the broken word
  if (/(…|\.\.\.)$/.test(p)) p = p.replace(/\s*\S*(…|\.\.\.)$/, '').trim();
  // not a town ("his country house"): no place at all
  if (/^(his|her|their|my|our|your)\b/i.test(p)) return '';
  if (/^at sea\b/i.test(p)) return 'At sea';
  p = p.replace(/\b(Township|County|Parish|Convent)( of)?\b\s*/gi, '').replace(/\s+,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  if (p.length <= max) return p;
  const parts = p.split(',').map((x) => x.trim()).filter(Boolean);
  const head = parts[0];
  if (head.length <= max) return head;
  // the town is too long: the region it's in, if that fits ("Fort Pillsburg, Liberia" → "Liberia")
  const region = parts.slice(1).find((x) => x.length <= max);
  if (region) return region;
  const words = head.split(' ');
  let out = words[0];
  for (const w of words.slice(1)) { if ((out + ' ' + w).length > max) break; out += ' ' + w; }
  return out;
}

function forcedBadge(input: MarkInput): number | null {
  if (input.badge) return input.badge;
  try {
    const b = Number(new URLSearchParams(location.search).get('badge'));
    return b >= 1 && b <= 6 ? b : null;
  } catch {
    return null;
  }
}

const pickWeighted = (r: () => number, w: number[]) => {
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
  return w.length - 1;
};

/** Where and how this letter was stamped. Pure in the input and the paper. */
export function planMarks(paper: PaperSpec, input: MarkInput): MarkPlan {
  const seed = `${input.id}|${input.hand}|${paper.family}`;
  const r = rng('marks:' + seed);
  const minSide = Math.min(paper.w, paper.h);
  const W = paper.w, H = paper.h;
  const fullPlace = stampPlace(input.place, 40);
  const shortPlace = stampPlace(input.place);
  const year = input.year != null ? String(input.year) : '';
  const marks: Mark[] = [];
  const mode = markMode(input);
  const T = paper.text;
  // the writing's block, with room for ascenders above the first line and descenders below the last
  const block: Box = [T.left, T.first - 5, T.right, T.last + 3];
  const iw = (T.right - T.left) * 0.25, ih = (T.last - T.first) * 0.25;
  const inMiddle = (x: number, y: number) => x > T.left + iw && x < T.right - iw && y > T.first + ih && y < T.last - ih;

  // Mostly hugging the sheet's edges (Rafael: "keep the stamps and numbers mostly near the edges"): the corners first,
  // then the top and bottom margins, now and then a side margin; now and then a mark drifts in partly over the
  // writing, at the edge of its block, never into the middle. Each mark gets up to ten seeded tries; a try fails when
  // it covers more than a quarter of the writing, lands in the middle of it, touches another mark, or (worded marks)
  // leaves the paper. Top and bottom marks shrink a little to fit their margin rather than reach the first line.
  const ZONES = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right', 'drift'] as const;
  const zoneW = [1.2, 1.4, 0.9, 1.15, 1.15, 0.95, 0.4, 0.4, 0.3];
  const used = new Set<number>();
  const placed: Box[] = [];
  const edgeIn = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const side of ['left', 'right', 'top', 'bottom'] as const) { const e = paper.edges?.[side]; if (e) edgeIn[side] = e.depth + 0.8; }
  const place = (kind: Kind, size0: number) => {
    let best: { x: number; y: number; rot: number; size: number; z: number; cost: number } | null = null;
    for (let tries = 0; tries < 10; tries++) {
      // a pencilled note goes in the top or bottom margin, nowhere else
      const z = pickWeighted(r, zoneW.map((w, i) => (kind === 'pencil' && i > 5 ? 0 : used.has(i) ? w * 0.1 : w)));
      const zone = ZONES[z];
      const rot = ((r() * 2 - 1) * TILT[kind] * Math.PI) / 180;
      // a ring may run a hair off an edge, about one time in five
      // a ring may run off an edge about one time in four (clipped to the sheet when printed)
      const over = RINGS.has(kind) && r() < 0.25 ? size0 * 0.07 : 0;
      const j = r() * r() * 6;
      const t = r();
      let size = size0;
      const ext = (sz: number) => boxAt(BOX[kind], sz, rot, 0, 0);
      // top and bottom: shrink to fit the margin (never below 80%)
      if (zone.startsWith('top') || zone.startsWith('bottom')) {
        const e = ext(1);
        const room = zone.startsWith('top') ? block[1] - 1.5 : H - block[3] - 1.5;
        const fit = (room + over) / (e[3] - e[1]);
        if (fit < size) size = Math.max(size * 0.8, fit);
      }
      const e = ext(size);
      // the duplex's bars may run off the right edge: only its ring has to stay on
      const right = kind === 'duplex' ? boxAt([BOX.duplex[0], 0.05, -0.5, 0.5], size, rot, 0, 0)[2] : e[2];
      // a torn, deckled or spiral-ripped side takes its depth back from the room (so a word isn't lost in the fringe)
      const L = -e[0] - over + edgeIn.left, R = right - over + edgeIn.right, U = -e[1] - over + edgeIn.top, D = e[3] - over + edgeIn.bottom;
      const along = (lo: number, hi: number) => lo + t * Math.max(0, hi - lo);
      let x: number, y: number;
      switch (zone) {
        case 'top-left': x = L + j; y = U + j * 0.6; break;
        case 'top-right': x = W - R - j; y = U + j * 0.6; break;
        case 'bottom-left': x = L + j; y = H - D - j * 0.6; break;
        case 'bottom-right': x = W - R - j; y = H - D - j * 0.6; break;
        case 'top': x = along(W * 0.25, W * 0.75); y = U + j * 0.6; break;
        case 'bottom': x = along(W * 0.25, W * 0.75); y = H - D - j * 0.6; break;
        case 'left': x = L + j; y = along(H * 0.3, H * 0.7); break;
        case 'right': x = W - R - j; y = along(H * 0.3, H * 0.7); break;
        default: {
          // partly over the writing: centred on the block's top or bottom edge, so most of it stays in the margin
          x = along(T.left + iw * 0.5, T.right - iw * 0.5);
          y = t < 0.5 ? block[1] : block[3];
        }
      }
      x = clamp(x, Math.min(L, W / 2), Math.max(W - R, W / 2));
      y = clamp(y, Math.min(U, H / 2), Math.max(H - D, H / 2));
      const b = boxAt(BOX[kind], size, rot, x, y);
      const share = overlapArea(b, block) / area(b);
      let cost = Math.max(0, share - (zone === 'drift' ? 0.45 : 0.25)) * 4;
      if (inMiddle(x, y)) cost += 5;
      if (kind === 'duplex' && overlapArea(boxAt(BARS, size, rot, x, y), block) > 0) cost += 3;
      const pad: Box = [b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3];
      for (const p of placed) if (overlapArea(pad, p) > 0) cost += 3;
      if (!best || cost < best.cost) best = { x, y, rot, size, z, cost };
      if (cost === 0) break;
    }
    used.add(best!.z);
    placed.push(boxAt(BOX[kind], best!.size, best!.rot, best!.x, best!.y));
    return best!;
  };
  const inkFor = (pal: (keyof typeof INKS)[]) => INKS[pal[Math.floor(r() * pal.length)]];
  const strike = (layerOdds: number) => ({
    press: 0.72 + r() * 0.26,
    lean: r() * Math.PI * 2,
    uneven: 0.25 + r() * 0.6,
    // a second, faint strike where the stamp bounced
    bounce: r() < 0.16 ? (() => { const a = r() * Math.PI * 2, d = 0.9 + r() * 0.5; return [Math.cos(a) * d, Math.sin(a) * d] as [number, number]; })() : null,
    // stamped before the letter was written (under the ink) or afterwards (over it)
    layer: (r() < layerOdds ? 'over' : 'under') as Mark['layer'],
  });

  // the location badge
  if (shortPlace || year) {
    const w = [...WEIGHTS[input.look]];
    // no place: nothing that is only a place; long places: not in the small oval or box
    if (!shortPlace) { w[4] = 0; w[5] = 0; }
    if (shortPlace.length > 12) { w[2] *= 0.3; w[3] *= 0.3; w[4] *= 1.5; }
    // the post's marks of the letter's day: no duplex before the 1840s, straight-line marks were older
    if (input.look === 'postmarked' && input.year != null) {
      if (input.year < 1840) { w[1] = 0; w[0] *= 0.4; w[4] *= 2.5; }
      else if (input.year < 1880) w[0] *= 0.8;
    }
    // the adorned set keeps to the letter's time: no rubber stamp before about 1870 (the archivist pencils a note
    // instead), and no post office handstamp at all before 1661
    if (mode === 'adorned' && input.year != null) {
      const rubber = input.look !== 'postmarked' && input.year < 1870;
      const prePost = input.look === 'postmarked' && input.year < 1661;
      if (rubber || prePost) w.fill(0, 0, 5).splice(5, 1, 1);
    }
    const picked = pickWeighted(r, w); // always drawn, so forcing a badge for review moves nothing else
    const forced = forcedBadge(input);
    const kind = BADGES[forced ? forced - 1 : picked];
    const base = clamp(minSide * 0.19, 19, 33) * 1.18 * (0.88 + r() * 0.26);
    const size0 = kind === 'registry' ? base * 1.25 : kind === 'line' ? base * 1.1 : kind === 'pencil' ? base * 1.15 : base;
    const postal = kind === 'datestamp' || kind === 'duplex' || kind === 'line';
    const at = place(kind, size0);
    const st = strike(kind === 'pencil' ? 1 : postal ? 0.9 : 0.75);
    marks.push({
      kind,
      x: at.x, y: at.y, rot: at.rot, size: at.size,
      ...st,
      // dark inks take less well on a worn pad
      press: st.press * (input.look === 'postmarked' ? 0.9 : 1),
      ink: kind === 'pencil' ? INKS.pencil : inkFor(input.look === 'postmarked' ? ['violet', 'violet', 'blue', 'red'] : ['red', 'violet', 'blue']),
      text: {
        // the oval and the box hold a short form (up to 12 letters, cut at a word); rings an arc's worth; the line all
        place: kind === 'pencil' ? fullPlace : (kind === 'line' ? fullPlace : kind === 'oval' || kind === 'registry' ? stampPlace(input.place, 12) : shortPlace).toUpperCase(),
        year,
        label: kind === 'oval' ? 'RECEIVED' : kind === 'registry' ? 'ENTERED' : undefined,
      },
      seed: seed + ':badge',
    });
  }
  // the number: always the numbering machine's stamp (never handwriting, which would fight the letter's own hand);
  // now and then the machine was pressed unevenly
  if (input.number != null) {
    const n = String(input.number).padStart(4, '0');
    const unevenStrike = r() < 0.3;
    const size0 = clamp(minSide * 0.11, 12, 19) * 1.18 * (0.9 + r() * 0.2);
    const at = place('number', size0);
    const st = strike(0.7);
    marks.push({
      kind: 'number',
      x: at.x, y: at.y, rot: at.rot, size: at.size,
      ...st,
      uneven: unevenStrike ? Math.min(0.95, st.uneven + 0.3) : st.uneven,
      ink: inkFor(['red', 'red', 'violet', 'blue']),
      text: { number: n },
      seed: seed + ':no',
    });
  }
  // a cancellation in red, true to the provenance
  if (input.cancel) {
    const at = place('cancel', clamp(minSide * 0.2, 20, 36) * 1.15);
    marks.push({ kind: 'cancel', x: at.x, y: at.y, rot: at.rot, size: at.size, ...strike(0.9), ink: INKS.red, text: { label: input.cancel.toUpperCase() }, seed: seed + ':cancel' });
  }
  if (mode === 'adorned') adorn(paper, input, seed, block, placed, marks);
  if (mode !== 'plain') for (const m of marks) handApplied(m, paper);
  const key = mode + marks.map((m) => `${m.kind}${m.x.toFixed(1)},${m.y.toFixed(1)},${m.rot.toFixed(3)},${m.size.toFixed(2)},${m.layer},${m.ink},${m.text.place ?? ''}${m.text.year ?? ''}${m.text.number ?? ''}${m.text.label ?? ''}${m.flaws?.join('') ?? ''}`).join(';');
  return { marks, key: hash(key) };
}

// ---------- the letter's life: folds, seal, pin, folio, stains (the adorned set; lib/paper/adorn.ts paints them) ----------
/**
 * What happened to this letter between its writing and the archive, by its year and kind (side notes,
 * stationery-adornments.md): how it was folded (a packet before envelopes, an envelope's fold after), what's left of
 * the wafer or wax that sealed it (1600-1849), the pin or later the paperclip that held it in a bundle, the
 * archivist's pencilled folio number, and for the hard-travelled foxing or a tide line. Seeded on their own stream,
 * so the stamps never move; at most three besides the creases, all in the margins except the creases and foxing.
 */
function adorn(paper: PaperSpec, input: MarkInput, seed: string, block: Box, placed: Box[], marks: Mark[]) {
  if (input.year == null) return;
  const r = rng('adorn:' + seed);
  const y = input.year, W = paper.w, H = paper.h;
  const origin = input.origin ?? 'notable';
  const note = input.kind === 'note';
  // ?adorn=all gives the letter every adornment its era allows, for review
  const all = (() => { try { return new URLSearchParams(location.search).get('adorn') === 'all'; } catch { return false; } })();
  const odds = (p: number) => (all ? p > 0 : r() < p);
  const base = { press: 1, lean: 0, uneven: 0, bounce: null, layer: 'under' as const, text: {}, rot: 0 };
  const add = (m: Partial<Mark> & Pick<Mark, 'kind' | 'x' | 'y' | 'size' | 'ink'>) => marks.push({ ...base, seed: `${seed}:${m.kind}`, ...m });
  /** a box (mm) clear of the stamps (2 mm round them), and of the writing unless allowed */
  const clear = (b: Box, writing = false) =>
    placed.every((p) => overlapArea([b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2], p) === 0) && (writing || overlapArea(b, block) === 0);

  // creases, on any paper that folds (not card, not a postcard, not one that brings its own folds)
  if (!paper.folds && paper.family !== 'postcard' && paper.family !== 'card' && paper.family !== 'aerogramme' && !(note && r() < 0.5)) {
    const d: number[] = [];
    const tilt = () => (r() - 0.5) * 0.008;
    if (note) d.push(0, H * (0.45 + r() * 0.1), tilt());
    else if (y < 1600) {
      // a packet: folded small, several times across and once or twice down, sometimes slit for its paper tag
      const n = clamp(Math.round(H / 40), 3, 5);
      for (let i = 1; i <= n; i++) d.push(0, (H * i) / (n + 1) + (r() - 0.5) * 6, tilt());
      d.push(1, W * (0.3 + r() * 0.08), tilt());
      if (r() < 0.5) d.push(1, W * (0.62 + r() * 0.08), tilt());
      if (r() < 0.3) { const sx = W * (0.4 + r() * 0.2), sy = (H * 1) / (n + 1) + 3; d.push(2, sx, sy, 2, sx, sy + 9 + r() * 3); }
    } else if (y < 1850) {
      // a letter sheet folded into its own packet: in thirds, and one side tucked in
      d.push(0, H / 3 + (r() - 0.5) * 4, tilt(), 0, (2 * H) / 3 + (r() - 0.5) * 4, tilt());
      const tuck = 25 + r() * 15;
      d.push(1, r() < 0.5 ? tuck : W - tuck, tilt());
    } else if (r() < 0.6) d.push(0, H / 2 + (r() - 0.5) * 4, tilt());
    else d.push(0, H / 3 + (r() - 0.5) * 3, tilt(), 0, (2 * H) / 3 + (r() - 0.5) * 3, tilt());
    add({ kind: 'fold', x: 0, y: 0, size: 1, ink: '#000', data: d });
  }

  let budget = all ? 6 : 3;
  // the seal: a wafer's fragment (1680-1849) or a smear of wax (before), on the edge band where the packet closed
  const sealOdds = note ? 0 : y >= 1600 && y < 1850 ? 0.4 : y < 1600 ? 0.25 : 0;
  if (odds(sealOdds)) {
    const wax = y < 1680;
    const size = y < 1600 ? 5 + r() * 3 : wax ? 8 + r() * 6 : 10 + r() * 8;
    const inks = wax ? ['#9b2b25', '#8e2a22'] : ['#8a6a48', '#8a6a48', '#7d5e3e', '#b0443a', '#c27a74', '#5f6f94'];
    const ink = inks[Math.floor(r() * inks.length)];
    for (let t = 0; t < 8; t++) {
      const right = r() < 0.55;
      const x = right ? W - (2 + r() * 9) : W * (0.3 + r() * 0.4);
      const yy = right ? H * (0.3 + r() * 0.4) : H - (2 + r() * 9);
      const b = boxAt(BOX.seal, size, 0, x, yy);
      if (!clear(b)) continue;
      add({ kind: 'seal', x, y: yy, size, rot: r() * Math.PI * 2, ink, text: { label: wax ? 'wax' : 'wafer' } });
      placed.push(b);
      budget--;
      break;
    }
  }
  // a pin through the corner (brass, then steel), or from 1895 a paperclip's rust
  const pinOdds = y < 1600 ? 0 : ['family', 'notable', 'emigrant', 'seized'].includes(origin) ? 0.2 : 0.1;
  if (budget > 0 && odds(pinOdds)) {
    const clip = y >= 1895;
    for (let t = 0; t < 4 && budget > 0; t++) {
      const left = t < 2;
      const x = clip ? (left ? 12 + r() * 16 : W - 12 - r() * 16) : left ? 7 + r() * 7 : W - 7 - r() * 7;
      const yy = clip ? -1.5 : 6 + r() * 7;
      const rot = clip ? (r() - 0.5) * 0.14 : (left ? -1 : 1) * (r() - 0.2) * 0.35;
      const size = clip ? 24 + r() * 8 : 4 + r() * 4;
      const kind = clip ? 'clip' : 'pin';
      const b = boxAt(BOX[kind], size, rot, x, yy);
      if (!clear(b, clip)) continue;
      add({ kind, x, y: yy, size, rot, ink: '#000', text: { label: y < 1850 ? 'brass' : 'steel' } });
      placed.push(b);
      budget--;
      break;
    }
  }
  // the archivist's folio number, pencilled top right (not on letters sent to a magazine, which no archive kept)
  const folioOdds = origin === 'everyday' && y >= 1880 ? 0 : y < 1700 ? 0.6 : y < 1850 ? 0.45 : 0.3;
  if (budget > 0 && odds(folioOdds)) {
    const n = 1 + Math.floor(r() * r() * 240);
    const pick = r();
    const label = pick < 0.5 ? `f. ${n}` : pick < 0.7 ? `fol. ${n}` : String(n);
    const size = 4 + label.length * 1.6;
    for (let t = 0; t < 3; t++) {
      const x = W - 9 - size / 2 - t * 6, yy = 9 + r() * 3 + t * 2;
      const b = boxAt(BOX.folio, size, 0, x, yy);
      if (!clear(b)) continue;
      add({ kind: 'folio', x, y: yy, size, rot: (r() - 0.5) * 0.04, ink: INKS.pencil, layer: 'over', text: { label } });
      placed.push(b);
      budget--;
      break;
    }
  }
  // the hard-travelled: a tide line from an edge (seized, undelivered); light foxing on rag paper of 1700-1889
  if (budget > 0 && odds(origin === 'seized' || origin === 'undelivered' ? 0.5 : 0)) {
    const corner = Math.floor(r() * 4);
    const x = corner % 2 ? W + 4 : -4, yy = corner < 2 ? -4 : H + 4;
    add({ kind: 'tide', x, y: yy, size: 26 + r() * 22, ink: '#000' });
    budget--;
  }
  if (budget > 0 && odds(y >= 1700 && y < 1890 ? 0.15 : 0)) {
    const d: number[] = [];
    const cx = W * (0.15 + r() * 0.7), cy = H * (0.15 + r() * 0.7);
    const n = 3 + Math.floor(r() * 7);
    for (let i = 0; i < n; i++) d.push(clamp(cx + (r() - 0.5) * 40, 2, W - 2), clamp(cy + (r() - 0.5) * 40, 2, H - 2), 0.3 + r() * r() * 1.3);
    add({ kind: 'fox', x: 0, y: 0, size: 1, ink: '#000', data: d });
  }
}

// ---------- hand-applied: what went wrong with this impression ----------
/** How far an ink runs into the fibres: aniline violet and red spread, the blue less, pencil not at all. */
const SPREAD: Record<string, number> = { [INKS.violet]: 1, [INKS.red]: 0.85, [INKS.blue]: 0.55, [INKS.pencil]: 0 };
/** How readily the paper drinks ink: cheap pulp and soft rag more than hard-sized laid, onionskin or coated card. */
function absorbency(paper: PaperSpec) {
  const by: Record<string, number> = { notebook: 0.9, card: 0.75, pad: 0.6, postcard: 0.5, laid: 0.35, airmail: 0.3, aerogramme: 0.3 };
  if (paper.id === 'laid-cotton' || paper.id === 'card-ippitsusen') return 0.85;
  if (paper.id === 'notebook-legal') return 0.75;
  return by[paper.family] ?? 0.6;
}

/**
 * Most impressions come out clean; a seeded minority (stable per letter, and on their own random stream so the
 * marks never move) get one flaw, now and then two. Which flaw follows the ink and the paper: a soft paper and an
 * aniline ink feather; a hard-sized sheet doesn't.
 */
function handApplied(m: Mark, paper: PaperSpec) {
  if (m.kind === 'pencil' || m.kind === 'folio' || ADORN.has(m.kind)) return;
  const r = rng('flaws:' + m.seed);
  const soak = (SPREAD[m.ink] ?? 0.7) * absorbency(paper);
  const n = r() < 0.42 ? (r() < 0.28 ? 2 : 1) : 0;
  if (m.kind === 'number') {
    // the numbering machine's figures never take ink quite evenly; one wheel in four sits a hair off its line
    m.wheel = { at: -1, dy: 0, ink: Array.from({ length: m.text.number?.length ?? 4 }, () => 0.7 + r() * 0.3) };
    if (r() < 0.26) { m.wheel.at = Math.floor(r() * m.wheel.ink.length); m.wheel.dy = (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.2); }
  }
  // ?flaw=bleed (or bleed,smudge) gives every mark those flaws, for review
  const forced = forcedFlaws();
  if (forced) { m.flaws = forced; return; }
  if (!n) return;
  const options: [Flaw, number][] = [
    ['bleed', 2.4 * soak],
    ['fill', 1],
    ['starved', 1],
    ['ghost', m.bounce ? 0 : 0.6],
    ['smudge', 0.45],
    ['pad', m.kind === 'duplex' || m.kind === 'number' || m.kind === 'cancel' ? 1 : 0.6],
  ];
  const flaws: Flaw[] = [];
  for (let i = 0; i < n; i++) {
    const left = options.filter(([f]) => !flaws.includes(f) && !(f === 'fill' && flaws.includes('starved')) && !(f === 'starved' && flaws.includes('fill')));
    flaws.push(left[pickWeighted(r, left.map(([, w]) => w))][0]);
  }
  m.flaws = flaws;
}

function forcedFlaws(): Flaw[] | null {
  try {
    const f = new URLSearchParams(location.search).get('flaw');
    return f ? (f.split(',') as Flaw[]) : null;
  } catch {
    return null;
  }
}

// ---------- the pencilled note, in a hand ----------
/** A note written by the handwriting engine: SVG path data in px at `em`, and where its words sit. */
export interface NoteWriting {
  paths: string[];
  left: number;
  width: number;
  baseline: number;
  em: number;
  /** x-height as a fraction of the em */
  xHeight: number;
}
let noteWriter: ((text: string) => NoteWriting | null) | null = null;
/** The page hands the printer a way to write the archivist's note in a real hand (lib/paper/pencil-note.ts). */
export function setNoteWriter(w: typeof noteWriter) {
  noteWriter = w;
}

// ---------- the letter on screen ----------
// The sheet that prints a letter's marks says so here, so a download or a video of that letter prints the same marks
// (planMarks is pure: same input, same marks). Nothing is registered without a look's <PaperMarks>, so a default
// download stays as it was.
let onScreen: { paperId: string; input: MarkInput; owner: object } | null = null;

/** A sheet on screen prints these marks (owner: whatever unregisters it later). */
export function showMarks(paperId: string, input: MarkInput, owner: object) {
  onScreen = { paperId, input, owner };
}
/** That sheet has gone (only its own registration is cleared). */
export function hideMarks(owner: object) {
  if (onScreen?.owner === owner) onScreen = null;
}
/** The marks to print on an exported copy of the letter on screen on this paper, or null. */
export function marksForExport(paper: PaperSpec): Mark[] | null {
  if (!onScreen || onScreen.paperId !== paper.id) return null;
  const { marks } = planMarks(paper, onScreen.input);
  return marks.length ? marks : null;
}

// ---------- printing ----------
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// shared ink textures, made once: speckle (where the rubber missed) and blotches (where it was over- or under-inked)
let speckleTile: AnyCanvas | null = null;
let blotchTile: AnyCanvas | null = null;
function speckle() {
  if (speckleTile) return speckleTile;
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d') as Ctx2D;
  const r = rng('marks:speckle');
  for (let i = 0; i < 520; i++) {
    g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.75})`;
    g.beginPath();
    g.arc(r() * S, r() * S, 0.35 + r() * r() * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  return (speckleTile = c);
}
function blotch() {
  if (blotchTile) return blotchTile;
  const S = 24;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d') as Ctx2D;
  const img = g.createImageData(S, S);
  const r = rng('marks:blotch');
  for (let i = 0; i < S * S; i++) img.data[i * 4 + 3] = Math.round(255 * Math.pow(r(), 1.6));
  g.putImageData(img, 0, 0);
  return (blotchTile = c);
}

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Courier New", Courier, monospace';
const SERIF = 'Georgia, "Times New Roman", serif';
const HAND = '"Bradley Hand", "Segoe Print", "Noteworthy", "Comic Sans MS", cursive';

/** Paint the marks of one layer onto a sheet (ctx at the sheet's origin, k px per mm). */
export function printMarks(ctx: Ctx2D, marks: Mark[], k: number, layer: 'under' | 'over', paper?: PaperSpec) {
  const these = marks.filter((m) => m.layer === layer);
  if (!these.length) return;
  ctx.save();
  // a mark that runs off the edge stops at the paper's real edge (deckle, tear, flaps, holes), never on the desk
  if (paper) clipToSheet(ctx, paper, k);
  for (const m of these) printMark(ctx, m, k, paper);
  ctx.restore();
}

/** Clip ctx (at the sheet's origin) to the sheet: its outline where it has one, else its rectangle. */
export function clipToSheet(ctx: Ctx2D, paper: PaperSpec, k: number, sheet = 0) {
  const o = outlineOf(paper, sheet);
  if (o) ctx.clip(outlinePath(o, k), 'evenodd');
  else {
    ctx.beginPath();
    ctx.rect(0, 0, paper.w * k, paper.h * k);
    ctx.clip();
  }
}

function printMark(ctx: Ctx2D, m: Mark, k: number, paper?: PaperSpec) {
  if (ADORN.has(m.kind)) { paintAdornment(ctx, m as Mark & { kind: AdornKind }, k, paper?.w ?? 0, paper?.h ?? 0); return; }
  const r = rng(m.seed);
  const flaws = m.flaws ?? [];
  const has = (f: Flaw) => flaws.includes(f);
  // the mark's own canvas, room for its widest form
  const span = m.kind === 'duplex' ? m.size * 2.5 : m.kind === 'line' || m.kind === 'pencil' || m.kind === 'number' ? m.size * 2.6 : m.kind === 'cancel' ? m.size * 1.6 : m.size * 1.4;
  const W = Math.ceil(span * k), H = Math.ceil(m.size * 1.4 * k);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d') as Ctx2D;
  g.translate(W / 2, H / 2);
  g.scale(k, k);
  g.fillStyle = g.strokeStyle = '#000';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  SHAPES[m.kind]!(g, m, r);
  g.setTransform(1, 0, 0, 1, 0, 0);

  const pencil = m.kind === 'pencil' || m.kind === 'folio';
  // a flaw's own randomness, so a clean mark draws exactly as it always did
  const fr = rng('flaw-print:' + m.seed);
  // the side the stamp rocked toward (the fuller side is the lean's); a point on the mark's rim that way
  const rock = m.lean + Math.PI + (fr() - 0.5) * 0.8;
  const [bl, br, bt, bb] = BOX[m.kind];
  const rim = (a: number, f = 1) => [W / 2 + Math.cos(a) * ((br - bl) / 2) * m.size * k * f, H / 2 + Math.sin(a) * ((bb - bt) / 2) * m.size * k * f] as const;
  // over-inked: the ink swells into the counters and thickens the rim on the stamp's fuller side
  if (has('fill')) {
    const d = Math.max(1, 0.16 * k);
    const fat = makeCanvas(W, H);
    const fg = fat.getContext('2d') as Ctx2D;
    for (let i = 0; i < 8; i++) fg.drawImage(c, Math.cos((i * Math.PI) / 4) * d, Math.sin((i * Math.PI) / 4) * d);
    const [fx, fy] = rim(m.lean, 0.5 + fr() * 0.4);
    const blob = fg.createRadialGradient(fx, fy, 0, fx, fy, m.size * k * (0.4 + fr() * 0.2));
    blob.addColorStop(0, 'rgba(0,0,0,0.95)');
    blob.addColorStop(1, 'rgba(0,0,0,0)');
    fg.globalCompositeOperation = 'destination-in';
    fg.fillStyle = blob;
    fg.fillRect(0, 0, W, H);
    g.drawImage(fat, 0, 0);
  }
  // ink: voids where the rubber missed (pencil: the paper's tooth catching graphite)
  g.globalCompositeOperation = 'destination-out';
  const sp = g.createPattern(speckle(), 'repeat');
  if (sp) {
    sp.setTransform(new DOMMatrix().translate(r() * 128, r() * 128).scale(Math.max(0.6, k / 7)));
    g.globalAlpha = pencil ? 0.75 : 0.38 + m.uneven * 0.3;
    g.fillStyle = sp;
    g.fillRect(0, 0, W, H);
    // and wider patches the rubber didn't reach at all
    if (!pencil) {
      sp.setTransform(new DOMMatrix().translate(r() * 300, r() * 300).scale(Math.max(1.6, k / 2.6)).rotate(r() * 90));
      g.globalAlpha = 0.22 + m.uneven * 0.25;
      g.fillRect(0, 0, W, H);
    }
  }
  // under- and over-inking: soft blotches, and one side of the impression fainter than the other
  g.globalAlpha = 0.34 + m.uneven * 0.36;
  g.imageSmoothingEnabled = true;
  g.drawImage(blotch(), -W * r() * 0.5, -H * r() * 0.5, W * 1.6, H * 1.6);
  const dx = Math.cos(m.lean), dy = Math.sin(m.lean);
  const grad = g.createLinearGradient(W / 2 - dx * W / 2, H / 2 - dy * H / 2, W / 2 + dx * W / 2, H / 2 + dy * H / 2);
  grad.addColorStop(0, `rgba(0,0,0,${(0.75 * m.uneven).toFixed(3)})`);
  grad.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.globalAlpha = 1;
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // starved: the pad was dry, the impression patchy, and where the stamp rocked off the rim breaks
  if (has('starved')) {
    if (sp) {
      sp.setTransform(new DOMMatrix().translate(fr() * 200, fr() * 200).scale(Math.max(1.1, k / 4)).rotate(fr() * 90));
      g.globalAlpha = 0.5;
      g.fillStyle = sp;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    const [bx, by] = rim(rock, 1);
    const gap = g.createRadialGradient(bx, by, 0, bx, by, m.size * k * (0.16 + fr() * 0.1));
    gap.addColorStop(0, 'rgba(0,0,0,0.97)');
    gap.addColorStop(0.55, 'rgba(0,0,0,0.7)');
    gap.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gap;
    g.fillRect(0, 0, W, H);
  }
  // the pad's cloth: its weave shows faintly in the fill
  if (has('pad')) {
    const wv = g.createPattern(weave(), 'repeat');
    if (wv) {
      wv.setTransform(new DOMMatrix().rotate(fr() * 30 - 15).scale(Math.max(0.6, k * 0.16)));
      g.globalAlpha = 0.5;
      g.fillStyle = wv;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }
  // colour it
  g.globalCompositeOperation = 'source-in';
  g.globalAlpha = 1;
  g.fillStyle = m.ink;
  g.fillRect(0, 0, W, H);

  // onto the sheet: multiplied, so the paper (and any writing under it) shows through; a hair of spread
  const soak = m.flaws ? (SPREAD[m.ink] ?? 0.7) * (paper ? absorbency(paper) : 0.6) : 0;
  const press = has('starved') ? m.press * 0.82 : m.press;
  const alpha = pencil ? 0.62 : m.ink === INKS.violet ? press * 0.82 : press;
  ctx.save();
  ctx.translate(m.x * k, m.y * k);
  ctx.rotate(m.rot);
  ctx.globalCompositeOperation = 'multiply';
  // feathering: a halo of the ink, only where it ran along the paper's fibres, under the impression itself
  if (has('bleed')) {
    const pad = Math.ceil(1.2 * k);
    const b = makeCanvas(W + 2 * pad, H + 2 * pad);
    const bg = b.getContext('2d') as Ctx2D;
    const far = (W + 2 * pad) * 2;
    bg.shadowColor = m.ink;
    bg.shadowBlur = Math.max(1.5, (0.45 + 0.5 * soak) * k);
    bg.shadowOffsetX = far;
    bg.drawImage(c, pad - far, pad);
    bg.shadowColor = 'transparent';
    const fib = bg.createPattern(fibres(), 'repeat');
    if (fib) {
      fib.setTransform(new DOMMatrix().translate(fr() * 96, fr() * 96).rotate(fr() * 180).scale(Math.max(0.4, k * 0.06)));
      bg.globalCompositeOperation = 'destination-in';
      bg.fillStyle = fib;
      bg.fillRect(0, 0, W + 2 * pad, H + 2 * pad);
    }
    ctx.globalAlpha = Math.min(1, alpha * (0.7 + 0.9 * soak));
    ctx.drawImage(b, -W / 2 - pad, -H / 2 - pad);
    ctx.drawImage(b, -W / 2 - pad, -H / 2 - pad);
    ctx.globalAlpha = alpha * 0.35 * soak;
    // and the ink's own soft spread, a little wider than a clean strike's
    ctx.drawImage(c, -W / 2, -H / 2);
  }
  // a faint second strike just beside the first (the hand bounced, the stamp turned a hair)
  if (has('ghost')) {
    const a = fr() * Math.PI * 2, d = (0.3 + fr() * 0.35) * k;
    ctx.save();
    ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
    ctx.rotate((fr() - 0.5) * 0.035);
    ctx.globalAlpha = alpha * (0.16 + fr() * 0.08);
    ctx.drawImage(c, -W / 2, -H / 2);
    ctx.restore();
  }
  // a thumb dragged across one edge while the ink was wet: the edge smeared outward, fading
  if (has('smudge')) {
    const a = rock + Math.PI + (fr() - 0.5) * 0.6;
    const [sx, sy] = rim(a, 0.9);
    const s = makeCanvas(W, H);
    const sg = s.getContext('2d') as Ctx2D;
    sg.drawImage(c, 0, 0);
    const spot = sg.createRadialGradient(sx, sy, 0, sx, sy, m.size * k * 0.32);
    spot.addColorStop(0, 'rgba(0,0,0,1)');
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = spot;
    sg.fillRect(0, 0, W, H);
    // dragged a couple of millimetres, the smear fading, the thumb wandering a little: built at a quarter of the
    // resolution and drawn back up, which also softens it
    const dir = a + (fr() - 0.5) * 0.9, step = 0.12 * k, n = 16, wob = (fr() - 0.5) * 0.06 * k;
    const q = 4, pad = Math.ceil(2.4 * k);
    const sm = makeCanvas(Math.ceil((W + 2 * pad) / q), Math.ceil((H + 2 * pad) / q));
    const smg = sm.getContext('2d') as Ctx2D;
    smg.imageSmoothingEnabled = true;
    for (let i = 1; i <= n; i++) {
      smg.globalAlpha = 0.17 * (1 - i / (n + 1));
      smg.drawImage(s, (pad + Math.cos(dir) * step * i - Math.sin(dir) * wob * i) / q, (pad + Math.sin(dir) * step * i + Math.cos(dir) * wob * i) / q, W / q, H / q);
    }
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sm, -W / 2 - pad, -H / 2 - pad, sm.width * q, sm.height * q);
  }
  ctx.globalAlpha = alpha;
  if (!pencil) {
    ctx.shadowColor = m.ink;
    ctx.shadowBlur = Math.max(0.6, 0.18 * k) * (m.flaws ? 0.8 + 0.5 * soak : 1);
  }
  ctx.drawImage(c, -W / 2, -H / 2);
  ctx.shadowBlur = 0;
  if (m.bounce && !pencil) {
    ctx.globalAlpha = m.press * 0.3;
    ctx.drawImage(c, -W / 2 + m.bounce[0] * k, -H / 2 + m.bounce[1] * k);
  }
  ctx.restore();
}

// the stamp pad's cloth, a plain weave (made once)
let weaveTile: AnyCanvas | null = null;
function weave() {
  if (weaveTile) return weaveTile;
  const c = makeCanvas(4, 4);
  const g = c.getContext('2d') as Ctx2D;
  g.fillStyle = 'rgba(0,0,0,0.85)';
  // threads over and under: a checker of 2-pixel cells
  for (let y = 0; y < 4; y += 2) for (let x = 0; x < 4; x += 2) if (((x + y) >> 1) % 2 === 0) g.fillRect(x, y, 2, 2);
  return (weaveTile = c);
}
// the paper's fibres, short strokes every way (made once): ink feathering runs along them
let fibreTile: AnyCanvas | null = null;
function fibres() {
  if (fibreTile) return fibreTile;
  const S = 96;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d') as Ctx2D;
  const r = rng('marks:fibres');
  g.lineCap = 'round';
  for (let i = 0; i < 300; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 3 + r() * r() * 14;
    g.strokeStyle = `rgba(0,0,0,${0.25 + r() * 0.75})`;
    g.lineWidth = 0.6 + r() * 0.8;
    const bend = (r() - 0.5) * 2;
    // drawn again past the tile's edges so it repeats without seams
    for (const [ox, oy] of [[0, 0], [-S, 0], [0, -S], [-S, -S]]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + bend, y + oy + Math.sin(a) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    }
  }
  return (fibreTile = c);
}

// ---------- the shapes (drawn black at mm scale, centred on 0,0) ----------
type Shape = (g: Ctx2D, m: Mark, r: () => number) => void;

const font = (px: number, face: string, weight = 600) => `${weight} ${px.toFixed(2)}px ${face}`;

/** Letters along a circle: centred at angle `at` (radians, 0 = right, -π/2 = top); outside: top arcs read left→right. */
function arcText(g: Ctx2D, text: string, rad: number, at: number, px: number, face: string, top: boolean, spacing = 0.12) {
  g.font = font(px, face);
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width + spacing * px);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = top ? at - total / rad / 2 : at + total / rad / 2;
  g.textAlign = 'center';
  // capitals centred on the arc (a 'middle' baseline centres the em box, which sits capitals high)
  g.textBaseline = 'alphabetic';
  chars.forEach((ch, i) => {
    const step = widths[i] / rad;
    const mid = top ? a + step / 2 : a - step / 2;
    g.save();
    g.translate(Math.cos(mid) * rad, Math.sin(mid) * rad);
    g.rotate(top ? mid + Math.PI / 2 : mid - Math.PI / 2);
    g.fillText(ch, 0, CAP_MID * px);
    g.restore();
    a = top ? a + step : a - step;
  });
}

/** Fit a word into a width: the font size that makes it so (capped). */
function fitPx(g: Ctx2D, text: string, face: string, width: number, max: number, spacing = 0.1) {
  g.font = font(max, face);
  const w = g.measureText(text).width + spacing * max * text.length;
  return Math.min(max, (max * width) / Math.max(1e-3, w));
}

/** where a capital's middle sits above the baseline, in ems */
const CAP_MID = 0.355;
/** the smallest capitals a stamp prints (mm of em: about 1.8 mm caps), so a town stays legible on a phone */
const MIN_EM = 2.5;

/** A line of letter-spaced text, its capitals centred on (x, y). */
function spaced(g: Ctx2D, text: string, x: number, y: number, px: number, face: string, spacing = 0.12, weight = 600) {
  g.font = font(px, face, weight);
  g.textBaseline = 'alphabetic';
  y += CAP_MID * px;
  g.textAlign = 'left';
  const chars = [...text];
  const ws = chars.map((ch) => g.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + spacing * px * (chars.length - 1);
  let cx = x - total / 2;
  chars.forEach((ch, i) => { g.fillText(ch, cx, y); cx += ws[i] + spacing * px; });
}

/** The em that sets a word around an arc of `deg` degrees at radius `rad` (measured, so it never wraps further). */
function arcPx(g: Ctx2D, text: string, rad: number, deg: number, max: number, spacing: number) {
  g.font = font(10, SANS);
  const w = [...text].reduce((a, ch) => a + g.measureText(ch).width + spacing * 10, 0);
  return Math.max(MIN_EM, Math.min(max, (10 * ((deg * Math.PI) / 180) * rad) / Math.max(1e-3, w)));
}
const track = (text: string) => (text.length <= 6 ? 0.16 : Math.max(0.08, 0.12));

const SHAPES: Partial<Record<Kind, Shape>> = {
  // 1. a double-ring datestamp: the town around the top, two small stars at the foot, the year across the middle
  datestamp(g, m) {
    const R = m.size / 2;
    g.lineWidth = 0.55;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 0.32;
    g.beginPath(); g.arc(0, 0, R * 0.6, 0, Math.PI * 2); g.stroke();
    const band = R * 0.783;
    const place = m.text.place || '';
    const sp = track(place);
    if (place) arcText(g, place, band, -Math.PI / 2, arcPx(g, place, band, 150, R * 0.27, sp), SANS, true, sp);
    for (const a of [Math.PI / 2 - 0.32, Math.PI / 2 + 0.32]) star(g, Math.cos(a) * band, Math.sin(a) * band, R * 0.07);
    if (m.text.year) spaced(g, m.text.year, 0, R * 0.027, R * 0.32, SANS, 0.06, 700);
    g.lineWidth = 0.25;
    for (const y of [-R * 0.3, R * 0.3]) { g.beginPath(); g.moveTo(-R * 0.36, y); g.lineTo(R * 0.36, y); g.stroke(); }
  },
  // 2. a single ring with the town and year inside, and the bars that cancelled the stamp beside it
  duplex(g, m, r) {
    const R = m.size / 2;
    const cx = -R * 0.95;
    g.save();
    g.translate(cx, 0);
    g.lineWidth = 0.5;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    const place = m.text.place || '';
    const sp = track(place);
    if (place) arcText(g, place, R * 0.76, -Math.PI / 2, arcPx(g, place, R * 0.76, 150, R * 0.27, sp), SANS, true, sp);
    if (m.text.year) spaced(g, m.text.year, 0, R * 0.2, R * 0.34, SANS, 0.05, 700);
    for (const a of [Math.PI / 2 - 0.3, Math.PI / 2 + 0.3]) star(g, Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72, R * 0.07);
    g.restore();
    // the bars: thick, slightly wavy, not quite even
    const x0 = cx + R * 1.25, x1 = cx + R * 3.35;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const y = (-0.78 + (1.56 * i) / (n - 1)) * R;
      g.lineWidth = R * (0.11 + r() * 0.03);
      g.beginPath();
      g.moveTo(x0, y);
      g.bezierCurveTo(x0 + (x1 - x0) * 0.33, y - R * 0.05, x0 + (x1 - x0) * 0.66, y + R * 0.05, x1, y + (r() - 0.5) * R * 0.04);
      g.stroke();
    }
  },
  // 3. an oval receipt stamp: RECEIVED · YEAR · PLACE
  oval(g, m) {
    const rx = m.size * 0.6, ry = m.size * 0.38;
    g.lineWidth = 0.5;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 0.25;
    g.beginPath(); g.ellipse(0, 0, rx * 0.9, ry * 0.84, 0, 0, Math.PI * 2); g.stroke();
    spaced(g, m.text.label || 'RECEIVED', 0, -ry * 0.44, ry * 0.26, SANS, 0.16);
    if (m.text.year) spaced(g, m.text.year, 0, ry * 0.03, ry * 0.42, SANS, 0.04, 700);
    const place = m.text.place || '';
    if (place) spaced(g, place, 0, ry * 0.48, Math.max(MIN_EM, fitPx(g, place, SANS, rx * 1.0, ry * 0.24, 0.14)), SANS, 0.14);
    for (const x of [-rx * 0.62, rx * 0.62]) { g.beginPath(); g.arc(x, -ry * 0.44, 0.35, 0, Math.PI * 2); g.fill(); }
  },
  // 4. a registry box: ENTERED above, then the place and the year in two cells
  registry(g, m) {
    const w = m.size, h = m.size * 0.5;
    g.lineWidth = 0.5;
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.lineWidth = 0.22;
    const inset = w * 0.025;
    g.strokeRect(-w / 2 + inset, -h / 2 + inset, w - 2 * inset, h - 2 * inset);
    const top = -h / 2 + h * 0.33;
    g.beginPath(); g.moveTo(-w / 2 + inset, top); g.lineTo(w / 2 - inset, top); g.stroke();
    // the place takes the wider cell, the year its own (wide enough for four figures)
    const split = w * 0.08;
    g.beginPath(); g.moveTo(split, top); g.lineTo(split, h / 2 - inset); g.stroke();
    spaced(g, m.text.label || 'ENTERED', 0, (-h / 2 + top) / 2 + 0.2, h * 0.17, SANS, 0.3);
    const place = m.text.place || '';
    const cellY = (top + h / 2 - inset) / 2;
    const placeW = split - (-w / 2 + inset);
    if (place) spaced(g, place, (-w / 2 + inset + split) / 2, cellY, Math.max(MIN_EM, Math.max(h * 0.15, fitPx(g, place, SANS, placeW - 2.4, h * 0.22, 0.08))), SANS, 0.08);
    const yearW = w / 2 - inset - split;
    if (m.text.year) spaced(g, m.text.year, split + yearW / 2, cellY, Math.min(h * 0.3, fitPx(g, m.text.year, SANS, yearW - 2.4, h * 0.3, 0.05)), SANS, 0.05, 700);
  },
  // 5. a straight-line town mark: the name in one line of capitals, the year under it
  line(g, m) {
    const place = m.text.place || '';
    const px = place ? Math.max(MIN_EM, fitPx(g, place, SERIF, m.size * 1.9, m.size * 0.22, 0.12)) : m.size * 0.2;
    if (place) spaced(g, place, 0, -px * 0.5, px, SERIF, 0.12, 700);
    if (m.text.year) spaced(g, m.text.year, 0, px * 0.8, Math.max(px * 0.72, m.size * 0.13), SANS, 0.1, 700);
    g.lineWidth = 0.45;
    const half = Math.min(m.size * 0.95, px * Math.max(4, place.length) * 0.45);
    g.beginPath(); g.moveTo(-half, -px * 1.2); g.lineTo(half, -px * 1.2); g.stroke();
  },
  // 6. an archivist's pencilled note, in a neat hand
  pencil(g, m) {
    const note = [m.text.place, m.text.year].filter(Boolean).join(', ');
    const w = noteWriter?.(note);
    if (w && w.paths.length) {
      // a neat archivist's print, x-height about 2.5 mm, narrowed only if it wouldn't fit
      const xh = 2.5;
      let s = xh / (w.xHeight * w.em);
      if (w.width * s > m.size * 2.1) s = (m.size * 2.1) / w.width;
      const half = (w.width * s) / 2;
      g.save();
      g.scale(s, s);
      g.translate(-(w.left + w.width / 2), -(w.baseline - (w.xHeight * w.em) / 2));
      for (const d of w.paths) g.fill(new Path2D(d));
      g.restore();
      // underlined below the descenders, the rule a little unsteady
      const y = (w.xHeight * w.em * s) / 2 + xh * 0.95;
      g.lineWidth = 0.2;
      g.beginPath();
      g.moveTo(-half * 0.86, y + 0.15);
      g.quadraticCurveTo(0, y - 0.3, half * 0.82, y + 0.1);
      g.stroke();
      return;
    }
    const px = fitPx(g, note, HAND, m.size * 2.1, m.size * 0.24, 0);
    g.font = font(px, HAND, 400);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(note, 0, 0);
    g.lineWidth = 0.18;
    g.beginPath();
    g.moveTo(-g.measureText(note).width * 0.42, px * 0.62);
    g.quadraticCurveTo(0, px * 0.7, g.measureText(note).width * 0.4, px * 0.58);
    g.stroke();
  },
  // the archivist's folio number, small and upright in the same pencil hand
  folio(g, m) {
    const label = m.text.label || '';
    const w = noteWriter?.(label);
    if (w && w.paths.length) {
      const xh = 1.9;
      const s = xh / (w.xHeight * w.em);
      g.save();
      g.scale(s, s);
      g.translate(-(w.left + w.width / 2), -(w.baseline - (w.xHeight * w.em) / 2));
      for (const d of w.paths) g.fill(new Path2D(d));
      g.restore();
      return;
    }
    g.font = font(3.2, HAND, 400);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 0, 0);
  },
  // the number: a numbering machine's figures (a small "No" with its o raised and underlined)
  number(g, m) {
    const px = m.size * 0.36;
    const n = m.text.number || '';
    g.font = font(px, MONO, 700);
    const nw = g.measureText(n).width;
    g.font = font(px * 0.85, MONO, 700);
    const NW = g.measureText('N').width;
    g.font = font(px * 0.5, MONO, 700);
    const oW = g.measureText('o').width;
    const total = NW + oW + px * 0.18 + nw;
    let x = -total / 2;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.font = font(px * 0.85, MONO, 700);
    g.fillText('N', x, px * 0.35);
    // the º: raised to the N's cap line and underlined
    g.font = font(px * 0.5, MONO, 700);
    g.fillText('o', x + NW, px * 0.12);
    g.fillRect(x + NW, px * 0.2, oW, px * 0.06);
    x += NW + oW + px * 0.18;
    g.font = font(px, MONO, 700);
    if (!m.wheel) { g.fillText(n, x, px * 0.35); return; }
    // figure by figure: each wheel takes its own ink, and one may sit a hair off the line
    const step = nw / Math.max(1, n.length);
    [...n].forEach((d, i) => {
      g.globalAlpha = m.wheel!.ink[i] ?? 1;
      g.fillText(d, x + i * step, px * 0.35 + (i === m.wheel!.at ? m.wheel!.dy : 0));
    });
    g.globalAlpha = 1;
  },
  // a boxed cancellation word
  cancel(g, m) {
    const label = m.text.label || '';
    const px = fitPx(g, label, SANS, m.size * 1.25, m.size * 0.2, 0.14);
    g.lineWidth = 0.55;
    const w = m.size * 1.42, h = px * 2.1;
    g.strokeRect(-w / 2, -h / 2, w, h);
    spaced(g, label, 0, 0.25, px, SANS, 0.14, 800);
  },
};

function star(g: Ctx2D, x: number, y: number, s: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? s * 0.45 : s;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
