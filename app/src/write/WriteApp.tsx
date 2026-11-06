// The writing page (/write): a sheet of paper and a pen, nothing else. Typing behaves like ink (lib/ink.ts):
// the pen trails the keys, so what it hasn't reached yet deletes cleanly; once it's written, Backspace crosses
// it out, and pressing again (or holding it) crosses it out harder: a heavier strike, a scribble, then inked
// out (engine again()). ⌘B goes over the words again, ⌘U underlines them, and Undo lifts only wet ink; on a dry
// crossing-out it writes *stet* in the margin, with dots under the word, and the word counts again.
// Nothing is ever deleted. Not linked from the site yet: a place to try what writing on a computer could feel like.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CAP } from '@engine';
import { toast } from 'sonner';
import { PaperEditor, type FormatCommand, type PaperEditorApi } from '@/components/PaperEditor';
import { LiveSheets } from '@/components/LiveSheets';
import { Toaster } from '@/components/ui/sonner';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { UndoHistory, type Edit } from '@/lib/edits';
import { InkSession, decodeInk, encodeInk, inkExtras, inkGeometry, inkLive, inkOpts, newInkDoc, undoInk, type InkDoc } from '@/lib/ink';
import { pageSetup } from '@/lib/live';
import { getPaper } from '@/lib/papers';
import { inkColor } from '@/lib/inks';
import { effective, effectiveHand } from '@/lib/params';
import { handFor } from '@/lib/request';
import { handOpts } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import { APP_NAME, withLogo } from '@/lib/brand';
import { Wordmark } from '@/components/Wordmark';
import { FilePlus } from 'lucide-react';
import { Shuffle } from 'lucide-react';
import { SheetPile } from './SheetPile';
import { PILE_MAX, blankSheet, isBlank, keep, newId, pickLook, readKept, stateOf, type Look, type Sheet } from './sheets';

/** the sheet's largest size (px per mm), as on the desk */
const MAX_PX_PER_MM = 3.9;
const SHEET_GAP = 24;
/** a held Backspace on a struck word: one more pass this often, about as long as the hand takes to draw one (a
 * faster key would run ahead of the pen and leave it scribbling seconds after the key is let go) */
const AGAIN_EVERY = 700;

/** A change of sheets, as the sheets themselves moving (View Transitions: each sheet is named by its id, so the one
 * on the desk shrinks down into the pile and a sheet from the pile grows back up). Instant without the API or with
 * reduced motion. */
function moveSheets(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { change(); return; }
  doc.startViewTransition(() => flushSync(change));
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function WriteApp() {
  const [kept0] = useState(readKept);
  // the sheet on the desk (its writer; its ink lives in the session) and the pile of earlier ones, newest first
  const [cur, setCur] = useState<{ id: string; look: Look }>(() => { const c = kept0?.cur ?? blankSheet(pickLook()); return { id: c.id, look: c.look }; });
  const [pile, setPile] = useState<Sheet[]>(() => kept0?.pile ?? []);
  const look = cur.look;
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
  const docFor = useRef<{ id: string; doc: InkDoc } | null>(null);
  const session = useMemo(() => {
    const kept = kept0?.cur.id === cur.id ? kept0.cur.ink : null;
    const doc = docFor.current?.id === cur.id ? docFor.current.doc : decodeInk(kept) ?? newInkDoc(look.seed, look.style);
    const s = new InkSession(p, doc, layout, coarse);
    docFor.current = { id: cur.id, doc: s.doc };
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, layout, coarse, cur.id]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const undoHistory = useMemo(() => new UndoHistory(), [session]);
  const [tick, setTick] = useState(0);
  const [used, setUsed] = useState(() => !!kept0?.cur.ink || !!kept0?.pile.length);

  // kept as you go (what the pen has written; the rest is written down when you leave)
  const curRef = useRef(cur);
  curRef.current = cur;
  const pileRef = useRef(pile);
  pileRef.current = pile;
  /** the desk as it is now, as kept (the pen's unwritten tail is written first only when leaving) */
  const deskNow = (): Sheet => {
    const doc = sessionRef.current.doc;
    return { id: curRef.current.id, look: curRef.current.look, ink: doc.log.length ? encodeInk(doc) : null, at: Date.now() };
  };
  const saveTimer = useRef(0);
  const keptOk = useRef(true);
  /** kept; if the browser won't (private mode, storage full), said once */
  const keepDesk = () => {
    const ok = keep({ v: 2, cur: deskNow(), pile: pileRef.current });
    if (!ok && keptOk.current) toast('This browser isn’t keeping your sheets', { id: 'not-kept', description: 'They’ll be gone when you close the page.', duration: 8000 });
    keptOk.current = ok;
  };
  const saveNow = () => { window.clearTimeout(saveTimer.current); keepDesk(); };
  const save = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(keepDesk, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sync = useCallback(() => { setTick((n) => n + 1); save(); }, [save]);
  // a sheet moved (new, back from the pile, thrown away) or a new writer: kept at once, once the page shows it
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) { settled.current = true; return; }
    saveNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pile, cur]);
  useEffect(() => {
    const leave = () => {
      const s = sessionRef.current;
      if (s.waiting) s.flush();
      keep({ v: 2, cur: deskNow(), pile: pileRef.current });
    };
    const hidden = () => { if (document.visibilityState === 'hidden') leave(); };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', hidden); };
  }, []);

  // the pen catches up with the typing: the drawn pen (LiveSheets) is the clock, the typing handed to it a word at a time
  const drawnPen = useRef<{ at(now: number): { letters: number } } | null>(null);
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (s.waiting && s.step(dt, false, drawnPen.current?.at(now / 1000).letters)) sync();
    }, 130);
    return () => window.clearInterval(id);
  }, [session, sync]);

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
  // writing: the pile steps back for a moment after each key
  // the pile steps back to its edges on the first key, and comes back when the pointer moves, the letter is left, or
  // Esc (never on a timer: it mustn't bob up while you pause to think)
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState(false);
  const typed = useCallback(() => setWriting(true), []);
  useEffect(() => {
    if (!writing) return;
    let x = -1, y = -1;
    const moved = (e: PointerEvent) => {
      if (x < 0) { x = e.clientX; y = e.clientY; return; }
      if (Math.hypot(e.clientX - x, e.clientY - y) > 6) setWriting(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setWriting(false); };
    window.addEventListener('pointermove', moved);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointermove', moved); window.removeEventListener('keydown', esc); };
  }, [writing]);
  useEffect(() => { if (!editing) setWriting(false); }, [editing]);
  // the pile open (its sheets in a column); opening and closing move the sheets themselves
  const [pileOpen, setPileOpenNow] = useState(false);
  const setPileOpen = useCallback((o: boolean) => moveSheets(() => setPileOpenNow(o)), []);
  // said aloud to screen readers: a sheet set aside, brought back, thrown away
  const [said, say] = useState('');
  const onEdit = useCallback((e: Edit) => {
    const s = sessionRef.current;
    setUsed(true);
    if (e.kind === 'undo') {
      // the browser's own undo (a menu, a shake): the same as ⌘Z
      onHistoryRef.current('undo');
      return;
    }
    const before = s.text();
    typed();
    s.edit(e);
    undoHistory.record(before, s.text(), e);
    sync();
  }, [undoHistory, sync]);

  // Undo takes back what the pen hasn't written yet, and lifts wet ink (the last 3 s); dry ink stays, but a word crossed
  // out (and crossed out harder) is let stand: stet (lib/ink.ts)
  const onHistory = useCallback((dir: 'undo' | 'redo') => {
    const s = sessionRef.current;
    const cur = s.text();
    // a mark just made (crossed out again, an underline, a word gone over): lift it while it's wet
    const lastEv = s.doc.log[s.doc.log.length - 1] as { t?: string; why?: string; kind?: string } | undefined;
    const markOnTop = !!lastEv && ((lastEv.t === 'strike' && lastEv.why === 'again') || lastEv.t === 'underline' || (lastEv.t === 'pen' && lastEv.kind === 'retrace'));
    if (dir === 'undo' && !s.waiting && markOnTop) {
      // (an underline or words gone over again: every run the command marked, together)
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
    // redo: the step written again as it was made (typed, or deleted: struck); never as autocorrect's whole-word
    // replacement, which struck the word next to it. Undo: unwritten typing taken back, wet ink lifted (lib/ink.ts)
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
    if (s.format(cmd === 'underline' ? 'underline' : 'press', from, to)) {
      sync();
      // the marked words stand clear of the selection's tint, the caret after them
      requestAnimationFrame(() => editor.current?.setSelection(to));
    }
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
      saveNow();
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
    docFor.current = { id: cur.id, doc: s.doc };
    setCur({ id: cur.id, look: pickLook(look.seed) });
    // back to writing on a computer; on a phone the keyboard waits for the next tap
    if (!coarse) requestAnimationFrame(() => editor.current?.focus());
  };
  /** the sheet on the desk goes down onto the pile; a fresh one, by the same writer, takes its place */
  const newSheet = () => {
    const s = sessionRef.current;
    if (s.waiting) s.flush();
    if (!s.doc.log.length) return;
    // a full pile never drops its oldest sheet quietly: it asks for room first
    if (pile.length >= PILE_MAX) {
      toast('The pile is full', {
        id: 'pile-full',
        description: `It keeps ${PILE_MAX} sheets. Throw an old one away to start a new one.`,
        action: { label: 'Open the pile', onClick: () => setPileOpen(true) },
      });
      return;
    }
    const down = deskNow();
    const next = { id: newId(), look };
    moveSheets(() => {
      setPile((p) => [down, ...p]);
      setCur(next);
    });
    say('Sheet set aside. A fresh sheet is on the desk.');
    undoHistory.clear();
    // back to writing on a computer; on a phone the keyboard waits for the next tap
    if (!coarse) requestAnimationFrame(() => editor.current?.focus());
  };
  /** a sheet from the pile comes back up to the desk; the one there (if anything's on it) goes down in its place */
  const bringBack = (id: string) => {
    const picked = pile.find((x) => x.id === id);
    if (!picked) return;
    const s = sessionRef.current;
    if (s.waiting) s.flush();
    const down = deskNow();
    const rest = pile.filter((x) => x.id !== id);
    docFor.current = { id: picked.id, doc: decodeInk(picked.ink) ?? newInkDoc(picked.look.seed, picked.look.style) };
    moveSheets(() => {
      setPile(isBlank(down) ? rest : [down, ...rest]);
      setCur({ id: picked.id, look: picked.look });
      setPileOpenNow(false);
    });
    say('Sheet brought back to the desk.');
    // back to writing on a computer; on a phone the keyboard waits for the next tap
    if (!coarse) requestAnimationFrame(() => editor.current?.focus());
  };
  /** thrown away, with a moment to take it back */
  const throwAway = (id: string) => {
    const at = pile.findIndex((x) => x.id === id);
    if (at < 0) return;
    const gone = pile[at];
    setPile((p) => p.filter((x) => x.id !== id));
    say('Sheet thrown away.');
    toast('Sheet thrown away', {
      id: 'thrown',
      duration: 6000,
      action: { label: 'Undo', onClick: () => { setPile((p) => [...p.slice(0, at), gone, ...p.slice(at)]); } },
    });
  };
  const mod = isMac() ? '⌘' : 'Ctrl+';

  return (
    <div
      className="write-page"
      // a phone won't open its keyboard for a page on its own, only for a tap: any tap on the desk opens it, at the
      // end of what's written (a tap on the sheet itself places the caret where it lands, as everywhere)
      onClick={(e) => {
        if (!coarse) return;
        const t = e.target as HTMLElement;
        if (t.closest('[data-paper], button, a, input, textarea, select, [role="dialog"], [data-sonner-toaster], .write-pile, .write-pile-scrim')) return;
        const at = text.length;
        editor.current?.setSelection(at);
      }}
    >
      <header className="write-top">
        <a href={withLogo('/')} aria-label={`${APP_NAME}: home`} className="write-home"><Wordmark /></a>
        <div className="write-tools">
          <span className="write-writer" title="The writer of this page">{name}</span>
          {/* a new sheet: words on a computer, a page with a plus on a phone */}
          <button type="button" className="write-new" onClick={newSheet} disabled={!session.doc.log.length} aria-label="New sheet" title="New sheet">
            <FilePlus aria-hidden />
            <span className="write-new-word">New sheet</span>
          </button>
          <button type="button" className="write-cta" onClick={changeWriter}>
            <Shuffle aria-hidden />
            Change writer
          </button>
        </div>
      </header>
      <main className="write-desk" ref={deskRef} onKeyDownCapture={onKeyDownCapture} onKeyUpCapture={onKeyUpCapture}>
        {/* named by the sheet's id: a new sheet or one from the pile moves as itself (moveSheets) */}
        <div style={{ viewTransitionName: `sheet-${cur.id}` }}>
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
            onEditingChange={setEditing}
          >
            <LiveSheets
              live={live}
              pxPerMm={pxPerMm}
              gapPx={SHEET_GAP}
              ink={ink}
              inkKey={eff.inkKey}
              extras={extras}
              // each sheet is drawn as it is (one from the pile isn't written out again), and so is a new writer
              handKey={cur.id + ':' + state.seed + ':' + state.style}
              hold={0}
              trail={session.trail}
              penRef={drawnPen}
              dim={session.pendingKeys}
            />
          </PaperEditor>
        )}
        </div>
      </main>
      <SheetPile
        sheets={pile}
        open={pileOpen}
        setOpen={setPileOpen}
        room={Math.max(160, Math.min(deskW, typeof window !== 'undefined' ? window.innerWidth - 32 : deskW))}
        tucked={writing}
        hidden={coarse && editing}
        onBring={bringBack}
        onThrow={throwAway}
      />
      <div className="sr-only" aria-live="polite">{said}</div>
      {coarse && !used && <p className="write-keys write-tap" aria-hidden>Tap anywhere to write</p>}
      {!coarse && (
        <p className="write-keys" data-used={used || undefined} aria-hidden>
          <span><kbd>⌫</kbd> crosses out</span>
          <span>keep pressing to scribble it out</span>
          <span><kbd>{mod}B</kbd> goes over it</span>
          <span><kbd>{mod}U</kbd> underlines</span>
        </p>
      )}
      {/* the bottom of the desk is the pile's */}
      <Toaster position="top-center" />
    </div>
  );
}
