// The note on the desk: one sheet of paper and a pen. Typing behaves like ink (lib/ink.ts): the pen trails the keys,
// so what it hasn't reached yet deletes cleanly; once it's written, Backspace crosses it out, and pressing again (or
// holding it, on any keyboard: hold.ts) crosses it out harder. ⌘B goes over the words again, ⌘U underlines them;
// Undo lifts wet ink, and on a dry crossing-out writes *stet* in the margin, and the word counts again. Nothing is
// ever deleted.
//
// The page around it (the library, the toolbar, the panels) is WriteApp's; this is only the paper.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as E from '@engine';
import { CAP } from '@engine';
import { toast } from 'sonner';
import { PaperEditor, type FormatCommand, type PaperEditorApi, type Pencil } from '@/components/PaperEditor';
import { LiveSheets } from '@/components/LiveSheets';
import { useElementWidth } from '@/hooks/useElementWidth';
import { cn } from '@/lib/utils';
import { UndoHistory, type Edit } from '@/lib/edits';
import { InkSession, decodeInk, encodeInk, inkExtras, inkGeometry, inkLive, inkOffsets, inkOpts, newInkDoc, undoInk, type InkFormat, type InkHighlight } from '@/lib/ink';
import { wordAt } from '@/lib/doc';
import { pageSetup } from '@/lib/live';
import { renderLiveNote, renderLiveSheets, type SheetShot } from '@/lib/actions';
import { getPaper } from '@/lib/papers';
import { inkColor } from '@/lib/inks';
import { effective, effectiveHand } from '@/lib/params';
import { handFor } from '@/lib/request';
import { handOpts } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import { BackspaceHold, type HoldAct } from './hold';
import { useHints } from './hints';
import { MarginNote } from './MarginNote';
import { StartHint } from './StartHint';
import { pendingTicks, stateOf, wordCount, type LineFormat, type Note } from './notes';
import { caretFit, nibFinder, strikeSpans, type PageItem, type PencilFrame } from './pencil';

/** two frames: a state change has been rendered (the page's layout read after it is the new one) */
const afterRender = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
/** the sheet's largest size (px per mm) */
const MAX_PX_PER_MM = 3.9;
const SHEET_GAP = 24;
/** the grey letters the pen hasn't reached yet: about 3:1 on the papers, readable, and still plainly lighter than ink
 *  (about 11:1). The home page's desk keeps its fainter ones (lib/ink.ts INK_THOUGHT) */
const THOUGHT = 0.8;
/** how often the pen is handed what's been typed (the drawn pen is the clock) */
const PEN_TICK = 130;
/** the strike tick stays this long after the last Backspace of a run */
const DELETING_MS = 1500;
/** keys that are only held with another: they don't end a run of Backspaces */
const MODIFIERS = new Set(['Shift', 'Meta', 'Control', 'Alt', 'CapsLock', 'Fn', 'OS']);
/** the next, harder strike, the moment ⌫ is pressed again: in red pencil, until the pen inks it */
const GHOST_LOOK = { fill: 'var(--wr-pencil, #c4402a)', opacity: 0.4, fade: false };

export interface DeskApi {
  focus: () => void;
  /** the caret at the end of what's written */
  focusEnd: () => void;
  /** the ink as kept, with the pen's unwritten tail written down first (before leaving, a new note) */
  flush: () => string | null;
  format: (cmd: FormatCommand) => void;
  history: (dir: 'undo' | 'redo') => void;
  /** typed in, as if pasted (a fair copy is written out this way) */
  write: (text: string) => void;
  text: () => string;
  selection: () => [number, number];
  /** the note as an image (JPEG), every sheet */
  image: () => Promise<Blob>;
  /** its first sheet, painted, with where its ink is (the share picture crops to the writing), and how many it has */
  sheets: () => Promise<{ shots: SheetShot[]; total: number }>;
  /** what typing will do at the caret (the toolbar shows it): leaning, pressed, the line's style and list; null in Clean */
  style: () => InkFormat | null;
  /** a formatting command from the toolbar, on the selection (or the word, or the line, at the caret) */
  command: (cmd: FormatCommand) => void;
  /** the note's lines as they read now, each with how it's set out (a fair copy, or Clean, keeps them) */
  lines: () => LineFormat[];
}
/** the commands about the caret's line (the others take the word at the caret when nothing is selected) */
const LINE_CMDS = new Set<FormatCommand>(['title', 'heading', 'body', 'bullets', 'numbers', 'checklist', 'check']);

interface Props {
  note: Note;
  coarse: boolean;
  /** after every change: the ink as kept (null when nothing is written) and what the note says */
  onChange: (ink: string | null, text: string) => void;
  /** a key that writes (the page's chrome steps back) */
  onTyped: () => void;
  /** the editor has the focus, or not */
  onEditingChange?: (editing: boolean) => void;
  /** said to screen readers */
  onSay?: (s: string) => void;
  /** the sheet moves as itself between the desk and the library (View Transitions): off while a new note arrives */
  named?: boolean;
  /** the highlighter's colour */
  highlighter?: InkHighlight;
  /** what typing will do changed (a style, a line's format): the toolbar asks again */
  onStyle?: () => void;
}

export const Desk = forwardRef<DeskApi, Props>(function Desk({ note, coarse, onChange, onTyped, onEditingChange, onSay, highlighter = 'yellow', onStyle, named = true }, ref) {
  const highlighterRef = useRef<InkHighlight>(highlighter);
  highlighterRef.current = highlighter;
  const onStyleRef = useRef(onStyle);
  onStyleRef.current = onStyle;
  const look = note.look;
  // a blank note just put on the desk settles into place (once, as it mounts)
  const [fresh] = useState(() => (note.mode === 'clean' ? !note.text : !note.ink) && Date.now() - note.created < 1500);
  const state = useMemo(() => stateOf(look), [look]);
  const natural = useMemo(() => handFor(state.seed, state.style, handOpts(state)), [state]);
  const eff = useMemo(() => effective(natural, state), [natural, state]);
  const p = useMemo(() => effectiveHand(natural, eff), [natural, eff]);
  const paper = getPaper(state.paper);
  const ink = inkColor(state.ink);
  const name = useMemo(() => writerName(state.seed), [state.seed]);
  const layout = useMemo(() => inkOpts(p, paper, eff.size, eff.lineSpacing).layout, [p, paper, eff.size, eff.lineSpacing]);
  const startCaret = useMemo(() => {
    const { opts } = pageSetup(p, paper, eff.size, eff.lineSpacing);
    return { sheet: 0, x: opts.marginLeft as number, y: opts.firstBaseline as number, line: 0 };
  }, [p, paper, eff.size, eff.lineSpacing]);

  // ---------- the ink ----------
  // one session per hand: another writer, pen or paper writes the same log again in its own way
  const docRef = useRef(decodeInk(note.ink) ?? newInkDoc(look.seed, look.style));
  const session = useMemo(() => {
    const s = new InkSession(p, docRef.current, layout, coarse);
    docRef.current = s.doc;
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, layout, coarse]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const undoHistory = useMemo(() => new UndoHistory(), [session]);
  const [tick, setTick] = useState(0);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const report = useCallback(() => {
    const s = sessionRef.current;
    onChangeRef.current(s.doc.log.length ? encodeInk(s.doc) : null, s.text());
  }, []);
  const sync = useCallback(() => { setTick((n) => n + 1); report(); }, [report]);

  // the pen catches up with the typing: the drawn pen (LiveSheets) is the clock, the typing handed to it a word at a
  // time; the timer runs only while something waits for the pen
  const drawnPen = useRef<{ at(now: number): { letters: number } } | null>(null);
  session.drawn = drawnPen;
  // the drawn pen has caught up with everything handed to it (the caret's bead shows; notes about the pen can show)
  const [penRest, setPenRest] = useState(true);
  const [editing, setEditing] = useState(false);
  const penRestRef = useRef(penRest);
  penRestRef.current = penRest;
  const hints = useHints({ phone: coarse, stet: true });
  const hintsRef = useRef(hints);
  hintsRef.current = hints;
  /** notes waiting for the pen to finish what it's drawing */
  const afterPen = useRef(new Set<'strike' | 'double'>());
  const waiting = session.waiting;
  useEffect(() => {
    if (!waiting) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (s.waiting && s.step(dt, false, drawnPen.current?.at(now / 1000).letters)) sync();
    }, PEN_TICK);
    return () => window.clearInterval(id);
  }, [session, sync, waiting]);

  const { live, extras, geometry, text, hovering, draft } = useMemo(() => {
    const draft = session.draft();
    const live = inkLive(p, session.page, paper, eff.size, eff.lineSpacing, draft);
    // the highlighter's swipes, under the ink (multiplied, so the writing reads through as if laid over them)
    const hl = (E as unknown as { highlightsSVG?: (page: unknown, emPx: number) => string }).highlightsSVG?.(live.page, live.emPx) ?? '';
    const base = inkExtras(live, { draft, signed: false, writerName: '' });
    // (the thought letters travel beside the sheets' markup, patched a word at a time: kept with it)
    const extras = hl ? Object.assign(base.map((x) => hl + x), { thoughts: base.thoughts }) : base;
    const text = session.text();
    return { live, extras, geometry: inkGeometry(live, p, session), text, hovering: session.hovering, draft };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick, p, paper, eff.size, eff.lineSpacing]);

  // ---------- typing ----------
  const editor = useRef<PaperEditorApi>(null);
  // ⌫ again on a crossed-out word, pressed or held: the harder strike shows in red pencil at once, where the pen is
  // about to ink it; handed back right after it's shown, the page keeps it under the new ink until the pen has drawn
  // it (LiveSheets' ghost, the engine's previewAgain)
  const [ghost, setGhost] = useState<{ items: any[] } | null>(null);
  useEffect(() => { if (ghost) setGhost(null); }, [ghost]);
  // Backspace at a crossed-out word, pressed or held, on any keyboard (hold.ts)
  const hold = useMemo(() => new BackspaceHold({ late: () => sync() }), [sync]);
  hold.touch = coarse;
  const onTypedRef = useRef(onTyped);
  onTypedRef.current = onTyped;
  const onEdit = useCallback((e: Edit) => {
    const s = sessionRef.current;
    // a deletion the phone made after the page swallowed it (Android won't cancel one): the text stays, the caret too
    const caret = hold.dropped(e);
    if (caret != null) { queueMicrotask(() => editor.current?.setSelection(caret)); return; }
    if (e.kind === 'undo') {
      // the browser's own undo (a menu, a shake): the same as ⌘Z
      onHistoryRef.current('undo');
      return;
    }
    const before = s.text();
    onTypedRef.current();
    if (e.del) hintsRef.current.used('select');
    if (e.ins && e.at < before.length && typeof s.insertsAbove === 'function' && s.insertsAbove(e.at)) hintsRef.current.used('above');
    // (the writer may not do quite what the textarea did: Backspace over a written space goes on to the word before)
    const caretTo = s.edit(e, { caret: true });
    undoHistory.record(before, s.text(), e);
    sync();
    if (caretTo != null) requestAnimationFrame(() => editor.current?.setSelection(caretTo));
  }, [undoHistory, sync, hold]);

  // Undo takes back what the pen hasn't written yet, and lifts wet ink; dry ink stays, but a word crossed out (and
  // crossed out harder) is let stand: stet (lib/ink.ts)
  /** ⌘Z on dry ink: a quiet note in the margin, where you're looking (a toast only if the margin can't say it) */
  const dry = () => { if (!hintsRef.current.trigger('dry', { direct: true })) toast('The ink is dry', { id: 'ink-dry', description: 'Cross it out instead.' }); };
  const onHistory = useCallback((dir: 'undo' | 'redo') => {
    const s = sessionRef.current;
    const cur = s.text();
    // a mark just made (crossed out again, an underline, a word gone over): lift it while it's wet
    const lastEv = s.doc.log[s.doc.log.length - 1] as { t?: string; why?: string; kind?: string } | undefined;
    // a tick or a highlight just made: lifted while it's wet
    if (dir === 'undo' && !s.waiting && (lastEv?.t === 'check' || lastEv?.t === 'highlight')) {
      if (s.liftMark()) { sync(); return; }
      toast('The ink is dry', { id: 'ink-dry', description: lastEv.t === 'check' ? 'Tick it again to cross the tick out.' : 'A highlight stays once it’s dry.' });
      return;
    }
    const markOnTop = !!lastEv && ((lastEv.t === 'strike' && lastEv.why === 'again') || lastEv.t === 'underline' || (lastEv.t === 'pen' && lastEv.kind === 'retrace'));
    if (dir === 'undo' && !s.waiting && markOnTop) {
      if (s.liftFormat() || s.undo()) { sync(); return; }
      // dry: an underline or words gone over stay as they are (a word crossed out harder goes on, to be let stand)
      if (lastEv.t !== 'strike') { toast('The ink is dry', { id: 'ink-dry', description: lastEv.t === 'underline' ? 'An underline stays once it’s dry.' : 'Words gone over stay once they’re dry.' }); return; }
    }
    const e = dir === 'undo' ? undoHistory.undo(cur) : undoHistory.redo(cur);
    if (!e) {
      if (dir === 'undo' && !s.waiting && s.doc.log.length) {
        if (s.undo() || s.stetLast()) { undoHistory.clear(); sync(); return; }
        dry();
      }
      return;
    }
    const want = cur.slice(0, e.at) + e.ins + cur.slice(e.at + e.del);
    if (dir === 'redo') s.edit({ ...e, kind: e.ins ? 'type' : 'delete' });
    else if (!undoInk(s, e, { stet: true })) {
      undoHistory.keep(dir);
      sync();
      dry();
      return;
    }
    if (s.text() !== want) undoHistory.clear();
    sync();
    requestAnimationFrame(() => editor.current?.setSelection(e.at + e.ins.length));
  }, [undoHistory, sync]);
  const onHistoryRef = useRef(onHistory);
  onHistoryRef.current = onHistory;

  const lastUnderline = useRef<[number, number] | null>(null);
  // ⌘B: the words gone over again, heavier. ⌘U: underlined by hand. ⌘↩: a P.S.
  const onFormat = useCallback((cmd: FormatCommand, from: number, to: number) => {
    const s = sessionRef.current;
    if (cmd === 'ps') { s.postScript(); sync(); return; }
    // formatting by hand (lib/ink.ts): what's typed next, the caret's line, a checklist's tick, the highlighter
    const caret = editor.current?.selection() ?? [from, to];
    if (cmd === 'weight' || (cmd === 'lean' && caret[0] === caret[1])) {
      const now = s.style();
      s.setStyle(cmd === 'lean' ? { lean: now.lean ? 0 : 1 } : { weight: now.weight ? 0 : 1 });
      sync();
      onStyleRef.current?.();
      return;
    }
    if (cmd === 'lean') { toast('Ink can’t be leaned once it’s written', { id: 'ink-dry', description: 'Press ⌘I, then type: the next words lean.' }); return; }
    const list = cmd === 'bullets' ? 'bullet' : cmd === 'numbers' ? 'number' : cmd === 'checklist' ? 'check' : null;
    if (list || cmd === 'title' || cmd === 'heading' || cmd === 'body') {
      const ok = list ? s.setList(s.style(from).list === list ? null : list, from) : s.setRole(cmd === 'title' || cmd === 'heading' ? cmd : 'body', from);
      if (!ok) toast('That line is already in ink', { id: 'ink-dry', description: 'Start a new line for a title or a list.' });
      sync();
      onStyleRef.current?.();
      return;
    }
    if (cmd === 'check') { if (s.toggleCheck(s.text().slice(0, from).split('\n').length - 1)) { onTypedRef.current(); sync(); } return; }
    if (cmd === 'highlight') {
      if (from === to) { toast('Select the words to highlight', { id: 'format-none', duration: 2400 }); return; }
      if (s.highlight(from, to, highlighterRef.current)) { onTypedRef.current(); sync(); if (caret[0] !== caret[1]) requestAnimationFrame(() => editor.current?.setSelection(to)); }
      return;
    }
    if (from === to) {
      toast(cmd === 'underline' ? 'Select the words to underline' : 'Select the words to go over', { id: 'format-none', duration: 2400 });
      return;
    }
    if (s.format(cmd === 'underline' ? 'underline' : 'press', from, to)) {
      onTypedRef.current();
      sync();
      if (cmd === 'underline') {
        // the first underline: "⌘U again" once the pen has drawn it; a second one: found
        if (lastUnderline.current && lastUnderline.current[0] === from && lastUnderline.current[1] === to) hintsRef.current.used('double');
        else afterPen.current.add('double');
        lastUnderline.current = [from, to];
      }
      // the marked words stand clear of the selection's tint, the caret after them (with no selection, the caret stays)
      if (caret[0] !== caret[1]) requestAnimationFrame(() => editor.current?.setSelection(to));
    }
  }, [sync]);

  // a phone's deletions as they come (keydown doesn't name them on Android, and iOS deletes whole words without one)
  const againAt = (at: number) => {
    const s = sessionRef.current;
    const side = editor.current?.side();
    // (the marks this press will draw, asked first: the same seeds and keys, so the pen inks over them; before a
    // struck word the press acts on that word, which the preview doesn't know, so it's left to the ink)
    const preview = typeof s.ghostAt === 'function' && side !== 'before' ? s.ghostAt(at) : null;
    const r = s.again(at, side);
    if (r && !r.max && preview) setGhost(preview);
    return r;
  };
  const textSel = (t: EventTarget | null) => ((t as HTMLElement | null)?.tagName === 'TEXTAREA' ? editor.current?.selection() ?? null : null);
  const againTimes = useRef<number[]>([]);
  const held = (act: HoldAct) => {
    if (act === 'again') {
      onTypedRef.current();
      sync();
      // the ladder: pressing again was found; twice in a row on a computer, holding it is next (a held key's own
      // cadence, 700 ms, means it was found too)
      const now = performance.now();
      const t = againTimes.current.filter((x) => now - x < 2000);
      const heldNow = t.length > 0 && now - t[t.length - 1] < 800;
      againTimes.current = [...t, now];
      hintsRef.current.used('again');
      if (heldNow) hintsRef.current.used('hold');
      else if (t.length >= 1 && !coarse) hintsRef.current.trigger('hold', { direct: true });
    }
    return act !== 'pass';
  };
  const deskRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const before = (e: InputEvent) => { if (held(hold.input(e, textSel(e.target), againAt))) e.preventDefault(); };
    desk.addEventListener('beforeinput', before, true);
    return () => desk.removeEventListener('beforeinput', before, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold]);
  // the strike tick (the caret's red tick: Backspace will cross out) shows only once Backspace is being pressed, as a
  // preview of the next strike (Rafael, 7 Nov: always there at the end of the writing, it read as a glitch): from the
  // first press of a run until another key, a click, or a moment's rest
  const [deleting, setDeleting] = useState(false);
  const deletingTimer = useRef(0);
  const deletingNow = useCallback((on: boolean) => {
    window.clearTimeout(deletingTimer.current);
    if (on) deletingTimer.current = window.setTimeout(() => setDeleting(false), DELETING_MS);
    setDeleting(on);
  }, []);
  useEffect(() => () => window.clearTimeout(deletingTimer.current), []);
  // a phone's deletions come as beforeinput (Android names no key: its keydown, "Unidentified", came first and ended
  // the run; the deletion starts it again)
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const input = (e: InputEvent) => {
      if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteWordBackward') deletingNow(true);
      else if (e.inputType.startsWith('insert')) deletingNow(false);
    };
    desk.addEventListener('beforeinput', input, true);
    return () => desk.removeEventListener('beforeinput', input, true);
  }, [deletingNow]);
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') deletingNow(true);
    else if (!MODIFIERS.has(e.key)) deletingNow(false);
    if (held(hold.key(e.nativeEvent, textSel(e.target), againAt))) { e.preventDefault(); e.stopPropagation(); }
  };
  const onKeyUpCapture = (e: React.KeyboardEvent) => hold.keyUp(e.nativeEvent);
  const sayRef = useRef(onSay);
  sayRef.current = onSay;

  // a note brought back into ink, or a fair copy: its ticked items are ticked again, by the pen, once it's written
  useEffect(() => {
    if (!pendingTicks.get(note.id)?.length) return;
    const t = window.setTimeout(() => {
      // (taken only when they're drawn: a page that mounts twice in development keeps them for the second time)
      const ticks = pendingTicks.get(note.id) ?? [];
      pendingTicks.delete(note.id);
      const s = sessionRef.current;
      let any = false;
      for (const line of ticks) any = s.toggleCheck(line) || any;
      if (any) sync();
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // a fair copy is written out by the pen the first time it's on the desk
  const [writeOut] = useState(() => !!note.fair && Date.now() - note.fair < 4000);

  // ---------- what the pen did, said; and the notes that teach it ----------
  const saidN = useRef(session.changes ?? 0);
  useEffect(() => {
    const s = sessionRef.current;
    if (typeof s.lastChange !== 'function' || s.changes === saidN.current) return;
    saidN.current = s.changes;
    const said = s.lastChange();
    if (!said) return;
    sayRef.current?.(said);
    // the first crossing-out or letter written over: once the pen has drawn it, ink stays, so ⌫ crosses out
    if (/^(Crossed out|Written over)/.test(said)) { afterPen.current.add('strike'); hintsRef.current.used('grey'); }
  }, [tick]);
  // the first grey letters ever (typed, the pen not there yet): what they are, at the bottom, until twelve words are in
  // ink or the first crossing-out (then it fades)
  const thinking = session.trail > 0;
  useEffect(() => { if (thinking) hintsRef.current.trigger('grey'); }, [thinking]);
  useEffect(() => {
    if (hints.note?.id === 'grey' && !hints.note.leaving && penRest && wordCount(sessionRef.current.text()) >= 12) hintsRef.current.used('grey');
  }, [tick, penRest, hints.note]);
  // notes waiting on the pen, once it rests (a beat after it lifts)
  useEffect(() => {
    if (!penRest || !afterPen.current.size) return;
    const t = window.setTimeout(() => {
      for (const id of afterPen.current) hintsRef.current.trigger(id, { direct: id === 'double' });
      afterPen.current.clear();
    }, 300);
    return () => window.clearTimeout(t);
  }, [penRest, tick]);
  // the caret resting beside a crossed-out word (not inked out yet), the pen idle: ⌫ again crosses it out harder
  const restTimer = useRef(0);
  const restCheck = useCallback(() => {
    window.clearTimeout(restTimer.current);
    restTimer.current = window.setTimeout(() => {
      const s = sessionRef.current;
      const [a, b] = editor.current?.selection() ?? [0, 0];
      if (a !== b || !penRestRef.current || typeof s.struckLevel !== 'function') return;
      const lv = s.struckLevel(a);
      if (lv != null && lv >= 1 && lv <= 3) hintsRef.current.trigger('again');
    }, 1200);
  }, []);
  useEffect(() => { restCheck(); return () => window.clearTimeout(restTimer.current); }, [tick, penRest, restCheck]);
  // a click that lands mid-ink (typing there goes above the line), or a selection made over ink
  const onPointerUpCapture = () => {
    requestAnimationFrame(() => {
      const s = sessionRef.current;
      const [a, b] = editor.current?.selection() ?? [0, 0];
      if (a !== b) { if (s.doc.log.length) hintsRef.current.trigger('select', { direct: true }); return; }
      if (typeof s.insertsAbove === 'function' && s.insertsAbove(a)) hintsRef.current.trigger('above', { direct: true });
      restCheck();
    });
  };
  // the note's first words reach screen readers once
  useEffect(() => { if (hints.announce) sayRef.current?.(hints.announce); }, [hints.announce]);

  // ---------- the red pencil: what the caret shows (PaperEditor's `pencil`) ----------
  const frame = useMemo<PencilFrame>(() => {
    const sheetU = live.paper.h * live.unitsPerMm, n = live.sheets.length;
    return { shift: (s) => live.sheets[s]?.shiftU ?? s * sheetU, sheetOf: (it) => Math.min(n - 1, Math.max(0, Math.floor(it.y / sheetU))) };
  }, [live]);
  const nibs = useRef(nibFinder()).current;
  useEffect(() => { if (penRest) nibs.reset(); }, [penRest, nibs]);
  const pencil = useMemo<Pencil>(() => {
    const s = session;
    const t = s.text();
    const tailFrom = t.length - String(s.view?.tail ?? '').length;
    // where each typed letter is on the paper: a letter of ink takes a place of its own there, while the letters of
    // an insertion being typed all sit at one place (they aren't written yet); the thought letters come after the ink
    const { toPaper: tp } = inkOffsets(s.sheet, s.view);
    const mapped = tp.length === t.length + 1;
    const inked = (i: number) => i >= 0 && i < tailFrom && (!mapped || tp[i + 1] > tp[i]);
    const mid = String(s.view?.mid?.text ?? '');
    const midAt = mid && mapped ? tp.findIndex((v, i) => i < tailFrom && tp[i + 1] === v) : -1;
    const items = (live.page.items ?? []) as PageItem[];
    const xhU = (p.xHeight as number) * CAP;
    const style = typeof s.style === 'function' ? s.style() : null;
    return {
      typing: style ? { weight: style.weight, lean: style.lean } : undefined,
      inked,
      marks: (at) => {
        // typing goes above the line here, or this is the insertion being typed (still above, until it's written)
        const above = (typeof s.insertsAbove === 'function' && s.insertsAbove(at)) || (midAt >= 0 && at >= midAt && at <= midAt + mid.length);
        // Backspace crosses out here (the session knows: the letter before is ink, or a crossed-out word is there
        // to cross out harder), rather than taking back letters the pen hasn't reached. Shown only while Backspace is
        // being pressed: a preview of the next strike
        const side = editor.current?.side?.();
        let strike: boolean;
        if (!deleting) strike = false;
        else if (typeof s.nextBackspace === 'function') { const k = s.nextBackspace(at, side).kind; strike = k === 'strike' || k === 'again'; }
        else {
          strike = /\S/.test(t[at - 1] ?? '') && inked(at - 1);
          if (!strike && typeof s.struckLevel === 'function') { const lv = s.struckLevel(at); strike = lv != null && lv >= 1 && lv <= 3; }
        }
        return { strike, above };
      },
      fit: (c) => caretFit([items, (draft?.items ?? []) as PageItem[], ((draft as { ins?: { items?: unknown[] } } | null)?.ins?.items ?? []) as PageItem[]], xhU, frame, c),
      nib: () => nibs.find(drawnPen.current, items, frame),
      strikes: hovering ? strikeSpans(items, s.pendingKeys, frame) : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick, live, draft, hovering, frame, p, deleting]);

  // ---------- the page ----------
  const deskW = useElementWidth(deskRef);
  const pxPerMm = deskW > 0 ? Math.min(MAX_PX_PER_MM, deskW / paper.w) : 0;
  // on a computer the pen is on the paper from the start; on a phone, a tap brings the keyboard up
  useEffect(() => {
    if (coarse || !pxPerMm) return;
    editor.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coarse, !!pxPerMm]);

  const textRef = useRef(text);
  textRef.current = text;
  const shown = useRef({ live, extras, pxPerMm });
  shown.current = { live, extras, pxPerMm };
  useImperativeHandle(ref, () => ({
    focus: () => editor.current?.focus(),
    focusEnd: () => { editor.current?.focus(); editor.current?.setSelection(textRef.current.length); },
    flush: () => {
      const s = sessionRef.current;
      if (s.waiting) { s.flush(); setTick((n) => n + 1); }
      return s.doc.log.length ? encodeInk(s.doc) : null;
    },
    format: (cmd) => {
      const [a, b] = editor.current?.selection() ?? [0, 0];
      onFormat(cmd, a, b);
    },
    history: (dir) => onHistoryRef.current(dir),
    write: (t) => {
      const s = sessionRef.current;
      const at = s.text().length;
      onEdit({ at, del: 0, ins: t, kind: 'paste', t: Date.now(), source: 'paper' });
      requestAnimationFrame(() => editor.current?.setSelection(at + t.length));
    },
    text: () => sessionRef.current.text(),
    selection: () => editor.current?.selection() ?? [0, 0],
    style: () => (typeof sessionRef.current.style === 'function' ? sessionRef.current.style(editor.current?.selection()[0]) : null),
    lines: () => {
      const s = sessionRef.current;
      if (s.waiting) { s.flush(); setTick((n) => n + 1); }
      const t = s.text();
      const ticked = new Map((typeof s.checks === 'function' ? s.checks() : []).map((c) => [c.line, c.checked]));
      let at = 0;
      return t.split('\n').map((text, i) => {
        const f = typeof s.style === 'function' ? s.style(at) : null;
        at += text.length + 1;
        const as = f ? (f.list ?? f.role ?? 'body') : 'body';
        return { text, as, checked: as === 'check' ? !!ticked.get(i) : undefined };
      });
    },
    command: (cmd) => {
      let [a, b] = editor.current?.selection() ?? [0, 0];
      if (a === b && !LINE_CMDS.has(cmd) && cmd !== 'weight' && cmd !== 'lean' && cmd !== 'ps') [a, b] = wordAt(textRef.current, a);
      onFormat(cmd, a, b);
      if (!coarse) editor.current?.focus();
    },
    image: async () => {
      const s = sessionRef.current;
      // the pen's unwritten tail written down first, and the page drawn with it before it's read
      if (s.waiting) { s.flush(); setTick((n) => n + 1); await afterRender(); }
      const { live: l, extras: x, pxPerMm: k } = shown.current;
      return (await renderLiveNote(l, x, eff.inkKey ?? undefined, ink, k || 2)).blob;
    },
    sheets: async () => {
      const s = sessionRef.current;
      if (s.waiting) { s.flush(); setTick((n) => n + 1); await afterRender(); }
      const { live: l, extras: x, pxPerMm: k } = shown.current;
      return { shots: await renderLiveSheets(l, x, eff.inkKey ?? undefined, ink, k || 2, 1, true), total: l.sheets.length };
    },
  }), [onFormat, onEdit, eff.inkKey, ink, coarse]);

  // the margin note: beside the line being written when there's room right of the sheet, else under the toolbar
  const sheetPx = live.paper.w * pxPerMm;
  const room = (deskW - sheetPx) / 2;
  const caretAt = hints.note ? editor.current?.caretRect() ?? null : null;
  const noteStyle: React.CSSProperties | undefined = hints.note && caretAt && room >= 200
    ? { position: 'absolute', left: room + sheetPx + 16, top: caretAt.top + caretAt.height / 2, marginTop: '-0.7em', maxWidth: Math.min(220, room - 24) }
    : undefined;

  return (
    <div
      className="wr-desk"
      ref={deskRef}
      onKeyDownCapture={onKeyDownCapture}
      onKeyUpCapture={onKeyUpCapture}
      onPointerUpCapture={onPointerUpCapture}
      onPointerDownCapture={() => deletingNow(false)}
      // a press on the desk around the sheet keeps the pen where it was (it never drops the focus, so nothing typed
      // after is lost); on a phone, a tap there opens the keyboard at the end of what's written
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('[data-paper], button, a, input, textarea, select, [role="dialog"]')) return;
        e.preventDefault();
        if (coarse) { editor.current?.focus(); editor.current?.setSelection(textRef.current.length); }
        else editor.current?.focus();
      }}
    >
      {/* named by the note's id: a new note, or one opened from the library, moves as itself (moveSheets) */}
      <div className={cn('wr-sheet', fresh && 'wr-sheet-fresh')} style={{ viewTransitionName: named ? `sheet-${note.id}` : undefined }}>
        {pxPerMm > 0 && (
          <PaperEditor
            ref={editor}
            text={text}
            hovering={hovering}
            mode="ink"
            onEdit={onEdit}
            onHistory={onHistory}
            start={startCaret}
            onFormat={onFormat}
            writerName={name}
            geometry={geometry}
            pxPerMm={pxPerMm}
            sheetW={live.paper.w}
            sheetH={live.paper.h}
            gapPx={SHEET_GAP}
            ink={ink}
            penWidthU={p.penWidth as number}
            xHeightU={(p.xHeight as number) * CAP}
            onEditingChange={(on) => { setEditing(on); onEditingChange?.(on); }}
            penCaughtUp={penRest}
            insertsAbove={typeof session.insertsAbove === 'function' ? session.insertsAbove : undefined}
            pencil={pencil}
          >
            <LiveSheets
              live={live}
              pxPerMm={pxPerMm}
              gapPx={SHEET_GAP}
              ink={ink}
              inkKey={eff.inkKey}
              extras={extras}
              // each note is drawn as it is (one opened from the library isn't written out again), and so is a new writer
              handKey={[note.id, state.seed, state.style, look.pen, look.penSize, look.paper, look.size, look.ink].join(':')}
              hold={0}
              trail={session.trail}
              penRef={drawnPen}
              wetMs={session.wetMs}
              onPenRest={setPenRest}
              writeOut={writeOut}
              // (no `dim`: letters the pen hovers over to cross out stay as they are; the caret's dashed red line
              // shows where the strike will go)
              ghost={ghost}
              ghostLook={GHOST_LOOK}
              thought={THOUGHT}
            />
            <CheckBoxes
              checks={typeof session.checks === 'function' ? session.checks() : []}
              mmPerU={1 / live.unitsPerMm}
              pxPerMm={pxPerMm}
              sheetPx={live.paper.h * pxPerMm + SHEET_GAP}
              onToggle={(line) => { if (sessionRef.current.toggleCheck(line)) { onTypedRef.current(); sync(); } }}
            />
          </PaperEditor>
        )}
        <StartHint show={text === ''} tap={coarse && !editing} />
        <MarginNote note={hints.note} className={noteStyle ? 'wr-note' : 'wr-note wr-note-low'} style={noteStyle} />
      </div>
    </div>
  );
});

/** A checklist's boxes, clickable: the pen goes back and ticks one (or, ticked in ink, scribbles the tick out). */
function CheckBoxes({ checks, mmPerU, pxPerMm, sheetPx, onToggle }: {
  checks: { line: number; checked: boolean; sheet: number; box: [number, number, number, number] }[];
  mmPerU: number; pxPerMm: number; sheetPx: number; onToggle: (line: number) => void;
}) {
  if (!checks.length) return null;
  const k = mmPerU * pxPerMm;
  return (
    <>
      {checks.map((c) => {
        const [x0, y0, x1, y1] = c.box;
        const pad = 6;
        return (
          <button
            key={c.line + ':' + c.sheet}
            type="button"
            className="wr-check"
            aria-pressed={c.checked}
            aria-label={c.checked ? 'Untick' : 'Tick'}
            style={{ left: x0 * k - pad, top: c.sheet * sheetPx + y0 * k - pad, width: (x1 - x0) * k + pad * 2, height: (y1 - y0) * k + pad * 2 }}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onClick={(e) => { e.stopPropagation(); onToggle(c.line); }}
          />
        );
      })}
    </>
  );
}
