// Turns a WriteRequest into a WriteResult. Runs in the worker for the live page, and on the main
// thread for the download, so both produce the very same SVG.
import { makeGlyph, makeHand, withOverrides } from '@engine';
import { compose } from './compose';
import { getPaper } from './papers';
import { writingSVG } from './writing';
import { GLYPH_STRIDE, type WriteRequest, type WriteResult } from './write-protocol';

const MISS_ADVANCE = 560;

export function write(req: WriteRequest): WriteResult {
  const t0 = performance.now();
  const p = withOverrides(makeHand(req.seed, req.style), req.overrides);
  const paper = getPaper(req.paper);
  const comp = compose(p, req.text, paper, req.size);
  const svgs = comp.sheets.map((sheet, i) => writingSVG(p, sheet, comp.emMm, paper.w, 'w' + i));
  const n = comp.sheets.reduce((a, s) => a + s.items.length, 0);
  const glyphs = new Float32Array(n * GLYPH_STRIDE);
  // items keep reading order within and across sheets
  let k = 0;
  comp.sheets.forEach((sheet, si) => {
    for (const it of sheet.items) {
      glyphs[k++] = si;
      glyphs[k++] = it.x;
      glyphs[k++] = it.y;
      glyphs[k++] = it.kind === 'glyph' ? it.g.advance : MISS_ADVANCE;
      glyphs[k++] = it.line;
      glyphs[k++] = it.kind === 'glyph' ? 1 : 0;
    }
  });
  return {
    id: req.id,
    handKey: req.seed + ':' + req.style,
    paper: req.paper,
    svgs,
    emMm: comp.emMm,
    lineMm: comp.lineMm,
    firstMm: comp.firstMm,
    perPage: comp.perPage,
    unitsPerMm: comp.unitsPerMm,
    glyphs,
    text: req.text,
    spaceU: makeGlyph(p, ' ', null).advance * ((p.wordSpace as number) || 1),
    leftU: paper.text.left * comp.unitsPerMm,
    lines: comp.page.lines,
    ms: performance.now() - t0,
  };
}
