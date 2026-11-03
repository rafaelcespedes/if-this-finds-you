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
import { LIVE, liveExtras, pageSetup, type Live } from './live';
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

/** The live sheet while someone writes in ink. Plain object state; the caller re-renders after changes. */
export class InkSession {
  sheet: any;
  view: any;
  /** when the last key landed, and when ink last went down (for the wet-tail undo) */
  lastKey = 0;
  lastInk = 0;
  constructor(readonly p: Hand, doc: InkDoc, readonly opts: Record<string, unknown>, readonly touch = false) {
    this.sheet = engine.replay(p, doc, opts);
    this.view = engine.newView();
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
  /** Undo lifts only wet ink: the newest event, within 3 s. false: the ink is dry. */
  undo(): boolean {
    if (this.view.tail) return false;
    if (!this.doc.log.length || performance.now() - this.lastInk > 3000) return false;
    this.sheet = engine.dropLast(this.sheet);
    return true;
  }
  private inked(events: unknown[]) {
    if (!events.length) return;
    engine.apply(this.sheet, events);
    this.lastInk = performance.now();
  }
}

/** The ink page written from a log, for the worker and the JPEG. */
export function inkPage(p: Hand, doc: InkDoc, paper: PaperSpec, size: number, lineSpacing: number) {
  const { layout } = inkOpts(p, paper, size, lineSpacing);
  return engine.replay(p, doc, layout).page;
}

/**
 * The caret over an ink sheet: the written letter uses the engine's geometry (offsets of the letter as it
 * reads); offsets past it are in the thought letters the pen hasn't reached, laid out by draftPage.
 */
export function inkGeometry(base: Geometry, live: Live, draft: any, viewText: string): Geometry {
  const written = String(live.page.text ?? '').length;
  const caret = (o: number) => {
    if (o <= written || !draft) return base.caret(Math.min(o, written));
    const j = o - written;
    const glyphs = (draft.items as any[]).filter((it) => it.kind === 'glyph');
    const at = glyphs.find((it) => it.charIndex - (draft.from ?? 0) >= j);
    // (page units, sheets stacked a paper's height apart: the caret's sheet, and its y on that sheet)
    const sheetU = live.paper.h * live.unitsPerMm;
    const onSheet = (y: number) => Math.min(live.sheets.length - 1, Math.max(0, Math.floor(y / sheetU)));
    const place = (x: number, y: number, line: number) => { const s = onSheet(y); return { sheet: s, x, y: y - live.sheets[s].shiftU, line }; };
    if (at) return place(at.x, at.y, at.line);
    const last = glyphs[glyphs.length - 1];
    if (!last) return base.caret(written);
    return place(last.x + (last.g?.advance ?? 0), last.y, last.line);
  };
  // a line's end that's the written letter's end runs on through the thought letters (End, ⌘→)
  const edges = (o: number) => {
    const e = base.edges(Math.min(o, written));
    return e.end >= written && viewText.length > written ? { start: e.start, end: viewText.length } : e;
  };
  return { ...base, text: viewText, caret, edges };
}
