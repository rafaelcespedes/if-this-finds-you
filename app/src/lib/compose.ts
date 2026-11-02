// Composition: hand + text + paper + size -> sheets of positioned writing, in one shared geometry.
// Everything is computed in millimetres on the paper, then handed to the engine in font units.
// The screen and the JPEG both draw from this, so the download matches what's on screen.
import { layout, UPM, type Hand, type Page, type PageItem } from '@engine';
import { writingLines, type PaperSpec } from './papers';
import { JOURNEY, writeWithJourney } from './engine-features';

export interface Sheet {
  /** items positioned on this sheet, x/y in font units measured from the sheet's top-left corner */
  items: PageItem[];
  /** the sheet height in font units (so a renderer can cover the whole sheet) */
  height: number;
}

export interface Composition {
  paper: PaperSpec;
  /** mm per em: the hand's em at the chosen size */
  emMm: number;
  lineMm: number;
  firstMm: number;
  perPage: number;
  page: Page;
  sheets: Sheet[];
  /** font units per mm (convenience) */
  unitsPerMm: number;
  /** items carry their text offset in charIndex (-1 for extra ink like struck words); else infer by reading order */
  offsetsInItems: boolean;
  /** the draft's corrections, in words ("2 words crossed out, 1 letter written over"), when the engine writes a journey */
  summary?: string;
  transcript?: string;
}

/** The em size (mm) that gives this hand the paper's comfortable x-height, scaled by `size`. */
export function emForPaper(p: Hand, paper: PaperSpec, size: number) {
  const xhFrac = (p.xHeight || 0.55) * 0.7; // x-height as a fraction of the em (cap height is 0.7 em)
  return (paper.xh * size) / xhFrac;
}

export function compose(p: Hand, text: string, paper: PaperSpec, size: number, lineSpacing = 1): Composition {
  const emMm = emForPaper(p, paper, size);
  const u = UPM / emMm; // font units per mm
  const lines = writingLines(paper, emMm, paper.xh * size, lineSpacing);
  const opts = {
    maxWidth: (paper.text.right - paper.text.left) * u,
    lineHeight: lines.lineMm * u,
    firstBaseline: lines.first * u,
  };
  // the writer's own mistakes and corrections over the draft, when the engine has them (amount from p.mistakes)
  const j = JOURNEY && writeWithJourney && text ? writeWithJourney(p, text, opts, { seed: String(p.seed) }) : null;
  const page = j && j.ok ? j.page : layout(p, text, opts);

  const count = Math.max(1, Math.ceil(page.lines / lines.perPage));
  const sheets: Sheet[] = Array.from({ length: count }, () => ({ items: [], height: paper.h * u }));
  const left = paper.text.left * u;
  const lineU = lines.lineMm * u;
  for (const it of page.items) {
    const s = Math.min(count - 1, Math.floor(it.line / lines.perPage));
    const shift = s * lines.perPage * lineU;
    sheets[s].items.push({ ...it, x: it.x + left, y: it.y - shift });
  }
  return {
    paper, emMm, lineMm: lines.lineMm, firstMm: lines.first, perPage: lines.perPage, page, sheets, unitsPerMm: u,
    offsetsInItems: !!(j && j.ok),
    summary: j && j.ok ? j.summary : undefined,
    transcript: j && j.ok ? j.transcript : undefined,
  };
}
