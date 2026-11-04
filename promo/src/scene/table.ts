// Section 4: all the letters on the table. The camera pulls back from the letter we were reading and it turns out
// to be one sheet among many, each a real letter from the archive written in its own hand, as the Letters page
// lays them out in the Reading Room: equal cells, every sheet standing on its row's line at its own paper's size,
// barely tilted, with its title and year under it.
//
// The other sheets are drawn the way the site's card worker draws them (app/src/archive/card.worker.ts): the
// letter's own look (archive/look.ts), the tool's paper painter, the engine's ink multiplied into the paper.
import { getPaper, paintPaper } from '@/lib/papers';
import { liveLayout } from '@/lib/live';
import { letterLook, renderingOf } from '@/archive/look';
import { engine, RR, text } from './ink';
import letters from '../../../content/sample-texts.json';

/** px per mm the sheets are drawn at (they are seen at most about this big while the camera pulls back) */
const CARD_K = 4;
/** a cell of the table, mm */
export const CELL = { w: 236, h: 330, shelf: 272 };
export const COLS = 9;
export const ROWS = 7;

export interface Card {
  id: string;
  col: number;
  row: number;
  /** the sheet's top-left on the table, mm */
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  title: string;
  meta: string;
  img: HTMLCanvasElement | null;
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; }

/** The ink multiplied into the paper, pixel by pixel, keeping the paper's own edge (card.worker.ts inkOnPaper). */
function inkOnPaper(ctx: CanvasRenderingContext2D, ink: HTMLCanvasElement, W: number, H: number) {
  const paper = ctx.getImageData(0, 0, W, H);
  const layer = ink.getContext('2d')!.getImageData(0, 0, W, H);
  const p = paper.data, k = layer.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const a = k[i + 3] / 255;
    p[i] = (p[i] * (k[i] * a + 255 * (1 - a))) / 255;
    p[i + 1] = (p[i + 1] * (k[i + 1] * a + 255 * (1 - a))) / 255;
    p[i + 2] = (p[i + 2] * (k[i + 2] * a + 255 * (1 - a))) / 255;
  }
  ctx.putImageData(paper, 0, 0);
}

function drawCard(L: any): HTMLCanvasElement {
  const look = letterLook(L);
  const r = renderingOf(look);
  const paper = r.paper as any;
  const W = Math.round(paper.w * CARD_K), H = Math.round(paper.h * CARD_K);
  const live = liveLayout(r.p, L.text, paper, r.size, r.lineSpacing, false);
  const to = live.sheets[1]?.fromLine ?? Infinity;
  const items = (live.page.items as any[]).filter((it) => it.line < to);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  paintPaper(ctx, paper, { pxPerMm: CARD_K, grainScale: 1, holeFill: 'clear', shadow: 'none' });
  const u = live.unitsPerMm;
  const ink = document.createElement('canvas');
  engine.renderCanvas(ink, r.p, { items, height: paper.h * u, lineHeight: live.lineMm * u }, {
    width: W, height: H, emPx: live.emMm * CARD_K, dpr: 1, style: false, paper: { transparent: true }, ink: r.inkKey ?? r.inkColor,
  });
  inkOnPaper(ctx, ink, W, H);
  return c;
}

let table: { cards: Card[]; center: Card } | null = null;

/** The table, with `centerId` in the middle cell (its sheet is drawn live by the letter section). */
export function layoutTable(centerId: string, centerPaper: { w: number; h: number }) {
  if (table && table.center.id === centerId) return table;
  const pool = (letters as any[]).filter((l) => l.enabled !== false && l.text && l.id !== centerId);
  const cards: Card[] = [];
  const cc = Math.floor(COLS / 2), cr = Math.floor(ROWS / 2);
  let k = 0;
  let center: Card | null = null;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const isCenter = row === cr && col === cc;
      const L = isCenter ? (letters as any[]).find((l) => l.id === centerId) : pool[(k++ * 7) % pool.length];
      const look = letterLook(L);
      const paper = isCenter ? centerPaper : getPaper(look.paper);
      const w = paper.w, h = paper.h;
      const cx = (col - cc) * CELL.w, top = (row - cr) * CELL.h;
      const card: Card = {
        id: L.id, col, row, w, h,
        x: cx - w / 2, y: top + CELL.shelf - h,
        tilt: isCenter ? 0 : (hash(L.id) - 0.5) * 1.6,
        title: String(L.title ?? ''),
        meta: [L.place, L.year].filter(Boolean).join(', '),
        img: null,
      };
      cards.push(card);
      if (isCenter) center = card;
    }
  }
  table = { cards, center: center! };
  return table;
}

/** Draw every sheet (slow: about a tenth of a second each). Call once, before the first table frame. */
export async function paintTable() {
  if (!table) return;
  for (const c of table.cards) {
    if (c === table.center || c.img) continue;
    const L = (letters as any[]).find((l) => l.id === c.id);
    try { c.img = drawCard(L); } catch (e) { console.warn('card', c.id, e); }
    await new Promise((r) => setTimeout(r, 0));
  }
}

export const tableReady = () => !!table && table.cards.every((c) => c === table!.center || c.img);

/** Paint the table (everything but the centre sheet) for a camera: k px/mm, table point (cx, cy) mm at the frame's centre. */
export function drawTable(ctx: CanvasRenderingContext2D, S: number, cam: { k: number; cx: number; cy: number }) {
  if (!table) return;
  ctx.fillStyle = RR.room;
  ctx.fillRect(0, 0, S, S);
  const X = (x: number) => S / 2 + (x - cam.cx) * cam.k;
  const Y = (y: number) => S / 2 + (y - cam.cy) * cam.k;
  for (const c of table.cards) {
    const x0 = X(c.x), y0 = Y(c.y), w = c.w * cam.k, h = c.h * cam.k;
    if (x0 > S || y0 > S + 60 * cam.k || x0 + w < 0 || y0 + h + 60 * cam.k < 0) continue;
    if (c !== table.center && c.img) {
      ctx.save();
      ctx.translate(x0 + w / 2, y0 + h);
      ctx.rotate((c.tilt * Math.PI) / 180);
      ctx.drawImage(c.img, -w / 2, -h, w, h);
      ctx.restore();
    }
    // the label under the sheet: title, then place and year in small capitals
    const size = 7.2 * cam.k;
    if (size >= 3) {
      const ty = Y(c.y + c.h) + 12 * cam.k;
      text(ctx, c.title, X(c.x + c.w / 2), ty, { size, align: 'center', italic: true, color: RR.ink });
      if (c.meta) text(ctx, c.meta, X(c.x + c.w / 2), ty + 9.5 * cam.k, { size: size * 0.82, align: 'center', caps: true, tracking: 0.05, color: RR.muted });
    }
  }
}

/** Where the centre sheet's top-left falls on the frame for a table camera. */
export function centerSheetAt(S: number, cam: { k: number; cx: number; cy: number }) {
  const c = table!.center;
  return { k: cam.k, x: S / 2 + (c.x - cam.cx) * cam.k, y: S / 2 + (c.y - cam.cy) * cam.k };
}
export const centerCard = () => table?.center ?? null;
