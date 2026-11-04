// Section 3: a real letter, in the hand the flip landed on. It writes itself out (the engine's own pen timing, sped
// up), then the rest dims and every e turns archival red and changes form on the beat: each e on the page shows a
// different drawing, and they all move on together. Then the a's, then the r's. A font has one e; this hand has
// as many as it writes.
//
// The letter lies on its sheet of the tool's paper (lib/papers.ts, painted by the tool's painter) in sheet space
// (mm). The camera (scale px/mm and the sheet's top-left on the frame) frames its writing; section 4 pulls it back.
import { getStyle } from '@engine';
import { getPaper, paintPaper, type PaperSpec } from '@/lib/papers';
import { pageSetup } from '@/lib/live';
import { letterLook } from '@/archive/look';
import { engine, drawInk, RR, UPM } from './ink';
import { handOf, type Look } from './hands';
import letters from '../../../content/sample-texts.json';

export interface Cam {
  /** px per mm */
  k: number;
  /** where the sheet's top-left corner falls on the frame, px */
  x: number;
  y: number;
}

export interface LetterModel {
  id: string;
  p: any;
  paper: PaperSpec;
  u: number;
  emMm: number;
  items: any[];
  /** the writing's box on the sheet, mm */
  box: [number, number, number, number];
  tl: { events: any[]; duration: number };
  evOf: Map<number, Int32Array>;
  credit: { who: string; to: string; year: string; title: string };
  /** other drawings of a letter: layouts of the same text with that letter pinned to each form, by char index */
  forms(ch: string): Map<number, any>[];
  sheet(k: number): HTMLCanvasElement;
}

const cache = new Map<string, LetterModel>();

/** The letter's opening, as far as fits the video (whole sentences). */
export function excerpt(text: string) {
  const lines = text.split('\n');
  // the greeting and the first paragraph, and the signature when the letter is that short
  return lines.length <= 4 ? text : lines.slice(0, 2).join('\n');
}

export function letterModel(id: string, landing: Look): LetterModel {
  const key = `${id}|${landing.seed}~${landing.style}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const L = (letters as any[]).find((l) => l.id === id) ?? (letters as any[])[0];
  // the letter's own look (period paper, as the archive gives it), written in the landing hand
  const own = letterLook(L);
  const paper = getPaper(own.paper);
  const p = { ...handOf(landing), mistakes: 0 };
  const text = excerpt(L.text);
  // a narrower column than the sheet's own measure (as the site's video export does for close framing): more,
  // shorter lines, so the writing can be shown big in a square frame
  const measure = 0.6;
  const lay = { ...paper, text: { ...paper.text, right: paper.text.left + (paper.text.right - paper.text.left) * measure } } as PaperSpec;
  const setup = pageSetup(p, lay, own.size > 0 ? own.size : 1, 1);
  const page = engine.layout(p, text, setup.opts);
  const items = (page.items as any[]).filter((it) => it.kind === 'glyph');
  const u = setup.u;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) { x0 = Math.min(x0, it.box[0]); y0 = Math.min(y0, it.box[1]); x1 = Math.max(x1, it.box[2]); y1 = Math.max(y1, it.box[3]); }
  const tl = engine.timeline({ ...page, items }, { lead: 0 });
  const evOf = new Map<number, Int32Array>();
  tl.events.forEach((e: any, n: number) => {
    let a = evOf.get(e.item);
    if (!a) { a = new Int32Array(items[e.item].g.strokes.length).fill(-1); evOf.set(e.item, a); }
    a[e.stroke] = n;
  });
  const formCache = new Map<string, Map<number, any>[]>();
  const sheets = new Map<number, HTMLCanvasElement>();
  const m: LetterModel = {
    id: L.id, p, paper, u, emMm: setup.emMm, items, box: [x0 / u, y0 / u, x1 / u, y1 / u], tl, evOf,
    credit: { who: String(L.author ?? '').replace(/\s*\(.*\)$/, ''), to: String(L.recipient ?? ''), year: String(L.year ?? ''), title: String(L.title ?? '') },
    forms(ch) {
      let f = formCache.get(ch);
      if (f) return f;
      // the forms this hand's school has for the letter (its allographs), each in a few of the hand's own takes
      const st = p.style;
      const names = [...new Set((engine.variants(st, ch) as any[]).map((v) => engine.allographOf(v)))];
      if (!getStyle(st)) names.length = 0;
      const salts = ['a', 'b', 'c'];
      f = [];
      for (const salt of salts) {
        for (const name of names.length ? names : [null]) {
          const pp = name ? { ...p, pins: { ...(p.pins || {}), [ch]: name } } : p;
          const pg = engine.layout(pp, text, { ...setup.opts, salt: `form-${salt}` });
          const by = new Map<number, any>();
          for (const it of pg.items as any[]) if (it.kind === 'glyph' && it.ch === ch) by.set(it.charIndex, it);
          f.push(by);
        }
      }
      formCache.set(ch, f);
      return f;
    },
    sheet(k) {
      const kk = Math.round(k * 4) / 4;
      let c = sheets.get(kk);
      if (!c) {
        c = document.createElement('canvas');
        c.width = Math.ceil(paper.w * kk);
        c.height = Math.ceil(paper.h * kk);
        paintPaper(c.getContext('2d')!, paper, { pxPerMm: kk, grainScale: kk / 4, holeFill: 'clear', shadow: 'none' });
        sheets.set(kk, c);
      }
      return c;
    },
  };
  cache.set(key, m);
  return m;
}

/** The camera that frames the letter's writing, a little generous, in a square frame of size S. */
export function letterCam(m: LetterModel, S: number): Cam {
  const [x0, y0, x1, y1] = m.box;
  const w = x1 - x0, h = y1 - y0;
  const k = Math.min((0.8 * S) / w, (0.62 * S) / h);
  return { k, x: S / 2 - ((x0 + x1) / 2) * k, y: S * 0.47 - ((y0 + y1) / 2) * k };
}

/** Item moved by (dx, dy) page units, its ink box too. */
const moved = (it: any, dx: number, dy: number, extra?: object) =>
  ({ ...it, x: it.x + dx, y: it.y + dy, box: it.box && [it.box[0] + dx, it.box[1] + dy, it.box[2] + dx, it.box[3] + dy], ...extra });

/** Another drawing of a letter, placed where the original stands: centred on its ink, on its baseline. */
function placeLike(base: any, form: any) {
  const cb = (base.box[0] + base.box[2]) / 2, cf = (form.box[0] + form.box[2]) / 2;
  return moved(form, cb - cf, base.y - form.y);
}

export interface LetterState {
  /** pen time, seconds into the writing (Infinity = all written) */
  inkT: number;
  /** the highlighted letter, or null */
  ch: string | null;
  /** how many times it has changed form (0 = its own drawings) */
  step: number;
  /** 0..1: how far the rest has dimmed */
  dim: number;
}

/** Paint the letter on its sheet at camera c. */
export function drawLetter(ctx: CanvasRenderingContext2D, m: LetterModel, c: Cam, st: LetterState, S: number, ink?: string) {
  // the sheet (painted once at about this scale, drawn at the exact one)
  const sheet = m.sheet(Math.min(12, Math.max(1, c.k)));
  ctx.drawImage(sheet, c.x, c.y, m.paper.w * c.k, m.paper.h * c.k);
  // the ink, in page units on the frame
  const sc = c.k / m.u; // px per page unit
  const emPx = sc * UPM;
  const dx = c.x / sc, dy = c.y / sc;
  const fr = Number.isFinite(st.inkT) ? engine.frameAt(m.tl, st.inkT) : null;
  const reveal = fr ? (it: any, si: number) => {
    const a = m.evOf.get(it.__i);
    const n = a ? a[si] : -1;
    if (n < 0) return 0;
    return n < fr.done ? 1 : fr.active && n === fr.done ? fr.frac : 0;
  } : undefined;
  const all = m.items.map((it, i) => moved(it, dx, dy, { __i: i }));
  if (!st.ch) {
    drawInk(ctx, m.p, all, { emPx, width: S, height: S, ink, reveal });
    return;
  }
  const rest = all.filter((it) => it.ch !== st.ch);
  let marked = all.filter((it) => it.ch === st.ch);
  if (st.step > 0) {
    const forms = m.forms(st.ch);
    if (forms.length) {
      marked = marked.map((it, j) => {
        const base = m.items[it.__i];
        const f = forms[(j + st.step - 1) % forms.length].get(base.charIndex);
        return f ? moved(placeLike(base, f), dx, dy, { __i: it.__i }) : it;
      });
    }
  }
  drawInk(ctx, m.p, rest, { emPx, width: S, height: S, ink, reveal, alpha: 1 - 0.65 * st.dim });
  drawInk(ctx, m.p, marked, { emPx, width: S, height: S, ink: RR.red, reveal });
}
