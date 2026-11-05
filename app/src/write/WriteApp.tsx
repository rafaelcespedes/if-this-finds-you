// The writing page (/write): a sheet of paper and a pen, nothing else. Typing behaves like ink (lib/ink.ts):
// the pen trails the keys, so what it hasn't reached yet deletes cleanly; once it's written, Backspace crosses
// it out, and pressing again (or holding it) crosses it out harder: a heavier strike, a scribble, then inked
// out (engine again()). ⌘B goes over the words again, ⌘U underlines them, and Undo lifts only wet ink.
// Nothing is ever deleted. Not linked from the site yet: a place to try what writing on a computer could feel like.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAP } from '@engine';
import { toast } from 'sonner';
import { PaperEditor, type FormatCommand, type PaperEditorApi } from '@/components/PaperEditor';
import { LiveSheets } from '@/components/LiveSheets';
import { Toaster } from '@/components/ui/sonner';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { UndoHistory, diffEdit, type Edit } from '@/lib/edits';
import { InkSession, decodeInk, encodeInk, inkExtras, inkGeometry, inkLive, inkOpts, newInkDoc, type InkDoc } from '@/lib/ink';
import { pageSetup } from '@/lib/live';
import { getPaper, type PaperId } from '@/lib/papers';
import { inkColor } from '@/lib/inks';
import { effective, effectiveHand } from '@/lib/params';
import { handFor } from '@/lib/request';
import { handOpts } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import { APP_NAME } from '@/lib/brand';
import type { NoteState } from '@/lib/state';
import LOOKS from '@/lib/first-looks.json';

/** the sheet's largest size (px per mm), as on the desk */
const MAX_PX_PER_MM = 3.9;
const SHEET_GAP = 24;
/** a held Backspace on a struck word: one more pass this often (the pen needs a moment to scribble) */
const AGAIN_EVERY = 280;
const KEY = 'seedhand:write';

type Look = { seed: string; style: string; pen: string; penSize: string; ink: string; paper: string; size: number; offsets: Record<string, number> };
/** the hands the site opens on (the curated first looks), less pencil: pencil doesn't write in ink */
const WRITABLE = (LOOKS as Look[]).filter((l) => l.pen !== 'pencil');
const pickLook = (not?: string) => {
  const pool = WRITABLE.filter((l) => l.seed !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};

/** what this page keeps between visits (its own key: the desk's drafts are separate) */
interface Kept { v: 1; look: Look; ink: string | null }
function readKept(): Kept | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    return o && o.v === 1 && o.look?.seed ? o : null;
  } catch { return null; }
}
function keep(k: Kept) {
  try { localStorage.setItem(KEY, JSON.stringify(k)); } catch { /* private mode: the page still works */ }
}

function stateOf(l: Look): NoteState {
  return {
    seed: l.seed, style: l.style, offsets: l.offsets, pen: l.pen, penSize: l.penSize as NoteState['penSize'], ink: l.ink,
    size: l.size, paper: l.paper as PaperId, occasion: null, amount: 1, text: '', sample: null, mode: 'ink', inkLog: null,
    replyTo: null, marks: [], signed: false, reader: false, neatOnly: true,
  };
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function WriteApp() {
  const [kept0] = useState(readKept);
  const [look, setLook] = useState<Look>(() => kept0?.look ?? pickLook());
  const state = useMemo(() => stateOf(look), [look]);
  const natural = useMemo(() => handFor(state.seed, state.style, handOpts(state)), [state]);
  const eff = useMemo(() => effective(natural, state), [natural, state]);
  const p = useMemo(() => effectiveHand(natural, eff), [natural, eff]);
  const paper = getPaper(state.paper);
  const ink = inkColor(state.ink);
  const name = useMemo(() => writerName(state.seed), [state.seed]);
  const coarse = useMediaQuery('(pointer: coarse)');
  const layout = useMemo(() => inkOpts(p, paper, eff.size, eff.lineSpacing).layout, [p, paper, eff.size, eff.lineSpacing]);
  const startCaret = useMemo(() => {
    const { opts } = pageSetup(p, paper, eff.size, eff.lineSpacing);
    return { sheet: 0, x: opts.marginLeft as number, y: opts.firstBaseline as number, line: 0 };
  }, [p, paper, eff.size, eff.lineSpacing]);

  // ---------- the ink ----------
  // one session per hand: a new hand writes the same log again in its own writing
  const docRef = useRef<InkDoc | null>(null);
  const session = useMemo(() => {
    const doc = docRef.current ?? decodeInk(kept0?.ink) ?? newInkDoc(look.seed, look.style);
    const s = new InkSession(p, doc, layout, coarse);
    docRef.current = s.doc;
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, layout, coarse]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const undoHistory = useMemo(() => new UndoHistory(), [session]);
  const [tick, setTick] = useState(0);
  const [used, setUsed] = useState(() => !!kept0?.ink);

  // kept as you go (what the pen has written; the rest is written down when you leave)
  const lookRef = useRef(look);
  lookRef.current = look;
  const saveTimer = useRef(0);
  const save = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => keep({ v: 1, look: lookRef.current, ink: encodeInk(sessionRef.current.doc) }), 400);
  }, []);
  const sync = useCallback(() => { setTick((n) => n + 1); save(); }, [save]);
  useEffect(() => {
    const leave = () => {
      const s = sessionRef.current;
      if (s.waiting) s.flush();
      keep({ v: 1, look: lookRef.current, ink: encodeInk(s.doc) });
    };
    const hidden = () => { if (document.visibilityState === 'hidden') leave(); };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', hidden); };
  }, []);

  // the pen catches up with the typing, at handwriting speed
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (s.waiting && s.step(dt)) sync();
    }, 130);
    return () => window.clearInterval(id);
  }, [session, sync]);

  const { live, extras, geometry, text, hovering } = useMemo(() => {
    const draft = session.draft();
    const live = inkLive(p, session.page, paper, eff.size, eff.lineSpacing, draft);
    const extras = inkExtras(live, { draft, signed: false, writerName: '' });
    const text = session.text();
    return { live, extras, geometry: inkGeometry(live, p, draft, text), text, hovering: session.hovering };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick, p, paper, eff.size, eff.lineSpacing]);

  // ---------- typing ----------
  const editor = useRef<PaperEditorApi>(null);
  const onEdit = useCallback((e: Edit) => {
    const s = sessionRef.current;
    setUsed(true);
    if (e.kind === 'undo') {
      // the browser's own undo (a menu, a shake): the same as ⌘Z
      onHistoryRef.current('undo');
      return;
    }
    const before = s.text();
    s.edit(e);
    undoHistory.record(before, s.text(), e);
    sync();
  }, [undoHistory, sync]);

  // Undo takes back what the pen hasn't written yet, and lifts wet ink (the last 3 s); dry ink stays
  const onHistory = useCallback((dir: 'undo' | 'redo') => {
    const s = sessionRef.current;
    const cur = s.text();
    // a mark just made (crossed out again, an underline, a word gone over): lift it while it's wet
    const lastEv = s.doc.log[s.doc.log.length - 1] as { t?: string; why?: string; kind?: string } | undefined;
    const markOnTop = !!lastEv && ((lastEv.t === 'strike' && lastEv.why === 'again') || lastEv.t === 'underline' || (lastEv.t === 'pen' && lastEv.kind === 'retrace'));
    if (dir === 'undo' && !s.waiting && markOnTop) {
      if (s.undo()) { sync(); return; }
    }
    const e = dir === 'undo' ? undoHistory.undo(cur) : undoHistory.redo(cur);
    if (!e) {
      if (dir === 'undo' && !s.waiting && s.doc.log.length) {
        if (s.undo()) { undoHistory.clear(); sync(); return; }
        toast('The ink is dry', { id: 'ink-dry', description: 'Cross it out instead.' });
      }
      return;
    }
    const want = cur.slice(0, e.at) + e.ins + cur.slice(e.at + e.del);
    if (want.length < cur.length && !s.waiting) {
      let lifted = 0;
      while (s.text().length > want.length && lifted < 2000 && s.undo()) lifted++;
      if (!lifted) {
        undoHistory.keep(dir);
        toast('The ink is dry', { id: 'ink-dry', description: 'Cross it out instead.' });
        return;
      }
      const fix = diffEdit(s.text(), want, 'type', 'paper');
      if (fix) s.edit(fix);
    } else {
      s.edit({ ...e, kind: e.ins ? 'replace' : 'delete' });
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
    if (s.mark(cmd === 'underline' ? 'underline' : 'retrace', from, to)) sync();
  }, [sync]);

  // Backspace or Delete at a crossed-out word: crossed out again, harder each time. Held down, it keeps going
  // (one pass every AGAIN_EVERY ms) until the word is inked out, and stops there; a fresh press after that
  // deletes as usual.
  const lastAgain = useRef(0);
  const againHeld = useRef(false);
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    // ⌘S: it's already kept (on this device); say so instead of the browser's save dialog
    if ((isMac() ? e.metaKey : e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const s = sessionRef.current;
      if (s.waiting) { s.flush(); sync(); }
      keep({ v: 1, look: lookRef.current, ink: encodeInk(s.doc) });
      toast('Kept on this device', { id: 'kept', duration: 1600 });
      return;
    }
    if (e.key !== 'Backspace' && e.key !== 'Delete') { againHeld.current = false; return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return;
    if ((e.target as HTMLElement).tagName !== 'TEXTAREA') return;
    const [a, b] = editor.current?.selection() ?? [0, 0];
    if (a !== b) return;
    const now = performance.now();
    if (e.repeat && againHeld.current && now - lastAgain.current < AGAIN_EVERY) { e.preventDefault(); e.stopPropagation(); return; }
    const r = sessionRef.current.again(a);
    if (!r) { againHeld.current = false; return; }
    if (r.max && !e.repeat) { againHeld.current = false; return; } // inked out already: this press deletes as usual
    e.preventDefault();
    e.stopPropagation();
    if (r.max) return; // held past inked out: it stays there
    againHeld.current = true;
    lastAgain.current = now;
    setUsed(true);
    sync();
  };
  const onKeyUpCapture = (e: React.KeyboardEvent) => { if (e.key === 'Backspace' || e.key === 'Delete') againHeld.current = false; };

  // ---------- the page ----------
  const deskRef = useRef<HTMLDivElement>(null);
  const deskW = useElementWidth(deskRef);
  const pxPerMm = deskW > 0 ? Math.min(MAX_PX_PER_MM, deskW / paper.w) : 0;
  // on a computer the pen is on the paper from the start; on a phone, a tap brings the keyboard up
  useEffect(() => {
    if (coarse || !pxPerMm) return;
    editor.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coarse, !!pxPerMm]);

  const changeWriter = () => {
    const s = sessionRef.current;
    if (s.waiting) s.flush();
    docRef.current = s.doc;
    const next = pickLook(look.seed);
    setLook(next);
    keep({ v: 1, look: next, ink: encodeInk(s.doc) });
    requestAnimationFrame(() => editor.current?.focus());
  };
  const freshSheet = () => {
    const s = sessionRef.current;
    s.freshSheet();
    undoHistory.clear();
    sync();
    requestAnimationFrame(() => editor.current?.focus());
  };
  const mod = isMac() ? '⌘' : 'Ctrl+';

  return (
    <div className="write-page">
      <header className="write-top">
        <a href="/" className="write-home">{APP_NAME}</a>
        <div className="write-tools">
          <span className="write-writer" title="The writer of this page">{name}</span>
          <button type="button" className="write-tool" onClick={changeWriter}>Change writer</button>
          <button type="button" className="write-tool" onClick={freshSheet} disabled={!text.trim() && !session.doc.log.length}>Fresh sheet</button>
        </div>
      </header>
      <main className="write-desk" ref={deskRef} onKeyDownCapture={onKeyDownCapture} onKeyUpCapture={onKeyUpCapture}>
        {pxPerMm > 0 && (
          <PaperEditor
            ref={editor}
            text={text}
            hovering={hovering}
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
          >
            <LiveSheets
              live={live}
              pxPerMm={pxPerMm}
              gapPx={SHEET_GAP}
              ink={ink}
              inkKey={eff.inkKey}
              extras={extras}
              handKey={state.seed + ':' + state.style}
              hold={0}
            />
          </PaperEditor>
        )}
      </main>
      {!coarse && (
        <p className="write-keys" data-used={used || undefined} aria-hidden>
          <span><kbd>⌫</kbd> crosses out</span>
          <span>keep pressing to scribble it out</span>
          <span><kbd>{mod}B</kbd> goes over it</span>
          <span><kbd>{mod}U</kbd> underlines</span>
        </p>
      )}
      <Toaster position="bottom-center" />
    </div>
  );
}
