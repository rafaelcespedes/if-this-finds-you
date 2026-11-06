// The note on the desk: one sheet of paper and a pen. Typing behaves like ink (lib/ink.ts): the pen trails the keys,
// so what it hasn't reached yet deletes cleanly; once it's written, Backspace crosses it out, and pressing again (or
// holding it, on any keyboard: hold.ts) crosses it out harder. ⌘B goes over the words again, ⌘U underlines them;
// Undo lifts wet ink, and on a dry crossing-out writes *stet* in the margin, and the word counts again. Nothing is
// ever deleted.
//
// The page around it (the library, the toolbar, the panels) is WriteApp's; this is only the paper.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CAP } from '@engine';
import { toast } from 'sonner';
import { PaperEditor, type FormatCommand, type PaperEditorApi } from '@/components/PaperEditor';
import { LiveSheets } from '@/components/LiveSheets';
import { useElementWidth } from '@/hooks/useElementWidth';
import { UndoHistory, type Edit } from '@/lib/edits';
import { InkSession, decodeInk, encodeInk, inkExtras, inkGeometry, inkLive, inkOpts, newInkDoc, undoInk } from '@/lib/ink';
import { pageSetup } from '@/lib/live';
import { renderLiveNote } from '@/lib/actions';
import { getPaper } from '@/lib/papers';
import { inkColor } from '@/lib/inks';
import { effective, effectiveHand } from '@/lib/params';
import { handFor } from '@/lib/request';
import { handOpts } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import { BackspaceHold, type HoldAct } from './hold';
import { stateOf, type Note } from './notes';

/** the sheet's largest size (px per mm) */
const MAX_PX_PER_MM = 3.9;
const SHEET_GAP = 24;
/** how often the pen is handed what's been typed (the drawn pen is the clock) */
const PEN_TICK = 130;

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
}

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
  /** room to leave above the sheet for the toolbar (px) */
  topRoom?: number;
}

export const Desk = forwardRef<DeskApi, Props>(function Desk({ note, coarse, onChange, onTyped, onEditingChange, onSay, topRoom = 0 }, ref) {
  const look = note.look;
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

  const { live, extras, geometry, text, hovering } = useMemo(() => {
    const draft = session.draft();
    const live = inkLive(p, session.page, paper, eff.size, eff.lineSpacing, draft);
    const extras = inkExtras(live, { draft, signed: false, writerName: '' });
    const text = session.text();
    return { live, extras, geometry: inkGeometry(live, p, session), text, hovering: session.hovering };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick, p, paper, eff.size, eff.lineSpacing]);

  // ---------- typing ----------
  const editor = useRef<PaperEditorApi>(null);
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
    s.edit(e);
    undoHistory.record(before, s.text(), e);
    sync();
  }, [undoHistory, sync, hold]);

  // Undo takes back what the pen hasn't written yet, and lifts wet ink; dry ink stays, but a word crossed out (and
  // crossed out harder) is let stand: stet (lib/ink.ts)
  const onHistory = useCallback((dir: 'undo' | 'redo') => {
    const s = sessionRef.current;
    const cur = s.text();
    // a mark just made (crossed out again, an underline, a word gone over): lift it while it's wet
    const lastEv = s.doc.log[s.doc.log.length - 1] as { t?: string; why?: string; kind?: string } | undefined;
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
        toast('The ink is dry', { id: 'ink-dry', description: 'Cross it out instead.' });
      }
      return;
    }
    const want = cur.slice(0, e.at) + e.ins + cur.slice(e.at + e.del);
    if (dir === 'redo') s.edit({ ...e, kind: e.ins ? 'type' : 'delete' });
    else if (!undoInk(s, e, { stet: true })) {
      undoHistory.keep(dir);
      sync();
      toast('The ink is dry', { id: 'ink-dry', description: 'Cross it out instead.' });
      return;
    }
    if (s.text() !== want) undoHistory.clear();
    sync();
    requestAnimationFrame(() => editor.current?.setSelection(e.at + e.ins.length));
  }, [undoHistory, sync]);
  const onHistoryRef = useRef(onHistory);
  onHistoryRef.current = onHistory;

  // ⌘B: the words gone over again, heavier. ⌘U: underlined by hand. ⌘↩: a P.S.
  const onFormat = useCallback((cmd: FormatCommand, from: number, to: number) => {
    const s = sessionRef.current;
    if (cmd === 'ps') { s.postScript(); sync(); return; }
    if (from === to) {
      toast(cmd === 'underline' ? 'Select the words to underline' : 'Select the words to go over', { id: 'format-none', duration: 2400 });
      return;
    }
    if (s.format(cmd === 'underline' ? 'underline' : 'press', from, to)) {
      onTypedRef.current();
      sync();
      // the marked words stand clear of the selection's tint, the caret after them
      requestAnimationFrame(() => editor.current?.setSelection(to));
    }
  }, [sync]);

  // a phone's deletions as they come (keydown doesn't name them on Android, and iOS deletes whole words without one)
  const againAt = (at: number) => sessionRef.current.again(at);
  const textSel = (t: EventTarget | null) => ((t as HTMLElement | null)?.tagName === 'TEXTAREA' ? editor.current?.selection() ?? null : null);
  const held = (act: HoldAct) => {
    if (act === 'again') { onTypedRef.current(); sync(); }
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
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (held(hold.key(e.nativeEvent, textSel(e.target), againAt))) { e.preventDefault(); e.stopPropagation(); }
  };
  const onKeyUpCapture = (e: React.KeyboardEvent) => hold.keyUp(e.nativeEvent);

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
    image: async () => {
      const s = sessionRef.current;
      if (s.waiting) { s.flush(); setTick((n) => n + 1); }
      const { live: l, extras: x, pxPerMm: k } = shown.current;
      return (await renderLiveNote(l, x, eff.inkKey ?? undefined, ink, k || 2)).blob;
    },
  }), [onFormat, onEdit, eff.inkKey, ink]);

  // said once the pen settles on a change (the words themselves are in the textarea)
  const sayRef = useRef(onSay);
  sayRef.current = onSay;

  return (
    <div
      className="wr-desk"
      ref={deskRef}
      style={{ paddingTop: topRoom }}
      onKeyDownCapture={onKeyDownCapture}
      onKeyUpCapture={onKeyUpCapture}
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
      <div className="wr-sheet" style={{ viewTransitionName: `sheet-${note.id}` }}>
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
            onEditingChange={onEditingChange}
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
              dim={session.pendingKeys}
            />
          </PaperEditor>
        )}
      </div>
    </div>
  );
});
