// The share image: a loose pile of real letters from the collection, each on its own paper, in its own hand, worn and
// stamped as the Reading Room shows it. Nothing here is drawn by hand or faked: every sheet is painted by the site's
// own paper painter (lib/papers.ts), written by the engine (render-canvas.js) in the letter's own hand
// (archive/look.ts, the same hand its page shows), aged by lib/paper/wear.ts and stamped by lib/paper/marks.ts with
// its catalogue number and postmark. This file only lays the sheets out and photographs them.
//
// Run it with `node tools/share-image/render.mjs` (README.md). Open by hand at the dev server's address to look:
// ?c=<composition> shows one, ?c=contact shows the candidate letters side by side.
import * as E from '@engine';
import { loadLetters } from '@/archive/data';
import { lookFor, renderingOf } from '@/archive/look';
import type { ArchiveLetter } from '@/archive/model';
import { liveLayout } from '@/lib/live';
import { isShaped, paintPaper, type PaperSpec } from '@/lib/papers';
import { wornPaper } from '@/lib/paper/wear';
import { planMarks, printMarks, setNoteWriter, type MarkInput } from '@/lib/paper/marks';
import { writeNote } from '@/lib/paper/pencil-note';
import { loadCatalogue, marksOf } from '@/themes/reading-room/catalogue';
import wordmarkSvg from '../../app/public/brand/wordmark-5.svg?raw';
import sansUrl from '../../app/src/themes/reading-room/fonts/schibsted-grotesk-latin.woff2?url';
import { COMPOSITIONS, CONTACT, type Composition, type Placed } from './compositions';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;

// the Reading Room's colours (themes/reading-room.css)
const ROOM = '#e6e4de';
const INK = '#1e2733';
const INK_SOFT = '#33405a';
// the Ruler's grid line and its rule: the ink at 12% and 20% over the room (themes/editorial.css --ed-line, --ed-rule)
const GRID_LINE = 'rgba(30, 39, 51, 0.12)';
const RULE = 'rgba(30, 39, 51, 0.2)';
// the Reading Room's sans (labels, the running head)
const SANS = '"Schibsted Grotesk", system-ui, sans-serif';
let sans: Promise<void> | null = null;
function loadSans() {
  sans ??= (async () => {
    const f = new FontFace('Schibsted Grotesk', `url(${sansUrl})`, { weight: '400 900' });
    document.fonts.add(await f.load());
  })();
  return sans;
}

// the archivist's pencilled notes are written in a real hand, as on the site (components/PaperCanvas.tsx)
setNoteWriter(writeNote);

let letters: Map<string, ArchiveLetter> | null = null;
async function ready() {
  if (letters) return letters;
  const [all] = await Promise.all([loadLetters(), loadCatalogue()]);
  letters = new Map(all.map((l) => [l.id, l]));
  return letters;
}

export interface Sheet {
  canvas: HTMLCanvasElement;
  /** mm */
  w: number;
  h: number;
  shaped: boolean;
  /** for the record */
  paper: string;
  hand: string;
}

/**
 * The ink multiplied into the paper, pixel by pixel, keeping the paper's own transparency (archive/card.worker.ts):
 * a pixel outside the paper stays clear, and a deckled or torn edge keeps its soft alpha.
 */
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

const sheets = new Map<string, Promise<Sheet>>();

/** One letter's first sheet, whole, at k px per mm: its paper, worn, its marks, its writing. Transparent around it. */
export function sheetOf(id: string, k: number): Promise<Sheet> {
  const key = `${id}@${k.toFixed(4)}`;
  let s = sheets.get(key);
  if (!s) sheets.set(key, (s = paintLetter(id, k)));
  return s;
}

async function paintLetter(id: string, k: number): Promise<Sheet> {
  const all = await ready();
  const letter = all.get(id);
  if (!letter) throw new Error(`No letter "${id}" in the collection`);
  // the letter's own hand, pen, ink and paper: what its page in All letters shows
  const look = lookFor(letter);
  const r = renderingOf(look);
  // its sheet of that paper, aged as it is everywhere on the site
  const paper: PaperSpec = wornPaper(r.paper, letter.id, letter.year);
  // the Reading Room's marks: its catalogue number and its postmark (themes/reading-room/SheetMarks.tsx)
  const m = marksOf(letter.id);
  const input: MarkInput | null = m
    ? { id: m.id, hand: look.seed, place: m.place || null, year: m.year ?? null, number: m.no, look: 'reading-room', origin: letter.found?.circumstance ?? null, kind: letter.kind }
    : null;
  const marks = input ? planMarks(paper, input).marks : [];

  const W = Math.round(paper.w * k), H = Math.round(paper.h * k);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  paintPaper(ctx, paper, { pxPerMm: k, grainScale: k / 3.5, holeFill: 'clear', shadow: 'none', marks: marks.length ? marks : undefined });

  // the letter's first sheet, whole lines only
  const live = liveLayout(r.p, letter.text, paper, r.size, r.lineSpacing, false);
  const to = live.sheets[1]?.fromLine ?? Infinity;
  const items = (live.page.items as any[]).filter((it) => it.line < to);
  const u = live.unitsPerMm;
  const ink = document.createElement('canvas');
  engine.renderCanvas(ink, r.p, { items, height: paper.h * u, lineHeight: live.lineMm * u }, {
    width: W, height: H, emPx: live.emMm * k, dpr: 1, style: false, paper: { transparent: true }, ink: r.inkKey ?? r.inkColor,
  });
  inkOnPaper(ctx, ink, W, H);
  // marks stamped after the letter was written sit over the ink
  if (marks.some((x) => x.layer === 'over')) printMarks(ctx, marks, k, 'over', paper);
  return { canvas, w: paper.w, h: paper.h, shaped: isShaped(paper), paper: paper.id, hand: `${look.seed}~${look.style} · ${look.pen} · ${look.ink}` };
}

// ---------- the wordmark ----------
let wordmark: Promise<HTMLImageElement> | null = null;
function wordmarkImage(color: string) {
  wordmark ??= (async () => {
    const svg = wordmarkSvg.replace(/currentColor/g, color).replace(/<title>.*?<\/title>/, '');
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await img.decode();
    return img;
  })();
  return wordmark;
}
const WORDMARK_RATIO = 708.4 / 97.5;

// ---------- the picture ----------
/** The 12 columns of the Ruler at this width (40 px margins, 32 px gutters, as on a desktop): x of each line. */
function gridLines(width: number) {
  const margin = 40, gutter = 32, cols = 12;
  const col = (width - 2 * margin - (cols - 1) * gutter) / cols;
  const xs: number[] = [];
  for (let i = 0; i < cols; i++) {
    const x0 = margin + i * (col + gutter);
    xs.push(x0, x0 + col);
  }
  return xs;
}

/** Paint a composition at S x its size (supersampled), then step it down to its size. */
export async function compose(c: Composition, S = 2): Promise<HTMLCanvasElement> {
  const W = c.width * S, H = c.height * S;
  const big = document.createElement('canvas');
  big.width = W;
  big.height = H;
  const g = big.getContext('2d')!;
  g.fillStyle = c.ground ?? ROOM;
  g.fillRect(0, 0, W, H);
  if (c.grid) {
    g.fillStyle = GRID_LINE;
    for (const x of gridLines(c.width)) g.fillRect(Math.round(x * S), 0, S, H);
  }
  const k = c.pxPerMm * S;
  for (const p of c.sheets) await place(g, p, k, S, c);
  if (c.head) {
    // the site's running head: a band of the room over the pile, fading out below, and its rule between the margins
    const hh = c.head.h * S, fade = 12 * S;
    g.fillStyle = c.ground ?? ROOM;
    g.fillRect(0, 0, W, hh);
    const grad = g.createLinearGradient(0, hh, 0, hh + fade);
    grad.addColorStop(0, c.ground ?? ROOM);
    grad.addColorStop(1, 'rgba(230, 228, 222, 0)');
    g.fillStyle = grad;
    g.fillRect(0, hh, W, fade);
    if (c.grid) {
      g.fillStyle = GRID_LINE;
      for (const x of gridLines(c.width)) g.fillRect(Math.round(x * S), 0, S, hh);
    }
    if (c.head.rule) {
      g.fillStyle = RULE;
      g.fillRect(40 * S, hh - S, W - 80 * S, S);
    }
    if (c.head.tagline) {
      await loadSans();
      g.save();
      g.fillStyle = INK_SOFT;
      g.font = `500 ${c.head.tagline.size * S}px ${SANS}`;
      g.textAlign = 'right';
      g.textBaseline = 'alphabetic';
      g.fillText(c.head.tagline.text, W - 40 * S, c.head.tagline.y * S);
      g.restore();
    }
  }
  if (c.wordmark) {
    const img = await wordmarkImage(c.wordmark.color ?? INK);
    const h = c.wordmark.h * S, w = h * WORDMARK_RATIO;
    g.save();
    g.globalAlpha = c.wordmark.alpha ?? 0.85;
    g.drawImage(img, c.wordmark.x * S, c.wordmark.y * S, w, h);
    g.restore();
  }
  return stepDown(big, c.width, c.height);
}

async function place(g: CanvasRenderingContext2D, p: Placed, k: number, S: number, c: Composition) {
  const sheet = await sheetOf(p.id, k * (p.scale ?? 1));
  const cv = sheet.canvas;
  g.save();
  g.translate(p.x * S, p.y * S);
  g.rotate((p.rot * Math.PI) / 180);
  // paper on paper: a sheet in a pile lifts a hair off the one under it. A soft shadow, low and close
  const lift = p.lift ?? c.lift ?? 1;
  if (lift > 0) {
    g.shadowColor = `rgba(52, 40, 22, ${0.2 * lift})`;
    g.shadowBlur = 14 * S * lift;
    g.shadowOffsetX = 0;
    g.shadowOffsetY = 3 * S * lift;
    g.drawImage(cv, -cv.width / 2, -cv.height / 2);
    // and the contact line right at its edge
    g.shadowColor = `rgba(52, 40, 22, ${0.16 * lift})`;
    g.shadowBlur = 2 * S;
    g.shadowOffsetY = 0.5 * S;
  }
  g.drawImage(cv, -cv.width / 2, -cv.height / 2);
  g.restore();
}

/** Halve until close, then the last step: a clean, sharp downscale. */
function stepDown(src: HTMLCanvasElement, w: number, h: number) {
  let cur = src;
  while (cur.width / 2 >= w * 1.0001) {
    const n = document.createElement('canvas');
    n.width = Math.round(cur.width / 2);
    n.height = Math.round(cur.height / 2);
    const x = n.getContext('2d')!;
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  if (cur.width === w && cur.height === h) return cur;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const x = out.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, w, h);
  return out;
}

// ---------- the contact sheet: candidate letters side by side, for choosing ----------
async function contact(ids: string[]) {
  const k = 1.4;
  const out = document.getElementById('out')!;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start';
  out.append(grid);
  for (const id of ids) {
    const s = await sheetOf(id, k);
    const fig = document.createElement('figure');
    fig.style.cssText = 'margin:0;width:' + s.canvas.width + 'px';
    s.canvas.style.cssText = 'display:block;box-shadow:0 1px 3px rgba(0,0,0,.15)';
    const cap = document.createElement('figcaption');
    cap.textContent = `${id} · ${s.paper} · ${s.hand}`;
    cap.style.cssText = 'font-size:11px;margin-top:4px';
    fig.append(s.canvas, cap);
    grid.append(fig);
  }
}

// ---------- automation (render.mjs) ----------
const toBase64 = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<string>((res, rej) =>
  c.toBlob(async (b) => {
    if (!b) return rej(new Error('encode failed'));
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    res(btoa(s));
  }, type, q));

const api = {
  names: () => Object.keys(COMPOSITIONS),
  /** one composition as PNG and JPEG (base64), and what each sheet is */
  async render(name: string, o: { jpeg?: number; S?: number } = {}) {
    const c = COMPOSITIONS[name];
    if (!c) throw new Error(`No composition "${name}"`);
    const canvas = await compose(c, o.S ?? 2);
    const [png, jpg] = await Promise.all([toBase64(canvas, 'image/png'), toBase64(canvas, 'image/jpeg', o.jpeg ?? 0.86)]);
    const used = await Promise.all(c.sheets.map(async (p) => {
      const s = await sheetOf(p.id, c.pxPerMm * (o.S ?? 2) * (p.scale ?? 1));
      return { id: p.id, paper: s.paper, hand: s.hand };
    }));
    return { width: canvas.width, height: canvas.height, png, jpg, sheets: used };
  },
};
(window as any).__share = api;

// by hand: ?c=<name> (default: every composition), ?c=contact
(async () => {
  const q = new URLSearchParams(location.search);
  const which = q.get('c');
  if (q.get('auto') === '0') return;
  try {
    if (which === 'contact') await contact(CONTACT);
    else {
      const names = which ? [which] : Object.keys(COMPOSITIONS);
      for (const n of names) {
        const cv = await compose(COMPOSITIONS[n]);
        const h = document.createElement('h3');
        h.textContent = n;
        document.getElementById('out')!.append(h, cv);
      }
    }
  } catch (err) {
    console.error(err);
  }
  (window as any).__shareReady = true;
})();
