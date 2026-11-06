// The writing app (/write): write with a generated hand the way you'd write with a font in Notes. Each note is a sheet
// in one writer's hand (Desk.tsx), kept in this browser (notes.ts); the library lists them all (Library.tsx); the
// writer is the font menu (WriterPanel.tsx). Typing behaves like ink: nothing written is ever erased.
//
// The page is the app: everything that isn't the paper floats over the desk, never over the sheet, and steps back
// while you write (a pointer move or Esc brings it back; ⌘. keeps it away).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { DropdownMenu } from 'radix-ui';
import { ChevronLeft, Copy, Ellipsis, EyeOff, FileText, Image as ImageIcon, PanelLeft, Pin, PinOff, Shuffle, SquarePen, Trash2, Undo2, WandSparkles } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { copyText, saveNote } from '@/lib/actions';
import { inkColor } from '@/lib/inks';
import { effective, effectiveHand } from '@/lib/params';
import { handFor } from '@/lib/request';
import { handOpts } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import { Desk, type DeskApi } from './Desk';
import { Library } from './Library';
import { WriterName, WriterPanel } from './WriterPanel';
import {
  MIGRATED_KEY, blankNote, deleteNote, getNote, isBlank, lastOpen, listen, noteText, oldNotes, pickLook, putNote,
  readNotes, rememberOpen, stateOf, titleOf, wordCount, type Look, type Note,
} from './notes';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac() ? '⌘' : 'Ctrl+';
/** the note being written, kept here too as the page goes (the database can't always finish in time) */
const PENDING_KEY = 'seedhand:write:pending';
const LIB_KEY = 'seedhand:write:library';

/** A change of notes, as the sheets themselves moving (View Transitions: each sheet is named by its note's id, so the
 * one on the desk shrinks into its row in the library and one opened from it grows back up). Instant without the
 * API or with reduced motion. */
function moveSheets(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { change(); return; }
  doc.startViewTransition(() => flushSync(change));
}

export function WriteApp() {
  const coarse = useMediaQuery('(pointer: coarse)');
  const phone = useMediaQuery('(max-width: 719.98px)');

  // ---------- the notes ----------
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [currentId, setCurrentId] = useState<string>('');
  /** bumped when the open note is replaced from outside (another tab): the desk starts again from it */
  const [rev, setRev] = useState(0);
  const [keptOk, setKeptOk] = useState(true);
  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes ?? [];
  const currentRef = useRef(currentId);
  currentRef.current = currentId;
  const current = useMemo(() => notes?.find((n) => n.id === currentId) ?? null, [notes, currentId]);

  // first: what's kept (and, once, what the first version kept), then the note that was open
  useEffect(() => {
    let off = false;
    (async () => {
      let all = await readNotes();
      const ok = all !== null;
      all = all ?? [];
      try {
        if (ok && !localStorage.getItem(MIGRATED_KEY)) {
          const old = oldNotes().filter((o) => !all!.some((n) => n.id === o.id));
          for (const n of old) await putNote(n);
          all = [...all, ...old];
          localStorage.setItem(MIGRATED_KEY, '1');
        }
        // the note that was being written when the page went, if the database didn't get it in time
        const pend = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null') as Note | null;
        if (pend?.id) {
          const i = all.findIndex((n) => n.id === pend.id);
          if (i < 0 || all[i].at < pend.at) {
            all = i < 0 ? [...all, pend] : all.map((n) => (n.id === pend.id ? pend : n));
            if (ok) await putNote(pend);
          }
          localStorage.removeItem(PENDING_KEY);
        }
      } catch { /* fine: the notes as kept */ }
      if (off) return;
      const want = lastOpen();
      let open = all.find((n) => n.id === want && !n.thrown) ?? [...all].filter((n) => !n.thrown).sort((a, b) => b.at - a.at)[0];
      if (!open) {
        open = blankNote(pickLook());
        all = [...all, open];
      }
      if (!ok) setKeptOk(false);
      setNotes(all);
      setCurrentId(open.id);
    })();
    return () => { off = true; };
  }, []);
  useEffect(() => { if (currentId) rememberOpen(currentId); }, [currentId]);
  useEffect(() => {
    if (!keptOk) toast('This browser isn’t keeping your notes', { id: 'not-kept', description: 'They’ll be gone when you close the page (a private window, or storage that’s full).', duration: 10000 });
  }, [keptOk]);

  const desk = useRef<DeskApi>(null);
  /** the open note has changes the database hasn't got yet */
  const dirty = useRef(false);
  const saveTimer = useRef(0);
  const keep = useCallback(async (n: Note) => {
    if (isBlank(n) && !n.pinned && !n.thrown) return true; // an empty note isn't kept until something's written on it
    const ok = await putNote(n);
    setKeptOk(ok);
    return ok;
  }, []);
  const setAll = useCallback((fn: (all: Note[]) => Note[]) => {
    notesRef.current = fn(notesRef.current);
    setNotes(notesRef.current);
  }, []);
  const patch = useCallback((id: string, fn: (n: Note) => Note) => setAll((all) => all.map((n) => (n.id === id ? fn(n) : n))), [setAll]);
  /** the open note as it is this moment, written down (the pen's unwritten tail first) */
  const settle = useCallback((): Note | null => {
    const n = notesRef.current.find((x) => x.id === currentRef.current);
    if (!n) return null;
    const ink = desk.current?.flush();
    if (ink === undefined || ink === n.ink) return n;
    const now = { ...n, ink, at: Date.now() };
    patch(n.id, () => now);
    return now;
  }, [patch]);
  const saveNow = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const n = notesRef.current.find((x) => x.id === currentRef.current);
    if (!n) return true;
    const ok = await keep(n);
    if (ok) dirty.current = false;
    return ok;
  }, [keep]);

  // every change on the desk: the note's ink (kept in a moment) and its title follow
  const onChange = useCallback((ink: string | null) => {
    const id = currentRef.current;
    const n = notesRef.current.find((x) => x.id === id);
    if (!n || n.ink === ink) return;
    dirty.current = true;
    patch(id, (x) => ({ ...x, ink, at: Date.now() }));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveNow(); }, 400);
  }, [patch, saveNow]);

  // leaving: the pen's tail written down and kept, twice over (the database, and a copy it can't miss)
  useEffect(() => {
    const leave = () => {
      const n = settle();
      if (!n || isBlank(n)) return;
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(n)); } catch { /* fine */ }
      void putNote(n).then((ok) => { if (ok) { try { localStorage.removeItem(PENDING_KEY); } catch { /* fine */ } } });
    };
    const hidden = () => { if (document.visibilityState === 'hidden') leave(); };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', hidden); };
  }, [settle]);

  // another tab kept a note: the library takes it; the open note too, unless it has changes of its own here
  useEffect(() => listen(async (m) => {
    if (m.kind === 'delete') { setAll((all) => all.filter((n) => n.id !== m.id || n.id === currentRef.current)); return; }
    const n = await getNote(m.id);
    if (!n) return;
    const mine = notesRef.current.find((x) => x.id === n.id);
    if (mine && mine.at >= n.at) return;
    if (n.id === currentRef.current && dirty.current) return;
    setAll((all) => (all.some((x) => x.id === n.id) ? all.map((x) => (x.id === n.id ? n : x)) : [...all, n]));
    if (n.id === currentRef.current) setRev((r) => r + 1);
  }), [setAll]);

  // ---------- moving between notes ----------
  /** the note on the desk is put away: kept, or let go if nothing was written on it (as an empty note goes in Notes) */
  const leaveCurrent = () => {
    const n = settle();
    if (!n) return;
    if (isBlank(n) && !n.pinned) {
      setAll((all) => all.filter((x) => x.id !== n.id));
      void deleteNote(n.id);
    } else void keep(n);
    dirty.current = false;
  };
  const [libOpen, setLibOpen] = useState(() => { try { return localStorage.getItem(LIB_KEY) !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(LIB_KEY, libOpen ? '1' : '0'); } catch { /* fine */ } }, [libOpen]);
  const [phoneScreen, setPhoneScreen] = useState<'note' | 'library'>('note');
  const [writing, setWriting] = useState(false);
  const [said, say] = useState('');

  const newNote = (look?: Look) => {
    const n = notesRef.current.find((x) => x.id === currentRef.current);
    if (n && isBlank(n) && !look) { setPhoneScreen('note'); desk.current?.focus(); return n; }
    const next = blankNote(look ?? n?.look ?? pickLook());
    moveSheets(() => {
      leaveCurrent();
      setAll((all) => [...all, next]);
      setCurrentId(next.id);
      setPhoneScreen('note');
    });
    setWriting(false);
    say('A new note.');
    return next;
  };
  const openNote = (id: string) => {
    if (id === currentRef.current) { setPhoneScreen('note'); desk.current?.focus(); return; }
    moveSheets(() => {
      leaveCurrent();
      setCurrentId(id);
      setPhoneScreen('note');
    });
  };
  const restore = (id: string) => {
    const n = notesRef.current.find((x) => x.id === id);
    if (!n) return;
    const back: Note = { ...n, thrown: undefined };
    patch(id, () => back);
    void putNote(back);
    say('Note put back.');
  };
  const throwAway = (id: string) => {
    const n = id === currentRef.current ? settle() : notesRef.current.find((x) => x.id === id);
    if (!n) return;
    const gone: Note = { ...n, thrown: Date.now(), pinned: false };
    const wasOpen = id === currentRef.current;
    const next = wasOpen ? notesRef.current.filter((x) => !x.thrown && x.id !== id).sort((a, b) => b.at - a.at)[0] : null;
    moveSheets(() => {
      patch(id, () => gone);
      if (wasOpen) {
        if (next) setCurrentId(next.id);
        else { const b = blankNote(n.look); setAll((all) => [...all, b]); setCurrentId(b.id); }
      }
    });
    if (!isBlank(n)) void putNote(gone);
    else { setAll((all) => all.filter((x) => x.id !== id)); void deleteNote(id); return; }
    say('Note thrown away.');
    // each note thrown away has its own Undo, so two in a row can both come back
    toast(`“${titleOf(n) || 'Note'}” thrown away`, { id: `thrown-${id}`, duration: 6000, action: { label: 'Undo', onClick: () => restore(id) } });
  };
  const deleteForGood = (id: string) => {
    setAll((all) => all.filter((x) => x.id !== id));
    void deleteNote(id);
  };
  const pin = (id: string, pinned: boolean) => {
    const n = notesRef.current.find((x) => x.id === id);
    if (!n) return;
    const next = { ...n, pinned };
    patch(id, () => next);
    void putNote(next);
  };

  // ---------- the writer, the pen, the paper ----------
  const look = current?.look;
  const hand = useMemo(() => {
    if (!look) return null;
    const s = stateOf(look);
    const natural = handFor(s.seed, s.style, handOpts(s));
    return effectiveHand(natural, effective(natural, s));
  }, [look]);
  const setLook = (change: Partial<Look>) => {
    const n = notesRef.current.find((x) => x.id === currentRef.current);
    if (!n) return;
    settle();
    const next = { ...n, look: { ...n.look, ...change }, at: Date.now() };
    patch(n.id, () => next);
    void keep(next);
  };
  const another = () => {
    const n = notesRef.current.find((x) => x.id === currentRef.current);
    if (!n) return;
    const w = pickLook(n.look.seed);
    setLook({ seed: w.seed, style: w.style, offsets: w.offsets });
    say(`${writerName(w.seed)} is writing now.`);
    if (!coarse) requestAnimationFrame(() => desk.current?.focus());
  };

  // ---------- the note's own actions ----------
  // the fair copy is written out once its desk is up
  const pendingWrite = useRef<{ id: string; text: string } | null>(null);
  const fairCopy = () => {
    const text = desk.current?.text().trim() ?? '';
    if (!text) { toast('Nothing to copy out yet', { id: 'fair-none' }); return; }
    const from = notesRef.current.find((x) => x.id === currentRef.current);
    const n = newNote(from?.look);
    pendingWrite.current = { id: n.id, text };
    toast('A fair copy', { id: 'fair', description: 'The draft is in your notes.', duration: 4000 });
  };
  useEffect(() => {
    const w = pendingWrite.current;
    if (!w || w.id !== currentId) return;
    pendingWrite.current = null;
    const t = window.setTimeout(() => desk.current?.write(w.text), 420);
    return () => window.clearTimeout(t);
  }, [currentId]);
  const copyAll = async () => {
    await copyText(desk.current?.text() ?? '');
    toast('Copied', { id: 'copied', description: 'The words, as they read now.', duration: 2000 });
  };
  const fileName = () => (titleOf(current!) || 'Note').replace(/[\\/:*?"<>|]+/g, '').slice(0, 60);
  const downloadText = () => {
    const blob = new Blob([desk.current?.text() ?? ''], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const downloadImage = async () => {
    try {
      const blob = await desk.current!.image();
      await saveNote(blob, fileName(), coarse);
    } catch (e) {
      toast('The image couldn’t be made', { id: 'img-fail', description: String((e as Error)?.message ?? e) });
    }
  };

  // ---------- the chrome steps back while you write ----------
  const [hideUi, setHideUi] = useState(false);
  const keys = useRef(0);
  const onTyped = useCallback(() => {
    // from the second key: the first may be a stray one
    keys.current += 1;
    if (keys.current >= 2) setWriting(true);
  }, []);
  useEffect(() => {
    if (!writing) { keys.current = 0; return; }
    let x = -1, y = -1;
    const moved = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (x < 0) { x = e.clientX; y = e.clientY; return; }
      if (Math.hypot(e.clientX - x, e.clientY - y) > 6) setWriting(false);
    };
    window.addEventListener('pointermove', moved);
    return () => window.removeEventListener('pointermove', moved);
  }, [writing]);
  const [editing, setEditing] = useState(false);
  const chromeAway = (writing && !coarse) || hideUi;

  // ---------- keys for the whole page ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Escape' && (writing || hideUi)) { setWriting(false); setHideUi(false); return; }
      // ⌘S: it's already kept, on this device; say so (and say so when it isn't)
      if (mod && !e.altKey && k === 's') {
        e.preventDefault();
        settle();
        void saveNow().then((ok) => toast(ok ? 'Kept on this device' : 'Not kept', {
          id: 'kept', duration: ok ? 1600 : 6000,
          description: ok ? undefined : 'This browser isn’t keeping notes. Copy or save what you’ve written.',
        }));
        return;
      }
      if (mod && k === '.' && !e.shiftKey) { e.preventDefault(); setHideUi((h) => !h); return; }
      if (mod && k === '\\') { e.preventDefault(); setLibOpen((o) => !o); return; }
      // a new note (⌘N belongs to the browser): ⌥⌘N
      if (mod && e.altKey && e.code === 'KeyN') { e.preventDefault(); newNote(); return; }
      // a key with nowhere to go (the pen was put down: Tab, a closed menu): back to the paper, so nothing typed is lost
      const a = document.activeElement as HTMLElement | null;
      const free = !a || a === document.body || a.classList.contains('wr-app');
      if (free && !mod && !e.altKey && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter')) desk.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- phones: the keyboard's bar ----------
  const vv = useVisualViewport();
  const kbGap = typeof window !== 'undefined' ? Math.max(0, window.innerHeight - (vv.top + vv.height)) : 0;
  const kbUp = coarse && editing && kbGap > 120;

  const words = useMemo(() => (current ? wordCount(noteText(current)) : 0), [current]);
  const ink = look ? inkColor(look.ink) : 'currentColor';
  const title = current ? titleOf(current) : '';
  const showLib = phone ? phoneScreen === 'library' : libOpen;

  if (!notes || !current || !look || !hand) return <div className="wr-app" data-loading />;

  const focusBack = (e: Event) => { if (!coarse) { e.preventDefault(); desk.current?.focus(); } };

  const writerButton = (
    <Sheet
      title="Writer"
      showTitle={false}
      side="bottom"
      align="end"
      className="wr-pop wr-pop-writer"
      onCloseAutoFocus={focusBack}
      trigger={
        <button type="button" className="wr-writer-chip" style={{ '--chip-ink': ink } as React.CSSProperties} aria-label={`Writer: ${writerName(look.seed)}. Change the writer, pen, ink or paper`} title="Writer, pen and paper">
          <WriterName look={look} color="inherit" emPx={phone ? 16 : 17} />
        </button>
      }
    >
      <WriterPanel look={look} sample={title || 'The quick brown fox'} hand={hand} onLook={setLook} onAnother={another} />
    </Sheet>
  );

  const noteItems = (
    <>
      <DropdownMenu.Item className="wr-menu-item" onSelect={fairCopy}><WandSparkles aria-hidden /> Make a fair copy</DropdownMenu.Item>
      <DropdownMenu.Item className="wr-menu-item" onSelect={() => pin(current.id, !current.pinned)}>
        {current.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {current.pinned ? 'Unpin' : 'Pin'}
      </DropdownMenu.Item>
      <DropdownMenu.Separator className="wr-menu-sep" />
      <DropdownMenu.Item className="wr-menu-item" onSelect={copyAll}><Copy aria-hidden /> Copy the words</DropdownMenu.Item>
      <DropdownMenu.Item className="wr-menu-item" onSelect={downloadImage}><ImageIcon aria-hidden /> Save as an image</DropdownMenu.Item>
      <DropdownMenu.Item className="wr-menu-item" onSelect={downloadText}><FileText aria-hidden /> Save as text</DropdownMenu.Item>
      <DropdownMenu.Separator className="wr-menu-sep" />
      <DropdownMenu.Item className="wr-menu-item" data-danger onSelect={() => throwAway(current.id)}><Trash2 aria-hidden /> Throw away</DropdownMenu.Item>
    </>
  );
  const menu = (trigger: React.ReactElement, items: React.ReactNode, align: 'start' | 'end') => (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="wr-menu" align={align} sideOffset={8} collisionPadding={12} onCloseAutoFocus={focusBack}>
          {items}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
  const moreItems = (
    <>
      {!coarse && <DropdownMenu.Item className="wr-menu-item" onSelect={() => setHideUi(true)}><EyeOff aria-hidden /> Hide the toolbar <kbd>{MOD}.</kbd></DropdownMenu.Item>}
      <DropdownMenu.Label className="wr-menu-label">
        {words} {words === 1 ? 'word' : 'words'} · {keptOk ? 'Kept on this device' : 'Not kept in this browser'}
      </DropdownMenu.Label>
      <DropdownMenu.Separator className="wr-menu-sep" />
      <DropdownMenu.Item className="wr-menu-item wr-menu-quiet" onSelect={() => { window.location.href = '/'; }}>
        The handwriting is from If This Finds You
      </DropdownMenu.Item>
    </>
  );

  return (
    <div
      className="wr-app"
      data-lib={showLib || undefined}
      data-phone={phone || undefined}
      data-away={chromeAway || undefined}
      data-kb={kbUp || undefined}
      tabIndex={-1}
    >
      {showLib && (
        <aside className="wr-side" aria-label="Your notes">
          {phone && (
            <div className="wr-side-top">
              <h1>Notes</h1>
              <button type="button" className="wr-icon" onClick={() => newNote()} aria-label="New note"><SquarePen aria-hidden /></button>
            </div>
          )}
          <Library
            notes={notes}
            current={current.id}
            onOpen={openNote}
            onPin={pin}
            onThrow={throwAway}
            onRestore={restore}
            onDelete={deleteForGood}
            screen={phone}
          />
        </aside>
      )}

      {!(phone && showLib) && (
        <main className="wr-main">
          <header className="wr-bar" aria-label="Toolbar">
            <div className="wr-group">
              {phone ? (
                <button type="button" className="wr-icon wr-back" onClick={() => { settle(); setPhoneScreen('library'); }} aria-label="Notes">
                  <ChevronLeft aria-hidden /><span>Notes</span>
                </button>
              ) : (
                <button type="button" className="wr-icon" onClick={() => setLibOpen((o) => !o)} aria-label={libOpen ? 'Hide notes' : 'Show notes'} aria-pressed={libOpen} title={`Notes  ${MOD}\\`}>
                  <PanelLeft aria-hidden />
                </button>
              )}
              {!phone && <button type="button" className="wr-icon" onClick={() => newNote()} aria-label="New note" title={`New note  ⌥${MOD}N`}><SquarePen aria-hidden /></button>}
            </div>
            {!phone && menu(
              <button type="button" className="wr-title" aria-label={`${title || 'New note'}: note actions`}>
                <span>{title || 'New note'}</span>
              </button>,
              noteItems, 'start',
            )}
            {/* the first words on a blank note, in the bar's empty middle (never over the paper) */}
            {!current.ink && !writing ? (
              <p className="wr-first" aria-hidden>
                {coarse ? 'Tap the paper to write' : <>Type to write. Grey letters delete cleanly until the pen reaches them; then <kbd>⌫</kbd> crosses out.</>}
              </p>
            ) : <div className="wr-spacer" />}
            <div className="wr-group">
              {writerButton}
              <button type="button" className="wr-icon" onClick={another} aria-label="Another writer" title="Another writer"><Shuffle aria-hidden /></button>
            </div>
            <div className="wr-group">
              {menu(<button type="button" className="wr-icon" aria-label="More" title="More"><Ellipsis aria-hidden /></button>, phone ? <>{noteItems}<DropdownMenu.Separator className="wr-menu-sep" />{moreItems}</> : moreItems, 'end')}
            </div>
          </header>

          <Desk
            key={current.id + ':' + rev}
            ref={desk}
            note={current}
            coarse={coarse}
            onChange={onChange}
            onTyped={onTyped}
            onEditingChange={setEditing}
            onSay={say}
          />

          {!phone && <div className="wr-status" aria-hidden>{words} {words === 1 ? 'word' : 'words'}</div>}

          {kbUp && (
            <div className="wr-kbar" style={{ bottom: kbGap }} role="toolbar" aria-label="Writing">
              <button type="button" className="wr-icon" onPointerDown={(e) => e.preventDefault()} onClick={() => desk.current?.history('undo')} aria-label="Undo"><Undo2 aria-hidden /></button>
              <button type="button" className="wr-icon" onPointerDown={(e) => e.preventDefault()} onClick={another} aria-label="Another writer"><Shuffle aria-hidden /></button>
              <div className="wr-spacer" />
              <button type="button" className="wr-done" onPointerDown={(e) => e.preventDefault()} onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>Done</button>
            </div>
          )}
        </main>
      )}

      <div className="sr-only" aria-live="polite">{said}</div>
      <Toaster position={phone ? 'top-center' : 'bottom-center'} />
    </div>
  );
}
