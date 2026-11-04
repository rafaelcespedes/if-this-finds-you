// The launch thread's carousel: a real letter from the collection, written out in the hand the site gives it
// (archive/look letterLook: the letter's own writer, era-appropriate school, pen and period paper; renderingOf: the
// very hand the letter's page draws), framed close on its sheet, with a quiet caption underneath: who wrote it to
// whom and when, the writer who copied it out, and the seed. 1080 × 1350 (4:5, X's tallest image).
import { paintPaper, type PaperSpec } from '@/lib/papers';
import { pageSetup } from '@/lib/live';
import { letterLook, renderingOf } from '@/archive/look';
import { shortAuthor, shortRecipient } from '@/archive/data';
import { writerName } from '@/lib/hands';
import { STYLE_LABEL, PEN_LABEL } from '@/fonts/filters';
import { engine, drawInk, RR, UPM, text, shifted } from './ink';
import letters from '../../../content/sample-texts.json';

/** The candidates, oldest first: ten schools, five centuries, a few languages. */
export const CAROUSEL = [
  'stonor-1476', 'verney-1691', 'wheatley-1779', 'goya-1786', 'august-goethe-1797', 'hoen-1814',
  'carlyle-1850-from-nero', 'dickinson-1861', 'santa-1908-sister', 'stewart-1914-home', 'aibonito-1929',
];

const CAPTION = 214; // the caption band's height at 1080 wide
const XH = 25; // the writing's x-height, px at 1080 wide

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CarouselCard {
  id: string; seed: string; style: string; school: string; pen: string; writer: string;
  credit: string; year: string; place: string; lang: string;
}

function model(id: string) {
  const L = (letters as any[]).find((l) => l.id === id);
  const look = letterLook(L);
  const R = renderingOf(look);
  return { L, look, R };
}

export function cardOf(i: number): CarouselCard {
  const { L, look, R } = model(CAROUSEL[i]);
  const st = engine.getStyle(look.style) || {};
  const penKey = look.pen ?? R.p.pen;
  // the recipient's name only ("Katherine Ryche, about thirteen, his betrothed" → "Katherine Ryche")
  const to = shortRecipient(L).split(/[,:;(]/)[0].trim();
  return {
    id: L.id, seed: look.seed, style: look.style,
    school: (STYLE_LABEL as Record<string, string>)[look.style] ?? String(st.label ?? look.style),
    pen: String((PEN_LABEL as Record<string, string>)[penKey] ?? penKey).toLowerCase(),
    writer: writerName(look.seed),
    credit: to ? `${shortAuthor(L)} to ${to}` : shortAuthor(L),
    year: String(L.year ?? ''), place: String(L.place ?? ''), lang: String(L.lang ?? 'en'),
  };
}

export function drawCarousel(ctx: CanvasRenderingContext2D, i: number, W: number, H: number) {
  const k0 = W / 1080;
  const { L, R } = model(CAROUSEL[i]);
  const paper = R.paper as PaperSpec;
  const p = R.p as any;
  const band = CAPTION * k0;
  // the camera: the writing at XH px x-height; a column about 0.84 of the frame wide (the sheet's own, if narrower)
  const xhMm = paper.xh * R.size;
  // (and never so small that the sheet stops short of the frame's edges)
  const k = Math.max((XH * k0) / xhMm, W / paper.w); // px per mm
  const colMm = Math.min(paper.text.right - paper.text.left, (0.84 * W) / k);
  const lay = { ...paper, text: { ...paper.text, right: paper.text.left + colMm } } as PaperSpec;
  const setup = pageSetup(p, lay, R.size, R.lineSpacing);
  const page = engine.layout(p, String(L.text), setup.opts);
  const u = setup.u;
  const glyphs = (page.items as any[]).filter((it) => it.kind === 'glyph');
  const y0 = Math.min(...glyphs.map((it) => it.box[1])) / u;
  // the column's left edge at 8% of the frame; the first line's tops 8% down (never below the sheet's top edge)
  const cx = Math.min(0, Math.max(W - paper.w * k, 0.08 * W - paper.text.left * k));
  const cy = Math.min(0, 0.085 * H - y0 * k);
  // the room, then the sheet
  ctx.fillStyle = RR.room;
  ctx.fillRect(0, 0, W, H);
  const sheet = document.createElement('canvas');
  sheet.width = Math.ceil(paper.w * k);
  sheet.height = Math.ceil(paper.h * k);
  paintPaper(sheet.getContext('2d')!, paper, { pxPerMm: k, grainScale: k / 4, holeFill: 'clear', shadow: 'none' });
  ctx.drawImage(sheet, cx, cy);
  // the writing: whole lines that end above the caption, with room to spare
  const sc = k / u;
  const limit = H - band - 0.9 * XH * k0;
  const lineMax = new Map<number, number>();
  for (const it of page.items as any[]) if (it.box) lineMax.set(it.line, Math.max(lineMax.get(it.line) ?? -Infinity, it.box[3]));
  const shown = (page.items as any[]).filter((it) => (lineMax.get(it.line) ?? 0) * sc + cy <= limit);
  drawInk(ctx, p, shifted(shown, cx / sc, cy / sc), { emPx: sc * UPM, width: W, height: H, ink: R.inkKey ?? undefined });
  // the caption band
  const c = cardOf(i);
  const top = H - band;
  ctx.fillStyle = RR.card;
  ctx.fillRect(0, top, W, band);
  ctx.fillStyle = RR.edge;
  ctx.fillRect(0, top, W, Math.max(1, 1.5 * k0));
  const x = 0.08 * W;
  const when = [c.place, c.year].filter(Boolean).join(', ');
  text(ctx, c.credit, x, top + 66 * k0, { size: 36 * k0, color: RR.ink, role: 'name' });
  text(ctx, when, x, top + 106 * k0, { size: 24 * k0, color: RR.muted, role: 'meta' });
  text(ctx, `Copied out by ${c.writer} · ${c.school} · ${c.pen}`, x, top + 150 * k0, { size: 24 * k0, color: RR.ink, role: 'meta' });
  text(ctx, `Seed ${c.seed}`, x, top + 184 * k0, { size: 22 * k0, color: RR.red, role: 'credit' });
}
