// Splitting a laid-out page into sheets by where the lines really are, not by counting them.
// Every hand has its own line pitch, lines vary a few percent and float off the rule, and a writer may skip
// a rule before a paragraph, so "n lines per sheet" drifts off the bottom of the paper. Here each line is
// checked against the sheet: its baseline must sit on or above the last baseline, and its deepest ink must
// stay above the bottom margin. A line that doesn't fit starts the next sheet, whole, on the first baseline
// (on ruled paper, on the first rule, with its own float kept). An empty line between paragraphs never starts a
// sheet, and a name never starts one without its closing ("Yours," goes over with it).
import { UPM, type Page } from '@engine';

export interface Pagination {
  /** the first line of each sheet */
  breaks: number[];
  /** how far (font units) each sheet's lines move up, so the sheet's first line sits on the first baseline */
  shifts: number[];
}

export interface PageFrame {
  /** first and last baselines on a sheet (font units from the sheet's top) */
  firstU: number;
  lastU: number;
  /** the lowest ink may go on a sheet (font units from the sheet's top) */
  inkU: number;
  /** the line pitch (font units) */
  pitchU: number;
  /** lines sit on the paper's rules (use each line's rule, not its floating baseline) */
  ruled: boolean;
}

interface LineInfo {
  n: number;
  y: number;
  rule?: number | null;
  /** what the line is in the letter (engines with letter shape): 'closing', 'signature', 'name', 'ps', … */
  role?: string;
  /** an empty line between paragraphs */
  blank?: boolean;
}

/** The sheet frame for a paper: baselines from the paper's text box, ink above the bottom edge. */
export function frameFor(paper: { h: number; pitch: number; text: { last: number } }, firstMm: number, lineMm: number, u: number): PageFrame {
  return {
    firstU: firstMm * u,
    lastU: paper.text.last * u,
    // descenders of the last line may go below the last baseline, but never off the paper
    inkU: Math.min(paper.text.last * u + 0.55 * UPM, (paper.h - 3) * u),
    pitchU: lineMm * u,
    ruled: !!paper.pitch,
  };
}

export function paginate(page: Page, f: PageFrame): Pagination {
  const info = ((page as unknown as { lineInfo?: LineInfo[] }).lineInfo ?? []).slice().sort((a, b) => a.n - b.n);
  const lines = Math.max(page.lines || 0, info.length);
  if (!info.length) {
    // an engine without line info: fall back to counting
    const per = Math.max(1, Math.floor((f.lastU - f.firstU) / f.pitchU + 1e-6) + 1);
    const breaks = Array.from({ length: Math.max(1, Math.ceil(lines / per)) }, (_, s) => s * per);
    return { breaks, shifts: breaks.map((b) => b * f.pitchU) };
  }
  // the deepest ink on each line (letters' boxes, y down)
  const deep = new Map<number, number>();
  for (const it of page.items as unknown as { line: number; y: number; box?: number[] }[]) {
    const b = it.box ? it.box[3] : it.y + 0.3 * UPM;
    deep.set(it.line, Math.max(deep.get(it.line) ?? -Infinity, b));
  }
  const tol = (f.ruled ? 0.3 : 0.2) * f.pitchU;
  const breaks = [0];
  const shifts = [0];
  let shift = 0;
  const baseOf = (ln: LineInfo) => (f.ruled && ln.rule != null ? ln.rule : ln.y);
  for (let i = 0; i < info.length; i++) {
    const ln = info[i];
    if (ln.n <= breaks[breaks.length - 1] || ln.blank) continue;
    const base = baseOf(ln);
    const ink = deep.get(ln.n) ?? ln.y + 0.3 * UPM;
    if (base - shift > f.lastU + tol || ink - shift > f.inkU) {
      // the name goes over with its closing, when the closing is on this sheet
      let at = ln;
      if (ln.role === 'signature' || ln.role === 'name') {
        for (let j = i - 1; j >= 0 && info[j].n > breaks[breaks.length - 1]; j--) {
          if (info[j].role === 'closing') { at = info[j]; break; }
        }
      }
      shift = baseOf(at) - f.firstU;
      breaks.push(at.n);
      shifts.push(shift);
    }
  }
  return { breaks, shifts };
}

/**
 * Where the letter's own sign-off block starts (font units from the page's left edge), so the app's signature
 * lines up under it: the last closing line's `start` ("Yours," drifted right), else null (signed at the margin).
 */
export function closingStart(page: unknown): number | null {
  const info = ((page as { lineInfo?: LineInfo[] }).lineInfo ?? []).filter((l) => l.role === 'closing' && typeof (l as { start?: number }).start === 'number');
  const last = info[info.length - 1] as (LineInfo & { start: number }) | undefined;
  return last ? last.start : null;
}

/** The sheet a line is on. */
export function sheetOf(p: Pagination, line: number) {
  let s = 0;
  while (s + 1 < p.breaks.length && p.breaks[s + 1] <= line) s++;
  return s;
}

/**
 * Where a line after the text goes (the signature): one pitch below `fromY` (a baseline, page units), on the
 * same sheet if it fits, else on the first baseline of a sheet of its own. Returns a sheet-local baseline.
 */
export function lineAfter(p: Pagination, f: PageFrame, fromY: number, line: number) {
  const s = sheetOf(p, line);
  const y = fromY - p.shifts[s] + f.pitchU;
  if (y <= f.lastU + 0.2 * f.pitchU) return { sheet: s, y };
  return { sheet: p.breaks.length, y: f.firstU };
}
