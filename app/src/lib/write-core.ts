// Turns a WriteRequest into a WriteResult. Runs in the worker for the live page, and on the main
// thread for the download, so both produce the very same SVG.
//
// Besides the text, the writer adds what a pen adds to a letter (editor-ux.md §3.4): hand-drawn
// underlines, letters pressed harder, a signature below the last line, and page numbers on sheets 2+.
import { layout, makeGlyph, makeHand, penOutline, rng, withOverrides, UPM, type Glyph, type Hand, type Page, type PageItem } from '@engine';
import { lineAfter, sheetOf } from './paginate';
import { LIVE } from './live';
import { lookOf } from './request';
import { writeInkLetter, writeLive } from './write-live';
import { compose, type Sheet } from './compose';
import type { Mark } from './doc';
import { getPaper } from './papers';
import { writingSVG } from './writing';
import { GLYPH_STRIDE, type WriteRequest, type WriteResult } from './write-protocol';

const MISS_ADVANCE = 560;
type GlyphItem = Extract<PageItem, { kind: 'glyph' }>;

export function write(req: WriteRequest): WriteResult {
  // engines with the live page: the same markup the live page draws (lib/write-live.ts)
  if (LIVE && req.ink) return writeInkLetter(req);
  if (LIVE) return writeLive(req);
  const t0 = performance.now();
  const p = withOverrides(makeHand(req.seed, req.style), req.overrides);
  const paper = getPaper(req.paper);
  const comp = compose(p, req.text, paper, req.size, req.lineSpacing);
  const u = comp.unitsPerMm;
  const lineU = comp.lineMm * u;

  // the text offset of every laid-out item (-1 for extra ink, such as a struck word in a journey draft).
  // A journey page carries offsets in charIndex; a plain layout() page has one item per character except
  // ' ' and '\n', in reading order.
  const ats: number[][] = [];
  {
    const offsets: number[] = [];
    let i = 0;
    for (const ch of req.text) {
      if (ch !== ' ' && ch !== '\n') offsets.push(i);
      i += ch.length;
    }
    let k = 0;
    for (const sheet of comp.sheets) ats.push(sheet.items.map((it) => (comp.offsetsInItems ? (it.charIndex ?? -1) : offsets[k++] ?? -1)));
  }
  const marks = req.marks ?? [];
  const pressed = withOverrides(p, { penWidth: (p.penWidth as number) * 1.3, pressure: Math.min(1, (p.pressure as number) + 0.2) });

  // sheets as drawn: pressed letters swapped in; extra ink (underlines, signature, page numbers) alongside
  const drawn: Sheet[] = comp.sheets.map((sheet, si) => ({
    height: sheet.height,
    items: sheet.items.map((it, ii) => {
      const at = ats[si][ii];
      if (it.kind === 'glyph' && at >= 0 && inMarks(marks, 'press', at)) return { ...it, g: pressGlyph(pressed, it.g) };
      return it;
    }),
  }));
  const extra: number[][][][] = drawn.map(() => []);

  // underlines: one stroke per line run, drawn after the words like an afterthought
  const boxes: { at: number; it: PageItem; sheet: number }[] = [];
  comp.sheets.forEach((sheet, si) => sheet.items.forEach((it, ii) => { if (ats[si][ii] >= 0) boxes.push({ at: ats[si][ii], it, sheet: si }); }));
  marks.forEach((m, mi) => {
    if (m.kind === 'press') return;
    const runs = new Map<string, { sheet: number; items: PageItem[] }>();
    for (const b of boxes) {
      if (b.at < m.from || b.at >= m.to) continue;
      const key = b.sheet + ':' + b.it.line;
      if (!runs.has(key)) runs.set(key, { sheet: b.sheet, items: [] });
      runs.get(key)!.items.push(b.it);
    }
    let ri = 0;
    for (const run of runs.values()) {
      const passes = m.kind === 'underline2' ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        const c = underline(p, run.items, `${req.seed}:${mi}:${ri}:${pass}`, pass);
        if (c) extra[run.sheet].push(c);
      }
      ri++;
    }
  });

  // the signature: the writer's name in their own hand, a touch larger and quicker, on the line after the text
  if (req.signed && req.writerName) {
    const signer = withOverrides(p, { neatness: Math.max(0.15, (p.neatness as number) - 0.18), slant: (p.slant as number) + 4 });
    const sig = layout(signer, req.writerName, { maxWidth: 1e7, firstBaseline: 0, lineHeight: UPM });
    // a letter is signed before its P.S.: use the empty line above a closing "P.S." if there is one
    let line = comp.page.lines;
    const ps = req.text.search(/\n\n(?=P\.\s?S\.)(?![\s\S]*\n\nP\.\s?S\.)/);
    if (ps >= 0) {
      const psItem = boxes.find((b) => b.at === ps + 2)?.it;
      if (psItem) line = psItem.line - 1;
    }
    // on its own line where there is one (before a P.S.), else one line below the text, on the next sheet if
    // this one is full
    const own = line < comp.page.lines ? lineY(comp.page, line) : null;
    const { sheet, y } = own != null
      ? { sheet: sheetOf(comp.pages, line), y: own - comp.pages.shifts[sheetOf(comp.pages, line)] }
      : lineAfter(comp.pages, comp.frame, lineY(comp.page, line - 1) ?? comp.firstMm * u - lineU, Math.max(0, line - 1));
    const x0 = paper.text.left * u + lineU * 0.15;
    while (drawn.length <= sheet) { drawn.push({ items: [], height: paper.h * u }); extra.push([]); }
    for (const it of sig.items) {
      if (it.kind !== 'glyph') continue;
      drawn[sheet].items.push({ ...it, x: x0 + it.x * 1.12, y: y + it.y * 1.12, g: scaleGlyph(it.g, 1.12), inkIndex: 9000 + it.charIndex });
    }
  }

  // page numbers: the hand numbers each sheet after the first, top right
  for (let si = 1; si < drawn.length; si++) {
    const num = layout(p, String(si + 1), { maxWidth: 1e7, firstBaseline: 0, lineHeight: UPM });
    const items = num.items.filter((it): it is GlyphItem => it.kind === 'glyph');
    const w = items.reduce((a, it) => Math.max(a, it.x + it.g.advance), 0) * 0.82;
    const x0 = paper.text.right * u - w;
    const y = Math.max(9 * u, comp.firstMm * u - lineU * 0.95);
    for (const it of items) drawn[si].items.push({ ...it, x: x0 + it.x * 0.82, y, g: scaleGlyph(it.g, 0.82), inkIndex: 9500 + it.charIndex });
  }

  // a notecard that goes on to its back: "over" at the foot of each front, inside the border, in the hand
  if (paper.overflow === 'back') {
    for (let si = 0; si < drawn.length - 1; si += 2) {
      const over = layout(p, 'over', { maxWidth: 1e7, firstBaseline: 0, lineHeight: UPM });
      const items = over.items.filter((it): it is GlyphItem => it.kind === 'glyph');
      const w = items.reduce((a, it) => Math.max(a, it.x + it.g.advance), 0) * 0.82;
      const x0 = paper.text.right * u - w;
      // about one x-height under the last line ("over" has no descenders, so it clears the border)
      const y = (paper.text.last + paper.xh) * u;
      for (const it of items) drawn[si].items.push({ ...it, x: x0 + it.x * 0.82, y, g: scaleGlyph(it.g, 0.82), inkIndex: 9600 + it.charIndex });
    }
  }

  // an empty note: the writer's hand shows where the writing goes, in faint graphite (never ink)
  let ghost: Sheet | undefined;
  if (!req.text && req.placeholder) {
    const ph = layout(p, req.placeholder, { maxWidth: (paper.text.right - paper.text.left) * u, lineHeight: lineU, firstBaseline: comp.firstMm * u });
    ghost = { height: paper.h * u, items: ph.items.map((it) => ({ ...it, x: it.x + paper.text.left * u })) };
  }

  const inkFill = req.inkKey ? req.inkColor : 'currentColor';
  const svgs = drawn.map((sheet, i) =>
    writingSVG(p, sheet, comp.emMm, paper.w, 'w' + i, req.inkKey, { contours: extra[i], fill: inkFill, ghost: i === 0 ? ghost : undefined }),
  );

  const glyphs = new Float32Array(boxes.length * GLYPH_STRIDE);
  // the caret map covers the text only: one box per written character, each with its text offset
  let g = 0;
  comp.sheets.forEach((sheet, si) => {
    sheet.items.forEach((it, ii) => {
      const at = ats[si][ii];
      if (at < 0) return;
      glyphs[g++] = at;
      glyphs[g++] = si;
      glyphs[g++] = it.x;
      glyphs[g++] = it.y;
      glyphs[g++] = it.kind === 'glyph' ? it.g.advance : MISS_ADVANCE;
      glyphs[g++] = it.line;
      glyphs[g++] = it.kind === 'glyph' ? 1 : 0;
    });
  });
  return {
    id: req.id,
    handKey: req.seed + ':' + req.style,
    inkKey: req.inkKey,
    inkColor: req.inkColor,
    paper: req.paper,
    svgs,
    emMm: comp.emMm,
    lineMm: comp.lineMm,
    firstMm: comp.firstMm,
    // a signature that went on a sheet of its own adds that sheet
    breaks: drawn.length > comp.pages.breaks.length ? [...comp.pages.breaks, comp.page.lines] : comp.pages.breaks,
    shifts: drawn.length > comp.pages.shifts.length ? [...comp.pages.shifts, 0] : comp.pages.shifts,
    unitsPerMm: comp.unitsPerMm,
    glyphs,
    text: req.text,
    look: lookOf(req),
    spaceU: makeGlyph(p, ' ', null).advance * ((p.wordSpace as number) || 1),
    leftU: paper.text.left * comp.unitsPerMm,
    lines: comp.page.lines,
    summary: comp.summary,
    ms: performance.now() - t0,
  };
}

const inMarks = (marks: Mark[], kind: Mark['kind'], at: number) => marks.some((m) => m.kind === kind && at >= m.from && at < m.to);

/** The same strokes, written with more pressure: the pen re-traces each centreline heavier and a touch larger. */
function pressGlyph(p: Hand, g: Glyph): Glyph {
  const s = 1.06;
  const contours: number[][][] = [];
  g.strokes.forEach((st, si) => {
    const pts = st.center.map(([x, y]) => [x * s, y * s]);
    const c = penOutline(p, pts, 37 + si * 3.1, st.dot ? { dot: true } : undefined);
    if (c) contours.push(c);
  });
  return { ...g, contours: contours.length ? contours : g.contours, advance: g.advance * s };
}

function scaleGlyph(g: Glyph, s: number): Glyph {
  return { ...g, advance: g.advance * s, contours: g.contours.map((c) => c.map(([x, y]) => [x * s, y * s])) };
}

/**
 * One hand-drawn underline under a run of letters on one line: starts a little before the first letter,
 * runs a little past the last, sits just under the baseline with a slight bow and rise, lighter than the
 * writing (a quick stroke). Returned in page font units with y up (negated page y), ready for contoursToD.
 */
function underline(p: Hand, items: PageItem[], seed: string, pass: number) {
  if (!items.length) return null;
  const r = rng('underline:' + seed);
  const first = items[0], last = items[items.length - 1];
  const adv = (it: PageItem) => (it.kind === 'glyph' ? it.g.advance : MISS_ADVANCE);
  const x0 = first.x - 40 - r() * 50;
  const x1 = last.x + adv(last) + 10 + r() * 60;
  const base = items.reduce((a, it) => a + it.y, 0) / items.length + 120 + pass * 85;
  const rise = (r() - 0.35) * 40;
  const bow = (r() - 0.5) * 30;
  const n = Math.max(12, Math.round((x1 - x0) / 60));
  const pts: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = base - rise * t + bow * Math.sin(Math.PI * t) + (r() - 0.5) * 4;
    pts.push([x0 + (x1 - x0) * t, -y]);
  }
  const pen = withOverrides(p, { pressure: (p.pressure as number) * 0.6, penWidth: (p.penWidth as number) * 0.9 });
  return penOutline(pen, pts, 700 + pass * 13);
}

/** A line's baseline on the page (before the sheets' shifts), from the engine's line info. */
function lineY(page: Page, line: number): number | null {
  const info = (page as unknown as { lineInfo?: { n: number; y: number }[] }).lineInfo;
  return info?.find((l) => l.n === line)?.y ?? null;
}
