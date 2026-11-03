// The worker's writer for engines with the live page (incremental runs): the same layout, runs and extra ink
// that LiveSheets draws on the main thread, as one SVG per sheet. Looks change here, off the main thread
// (a new hand's first layout is the expensive part); the live page is only built for typing, and since both
// draw the very same markup, switching between them changes nothing on screen.
import * as E from '@engine';
import { makeGlyph, makeHand, UPM, withOverrides } from '@engine';
import { liveExtras, liveLayout, sheetFrame, sheetOfLine } from './live';
import { decodeInk, inkExtras, inkLive, inkPage } from './ink';
import { getPaper, writingLines } from './papers';
import { lookOf } from './request';
import { scopeIds } from './writing';
import { GLYPH_STRIDE, type WriteRequest, type WriteResult } from './write-protocol';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;

/** LiveSheets' ink rule: a modelled ink key, the pen's own ink ('auto'), or flat currentColor. */
export const liveInk = (inkKey: string | null) => (inkKey && inkKey !== 'auto' ? inkKey : inkKey === 'auto' ? undefined : 'currentColor');

export function writeLive(req: WriteRequest): WriteResult {
  const t0 = performance.now();
  const p = withOverrides(makeHand(req.seed, req.style), req.overrides);
  const paper = getPaper(req.paper);
  const live = liveLayout(p, req.text, paper, req.size, req.lineSpacing, !!req.signed);
  return resultOf(req, p, live, t0);
}

/**
 * A long letter's first sheet, from a prefix of the text (layout is prefix-stable: lines that fit wholly in the
 * prefix come out exactly as in the whole letter), with blank sheets standing in for the rest. null when the
 * letter is short enough to write whole at once.
 */
export function writeFirstSheet(req: WriteRequest): WriteResult | null {
  const t0 = performance.now();
  // ink letters are one sheet at a time already
  if (req.text.length < 700 || req.ink) return null;
  const p = withOverrides(makeHand(req.seed, req.style), req.overrides);
  const paper = getPaper(req.paper);
  // about how many characters a sheet holds: the line's width in average letters, times the lines
  const xhFrac = ((p.xHeight as number) || 0.55) * 0.7;
  const emMm = (paper.xh * req.size) / xhFrac;
  const lines = writingLines(paper, emMm, paper.xh * req.size, req.lineSpacing);
  const u = UPM / emMm;
  const lineMm = paper.pitch ? lines.lineMm : (engine.pageMetrics(p).pitch / u) * req.lineSpacing;
  const perSheet = ((paper.text.right - paper.text.left) / (0.42 * emMm)) * ((paper.text.last - lines.first) / lineMm + 1);
  let n = Math.ceil(perSheet * 1.4);
  if (req.text.length < n * 1.2) return null;
  // whole words only
  const cut = req.text.slice(n).search(/\s/);
  n = cut < 0 ? req.text.length : n + cut;
  const live = liveLayout(p, req.text.slice(0, n), paper, req.size, req.lineSpacing, false);
  // the prefix must reach past the first sheet, or its last line could still change
  if (live.sheets.length < 2) return null;
  const firstOnNext = (live.page.items as any[]).find((it) => it.line >= live.sheets[1].fromLine && it.charIndex >= 0);
  const held = Math.max(1, firstOnNext ? firstOnNext.charIndex : n);
  const res = resultOf({ ...req, signed: false }, p, live, t0, 1);
  const total = Math.max(2, Math.ceil(req.text.length / held));
  return { ...res, svgs: [res.svgs[0], ...Array.from({ length: total - 1 }, () => '')], text: req.text, partial: true };
}

/** An ink letter (Ink mode): replayed from its log, with its correction marks, as the ink page draws it. */
export function writeInkLetter(req: WriteRequest): WriteResult {
  const t0 = performance.now();
  const p = withOverrides(makeHand(req.seed, req.style), req.overrides);
  const paper = getPaper(req.paper);
  const doc = decodeInk(req.ink);
  if (!doc) return writeLive(req);
  const live = inkLive(p, inkPage(p, doc, paper, req.size, req.lineSpacing), paper, req.size, req.lineSpacing);
  const extras = inkExtras(live, { signed: !!req.signed, writerName: req.writerName ?? '' });
  // ink letters carry their text offset in `at` (as the letter reads now; -1 = struck)
  return resultOf(req, p, live, t0, undefined, extras, (it) => (typeof it.at === 'number' ? it.at : -1));
}

function resultOf(
  req: WriteRequest, p: ReturnType<typeof withOverrides>, live: ReturnType<typeof liveLayout>, t0: number, only?: number,
  extrasIn?: string[], offsetOf: (it: any) => number = (it) => it.charIndex,
): WriteResult {
  const paper = live.paper;
  const extras = extrasIn ?? liveExtras(live, { marks: req.marks ?? [], signed: !!req.signed, writerName: req.writerName ?? '', placeholder: req.placeholder, text: live.page.text });
  const ink = liveInk(req.inkKey);

  // the runs, sheet by sheet, exactly as LiveSheets inserts them
  const runs = live.sheets.map(() => '');
  const opts = { emPx: live.emPx, strokeKeys: true };
  for (const run of live.page.runs) runs[sheetOfLine(live, run.line)] += engine.renderRun(p, live.page, run, opts);
  const svgs = live.sheets.slice(0, only ?? live.sheets.length).map((_, s) => {
    const f = sheetFrame(live, s, ink);
    return scopeIds(f.open, 'W' + s) + runs[s] + f.close.replace(/><\/g><\/svg>$/, `>${extras[s] ?? ''}</g></svg>`);
  });

  // the caret map: one box per written character, with its text offset
  const items = (live.page.items as any[]).filter((it) => offsetOf(it) >= 0 && !it.synthetic && !it.role && (it.kind === 'glyph' || it.kind === 'miss'));
  const glyphs = new Float32Array(items.filter((it) => only == null || sheetOfLine(live, it.line) < only).length * GLYPH_STRIDE);
  let g = 0;
  for (const it of items) {
    const s = sheetOfLine(live, it.line);
    if (only != null && s >= only) break;
    glyphs[g++] = offsetOf(it);
    glyphs[g++] = s;
    glyphs[g++] = it.x;
    glyphs[g++] = it.y - live.sheets[s].shiftU;
    glyphs[g++] = it.kind === 'glyph' ? it.g.advance : 560;
    glyphs[g++] = it.line;
    glyphs[g++] = it.kind === 'glyph' ? 1 : 0;
  }
  const u = live.unitsPerMm;
  return {
    id: req.id,
    handKey: req.seed + ':' + req.style,
    inkKey: req.inkKey,
    inkColor: req.inkColor,
    paper: req.paper,
    svgs,
    emMm: live.emMm,
    lineMm: live.lineMm,
    firstMm: live.firstMm,
    breaks: live.pages.breaks,
    shifts: live.pages.shifts,
    unitsPerMm: u,
    glyphs,
    text: req.text,
    look: lookOf(req),
    spaceU: makeGlyph(p, ' ', null).advance * ((p.wordSpace as number) || 1),
    leftU: paper.text.left * u,
    lines: live.page.lines,
    summary: live.summary,
    ms: performance.now() - t0,
  };
}
