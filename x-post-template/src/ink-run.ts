// ink-run.ts: typing that behaves like ink, on a clock: the site's own Ink mode (engine/sheet.js: plan, penStep,
// apply, dropLast, again; the same calls as app/src/lib/ink.ts InkSession) stepped every 10 ms, and recorded for
// the video: every keystroke, every state of the ink log (event ids, so an undo that lifts events is replayed
// right), the time each event went down, and the pen's view (what's typed but not yet written) at every frame.
//
// One clock for everything that types: scripts/ink-session.ts (a scripted session), the recorder page
// (recorder/main.ts: someone typing, live) and scripts/take.ts (a recorded take, replayed). Acts applied at the same
// times give the same page, so what the recorder showed is what the video replays.
import * as E from '@engine';
import { inkOpts } from '@/lib/ink';
import { getPaper } from '@/lib/papers';
import { HAND, PAPER, MEASURE, SALT, PEN_SPEED } from './setup';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;
export const FPS = 30;
/** the clock's step, s */
export const DT = 0.01;

/**
 * Something the writer does, at t (s):
 * - a key: one character, 'Enter', 'Backspace', 'Meta+z' (undo), 'Meta+u' / 'Meta+b' (underline, go over the
 *   selection), 'Meta+Enter' (a P.S.)
 * - 'click': the caret put somewhere: `at` is 'end', a text index, or 'before:word' / 'at:word' (scripts)
 * - 'caret': the caret moved by the keyboard (arrows): `at` a text index
 * - 'select': a selection from `at` to `to` (text indexes, or the first and last words, in scripts)
 * - 'Again': Backspace at a crossed-out word: crossed out again, harder (`at`: the caret)
 * - 'BackspaceHold': Backspace held at a crossed-out word, `hold` passes (scripts)
 * - 'note': a hint for the video's bar (scripts)
 */
export type Act = { t: number; key: string; at?: 'end' | number | string; note?: string; to?: string | number; hold?: number; look?: string };

export const makePen = () => engine.withOverrides(engine.makeHand(HAND.seed, { style: HAND.style }, { neatOnly: true }), { ...HAND.params, pen: HAND.pen, tip: HAND.tip, ink: HAND.ink });
export function makePaper() {
  const paper = getPaper(PAPER);
  return { ...paper, text: { ...paper.text, right: paper.text.left + (paper.text.right - paper.text.left) * MEASURE } };
}

export class InkRun {
  readonly p = makePen();
  readonly paper = makePaper();
  readonly io = inkOpts(this.p, this.paper as any, 1, 1);
  readonly salt: string;
  sheet: any;
  view: any;
  /** every event ever applied, by id, and when */
  readonly events: any[] = [];
  readonly evTime: number[] = [];
  /** the log as event ids */
  ids: number[] = [];
  lastKey = -10;
  lastInk = -10;
  /** a mid-text insertion point (textarea index), or null at the end */
  cursor: number | null = null;
  selection: { from: number; to: number } | null = null;
  readonly states: { t: number; ids: number[] }[] = [{ t: 0, ids: [] }];
  readonly toasts: { t: number; title: string; body: string }[] = [];
  readonly lifts: { t: number; n: number }[] = [];
  readonly notes: { t: number; note: string }[] = [];
  readonly clicks: { t: number; index: number; kind?: string; look?: string }[] = [];
  readonly selections: { t: number; from: number; to: number; until: number; words?: string[] }[] = [];
  readonly keys: { t: number; key: string }[] = [];
  readonly frames: any[] = [];
  private pendingAgain: { t: number; at: number }[] = [];
  /** the next step's time (accumulated as t += DT, as the clock always has), and the next frame */
  private t = 0;
  private f = 0;

  constructor(salt: string = SALT) {
    this.salt = salt;
    const doc = engine.newInkDoc({ seed: HAND.seed, style: HAND.style, salt });
    this.sheet = engine.replay(this.p, doc, this.io.layout);
    this.view = engine.newView();
  }

  /** what the textarea holds: the letter as it reads, plus what the pen hasn't written yet */
  text(): string { return engine.viewText(this.sheet, this.view); }
  /** the time of the last step run */
  get now() { return this.t - DT; }

  private applyEvents(t: number, evs: any[]) {
    if (!evs.length) return;
    engine.apply(this.sheet, evs);
    for (const e of evs) { this.ids = this.ids.concat(this.events.length); this.events.push(e); this.evTime.push(t); }
    this.states.push({ t, ids: this.ids });
    this.lastInk = t;
  }
  private edit(t: number, e: { at: number; del: number; ins: string; kind: string }) {
    const r = engine.plan(this.sheet, this.view, e);
    this.view = r.view;
    this.applyEvents(t, r.events);
    this.lastKey = t;
  }
  private flush(t: number) {
    const r = engine.penStep(this.sheet, this.view, { final: true });
    this.view = r.view;
    this.applyEvents(t, r.events);
  }

  /** do one thing, now (run the clock up to its time first: `runTo(a.t)`) */
  act(a: Act) {
    const t = a.t;
    if (a.key === 'note') { this.notes.push({ t, note: a.note! }); return; }
    this.keys.push({ t, key: a.key });
    const text = this.text();
    if (a.key === 'click' || a.key === 'caret') {
      this.selection = null;
      if (a.at === 'end') this.cursor = null;
      else if (typeof a.at === 'number') this.cursor = a.at >= text.length ? null : Math.max(0, a.at);
      else if (typeof a.at === 'string') { const word = a.at.split(':')[1]; this.cursor = text.indexOf(word); }
      if (a.key === 'click') {
        const kind = typeof a.at === 'string' && a.at !== 'end' ? a.at.split(':')[0] : typeof a.at === 'number' ? 'index' : 'end';
        this.clicks.push({ t, index: this.cursor ?? text.length, kind, look: a.look ?? (typeof a.at === 'string' ? a.at.split(':')[1] : undefined) });
      }
      return;
    }
    if (a.key === 'select') {
      // a drag from the first word's start to the second word's end (scripts), or between two indexes
      if (typeof a.at === 'number' && typeof a.to === 'number') {
        const from = Math.max(0, Math.min(a.at, a.to)), to = Math.min(text.length, Math.max(a.at, a.to));
        this.selection = { from, to };
        this.selections.push({ t, from, to, until: Infinity });
        return;
      }
      const from = text.indexOf(a.at as string), to = text.indexOf(a.to as string, from) + (a.to as string).length;
      this.selection = { from, to };
      this.selections.push({ t, from, to, until: Infinity, words: [a.at as string, a.to as string] });
      return;
    }
    if (a.key === 'Again') {
      // the writing page: Backspace at a crossed-out word goes over it again, harder each time
      const r = engine.again(this.sheet, this.view, typeof a.at === 'number' ? a.at : this.cursor ?? text.length);
      if (r && r.events.length) { this.view = r.view; this.applyEvents(t, r.events); }
      this.lastKey = t;
      return;
    }
    if (a.key === 'BackspaceHold') {
      // Delete held on a crossed-out word: a pass every 280 ms, harder each time
      for (let n = 0; n < (a.hold || 1); n++) this.pendingAgain.push({ t: t + n * 0.28, at: this.cursor ?? text.length });
      return;
    }
    if (a.key === 'Meta+u' || a.key === 'Meta+b') {
      // InkSession.mark: everything typed written first, then the mark on the selected words
      this.flush(t);
      if (this.selection) {
        const runs = engine.inkIdsIn(this.sheet, this.view, this.selection.from, this.selection.to) as [number, number][];
        this.applyEvents(t, runs.map(([x0, x1]) => (a.key === 'Meta+u' ? { t: 'underline', from: x0, to: x1 } : { t: 'pen', kind: 'retrace', from: x0, to: x1 })));
        const sel = this.selections[this.selections.length - 1]; if (sel) sel.until = t + 0.25;
        this.selection = null;
      }
      this.lastKey = t;
      return;
    }
    if (a.key === 'Meta+Enter') {
      // InkSession.postScript: what's typed written, then the pen moves below for a P.S.
      this.flush(t);
      this.applyEvents(t, engine.postScript(this.sheet));
      this.cursor = null;
      this.lastKey = t;
      return;
    }
    if (a.key === 'Meta+z') {
      // the site's undo (InkSession.undo): only the newest ink, within 3 s; typing the pen hasn't reached first
      const wet = t - this.lastInk <= 3 && !this.view.tail;
      if (!wet) { this.toasts.push({ t, title: 'The ink is dry', body: 'Cross it out instead.' }); return; }
      // lift the last word (and the line it started), as the app's undo history asks
      const want = text.replace(/[^\s]+\s*$/, '');
      let n = 0;
      while (this.text().length > want.length && this.sheet.doc.log.length) {
        this.sheet = engine.dropLast(this.sheet); this.ids = this.ids.slice(0, -1); n++;
      }
      this.states.push({ t, ids: this.ids });
      this.lifts.push({ t, n });
      if (this.cursor != null && this.cursor > this.text().length) this.cursor = null;
      return;
    }
    if (this.selection && (a.key.length === 1 || a.key === 'Backspace')) {
      // select + type: the planner strikes the selection and writes the new word above it, smaller; select +
      // Backspace: struck
      const sel = this.selections[this.selections.length - 1]; if (sel) sel.until = t;
      const ins = a.key === 'Backspace' ? '' : a.key;
      const { from, to } = this.selection;
      this.edit(t, { at: from, del: to - from, ins, kind: ins ? 'type' : 'delete' });
      this.cursor = from + ins.length >= this.text().length ? null : from + ins.length;
      this.selection = null;
      return;
    }
    const at = this.cursor ?? text.length;
    if (a.key === 'Backspace') {
      if (at <= 0) return;
      this.edit(t, { at: at - 1, del: 1, ins: '', kind: 'delete' });
      if (this.cursor != null) this.cursor--;
      return;
    }
    if (a.key !== 'Enter' && a.key.length !== 1) return; // a key the ink doesn't take
    const ins = a.key === 'Enter' ? '\n' : a.key;
    this.edit(t, { at, del: 0, ins, kind: 'type' });
    if (this.cursor != null) this.cursor += ins.length;
  }

  /** one step of the clock at t: Delete passes due, then the pen writes on; a frame kept every 1/FPS s */
  private step(t: number) {
    while (this.pendingAgain.length && this.pendingAgain[0].t <= t + 1e-9) {
      const g = this.pendingAgain.shift()!;
      const r = engine.again(this.sheet, this.view, g.at);
      if (r && r.events.length) { this.view = r.view; this.applyEvents(t, r.events); }
      this.lastKey = t;
    }
    const r = engine.penStep(this.sheet, this.view, { dt: DT * 1000, idle: (t - this.lastKey) * 1000, forgiving: true, speed: PEN_SPEED });
    this.view = r.view;
    this.applyEvents(t, r.events);
    if (t + 1e-9 >= this.f / FPS) {
      this.frames.push({ s: this.states.length - 1, v: { tail: this.view.tail, mid: this.view.mid, pending: this.view.pending, budget: this.view.budget }, wet: this.lastInk, cur: this.cursor });
      this.f++;
    }
  }
  /** run every step before T (live: before an act at T, or up to now) */
  runTo(T: number) {
    while (this.t < T - 1e-9) { this.step(this.t); this.t += DT; }
  }
  /** a whole session: each act at the first step at or after its time, to END */
  run(acts: Act[], END: number) {
    let ai = 0;
    for (; this.t <= END + 1e-9; this.t += DT) {
      while (ai < acts.length && acts[ai].t <= this.t + 1e-9) this.act(acts[ai++]);
      this.step(this.t);
    }
  }

  /** a recorded take, as it was typed (the recorder's way): the clock run up to each act, the act done, to END */
  replay(acts: Act[], END: number) {
    for (const a of acts) { this.runTo(a.t); this.act(a); }
    this.runTo(END);
  }

  /** the recording, as the video replays it (src/data/ink-session.json) */
  result(END: number) {
    return {
      fps: FPS, seconds: END, hand: HAND, paper: PAPER, measure: MEASURE, salt: this.salt,
      events: this.events, evTime: this.evTime, states: this.states, frames: this.frames, keys: this.keys, clicks: this.clicks,
      selections: this.selections, toasts: this.toasts, lifts: this.lifts, notes: this.notes,
      text: this.text(), logical: engine.logicalText(this.sheet.doc),
    };
  }
}
