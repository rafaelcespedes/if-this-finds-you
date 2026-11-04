// "If this / finds you", set in one hand (or, at the height of the flip, each word in its own hand), laid out by the
// engine and placed on two fixed baselines, each line centred on its ink. Only the hand changes from cut to cut:
// the baselines, the centre and the size stay put (the size is normalised between the hand's own em and its
// x-height, so a small-bodied joined hand and a big print hand read as the same size, as fonts in a specimen do).
import { engine, CAP, UPM, inkBox, shifted } from './ink';
import { handOf, type Look } from './hands';

export const LINES = [['If', 'this'], ['finds', 'you']];

export interface Group {
  p: any;
  emPx: number;
  /** items in this group's page units, already placed on the frame */
  items: any[];
}

export interface Geometry {
  size: number;
  /** reference x-height, px */
  xh: number;
  baselines: [number, number];
  maxW: number;
  cx: number;
  /** the counter's plate (top slot): top edge and height, px */
  plate: { y: number; h: number };
  /** the writer's name and its descriptor (bottom slot): baselines, px */
  name: number;
  descriptor: number;
}

// The frame is one centred stack, fixed for every hand: the counter's plate at the top, the phrase, the writer's name
// and descriptor at the bottom, with the same gap above the phrase (plate to the tallest letters) as below it (the
// deepest letters to the name). Measured at 1080 px, scaled to the frame.
const STACK = {
  top: 52, // plate's top edge, from the top edge
  plate: 98, // plate's height
  bottom: 52, // descriptor's baseline, from the bottom edge (the same margin as the plate's at the top)
  xh: 0.104, // reference x-height, share of the frame
  lines: 2.45, // baseline to baseline, x-heights
  asc: 1.85, // the tallest letters above the first baseline, x-heights (nominal)
  desc: 0.95, // the deepest letters below the second, x-heights (nominal)
  nameAsc: 24, // the name's capitals above its baseline
  descLine: 40, // name baseline to descriptor baseline
};

export function geometry(size: number): Geometry {
  const k = size / 1080;
  const xh = STACK.xh * size;
  const block = (STACK.asc + STACK.lines + STACK.desc) * xh;
  const gap = (size - STACK.bottom * k - STACK.top * k - STACK.plate * k - block - STACK.nameAsc * k - STACK.descLine * k) / 2;
  const b1 = STACK.top * k + STACK.plate * k + gap + STACK.asc * xh;
  const b2 = b1 + STACK.lines * xh;
  const name = b2 + STACK.desc * xh + gap + STACK.nameAsc * k;
  return {
    size, xh, baselines: [Math.round(b1), Math.round(b2)], maxW: 0.84 * size, cx: size / 2,
    plate: { y: STACK.top * k, h: STACK.plate * k }, name, descriptor: name + STACK.descLine * k,
  };
}

const REF_XH = 0.47; // a typical hand's x-height, as a share of the cap height

/** px per em for this hand: halfway (geometrically) between "same em" and "same x-height" */
function emFor(p: any, g: Geometry) {
  const ratio = (p.xHeight || REF_XH);
  const sameXh = g.xh / ((ratio * CAP) / UPM);
  const sameEm = g.xh / ((REF_XH * CAP) / UPM);
  return Math.sqrt(sameXh * sameEm);
}

interface Laid { items: any[]; box: number[]; base: number }
const laidCache = new Map<string, Laid>();
function laid(look: Look, text: string, ink: string | undefined, salt: string) {
  const key = `${look.seed}~${look.style}~${look.pen}~${ink}|${text}|${salt}`;
  let L = laidCache.get(key);
  if (!L) {
    const p = handOf(look, ink);
    const page = engine.layout(p, text, { maxWidth: 1e6, salt });
    const items = page.items.filter((it: any) => it.kind === 'glyph');
    const glyphs = items.length ? items : page.items;
    L = { items, box: inkBox(glyphs), base: glyphs[0]?.y ?? 0 };
    if (laidCache.size > 1200) laidCache.clear();
    laidCache.set(key, L);
  }
  return L;
}

const placedCache = new Map<string, Group[]>();

/**
 * The phrase in `looks`: one look sets the whole phrase; four looks set one word each.
 * Returns ink groups ready for drawInk, placed on the frame.
 */
export function phrase(looks: Look[], g: Geometry, ink?: string): Group[] {
  const key = looks.map((l) => `${l.seed}~${l.style}~${l.pen}`).join('|') + `|${ink}|${g.size}`;
  const hit = placedCache.get(key);
  if (hit) return hit;
  const perWord = looks.length > 1;
  // each line: pieces (a whole line, or words) with their own scale, laid side by side
  type Piece = { look: Look; L: Laid; em: number; p: any };
  const lines: Piece[][] = LINES.map((words, li) => {
    if (!perWord) {
      const look = looks[0];
      const p = handOf(look, ink);
      return [{ look, p, L: laid(look, words.join(' '), ink, 'promo'), em: emFor(p, g) }];
    }
    return words.map((w, wi) => {
      const look = looks[li * 2 + wi] ?? looks[0];
      const p = handOf(look, ink);
      return { look, p, L: laid(look, w, ink, 'promo'), em: emFor(p, g) };
    });
  });
  // widths in px; a word gap of 0.62 x-heights between words of different hands
  const gapPx = 0.62 * g.xh;
  const widthOf = (pc: Piece[]) => pc.reduce((a, x) => a + ((x.L.box[2] - x.L.box[0]) * x.em) / UPM, 0) + gapPx * (pc.length - 1);
  const widest = Math.max(...lines.map(widthOf));
  const fit = Math.min(1, g.maxW / widest);
  const groups: Group[] = [];
  lines.forEach((pc, li) => {
    const W = widthOf(pc) * fit;
    let x = g.cx - W / 2;
    for (const piece of pc) {
      const emPx = piece.em * fit;
      const sc = emPx / UPM;
      // place: the piece's ink starts at x, its first letter's baseline on the line's baseline
      const dx = x / sc - piece.L.box[0];
      const dy = g.baselines[li] / sc - piece.L.base;
      groups.push({ p: piece.p, emPx, items: shifted(piece.L.items, dx, dy) });
      x += (piece.L.box[2] - piece.L.box[0]) * sc + gapPx * fit;
    }
  });
  // merge pieces of the same hand (the whole-phrase case: two lines, one hand, one draw)
  const merged: Group[] = [];
  for (const gr of groups) {
    const same = merged.find((m) => m.p === gr.p && Math.abs(m.emPx - gr.emPx) < 1e-6);
    if (same) same.items = same.items.concat(gr.items);
    else merged.push({ ...gr });
  }
  if (placedCache.size > 600) placedCache.clear();
  placedCache.set(key, merged);
  return merged;
}
