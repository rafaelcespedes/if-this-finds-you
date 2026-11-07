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
//   - the typing's tempo (engine tempo.js): every key's timing goes to the typist, each unwritten letter remembers the
//     tempo it was typed at, and a write carries the tempo of its first new word (write.haste), so a fast burst comes
//     out hastier and slow typing tidier, and a replay gives the same page
//   - wet ink: one window per pen (wetWindow), from the moment the drawn pen lifts off an event's last stroke; the look
//     (LiveSheets wetMs) and Undo (InkSession.wet) both go by it, so ⌘Z works exactly while the ink looks wet
//   - the draft (thought letters) is laid out a word at a time, each word from where the last one ended, exactly as the
//     pen will hand them over and write them: a key re-lays only the word being typed, a word handed over drops off the
//     front, and a long paste is laid out once
//   - formatting by hand (engine format.js): a style for what's typed next (setStyle: leaning in, pressed harder, a
//     size), titles, headings and lists the writer's own way (setRole, setList, with `# `, `- `, `[] `, `1. ` at the start
//     of a line), checklist ticks (toggleCheck, checks), the highlighter (highlight, inkHighlights), and style(): what
//     the toolbar shows at the caret
import * as E from '@engine';
import { UPM, type Hand } from '@engine';
import type { Edit } from './edits';
import type { CaretPos, Geometry, Side } from './geometry';
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
  // a ruled margin, if the paper has one: a stet goes left of it (engine stet(); nothing else reads it)
  const marginRule = paper.margin ? paper.margin.x * setup.u : undefined;
  return { ...setup, frame, sheetU: sheet.height, layout: { ...setup.opts, pageHeight: frame.inkU, sheet, marginRule } };
}

/** The engine's caret geometry of a written page, kept per page: typing that only adds thought letters doesn't change it. */
const geoOf = new WeakMap<object, { p: Hand; geo: unknown }>();
function pageGeometry(p: Hand, page: any) {
  const c = page && typeof page === 'object' ? geoOf.get(page) : undefined;
  if (c && c.p === p) return c.geo;
  const geo = engine.geometry(p, page);
  if (page && typeof page === 'object') geoOf.set(page, { p, geo });
  return geo;
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
    p, page, geo: pageGeometry(p, page), paper, emMm, unitsPerMm: u, lineMm, firstMm: lines.first,
    pages: { breaks, shifts }, frame, sheets,
    tailY: lastY + frame.pitchU, emPx: emMm * REF_PX_PER_MM,
    widthPx: Math.round(paper.w * REF_PX_PER_MM), heightPx: Math.ceil(paper.h * REF_PX_PER_MM),
  };
}

const GRAPHITE = '#6f6f78';
/** how strongly the thought letters show (faint graphite); the drawn pen's waiting letters match it (LiveSheets) */
export const INK_THOUGHT = 0.24;
export const THOUGHT_FILL = GRAPHITE;

/** Contours of a posed item (letter or mark) in page units, y up, ready for contoursToD. */
function itemContours(it: any): number[][][] {
  const cs = (it.g?.contours ?? []) as number[][][];
  return cs.map((c) => c.map(([qx, qy]) => [it.x + qx, -(it.y - qy)]));
}

/** One word of thought letters: `id` changes whenever its drawing does, `d` is its outline (sheet px). */
export type ThoughtWord = { id: string; d: string };
/** inkExtras' markup by sheet; with a draft, the thought letters ride along as words (LiveSheets patches them per word) */
export type InkExtras = string[] & { thoughts?: ThoughtWord[][] };
// a draft letter's outline, and a serial per letter object: a word laid out again is a new word; one kept isn't
const thoughtD = new WeakMap<object, { sc: number; d: string }>();
const extrasOf = new WeakMap<object, { sc: number; n: number; sheetU: number; flat: string[] }>();
const piecesDrawn = new WeakMap<object, { sc: number; n: number; sheetU: number; words: { s: number; t: ThoughtWord }[] }>();
const serialOf = new WeakMap<object, number>();
let serials = 0;

/**
 * Extra ink on the ink page: correction marks not in a run (older engines), the thought letters the pen hasn't
 * reached yet (faint graphite, where they'll be written), and the signature. The thought letters come as words
 * (`.thoughts`, a list per sheet), so the page patches a word at a time instead of rewriting them all on every key.
 */
export function inkExtras(live: Live, x: { draft?: any; signed: boolean; writerName: string }): InkExtras {
  const sc = live.emPx / UPM;
  const n = live.sheets.length;
  const sheetU = live.paper.h * live.unitsPerMm;
  // each sheet's own: marks and thoughts go on the sheet their line is on
  // (kept per page and scale: a key that only adds thought letters doesn't walk the sheet again)
  const memo = extrasOf.get(live.page);
  let flat: string[];
  if (memo && memo.sc === sc && memo.n === n && memo.sheetU === sheetU) flat = memo.flat;
  else {
    flat = Array.from({ length: n }, () => '');
    // newer engines put each correction mark in a run of its own (LiveSheets draws and inks it with the
    // words); only marks outside every run are drawn here, flat
    const inRun = new Set<number>();
    for (const r of (live.page.runs ?? []) as any[]) for (let i = r.from; i < r.to; i++) inRun.add(i);
    for (const [i, it] of (live.page.items as any[]).entries()) {
      // marks outside every run, and letters gone over again (pressed harder: drawn over the letter, in no run)
      if (inRun.has(i) || !(it.kind === 'mark' || it.role === 'retrace')) continue;
      const cs = itemContours(it);
      if (cs.length) flat[sheetAtY(it.y ?? 0, sheetU, n)] += `<path data-key="${String(it.key).replace(/"/g, '')}" d="${E.contoursToD(cs, 0, 0, sc)}"/>`;
    }
    if (live.page && typeof live.page === 'object') extrasOf.set(live.page, { sc, n, sheetU, flat });
  }
  const out: InkExtras = flat.slice();
  if (x.draft) {
    const words: ThoughtWord[][] = Array.from({ length: n }, () => []);
    // a draft laid out a word at a time (InkSession.draft): each piece's words kept with it, so a render walks the
    // pieces, not every letter of a long paste
    const piece = (pg: any) => {
      let c = piecesDrawn.get(pg);
      if (!c || c.sc !== sc || c.n !== n || c.sheetU !== sheetU) {
        c = { sc, n, sheetU, words: [] };
        const sub = inkExtras(live, { draft: { items: pg.items }, signed: false, writerName: '' }).thoughts ?? [];
        sub.forEach((list, s) => { for (const t of list) c!.words.push({ s, t }); });
        piecesDrawn.set(pg, c);
      }
      for (const { s, t } of c.words) words[s].push(t);
    };
    // the insertion being typed mid-text, faint where it will be written above the line (InkSession.insertDraft)
    const others = () => { if (x.draft.ins?.items?.length) piece(x.draft.ins); };
    if (Array.isArray(x.draft.pieces)) {
      for (const pg of x.draft.pieces as any[]) piece(pg);
      others();
      out.thoughts = words;
      if (x.signed && x.writerName) {
        const sig = liveExtras(live, { marks: [], signed: true, writerName: x.writerName, text: live.page.text });
        sig.forEach((s, i) => { if (s && i < n) out[i] += s; });
      }
      return out;
    }
    let w: { s: number; wkey: unknown; id: string; d: string } | null = null;
    const put = () => { if (w && w.d) words[w.s].push({ id: w.id, d: w.d }); w = null; };
    for (const it of x.draft.items as any[]) {
      if (it.kind !== 'glyph') continue;
      let c = thoughtD.get(it);
      if (!c || c.sc !== sc) { const cs = itemContours(it); c = { sc, d: cs.length ? E.contoursToD(cs, 0, 0, sc) : '' }; thoughtD.set(it, c); }
      const d = c.d;
      let k = serialOf.get(it);
      if (k == null) { k = ++serials; serialOf.set(it, k); }
      const s = sheetAtY(it.y, sheetU, n);
      if (!w || w.wkey !== it.wkey || w.s !== s) { put(); w = { s, wkey: it.wkey, id: '', d: '' }; }
      w.id += k.toString(36) + '.';
      w.d += d;
    }
    put();
    // (the outline is in sheet px at this size: another size is another word)
    for (const list of words) for (const t of list) t.id += sc.toFixed(5);
    others();
    out.thoughts = words;
  }
  if (x.signed && x.writerName) {
    const sig = liveExtras(live, { marks: [], signed: true, writerName: x.writerName, text: live.page.text });
    sig.forEach((s, i) => { if (s && i < n) out[i] += s; });
  }
  return out;
}

/**
 * The highlighter's swipes (InkSession.highlight), one SVG per sheet, for a layer UNDER the ink: the same frame as the
 * sheet's ink SVG (sheetFrame's viewBox), so it sits exactly under it. '' for a sheet with none.
 */
export function inkHighlights(live: Live): string[] {
  const n = live.sheets.length;
  const hs = (live.page.highlights ?? []) as unknown[];
  if (!hs.length || typeof engine.highlightsSVG !== 'function') return Array.from({ length: n }, () => '');
  const g = engine.highlightsSVG(live.page, live.emPx) as string;
  const sc = live.emPx / UPM;
  return live.sheets.map((sh) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${(sh.shiftU * sc).toFixed(2)} ${live.widthPx} ${live.heightPx}" width="100%" height="100%" aria-hidden="true" style="position:absolute;inset:0">${g}</svg>`);
}

/**
 * How long ink stays wet, by pen (editor-ux.md §3.4; real drying times rank this way): a ballpoint's paste ink is dry
 * almost at once, a felt tip soon after, gel slower, and a fountain or dip pen's water-based ink slowest. One window
 * per pen, used by both the look (LiveSheets `wetMs`) and Undo (InkSession.wet): ⌘Z lifts ink exactly while it looks
 * wet. The clock starts when the drawn pen lifts off the event's last stroke, not when it entered the log.
 */
const WET_BY_PEN: Record<string, number> = { ballpoint: 2000, felt: 3000, gel: 4000, fountain: 6000, pointed: 6000, italic: 6000 };
/** any other pen (and engines that can't say which pen a hand holds) */
export const WET_MS = 3000;
export function wetWindow(p: Hand): number {
  const key = typeof engine.penKey === 'function' ? (engine.penKey(p) as string) : '';
  return WET_BY_PEN[key] ?? WET_MS;
}
/** Iron gall goes on pale and darkens as it dries (every other ink goes on deeper and lightens) */
export function inkDarkens(p: Hand, inkKey?: string | null): boolean {
  if (inkKey === 'iron-gall') return true;
  if (inkKey && inkKey !== 'auto') return false;
  try { return typeof engine.inkModel === 'function' && engine.inkModel(p)?.key === 'iron-gall'; } catch { return false; }
}
/**
 * The drying, in five front-loaded steps (most of the change early, the way solvent evaporates): step n holds from
 * WET_STEPS[n] of the window; past the window it's dry. The gamma exponent and alpha slope of each step's filter (the
 * look); iron gall's exponents go the other way, pale to dark.
 */
export const WET_STEPS = [0, 0.15, 0.35, 0.6, 0.85];
export const WET_LOOK = { gamma: [1.3, 1.22, 1.15, 1.09, 1.04], alpha: [1.08, 1.06, 1.04, 1.02, 1], ironGall: [0.8, 0.86, 0.92, 0.96, 0.98] };
/** the step of drying `age` ms after the pen lifted: 0 (just down) … 4, or -1 (dry) */
export function wetStep(age: number, windowMs: number): number {
  if (!(age < windowMs)) return -1;
  let k = 0;
  while (k + 1 < WET_STEPS.length && age >= WET_STEPS[k + 1] * windowMs) k++;
  return k;
}
/** when the step after this one starts (ms after the lift), or the window's end */
export const wetNext = (step: number, windowMs: number) => (step + 1 < WET_STEPS.length ? WET_STEPS[step + 1] : 1) * windowMs;

/** The drawn pen (LiveSheets' createPen), as the ink session reads it */
export interface DrawnPen {
  at(now: number): { letters: number; speed?: number; copying?: boolean };
  liftedAt?(key: string): number | undefined;
  rush?: boolean;
  trail?: number;
}
/**
 * When the drawn pen lifted off event `ev`'s last stroke (ms, performance.now()): its ink starts drying then. null:
 * the pen is still writing it (wet, and not drying yet). undefined: it drew nothing of it, or there's no drawn pen to
 * ask (the caller goes by when the event went down). The event's letters and marks on the page are its items with
 * item.ev === ev; they're appended in the log's order, so only the page's last items are looked at.
 */
export function eventLift(page: any, ev: number, liftedAt: ((key: string) => number | undefined) | undefined): number | null | undefined {
  if (!liftedAt) return undefined;
  const items = (page?.items ?? []) as { ev?: number; key: string; kind: string; g?: { strokes: unknown[] } }[];
  let last: number | null | undefined = undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.ev == null || it.ev > ev) continue;
    if (it.ev < ev) break;
    if ((it.kind !== 'glyph' && it.kind !== 'mark') || !it.g?.strokes.length) continue;
    const t = liftedAt(it.key);
    if (t === undefined) return null;
    last = last == null ? t * 1000 : Math.max(last, t * 1000);
  }
  return last;
}

/** the most letters the planner's fix at the pen head takes on (sheet.js plan: a longer run is struck instead) */
const LONG_FIX = 24;
/** more letters than this arriving at once (a paste) are copied out: written within COPY_S, however many */
const COPY_FROM = 60;
const COPY_S = 6;
const NO_KEYS: string[] = [];
/** how long one call may spend laying out new thought letters (ms): a paste of hundreds of letters comes in parts */
const DRAFT_MS = 12;
/** one word as the pen is handed it: spaces before it, the word, spaces after (a line break starts the next word) */
const CHUNK = /^\s*\S+[ \t]*/;
/** a reader that's inside no word (hasteNext for every piece of the draft after the first) */
const NOT_IN_WORD = { page: { pen: { open: null } } };
/** two layout pen states are the same place (a word handed over is written exactly where its draft went) */
function samePen(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const k of ['lineNo', 'x', 'offset', 'para', 'words', 'glyphs', 'pending', 'endO', 'endX', 'lp', 'wp', 'sheet', 'prevEnd']) if (a[k] !== b[k]) return false;
  return !!a.open === !!b.open;
}

/**
 * The person typing (engine tempo.js): their own average pace and the tempo of the last few keys. One for the page,
 * not one per sheet: a new hand or a fresh sheet is still the same person typing.
 */
const TYPIST: unknown = typeof engine.newTypist === 'function' ? engine.newTypist() : null;

/** The style what's typed next is written in (engine format.js): lean 0–2 (leaning in), weight 0–2 (pressed harder), size (a factor). */
export type InkStyle = { lean: number; weight: number; size: number };
export type InkRole = 'title' | 'heading' | 'body';
export type InkList = 'bullet' | 'number' | 'check';
export type InkHighlight = 'yellow' | 'pink' | 'green' | 'blue';
/** What the toolbar shows at the caret: the style (of the words there, or of what's typed next) and the line's format. */
export type InkFormat = InkStyle & {
  role: InkRole;
  list: InkList | null;
  /** the line can be set out as a title, heading or list now (nothing on it is ink yet) */
  canFormatLine: boolean;
};
/** A checklist box on the sheet: the item's line (its paragraph in the text), ticked or not, and where the box is. */
export type InkCheck = {
  line: number;
  /** the item's first glyph id (what a `check` event names) */
  at: number;
  checked: boolean;
  /** which sheet of the page, and the box on it: [x0, y0, x1, y1] in page units from that sheet's top-left (y down) */
  sheet: number;
  box: [number, number, number, number];
};
const PLAIN: InkStyle = { lean: 0, weight: 0, size: 1 };
/** how long a centred title waits for its line to be finished before the pen writes what's there (ms) */
const HOLD_LINE_MS = 1600;

/** The live sheet while someone writes in ink. Plain object state; the caller re-renders after changes. */
export class InkSession {
  sheet: any;
  view: any;
  /** when the last key landed, and when ink last went down */
  lastKey = 0;
  lastInk = 0;
  /** how long this pen's ink stays wet (ms): the look (LiveSheets wetMs) and Undo go by the same window */
  readonly wetMs: number;
  /**
   * The drawn pen (LiveSheets' `penRef`), when the page shares it: ink then dries from the moment that pen lifts off it
   * (Undo lifts it exactly while it looks wet), a long paste is handed to it as fast as it copies it out, and a click or
   * Esc during a copy-out (pen.rush) writes the rest at once. Without it, ink dries from when it went down.
   */
  drawn: { current: DrawnPen | null } | null = null;
  /** when each event of the log went down (the log's own order); events from before this session are long dry */
  private inkedAt: number[];
  /**
   * The tempo each unwritten letter was typed at (one per UTF-16 unit of view.tail): a word is written at the tempo it
   * was typed at, however far behind the pen is.
   */
  private tailHaste: number[] = [];
  constructor(readonly p: Hand, doc: InkDoc, readonly opts: Record<string, unknown>, readonly touch = false, private readonly typist: unknown = TYPIST) {
    this.sheet = engine.replay(p, doc, opts);
    this.view = engine.newView();
    this.inkedAt = doc.log.map(() => -Infinity);
    this.wetMs = wetWindow(p);
  }
  get doc(): InkDoc { return this.sheet.doc; }
  get page() { return this.sheet.page; }
  /** what the textarea holds: the letter as it reads, plus what the pen hasn't written yet */
  text(): string {
    // (asked for several times a key: the same letter and view, the same text)
    const k = this.textKey;
    if (k.sheet === this.sheet && k.view === this.view && k.n === this.doc.log.length && k.page === this.sheet.page) return k.text;
    const text = engine.viewText(this.sheet, this.view) as string;
    this.textKey = { sheet: this.sheet, view: this.view, n: this.doc.log.length, page: this.sheet.page, text };
    return text;
  }
  private textKey: { sheet: unknown; view: unknown; n: number; page: unknown; text: string } = { sheet: null, view: null, n: -1, page: null, text: '' };
  /** typed and not yet written (or a fix the writer is still considering) */
  get waiting() { return !!(this.view.tail || this.view.mid?.text || this.view.pending); }
  /** a fix at the pen head: the pen hovers while the writer considers */
  get hovering() { return !!this.view.pending; }
  get full(): boolean { return !!this.sheet.page?.full; }

  // ---------- the draft: the thought letters ----------
  /**
   * The thought letters, laid out a word at a time as the pen will be handed them (each word from where the last one
   * ends, at the tempo it was typed at), so they sit exactly where their ink will. Kept between calls: a key re-lays
   * only the word it changed, a word handed to the pen drops off the front, and a long paste is laid out once. A
   * paste's new letters are laid out about DRAFT_MS at a time (the first ones at once), so no frame waits on hundreds
   * of letters: until it's all there, `drafting` is true, and step() lays out more each time it's called (`grow`); a
   * render meanwhile shows what's there, plus a word at most.
   */
  draft(grow = false) {
    const tail = String(this.view.tail ?? '');
    // (the thought letters of an insertion being typed mid-text ride along: `ins`, see insertDraft)
    const ins = this.insertDraft();
    if (!tail) return ins ? this.withInsert(null, ins) : null;
    const d = this.tailDraft(tail, grow);
    return ins ? this.withInsert(d, ins) : d;
  }
  /**
   * The thought letters of the insertion being typed mid-text (view.mid), where the pen will write them above the line
   * (engine draftInsert): { items (the letters, page units), caret (the ‸ mark the pen will draw under a new insertion,
   * or null when it carries one on: not drawn as a thought), stops (o: the offset in the insertion's text; x, y on its
   * own baseline), line (the written line it goes above), text }. null when nothing is being inserted.
   */
  insertDraft(): any {
    const mid = this.view.mid;
    if (!mid?.text || typeof engine.draftInsert !== 'function') return null;
    const key = `${mid.after}|${mid.over ?? ''}|${mid.text}`;
    const m = this.insMemo;
    if (m && m.page === this.sheet.page && m.key === key) return m.d;
    const d = engine.draftInsert(this.sheet, this.view);
    this.insMemo = { page: this.sheet.page, key, d };
    return d;
  }
  private insMemo: { page: unknown; key: string; d: any } | null = null;
  /** the draft with the insertion's thought letters on it (one object while both are the same) */
  private withInsert(d: any, ins: any) {
    const m = this.withMemo;
    if (m && m.d === d && m.ins === ins) return m.out;
    const out = d ? { ...d, ins } : { items: [], stops: [], lineInfo: [], from: 0, text: '', lines: 0, pieces: [], ins };
    this.withMemo = { d, ins, out };
    return out;
  }
  private withMemo: { d: any; ins: any; out: any } | null = null;
  private tailDraft(tail: string, grow: boolean) {
    const st = this.sheet;
    const S = st.cur?.stream;
    const style = this.typingStyle();
    // (laid out whole, as the engine does: a P.S., with options of its own; a centred title or a line with a format of
    // its own, set out on the whole line; and a tail with a new line that may take a format, written a line at a time)
    const fmt = typeof engine.lineNow === 'function' ? engine.lineNow(st) as { as: string; centre: boolean } : null;
    const formatted = !!fmt && (fmt.centre || fmt.as !== 'body' || /\n[ \t]*(#|[-*•]|\d+[.)]|\[)/.test(tail));
    if (!S || S !== st.cur.main || !st.opts || typeof engine.layout !== 'function' || !st.page?.pen || formatted) {
      const key = `${tail}|${this.nextHaste()}|${JSON.stringify(style ?? null)}`;
      const w = this.whole && this.whole.page === st.page && this.whole.key === key ? this.whole : { page: st.page, key, draft: engine.draftPage(st, this.view, { haste: this.nextHaste(), style }) };
      this.whole = w;
      return w.draft;
    }
    // (the style typing is in goes on every word, as on every write that starts one: format.js)
    const base = { ...st.opts, ink: { salt: st.salt ?? '' }, ...(style ? { style } : {}) };
    const styleKey = JSON.stringify(style ?? null);
    const pen0 = st.page.pen;
    // the pieces still good: from the one that starts where the pen is now
    const old = this.pieces;
    let k = old.findIndex((pc) => pc.start === pen0);
    if (k < 0) k = old.findIndex((pc) => samePen(pc.start, pen0));
    const keep = k < 0 ? [] : old.slice(k);
    const hastes = this.tailHaste.length === tail.length ? this.tailHaste : null;
    const pieces: typeof old = [];
    let rest = tail, o = 0, start = pen0, same = true, made = 0;
    const until = grow || !this.drafting ? performance.now() + DRAFT_MS : -Infinity;
    this.drafting = false;
    while (rest) {
      const m = CHUNK.exec(rest);
      const text = m ? m[0] : rest;
      const h = this.typist && typeof engine.hasteNext === 'function' && hastes
        ? (engine.hasteNext(pieces.length ? NOT_IN_WORD : st, text, hastes.slice(o, o + text.length)) as number) : 0;
      const was = same ? keep[pieces.length] : undefined;
      let pc;
      if (was && was.text === text && was.haste === h && was.style === styleKey && (was.start === start || (pieces.length === 0 && samePen(was.start, start)))) pc = pieces.length === 0 ? { ...was, start } : was;
      else {
        if (made && performance.now() > until) { this.drafting = true; break; }
        same = false;
        made++;
        const pg = engine.layout(this.p, text, h ? { ...base, haste: h, start } : { ...base, start });
        pc = { text, haste: h, style: styleKey, start, pg };
      }
      pieces.push(pc);
      start = pc.pg.pen;
      rest = rest.slice(text.length);
      o += text.length;
    }
    this.pieces = pieces;
    // the same pieces: the same draft (one object, so what's drawn from it can tell it hasn't changed)
    const memo = this.assembled;
    if (memo && memo.list.length === pieces.length && memo.list.every((pc, i) => pc.pg === pieces[i].pg)) return memo.draft;
    const items: any[] = [], stops: any[] = [];
    const lines = new Map<number, any>();
    for (const pc of pieces) {
      for (const it of pc.pg.items) items.push(it);
      for (const sp of pc.pg.stops) stops.push(sp);
      for (const ln of pc.pg.lineInfo) lines.set(ln.n, ln);
    }
    const last = pieces[pieces.length - 1].pg;
    const draft = { ...last, items, stops, lineInfo: [...lines.values()].sort((a, b) => a.n - b.n), from: pieces[0].pg.from, text: tail.slice(0, o), lines: lines.size, partial: this.drafting, pieces: pieces.map((pc) => pc.pg) };
    this.assembled = { list: pieces.slice(), draft };
    return draft;
  }
  private pieces: { text: string; haste: number; style: string; start: any; pg: any }[] = [];
  /** a long paste's thought letters are still being laid out (a part at a time) */
  drafting = false;
  private assembled: { list: { pg: any }[]; draft: any } | null = null;
  private whole: { page: unknown; key: string; draft: any } | null = null;

  /**
   * An edit to what's typed (the textarea). Returns the textarea offset to put the caret at when the writer didn't do
   * quite what the textarea did (Backspace over a written space goes on to the word before it, engine backOverSpace),
   * else null: the caret stays where the edit left it.
   */
  edit(e: Edit): number | null {
    // every key keeps the typist's time; a letter or a space typed counts towards the tempo
    if (this.typist) engine.typistKey(this.typist, performance.now(), e.kind === 'type' && !e.del && e.ins.length > 0 && e.ins.length <= 2);
    if (this.shorthand(e)) { this.lastKey = performance.now(); return null; }
    // Backspace over a space the pen has written: a space has no ink, so the press goes on to the word before
    let caret: number | null = null;
    if (e.kind === 'delete' && (!e.input || e.input === 'deleteContentBackward') && typeof engine.backOverSpace === 'function') {
      const w = engine.backOverSpace(this.sheet, this.view, e) as { edit: { at: number; del: number }; caret: number } | null;
      if (w) { e = { ...e, at: w.edit.at, del: w.edit.del }; caret = w.caret; }
    }
    const tail0 = String(this.view.tail ?? '').length, mid0 = String(this.view.mid?.text ?? '').length;
    this.planEdit(e);
    // a paste (more than COPY_FROM letters at once, at the end or above the line): copied out, within COPY_S
    const tailGrew = String(this.view.tail ?? '').length - tail0, midGrew = String(this.view.mid?.text ?? '').length - mid0;
    if (tailGrew > COPY_FROM) this.copyLeft += tailGrew;
    if (tailGrew > COPY_FROM || midGrew > COPY_FROM) this.copyUntil = Math.max(this.copyUntil, performance.now() + COPY_S * 1000);
    if (!this.view.tail) this.copyLeft = 0;
    return caret;
  }
  /** a copy-out: letters of a paste still to hand to the pen (at the end), and when it's to be done (ms) */
  private copyLeft = 0;
  private copyUntil = 0;
  private planEdit(e: Edit) {
    // Typing over a long selection that runs to the pen head (select all, then type): the planner struck it and wrote
    // the first letter above it as a substitution, but the next keys landed at the pen head, after the struck text:
    // the new words came apart. A writer strikes it and carries on where the pen is (however much of the sheet it is:
    // nothing is wiped). So it's planned as what it is, a delete, then typing at that spot.
    const tailFrom = this.text().length - String(this.view.tail ?? '').length;
    if (e.ins && e.del && !this.view.mid && e.at + e.del >= tailFrom && tailFrom - e.at > LONG_FIX) {
      this.planEdit({ ...e, ins: '' });
      // struck right up to the pen: a space first, so the new words start clear of the struck ones (as the planner
      // leaves one when it rewrites a word: "~teh~ the"). It's joined away: the text reads on, and no extra crossing-out
      const recs = (this.sheet.reader?.recs ?? []) as { id: number; ch: string; struck?: unknown }[];
      const last = recs[recs.length - 1];
      if (last?.struck && !/\s/.test(last.ch) && !this.view.pending) {
        this.inked([{ t: 'write', text: ' ' }, { t: 'mark', after: last.id, kind: 'join' }]);
      }
      this.planEdit({ ...e, del: 0 });
      return;
    }
    const r = engine.plan(this.sheet, this.view, { at: e.at, del: e.del, ins: e.ins, kind: e.kind });
    this.carry(r.events, r.view);
    this.view = r.view;
    if (r.events.length) this.inked(r.events);
    this.lastKey = performance.now();
  }
  /**
   * The pen catches up; true when anything changed. `drawing`: the letters the drawn pen (LiveSheets) still has to
   * draw (or, without it, asked of the pen in `drawn`). Given, the drawn pen is the clock: the typing is handed to it a
   * word at a time, the next only once this one is drawn (a letter to go at most), so what still shows as thought
   * letters is never ink yet and a Backspace there deletes it cleanly; and once you stop, the rest is written as fast
   * as the pen draws, not a letter every half second. (Without it, penStep paces itself at ~2 letters a second, and the
   * two clocks drifted apart.) A copy-out (a paste) is handed over a few words ahead of the pen, as fast as it copies;
   * a click or Esc on the drawn pen (pen.rush) hands over the rest at once.
   */
  step(dt: number, final = false, drawing?: number): boolean {
    // (a paste's thought letters still being laid out: a part more each time, shown on the next render)
    const more = this.drafting && !final && (this.draft(true), true);
    return this.stepPen(dt, final, drawing) || more;
  }
  private stepPen(dt: number, final: boolean, drawing?: number): boolean {
    const now = performance.now();
    const idle = now - this.lastKey;
    const v = this.view;
    const pen = this.drawn?.current ?? null;
    if (pen?.rush && !final && this.waiting) final = true;
    if (!v.tail) this.copyLeft = 0;
    // (a copy-out above the line is done by its end time; one at the end, once its letters are all handed over)
    if ((!v.mid?.text && !v.tail) || (this.copyUntil && now > this.copyUntil + 500 && !this.copyLeft)) this.copyUntil = 0;
    const copying = this.copyLeft > 0;
    const ps = pen && (drawing == null || copying) ? pen.at(now / 1000) : null;
    if (drawing == null && ps) drawing = ps.letters;
    // a centred title: the pen waits for the whole line (or a pause) to know how long it is (engine lineHeld)
    if (!final && idle < HOLD_LINE_MS && typeof engine.lineHeld === 'function' && engine.lineHeld(this.sheet, v)) return false;
    let r: { events: unknown[]; view: any };
    let handed = '';
    if (drawing != null && !final && !v.pending && !v.mid?.text && v.tail) {
      const tail = String(v.tail);
      let chunk = '';
      if (copying) {
        // copying out: keep about a second of writing on the pen (whole words), however fast it goes
        const ahead = Math.max(24, Math.ceil(((ps?.speed ?? 30) / 0.45) * 1));
        if (drawing > ahead * 0.6) return false;
        let rest = tail;
        while (rest && chunk.length < ahead) {
          const m = CHUNK.exec(rest);
          if (!m) break;
          // (the word still being typed after the paste keeps its grace)
          if (!/\s$/.test(m[0]) && m[0].length === rest.length && idle < 700) break;
          chunk += m[0];
          rest = rest.slice(m[0].length);
        }
        if (!chunk) return false;
        r = engine.penStep(this.sheet, { ...v, tail: chunk }, { idle: Infinity, forgiving: false, touch: false });
      } else {
        // a word handed over a moment ago may not have reached the drawn pen yet
        if (drawing > 1 || now - this.handedAt < 120) return false;
        const m = CHUNK.exec(tail);
        chunk = m ? m[0] : tail;
        const rest = tail.slice(chunk.length);
        // a finished word goes once two more letters are typed after it, or after 700 ms (the forgiving grace)
        const finished = !!m && (/\s$/.test(chunk) || /^\s/.test(rest));
        if (finished) {
          if (rest.length < 2 && idle < 700) return false;
          r = engine.penStep(this.sheet, { ...v, tail: chunk }, { idle: Infinity, forgiving: false, touch: false });
        } else {
          // the word being typed (or only spaces): the usual grace, and on phones the unfinished word waits for autocorrect
          r = engine.penStep(this.sheet, { ...v, tail: chunk }, { idle, forgiving: true, touch: this.touch });
        }
      }
      const left = String(r.view.tail ?? '');
      if (!left) handed = chunk;
      if (copying) this.copyLeft = Math.max(0, this.copyLeft - (chunk.length - left.length));
      r.view = { ...r.view, tail: left + tail.slice(chunk.length) };
    } else {
      // (a paste above the line, or no drawn pen: penStep paces it, within what's left of the copy-out)
      const within = this.copyUntil ? Math.max(0.3, (this.copyUntil - now) / 1000) : undefined;
      r = engine.penStep(this.sheet, v, { dt, idle, forgiving: true, touch: this.touch, final, within });
    }
    const moved = r.events.length > 0 || (r.view.tail !== this.view.tail) || !!r.view.pending !== !!this.view.pending;
    this.carry(r.events, r.view);
    this.view = r.view;
    if (r.events.length) { this.inked(r.events); this.handedAt = now; }
    // the words handed over were written where they were drafted: their pieces drop off the front
    if (!handed && r.events.length) this.pieces = [];
    if (!this.waiting) this.copyLeft = this.copyUntil = 0;
    return moved;
  }
  /** when typing was last handed to the pen */
  private handedAt = -Infinity;
  /** the letters Backspaced at the pen head while the writer considers the fix (still on the paper), by item key */
  get pendingKeys(): string[] {
    const ids = new Set<number>(this.view?.pending?.ids ?? []);
    if (!ids.size) return NO_KEYS;
    const keys = ((this.page?.items ?? []) as { id?: number; key: string; kind: string }[]).filter((it) => it.kind === 'glyph' && it.id != null && ids.has(it.id)).map((it) => it.key);
    // the same list while it's the same letters (the sheet it's handed to is memoised)
    if (keys.join('|') !== this.pendingCache.join('|')) this.pendingCache = keys;
    return this.pendingCache;
  }
  private pendingCache: string[] = NO_KEYS;
  /** letters typed and not yet handed to the pen (the thought letters at the end) */
  get trail(): number { return Array.from(String(this.view?.tail ?? '')).filter((c) => /\S/.test(c)).length; }
  /** everything typed, written now (before leaving, a fair copy, a P.S.) */
  flush() { this.step(0, true); }

  // ---------- what the caret shows ----------
  /**
   * Typing at textarea offset `at` would go above the line, with a caret: it's mid-ink (before the thought letters at
   * the end, with ink after it) and not inside an insertion already being typed (the planner's case 2e).
   */
  insertsAbove = (at: number): boolean => {
    const text = this.text();
    const tailFrom = text.length - String(this.view.tail ?? '').length;
    if (at >= tailFrom || at < 0) return false;
    const mid = this.view.mid?.text ? String(this.view.mid.text) : '';
    if (mid) {
      const { toPaper } = this.offsets();
      // the insertion being typed: its letters all map to one place on the paper (where it goes)
      let a = -1, b = -1;
      for (let i = 0; i + 1 < toPaper.length && b < 0; i++) {
        if (a < 0 && i + mid.length <= text.length && text.slice(i, i + mid.length) === mid && toPaper[i] === toPaper[i + mid.length - 1]) { a = i; b = i + mid.length; }
      }
      if (a >= 0 && at >= a && at <= b) return false;
    }
    return true;
  };
  /**
   * How hard the crossed-out word at textarea offset `at` is crossed out (1 struck … 4 inked out), or null when there's
   * none there (engine again(), asked without doing it): for the "⌫ again" note, and the ghost of the next press.
   */
  struckLevel(at: number, side?: Side): number | null {
    if (typeof engine.again !== 'function') return null;
    const r = engine.again(this.sheet, this.view, at, side ? { side } : undefined) as { events: unknown[]; level: number } | null;
    return r ? (r.events.length ? r.level - 1 : r.level) : null;
  }
  /**
   * The ghost of the next press at textarea offset `at` (engine previewAgain): the marks ⌫ there would draw, with the
   * keys they'll have (so the pen inks over the ghost), or null when there's no crossed-out word there or it's inked out.
   */
  ghostAt(at: number): { items: any[]; level: number } | null {
    if (typeof engine.previewAgain !== 'function') return null;
    const r = engine.previewAgain(this.sheet, this.view, at) as { items: any[]; level: number } | null;
    return r && r.items.length ? { items: r.items, level: r.level } : null;
  }
  private offsets() {
    const k = this.offKey;
    if (k.sheet === this.sheet && k.view === this.view && k.n === this.doc.log.length) return k.v;
    const v = inkOffsets(this.sheet, this.view);
    this.offKey = { sheet: this.sheet, view: this.view, n: this.doc.log.length, v };
    return v;
  }
  private offKey: { sheet: unknown; view: unknown; n: number; v: { toPaper: number[]; paperLen: number; midFrom: number } } = { sheet: null, view: null, n: -1, v: { toPaper: [], paperLen: 0, midFrom: -1 } };

  // ---------- what a screen reader hears ----------
  /**
   * The last change the writer made on the paper, in a few plain words, for the page's live region: "Crossed out:
   * terribly", "Crossed out harder: terribly", "Scribbled out: …", "Inked out: …", "Brought back: terribly", "Written
   * over: e as a", "Written above the line: very", "A fresh sheet: what's left is written again". null until there's
   * one. Typing itself isn't said (the keys already are). `changes` counts them, so the same words can be said twice.
   */
  lastChange(): string | null { return this.said; }
  get changes(): number { return this.saidN; }
  private said: string | null = null;
  private saidN = 0;
  private insertEnd = -1;
  private describe(events: any[], firstId: number) {
    const R = this.sheet.reader;
    const words = (from: number, to: number) => {
      let s = '';
      for (let id = from; id <= to; id++) { const r = R?.byId?.get(id); if (r) s += r.over || r.ch; }
      return s.replace(/\s+/g, ' ').trim();
    };
    const join = (list: string[]) => list.filter(Boolean).join(' ');
    const out: string[] = [];
    const by = (pick: (e: any) => boolean, label: string) => {
      const w = join(events.filter(pick).map((e) => words(e.from, e.to)));
      if (w) out.push(`${label}: ${w}`);
    };
    by((e) => e.t === 'strike' && e.why !== 'again', 'Crossed out');
    const lv = Math.max(0, ...events.filter((e) => e.t === 'strike' && e.why === 'again').map((e) => e.lv || 2));
    if (lv) by((e) => e.t === 'strike' && e.why === 'again', lv >= 4 ? 'Inked out' : lv === 3 ? 'Scribbled out' : 'Crossed out harder');
    by((e) => e.t === 'stet', 'Brought back');
    const over = events.filter((e) => e.t === 'over').map((e) => { const r = R?.byId?.get(e.at); return r ? `${r.ch} as ${e.ch}` : ''; });
    if (over.some(Boolean)) out.push(`Written over: ${over.filter(Boolean).join(', ')}`);
    // an insertion is said as it starts (its next pieces carry on the same words)
    let id = firstId;
    for (const e of events) {
      if (e.t === 'write') id += Array.from(String(e.text ?? '')).length;
      else if (e.t === 'break') id++;
      else if (e.t === 'insert') {
        const n = Array.from(String(e.text ?? '')).length;
        if (e.after !== this.insertEnd) { const w = String(e.text ?? '').trim(); if (w) out.push(`Written above the line: ${w}`); }
        id += n;
        this.insertEnd = id - 1;
      }
    }
    if (events.some((e) => e.t === 'sheet' && e.why === 'fresh')) out.push('A fresh sheet: what’s left is written again');
    if (out.length) { this.said = out.join('. '); this.saidN++; }
  }

  /**
   * Pen-only formatting on what's written, by hand: an underline drawn under the letters (again for a double), or the
   * letters gone over again (pressed harder). `from`/`to` are textarea offsets; everything typed is written first.
   */
  format(kind: 'underline' | 'press', from: number, to: number): boolean {
    this.flush();
    if (typeof engine.inkIdsIn === 'function') {
      const runs = engine.inkIdsIn(this.sheet, this.view, from, to) as [number, number][];
      if (!runs.length) return false;
      this.inked(runs.map(([a, b]) => (kind === 'underline' ? { t: 'underline', from: a, to: b } : { t: 'pen', kind: 'retrace', from: a, to: b })));
      return true;
    }
    const ids: number[] = [];
    const chars: string[] = [];
    for (const r of this.sheet.reader?.recs ?? []) {
      if (r.struck || r.joined) continue;
      const c = String(r.over || r.ch);
      for (let j = 0; j < c.length; j++) { ids.push(r.id); chars.push(c[j]); }
    }
    let a = Math.max(0, from), b = Math.min(ids.length, to);
    while (a < b && /\s/.test(chars[a])) a++;
    while (b > a && /\s/.test(chars[b - 1])) b--;
    if (b <= a) return false;
    // one event per run of consecutive ids (an insertion above the line, or a P.S., has ids of its own)
    const sorted = [...new Set(ids.slice(a, b))].sort((x, y) => x - y);
    const events: unknown[] = [];
    let s = sorted[0], e = s;
    const push = () => events.push(kind === 'underline' ? { t: 'underline', from: s, to: e } : { t: 'pen', kind: 'retrace', from: s, to: e });
    for (const id of sorted.slice(1)) { if (id === e + 1) e = id; else { push(); s = e = id; } }
    push();
    this.inked(events);
    return true;
  }
  fairCopy() { this.flush(); this.inked(engine.fairCopy(this.sheet)); }
  postScript() { this.flush(); this.inked(engine.postScript(this.sheet)); }
  freshSheet() { this.flush(); this.inked([{ t: 'sheet', why: 'fresh' }]); }
  /**
   * Backspace or Delete at a struck word (the caret at `at` sits where it was): the writer goes over it again,
   * harder: a heavier strike, a scribble, then inked out (engine again()). null: no struck word there, or the
   * engine can't. `level` is the word's level now; `max` when it was already inked out and nothing was drawn.
   */
  again(at: number, side?: Side): { level: number; max: boolean } | null {
    if (typeof engine.again !== 'function') return null;
    const r = engine.again(this.sheet, this.view, at, side ? { side } : undefined);
    if (!r) return null;
    this.view = r.view;
    if (r.events.length) this.inked(r.events);
    this.lastKey = performance.now();
    return { level: r.level, max: !r.events.length };
  }
  /**
   * When event `ev` is dry (ms, performance.now()): the pen's wet window after the drawn pen lifted off its last stroke
   * (Infinity while it's still being written); with no drawn pen, or nothing of it drawn, after it went down.
   */
  dryAt(ev: number): number {
    const pen = this.drawn?.current;
    const lift = eventLift(this.page, ev, pen?.liftedAt ? (k) => pen.liftedAt!(k) : undefined);
    if (lift === null) return Infinity;
    return (lift === undefined ? this.inkedAt[ev] ?? -Infinity : lift) + this.wetMs;
  }
  /** the newest event is still wet (each event dries on its own, its pen's window after the pen lifts off it) */
  get wet(): boolean {
    const n = this.doc.log.length;
    return n > 0 && performance.now() <= this.dryAt(n - 1);
  }
  /** Undo lifts only wet ink: the newest event, while it's wet. false: the ink is dry (a crossing-out: stet()). */
  undo(): boolean {
    if (this.view.tail || !this.wet) return false;
    this.sheet = engine.dropLast(this.sheet);
    this.inkedAt.length = this.doc.log.length;
    return true;
  }
  /** Undo an underline or letters gone over again, while wet: they change no words, so they're a step of their own. */
  liftFormat(): boolean {
    if (this.waiting || !this.wet) return false;
    const last = this.doc.log[this.doc.log.length - 1] as { t?: string; kind?: string };
    if (!(last?.t === 'underline' || (last?.t === 'pen' && last.kind === 'retrace'))) return false;
    // (one command makes one event per run of letters, all put down at once: lifted together)
    const at = this.inkedAt[this.doc.log.length - 1];
    let n = 0;
    while (n < 64 && this.doc.log.length && this.inkedAt[this.doc.log.length - 1] === at) {
      const e = this.doc.log[this.doc.log.length - 1] as { t?: string; kind?: string };
      if (!(e?.t === last.t && e.kind === last.kind)) break;
      this.sheet = engine.dropLast(this.sheet);
      this.inkedAt.length = this.doc.log.length;
      n++;
    }
    return n > 0;
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
  /**
   * The view is about to become `next` (its events not applied yet): each write takes the tempo its first new word was
   * typed at (write.haste), and the tempo of what's still unwritten follows the tail (engine hasteCarry).
   */
  private carry(events: unknown[], next: any) {
    this.formatCarry(events, next);
    if (!this.typist || typeof engine.hasteCarry !== 'function') return;
    this.tailHaste = engine.hasteCarry(this.sheet, events, this.view?.tail, this.tailHaste, next?.tail, engine.typistHaste(this.typist));
  }
  /** the tempo the next word to be written was typed at */
  private nextHaste(): number {
    return this.typist && typeof engine.hasteNext === 'function' ? engine.hasteNext(this.sheet, this.view.tail, this.tailHaste) : 0;
  }
  /**
   * Undo on dry ink, for a crossing-out (issue #5). Dry ink can't be lifted, so the writer lets the word stand, as
   * editors always have: a row of dots under it, *stet* ("let it stand") in the margin, and it counts in the letter
   * again (engine stet()). `at`: the textarea offset where the struck word sits (where the caret was left when it was
   * crossed out). Only the newest crossing-out there comes back, every strike of that step (they went down together)
   * and every pass of crossing it out harder. false, with nothing changed: no struck word there, or something was
   * done to the letter since that Undo would have to take back first and can't (an underline, words gone over, another
   * word crossed out harder, a P.S., a fresh sheet).
   */
  stet(at: number): boolean {
    if (typeof engine.stet !== 'function' || this.view.pending || this.view.mid?.text) return false;
    const T = this.inkedAt;
    // one step's strikes went down at the same moment; for ink from before this session, the engine's own reading
    const same = (ev: number, newest: number) => (Number.isFinite(T[newest]) ? T[ev] === T[newest] : null);
    const r = engine.stet(this.sheet, this.view, at, same) as { events: unknown[]; view: any; strikes: number[]; ids: number[] } | null;
    if (!r || !r.events.length) return false;
    const ids = new Set(r.ids);
    const log = this.doc.log as { t?: string; why?: string; from?: number; to?: number }[];
    for (let i = Math.min(...r.strikes) + 1; i < log.length; i++) {
      const x = log[i];
      if (x.t === 'underline' || x.t === 'pen' || x.t === 'move' || x.t === 'sheet') return false;
      if (x.t === 'strike' && x.why === 'again') {
        let ours = false;
        for (let id = x.from ?? 0; id <= (x.to ?? -1) && !ours; id++) ours = ids.has(id);
        if (!ours) return false;
      }
    }
    this.view = r.view;
    this.inked(r.events);
    this.lastKey = performance.now();
    return true;
  }
  /**
   * Undo on dry ink with no step to go by (the sheet was reopened, so there's no history): the newest crossing-out is
   * let stand when it's the last thing on the paper (passes crossing it out harder included). false otherwise.
   */
  stetLast(): boolean {
    if (this.waiting) return false;
    const log = this.doc.log as { t?: string; why?: string; from?: number }[];
    let i = log.length - 1;
    while (i >= 0 && log[i].t === 'strike' && log[i].why === 'again') i--;
    const x = log[i];
    if (!x || x.t !== 'strike' || x.from == null) return false;
    // the textarea offset of the gap the struck word sits in: the letters still standing before it
    let at = 0;
    for (const r of (this.sheet.reader?.recs ?? []) as { id: number; ch: string; over?: string; struck?: unknown; joined?: boolean }[]) {
      if (r.id === x.from) return this.stet(at);
      if (!r.struck && !r.joined) at += String(r.over || r.ch).length;
    }
    return false;
  }

  // ---------- formatting by hand (engine format.js) ----------
  /** the style what's typed next is written in */
  private typing: InkStyle = PLAIN;
  private typingStyle(): InkStyle | undefined { return this.typing === PLAIN ? undefined : this.typing; }
  /**
   * The style for what's typed next: leaning in (lean, ⌘I), pressed harder (weight, ⌘B with no selection), bigger or
   * smaller (size). Instant: what's typed so far is written first, in the style it was typed in, and every word after
   * this is written in the new one (each write carries it, so the log keeps it). Returns the style now.
   */
  setStyle(s: Partial<InkStyle>): InkStyle {
    const next = { lean: s.lean ?? this.typing.lean, weight: s.weight ?? this.typing.weight, size: s.size ?? this.typing.size };
    const n = (typeof engine.styleOf === 'function' ? engine.styleOf(next) : null) as InkStyle | null;
    const norm = n ?? PLAIN;
    if (norm.lean === this.typing.lean && norm.weight === this.typing.weight && norm.size === this.typing.size) return this.typing;
    this.flush();
    this.typing = norm === PLAIN ? PLAIN : { ...norm };
    return this.typing;
  }
  /**
   * What the toolbar shows at the caret (a textarea offset; the end by default): the style of the words there, or, at
   * the end or in what the pen hasn't written yet, of what's typed next; and the line's format.
   */
  style(at?: number): InkFormat {
    const cur = this.text();
    const o = Math.max(0, Math.min(cur.length, at ?? cur.length));
    const tailFrom = cur.length - String(this.view.tail ?? '').length;
    let st: InkStyle = this.typing;
    const items = (this.page?.items ?? []) as { id?: number; kind: string; line: number; style?: Partial<InkStyle> }[];
    const itemAt = (k: number) => {
      if (typeof engine.inkIdsIn !== 'function' || k < 0) return null;
      const runs = engine.inkIdsIn(this.sheet, this.view, k, k + 1) as [number, number][];
      const id = runs.length ? runs[0][0] : null;
      return id == null ? null : items.find((it) => it.id === id && it.kind === 'glyph') ?? null;
    };
    const near = o < tailFrom ? itemAt(o > 0 && /\S/.test(cur[o - 1] ?? '') ? o - 1 : o) : null;
    if (near) st = { lean: near.style?.lean ?? 0, weight: near.style?.weight ?? 0, size: near.style?.size ?? 1 };
    const line = this.lineAt(cur, o);
    let role: InkRole = 'body', list: InkList | null = null;
    if (line.last && typeof engine.lineNow === 'function') {
      const L = engine.lineNow(this.sheet) as { as: string; list: InkList | null };
      // a line the pen hasn't begun yet (its Return is still unwritten) is body, or the list's next item
      const as = line.start > tailFrom ? (L.list ?? 'body') : L.as;
      if (as === 'title' || as === 'heading') role = as; else if (as !== 'body') list = as as InkList;
    } else {
      const it = itemAt(line.start < tailFrom ? line.start : -1);
      const info = it ? ((this.page?.lineInfo ?? []) as { n: number; fmt?: string; list?: string; role?: string }[]).find((l) => l.n === it.line) : null;
      if (info?.fmt === 'title' || info?.fmt === 'heading') role = info.fmt;
      else if (info?.list) list = info.list as InkList;
    }
    return { ...st, role, list, canFormatLine: this.canFormat(cur, line) };
  }
  /**
   * Title, Heading or Body for the line at the caret (a textarea offset; the end by default). Instant on a line with no
   * ink on it yet (empty, or only typed): what's typed before it is written first, then the line is set out the
   * writer's own way, and what's typed on it is written that way. A title the writer underlines is underlined when
   * Return ends it; a centred one waits for the whole line. false, with nothing changed: the line is already in ink.
   */
  setRole(role: InkRole, at?: number): boolean { return this.formatLine(role === 'title' || role === 'heading' ? role : 'body', at); }
  /**
   * A list for the line at the caret, and the lines after it (Return goes on to the next item; Return on an empty item
   * ends the list): bullets, numbers or a checklist, each the writer's own. null: no list (body). Numbers never
   * renumber: they're ink. false, with nothing changed: the line is already in ink.
   */
  setList(kind: InkList | null, at?: number): boolean { return this.formatLine(kind ?? 'body', at); }
  /**
   * The checklist's boxes on the current sheet: each item's line (its paragraph in the text), ticked or not, and where
   * its box is (for a click on it). Unticked in ink, a box is scribbled out and a fresh one drawn beside it: `box` is the
   * one in use.
   */
  checks(): InkCheck[] {
    const boxes = (this.page?.boxes ?? []) as { at: number; box: [number, number, number, number]; checked: boolean }[];
    if (!boxes.length) return [];
    const sheetU = Number((this.opts as { sheet?: { height?: number } }).sheet?.height) || 0;
    // each item's paragraph: the line breaks before its first letter in the text as it reads
    const para = new Map<number, number>();
    let n = 0;
    for (const r of (this.sheet.reader?.recs ?? []) as { id: number; ch: string; over?: string; struck?: unknown; joined?: boolean }[]) {
      para.set(r.id, n);
      if (!r.struck && !r.joined && (r.over || r.ch) === '\n') n++;
    }
    return boxes.map((b) => {
      const sheet = sheetU > 0 ? Math.max(0, Math.floor(((b.box[1] + b.box[3]) / 2) / sheetU)) : 0;
      const box: InkCheck['box'] = [b.box[0], b.box[1] - sheet * sheetU, b.box[2], b.box[3] - sheet * sheetU];
      return { line: para.get(b.at) ?? -1, at: b.at, checked: b.checked, sheet, box };
    }).filter((c) => c.line >= 0);
  }
  /**
   * Tick a checklist item, or untick it (`line`: its paragraph in the text, as checks() gives it, or the caret's line).
   * The pen goes back to the box and ticks it the writer's way; unticking in ink scribbles the tick out. Wet, it lifts
   * with Undo (liftMark). false: no box on that line.
   */
  toggleCheck(line: number): boolean {
    let b = this.checks().find((c) => c.line === line);
    // an item still in thought letters has no box yet: what's typed is written first (its box with it)
    if (!b && this.waiting) { this.flush(); b = this.checks().find((c) => c.line === line); }
    if (!b) return false;
    this.inked([{ t: 'check', at: b.at }]);
    return true;
  }
  /**
   * The highlighter over textarea offsets [from, to): a felt swipe under the words, line by line, in fluorescent ink.
   * It's kept beside the ink (page.highlights), and drawn under it: inkHighlights() for the live page, renderSVG for
   * exports. Everything typed is written first. false: no ink there.
   */
  highlight(from: number, to: number, color: InkHighlight = 'yellow'): boolean {
    this.flush();
    if (typeof engine.inkIdsIn !== 'function') return false;
    const runs = engine.inkIdsIn(this.sheet, this.view, from, to) as [number, number][];
    if (!runs.length) return false;
    this.inked(runs.map(([a, b]) => ({ t: 'highlight', from: a, to: b, color })));
    return true;
  }
  /** Undo a tick, an untick or a highlight while it's wet (a command's events go together). false: none, or dry. */
  liftMark(): boolean {
    if (this.waiting || !this.wet) return false;
    const log = this.doc.log as { t?: string }[];
    const kind = log[log.length - 1]?.t;
    if (kind !== 'check' && kind !== 'highlight') return false;
    const at = this.inkedAt[log.length - 1];
    let n = 0;
    while (n < 64 && log.length && this.inkedAt[log.length - 1] === at && log[log.length - 1]?.t === kind) {
      this.sheet = engine.dropLast(this.sheet);
      this.inkedAt.length = this.doc.log.length;
      n++;
    }
    return n > 0;
  }
  /** the text's line around offset o: where it starts and ends, and whether it's the last */
  private lineAt(cur: string, o: number) {
    const start = cur.lastIndexOf('\n', o - 1) + 1;
    const nl = cur.indexOf('\n', o);
    return { start, end: nl < 0 ? cur.length : nl, last: nl < 0 };
  }
  /** whether a line can be set out in a format now: the last line, nothing on it ink yet, not the P.S. */
  private canFormat(cur: string, line: { start: number; last: boolean }): boolean {
    if (typeof engine.lineNow !== 'function' || !line.last || this.view.mid?.text || this.view.pending) return false;
    const tailFrom = cur.length - String(this.view.tail ?? '').length;
    if (line.start < tailFrom) return false;
    const L = engine.lineNow(this.sheet) as { format: boolean; ps: boolean };
    return !L.ps && (line.start > tailFrom || L.format);
  }
  /** the line at `at` set out as `as` (a `line` event), the pen first catching up to where it starts */
  private formatLine(as: string, at?: number): boolean {
    const cur = this.text();
    const line = this.lineAt(cur, Math.max(0, Math.min(cur.length, at ?? cur.length)));
    if (!this.canFormat(cur, line)) return false;
    const tailFrom = cur.length - String(this.view.tail ?? '').length;
    if (line.start > tailFrom) this.writeUpTo(line.start - tailFrom);
    const L = engine.lineNow(this.sheet) as { as: string; format: boolean };
    if (!L.format) return false;
    if (L.as !== as) this.inked([{ t: 'line', as }]);
    this.lastKey = performance.now();
    return true;
  }
  /** the pen writes the first n units of what's typed now (up to a line's start), the rest still waits */
  private writeUpTo(n: number) {
    const tail = String(this.view.tail ?? '');
    const r = engine.penStep(this.sheet, { ...this.view, tail: tail.slice(0, n) }, { final: true });
    r.view = { ...r.view, tail: String(r.view.tail ?? '') + tail.slice(n) };
    this.carry(r.events, r.view);
    this.view = r.view;
    if (r.events.length) this.inked(r.events);
  }
  /**
   * Shorthand at the start of a line, as in Notes: `# ` a title, `## ` a heading, `- ` or `* ` bullets, `[] ` or `[ ] ` a
   * checklist, `1. ` numbers. Only on a line nothing is inked on yet: the shorthand is never written, the line is set out.
   * And Return on an empty list item ends the list there (the line becomes body; the Return isn't typed). true: taken.
   */
  private shorthand(e: Edit): boolean {
    if (e.del || e.kind !== 'type' || typeof engine.lineNow !== 'function') return false;
    const cur = this.text();
    if (e.at !== cur.length) return false;
    if (e.ins === '\n') {
      if (!cur.endsWith('\n')) return false;
      const L = engine.lineNow(this.sheet) as { list: string | null };
      return !!L.list && this.formatLine('body');
    }
    if (e.ins !== ' ') return false;
    const line = this.lineAt(cur, cur.length);
    const head = cur.slice(line.start);
    const as = head === '#' ? 'title' : head === '##' ? 'heading' : head === '-' || head === '*' ? 'bullet'
      : /^\[ ?\]$/.test(head) ? 'check' : /^1[.)]$/.test(head) ? 'number' : null;
    if (!as || !this.canFormat(cur, line)) return false;
    this.planEdit({ ...e, at: line.start, del: head.length, ins: '', kind: 'delete' });
    return this.formatLine(as) || true;
  }
  /** the writes about to go down carry the typing's style; a centred line's first piece, the rest of its line */
  private formatCarry(events: unknown[], next: any) {
    if (typeof engine.styleCarry === 'function' && this.typing !== PLAIN) engine.styleCarry(this.sheet, events, this.typing);
    if (typeof engine.lineCarry === 'function') engine.lineCarry(this.sheet, events, next?.tail);
  }
  private inked(events: unknown[]) {
    if (!events.length) return;
    const first = (this.sheet.reader?.nextId as number | undefined) ?? 0;
    engine.apply(this.sheet, events);
    this.lastInk = performance.now();
    for (let i = this.inkedAt.length; i < this.doc.log.length; i++) this.inkedAt.push(this.lastInk);
    this.describe(events as any[], first);
  }
}

/**
 * The ghost of the next press (ideas-feel.md, idea 8), behind a flag that's off by default: `?ghost` in the address.
 * When the caret rests beside a crossed-out word, the mark the next ⌫ would make shows faintly over it.
 */
export const GHOST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('ghost');
/** fainter than a thought letter: what would be, fainter than what's typed */
export const GHOST_OPACITY = 0.14;

/** The ghost's marks (InkSession.ghostAt) as outlines, by sheet (sheet px). */
export function inkGhost(live: Live, items: any[]): string[] {
  const sc = live.emPx / UPM;
  const n = live.sheets.length;
  const sheetU = live.paper.h * live.unitsPerMm;
  const out = Array.from({ length: n }, () => '');
  for (const it of items) {
    const cs = itemContours(it);
    if (cs.length) out[sheetAtY(it.y ?? 0, sheetU, n)] += `<path d="${E.contoursToD(cs, 0, 0, sc)}"/>`;
  }
  return out;
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
export function inkOffsets(sheet: any, view: any): { toPaper: number[]; paperLen: number; midFrom: number } {
  const recs = (sheet.reader?.recs ?? []) as { id: number; ch: string; over?: string; struck?: unknown; joined?: boolean }[];
  const pending = new Set<number>(view?.pending?.ids ?? []);
  const mid = view?.mid?.text ? (view.mid as { after: number; text: string }) : null;
  const tail = String(view?.tail ?? '');
  const toPaper: number[] = [];
  let g = 0, midDone = false, midFrom = -1;
  const putMid = () => { if (mid && !midDone) { midFrom = toPaper.length; for (let j = 0; j < mid.text.length; j++) toPaper.push(g); midDone = true; } };
  if (mid && mid.after < 0) putMid();
  for (const r of recs) {
    if (!r.struck && !r.joined) {
      const c = r.over || r.ch;
      if (!pending.has(r.id)) for (let j = 0; j < c.length; j++) toPaper.push(g + j);
      g += c.length;
    }
    if (mid && mid.after === r.id) putMid();
  }
  putMid(); // its anchor isn't in this sheet's text: where it was typed (the end)
  for (let j = 0; j < tail.length; j++) toPaper.push(g + j);
  // the end: after the thought letters. With a fix pending (letters Backspaced at the pen head, still on the paper while
  // the writer considers it), still after them: that's where the pen carries on once it has struck them, so the caret
  // never jumps forward over the word when the strike lands (and never back over a blot as the next press begins)
  toPaper.push(g + tail.length);
  return { toPaper, paperLen: g + tail.length, midFrom };
}

/**
 * The caret over an ink sheet: the written letter and the thought letters the pen hasn't reached (draftPage) as one
 * geometry, so every offset of what's typed has a caret, both sides of every wrap, and Home, End, selection and
 * hit-testing work across both alike. Its offsets are the textarea's (inkOffsets maps them onto the paper).
 */
export function inkGeometry(live: Live, p: Hand, ink: InkSession): Geometry {
  const draft = ink.draft();
  const written = String(live.page.text ?? '').length;
  const geo = draft?.stops?.length ? engine.geometry(p, [live.page, engine.offsetStops(draft, written - (draft.from || 0))]) : live.geo;
  const viewText = ink.text();
  const { toPaper, paperLen, midFrom } = inkOffsets(ink.sheet, ink.view);
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
  // an insertion above the line: its stops sit on the line's own number, so the engine puts the caret on that line's
  // baseline at the insertion's x (inside the next word). The caret goes where the insertion is written, up there
  const stopsAt = new Map<number, { x: number; y: number; aff?: string }[]>();
  for (const s of (live.page.stops ?? []) as { o: number; x: number; y: number; aff?: string }[]) {
    if (!stopsAt.has(s.o)) stopsAt.set(s.o, []);
    stopsAt.get(s.o)!.push(s);
  }
  const lift = 0.3 * (g.ascU || 600);
  // the insertion being typed mid-text: its thought letters are drawn where it will be written, above the line
  // (InkSession.insertDraft), and the caret inside it or at its end goes there with them
  const ins = draft?.ins as { stops: { o: number; x: number; y: number; aff?: string }[] } | undefined;
  const midLen = String(ink.view?.mid?.text ?? '').length;
  const sheetU = live.paper.h * live.unitsPerMm;
  const caretInInsert = (o: number, side?: Side): CaretPos | null => {
    if (!ins || midFrom < 0 || !(o > midFrom && o <= midFrom + midLen)) return null;
    const at = ins.stops.filter((x) => x.o === o - midFrom);
    const s = at.find((x) => (x.aff ?? '') === (side === 'before' ? 'before' : '')) ?? at[at.length - 1];
    const c = s ? g.caret(toP(o), side) : null;
    if (!s || !c) return null;
    const sheet = Math.min(live.sheets.length - 1, Math.max(0, Math.floor(s.y / sheetU)));
    const y = s.y - (live.sheets[sheet]?.shiftU ?? 0);
    // (the caret's lean and height as on the line below)
    return { ...c, sheet, x: s.x, y, top: c.top ? [s.x + (c.top[0] - c.x), y - (c.y - c.top[1])] : undefined };
  };
  const caret = (o: number, side?: Side) => {
    const up = caretInInsert(o, side);
    if (up) return up;
    const po = toP(o);
    const c = g.caret(po, side);
    const list = stopsAt.get(po);
    if (!c || !list) return c;
    const s = list.filter((x) => (x.aff ?? '') === (side === 'before' ? 'before' : '')).pop() ?? list[list.length - 1];
    const shift = live.sheets[c.sheet]?.shiftU ?? 0;
    const dy = s.y - shift - c.y;
    if (!(dy < -lift) || Math.abs(s.x - c.x) > 1) return c;
    return { ...c, y: c.y + dy, top: c.top ? [c.top[0], c.top[1] + dy] as [number, number] : undefined };
  };
  return {
    ...g,
    text: viewText,
    caret,
    hit: (sheet, x, y) => fromP(g.hit(sheet, x, y)),
    vertical: (o, dir, goalX, side) => { const v = g.vertical(toP(o), dir, goalX, side); return { o: fromP(v.o), goalX: v.goalX }; },
    edges: (o, side) => { const e = g.edges(toP(o), side); return { start: fromP(e.start), end: fromP(e.end, 'right') }; },
    ribbons: (from, to) => g.ribbons(toP(from), toP(to)),
  };
}

/**
 * One undo step in ink: typing the pen hasn't reached is taken back freely; anything on the paper (or a fix still in
 * hand at the pen head) is written down now, then its wet ink is lifted until the letter reads as it did before the
 * step. With `stet` (on /write for now), a dry crossing-out (the step took letters away) is let stand instead: dots,
 * *stet* in the margin, and the word back in the letter (InkSession.stet). false: that ink is dry (nothing on the
 * paper is lifted), and it isn't a crossing-out that can be let stand.
 */
export function undoInk(ink: InkSession, e: Edit, o: { stet?: boolean } = {}): boolean {
  const cur = ink.text();
  const want = cur.slice(0, e.at) + e.ins + cur.slice(e.at + e.del);
  const tailFrom = cur.length - String(ink.view?.tail ?? '').length;
  // (letters put back where the pen hovers over a fix are the fix itself, not unwritten typing)
  if (ink.waiting && (e.at > tailFrom || (e.at === tailFrom && !(ink.view?.pending && e.ins)))) {
    ink.edit({ ...e, kind: e.ins ? 'type' : 'delete' });
    return true;
  }
  ink.flush();
  if (ink.liftTo(want)) return true;
  return !!o.stet && !!e.ins && !e.del && ink.stet(e.at);
}
