import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/brand';
import { styleCard } from '@/lib/styles';
import { CAP, makeHand } from '@engine';
import { Panel, type PanelProps } from '@/components/Panel';
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
import { canShareLinks, copyText, exportFont, renderNote, saveNote, shareLink } from '@/lib/actions';
import { emForPaper } from '@/lib/compose';
import { EditLog, type Edit } from '@/lib/edits';
import { applyEdit, toggleMark } from '@/lib/doc';
import { describeHand, pickSimilarHand, writerName } from '@/lib/hands';
import { rollHand, withSample, type LockKey } from '@/lib/roll';
import { SAMPLE_FIRST_KEY, recentLetters, sampleById, sampleForSeed, sawLetter, shortAuthor } from '@/lib/samples';
import { drafts, keepDraft, takeDraft } from '@/lib/drafts';
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
import { offsetsForNewHand, shareUrl } from '@/lib/state';
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
(window as unknown as { __seedhandEdits: EditLog }).__seedhandEdits = editLog;

export default function App() {
  const [composing, setComposing] = useState(false);
  const [state, update] = useNoteState(composing);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [detent, setDetent] = useState<Detent>('peek');
  const [busy, setBusy] = useState({ download: false, font: false });
  const [editing, setEditing] = useState(false);
  const [plainText, setPlainText] = useState(() => readPref('seedhand:plain-text') === '1');
  const [variety, setVariety] = useState(() => Number(readPref('seedhand:variety') ?? 60) || 60);
  const [locks, setLocks] = useState<Set<LockKey>>(() => new Set((readPref('seedhand:locks') ?? '').split(',').filter(Boolean) as LockKey[]));
  const coarse = useMediaQuery('(pointer: coarse)');
  const viewport = useVisualViewport();

  // natural hand (seed) + your offsets + occasion -> the hand on the page
  const natural = useMemo(() => makeHand(state.seed, state.style), [state.seed, state.style]);
  const lookKey = JSON.stringify([state.offsets, state.pen, state.penSize, state.ink, state.occasion, state.amount, state.size]);
  // keyed on the look only: typing must keep the same hand object, so the engine's caches stay warm
  const eff = useMemo(() => effective(natural, state), [natural, lookKey]);
  const p = useMemo(() => effectiveHand(natural, eff), [natural, eff]);
  const paper = getPaper(state.paper);
  const ink = inkColor(state.ink);
  const name = useMemo(() => writerName(state.seed), [state.seed]);
  // the sample letter the page shows, while nobody has written (credited under the sheet)
  const sample = state.sample && state.text ? sampleById(state.sample) : undefined;
  // every found letter shown joins the recent ones (not shown again within ten hands)
  useEffect(() => { sawLetter(state.sample); }, [state.sample]);

  // ---------- found letters and your own: always a way to each ----------
  const [draftCount, setDraftCount] = useState(() => drafts().length);
  const toFound = useCallback((next?: ReturnType<typeof sampleForSeed>) => {
    const s = stateNow.current;
    const pick = next ?? sampleForSeed(s.seed, s.style, new Set([...recentLetters(), ...(s.sample ? [s.sample] : [])]));
    if (!pick) return;
    inkRef.current = null;
    update({ sample: pick.id, text: pick.text, inkLog: null, marks: [], replyTo: null, signed: false });
  }, [update]);
  const letterActions = {
    found: !!sample,
    own: !sample && (!!state.text.trim() || !!state.inkLog),
    drafts: draftCount,
    /** another found letter (your own, if any, is kept) */
    onAnother: () => {
      const s = stateNow.current;
      if (!s.sample) { keepDraft(s); setDraftCount(drafts().length); }
      toFound();
    },
    /** back to the letter you were writing */
    onBackToMine: () => {
      const s = stateNow.current;
      // what's on the page now is kept too, unless it's a found letter
      if (!s.sample) keepDraft(s);
      const d = takeDraft();
      setDraftCount(drafts().length);
      if (!d) return;
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
  const { writing, prefetch, written, lookup } = useWriting(request, composing || liveWanted);
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
  const syncInk = useCallback(() => {
    const ink = inkRef.current;
    if (!ink) return;
    update({ text: ink.text(), inkLog: encodeInk(ink.doc), sample: null, marks: [] });
    setInkTick((n) => n + 1);
    if (ink.full && !fullNoted.current) {
      fullNoted.current = true;
      toast('This sheet is full', { description: 'Make a fair copy, or start a fresh sheet.' });
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

  const live = useMemo(
    () => {
      if (inkActive) return inkLive(p, inkRef.current!.page, paper, eff.size, eff.lineSpacing);
      // a shared ink letter: its page, corrections and all
      if (state.reader && inkMode && state.inkLog) {
        const doc = decodeInk(state.inkLog);
        if (doc) return inkLive(p, inkPage(p, doc, paper, eff.size, eff.lineSpacing), paper, eff.size, eff.lineSpacing);
      }
      return liveWanted ? liveLayout(p, committed.current, paper, eff.size, eff.lineSpacing, state.signed) : null;
    },
    // laid out from the committed text: an IME's composing text waits until it commits
    [liveWanted, p, committed.current, paper, eff.size, eff.lineSpacing, state.signed, inkActive, inkTick, state.reader, inkMode, state.inkLog],
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
  const onEdit = useCallback((e: Edit) => {
    editLog.push(e);
    // typing is writing yours: their letter goes back down
    if (theirsForwardRef.current) setTheirsForward(false);
    if (e.source === 'paper') posture.onTyped();
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
      if (reply) { replyArrive.current = true; keepTheirs(s); update({ replyTo: replyOf(s) }); }
      syncInk();
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
  }, [update, posture.onTyped, inkMode, inkSession, syncInk]);

  // ---------- pen-only formatting: underline by hand, press harder, sign ----------
  const editor = useRef<PaperEditorApi>(null);
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
  const baseOf = useCallback((s: NoteState) => JSON.stringify([s.seed, s.style, s.offsets, s.pen, s.penSize, s.ink, s.size, s.paper, s.occasion, s.amount, s.text, s.sample, s.mode, s.inkLog, s.marks, s.signed, variety, lockKey]), [variety, lockKey]);
  const newHand = useCallback((fade = true) => {
    // for QA (window.__seedhandPerf): click → the new hand's writing in the page
    const now = ahead.current.find((a) => a.base === baseOf(stateNow.current));
    perf.lookAsked(!!now && written(requestFor({ ...stateNow.current, ...now.look })));
    lookChange(() => update((s) => ahead.current.find((a) => a.base === baseOf(s))?.look ?? rollHand(s, { variety, locked: locks, avoid: recentLetters() })), fade);
  }, [update, baseOf, variety, locks, lookChange, written]);
  const similarHand = useCallback((fade = true) => {
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
    const t = window.setTimeout(() => idle(() => {
      if (cancelled) return;
      const chain: { base: string; look: Partial<NoteState> }[] = [];
      const reqs: ReturnType<typeof requestFor>[] = [];
      // the letters just shown, and the ones already lined up: no letter comes back within ten hands
      const avoid = new Set(recentLetters());
      let s: NoteState = state;
      for (let i = 0; i < AHEAD; i++) {
        const b = baseOf(s);
        const kept = ahead.current.find((a) => a.base === b);
        const look = kept?.look ?? rollHand(s, { variety, locked: locks, avoid });
        if (look.sample) avoid.add(look.sample);
        chain.push({ base: b, look });
        // each hand ahead is the one after the hand before it
        s = { ...s, ...look };
        reqs.push(requestFor(s));
      }
      ahead.current = chain;
      prefetch(withTheirs(reqs));
      idle(() => {
        if (cancelled) return;
        const look = similarAhead.current?.base === base ? similarAhead.current.look : withSample(state, { ...pickSimilarHand({ seed: state.seed, style: state.style }), offsets: offsetsForNewHand(state.offsets) }, recentLetters());
        similarAhead.current = { base, look };
        prefetch(withTheirs([...reqs, requestFor({ ...state, ...look })]));
      });
    }), 80);
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
  const download = useCallback(async () => {
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
        if (r === 'saved') toast.success('Note downloaded', { description: `JPEG, ${res.width} × ${res.height} px` });
      };
      const r = await saveNote(res.blob, filename, coarse);
      // making the image took long enough that the browser wants a fresh tap before sharing
      if (r === 'needs-tap') {
        toast('Your note is ready', {
          description: `JPEG, ${res.width} × ${res.height} px`,
          action: { label: 'Save image', onClick: () => void saveNote(res.blob, filename, true).then(done) },
          duration: 10000,
        });
      } else done(r);
    } catch (e) {
      console.error(e);
      toast.error('Couldn’t make the image', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy((b) => ({ ...b, download: false }));
    }
  }, [requestKey, ink, pxPerMm, name, coarse, live, state.marks, state.signed, eff.inkKey, inkActive]);

  const font = useCallback(async () => {
    setBusy((b) => ({ ...b, font: true }));
    // let the spinner paint before the (blocking) font build
    await new Promise((r) => setTimeout(r, 40));
    try {
      const res = await exportFont(p, `${APP_NAME} – ${name} (${styleCard(state.style).title})`);
      toast.success('Font exported', { description: `${res.glyphs} glyphs, 3 versions of each letter` });
    } catch (e) {
      console.error(e);
      toast.error('Couldn’t build the font', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy((b) => ({ ...b, font: false }));
    }
  }, [p, name, state.style]);

  // R for a new hand, Shift R for a similar one, when not typing; ⌘\\ shows or hides the desk while writing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); posture.toggle(); return; }
      if (e.key !== 'r' && e.key !== 'R') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
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
    onShare: share,
    onDownload: download,
    onExportFont: font,
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

  const desk = !posture.writing;
  const reader = state.reader;

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

  return (
    <TooltipProvider>
      <div className={cn('min-h-dvh', !reader && 'lg:grid lg:grid-cols-[minmax(0,1fr)_auto]')}>
        <main
          className="relative min-w-0 px-4 pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-32 sm:px-8 lg:px-10 lg:pt-[72px] lg:pb-16"
          style={mobileSheet ? { paddingBottom: metrics.peek + 28 } : undefined}
        >
          <header
            ref={headerRef}
            className={cn(
              'absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top,0px))] flex items-baseline justify-between gap-4 text-[12.5px] text-muted-foreground transition-opacity duration-200 ease-out sm:inset-x-8 lg:inset-x-10 lg:top-5',
              !desk && 'opacity-0',
              !reader && 'pointer-events-none',
            )}
          >
            <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground/80">{APP_NAME}</span>
            <span className="flex min-w-0 items-baseline gap-2">
              {reader ? (
                <button type="button" onClick={() => update({ reader: false })} className="rounded-md px-1.5 py-1 underline decoration-[#cfc8b9] underline-offset-[3px] transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3">
                  Write your own
                </button>
              ) : (
                <span aria-live="polite" className={cn('truncate transition-opacity duration-200', editing && !isDesktop && 'opacity-0')}>
                  {editing ? (isDesktop ? 'Writing. Press Esc when you’re done.' : '') : coarse ? 'Tap the letter to write' : 'Click the letter to write on it'}
                </span>
              )}
              {/* the found letters, all of them (the archive) */}
              <a
                href={`${import.meta.env.BASE_URL}letters.html`}
                className={cn(
                  // a big enough target without making the line taller (the sheet's label sits just under it)
                  "pointer-events-auto relative shrink-0 rounded-md px-1.5 py-0.5 font-medium text-foreground/80 transition-[color,opacity] duration-150 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover-device:hover:text-foreground",
                  editing && !isDesktop && 'pointer-events-none opacity-0',
                )}
              >
                Letters
              </a>
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
            {pxPerMm > 0 && reader && (
              <ReaderView
                writing={writing}
                live={live ? { live, extras, inkKey: eff.inkKey } : null}
                paper={shownPaper}
                pxPerMm={pxPerMm}
                gap={SHEET_GAP}
                ink={ink}
                name={name}
                onWriteYourOwn={() => update({ reader: false })}
              />
            )}
            {pxPerMm > 0 && !reader && (
              <div ref={fitRef} className="origin-top">
                <div className="relative mx-auto" style={{ width: shownPaper.w * pxPerMm }}>
                  <SheetLabel title={sheetTitle} hand={myHandWords} width={shownPaper.w * pxPerMm} className="absolute bottom-2 left-0" />
                </div>
                <PaperEditor
                  ref={editor}
                  text={inkActive ? inkRef.current!.text() : state.text}
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
                    onPlainText={() => setPlainText((v) => { writePref('seedhand:plain-text', v ? '0' : '1'); return !v; })}
                  />
                </div>
                {plainText && (
                  <div className="mt-3 flex justify-center">
                    <DraftSlip value={state.text} onEdit={onEdit} onComposingChange={setComposing} width={shownPaper.w * pxPerMm + 16} />
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
          // above the keyboard and tray while writing; down to the control sheet otherwise
          reach={editing ? Math.max(220, Math.round(viewport.height * 0.58)) : Math.max(260, viewport.height - (mobileSheet ? metrics.peek : 0) - 12)}
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
