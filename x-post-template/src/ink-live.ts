// ink-live.ts: the writing page (/write) on a clock, for a video of every interaction. Where ink-run.ts calls the
// engine the way InkSession does, this runs the site's own code: app/src/lib/ink.ts InkSession (the ink, the typing's
// tempo, styles, lines, the highlighter, stet), the page's undo history (lib/edits.ts UndoHistory) and its held
// Backspace (write/hold.ts BackspaceHold), with what Desk.tsx does around them copied as it is (onEdit, onHistory,
// onFormat, the 130 ms pen tick). The drawn pen is the engine's own createPen with LiveSheets' Ink-mode options, so
// the pen is the clock exactly as on the page: typing is handed to it a word at a time, and ink dries from when it
// lifts off. Everything runs on a virtual clock (performance.now is this clock while a session runs).
//
// The recording (one per scene): every event the log ever held (by id) and when it went down, every state of the log
// (event ids), when each stroke of each letter and mark was drawn (the drawn pen, sampled every 10 ms), and at every
// frame the pen's view (the thought letters), the tempo and style of what's typed next, the wet ink, the caret and
// the selection. src/InkEvery.tsx replays it (replay is deterministic).
import * as E from '@engine';
import { InkSession, inkOpts, newInkDoc, undoInk } from '@/lib/ink';
import { UndoHistory, type Edit } from '@/lib/edits';
import { BackspaceHold } from '@/write/hold';
import { HAND, SALT } from './setup';
import { makePaper, makePen } from './ink-run';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;
export const FPS = 30;
const DT = 0.01; // the clock's step, s
const PEN_TICK = 0.13; // Desk.tsx: the pen catches up this often while something waits
/** a computer's key repeat (macOS defaults: about half a second, then a dozen a second) */
const REPEAT_DELAY = 0.5, REPEAT_EVERY = 0.083;

// ---------- the virtual clock ----------
let NOW_MS = 0;
const realPerformance = globalThis.performance;
function useClock() { Object.defineProperty(globalThis, 'performance', { value: { now: () => NOW_MS }, configurable: true, writable: true }); }
export function restoreClock() { Object.defineProperty(globalThis, 'performance', { value: realPerformance, configurable: true, writable: true }); }

/** where something on the page is: a text index, given as a word (and which of them), or the end */
export type Where = 'end' | number | { before: string; n?: number } | { after: string; n?: number } | { inWord: string; at: number; len?: number; n?: number };

/**
 * What the writer does, at t (s):
 * - key: one character, 'Enter', 'Backspace', or a shortcut: 'Meta+z' (undo), 'Meta+b', 'Meta+i', 'Meta+u',
 *   'Shift+Meta+e' (highlight), 'Meta+Enter' (a P.S.)
 * - 'hold': Backspace held down for `dur` s (keydown, then the key's repeats, then keyup)
 * - 'click': the caret put somewhere (`at`)
 * - 'select': from `at` to `to` (dragged with the pointer)
 * - 'tick': a click on a checklist's box (`line`: the item's paragraph)
 * - 'note': a caption for the video's bar
 */
export type Act = { t: number; key: string; at?: Where; to?: Where; dur?: number; line?: number; note?: string };

export class LiveRun {
  readonly p = makePen();
  readonly paper = makePaper();
  readonly io = inkOpts(this.p, this.paper as any, 1, 1);
  readonly s: InkSession;
  readonly pen: any;
  readonly undo = new UndoHistory();
  readonly hold: BackspaceHold;
  /** the textarea's selection */
  sel: [number, number] = [0, 0];
  // the recording
  readonly events: any[] = [];
  readonly evTime: number[] = [];
  private idOf = new Map<any, number>();
  readonly states: { t: number; ids: number[] }[] = [{ t: 0, ids: [] }];
  readonly strokes: Record<string, [number, number][]> = {};
  readonly frames: any[] = [];
  readonly keys: { t: number; key: string; dur?: number }[] = [];
  readonly notes: { t: number; note: string }[] = [];
  readonly clicks: { t: number; kind: string; ids?: [number, number][]; side?: 'before' | 'after'; box?: number[] }[] = [];
  readonly selections: { t: number; ids: [number, number][]; until: number }[] = [];
  readonly toasts: { t: number; title: string; body: string }[] = [];
  readonly lifts: { t: number }[] = [];
  private t = 0;
  private f = 0;
  private lastTick = 0;
  private repeats: { t: number; up?: boolean }[] = [];
  private lastUnderline: [number, number] | null = null;
  private open = new Set<string>();
  private logLen = 0;

  constructor(salt: string = SALT, readonly offset = 0, typist: unknown = undefined) {
    useClock();
    NOW_MS = offset * 1000;
    const doc = newInkDoc(HAND.seed, HAND.style, salt);
    // (the person typing: one for the page, as on the site; `typist` gives one whose own pace is already known)
    this.s = typist ? new InkSession(this.p, doc, this.io.layout, false, typist) : new InkSession(this.p, doc, this.io.layout, false);
    // LiveSheets, Ink mode (a trail): the pen keeps about 1.2 s behind, copies a paste out within 5.5 s, forgets a
    // letter an undo took away; hold 0 (Desk: the pen is handed whole words already)
    this.pen = engine.createPen({ hold: 0, speed: 1.5, lag: 1.2, copy: 5.5, fadeIn: 0, forget: true });
    this.s.drawn = { current: this.pen };
    this.hold = new BackspaceHold({ late: () => this.changed(), clock: () => NOW_MS, schedule: (fn, ms) => { const at = this.t + ms / 1000; this.later.push({ at, fn }); return () => { this.later = this.later.filter((x) => x.fn !== fn); }; } });
  }
  private later: { at: number; fn: () => void }[] = [];

  text() { return this.s.text(); }
  private now() { return this.t; }

  // ---------- the page's handlers (Desk.tsx), as they are ----------
  /** sync(): the page re-renders: LiveSheets syncs the drawn pen with the page, and the log's new state is kept */
  private changed() {
    const page = this.s.page;
    this.pen.sync(page, this.now() + this.offset);
    this.pen.trail = this.s.trail;
    const log = this.s.doc.log as any[];
    const ids = log.map((e) => {
      let id = this.idOf.get(e);
      if (id == null) { id = this.events.length; this.idOf.set(e, id); this.events.push(e); this.evTime.push(this.now()); }
      return id;
    });
    const last = this.states[this.states.length - 1].ids;
    if (ids.length < this.logLen) this.lifts.push({ t: this.now() });
    this.logLen = ids.length;
    if (ids.length !== last.length || ids.some((x, i) => x !== last[i])) this.states.push({ t: this.now(), ids });
    // the page's letters and marks the pen hasn't finished drawing: watched until it has
    for (const it of (page?.items ?? []) as any[]) if ((it.kind === 'glyph' || it.kind === 'mark') && it.g?.strokes?.length && !this.strokes[it.key]) this.open.add(it.key);
  }
  private onEdit(e: Edit) {
    const before = this.s.text();
    this.s.edit(e);
    this.undo.record(before, this.s.text(), e);
    this.changed();
  }
  private toast(title: string, body: string) { this.toasts.push({ t: this.now(), title, body }); }
  private dry() { this.toast('The ink is dry', 'Cross it out instead.'); }
  private onHistory() {
    const s = this.s;
    const cur = s.text();
    const lastEv = s.doc.log[s.doc.log.length - 1] as { t?: string; why?: string; kind?: string } | undefined;
    if (!s.waiting && (lastEv?.t === 'check' || lastEv?.t === 'highlight')) {
      if (s.liftMark()) { this.changed(); return; }
      this.toast('The ink is dry', lastEv.t === 'check' ? 'Tick it again to cross the tick out.' : 'A highlight stays once it’s dry.');
      return;
    }
    const markOnTop = !!lastEv && ((lastEv.t === 'strike' && lastEv.why === 'again') || lastEv.t === 'underline' || (lastEv.t === 'pen' && lastEv.kind === 'retrace'));
    if (!s.waiting && markOnTop) {
      if (s.liftFormat() || s.undo()) { this.changed(); return; }
      if (lastEv!.t !== 'strike') { this.toast('The ink is dry', lastEv!.t === 'underline' ? 'An underline stays once it’s dry.' : 'Words gone over stay once they’re dry.'); return; }
    }
    const e = this.undo.undo(cur);
    if (!e) {
      if (!s.waiting && s.doc.log.length) {
        if (s.undo() || s.stetLast()) { this.undo.clear(); this.changed(); return; }
        this.dry();
      }
      return;
    }
    const want = cur.slice(0, e.at) + e.ins + cur.slice(e.at + e.del);
    // (undoInk, with stet on: the writing page's)
    const ok = undoInkHere(s, e);
    if (!ok) { this.undo.keep('undo'); this.changed(); this.dry(); return; }
    if (s.text() !== want) this.undo.clear();
    this.changed();
    this.setCaret(e.at + e.ins.length);
  }
  private onFormat(cmd: string, from: number, to: number) {
    const s = this.s;
    if (cmd === 'ps') { s.postScript(); this.changed(); return; }
    if (cmd === 'weight' || (cmd === 'lean' && from === to)) {
      const now = s.style();
      s.setStyle(cmd === 'lean' ? { lean: now.lean ? 0 : 1 } : { weight: now.weight ? 0 : 1 });
      this.changed();
      return;
    }
    if (cmd === 'lean') { this.toast('Ink can’t be leaned once it’s written', 'Press ⌘I, then type: the next words lean.'); return; }
    if (cmd === 'highlight') {
      if (from === to) return;
      if (s.highlight(from, to, 'yellow')) { this.changed(); this.endSelection(); this.setCaret(to); }
      return;
    }
    if (from === to) return;
    if (s.format(cmd === 'underline' ? 'underline' : 'press', from, to)) {
      this.changed();
      if (cmd === 'underline') this.lastUnderline = [from, to];
      this.endSelection();
      this.setCaret(to);
    }
  }
  /** a keydown on the textarea (PaperEditor's shortcuts; anything else, the browser's own editing) */
  private keyDown(key: string, repeat = false) {
    const [a, b] = this.sel;
    if (key === 'Backspace') {
      const act = this.hold.key({ key, repeat, metaKey: false, ctrlKey: false, altKey: false, isComposing: false }, this.sel, (at) => this.s.again(at));
      if (act === 'again') { this.changed(); return; }
      if (act === 'swallow') return;
      // the browser deletes: the selection, or the letter before the caret
      if (a !== b) { this.endSelection(); this.onEdit(this.edit(a, b - a, '', 'delete')); this.setCaret(a); return; }
      if (a <= 0) return;
      this.onEdit(this.edit(a - 1, 1, '', 'delete'));
      this.setCaret(a - 1);
      return;
    }
    this.hold.key({ key, repeat: false, metaKey: key.startsWith('Meta') || key.includes('+Meta'), ctrlKey: false, altKey: false, isComposing: false }, this.sel, (at) => this.s.again(at));
    if (key === 'Meta+z') { this.onHistory(); return; }
    if (key === 'Meta+b') { this.onFormat(a === b ? 'weight' : 'press', a, b); return; }
    if (key === 'Meta+i') { this.onFormat('lean', a, b); return; }
    if (key === 'Meta+u') { this.onFormat('underline', a, b); return; }
    if (key === 'Shift+Meta+e') { this.onFormat('highlight', a, b); return; }
    if (key === 'Meta+Enter') { this.onFormat('ps', a, b); this.setCaret(this.s.text().length); return; }
    const ins = key === 'Enter' ? '\n' : key;
    if (ins.length !== 1) return;
    if (a !== b) this.endSelection();
    this.onEdit(this.edit(a, b - a, ins, 'type'));
    this.setCaret(a + 1);
  }
  private edit(at: number, del: number, ins: string, kind: 'type' | 'delete'): Edit {
    return { at, del, ins, kind, t: NOW_MS, source: 'paper' } as Edit;
  }
  private setCaret(o: number) { const n = Math.max(0, Math.min(this.s.text().length, o)); this.sel = [n, n]; }
  private endSelection() { const sel = this.selections[this.selections.length - 1]; if (sel && sel.until === Infinity) sel.until = this.now(); }

  /** a text index from a description */
  where(w: Where): number {
    const text = this.s.text();
    if (w === 'end') return text.length;
    if (typeof w === 'number') return w;
    const find = (word: string, n = 0) => { let i = -1; for (let k = 0; k <= n; k++) { i = text.indexOf(word, i + 1); if (i < 0) throw new Error(`no "${word}" in ${JSON.stringify(text)}`); } return i; };
    if ('before' in w) return find(w.before, w.n);
    if ('after' in w) return find(w.after, w.n) + w.after.length;
    return find(w.inWord, w.n) + w.at;
  }
  /** the ink's letter ids at text [from, to) */
  private idsIn(from: number, to: number): [number, number][] { return engine.inkIdsIn(this.s.sheet, this.s.view, from, to); }

  /** do one thing, now */
  act(a: Act) {
    const t = a.t;
    if (a.key === 'note') { this.notes.push({ t, note: a.note! }); return; }
    if (a.key === 'click') {
      const o = this.where(a.at!);
      this.hold.key({ key: 'click', repeat: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false }, this.sel, () => null);
      this.endSelection();
      this.setCaret(o);
      const text = this.s.text();
      // where the pointer goes: the letter after the caret (before it), or the one before it (after it)
      const after = o < text.length ? this.idsIn(o, o + 1) : [];
      const before = o > 0 ? this.idsIn(o - 1, o) : [];
      this.clicks.push(after.length && !/\s/.test(text[o]) ? { t, kind: 'at', ids: after, side: 'before' } : { t, kind: 'at', ids: before, side: 'after' });
      this.keys.push({ t, key: 'click' });
      return;
    }
    if (a.key === 'select') {
      const from = this.where(a.at!), to = this.where(a.to!);
      this.sel = [Math.min(from, to), Math.max(from, to)];
      this.selections.push({ t, ids: this.idsIn(this.sel[0], this.sel[1]), until: Infinity });
      this.keys.push({ t, key: 'select' });
      return;
    }
    if (a.key === 'tick') {
      // the item's paragraph: the line breaks before the word
      const line = a.line ?? this.s.text().slice(0, this.where(a.at!)).split('\n').length - 1;
      const c = this.s.checks().find((x) => x.line === line);
      if (!c) throw new Error(`no box on line ${line}: ${JSON.stringify(this.s.checks())}`);
      this.clicks.push({ t, kind: 'box', box: c.box });
      this.keys.push({ t, key: 'click' });
      if (this.s.toggleCheck(line)) this.changed();
      return;
    }
    if (a.key === 'hold') {
      this.keys.push({ t, key: 'Backspace', dur: a.dur });
      this.keyDown('Backspace');
      for (let r = t + REPEAT_DELAY; r < t + a.dur!; r += REPEAT_EVERY) this.repeats.push({ t: r });
      this.repeats.push({ t: t + a.dur!, up: true });
      return;
    }
    this.keys.push({ t, key: a.key });
    this.keyDown(a.key);
  }

  /** one step of the clock: a held key's repeats, the page's timers, the pen tick, the drawn pen watched, a frame */
  private step() {
    const t = this.t;
    NOW_MS = (t + this.offset) * 1000;
    while (this.repeats.length && this.repeats[0].t <= t + 1e-9) {
      const r = this.repeats.shift()!;
      if (r.up) this.hold.keyUp({ key: 'Backspace', repeat: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false });
      else this.keyDown('Backspace', true);
    }
    for (const x of this.later.filter((y) => y.at <= t + 1e-9)) { this.later = this.later.filter((y) => y !== x); x.fn(); }
    // the pen tick (Desk.tsx): while something waits for the pen, every 130 ms
    if (t - this.lastTick >= PEN_TICK - 1e-9) {
      const dt = (t - this.lastTick) * 1000;
      this.lastTick = t;
      if (this.s.waiting && this.s.step(dt, false, this.pen.at(t + this.offset).letters)) this.changed();
    }
    // the drawn pen: when each stroke starts and ends
    if (this.open.size) {
      const ps = this.pen.at(t + this.offset);
      const items = new Map(((this.s.page?.items ?? []) as any[]).map((it) => [it.key, it]));
      for (const key of [...this.open]) {
        const it = items.get(key);
        if (!it) { this.open.delete(key); continue; }
        const n = it.g.strokes.length;
        const rec = (this.strokes[key + '~'] as any) ?? (this.strokes[key + '~'] = Array.from({ length: n }, () => [NaN, NaN]) as any);
        let done = true;
        for (let si = 0; si < n; si++) {
          const v = ps.ink(key, si);
          if (v > 0 && Number.isNaN(rec[si][0])) rec[si][0] = t - DT;
          if (v >= 1 && Number.isNaN(rec[si][1])) rec[si][1] = t;
          if (!(v >= 1)) done = false;
        }
        if (done) { this.strokes[key] = rec.map(([a, b]: number[]) => [Number.isNaN(a) ? b : a, b]); delete (this.strokes as any)[key + '~']; this.open.delete(key); }
      }
    }
    if (t + 1e-9 >= this.f / FPS) {
      const s = this.s, v = s.view;
      const n = s.doc.log.length;
      const dryAt = n ? s.dryAt(n - 1) : -Infinity;
      this.frames.push({
        s: this.states.length - 1,
        v: { tail: v.tail, mid: v.mid, pending: v.pending, budget: v.budget },
        haste: (s as any).nextHaste?.() ?? 0,
        style: (s as any).typingStyle?.() ?? null,
        // the newest ink's time left to dry (ms): -1 while the pen is still writing it, null when dry
        wet: !n ? null : dryAt === Infinity ? -1 : NOW_MS <= dryAt ? dryAt - NOW_MS : null,
        cur: this.sel[0] === this.sel[1] && this.sel[0] >= s.text().length ? null : this.sel[0],
      });
      this.f++;
    }
  }
  run(acts: Act[], END: number) {
    let ai = 0;
    this.changed();
    for (; this.t <= END + 1e-9; this.t = Math.round((this.t + DT) * 1000) / 1000) {
      NOW_MS = (this.t + this.offset) * 1000;
      while (ai < acts.length && acts[ai].t <= this.t + 1e-9) this.act(acts[ai++]);
      this.step();
    }
  }
  result(END: number) {
    // strokes still being drawn at the end: done when they'd be
    for (const k of Object.keys(this.strokes)) if (k.endsWith('~')) delete (this.strokes as any)[k];
    return {
      fps: FPS, seconds: END, hand: HAND, salt: this.s.doc.salt, wetMs: this.s.wetMs,
      events: this.events, evTime: this.evTime, states: this.states, strokes: this.strokes, frames: this.frames,
      keys: this.keys, notes: this.notes, clicks: this.clicks, selections: this.selections, toasts: this.toasts, lifts: this.lifts,
      text: this.s.text(), logical: engine.logicalText(this.s.doc),
    };
  }
}

/** lib/ink.ts undoInk with { stet: true }, as the writing page calls it */
function undoInkHere(s: InkSession, e: Edit) { return undoInk(s, e, { stet: true }); }
