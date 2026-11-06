// The writing of a recorded session on the paper, at any moment: the sheet, the letters the pen has reached (stroke
// by stroke), the faint ones it hasn't, what an undo lifts, a selection and the caret. The same drawing as InkDemo's,
// for any session in the ink-session format (a take's, src/data/take-session.json: its selections and caret are text
// indexes, placed with the engine's own geometry, as the recorder placed them).
import { getPaper, paintPaper, type PaperSpec } from '@/lib/papers';
import { inkOpts } from '@/lib/ink';
import { HAND, MEASURE, PAPER, PEN_SPEED } from './setup';
import { engine, drawInk, UPM, clamp } from './draw';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const pen = engine.withOverrides(engine.makeHand(HAND.seed, { style: HAND.style }, { neatOnly: true }), { ...HAND.params, pen: HAND.pen, tip: HAND.tip, ink: HAND.ink });
const paper0 = getPaper(PAPER);
export const paper = { ...paper0, text: { ...paper0.text, right: paper0.text.left + (paper0.text.right - paper0.text.left) * MEASURE } } as PaperSpec;
export const IO = inkOpts(pen, paper, 1, 1);
export const INK_COLOR = '#1e2733';

export interface Cam { k: number; x: number; y: number; u: number }

interface Timed { it: any; start: number; dur: number }

export class InkView {
  private sheets = new Map<number, any>();
  private clocks = new Map<number, Timed[]>();
  private geos = new Map<string, any>();
  private drafts = new Map<string, any>();
  constructor(readonly S: any) {}

  sheetAt(s: number) {
    let sh = this.sheets.get(s);
    if (!sh) {
      const ids = this.S.states[s].ids as number[];
      const doc = { ...engine.newInkDoc({ seed: HAND.seed, style: HAND.style, salt: this.S.salt }), log: ids.map((i) => this.S.events[i]) };
      sh = engine.replay(pen, doc, IO.layout);
      this.sheets.set(s, sh);
    }
    return sh;
  }
  frameAt(t: number) { return this.S.frames[clamp(Math.round(t * this.S.fps), 0, this.S.frames.length - 1)]; }

  /** the final letter's writing fitted into a window of the frame (W wide, from top to bottom px), fixed for the
   *  whole video, so nothing written ever moves */
  camera(W: number, top: number, bottom: number, k0: number): Cam {
    const last = this.sheetAt(this.S.states.length - 1);
    const u = IO.u;
    let y0 = Infinity, y1 = -Infinity;
    for (const it of last.page.items as any[]) { if (!it.box) continue; y0 = Math.min(y0, it.box[1]); y1 = Math.max(y1, it.box[3]); }
    const colMm = paper.text.right - paper.text.left;
    const hMm = (y1 - y0) / u;
    const room = bottom - top;
    const k = Math.max(W / paper.w, Math.min((0.88 * W) / colMm, (room - 70 * k0) / hMm));
    const x = Math.min(0, Math.max(W - paper.w * k, 0.06 * W - paper.text.left * k));
    const y = Math.min(0, top + (room - hMm * k) / 2 - (y0 / u) * k - 10 * k0);
    return { k, x, y, u };
  }
  paperCanvas(cam: Cam) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(paper.w * cam.k); c.height = Math.ceil(paper.h * cam.k);
    paintPaper(c.getContext('2d')!, paper, { pxPerMm: cam.k, grainScale: cam.k / 4, holeFill: 'clear', shadow: 'none' });
    return c;
  }

  /** every letter and mark in writing order, stroke by stroke, as the pen reaches it */
  private penClock(s: number): Timed[] {
    const hit = this.clocks.get(s);
    if (hit) return hit;
    const sh = this.sheetAt(s), ids = this.S.states[s].ids as number[];
    const items = (sh.page.items as any[]).map((it, i) => ({ it, i })).filter(({ it }) => it.g && (it.kind === 'glyph' || it.kind === 'mark'));
    items.sort((a, b) => (a.it.ev ?? 0) - (b.it.ev ?? 0) || (a.it.inkIndex ?? a.i) - (b.it.inkIndex ?? b.i) || a.i - b.i);
    const evT = (ev: number) => this.S.evTime[ids[ev]] ?? 0;
    const per = new Map<number, number>();
    for (const { it } of items) per.set(it.ev ?? 0, (per.get(it.ev ?? 0) ?? 0) + 1);
    const evs = [...per.keys()].sort((a, b) => a - b);
    const next = new Map<number, number>();
    evs.forEach((e, j) => next.set(e, j + 1 < evs.length ? evT(evs[j + 1]) : Infinity));
    const out: Timed[] = [];
    let at = 0;
    for (const { it } of items) {
      const ev = it.ev ?? 0;
      const room = (next.get(ev)! - evT(ev)) / (per.get(ev) || 1);
      const base = it.kind === 'mark' ? 0.32 : 1 / PEN_SPEED;
      const dur = clamp(Math.min(base, room * 0.95), 0.05, base);
      const start = Math.max(evT(ev), at);
      out.push({ it, start, dur });
      at = start + dur;
    }
    this.clocks.set(s, out);
    return out;
  }
  private draft(s: number, v: any) {
    const key = `${s}:${v.tail ?? ''}`;
    if (!this.drafts.has(key)) {
      let page: any = null;
      try { page = v.tail ? engine.draftPage(this.sheetAt(s), v) : null; } catch { page = null; }
      this.drafts.set(key, { page, items: ((page?.items ?? []) as any[]).filter((it) => it.kind === 'glyph') });
    }
    return this.drafts.get(key);
  }
  /** the engine's caret geometry over the written letters and the thoughts ahead of the pen */
  private geo(s: number, v: any) {
    const key = `${s}:${v.tail ?? ''}`;
    if (!this.geos.has(key)) {
      const page = this.sheetAt(s).page, d = this.draft(s, v);
      const written = String(page.text ?? '').length;
      let g: any = null;
      try { g = d.page ? engine.geometry(pen, [page, engine.offsetStops(d.page, written - (d.page.from || 0))]) : engine.geometry(pen, page); } catch { g = null; }
      this.geos.set(key, g);
    }
    return this.geos.get(key);
  }
  textLength(s: number, v: any) {
    const page = this.sheetAt(s).page;
    return String(page.text ?? '').length + String(v.tail ?? '').length;
  }

  /** the writing at t over the paper, into a window (W wide, down to winH px) */
  draw(ctx: CanvasRenderingContext2D, t: number, cam: Cam, sheet: HTMLCanvasElement, W: number, winH: number, k0: number, o: { lastKey: number; caret?: boolean } ) {
    const F = this.frameAt(t);
    ctx.save();
    ctx.drawImage(sheet, cam.x, cam.y);
    const sc = cam.k / cam.u, emPx = sc * UPM;
    const shift = (it: any) => ({ ...it, x: it.x + cam.x / sc, y: it.y + cam.y / sc, box: it.box && [it.box[0] + cam.x / sc, it.box[1] + cam.y / sc, it.box[2] + cam.x / sc, it.box[3] + cam.y / sc] });
    const g = this.geo(F.s, F.v);
    // a selection, as the system draws one: a soft blue behind the words, until its command
    const sel = (this.S.selections as any[]).find((x) => t >= x.t && t <= x.until + 0.2);
    if (sel && g) {
      const a = t > sel.until ? 1 - (t - sel.until) / 0.2 : 1;
      ctx.fillStyle = `rgba(44, 99, 214, ${0.16 * a})`;
      try {
        for (const r of g.selection(sel.from, sel.to) as { points: [number, number][] }[]) {
          ctx.beginPath();
          r.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * sc + cam.x, y * sc + cam.y) : ctx.moveTo(x * sc + cam.x, y * sc + cam.y)));
          ctx.closePath(); ctx.fill();
        }
      } catch { /* no geometry for it */ }
    }
    const sh = this.sheetAt(F.s);
    const timed = this.penClock(F.s);
    const drawn = timed.filter((x) => x.start <= t);
    const frac = new Map<any, number>();
    const items = drawn.map((x) => { const it = shift(x.it); frac.set(it, clamp((t - x.start) / x.dur, 0, 1)); return it; });
    drawInk(ctx, pen, items, {
      emPx, width: W, height: winH,
      reveal: (it: any, si: number) => { const f = frac.get(it) ?? 1; const n = it.g?.strokes?.length || 1; return clamp(f * n - si, 0, 1); },
    });
    // what an undo just lifted, fading off the page
    const lift = (this.S.lifts as any[]).find((l) => t >= l.t && t < l.t + 0.35);
    if (lift && F.s > 0) {
      const before = this.sheetAt(F.s - 1).page.items as any[];
      const keep = new Set((sh.page.items as any[]).map((it) => it.key));
      const gone = before.filter((it) => it.g && !keep.has(it.key)).map(shift);
      if (gone.length) drawInk(ctx, pen, gone, { emPx, width: W, height: winH, alpha: 1 - (t - lift.t) / 0.35 });
    }
    // the letters the pen hasn't reached: faint graphite, where they'll be written
    const d = this.draft(F.s, F.v);
    if (d.items.length) drawInk(ctx, pen, d.items.map(shift), { emPx, width: W, height: winH, ink: '#6f6f78', alpha: 0.26 });
    // the caret: steady while typing, blinking when he stops (none while a selection shows)
    if (o.caret !== false && !sel && g) {
      const since = t - o.lastKey;
      const on = since < 0.6 || Math.floor(since * 2) % 2 === 0;
      const at = F.cur ?? this.textLength(F.s, F.v);
      let c: any = null;
      try { c = g.caretAt(at, 'after'); } catch { c = null; }
      if (on) {
        let x0: number, y0: number, x1: number, y1: number;
        if (c) { x0 = c.bottom[0] * sc + cam.x; y0 = c.bottom[1] * sc + cam.y; x1 = c.top[0] * sc + cam.x; y1 = c.top[1] * sc + cam.y; }
        else { x0 = x1 = cam.x + paper.text.left * cam.k; y0 = cam.y + IO.lines.first * cam.k + 1.5 * cam.k; y1 = y0 - 7.5 * cam.k; }
        ctx.strokeStyle = INK_COLOR; ctx.lineWidth = 2.2 * k0; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
