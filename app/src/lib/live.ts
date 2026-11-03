// The live page, for engines with incremental layout (page-rhythm session: runs, stops, geometry, the pen).
// Layout runs on the main thread with the same hand object every keystroke, so the engine's caches keep a
// keystroke to one rebuilt word (~4–8 ms for 250 words). Sheets are windows onto one continuous page: each
// sheet's SVG shows the page through a viewBox that starts at that sheet's first written line, so nothing
// is copied or shifted per sheet.
import * as E from '@engine';
import { CAP, layout, penOutline, rng, UPM, withOverrides, type Hand } from '@engine';
import type { Mark } from './doc';
import { writingLines, type PaperSpec } from './papers';
import type { CaretPos, Geometry, Ribbon } from './geometry';
import { JOURNEY, writeWithJourney } from './engine-features';
import { REF_PX_PER_MM, scopeIds } from './writing';
import { frameFor, paginate, sheetOf, type PageFrame, type Pagination } from './paginate';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;

/** The engine can drive the live page: incremental runs, caret geometry and the pen. */
export const LIVE = ['renderRun', 'runChanges', 'runTransform', 'geometry', 'createPen', 'paintPen', 'lineBaseline', 'pageMetrics'].every(
  (k) => typeof engine[k] === 'function',
);

export interface SheetWindow {
  /** font units from the page top to this sheet's top */
  shiftU: number;
  fromLine: number;
  toLine: number;
}

export interface Live {
  p: Hand;
  page: any;
  geo: any;
  paper: PaperSpec;
  emMm: number;
  unitsPerMm: number;
  lineMm: number;
  firstMm: number;
  /** where the sheets break (by the lines' real positions) */
  pages: Pagination;
  frame: PageFrame;
  sheets: SheetWindow[];
  /** the signature's baseline (page units) when it goes on the line after the text */
  tailY: number;
  /** reference emPx for drawing (the SVG is drawn at REF_PX_PER_MM and stretched by CSS) */
  emPx: number;
  widthPx: number;
  heightPx: number;
  summary?: string;
}

const lineEntry = (page: any) => {
  const m = new Map<number, any>();
  for (const ln of page.lineInfo || []) m.set(ln.n, ln);
  return m;
};

/** Where a hand writes on a paper at a size: the em, the lines, and the engine's layout options. */
export function pageSetup(p: Hand, paper: PaperSpec, size: number, lineSpacing: number) {
  const xhFrac = ((p.xHeight as number) || 0.55) * 0.7;
  const emMm = (paper.xh * size) / xhFrac;
  const u = UPM / emMm;
  const lines = writingLines(paper, emMm, paper.xh * size, lineSpacing);
  // plain paper: the hand's own line pitch (scaled by line spacing); rules and grids: the paper's
  const lineMm = paper.pitch ? lines.lineMm : (engine.pageMetrics(p).pitch / u) * lineSpacing;
  const opts: Record<string, unknown> = {
    maxWidth: (paper.text.right - paper.text.left) * u,
    lineHeight: lineMm * u,
    firstBaseline: lines.first * u,
    marginLeft: paper.text.left * u,
    ruled: !!paper.pitch,
  };
  return { emMm, u, lines, lineMm, opts };
}

/** `signed`: the writer signs after the text, so a line is kept for the name (on a sheet of its own if need be). */
export function liveLayout(p: Hand, text: string, paper: PaperSpec, size: number, lineSpacing: number, signed = false): Live {
  const { emMm, u, lines, lineMm, opts } = pageSetup(p, paper, size, lineSpacing);
  const j = JOURNEY && writeWithJourney && text ? writeWithJourney(p, text, opts, { seed: String(p.seed) }) : null;
  const page: any = j && j.ok ? j.page : layout(p, text, opts as never);
  // sheets break where the lines really are: each hand has its own pitch, and lines vary and float
  const frame = frameFor(paper, lines.first, lineMm, u);
  const pages = paginate(page, frame);
  // the signature after the last line: on this sheet if it fits, else on a sheet of its own
  const info = (page.lineInfo ?? []) as { n: number; y: number }[];
  const lastY = info.length ? Math.max(...info.map((l) => l.y)) : frame.firstU - frame.pitchU;
  const tailY = lastY + frame.pitchU;
  const closingPS = /\n\n(?=P\.\s?S\.)(?![\s\S]*\n\nP\.\s?S\.)/.test(text);
  if (signed && !closingPS && text) {
    const shift = pages.shifts[pages.shifts.length - 1];
    if (tailY - shift > frame.lastU + 0.2 * frame.pitchU || tailY + 0.45 * UPM - shift > frame.inkU) {
      pages.breaks.push(Math.max(page.lines || 0, info.length));
      pages.shifts.push(tailY - frame.firstU);
    }
  }
  const sheets: SheetWindow[] = pages.breaks.map((fromLine, s) => ({ shiftU: pages.shifts[s], fromLine, toLine: pages.breaks[s + 1] ?? Infinity }));
  const emPx = emMm * REF_PX_PER_MM;
  return {
    p, page, geo: engine.geometry(p, page), paper, emMm, unitsPerMm: u, lineMm, firstMm: lines.first, pages, frame, sheets, tailY, emPx,
    widthPx: Math.round(paper.w * REF_PX_PER_MM), heightPx: Math.ceil(paper.h * REF_PX_PER_MM),
    summary: j && j.ok ? j.summary : undefined,
  };
}

export const sheetOfLine = (live: Live, line: number) => sheetOf(live.pages, line);

/** The engine's caret geometry, in the editor's sheet-local terms (lib/geometry.ts). */
export function engineGeometry(live: Live): Geometry {
  const { geo, page } = live;
  const shift = (s: number) => live.sheets[s]?.shiftU ?? 0;
  const lineNums = [...(geo.lines as Map<number, unknown>).keys()].filter((n) => geo.lineStops(n).length).sort((a, b) => a - b);
  const caret = (o: number): CaretPos | null => {
    const c = geo.caretAt(o, 'after');
    if (!c) return null;
    const sheet = sheetOfLine(live, c.line);
    return { sheet, x: c.x, y: c.y - shift(sheet), top: [c.top[0], c.top[1] - shift(sheet)], line: c.line };
  };
  return {
    text: page.text,
    unitsPerMm: live.unitsPerMm,
    emMm: live.emMm,
    lineMm: live.lineMm,
    sheets: live.sheets.length,
    ascU: geo.ascent,
    descU: geo.descent,
    summary: live.summary,
    caret,
    hit: (sheet, x, y) => geo.hitTest(x, y + shift(sheet)).offset,
    vertical: (o, dir, goalX) => {
      const c = geo.caretAt(o, 'after');
      if (!c) return { o, goalX: goalX ?? 0 };
      const gx = goalX ?? c.x;
      const at = lineNums.indexOf(c.line);
      const next = lineNums[at + dir];
      if (next == null) return { o: dir < 0 ? 0 : page.text.length, goalX: gx };
      return { o: geo.stopNear(next, gx).o, goalX: gx };
    },
    edges: (o) => {
      const c = geo.caretAt(o, 'after');
      const stops = c ? geo.lineStops(c.line) : [];
      if (!stops.length) return { start: o, end: o };
      const os = stops.map((s: { o: number }) => s.o);
      return { start: Math.min(...os), end: Math.max(...os) };
    },
    ribbons: (from, to): Ribbon[] =>
      geo.selection(from, to).map((r: { line: number; points: [number, number][] }) => {
        const sheet = sheetOfLine(live, r.line);
        return { sheet, points: r.points.map(([x, y]) => [x, y - shift(sheet)] as [number, number]) };
      }),
  };
}

// ---------- what a pen adds: underlines, pressed letters, a signature, page numbers, the placeholder ----------

export interface ExtrasInput {
  marks: Mark[];
  signed: boolean;
  writerName: string;
  placeholder?: string;
  text: string;
}

/** Per-sheet SVG markup (reference px, page coordinates) for the extra ink. */
export function liveExtras(live: Live, x: ExtrasInput): string[] {
  const { p, page } = live;
  const sc = live.emPx / UPM;
  const out = live.sheets.map(() => '');
  const add = (sheet: number, contours: number[][][], attrs = '') => {
    if (!contours.length) return;
    out[sheet] += `<path${attrs} d="${E.contoursToD(contours, 0, 0, sc)}"/>`;
  };
  const info = lineEntry(page);
  const baseAt = (line: number, px: number) => {
    const e = info.get(line);
    if (e) return engine.lineBaseline(p, e, px);
    const last = Math.max(...info.keys(), 0);
    const le = info.get(last);
    return (le ? engine.lineBaseline(p, le, px) : live.firstMm * live.unitsPerMm) + (line - last) * live.lineMm * live.unitsPerMm;
  };
  const glyphs = (page.items as any[]).filter((it) => it.kind === 'glyph' && it.charIndex >= 0 && !it.synthetic && !it.role);

  // pressed harder: the same strokes re-traced with a heavier pen over the writing
  const pressed = withOverrides(p, { penWidth: (p.penWidth as number) * 1.3, pressure: Math.min(1, (p.pressure as number) + 0.2) });
  for (const m of x.marks.filter((m) => m.kind === 'press')) {
    for (const it of glyphs) {
      if (it.charIndex < m.from || it.charIndex >= m.to) continue;
      const cs: number[][][] = [];
      it.g.strokes.forEach((st: { center: number[][]; dot?: boolean }, si: number) => {
        const pts = st.center.map(([qx, qy]) => [it.x + qx, -(it.y - qy)]);
        const c = penOutline(pressed, pts, 37 + si * 3.1, st.dot ? { dot: true } : undefined);
        if (c) cs.push(c);
      });
      add(sheetOfLine(live, it.line), cs);
    }
  }

  // underlines: one stroke per line run, following the line's own baseline
  x.marks.forEach((m, mi) => {
    if (m.kind === 'press') return;
    const byLine = new Map<number, any[]>();
    for (const it of glyphs) if (it.charIndex >= m.from && it.charIndex < m.to) (byLine.get(it.line) ?? byLine.set(it.line, []).get(it.line)!).push(it);
    let ri = 0;
    for (const [line, items] of byLine) {
      const x0 = Math.min(...items.map((it) => (it.box ? it.box[0] : it.x))) - 40;
      const x1 = Math.max(...items.map((it) => (it.box ? it.box[2] : it.x + it.g.advance))) + 30;
      const passes = m.kind === 'underline2' ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        const r = rng(`underline:${p.seed}:${mi}:${ri}:${pass}`);
        const rise = (r() - 0.35) * 40, bow = (r() - 0.5) * 30, n = Math.max(12, Math.round((x1 - x0) / 60));
        const pts: number[][] = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n, px = x0 + (x1 - x0) * t;
          pts.push([px, -(baseAt(line, px) + 120 + pass * 85 - rise * t + bow * Math.sin(Math.PI * t) + (r() - 0.5) * 4)]);
        }
        const c = penOutline(withOverrides(p, { pressure: (p.pressure as number) * 0.6, penWidth: (p.penWidth as number) * 0.9 }), pts, 700 + pass * 13);
        if (c) add(sheetOfLine(live, line), [c]);
      }
      ri++;
    }
  });

  // the signature: the writer's name in their own hand, a touch larger and quicker, signed before a P.S.
  if (x.signed && x.writerName) {
    const signer = withOverrides(p, { neatness: Math.max(0.15, (p.neatness as number) - 0.18), slant: (p.slant as number) + 4 });
    const sig = layout(signer, x.writerName, { maxWidth: 1e7, firstBaseline: 0, lineHeight: UPM });
    let line = page.lines;
    const ps = x.text.search(/\n\n(?=P\.\s?S\.)(?![\s\S]*\n\nP\.\s?S\.)/);
    if (ps >= 0) {
      const psItem = glyphs.find((it) => it.charIndex === ps + 2);
      if (psItem) line = psItem.line - 1;
    }
    const left = live.paper.text.left * live.unitsPerMm + 0.15 * live.lineMm * live.unitsPerMm;
    // after the text: the line liveLayout kept for it (possibly on a sheet of its own)
    const y = line >= page.lines ? live.tailY : baseAt(line, left);
    const cs: number[][][] = [];
    const sigItems = (sig.items as any[]).filter((it) => it.kind === 'glyph');
    // measured from the name's own left edge (layout may indent a line it thinks is very wide)
    const x0 = sigItems.length ? Math.min(...sigItems.map((it) => it.x)) : 0;
    for (const it of sigItems) {
      for (const c of it.g.contours as number[][][]) cs.push(c.map(([qx, qy]) => [left + (it.x - x0 + qx) * 1.12, -(y + (it.y - qy) * 1.12)]));
    }
    add(sheetOfLine(live, line), cs);
  }

  // page numbers, top right, on sheets 2 and up
  for (let s = 1; s < live.sheets.length; s++) {
    const num = layout(p, String(s + 1), { maxWidth: 1e7, firstBaseline: 0, lineHeight: UPM });
    const items = (num.items as any[]).filter((it) => it.kind === 'glyph');
    const minX = items.length ? Math.min(...items.map((it) => it.x)) : 0;
    const w = items.reduce((a, it) => Math.max(a, it.x - minX + it.g.advance), 0) * 0.82;
    const x0 = live.paper.text.right * live.unitsPerMm - w - minX * 0.82;
    const y = live.sheets[s].shiftU + Math.max(9 * live.unitsPerMm, (live.firstMm - live.lineMm * 0.95) * live.unitsPerMm);
    const cs: number[][][] = [];
    for (const it of items) for (const c of it.g.contours as number[][][]) cs.push(c.map(([qx, qy]) => [x0 + (it.x + qx) * 0.82, -(y + (it.y - qy) * 0.82)]));
    add(s, cs);
  }

  // a notecard that goes on to its back: "over" at the foot of each front, inside the border, in the hand
  if (live.paper.overflow === 'back') {
    for (let s = 0; s < live.sheets.length - 1; s += 2) {
      const over = layout(p, 'over', { maxWidth: 1e7, firstBaseline: 0, lineHeight: UPM });
      const items = (over.items as any[]).filter((it) => it.kind === 'glyph');
      const minX = items.length ? Math.min(...items.map((it) => it.x)) : 0;
      const w = items.reduce((a, it) => Math.max(a, it.x - minX + it.g.advance), 0) * 0.82;
      const x0 = live.paper.text.right * live.unitsPerMm - w - minX * 0.82;
      // about one x-height under the last line ("over" has no descenders, so it clears the border)
      const y = live.sheets[s].shiftU + (live.paper.text.last + live.paper.xh) * live.unitsPerMm;
      const cs: number[][][] = [];
      for (const it of items) for (const c of it.g.contours as number[][][]) cs.push(c.map(([qx, qy]) => [x0 + (it.x + qx) * 0.82, -(y + (it.y - qy) * 0.82)]));
      add(s, cs);
    }
  }

  // an empty page: the writer pencils in where the writing goes, in faint graphite
  if (!x.text && x.placeholder) {
    const ph = layout(p, x.placeholder, { maxWidth: (live.paper.text.right - live.paper.text.left) * live.unitsPerMm, firstBaseline: live.firstMm * live.unitsPerMm, lineHeight: live.lineMm * live.unitsPerMm });
    const left = live.paper.text.left * live.unitsPerMm;
    const cs: number[][][] = [];
    for (const it of ph.items as any[]) if (it.kind === 'glyph') for (const c of it.g.contours as number[][][]) cs.push(c.map(([qx, qy]) => [left + it.x + qx, -(it.y - qy)]));
    if (cs.length) out[0] += `<g class="placeholder" fill="#6f6b66" opacity="0.22"><path d="${E.contoursToD(cs, 0, 0, sc)}"/></g>`;
  }
  return out;
}

/** The SVG skeleton for one sheet: the engine's ink look (defs, group attributes) and the sheet's window. */
export function sheetFrame(live: Live, s: number, ink: string | undefined) {
  const probe: string = E.renderSVG(live.p, { items: [], height: 10 } as never, { width: live.widthPx, emPx: live.emPx, ink } as never);
  const defs = (probe.match(/<defs>[\s\S]*?<\/defs>/) || ['<defs></defs>'])[0];
  const g = (probe.match(/<g [^>]*>/) || ['<g fill="currentColor">'])[0];
  const top = live.sheets[s].shiftU * (live.emPx / UPM);
  return {
    open: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top.toFixed(2)} ${live.widthPx} ${live.heightPx}" width="${live.widthPx}" height="${live.heightPx}" aria-hidden="true">${defs}${g}`,
    close: `</g><g class="extras" fill="${ink && !ink.startsWith('var') ? ink : 'currentColor'}" fill-opacity="0.92"></g></svg>`,
  };
}

/** A whole sheet as one standalone SVG (for the JPEG): runs drawn by renderSVG, windowed, plus the extras. */
export function sheetSVG(live: Live, s: number, ink: string | undefined, extras: string) {
  const full: string = E.renderSVG(live.p, live.page, { width: live.widthPx, emPx: live.emPx, ink, runs: true } as never);
  const top = live.sheets[s].shiftU * (live.emPx / UPM);
  let svg = full
    .replace(/viewBox="[^"]*"/, `viewBox="0 ${top.toFixed(2)} ${live.widthPx} ${live.heightPx}"`)
    .replace(/(<svg[^>]*?)\sheight="[^"]*"/, `$1 height="${live.heightPx}"`);
  if (extras) svg = svg.replace(/<\/svg>\s*$/, `<g fill="${ink && !ink.startsWith('var') ? ink : 'currentColor'}" fill-opacity="0.92">${extras}</g></svg>`);
  return scopeIds(svg, 'x' + s);
}

export const xHeightU = (p: Hand) => ((p.xHeight as number) || 0.55) * CAP;
