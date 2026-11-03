import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaseSensitive, ChevronDown, LayoutDashboard, Pointer } from 'lucide-react';
import { toast } from 'sonner';
import { cn, fileSafe, saveBlob } from '@/lib/utils';
import { APP_NAME, withLogo } from '@/lib/brand';
import { Wordmark } from '@/components/Wordmark';
import { styleCard } from '@/lib/styles';
import { CAP, EXTRAS, GF_LATIN_CORE, makeHand } from '@engine';
import { AboutHand, Panel, ShareMenu, type PanelProps } from '@/components/Panel';
import { ControlSheet, type Detent, type SheetMetrics } from '@/components/ControlSheet';
import { SheetView } from '@/components/SheetView';
import { DraftSlip } from '@/components/DraftSlip';
import { PaperEditor, type FormatCommand, type PaperEditorApi } from '@/components/PaperEditor';
import { PenTray } from '@/components/PenTray';
import { ReaderView } from '@/components/ReaderView';
import { usePosture } from '@/hooks/usePosture';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNoteState } from '@/hooks/useNoteState';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { useWriting } from '@/hooks/useWriting';
import { FONT_PACKAGE, canShareLinks, copyText, exportFont, exportFontPackage, renderNote, saveNote, shareLink } from '@/lib/actions';
import { emForPaper } from '@/lib/compose';
import { EditLog, type Edit } from '@/lib/edits';
import { applyEdit, toggleMark } from '@/lib/doc';
import { describeHand, pickSimilarHand, writerName } from '@/lib/hands';
import { isNeat, rollHand, rollLook, withSample, type LockKey } from '@/lib/roll';
import { handOpts } from '@/lib/engine-features';
import { SAMPLE_FIRST_KEY, recentLetters, sampleById, sampleForSeed, sawLetter, shortAuthor } from '@/lib/samples';
import { DRAFTS_KEY, drafts, keepDraft, mineIndex, takeDraft, type Draft } from '@/lib/drafts';
import { TheirLetterDesk, TheirLetterPull, deskLayout } from '@/components/TheirLetter';
import { foundHand, foundKey, foundLetter, theirRequest } from '@/lib/found';
import { SheetLabel } from '@/components/SheetLabel';
import type { WriteResult } from '@/lib/write-protocol';
import { WritingMenu } from '@/components/WritingMenu';
import { DEFAULT_INK, INK_FAMILIES } from '@/lib/inks';
import { inkColor } from '@/lib/inks';
import { getOccasion } from '@/lib/occasions';
import { getPaper } from '@/lib/papers';
import { mapGeometry } from '@/lib/geometry';
import { LIVE, engineGeometry, liveExtras, liveLayout } from '@/lib/live';
import { LiveSheets } from '@/components/LiveSheets';
import { INK, InkSession, decodeInk, encodeInk, inkExtras, inkFromText, inkGeometry, inkLive, inkOpts, inkPage, inkText, newInkDoc, type InkDoc } from '@/lib/ink';
import { inkOn } from '@/lib/request';
import { renderLiveNote } from '@/lib/actions';
import { effective, effectiveHand, offsetFor } from '@/lib/params';
import { PENS_LIVE } from '@/lib/pens';
import { perf } from '@/lib/perf';
import { MAX_LETTER, linkIssue, offsetsForNewHand, shareUrl } from '@/lib/state';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { placeholderFor, requestFor, type Req } from '@/lib/request';
import type { NoteState } from '@/lib/state';

/** New hands kept written ahead, so quick flipping always finds the next one ready. */
const AHEAD = 5;

/** Screen scale ceiling: about the size of real paper on a laptop screen. */
const MAX_PX_PER_MM = 3.9;
const SHEET_GAP = 24;

function readPref(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode: fine */ }
}

/** Every edit to the note, in order: the seed of the ink log (see lib/edits.ts). */
const editLog = new EditLog();
/** this tab's typed-but-not-yet-inked text (sessionStorage) */
const TAIL_KEY = 'seedhand:typed';
/** a paste (or dictation) this long is written down at once instead of at the pen's pace */
const WRITE_AT_ONCE = 200;
/** what the hands can write (the Latin alphabet and its marks); anything else stays in plain print */
const WRITABLE = new Set<string>([...GF_LATIN_CORE, ...EXTRAS, '\n', '\t', '\r']);
const RIGHT_TO_LEFT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
/** after the last key, how long the letter still counts as in use: single-letter keys go to it, not to shortcuts */
const WRITING_LATELY_MS = 20000;
(window as unknown as { __seedhandEdits: EditLog }).__seedhandEdits = editLog;

export default function App() {
  const [composing, setComposing] = useState(false);
  // what was wrong with the link this page opened from, said once (the state has already fallen back safely);
  // a link cut short stays as it came (never rewritten or saved over) until the writer starts a letter of their own
  const [linkTrouble, setLinkTrouble] = useState(() => linkIssue(window.location.hash));
  const holdLink = linkTrouble === 'incomplete';
  const holdLinkRef = useRef(holdLink);
  holdLinkRef.current = holdLink;
  const [state, update, markStep, saveNow] = useNoteState(composing || holdLink);
  useEffect(() => {
    if (linkTrouble === 'too-long') toast('This letter was longer than letters can be here', { id: 'link-long', duration: 10000, description: `It’s shown up to ${MAX_LETTER.toLocaleString()} characters.` });
    if (linkTrouble === 'unknown-letter') toast('That letter wasn’t found', { id: 'link-unknown', duration: 8000, description: 'Here’s another one instead.' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [detent, setDetent] = useState<Detent>('peek');
  const [busy, setBusy] = useState({ download: false, font: false, video: false });
  const [editing, setEditing] = useState(false);
  const [plainText, setPlainText] = useState(() => readPref('seedhand:plain-text') === '1');
  const [variety, setVariety] = useState(() => Number(readPref('seedhand:variety') ?? 60) || 60);
  const [locks, setLocks] = useState<Set<LockKey>>(() => new Set((readPref('seedhand:locks') ?? '').split(',').filter(Boolean) as LockKey[]));
  const coarse = useMediaQuery('(pointer: coarse)');
  const viewport = useVisualViewport();

  // natural hand (seed) + your offsets + occasion -> the hand on the page
  const natural = useMemo(() => makeHand(state.seed, state.style, handOpts(state)), [state.seed, state.style, state.neatOnly]);
  const lookKey = JSON.stringify([state.offsets, state.pen, state.penSize, state.ink, state.occasion, state.amount, state.size]);
  // keyed on the look only: typing must keep the same hand object, so the engine's caches stay warm
  const eff = useMemo(() => effective(natural, state), [natural, lookKey]);
  const p = useMemo(() => effectiveHand(natural, eff), [natural, eff]);
  const paper = getPaper(state.paper);
  const ink = inkColor(state.ink);
  const name = useMemo(() => writerName(state.seed), [state.seed]);
  // the sample letter the page shows, while nobody has written (credited under the sheet)
  const sample = state.sample && state.text ? sampleById(state.sample) : undefined;
  // a found letter before the first key: the editor holds nothing (the reply starts from empty), so an IME's
  // first composition, a paste or dictation lands as typed, never mixed with their letter's words
  const replyPending = !!state.sample && !state.inkLog && SAMPLE_FIRST_KEY === 'reply';
  // every found letter shown joins the recent ones (not shown again within ten hands)
  useEffect(() => { sawLetter(state.sample); }, [state.sample]);

  // ---------- found letters and your own: always a way to each ----------
  const [kept, setKept] = useState<Draft[]>(() => drafts());
  // another tab kept or took a letter: the list follows
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === DRAFTS_KEY || e.key == null) setKept(drafts()); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);
  /** keep your letter as you step away from it; when the device won't, say so (it lasts while the page is open) */
  const keepMine = (s: NoteState) => {
    if (s.sample) return;
    if (!keepDraft(s)) {
      toast('Your letter can’t be kept on this device', {
        id: 'no-storage',
        duration: 12000,
        description: 'Its storage is full or blocked. It’s kept while this page is open; copy its link to keep it for later.',
      });
    }
  };
  const toFound = useCallback((next?: ReturnType<typeof sampleForSeed>) => {
    markStep();
    const s = stateNow.current;
    const pick = next ?? sampleForSeed(s.seed, s.style, new Set([...recentLetters(), ...(s.sample ? [s.sample] : [])]));
    if (!pick) return;
    inkRef.current = null;
    update({ sample: pick.id, text: pick.text, inkLog: null, marks: [], replyTo: null, signed: false });
  }, [update]);
  const letterActions = {
    found: !!sample,
    own: !sample && (!!state.text.trim() || !!state.inkLog),
    drafts: kept.length,
    kept,
    mine: mineIndex(kept) >= 0,
    /** another found letter (your own, if any, is kept) */
    onAnother: () => {
      const s = stateNow.current;
      keepMine(s);
      setKept(drafts());
      toFound();
    },
    /** back to a letter you were writing (this tab's newest, or the one picked from the list) */
    onBackToMine: (savedAt?: number) => {
      const s = stateNow.current;
      const d = takeDraft(savedAt);
      // what's on the page now is kept too, unless it's a found letter
      if (d) keepMine(s);
      setKept(drafts());
      if (!d) {
        toast('That letter isn’t here any more', { id: 'draft-gone', description: 'It was opened in another tab, or this device’s storage was cleared.' });
        return;
      }
      markStep();
      inkRef.current = null;
      update({ text: d.text, inkLog: d.inkLog, marks: d.marks ?? [], replyTo: d.replyTo ?? null, signed: !!d.signed, sample: null });
    },
  };

  const request = requestFor(state, natural, eff);
  const reqKey = JSON.stringify(request);
  // for QA: the page's request, to check it against what was written ahead (window.__seedhandCache)
  (window as unknown as { __seedhandReq: string }).__seedhandReq = reqKey;
  // Looks are written in a worker, so a new hand never blocks a frame, and hands about to be asked for are
  // written ahead (prefetch). With the live page (engines with incremental layout), typing is drawn on the
  // main thread instead, from the moment the letter is tapped: same markup, so the switch shows nothing.
  const liveWanted = LIVE && (editing || state.reader);
  const { writing, prefetch, written, lookup, failed: penFailed } = useWriting(request, composing || liveWanted);
  const requestRef = useRef(request);
  requestRef.current = request;
  const committed = useRef(state.text);
  if (!composing) committed.current = state.text;

  // ---------- Ink mode: the live ink sheet while someone writes (lib/ink.ts) ----------
  const inkMode = inkOn(state);
  const stateNow = useRef(state);
  stateNow.current = state;
  const inkRef = useRef<InkSession | null>(null);
  const inkFor = useRef('');
  const [inkTick, setInkTick] = useState(0);
  // the session belongs to one look (hand, paper, size): a new look replays the log in the new hand
  const inkLook = JSON.stringify([state.seed, state.style, lookKey, state.paper]);
  const inkLayout = useMemo(() => inkOpts(p, paper, eff.size, eff.lineSpacing).layout, [p, paper, eff.size, eff.lineSpacing]);
  const inkSession = useCallback((doc?: InkDoc): InkSession => {
    if (!doc && inkRef.current && inkFor.current === inkLook) return inkRef.current;
    const s = stateNow.current;
    const from = doc ?? decodeInk(s.inkLog) ?? (s.sample || !s.text ? newInkDoc(s.seed, s.style) : inkFromText(s.seed, s.style, s.text));
    inkRef.current = new InkSession(p, from, inkLayout, coarse);
    inkFor.current = inkLook;
    return inkRef.current;
  }, [p, inkLayout, coarse, inkLook]);
  /** after the session changed: the note follows it (what it says, and its log) */
  const fullNoted = useRef(false);
  const onModeRef = useRef<((m: 'ink' | 'pencil' | 'fair') => void) | undefined>(undefined);
  const freshRef = useRef<(() => void) | undefined>(undefined);
  const syncInk = useCallback(() => {
    const ink = inkRef.current;
    if (!ink) return;
    update({ text: ink.text(), inkLog: encodeInk(ink.doc), sample: null, marks: [] });
    setInkTick((n) => n + 1);
    if (ink.full && !fullNoted.current) {
      fullNoted.current = true;
      // ink keeps to one sheet: go on in a fair copy (which runs onto more sheets), or start a fresh one
      toast('This sheet is full', {
        id: 'sheet-full',
        description: 'Go on in a fair copy, which runs onto more sheets, or start a fresh sheet.',
        duration: 12000,
        action: { label: 'Fair copy', onClick: () => onModeRef.current?.('fair') },
        cancel: { label: 'Fresh sheet', onClick: () => freshRef.current?.() },
      });
    } else if (!ink.full) fullNoted.current = false;
  }, [update]);
  // writing in ink: the session is up from the first tap (or, on an untouched sample letter, the first key)
  const inkActive = inkMode && editing && !!inkRef.current && inkFor.current === inkLook;
  useEffect(() => {
    if (inkMode && editing && !stateNow.current.sample && !(inkRef.current && inkFor.current === inkLook)) {
      inkSession();
      setInkTick((n) => n + 1);
    }
  }, [inkMode, editing, inkLook, inkSession]);
  // the pen catches up with the typing, at handwriting speed
  useEffect(() => {
    if (!inkActive) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const ink = inkRef.current;
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (ink && ink.waiting && ink.step(dt)) syncInk();
    }, 130);
    return () => window.clearInterval(id);
  }, [inkActive, syncInk]);
  // leaving the paper: everything typed is written down
  useEffect(() => {
    if (editing || !inkRef.current?.waiting) return;
    inkRef.current.flush();
    syncInk();
  }, [editing, syncInk]);
  // leaving the page (another tab, another app, a reload, closing it): everything typed is written down and
  // the link saved at once, without waiting for the pen or the debounce
  useEffect(() => {
    const leave = () => {
      if (holdLinkRef.current) return;
      const ink = inkRef.current;
      if (ink && inkFor.current === inkLook && ink.waiting) {
        ink.flush();
        saveNow({ text: ink.text(), inkLog: encodeInk(ink.doc), sample: null, marks: [] });
        setInkTick((n) => n + 1);
      } else saveNow();
    };
    const onVis = () => { if (document.visibilityState === 'hidden') leave(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', leave);
    };
  }, [inkLook, saveNow]);
  // and while typing, what the pen hasn't reached yet is kept for this tab, so even a crash keeps it: on the
  // next load it's written down (only when it carries on from the letter the link holds)
  const tailTimer = useRef(0);
  const keepTail = useCallback(() => {
    window.clearTimeout(tailTimer.current);
    tailTimer.current = window.setTimeout(() => {
      const ink = inkRef.current;
      try {
        if (ink?.waiting) sessionStorage.setItem(TAIL_KEY, JSON.stringify({ look: [stateNow.current.seed, stateNow.current.style], text: ink.text() }));
        else sessionStorage.removeItem(TAIL_KEY);
      } catch { /* private mode: the leave handler still saves */ }
    }, 300);
  }, []);
  useEffect(() => {
    let kept: { look: [NoteState["seed"], NoteState["style"]]; text: string } | null = null;
    try { kept = JSON.parse(sessionStorage.getItem(TAIL_KEY) ?? 'null'); sessionStorage.removeItem(TAIL_KEY); } catch { /* nothing kept */ }
    const s = stateNow.current;
    if (!kept || !inkMode || !s.inkLog || kept.look[0] !== s.seed || kept.look[1] !== s.style) return;
    const ink = inkSession();
    const now = ink.text();
    if (kept.text.length <= now.length || !kept.text.startsWith(now)) return;
    ink.edit({ at: now.length, del: 0, ins: kept.text.slice(now.length), kind: 'type', t: Date.now(), source: 'paper' });
    ink.flush();
    syncInk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = useMemo(
    () => {
      if (inkActive) return inkLive(p, inkRef.current!.page, paper, eff.size, eff.lineSpacing, inkRef.current!.draft());
      // a shared ink letter: its page, corrections and all
      if (state.reader && inkMode && state.inkLog) {
        const doc = decodeInk(state.inkLog);
        if (doc) return inkLive(p, inkPage(p, doc, paper, eff.size, eff.lineSpacing), paper, eff.size, eff.lineSpacing);
      }
      return liveWanted ? liveLayout(p, committed.current, paper, eff.size, eff.lineSpacing, state.signed, !editing) : null;
    },
    // laid out from the committed text: an IME's composing text waits until it commits
    [liveWanted, p, committed.current, paper, eff.size, eff.lineSpacing, state.signed, inkActive, inkTick, state.reader, inkMode, state.inkLog, editing],
  );
  const extras = useMemo(
    () => {
      if (!live) return [];
      if (inkActive) return inkExtras(live, { draft: inkRef.current!.draft(), signed: state.signed, writerName: name });
      if (state.reader && inkMode && state.inkLog) return liveExtras(live, { marks: [], signed: state.signed, writerName: name, text: live.page.text });
      return liveExtras(live, { marks: state.marks, signed: state.signed, writerName: name, placeholder: placeholderFor(state.paper), text: live.page.text });
    },
    [live, state.marks, state.signed, name, state.paper, inkActive, inkTick, state.reader, inkMode, state.inkLog],
  );
  // after typing, the live page stays up until the worker has written the same thing (no flash of older text)
  const lastLive = useRef<{ live: NonNullable<typeof live>; extras: string[] } | null>(null);
  if (live) lastLive.current = { live, extras };
  const workerCaughtUp = !!writing && writing.key === reqKey;
  if (!live && workerCaughtUp) lastLive.current = null;
  const shownLive = live ? { live, extras } : lastLive.current;
  // paper and writing switch together when the result arrives
  const shownPaper = shownLive ? shownLive.live.paper : writing ? getPaper(writing.paper) : paper;
  const geometry = useMemo(() => {
    if (inkActive && live) return inkGeometry(engineGeometry(live), live, inkRef.current!.draft(), inkRef.current!.text());
    return shownLive ? engineGeometry(shownLive.live) : writing ? mapGeometry(writing) : null;
  }, [shownLive?.live, writing, inkActive, live, inkTick]);

  // a new look fades in when a button asked for it (not from the keyboard, not for sliders or typing)
  const fadeArmed = useRef(false);
  const shownLook = useRef('');
  const fadeNow = !!writing && !!shownLook.current && writing.look !== shownLook.current && fadeArmed.current;
  useEffect(() => {
    if (!writing || writing.look === shownLook.current) return;
    shownLook.current = writing.look;
    fadeArmed.current = false;
  }, [writing]);
  // the sheets that were there before a look change, so a page the letter grows rises in
  const shownSheets = useRef(0);
  const sheetCount = writing ? writing.svgs.length : 1;
  useEffect(() => { if (writing) shownSheets.current = sheetCount; }, [writing, sheetCount]);

  const deskRef = useRef<HTMLDivElement>(null);
  const deskW = useElementWidth(deskRef);
  const pxPerMm = deskW > 0 ? Math.min(MAX_PX_PER_MM, deskW / shownPaper.w) : 0;

  // ---------- a reply: their letter on the desk beside yours (desktop) ----------
  const stageRef = useRef<HTMLDivElement>(null);
  const stageW = useElementWidth(stageRef);
  const replyKey = state.replyTo ? foundKey(state.replyTo) : '';
  const replying = !!state.replyTo && !sample && !state.reader;
  // a reply started here keeps the found letter exactly as it was on the page; a link has it written again
  const theirsShown = useRef<{ key: string; result: WriteResult } | null>(null);
  const theirReq = useMemo(() => (replying && state.replyTo ? theirRequest(state.replyTo) : null), [replying, replyKey]);
  const theirWriting = (theirsShown.current?.key === replyKey ? theirsShown.current.result : undefined) ?? (theirReq ? lookup(theirReq) : undefined);
  // fetched ahead with the next hands (one list: a new list replaces the last), theirs first
  const theirReqRef = useRef(theirReq);
  theirReqRef.current = theirReq;
  const withTheirs = (reqs: Req[]) => (theirReqRef.current ? [theirReqRef.current, ...reqs] : reqs);
  useEffect(() => { if (theirReq && !theirWriting) prefetch(withTheirs([])); }, [theirReq, !!theirWriting, prefetch]);
  const found = useMemo(
    () => (replying && state.replyTo ? foundLetter(state.replyTo, theirWriting) : null),
    [replying, replyKey, theirWriting],
  );
  // each sheet's name, like an artboard's: which letter it is, and how the hand writes
  const theirHandWords = useMemo(() => {
    const h = replying && state.replyTo ? foundHand(state.replyTo) : null;
    return h ? describeHand(h) : undefined;
  }, [replying, replyKey]);
  const myHandWords = useMemo(() => describeHand(p), [p]);
  // a new hand or letter, said once for screen readers (the page changes silently otherwise)
  const [announced, setAnnounced] = useState('');
  const firstLook = useRef(true);
  useEffect(() => {
    if (firstLook.current) { firstLook.current = false; return; }
    setAnnounced(`${name}’s hand: ${sample ? `a letter from ${foundName(sample)}` : sheetTitle}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.seed, state.style, state.sample]);
  // the "click the letter" hint, desktop: only after a while without writing, and never again once you have
  const [wrote, setWrote] = useState(() => readPref('seedhand:wrote') === '1');
  const [idleLong, setIdleLong] = useState(false);
  useEffect(() => {
    if (wrote || state.reader) return;
    const t = window.setTimeout(() => setIdleLong(true), 9000);
    return () => window.clearTimeout(t);
  }, [wrote, state.reader]);
  const hintShown = idleLong && !wrote && !editing && !state.reader && !replying;
  // the first time you write on a desktop: how to stop, once, for a few seconds
  const [escHint, setEscHint] = useState(false);
  useEffect(() => {
    if (!editing || !isDesktop || readPref('seedhand:esc-taught') === '1') return;
    writePref('seedhand:esc-taught', '1');
    setEscHint(true);
    const t = window.setTimeout(() => setEscHint(false), 4500);
    return () => window.clearTimeout(t);
  }, [editing, isDesktop]);
  const foundName = (l: { author: string; year?: number }) => `${shortAuthor(l.author)}${l.year ? `, ${l.year}` : ''}`;
  const sheetTitle = sample ? foundName(sample) : found ? `Your reply to ${shortAuthor(found.letter.author)}` : 'A letter from you';
  /** At a reply's first moment: keep the found letter's writing, as read. */
  const keepTheirs = (s: NoteState) => {
    const r = replyOf(s);
    const req = requestRef.current;
    const w = lookup(req) ?? (writing && writing.key === JSON.stringify(req) && !writing.partial ? writing : undefined);
    if (r && w) theirsShown.current = { key: foundKey(r), result: w };
  };
  // the layout comes from the papers alone, so it's settled the moment a reply starts
  const replyDesk = isDesktop && found && stageW > 0 ? deskLayout(stageW, shownPaper.w, found.paper.w, MAX_PX_PER_MM) : null;
  const [theirsForward, setTheirsForward] = useState(false);
  const theirsForwardRef = useRef(false);
  const wroteRef = useRef(false);
  theirsForwardRef.current = theirsForward;
  useEffect(() => { setTheirsForward(false); }, [replyKey]);
  /** a reply just started here (not opened from a link): their letter slides off your fresh sheet */
  const replyArrive = useRef(false);
  useEffect(() => { replyArrive.current = false; }, [replyKey]);
  const onComposingChange = useCallback((c: boolean) => {
    setComposing(c);
    if (c && theirsForwardRef.current) setTheirsForward(false);
  }, []);

  useEffect(() => {
    document.title = `${name} – ${APP_NAME}`;
  }, [name]);

  // ---------- edits: every change arrives as one Edit (paper or plain text) ----------
  const posture = usePosture(editing);
  const lastEditAt = useRef(-Infinity);
  const scriptNoted = useRef(false);
  /** a big cut can be undone from its note: the letter as it was comes back (ink: its log, replayed) */
  const offerBack = useCallback((snap: Pick<NoteState, 'text' | 'inkLog' | 'marks' | 'signed'>, title: string) => {
    toast(title, {
      id: 'bring-back',
      duration: 12000,
      action: {
        label: 'Bring it back',
        onClick: () => {
          inkRef.current = null;
          inkFor.current = '';
          update({ ...snap, sample: null });
          setInkTick((n) => n + 1);
          window.setTimeout(() => editor.current?.focus(), 0);
        },
      },
    });
  }, [update]);
  const onEdit = useCallback((e: Edit) => {
    editLog.push(e);
    lastEditAt.current = performance.now();
    // typing is writing yours: their letter goes back down
    if (theirsForwardRef.current) setTheirsForward(false);
    if (!wroteRef.current) { wroteRef.current = true; setWrote(true); writePref('seedhand:wrote', '1'); }
    if (e.source === 'paper') posture.onTyped();
    // the letter's length at most: what doesn't fit is left out, and said so
    {
      const s = stateNow.current;
      const li = inkMode && !!inkRef.current && inkFor.current === inkLook ? inkRef.current : null;
      const base = s.sample && SAMPLE_FIRST_KEY === 'reply' ? 0 : li ? li.text().length : s.text.length;
      const room = MAX_LETTER - (base - e.del);
      if (e.ins.length > room) {
        toast('That’s as long as a letter gets', { id: 'too-long', description: `Letters stop at ${MAX_LETTER.toLocaleString()} characters, so the rest was left out.` });
        e = { ...e, ins: e.ins.slice(0, Math.max(0, room)) };
        if (!e.ins && !e.del) return;
      }
      // letters the hand can't write: kept, but in print; said once
      if (!scriptNoted.current && [...e.ins].some((c) => !WRITABLE.has(c))) {
        scriptNoted.current = true;
        toast('These hands write the Latin alphabet', {
          id: 'script',
          duration: 9000,
          description: RIGHT_TO_LEFT.test(e.ins)
            ? 'Other letters and emoji stay in the letter, drawn in plain print, and right-to-left writing runs the wrong way.'
            : 'Other letters and emoji stay in the letter, drawn in plain print.',
        });
      }
    }
    // most of the letter cut at once (select all, then Delete or a key): a note to bring it back
    const was = stateNow.current;
    const liveInk = inkMode && !!inkRef.current && inkFor.current === inkLook ? inkRef.current : null;
    const wasLen = liveInk ? liveInk.text().length : was.text.length;
    if (!was.sample && e.kind !== 'undo' && e.del >= 30 && e.del >= wasLen * 0.5 && e.ins.length * 4 < e.del) {
      liveInk?.flush();
      offerBack({ text: liveInk ? liveInk.text() : was.text, inkLog: liveInk ? encodeInk(liveInk.doc) : was.inkLog, marks: was.marks, signed: was.signed }, e.ins.trim() ? 'Most of the letter is gone' : 'The letter is blank');
    }
    if (inkMode) {
      const s = stateNow.current;
      // Undo lifts only wet ink (the newest event, within 3 s)
      if (e.kind === 'undo') {
        if (inkRef.current?.undo()) syncInk();
        else toast('The ink is dry', { id: 'ink-dry', description: 'Cross it out, or start a fresh sheet.' });
        return;
      }
      // the first key on an untouched sample letter: a reply on a fresh sheet (or, 'onto', the found letter
      // taken as already written)
      const onSample = !!s.sample && !s.inkLog;
      const reply = onSample && SAMPLE_FIRST_KEY === 'reply';
      const ink = !onSample ? inkSession() : inkSession(reply ? newInkDoc(s.seed, s.style) : inkFromText(s.seed, s.style, s.text));
      ink.edit(reply ? { ...e, at: 0, del: 0 } : e);
      // a long paste or dictation: written down now (minutes at the pen's pace, and the page busy all the while)
      if (e.ins.length >= WRITE_AT_ONCE) ink.flush();
      if (reply) { replyArrive.current = true; keepTheirs(s); update({ replyTo: replyOf(s) }); }
      syncInk();
      keepTail();
      return;
    }
    const s0 = stateNow.current;
    if (s0.sample && SAMPLE_FIRST_KEY === 'reply') {
      // a reply: the found letter steps aside, what was typed starts the writer's own
      replyArrive.current = true;
      keepTheirs(s0);
      update({ text: e.ins, marks: [], sample: null, replyTo: replyOf(s0) });
      return;
    }
    update((s) => {
      const doc = applyEdit({ text: s.text, marks: s.marks, signed: s.signed }, e);
      // the first edit makes a sample letter the writer's own text
      return { text: doc.text, marks: doc.marks, sample: null };
    });
  }, [update, posture.onTyped, inkMode, inkSession, syncInk, keepTail, inkLook, offerBack]);

  // ---------- pen-only formatting: underline by hand, press harder, sign ----------
  const editor = useRef<PaperEditorApi>(null);
  /** after a menu action (Sign it, Fair copy, Change writer…): back to the letter, when it was in use. true: it took the focus */
  const resumeWriting = useCallback(() => {
    if (!editor.current || performance.now() - lastEditAt.current > WRITING_LATELY_MS) return false;
    editor.current.focus();
    return true;
  }, []);
  const onFormat = useCallback((cmd: FormatCommand, from: number, to: number) => {
    if (cmd === 'ps') return;
    update((s) => ({ marks: toggleMark({ text: s.text, marks: s.marks, signed: s.signed }, cmd, from, to).marks, sample: null }));
  }, [update]);
  const formatFromTray = (cmd: 'underline' | 'press') => {
    const [a, b] = editor.current?.selection() ?? [0, 0];
    const [from, to] = a === b ? wordAround(state.text, a) : [a, b];
    onFormat(cmd, from, to);
  };
  const toggleSigned = () => update((s) => ({ signed: !s.signed }));

  /** A change of look from a button: the page cross-fades to it. Keyboard and sliders swap at once. */
  const lookChange = useCallback((fn: () => void, fade = true) => {
    fadeArmed.current = fade;
    fn();
  }, []);

  // ---------- hands ----------
  // A new hand rolls the whole look (writer, style, pen, ink, paper, size, every slider), except what's locked.
  // The next two are rolled and written ahead while you look at this one, so the click shows them at once.
  const lockKey = [...locks].sort().join(',');
  const ahead = useRef<{ base: string; look: Partial<NoteState> }[]>([]);
  const similarAhead = useRef<{ base: string; look: Partial<NoteState> } | null>(null);
  const baseOf = useCallback((s: NoteState) => JSON.stringify([s.seed, s.style, s.offsets, s.pen, s.penSize, s.ink, s.size, s.paper, s.occasion, s.amount, s.text, s.sample, s.mode, s.inkLog, s.marks, s.signed, s.neatOnly, variety, lockKey]), [variety, lockKey]);
  const newHand = useCallback((fade = true) => {
    markStep();
    // for QA (window.__seedhandPerf): click → the new hand's writing in the page
    const now = ahead.current.find((a) => a.base === baseOf(stateNow.current));
    perf.lookAsked(!!now && written(requestFor({ ...stateNow.current, ...now.look })));
    lookChange(() => update((s) => ahead.current.find((a) => a.base === baseOf(s))?.look ?? rollHand(s, { variety, locked: locks, avoid: recentLetters() })), fade);
  }, [update, baseOf, variety, locks, lookChange, written]);
  const similarHand = useCallback((fade = true) => {
    markStep();
    lookChange(() => update((s) => {
      const pre = similarAhead.current;
      return pre && pre.base === baseOf(s) ? pre.look : withSample(s, { ...pickSimilarHand({ seed: s.seed, style: s.style }), offsets: offsetsForNewHand(s.offsets) }, recentLetters());
    }), fade);
  }, [update, baseOf, lookChange]);
  const base = baseOf(state);
  useEffect(() => {
    if (state.reader || editing) return;
    // in idle moments: keep a few new hands (and one sibling) rolled and written ahead of this state
    let cancelled = false;
    const idle = (fn: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 600 }) : window.setTimeout(fn, 60));
    const chain: { base: string; look: Partial<NoteState> }[] = [];
    const reqs: ReturnType<typeof requestFor>[] = [];
    // the letters just shown, and the ones already lined up: no letter comes back within ten hands
    const avoid = new Set(recentLetters());
    let s: NoteState = state;
    // one new roll per idle moment (the engine's sampler takes 40-60 ms a hand); hands already rolled are reused
    const step = () => {
      if (cancelled) return;
      let rolled = false;
      while (chain.length < AHEAD && !rolled) {
        const b = baseOf(s);
        const kept = ahead.current.find((a) => a.base === b);
        const look = kept?.look ?? rollHand(s, { variety, locked: locks, avoid });
        rolled = !kept;
        if (look.sample) avoid.add(look.sample);
        chain.push({ base: b, look });
        // each hand ahead is the one after the hand before it
        s = { ...s, ...look };
        reqs.push(requestFor(s));
      }
      // the next click's hand is written as soon as it's known; the rest follow in one list
      if (chain.length === 1 || chain.length === AHEAD) {
        ahead.current = chain.length === AHEAD ? chain : [...chain, ...ahead.current.filter((a) => !chain.some((c) => c.base === a.base))];
        prefetch(withTheirs(reqs));
      }
      if (chain.length < AHEAD) { idle(step); return; }
      idle(() => {
        if (cancelled) return;
        const look = similarAhead.current?.base === base ? similarAhead.current.look : withSample(state, { ...pickSimilarHand({ seed: state.seed, style: state.style }), offsets: offsetsForNewHand(state.offsets) }, recentLetters());
        similarAhead.current = { base, look };
        prefetch(withTheirs([...reqs, requestFor({ ...state, ...look })]));
      });
    };
    const t = window.setTimeout(() => idle(step), 80);
    return () => { cancelled = true; window.clearTimeout(t); };
    // `base` covers everything the rolls depend on
  }, [base, editing, state.reader]);

  // the live page's first layout for a hand is the slow one: do it while the page sits still, so a tap to
  // write starts at once
  useEffect(() => {
    if (!LIVE || editing || state.reader) return;
    const t = window.setTimeout(() => {
      const run = () => { try { liveLayout(p, state.text, paper, eff.size, eff.lineSpacing, state.signed); } catch { /* fine */ } };
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 3000 });
      else run();
    }, 1400);
    return () => window.clearTimeout(t);
  }, [p, paper, eff.size, eff.lineSpacing, state.signed, editing, state.reader]);

  // ---------- actions ----------
  const share = useCallback(async () => {
    const url = shareUrl(state);
    const ok = await copyText(url);
    // on phones (and anywhere with a share sheet) the toast offers to send it straight on
    const action = canShareLinks() ? { label: 'Share…', onClick: () => void shareLink(url, `${name}’s letter – ${APP_NAME}`) } : undefined;
    if (ok) toast.success('Link copied', { description: 'It opens this exact note: hand, pen, paper and text.', action });
    else if (action) void shareLink(url, `${name}’s letter – ${APP_NAME}`);
    else toast.error('Couldn’t copy the link', { description: 'Copy it from the address bar instead.' });
  }, [state, name]);

  // the download never carries the empty-page placeholder
  const requestKey = JSON.stringify({ ...request, placeholder: undefined });
  const downloading = useRef(false);
  const download = useCallback(async () => {
    // a second tap while it's being made does nothing (one image, one share sheet)
    if (downloading.current) return;
    downloading.current = true;
    setBusy((b) => ({ ...b, download: true }));
    try {
      const res = live
        ? await renderLiveNote(
          live,
          inkActive ? inkExtras(live, { signed: state.signed, writerName: name }) : liveExtras(live, { marks: state.marks, signed: state.signed, writerName: name, text: live.page.text }),
          eff.inkKey && eff.inkKey !== 'auto' ? eff.inkKey : undefined, ink, pxPerMm || MAX_PX_PER_MM,
        )
        : await renderNote(JSON.parse(requestKey), ink, pxPerMm || MAX_PX_PER_MM);
      const filename = `${APP_NAME} – ${name}`;
      const done = (r: string) => {
        if (r === 'saved') toast.success('Image downloaded', { description: `JPEG, ${res.width} × ${res.height} px` });
      };
      const r = await saveNote(res.blob, filename, coarse);
      // making the image took long enough that the browser wants a fresh tap before sharing
      if (r === 'needs-tap') {
        toast('Your image is ready', {
          description: `JPEG, ${res.width} × ${res.height} px`,
          action: { label: 'Save image', onClick: () => void saveNote(res.blob, filename, true).then(done) },
          duration: 10000,
        });
      } else done(r);
    } catch (e) {
      console.error(e);
      toast.error('Couldn’t make the image', { description: 'Something went wrong while it was being made. Try again in a moment.' });
    } finally {
      downloading.current = false;
      setBusy((b) => ({ ...b, download: false }));
    }
  }, [requestKey, ink, pxPerMm, name, coarse, live, state.marks, state.signed, eff.inkKey, inkActive]);

  // ---------- the letter writing itself out, as a video or a GIF (lib in src/export, loaded when first used) ----------
  const [exportable, setExportable] = useState<{ video: boolean; gif: boolean } | null>(null);
  const checkExport = useCallback(() => {
    if (exportable) return;
    import('@/export')
      .then((m) => m.exportSupport())
      .then((s) => setExportable({ video: s.mp4 || s.webm, gif: s.gif }))
      .catch(() => setExportable({ video: false, gif: false }));
  }, [exportable]);
  const exporting = useRef<AbortController | null>(null);
  const exportLetter = useCallback(async (kind: 'video' | 'gif') => {
    if (exporting.current) return;
    const ac = new AbortController();
    exporting.current = ac;
    setBusy((b) => ({ ...b, video: true }));
    const what = kind === 'gif' ? 'GIF' : 'video';
    const stop = { label: 'Stop', onClick: () => ac.abort() };
    toast.loading(`Making the ${what}…`, { id: 'export', description: 'The letter writes itself out, then it saves', action: stop, duration: Infinity });
    try {
      const { exportWriting, exportSupport } = await import('@/export');
      const can = await exportSupport();
      let last = 0;
      const res = await exportWriting(stateNow.current, {
        format: kind === 'gif' ? 'gif' : can.mp4 ? 'mp4' : 'webm',
        aspect: '4:5',
        framing: 'lines',
        branding: true,
        signal: ac.signal,
        onProgress: ({ fraction }) => {
          const now = performance.now();
          if (now - last < 100) return;
          last = now;
          toast.loading(`Making the ${what}…`, { id: 'export', description: `${Math.round(fraction * 100)}%`, action: stop, duration: Infinity });
        },
      });
      const filename = `${fileSafe(`${APP_NAME} – ${name}`)}.${res.ext}`;
      const description = `${Math.round(res.seconds)} s, ${res.width} × ${res.height}, ${(res.blob.size / 1e6).toFixed(1)} MB`;
      const file = new File([res.blob], filename, { type: res.mime });
      // a fresh toast, not the progress one (that one's Stop button would stay)
      toast.dismiss('export');
      if (coarse && navigator.canShare?.({ files: [file] })) {
        // making it took a few seconds, so the share sheet needs a fresh tap (then Save Video puts it in Photos)
        // it waits until it's saved or put away: making it again takes a while
        toast.success(`Your ${what} is ready`, { id: 'export-done', description, action: { label: 'Save', onClick: () => void navigator.share({ files: [file] }).catch(() => {}) }, duration: Infinity, closeButton: true });
      } else {
        saveBlob(res.blob, filename);
        toast.success(kind === 'gif' ? 'GIF downloaded' : 'Video downloaded', { id: 'export-done', description, duration: 4000 });
      }
    } catch (e) {
      // a fresh toast each way, so the progress one's Stop button and percentage don't linger
      toast.dismiss('export');
      if ((e as Error)?.name === 'AbortError') toast(`The ${what} was stopped`, { id: 'export-done', description: 'No file was made.', duration: 4000 });
      else {
        console.error(e);
        toast.error(`Couldn’t make the ${what}`, {
          id: 'export-done',
          description: 'Something went wrong while it was being made.',
          action: { label: 'Try again', onClick: () => void exportLetter(kind) },
          duration: 10000,
        });
      }
    } finally {
      exporting.current = null;
      setBusy((b) => ({ ...b, video: false }));
    }
  }, [name, coarse]);

  const font = useCallback(async () => {
    setBusy((b) => ({ ...b, font: true }));
    // let the spinner paint before the (blocking) font build
    await new Promise((r) => setTimeout(r, 40));
    try {
      if (FONT_PACKAGE) {
        // the open font, zipped with how to install it, its licence and credits (built in a worker)
        const res = await exportFontPackage({ seed: state.seed, style: state.style, overrides: eff.overrides, name });
        toast.success('Font downloaded', { description: `${res.family}: ${res.glyphs} glyphs. Install it from the zip.` });
      } else {
        const res = await exportFont(p, `${APP_NAME} – ${name} (${styleCard(state.style).title})`);
        toast.success('Font exported', { description: `${res.glyphs} glyphs, 3 versions of each letter` });
      }
    } catch (e) {
      console.error(e);
      toast.error('Couldn’t build the font', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy((b) => ({ ...b, font: false }));
    }
  }, [p, name, state.seed, state.style, eff.overrides]);

  // R for a new hand, Shift R for a similar one, when not typing; ⌘\\ shows or hides the desk while writing.
  // While the letter is in use (focus on it after Esc, or a key within the last while, say after Sign it or a
  // toast's button), a letter key carries on the writing instead: the editor takes the focus and the key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); posture.toggle(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      // menus and dialogs keep their own keys (type-ahead, Escape)
      if (t?.closest?.('[role="menu"],[role="listbox"],[role="dialog"]')) return;
      const typed = e.key.length === 1 && e.key !== ' ';
      if (typed && editor.current && (t?.closest?.('[data-paper]') || performance.now() - lastEditAt.current < WRITING_LATELY_MS)) {
        editor.current.focus();
        return;
      }
      if ((e.key !== 'r' && e.key !== 'R') || e.repeat) return;
      e.preventDefault();
      // from the keyboard the new hand simply appears: no fade
      if (e.shiftKey) similarHand(false);
      else newHand(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newHand, similarHand, posture.toggle]);

  const panelProps: PanelProps = {
    state,
    natural,
    p,
    name,
    emMm: emForPaper(p, paper, eff.size),
    inkKey: eff.inkKey,
    variety,
    locks,
    onKeepLook: (keep) => {
      const next = new Set<LockKey>(keep ? ['paper', 'pen', 'ink'] : []);
      writePref('seedhand:locks', [...next].join(','));
      setLocks(next);
    },
    busy,
    onNewHand: () => newHand(true),
    // the same letter, another writer: the stationery stays, the text stays (a found letter keeps its words)
    resumeWriting,
    onChangeWriter: () => { markStep(); lookChange(() => update((s) => rollLook(s, { variety, locked: new Set<LockKey>(['pen', 'ink', 'paper']) }))); },
    onSimilarHand: () => similarHand(true),
    onSeed: (seed) => update((s) => withSample(s, { seed, offsets: offsetsForNewHand(s.offsets) }, recentLetters())),
    onStyle: (style) => lookChange(() => update({ style })),
    onControl: (key, v) => update((s) => ({ offsets: { ...s.offsets, [key]: offsetFor(key, v, natural, s) } })),
    onResetControl: (key) => update((s) => {
      const offsets = { ...s.offsets };
      delete offsets[key];
      return { offsets };
    }),
    onResetOffsets: () => update({ offsets: {}, penSize: 'medium' }),
    onPen: (pen) => lookChange(() => update({ pen })),
    onPenSize: (penSize) => lookChange(() => update({ penSize })),
    onInk: (ink) => lookChange(() => update({ ink })),
    onPaper: (paper) => lookChange(() => update({ paper })),
    onSize: (size) => update({ size }),
    onOccasion: (id) => update((s) => {
      const occ = getOccasion(id);
      if (!occ) return { occasion: null };
      // an occasion sets the scene once: its paper, and its pen when the engine has pens
      return { occasion: occ.id, amount: s.occasion === occ.id ? s.amount : 1, paper: occ.paper ?? s.paper, pen: PENS_LIVE && occ.pen ? occ.pen : s.pen };
    }),
    onAmount: (amount) => update({ amount }),
    onSign: toggleSigned,
    onVariety: (v) => { setVariety(v); writePref('seedhand:variety', String(Math.round(v))); },
    // the engine tidies a hand unless this is off, so the page shows the change (a new look: it cross-fades),
    // and New hand brings only neat writers while it's on
    onNeatOnly: (v) => lookChange(() => update({ neatOnly: v })),
    neatNow: isNeat(p),
    onShare: share,
    onDownload: download,
    onExportFont: font,
    onExportVideo: exportLetter,
    exportable,
    onShareOpen: checkExport,
    onFieldFocus: () => setDetent('full'),
    letter: letterActions,
    ink: INK ? {
      on: inkMode,
      letter: !!state.inkLog,
      onMode: (mode) => {
        const s = stateNow.current;
        inkRef.current = null;
        // Pencil is the pencil pen (it rubs out); leaving it puts the writer's own pen back
        if (mode === 'pencil') { update({ pen: 'pencil', ink: INK_FAMILIES.some((f) => f.id === 'graphite') ? 'graphite' : s.ink }); return; }
        const pen = s.pen === 'pencil' ? 'auto' : s.pen;
        const inkColorId = s.ink === 'graphite' ? DEFAULT_INK : s.ink;
        // to fair copy: the letter as it reads; to ink: what's there is written as is, at the first edit
        if (mode === 'fair') update({ mode, pen, ink: inkColorId, inkLog: null, text: s.inkLog ? inkText(decodeInk(s.inkLog)!) : s.text });
        else update({ mode, pen, ink: inkColorId });
      },
      onFairCopy: () => { inkSession().fairCopy(); syncInk(); },
      onFreshSheet: () => { inkSession().freshSheet(); syncInk(); },
    } : undefined,
  };

  onModeRef.current = panelProps.ink?.onMode;
  freshRef.current = panelProps.ink?.onFreshSheet;
  const desk = !posture.writing;
  const reader = state.reader;
  const brokenLink = linkTrouble === 'incomplete';

  // ---------- phones: the control sheet, and the letter making room above it ----------
  const mobileSheet = !reader && !isDesktop;
  const sheetOpen = mobileSheet && !editing;
  const [metrics, setMetrics] = useState<SheetMetrics>({ peek: 124, half: 406, top: 8 });
  const metricsRef = useRef(metrics);
  const onMetrics = useCallback((m: SheetMetrics) => {
    metricsRef.current = m;
    setMetrics((o) => (o.peek === m.peek && o.half === m.half && o.top === m.top ? o : m));
  }, []);
  const fitRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const pageH = shownPaper.h * pxPerMm;
  const pageHRef = useRef(pageH);
  pageHRef.current = pageH;
  const adjusting = useRef<{ top: number; bottom: number } | null>(null);
  /**
   * Shrink and lift the first page into the space above the sheet: fully at half height, not at all at peek.
   * While a control is slid at full height, the page goes to the larger space above or below that control.
   */
  const fitLetter = useCallback((visible: number, animate: boolean) => {
    const el = fitRef.current;
    if (!el) return;
    const { peek, half, top } = metricsRef.current;
    const avoid = adjusting.current;
    const t = avoid ? 1 : Math.min(1, Math.max(0, (visible - peek) / Math.max(1, half - peek)));
    const motion = animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = motion ? (avoid ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'transform 500ms cubic-bezier(0.32, 0.72, 0, 1)') : 'none';
    const header = headerRef.current;
    if (header) {
      header.style.transition = motion ? 'opacity 300ms ease-out' : 'none';
      header.style.opacity = t > 0 ? String(Math.max(0, 1 - t * 1.6)) : '';
    }
    if (t <= 0.001) {
      el.style.transform = '';
      return;
    }
    // where the letter sits untransformed (offsets ignore transforms)
    let natTop = -window.scrollY;
    for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) natTop += n.offsetTop;
    let bandTop = top + 6;
    let bandBottom = window.innerHeight - half - 14;
    if (avoid) {
      const above = avoid.top - 12 - bandTop;
      const below = window.innerHeight - 12 - (avoid.bottom + 12);
      if (below > above) { bandTop = avoid.bottom + 12; bandBottom = window.innerHeight - 12; }
      else bandBottom = avoid.top - 12;
    }
    const s = Math.min(1, (bandBottom - bandTop) / Math.max(1, pageHRef.current));
    const fitted = bandTop + Math.max(0, (bandBottom - bandTop - pageHRef.current * s) / 2);
    el.style.transform = `translate3d(0, ${((fitted - natTop) * t).toFixed(1)}px, 0) scale(${(1 + (s - 1) * t).toFixed(4)})`;
  }, []);
  const visibleAt = (d: Detent) => (d === 'peek' ? metrics.peek : d === 'half' ? metrics.half : window.innerHeight);
  useLayoutEffect(() => {
    if (!mobileSheet) {
      if (fitRef.current) fitRef.current.style.transform = '';
      if (headerRef.current) headerRef.current.style.opacity = '';
      return;
    }
    fitLetter(sheetOpen ? visibleAt(detent) : 0, true);
    // a scrolled page while the sheet is up: keep the letter where it was put
    if (!sheetOpen || detent === 'peek') return;
    const onScroll = () => fitLetter(visibleAt(detent), false);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [mobileSheet, sheetOpen, detent, metrics, pageH, fitLetter]);
  const onAdjusting = useCallback((box: { top: number; bottom: number } | null) => {
    if (!box && !adjusting.current) return;
    adjusting.current = box;
    fitLetter(visibleAt(detent), true);
  }, [fitLetter, detent, metrics]);
  const onSheetDrag = useCallback((visible: number | null) => {
    if (visible == null) fitLetter(sheetOpen ? visibleAt(detent) : 0, true);
    else fitLetter(visible, false);
  }, [fitLetter, sheetOpen, detent, metrics]);

  // how you're writing (and what to do with the sheet): at the sheet's top right on desktop, under it on phones
  const writingMenu = (
    <WritingMenu
      inkAvailable={!!panelProps.ink}
      mode={state.pen === 'pencil' ? 'pencil' : state.mode}
      onMode={(m) => panelProps.ink?.onMode(m)}
      inkLetter={!!state.inkLog}
      onFairCopy={() => panelProps.ink?.onFairCopy()}
      onFreshSheet={() => panelProps.ink?.onFreshSheet()}
      onBlankPage={sample ? () => { replyArrive.current = true; keepTheirs(stateNow.current); update((s) => ({ text: '', marks: [], sample: null, replyTo: replyOf(s) })); } : undefined}
      signed={state.signed}
      onSign={toggleSigned}
      plainText={plainText}
      onAfter={resumeWriting}
      onPlainText={() => setPlainText((v) => { writePref('seedhand:plain-text', v ? '0' : '1'); return !v; })}
    />
  );

  return (
    <TooltipProvider>
      <div className={cn('min-h-dvh', !reader && 'lg:grid lg:grid-cols-[minmax(0,1fr)_auto]')}>
        <main
          className="relative min-w-0 overflow-x-clip px-4 pt-[calc(7.25rem+env(safe-area-inset-top,0px))] pb-32 sm:px-8 lg:px-10 lg:pt-[100px] lg:pb-16"
          style={mobileSheet ? { paddingBottom: metrics.peek + 28 } : undefined}
        >
          <header
            ref={headerRef}
            className={cn(
              // clear of a notch or camera island when the phone is sideways
              'absolute top-[max(1rem,env(safe-area-inset-top,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] left-[max(1rem,env(safe-area-inset-left,0px))] flex items-start justify-between gap-4 text-[12.5px] text-muted-foreground transition-opacity duration-200 ease-out sm:right-[max(2rem,env(safe-area-inset-right,0px))] sm:left-[max(2rem,env(safe-area-inset-left,0px))] lg:inset-x-10 lg:top-5',
              !desk && 'opacity-0',
              !reader && 'pointer-events-none',
            )}
          >
            {/* room for the stacked wordmark ("If this finds / you", about 32-36 px tall) when it lands */}
            <span className="flex h-8 items-center text-foreground/85 lg:h-9"><Wordmark /></span>
            <span className={cn('flex min-w-0 gap-2', isDesktop || reader ? 'items-baseline' : 'items-center gap-1.5')}>
              {reader ? (
                <button type="button" onClick={() => update({ reader: false })} className="rounded-md px-1.5 py-1 underline decoration-[var(--rule-link)] underline-offset-[3px] transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3">
                  Write your own
                </button>
              ) : (
                // no hints up here: they come as ghosts by the letter, once; screen readers still hear the state,
                // and what Find another (or a link) brought
                <span aria-live="polite" className="sr-only">{editing ? 'Writing. Press Escape when you’re done.' : announced}</span>
              )}
              {/* the whole library of found letters (the archive); on phones a small chip, with Share beside it */}
              {!isDesktop && !reader ? (
                <span className={cn('pointer-events-auto flex items-center gap-1.5 transition-opacity duration-150', editing && 'pointer-events-none opacity-0')}>
                  <a
                    href={withLogo(`${import.meta.env.BASE_URL}letters.html`)}
                    aria-label="All letters"
                    title="All letters"
                    className="relative grid size-8 place-items-center rounded-[9px] border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] bg-panel shadow-[0_1px_2px_rgba(60,45,20,0.10)] text-foreground/85 transition-colors duration-150 after:absolute after:-inset-1.5 after:content-[''] active:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <LayoutDashboard aria-hidden className="size-4" />
                  </a>
                  <a
                    href={withLogo(`${import.meta.env.BASE_URL}fonts.html`)}
                    aria-label="Fonts"
                    title="Fonts"
                    className="relative grid size-8 place-items-center rounded-[9px] border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] bg-panel shadow-[0_1px_2px_rgba(60,45,20,0.10)] text-foreground/85 transition-colors duration-150 after:absolute after:-inset-1.5 after:content-[''] active:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <CaseSensitive aria-hidden className="size-4" />
                  </a>
                  <ShareMenu {...panelProps} size="chip" />
                </span>
              ) : (
              <>
              <a
                href={withLogo(`${import.meta.env.BASE_URL}letters.html`)}
                className={cn(
                  // a big enough target without making the line taller (the sheet's label sits just under it)
                  "pointer-events-auto relative shrink-0 rounded-md px-1.5 py-0.5 font-medium text-foreground/80 transition-[color,opacity] duration-150 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover-device:hover:text-foreground",
                  editing && !isDesktop && 'pointer-events-none opacity-0',
                )}
              >
                All letters
              </a>
              {/* every hand as an open font (the fonts page) */}
              <a
                href={withLogo(`${import.meta.env.BASE_URL}fonts.html`)}
                className={cn(
                  // a big enough target without making the line taller (the sheet's label sits just under it)
                  "pointer-events-auto relative shrink-0 rounded-md px-1.5 py-0.5 font-medium text-foreground/80 transition-[color,opacity] duration-150 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover-device:hover:text-foreground",
                  editing && !isDesktop && 'pointer-events-none opacity-0',
                )}
              >
                Fonts
              </a>
              </>
              )}
            </span>
          </header>
          <div ref={stageRef} className="w-full">
          <div className={cn(replyDesk && 'mx-auto flex items-start')} style={replyDesk ? { width: replyDesk.colW + replyDesk.mineW } : undefined}>
          {replyDesk && found && pxPerMm > 0 && (
            <TheirLetterDesk
              found={found}
              layout={replyDesk}
              pxPerMm={pxPerMm}
              forward={theirsForward}
              onForward={setTheirsForward}
              onDismiss={() => update({ replyTo: null })}
              arriving={replyArrive.current}
              title={foundName(found.letter)}
              hand={theirHandWords}
            />
          )}
          <div
            ref={deskRef}
            // with their letter in front, yours waits behind it; a click on yours brings it back (and writes there)
            onPointerDownCapture={replyDesk && theirsForward ? () => setTheirsForward(false) : undefined}
            className={cn(
              'mx-auto w-full max-w-[820px]',
              replyDesk && 'relative z-10 mx-0 shrink-0 transition-opacity duration-300 ease-out',
              replyDesk && theirsForward && 'opacity-50',
            )}
            style={replyDesk ? { width: replyDesk.mineW, maxWidth: 'none' } : undefined}
          >
            {/* a link cut short on its way: no letter to show, and the one thing to do about it */}
            {brokenLink && (
              <Notice
                title="This link looks incomplete"
                action={<Button variant="secondary" onClick={() => { setLinkTrouble(null); update({ reader: false }); }}>Write a letter of your own</Button>}
              >
                Part of the letter didn’t arrive. Some apps shorten long links, so ask the sender to share it again.
              </Notice>
            )}
            {!brokenLink && penFailed && !writing && (
              <Notice title="The pen couldn’t load" action={<Button variant="secondary" onClick={() => window.location.reload()}>Reload</Button>}>
                Your letter is safe in this page’s link. Reload to try again.
              </Notice>
            )}
            {pxPerMm > 0 && reader && !brokenLink && !(penFailed && !writing) && (
              <ReaderView
                writing={writing}
                live={live ? { live, extras, inkKey: eff.inkKey } : null}
                paper={shownPaper}
                pxPerMm={pxPerMm}
                gap={SHEET_GAP}
                ink={ink}
                name={name}
                text={inkMode && state.inkLog ? (live?.page.text ?? state.text) : state.text}
                onWriteYourOwn={() => update({ reader: false })}
              />
            )}
            {pxPerMm > 0 && !reader && !brokenLink && !(penFailed && !writing) && (
              <div ref={fitRef} className="origin-top">
                {/* above the sheets: a deckled or torn paper paints a little past its edge and would take the label's clicks */}
                {/* (with their letter picked up, its label covers this line: yours steps out of the way until it's back) */}
                <div
                  className={cn('relative z-20 mx-auto transition-opacity duration-300 ease-out', replyDesk && theirsForward && 'pointer-events-none opacity-0')}
                  style={{ width: shownPaper.w * pxPerMm }}
                >
                  {isDesktop ? (
                    // desktop: the writer's name, in their hand, on the letter's corner; it opens what's known about the hand
                    <div className="absolute bottom-1.5 left-0 flex max-w-full items-baseline gap-2.5">
                      <AboutHand {...panelProps}>
                        <button
                          type="button"
                          aria-label={`${name}: about this hand`}
                          className="group -ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium tracking-[-0.01em] text-foreground transition-colors duration-150 hover-device:hover:bg-[#e6e2d8] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                        >
                          {name}
                          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-faint transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </button>
                      </AboutHand>
                      <SheetLabel title={sheetTitle} width={Math.max(120, shownPaper.w * pxPerMm - 260)} />
                    </div>
                  ) : (
                    <SheetLabel title={sheetTitle} hand={myHandWords} width={shownPaper.w * pxPerMm} stack className="absolute bottom-2.5 left-0" />
                  )}
                  {isDesktop && <div className="absolute right-0 bottom-0.5">{writingMenu}</div>}
                  {/* a while on the page without writing: a quiet pointer at the letter (gone for good once you write) */}
                  {/* a ghost in the sheet's top margin, pointing in (clear of the label above and the first line below);
                      the first time you write on a desktop, the same place says how to stop */}
                  {(hintShown || escHint) && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute top-2.5 right-2.5 z-10 flex animate-in items-center gap-1.5 rounded-full bg-panel/95 px-2.5 py-1 text-[12px] text-muted-foreground shadow-[0_1px_2px_rgba(60,45,20,0.08),0_6px_16px_-8px_rgba(60,45,20,0.35)] fade-in-0 slide-in-from-top-1 duration-700 motion-reduce:slide-in-from-top-0"
                    >
                      {escHint ? 'Press Esc when you’re done' : <><Pointer className="size-3.5" /> {coarse ? 'Tap' : 'Click'} the letter to write</>}
                    </div>
                  )}
                </div>
                <PaperEditor
                  ref={editor}
                  text={replyPending ? '' : inkActive ? inkRef.current!.text() : state.text}
                  blank={replyPending}
                  hovering={inkActive && inkRef.current!.hovering}
                  onEdit={onEdit}
                  onFormat={onFormat}
                  writerName={name}
                  geometry={geometry}
                  pxPerMm={pxPerMm}
                  sheetW={shownPaper.w}
                  sheetH={shownPaper.h}
                  gapPx={SHEET_GAP}
                  ink={writing ? writing.inkColor : ink}
                  penWidthU={p.penWidth as number}
                  xHeightU={(p.xHeight as number) * CAP}
                  onEditingChange={setEditing}
                  onComposingChange={onComposingChange}
                >
                  {shownLive ? (
                    <LiveSheets
                      live={shownLive.live}
                      pxPerMm={pxPerMm}
                      gapPx={SHEET_GAP}
                      ink={ink}
                      inkKey={eff.inkKey}
                      extras={shownLive.extras}
                      handKey={state.seed + ':' + state.style}
                      hold={inkActive ? 0 : 'word'}
                    />
                  ) : (
                    // the first time, paper and writing arrive together
                    <div className={cn('desk-in flex flex-col', !writing && 'opacity-0')} style={{ gap: SHEET_GAP }}>
                      {(writing ? writing.svgs : [null]).map((svg, i, all) => (
                        <SheetView
                          key={i}
                          paper={shownPaper}
                          pxPerMm={pxPerMm}
                          svg={svg}
                          ink={writing ? writing.inkColor : ink}
                          fade={fadeNow}
                          enter={shownSheets.current > 0 && i >= shownSheets.current}
                          index={i}
                          count={all.length}
                        />
                      ))}
                    </div>
                  )}
                </PaperEditor>
                <div
                  className={cn('mx-auto mt-3 flex items-center text-[12.5px] text-muted-foreground transition-opacity duration-200', !desk && 'pointer-events-none opacity-0')}
                  style={{ width: shownPaper.w * pxPerMm }}
                >
                  {/* the letter's credit on the left, how you're writing on the right */}
                  {found && !replyDesk ? (
                    // a reply, one letter at a time: theirs is a tap away
                    <button
                      type="button"
                      aria-expanded={theirsForward}
                      onClick={() => setTheirsForward(true)}
                      className="mr-auto inline-flex min-w-0 items-center gap-1 rounded-md py-1 pr-3 text-[12px] transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3"
                    >
                      <span className="truncate">Read their letter</span>
                      <ChevronDown aria-hidden className="size-3.5 shrink-0" />
                    </button>
                  ) : (
                    // the letter's name is on the sheet now; a translation still says who translated it
                    <span className="mr-auto min-w-0 truncate pr-3 text-[12px]" title={sample?.title}>{sample?.translator ? `Translated by ${sample.translator.name}` : ''}</span>
                  )}
                  {!isDesktop && writingMenu}
                </div>
                {plainText && (
                  <div className="mt-3 flex justify-center">
                    <DraftSlip value={replyPending ? '' : state.text} onEdit={onEdit} onComposingChange={setComposing} width={shownPaper.w * pxPerMm + 16} />
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
          </div>
        </main>

        {!reader && !isDesktop && editing && (
          <PenTray
            viewport={viewport}
            signed={state.signed}
            onUnderline={() => formatFromTray('underline')}
            onPress={() => formatFromTray('press')}
            onPS={() => {
              if (inkMode) { inkSession().postScript(); syncInk(); return; }
              if (editor.current) insertPS(editor.current, state.text, onEdit);
            }}
            onSign={toggleSigned}
            onDone={() => editor.current?.blur()}
            ink={inkMode}
            onUndo={inkMode ? () => onEdit({ at: 0, del: 0, ins: '', kind: 'undo', t: Date.now(), source: 'paper' }) : undefined}
            mode={panelProps.ink ? (state.pen === 'pencil' ? 'pencil' : state.mode) : undefined}
            onMode={panelProps.ink?.onMode}
            onFairCopy={inkMode && state.inkLog ? () => panelProps.ink?.onFairCopy() : undefined}
            onTheirLetter={found && !replyDesk ? () => setTheirsForward((v) => !v) : undefined}
            theirOpen={theirsForward}
          />
        )}
        {!reader && (isDesktop ? (
          // while writing, the desk steps back: faded and nudged aside, out of the way of the pointer and keys
          <aside
            aria-hidden={!desk || undefined}
            inert={!desk}
            className={cn(
              'sticky top-0 h-dvh py-3 pr-3 transition-[opacity,transform] ease-out',
              desk ? 'duration-[180ms]' : 'pointer-events-none translate-x-3 opacity-0 duration-[240ms] motion-reduce:translate-x-0',
            )}
          >
            <div className="panel-scroll h-full w-[336px] overflow-y-auto overscroll-contain rounded-2xl bg-panel shadow-[0_1px_2px_rgba(60,45,20,0.07),0_10px_30px_-14px_rgba(60,45,20,0.22)]">
              <Panel {...panelProps} />
            </div>
          </aside>
        ) : null)}
      </div>

      {found && !replyDesk && !reader && (
        <TheirLetterPull
          found={found}
          open={theirsForward}
          onOpen={setTheirsForward}
          onDismiss={() => update({ replyTo: null })}
          viewport={viewport}
          // while writing, a little under half of what the keyboard leaves (the line you're on stays in view below);
          // down to the control sheet otherwise
          reach={editing ? Math.max(200, Math.round(viewport.height * 0.45)) : Math.max(260, viewport.height - (mobileSheet ? metrics.peek : 0) - 12)}
          pxPerMm={pxPerMm}
        />
      )}
      {mobileSheet && (
        <>
          {/* with the sheet up, a tap on the letter folds it back down (a second tap writes) */}
          {sheetOpen && detent !== 'peek' && <div aria-hidden className="fixed inset-0 z-30 touch-none" onClick={() => setDetent('peek')} />}
          <ControlSheet {...panelProps} open={sheetOpen} detent={detent} onDetent={setDetent} onMetrics={onMetrics} onDragging={onSheetDrag} onAdjusting={onAdjusting} />
        </>
      )}
      <Toaster offset={isDesktop ? 24 : 96} mobileOffset={{ bottom: mobileSheet ? metrics.peek + 12 : 96 }} />
    </TooltipProvider>
  );
}

function wordAround(text: string, at: number): [number, number] {
  let a = at, b = at;
  while (a > 0 && /\S/.test(text[a - 1])) a--;
  while (b < text.length && /\S/.test(text[b])) b++;
  return [a, b];
}

/** P.S. from the tray: the same edit ⌘↩ makes, then the caret at its end. */
function insertPS(api: PaperEditorApi, text: string, onEdit: (e: Edit) => void) {
  const t = text.replace(/\s+$/, '');
  const ins = (t.length ? '\n\n' : '') + 'P.S. ';
  onEdit({ at: t.length, del: text.length - t.length, ins, kind: 'type', t: Date.now(), source: 'paper' });
  requestAnimationFrame(() => api.setSelection(t.length + ins.length));
}

/** The found letter a reply answers: the sample, in the hand, paper, pen and ink it was found in. */
function replyOf(s: NoteState): NoteState['replyTo'] {
  return s.sample
    ? { id: s.sample, seed: s.seed, style: s.style, paper: s.paper, pen: s.pen, ink: s.ink, tip: s.penSize, size: s.size, offsets: s.offsets }
    : s.replyTo;
}
