// The worker's writer for engines with the live page (incremental runs): the same layout, runs and extra ink
// that LiveSheets draws on the main thread, as one SVG per sheet. Looks change here, off the main thread
// (a new hand's first layout is the expensive part); the live page is only built for typing, and since both
// draw the very same markup, switching between them changes nothing on screen.
import * as E from '@engine';
import { makeGlyph, makeHand, withOverrides } from '@engine';
import { liveExtras, liveLayout, sheetFrame, sheetOfLine } from './live';
import { getPaper } from './papers';
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
  const extras = liveExtras(live, { marks: req.marks ?? [], signed: !!req.signed, writerName: req.writerName ?? '', placeholder: req.placeholder, text: live.page.text });
  const ink = liveInk(req.inkKey);

  // the runs, sheet by sheet, exactly as LiveSheets inserts them
  const runs = live.sheets.map(() => '');
  const opts = { emPx: live.emPx, strokeKeys: true };
  for (const run of live.page.runs) runs[sheetOfLine(live, run.line)] += engine.renderRun(p, live.page, run, opts);
  const svgs = live.sheets.map((_, s) => {
    const f = sheetFrame(live, s, ink);
    return scopeIds(f.open, 'W' + s) + runs[s] + f.close.replace(/><\/g><\/svg>$/, `>${extras[s] ?? ''}</g></svg>`);
  });

  // the caret map: one box per written character, with its text offset
  const items = (live.page.items as any[]).filter((it) => it.charIndex >= 0 && !it.synthetic && !it.role && (it.kind === 'glyph' || it.kind === 'miss'));
  const glyphs = new Float32Array(items.length * GLYPH_STRIDE);
  let g = 0;
  for (const it of items) {
    const s = sheetOfLine(live, it.line);
    glyphs[g++] = it.charIndex;
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
