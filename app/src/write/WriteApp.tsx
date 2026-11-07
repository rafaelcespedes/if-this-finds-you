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
import { Bold, Check, ChevronLeft, Copy, Highlighter, Italic, ListTodo, Underline, Ellipsis, EyeOff, FileText, Image as ImageIcon, Keyboard, PanelLeft, Pin, PinOff, Share, Shuffle, SquarePen, Trash2, Undo2, WandSparkles } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { copyText, saveNote } from '@/lib/actions';
import { encodeInk } from '@/lib/ink';
import { inkColor } from '@/lib/inks';
import { effective, effectiveHand } from '@/lib/params';
import { handFor } from '@/lib/request';
import { handOpts } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import { Desk, type DeskApi } from './Desk';
import { CleanDesk } from './CleanDesk';
import type { Mark } from '@/lib/doc';
import { Library } from './Library';
import { WriterName, WriterPanel } from './WriterPanel';
import { Shortcuts, shortcutGroups } from './Shortcuts';
import { ShareDialog } from './ShareDialog';
import { FormatPanel, HIGHLIGHTERS, styleName } from './FormatPanel';
import type { FormatCommand } from '@/components/PaperEditor';
import type { InkFormat, InkHighlight } from '@/lib/ink';
import {
  MIGRATED_KEY, asClean, asInk, blankNote, inkFromLines, pendingTicks, deleteNote, getNote, isBlank, isClean, lastOpen, listen, noteText, oldNotes, pickLook, putNote,
  knowText, readNotes, rememberOpen, stateOf, titleOf, wordCount, type Look, type Note,
} from './notes';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac() ? '⌘' : 'Ctrl+';
type Appearance = 'auto' | 'light' | 'dark';
const THEME_KEY = 'seedhand:write:theme';
const APPEARANCES: { id: Appearance; label: string }[] = [{ id: 'auto', label: 'Automatic' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }];

/** The way home: the site's mark, a link to If This Finds You (Rafael, 7 Nov: a favicon-like button, at the top of the
 *  notes when they're open, beside their button when they're shut) */
function HomeMark() {
  return (
    <a className="wr-home" href="/" aria-label="If This Finds You, the home page" title="If This Finds You">
      <img src="/brand/favicon-5.svg" alt="" width="22" height="22" />
    </a>
  );
}
/** the note being written, kept here too as the page goes (the database can't always finish in time) */
const PENDING_KEY = 'seedhand:write:pending';
const LIB_KEY = 'seedhand:write:library';

/** A change of notes, as the sheets themselves moving (View Transitions: each sheet is named by its note's id, so the
 * one on the desk shrinks into its row in the library and one opened from it grows back up). Instant without the
 * API or with reduced motion. */
function moveSheets(change: () => void): Promise<unknown> {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } };
  if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { change(); return Promise.resolve(); }
  return doc.startViewTransition(() => flushSync(change)).finished.catch(() => {});
}

/** a toolbar button pressed with a mouse doesn't take the focus from the paper (the keys go on to the writing; a space
 * never presses the button again) */
const keepPen = (e: React.PointerEvent) => { if (e.pointerType === 'mouse') e.preventDefault(); };

export function WriteApp() {
  const coarse = useMediaQuery('(pointer: coarse)');
  const phone = useMediaQuery('(max-width: 719.98px)');
  // a narrow window: the library opens over the page instead of beside it
  const roomy = useMediaQuery('(min-width: 1040px)');

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
    if (isClean(n)) return n;
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
  const onChange = useCallback((ink: string | null, text: string) => {
    knowText(ink, text);
    const id = currentRef.current;
    const n = notesRef.current.find((x) => x.id === id);
    if (!n || n.ink === ink) return;
    dirty.current = true;
    patch(id, (x) => ({ ...x, ink, at: Date.now() }));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveNow(); }, 400);
  }, [patch, saveNow]);

  // a clean note: its words and marks
  const onCleanChange = useCallback((text: string, marks: Mark[]) => {
    const id = currentRef.current;
    dirty.current = true;
    patch(id, (x) => ({ ...x, text, marks, at: Date.now() }));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveNow(); }, 400);
  }, [patch, saveNow]);
  /** In ink, or Clean: the note carries on the other way from here */
  const setMode = (mode: 'ink' | 'clean') => {
    const n = settle();
    if (!n || (mode === 'clean') === isClean(n)) return;
    const next = mode === 'clean' ? asClean(n, desk.current?.lines()) : asInk(n);
    patch(n.id, () => next);
    void keep(next);
    say(mode === 'clean' ? 'Clean: edit freely, like a font.' : 'In ink: mistakes are crossed out.');
    if (!coarse) requestAnimationFrame(() => desk.current?.focusEnd());
  };

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

  // another tab kept a note: the library takes it, and the open note too unless it has changes of its own here. A note
  // thrown away, put back or pinned there is that here too, changes or not (its words stay as written here)
  useEffect(() => listen(async (m) => {
    if (m.kind === 'delete') { setAll((all) => all.filter((n) => n.id !== m.id || n.id === currentRef.current)); return; }
    const n = await getNote(m.id);
    if (!n) return;
    const mine = notesRef.current.find((x) => x.id === n.id);
    if (mine && (mine.touched ?? 0) >= (n.touched ?? 0)) return;
    const open = n.id === currentRef.current;
    if (open && dirty.current) {
      patch(n.id, (x) => ({ ...x, thrown: n.thrown, pinned: n.pinned, touched: n.touched }));
    } else {
      setAll((all) => (all.some((x) => x.id === n.id) ? all.map((x) => (x.id === n.id ? n : x)) : [...all, n]));
      if (open) setRev((r) => r + 1);
    }
    // the open note was thrown away in another tab: the desk moves on to the newest note (what was written here is kept with it)
    if (open && n.thrown) {
      settle();
      const here = notesRef.current.find((x) => x.id === n.id);
      if (here) void putNote({ ...here, thrown: n.thrown });
      const next = notesRef.current.filter((x) => !x.thrown && x.id !== n.id).sort((a, b) => b.at - a.at)[0];
      if (next) setCurrentId(next.id);
      else { const b = blankNote(n.look); setAll((all) => [...all, b]); setCurrentId(b.id); }
      toast('That note was thrown away in another tab', { id: 'thrown-elsewhere', description: 'It’s in Thrown away.' });
    }
  }), [setAll, patch]);

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
  // the library beside the page as it was left; a narrow window opens on the page alone
  const [libOpen, setLibOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1040) return false;
    try { return localStorage.getItem(LIB_KEY) !== '0'; } catch { return true; }
  });
  useEffect(() => { if (roomy) { try { localStorage.setItem(LIB_KEY, libOpen ? '1' : '0'); } catch { /* fine */ } } }, [libOpen, roomy]);
  const [phoneScreen, setPhoneScreen] = useState<'note' | 'library'>('note');
  const [writing, setWriting] = useState(false);
  const [said, say] = useState('');

  // New note is instant: the fresh sheet is simply there and takes the keys at once (a moving sheet would have to be
  // photographed first, a tenth of a second on a full one). Where the old one went shows in the library: its row glows.
  const [arrived, setArrived] = useState<string | null>(null);
  const newNote = (look?: Look) => {
    const n = notesRef.current.find((x) => x.id === currentRef.current);
    if (n && isBlank(n) && !(desk.current?.text().trim()) && !look) { setPhoneScreen('note'); desk.current?.focus(); return n; }
    const next = blankNote(look ?? n?.look ?? pickLook());
    leaveCurrent();
    setAll((all) => [...all, next]);
    setCurrentId(next.id);
    setPhoneScreen('note');
    if (n && !isBlank(n)) { setArrived(n.id); window.setTimeout(() => setArrived((a) => (a === n.id ? null : a)), 900); }
    setWriting(false);
    say('A new note.');
    return next;
  };
  const openNote = (id: string) => {
    if (!roomy) setLibOpen(false);
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
    const gone: Note = { ...n, thrown: Date.now() };
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
  // a fair copy: the note as it reads now, set out as it was (titles, lists, ticks), on a new note the pen writes out
  const fairCopy = () => {
    const from = notesRef.current.find((x) => x.id === currentRef.current);
    const lines = desk.current?.lines() ?? [];
    if (!from || !lines.some((L) => L.text.trim())) { toast('Nothing to copy out yet', { id: 'fair-none' }); return; }
    leaveCurrent();
    const n = blankNote(from.look);
    const doc = inkFromLines(n.look.seed, n.look.style, lines);
    const copy: Note = { ...n, ink: encodeInk(doc), fair: Date.now() };
    const ticks = lines.flatMap((L, i) => (L.checked ? [i] : []));
    if (ticks.length) pendingTicks.set(copy.id, ticks);
    setAll((all) => [...all, copy]);
    setCurrentId(copy.id);
    setPhoneScreen('note');
    void keep(copy);
    setArrived(from.id);
    window.setTimeout(() => setArrived((a) => (a === from.id ? null : a)), 900);
    toast('A fair copy', { id: 'fair', description: 'The draft is in your notes.', duration: 4000 });
  };
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
  const [keysOpen, setKeysOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // ---------- Appearance: Automatic (the system's), Light or Dark (Rafael, 7 Nov: "a way to toggle between light theme
  // and dark theme"). Kept on this device; write.html puts it on before the first paint ----------
  const [theme, setThemeNow] = useState<Appearance>(() => {
    try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
  });
  const setTheme = (t: Appearance) => {
    setThemeNow(t);
    try { if (t === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch { /* not kept */ }
  };
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'auto') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', theme);
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((m, i) => m.setAttribute('content', theme === 'auto' ? (i === 0 ? '#e9e9e7' : '#161618') : theme === 'dark' ? '#161618' : '#e9e9e7'));
  }, [theme]);
  // Format: opened from the toolbar (or, on a phone, from the bar above the keyboard, which goes as the keyboard does)
  const [formatOpen, setFormatOpen] = useState(false);

  // ---------- formatting ----------
  const [fmt, setFmt] = useState<InkFormat | null>(null);
  const fmtFrame = useRef(0);
  const refreshFmt = useCallback(() => {
    cancelAnimationFrame(fmtFrame.current);
    fmtFrame.current = requestAnimationFrame(() => setFmt(desk.current?.style() ?? null));
  }, []);
  useEffect(() => {
    document.addEventListener('selectionchange', refreshFmt);
    return () => document.removeEventListener('selectionchange', refreshFmt);
  }, [refreshFmt]);
  const [highlighter, setHighlighterNow] = useState<InkHighlight>(() => {
    try { const h = localStorage.getItem('seedhand:write:hl'); return (HIGHLIGHTERS.find((x) => x.id === h)?.id ?? 'yellow'); } catch { return 'yellow'; }
  });
  const setHighlighter = (h: InkHighlight) => { setHighlighterNow(h); try { localStorage.setItem('seedhand:write:hl', h); } catch { /* fine */ } };
  /** a command from the toolbar: Bold on a selection goes over it, with none presses harder from here */
  const run = (cmd: FormatCommand) => {
    const [a, b] = desk.current?.selection() ?? [0, 0];
    if (cmd === 'weight' && a !== b) cmd = 'press';
    desk.current?.command(cmd);
    // (a button isn't typing: the toolbar stays where the pointer is)
    keys.current = 0;
    setWriting(false);
    refreshFmt();
  };
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
      if (mod && (k === '/' || e.code === 'Slash')) { e.preventDefault(); setKeysOpen((o) => !o); return; }
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
  // a phone on its side with the keyboard up has a sliver of page left: the toolbar steps aside for the writing
  const tight = kbUp && vv.height < 380;
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--keep-top', tight ? '8px' : coarse ? '70px' : '62px');
  }, [tight, coarse]);

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

  const formatButton = (
    <Sheet
      title="Format"
      showTitle={phone}
      side="bottom"
      align="start"
      className="wr-pop"
      open={formatOpen}
      onOpenChange={(o) => { setFormatOpen(o); if (o) refreshFmt(); }}
      onCloseAutoFocus={focusBack}
      trigger={
        <button type="button" className="wr-aa" aria-label={`Format: ${styleName(fmt)}`} title="Format">
          <span className="wr-aa-mark" aria-hidden>Aa</span>{!phone && <span className="wr-aa-name">{styleName(fmt)}</span>}
        </button>
      }
    >
      {(close) => (
        <FormatPanel
          fmt={fmt}
          clean={isClean(current)}
          mod={MOD}
          highlighter={highlighter}
          onHighlighter={setHighlighter}
          run={(cmd) => { run(cmd); if (cmd !== 'weight' && cmd !== 'lean') close(); }}
        />
      )}
    </Sheet>
  );

  const noteItems = (
    <>
      <DropdownMenu.Item className="wr-menu-item" onSelect={fairCopy}><WandSparkles aria-hidden /> Make a fair copy</DropdownMenu.Item>
      <DropdownMenu.Item className="wr-menu-item" onSelect={() => pin(current.id, !current.pinned)}>
        {current.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {current.pinned ? 'Unpin' : 'Pin'}
      </DropdownMenu.Item>
      <DropdownMenu.Separator className="wr-menu-sep" />
      <DropdownMenu.Item className="wr-menu-item" onSelect={() => setShareOpen(true)}><Share aria-hidden /> Share…</DropdownMenu.Item>
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
      {!coarse && <DropdownMenu.Item className="wr-menu-item" onSelect={() => setKeysOpen(true)}><Keyboard aria-hidden /> Keyboard shortcuts <kbd>{MOD}/</kbd></DropdownMenu.Item>}
      <DropdownMenu.Separator className="wr-menu-sep" />
      <DropdownMenu.Label className="wr-menu-label wr-menu-head">Appearance</DropdownMenu.Label>
      {APPEARANCES.map((a) => (
        <DropdownMenu.Item key={a.id} className="wr-menu-item" onSelect={() => setTheme(a.id)}>
          <span className="wr-menu-tick">{theme === a.id && <Check aria-hidden />}</span> {a.label}
        </DropdownMenu.Item>
      ))}
      <DropdownMenu.Separator className="wr-menu-sep" />
      <DropdownMenu.Label className="wr-menu-label">
        {words} {words === 1 ? 'word' : 'words'} · {keptOk ? 'Kept on this device' : 'Not kept in this browser'}
      </DropdownMenu.Label>
    </>
  );  // how this note is written, In ink or Clean: in the More menu (Rafael, 7 Nov: "the ink can be rolled into the more
  // button"); the page itself shows which it is
  const modeItems = (
    <>
      <DropdownMenu.Item className="wr-menu-item wr-menu-mode" onSelect={() => setMode('ink')}>
        <span className="wr-menu-tick">{!isClean(current) && <Check aria-hidden />}</span>
        <span><b>In ink</b><small>Mistakes are crossed out, never erased</small></span>
      </DropdownMenu.Item>
      <DropdownMenu.Item className="wr-menu-item wr-menu-mode" onSelect={() => setMode('clean')}>
        <span className="wr-menu-tick">{isClean(current) && <Check aria-hidden />}</span>
        <span><b>Clean</b><small>Edit freely, like a font. Crossings-out are tidied away</small></span>
      </DropdownMenu.Item>
    </>
  );


  return (
    <div
      className="wr-app"
      data-lib={showLib || undefined}
      data-over={(!phone && !roomy && showLib) || undefined}
      data-phone={phone || undefined}
      data-away={chromeAway || undefined}
      data-kb={kbUp || undefined}
      data-tight={tight || undefined}
      tabIndex={-1}
    >
      {showLib && !phone && !roomy && <div className="wr-scrim" aria-hidden onClick={() => setLibOpen(false)} />}
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
            arrived={arrived}
            lead={<HomeMark />}
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
                <>{!libOpen && <HomeMark />}<button type="button" className="wr-icon" onPointerDown={keepPen} onClick={() => setLibOpen((o) => !o)} aria-label={libOpen ? 'Hide notes' : 'Show notes'} aria-pressed={libOpen} title={`Notes  ${MOD}\\`}>
                  <PanelLeft aria-hidden />
                </button></>
              )}
              {!phone && <button type="button" className="wr-icon" onPointerDown={keepPen} onClick={() => newNote()} aria-label="New note" title={`New note  ⌥${MOD}N`}><SquarePen aria-hidden /></button>}
            </div>
            {phone && <span className="wr-format-anchor">{formatButton}</span>}
            {!phone && (
              <div className="wr-group wr-format-bar">
                {formatButton}
                <span className="wr-bar-more">
                  <button type="button" className="wr-icon" aria-pressed={!!fmt?.weight} onPointerDown={keepPen} onClick={() => run('weight')} aria-label="Press harder" title={`Press harder (on a selection: go over it)  ${MOD}B`}><Bold aria-hidden /></button>
                  <button type="button" className="wr-icon" aria-pressed={!!fmt?.lean} disabled={isClean(current)} onPointerDown={keepPen} onClick={() => run('lean')} aria-label="Lean" title={`Lean in, from here  ${MOD}I`}><Italic aria-hidden /></button>
                  <button type="button" className="wr-icon" onPointerDown={keepPen} onClick={() => run('underline')} aria-label="Underline" title={`Underline by hand  ${MOD}U`}><Underline aria-hidden /></button>
                  <button type="button" className="wr-icon wr-hl-tool" disabled={isClean(current)} onPointerDown={keepPen} onClick={() => run('highlight')} aria-label="Highlight" title={`Highlight  ⇧${MOD}E`} style={{ '--hl': HIGHLIGHTERS.find((h) => h.id === highlighter)?.color } as React.CSSProperties}><Highlighter aria-hidden /></button>
                  <button type="button" className="wr-icon" aria-pressed={fmt?.list === 'check'} disabled={isClean(current)} onPointerDown={keepPen} onClick={() => run('checklist')} aria-label="Checklist" title={`Checklist  ⇧${MOD}L`}><ListTodo aria-hidden /></button>
                </span>
              </div>
            )}
            <div className="wr-spacer" />
            <div className="wr-group">
              {writerButton}
              <button type="button" className="wr-icon" onPointerDown={keepPen} onClick={another} aria-label="Another writer" title="Another writer"><Shuffle aria-hidden /></button>
            </div>
            <div className="wr-group">
              {!phone && <button type="button" className="wr-icon" onClick={() => setShareOpen(true)} aria-label="Share" title="Share as a picture"><Share aria-hidden /></button>}
              {menu(<button type="button" className="wr-icon" aria-label="More" title="More"><Ellipsis aria-hidden /></button>, <>{phone && <><DropdownMenu.Item className="wr-menu-item" onSelect={() => newNote()}><SquarePen aria-hidden /> New note</DropdownMenu.Item><DropdownMenu.Separator className="wr-menu-sep" /></>}{modeItems}<DropdownMenu.Separator className="wr-menu-sep" />{noteItems}<DropdownMenu.Separator className="wr-menu-sep" />{moreItems}</>, 'end')}
            </div>
          </header>

          {isClean(current) ? (
            <CleanDesk
              key={current.id + ':clean:' + rev}
              ref={desk}
              note={current}
              coarse={coarse}
              onChange={onCleanChange}
              onTyped={onTyped}
              onEditingChange={setEditing}
            />
          ) : (
            <Desk
              key={current.id + ':' + rev}
              ref={desk}
              note={current}
              coarse={coarse}
              onChange={onChange}
              onTyped={onTyped}
              onEditingChange={setEditing}
              onSay={say}
              highlighter={highlighter}
              onStyle={refreshFmt}
            />
          )}

          {!phone && <div className="wr-status" aria-hidden>{words} {words === 1 ? 'word' : 'words'}</div>}

          {kbUp && (
            <div className="wr-kbar" style={{ bottom: kbGap }} role="toolbar" aria-label="Writing">
              <button type="button" className="wr-aa" onClick={() => { refreshFmt(); setFormatOpen(true); }} aria-label={`Format: ${styleName(fmt)}`}>
                <span className="wr-aa-mark" aria-hidden>Aa</span>
              </button>
              {!isClean(current) && <button type="button" className="wr-icon" aria-pressed={fmt?.list === 'check'} onPointerDown={(e) => e.preventDefault()} onClick={() => run('checklist')} aria-label="Checklist"><ListTodo aria-hidden /></button>}
              <button type="button" className="wr-icon" onPointerDown={(e) => e.preventDefault()} onClick={() => desk.current?.history('undo')} aria-label="Undo"><Undo2 aria-hidden /></button>
              <button type="button" className="wr-icon" onPointerDown={(e) => e.preventDefault()} onClick={another} aria-label="Another writer"><Shuffle aria-hidden /></button>
              <div className="wr-spacer" />
              <button type="button" className="wr-done" onPointerDown={(e) => e.preventDefault()} onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>Done</button>
            </div>
          )}
        </main>
      )}

      <Shortcuts open={keysOpen} onOpenChange={setKeysOpen} groups={shortcutGroups(MOD)} />
      {current && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          sheets={() => desk.current!.sheets()}
          blank={() => !(desk.current?.text() ?? '').trim()}
          writer={look ? writerName(look.seed) : ''}
          fileName={fileName()}
          coarse={coarse}
          mod={MOD}
        />
      )}
      <div className="sr-only" aria-live="polite">{said}</div>
      <Toaster position={phone ? 'top-center' : 'bottom-center'} />
    </div>
  );
}
