// Ink mode (docs/research/writing-experience.md): typing that behaves like ink. You edit like a computer user;
// the writer corrects like a person: strikes a word through and writes it again, writes a letter over another,
// adds a word above the line with a caret. What is written never moves.
//
// The engine owns the ink (engine/sheet.js): an append-only log (the note's content in Ink mode), a planner
// that turns each Edit into what this writer would do, and a pen that writes what was typed at handwriting
// speed, a few letters behind. The app keeps:
//   - InkSession: the live sheet while someone writes (main thread, like the live page): edits go through
//     plan(), a ~130 ms tick runs penStep(), the textarea shows viewText()
//   - inkLive(): the sheet's page as a Live (one sheet), so LiveSheets, the caret geometry and the JPEG draw it
//   - inkExtras(): what runs don't carry: the faint "thought" letters the pen hasn't reached yet (and, from
//     engines that keep marks outside runs, correction marks)
//   - writeInk(): the same page written in the worker from the log (looks change there, and are prefetched)
import * as E from '@engine';
import { UPM, type Hand } from '@engine';
import type { Edit } from './edits';
import type { Geometry } from './geometry';
import { LIVE, engineGeometry, liveExtras, pageSetup, type Live } from './live';
import { frameFor } from './paginate';
import type { PaperSpec } from './papers';
import { REF_PX_PER_MM } from './writing';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;

/** The engine can write in ink (sheet.js + inklog.js), on top of the live page. */
export const INK =
  LIVE &&
  ['newInkDoc', 'newView', 'replay', 'apply', 'plan', 'penStep', 'viewText', 'draftPage', 'fairCopy', 'postScript', 'dropLast', 'logicalText', 'encodeDoc', 'decodeDoc'].every(
    (k) => typeof engine[k] === 'function',
  );

export type InkDoc = { log: unknown[]; salt?: string } & Record<string, unknown>;

/** A new, empty letter in ink. The salt makes two letters by the same hand differ. */
export function newInkDoc(seed: string, style: string, salt = Math.random().toString(36).slice(2, 8)): InkDoc {
  return engine.newInkDoc({ seed, style, salt });
}
export const encodeInk = (doc: InkDoc): string => engine.encodeDoc(doc);
export function decodeInk(s: string | null | undefined): InkDoc | null {
  if (!s) return null;
  try { return engine.decodeDoc(s); } catch { return null; }
}
/** What an ink letter says now (struck words dropped, overwrites and insertions read in). */
export const inkText = (doc: InkDoc): string => engine.logicalText(doc);

/** A letter already written (a fair text taken into Ink mode): the same text, as ink. */
export function inkFromText(seed: string, style: string, text: string): InkDoc {
  const doc = newInkDoc(seed, style);
  text.split('\n').forEach((part, i) => {
    if (i) doc.log.push({ t: 'break' });
    if (part) doc.log.push({ t: 'write', text: part });
  });
  return doc;
}

/** The engine's layout options for ink on this paper (the page is full past the last baseline's ink). */
export function inkOpts(p: Hand, paper: PaperSpec, size: number, lineSpacing: number) {
  const setup = pageSetup(p, paper, size, lineSpacing);
  const frame = frameFor(paper, setup.lines.first, setup.lineMm, setup.u);
  // the letter flows onto as many sheets as it needs (the engine breaks lines by the same rules as paginate:
  // a line that doesn't fit starts the next sheet, an empty line never does, a closing goes over with its name)
  const sheet = { first: frame.firstU, last: frame.lastU, ink: frame.inkU, height: paper.h * setup.u };
  return { ...setup, frame, sheetU: sheet.height, layout: { ...setup.opts, pageHeight: frame.inkU, sheet } };
}

/** Which sheet a point (page units, y down) is on, when sheets are stacked `sheetU` apart. */
const sheetAtY = (y: number, sheetU: number, count: number) => Math.min(count - 1, Math.max(0, Math.floor(y / sheetU)));

/**
 * An ink letter's page as a Live, for LiveSheets, the caret and the JPEG: as many sheets as the engine broke it
 * into (each line carries its sheet), and as many as the thought letters reach (`draft`), so the writing ahead of
 * the pen never floats past the paper.
 */
export function inkLive(p: Hand, page: any, paper: PaperSpec, size: number, lineSpacing: number, draft?: any): Live {
  const { emMm, u, lines, lineMm, frame, sheetU } = inkOpts(p, paper, size, lineSpacing);
  const info = (page.lineInfo ?? []) as { n: number; y: number; sheet?: number }[];
  const ys = info.map((l) => l.y);
  const lastY = ys.length ? Math.max(...ys) : frame.firstU - frame.pitchU;
  const draftYs = ((draft?.items ?? []) as { kind: string; y: number }[]).filter((it) => it.kind === 'glyph').map((it) => it.y);
  const count = 1 + Math.max(0, ...info.map((l) => l.sheet ?? 0), ...draftYs.map((y) => Math.floor(y / sheetU)));
  const breaks: number[] = [];
  const shifts: number[] = [];
  for (let k = 0; k < count; k++) {
    const first = info.filter((l) => (l.sheet ?? 0) === k).map((l) => l.n);
    // a sheet only the thought letters have reached starts after the last written line
    breaks.push(first.length ? Math.min(...first) : Math.max(page.lines ?? 0, info.length, (breaks[k - 1] ?? -1) + 1));
    shifts.push(k * sheetU);
  }
  breaks[0] = 0;
  const sheets = breaks.map((fromLine, s) => ({ shiftU: shifts[s], fromLine, toLine: breaks[s + 1] ?? Infinity }));
  return {
    p, page, geo: engine.geometry(p, page), paper, emMm, unitsPerMm: u, lineMm, firstMm: lines.first,
    pages: { breaks, shifts }, frame, sheets,
    tailY: lastY + frame.pitchU, emPx: emMm * REF_PX_PER_MM,
    widthPx: Math.round(paper.w * REF_PX_PER_MM), heightPx: Math.ceil(paper.h * REF_PX_PER_MM),
  };
}

const GRAPHITE = '#6f6f78';

/** Contours of a posed item (letter or mark) in page units, y up, ready for contoursToD. */
function itemContours(it: any): number[][][] {
  const cs = (it.g?.contours ?? []) as number[][][];
  return cs.map((c) => c.map(([qx, qy]) => [it.x + qx, -(it.y - qy)]));
}

/**
 * Extra ink on the ink page: correction marks not in a run (older engines), the thought letters the pen hasn't
 * reached yet (faint graphite, where they'll be written), and the signature.
 */
export function inkExtras(live: Live, x: { draft?: any; signed: boolean; writerName: string }): string[] {
  const sc = live.emPx / UPM;
  const n = live.sheets.length;
  const sheetU = live.paper.h * live.unitsPerMm;
  // each sheet's own: marks and thoughts go on the sheet their line is on
  const out: string[] = Array.from({ length: n }, () => '');
  const thoughts: string[] = Array.from({ length: n }, () => '');
  // newer engines put each correction mark in a run of its own (LiveSheets draws and inks it with the
  // words); only marks outside every run are drawn here, flat
  const inRun = new Set<number>();
  for (const r of (live.page.runs ?? []) as any[]) for (let i = r.from; i < r.to; i++) inRun.add(i);
  for (const [i, it] of (live.page.items as any[]).entries()) {
    if (it.kind !== 'mark' || inRun.has(i)) continue;
    const cs = itemContours(it);
    if (cs.length) out[sheetAtY(it.y ?? 0, sheetU, n)] += `<path data-key="${String(it.key).replace(/"/g, '')}" d="${E.contoursToD(cs, 0, 0, sc)}"/>`;
  }
  if (x.draft) {
    for (const it of x.draft.items as any[]) {
      if (it.kind !== 'glyph') continue;
      const cs = itemContours(it);
      if (cs.length) thoughts[sheetAtY(it.y, sheetU, n)] += `<path d="${E.contoursToD(cs, 0, 0, sc)}"/>`;
    }
    thoughts.forEach((t, s) => { if (t) out[s] += `<g fill="${GRAPHITE}" fill-opacity="0.24" class="thoughts">${t}</g>`; });
  }
  if (x.signed && x.writerName) {
    const sig = liveExtras(live, { marks: [], signed: true, writerName: x.writerName, text: live.page.text });
    sig.forEach((s, i) => { if (s && i < n) out[i] += s; });
  }
  return out;
}

/** how long ink stays wet (writing-experience.md §4.5): an event can be lifted this long after it went down */
const WET_MS = 3000;

/** The live sheet while someone writes in ink. Plain object state; the caller re-renders after changes. */
export class InkSession {
  sheet: any;
  view: any;
  /** when the last key landed, and when ink last went down */
  lastKey = 0;
  lastInk = 0;
  /** when each event of the log went down (the log's own order); events from before this session are long dry */
  private inkedAt: number[];
  constructor(readonly p: Hand, doc: InkDoc, readonly opts: Record<string, unknown>, readonly touch = false) {
    this.sheet = engine.replay(p, doc, opts);
    this.view = engine.newView();
    this.inkedAt = doc.log.map(() => -Infinity);
  }
  get doc(): InkDoc { return this.sheet.doc; }
  get page() { return this.sheet.page; }
  /** what the textarea holds: the letter as it reads, plus what the pen hasn't written yet */
  text(): string { return engine.viewText(this.sheet, this.view); }
  /** typed and not yet written (or a fix the writer is still considering) */
  get waiting() { return !!(this.view.tail || this.view.mid?.text || this.view.pending); }
  /** a fix at the pen head: the pen hovers while the writer considers */
  get hovering() { return !!this.view.pending; }
  get full(): boolean { return !!this.sheet.page?.full; }
  draft() { return this.view.tail ? engine.draftPage(this.sheet, this.view) : null; }

  edit(e: Edit) {
    const r = engine.plan(this.sheet, this.view, { at: e.at, del: e.del, ins: e.ins, kind: e.kind });
    this.view = r.view;
    if (r.events.length) this.inked(r.events);
    this.lastKey = performance.now();
  }
  /** the pen catches up; true when anything changed */
  step(dt: number, final = false): boolean {
    const r = engine.penStep(this.sheet, this.view, { dt, idle: performance.now() - this.lastKey, forgiving: true, touch: this.touch, final });
    const moved = r.events.length > 0 || (r.view.tail !== this.view.tail) || !!r.view.pending !== !!this.view.pending;
    this.view = r.view;
    if (r.events.length) this.inked(r.events);
    return moved;
  }
  /** everything typed, written now (before leaving, a fair copy, a P.S.) */
  flush() { this.step(0, true); }
  fairCopy() { this.flush(); this.inked(engine.fairCopy(this.sheet)); }
  postScript() { this.flush(); this.inked(engine.postScript(this.sheet)); }
  freshSheet() { this.flush(); this.inked([{ t: 'sheet', why: 'fresh' }]); }
  /** the newest event is still wet: put down in the last 3 s (each event dries on its own) */
  get wet(): boolean {
    const n = this.doc.log.length;
    return n > 0 && performance.now() - (this.inkedAt[n - 1] ?? -Infinity) <= WET_MS;
  }
  /** Undo lifts only wet ink: the newest event, while it's wet. false: the ink is dry. */
  undo(): boolean {
    if (this.view.tail || !this.wet) return false;
    this.sheet = engine.dropLast(this.sheet);
    this.inkedAt.length = this.doc.log.length;
    return true;
  }
  /**
   * Undo a step that's on the paper: lift wet ink, newest first, until the letter reads `want`, or until what's left
   * leads into it (a lifted piece took a word too many: the rest is typed again, and the pen writes it). Never lifts
   * dry ink. false, with nothing changed: the ink is dry, or lifting doesn't get there.
   */
  liftTo(want: string): boolean {
    if (this.waiting) return false;
    const lifted: { e: unknown; at: number }[] = [];
    while (lifted.length < 64 && this.wet) {
      const n = this.doc.log.length;
      lifted.push({ e: this.doc.log[n - 1], at: this.inkedAt[n - 1] });
      this.sheet = engine.dropLast(this.sheet);
      this.inkedAt.length = this.doc.log.length;
      const t = this.text();
      if (t === want) return true;
      if (want.startsWith(t) && t.length < want.length) {
        this.edit({ at: t.length, del: 0, ins: want.slice(t.length), kind: 'type', t: Date.now(), source: 'paper' });
        return true;
      }
    }
    if (!lifted.length) return false;
    // lifting doesn't get there: everything goes back as it was
    for (const { e, at } of lifted.reverse()) { this.doc.log.push(e); this.inkedAt.push(at); }
    this.sheet = engine.replay(this.p, this.doc, this.opts);
    return false;
  }
  private inked(events: unknown[]) {
    if (!events.length) return;
    engine.apply(this.sheet, events);
    this.lastInk = performance.now();
    for (let i = this.inkedAt.length; i < this.doc.log.length; i++) this.inkedAt.push(this.lastInk);
  }
}

/** The ink page written from a log, for the worker and the JPEG. */
export function inkPage(p: Hand, doc: InkDoc, paper: PaperSpec, size: number, lineSpacing: number) {
  const { layout } = inkOpts(p, paper, size, lineSpacing);
  return engine.replay(p, doc, layout).page;
}

/**
 * Where each offset of what's typed (the textarea) is on the paper: the written letter's text, then the thought
 * letters (page.text + view.tail, the offsets the caret geometry knows). The two differ while the pen is busy
 * elsewhere than the end:
 *   - an insertion being typed mid-text (view.mid) isn't on the paper yet: its letters sit at the insertion point
 *   - letters Backspaced at the pen head (view.pending) are still on the paper while the writer decides how to fix
 *     them: the textarea has dropped them, and the thought letters are written after them
 * `toPaper[i]` is the paper offset for textarea offset i (0..length); it never decreases.
 */
export function inkOffsets(sheet: any, view: any): { toPaper: number[]; paperLen: number } {
  const recs = (sheet.reader?.recs ?? []) as { id: number; ch: string; over?: string; struck?: unknown; joined?: boolean }[];
  const pending = new Set<number>(view?.pending?.ids ?? []);
  const mid = view?.mid?.text ? (view.mid as { after: number; text: string }) : null;
  const tail = String(view?.tail ?? '');
  const toPaper: number[] = [];
  let g = 0, midDone = false, pendAt = -1;
  const putMid = () => { if (mid && !midDone) { for (let j = 0; j < mid.text.length; j++) toPaper.push(g); midDone = true; } };
  if (mid && mid.after < 0) putMid();
  for (const r of recs) {
    if (!r.struck && !r.joined) {
      const c = r.over || r.ch;
      if (pending.has(r.id)) { if (pendAt < 0) pendAt = g; }
      else for (let j = 0; j < c.length; j++) toPaper.push(g + j);
      g += c.length;
    }
    if (mid && mid.after === r.id) putMid();
  }
  putMid(); // its anchor isn't in this sheet's text: where it was typed (the end)
  for (let j = 0; j < tail.length; j++) toPaper.push(g + j);
  // the end: after the thought letters; with only a pending fix, where the Backspaces reached
  toPaper.push(tail.length ? g + tail.length : pendAt >= 0 ? pendAt : g);
  return { toPaper, paperLen: g + tail.length };
}

/**
 * The caret over an ink sheet: the written letter and the thought letters the pen hasn't reached (draftPage) as one
 * geometry, so every offset of what's typed has a caret, both sides of every wrap, and Home, End, selection and
 * hit-testing work across both alike. Its offsets are the textarea's (inkOffsets maps them onto the paper).
 */
export function inkGeometry(live: Live, p: Hand, ink: InkSession): Geometry {
  const draft = ink.draft();
  const written = String(live.page.text ?? '').length;
  const geo = draft ? engine.geometry(p, [live.page, engine.offsetStops(draft, written - (draft.from || 0))]) : live.geo;
  const viewText = ink.text();
  const { toPaper, paperLen } = inkOffsets(ink.sheet, ink.view);
  const g = engineGeometry(live, { geo, text: String(live.page.text ?? '') + String(ink.view?.tail ?? '') });
  if (toPaper.length !== viewText.length + 1 || paperLen !== g.text.length) return { ...g, text: viewText }; // (never: a safe fallback)
  const toP = (o: number) => toPaper[Math.max(0, Math.min(toPaper.length - 1, o))];
  // paper -> textarea: the first offset at or after it (left), or the last at or before it (right: a line's end)
  const fromP = (x: number, bias: 'left' | 'right' = 'left') => {
    let lo = 0, hi = toPaper.length - 1;
    if (bias === 'left') {
      while (lo < hi) { const m = (lo + hi) >> 1; if (toPaper[m] >= x) hi = m; else lo = m + 1; }
      return lo;
    }
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (toPaper[m] <= x) lo = m; else hi = m - 1; }
    return lo;
  };
  return {
    ...g,
    text: viewText,
    caret: (o, side) => g.caret(toP(o), side),
    hit: (sheet, x, y) => fromP(g.hit(sheet, x, y)),
    vertical: (o, dir, goalX, side) => { const v = g.vertical(toP(o), dir, goalX, side); return { o: fromP(v.o), goalX: v.goalX }; },
    edges: (o, side) => { const e = g.edges(toP(o), side); return { start: fromP(e.start), end: fromP(e.end, 'right') }; },
    ribbons: (from, to) => g.ribbons(toP(from), toP(to)),
  };
}
