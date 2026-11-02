import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SlidersHorizontal, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAP, makeHand } from '@engine';
import { Panel, type PanelProps } from '@/components/Panel';
import { SheetView } from '@/components/SheetView';
import { DraftSlip } from '@/components/DraftSlip';
import { PaperEditor, type FormatCommand, type PaperEditorApi } from '@/components/PaperEditor';
import { PenTray } from '@/components/PenTray';
import { ReaderView } from '@/components/ReaderView';
import { usePosture } from '@/hooks/usePosture';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
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
import { pickSimilarHand, writerName } from '@/lib/hands';
import { rollLook, type LockKey } from '@/lib/roll';
import { canTransition } from '@/hooks/useWriting';
import { inkColor } from '@/lib/inks';
import { getOccasion } from '@/lib/occasions';
import { getPaper } from '@/lib/papers';
import { mapGeometry } from '@/lib/geometry';
import { LIVE, engineGeometry, liveExtras, liveLayout } from '@/lib/live';
import { LiveSheets } from '@/components/LiveSheets';
import { renderLiveNote } from '@/lib/actions';
import { flushSync } from 'react-dom';
import { effective, effectiveHand, offsetFor } from '@/lib/params';
import { PENS_LIVE } from '@/lib/pens';
import '@/lib/perf';
import { offsetsForNewHand, shareUrl } from '@/lib/state';
import type { WriteRequest } from '@/lib/write-protocol';

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
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const request: Omit<WriteRequest, 'id'> = {
    seed: state.seed, style: state.style, overrides: eff.overrides, text: state.text, paper: state.paper,
    size: eff.size, lineSpacing: eff.lineSpacing, inkKey: eff.inkKey, inkColor: ink,
    marks: state.marks, signed: state.signed, writerName: name,
  };
  // the page is written in a worker, so typing never waits for the hand; an empty page shows a placeholder in the hand
  // the live page (engines with incremental layout) is written here on the main thread; otherwise a worker writes it
  const writing = useWriting({ ...request, placeholder: placeholderFor(state.paper) }, composing || LIVE);
  const committed = useRef(state.text);
  if (!composing) committed.current = state.text;
  const live = useMemo(
    () => (LIVE ? liveLayout(p, committed.current, paper, eff.size, eff.lineSpacing) : null),
    // laid out from the committed text: an IME's composing text waits until it commits
    [p, committed.current, paper, eff.size, eff.lineSpacing],
  );
  const extras = useMemo(
    () => (live ? liveExtras(live, { marks: state.marks, signed: state.signed, writerName: name, placeholder: placeholderFor(state.paper), text: live.page.text }) : []),
    [live, state.marks, state.signed, name, state.paper],
  );
  const firstVisit = useRef(window.location.hash.length < 2);
  // paper and writing switch together when the result arrives
  const shownPaper = live ? paper : writing ? getPaper(writing.paper) : paper;
  const geometry = useMemo(() => (live ? engineGeometry(live) : writing ? mapGeometry(writing) : null), [live, writing]);

  const deskRef = useRef<HTMLDivElement>(null);
  const deskW = useElementWidth(deskRef);
  const pxPerMm = deskW > 0 ? Math.min(MAX_PX_PER_MM, deskW / shownPaper.w) : 0;

  useEffect(() => {
    document.title = `${name} – Seedhand`;
  }, [name]);

  // ---------- edits: every change arrives as one Edit (paper or plain text) ----------
  const posture = usePosture(editing);
  const onEdit = useCallback((e: Edit) => {
    editLog.push(e);
    if (e.source === 'paper') posture.onTyped();
    update((s) => {
      const doc = applyEdit({ text: s.text, marks: s.marks, signed: s.signed }, e);
      return { text: doc.text, marks: doc.marks };
    });
  }, [update, posture.onTyped]);

  // ---------- pen-only formatting: underline by hand, press harder, sign ----------
  const editor = useRef<PaperEditorApi>(null);
  const onFormat = useCallback((cmd: FormatCommand, from: number, to: number) => {
    if (cmd === 'ps') return;
    update((s) => ({ marks: toggleMark({ text: s.text, marks: s.marks, signed: s.signed }, cmd, from, to).marks }));
  }, [update]);
  const formatFromTray = (cmd: 'underline' | 'press') => {
    const [a, b] = editor.current?.selection() ?? [0, 0];
    const [from, to] = a === b ? wordAround(state.text, a) : [a, b];
    onFormat(cmd, from, to);
  };
  const toggleSigned = () => update((s) => ({ signed: !s.signed }));

  const lookChange = useCallback((fn: () => void) => {
    if (LIVE && canTransition()) document.startViewTransition(() => flushSync(fn));
    else fn();
  }, []);

  // ---------- hands ----------
  // a new hand rolls the whole look (writer, style, pen, ink, paper, size, every slider), except what's locked
  const newHand = useCallback(() => {
    lookChange(() => update((s) => rollLook(s, { variety, locked: locks })));
  }, [update, variety, locks, lookChange]);
  const similarHand = useCallback(() => {
    lookChange(() => update((s) => ({ ...pickSimilarHand({ seed: s.seed, style: s.style }), offsets: offsetsForNewHand(s.offsets) })));
  }, [update, lookChange]);

  // ---------- actions ----------
  const share = useCallback(async () => {
    const url = shareUrl(state);
    const ok = await copyText(url);
    // on phones (and anywhere with a share sheet) the toast offers to send it straight on
    const action = canShareLinks() ? { label: 'Share…', onClick: () => void shareLink(url, `A note in ${name}’s hand`) } : undefined;
    if (ok) toast.success('Link copied', { description: 'It opens this exact note: hand, pen, paper and text.', action });
    else if (action) void shareLink(url, `A note in ${name}’s hand`);
    else toast.error('Couldn’t copy the link', { description: 'Copy it from the address bar instead.' });
  }, [state, name]);

  // the download never carries the empty-page placeholder
  const requestKey = JSON.stringify(request);
  const download = useCallback(async () => {
    setBusy((b) => ({ ...b, download: true }));
    try {
      const res = live
        ? await renderLiveNote(live, extras, eff.inkKey && eff.inkKey !== 'auto' ? eff.inkKey : undefined, ink, pxPerMm || MAX_PX_PER_MM)
        : await renderNote(JSON.parse(requestKey), ink, pxPerMm || MAX_PX_PER_MM);
      const filename = `${name} note`;
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
  }, [requestKey, ink, pxPerMm, name, coarse, live, extras, eff.inkKey]);

  const font = useCallback(async () => {
    setBusy((b) => ({ ...b, font: true }));
    // let the spinner paint before the (blocking) font build
    await new Promise((r) => setTimeout(r, 40));
    try {
      const res = await exportFont(p, `Seedhand ${name} ${state.style}`);
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
      if (e.shiftKey) similarHand();
      else newHand();
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
    variety,
    locks,
    onToggleLock: (key) => setLocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      writePref('seedhand:locks', [...next].join(','));
      return next;
    }),
    busy,
    onNewHand: newHand,
    onSimilarHand: similarHand,
    onSeed: (seed) => update((s) => ({ seed, offsets: offsetsForNewHand(s.offsets) })),
    onStyle: (style) => lookChange(() => update({ style })),
    onControl: (key, v) => update((s) => ({ offsets: { ...s.offsets, [key]: offsetFor(key, v, natural, s) } })),
    onResetControl: (key) => update((s) => {
      const offsets = { ...s.offsets };
      delete offsets[key];
      return { offsets };
    }),
    onResetOffsets: () => update({ offsets: {}, penSize: 'medium' }),
    onPen: (pen) => update({ pen }),
    onPenSize: (penSize) => update({ penSize }),
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
  };

  const desk = !posture.writing;
  const reader = state.reader;

  return (
    <TooltipProvider>
      <div className={cn('min-h-dvh', !reader && 'lg:grid lg:grid-cols-[minmax(0,1fr)_auto]')}>
        <main className="relative min-w-0 px-4 pt-12 pb-32 sm:px-8 lg:px-10 lg:pt-14 lg:pb-16">
          <header
            className={cn(
              'absolute inset-x-4 top-4 flex items-baseline justify-between gap-4 text-[12.5px] text-muted-foreground transition-opacity duration-200 ease-out sm:inset-x-8 lg:inset-x-10 lg:top-5',
              !desk && 'opacity-0',
              !reader && 'pointer-events-none',
            )}
          >
            <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground/80">Seedhand</span>
            {reader ? (
              <button type="button" onClick={() => update({ reader: false })} className="rounded-md px-1.5 py-1 underline decoration-[#cfc8b9] underline-offset-[3px] transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3">
                Write your own
              </button>
            ) : (
              <span aria-live="polite" className={cn('truncate transition-opacity duration-200', editing && !isDesktop && 'opacity-0')}>
                {editing ? (isDesktop ? 'Writing. Press Esc when you’re done.' : '') : coarse ? 'Tap the letter to write on it' : 'Click the letter to write on it'}
              </span>
            )}
          </header>
          <div ref={deskRef} className="mx-auto w-full max-w-[820px]">
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
              <>
                <PaperEditor
                  ref={editor}
                  text={state.text}
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
                  onComposingChange={setComposing}
                >
                  {live ? (
                    <LiveSheets
                      live={live}
                      pxPerMm={pxPerMm}
                      gapPx={SHEET_GAP}
                      ink={ink}
                      inkKey={eff.inkKey}
                      extras={extras}
                      handKey={state.seed + ':' + state.style}
                      writeOut={firstVisit.current}
                      hold="word"
                    />
                  ) : (
                    <div className="flex flex-col" style={{ gap: SHEET_GAP }}>
                      {(writing ? writing.svgs : [null]).map((svg, i, all) => (
                        <SheetView
                          key={i}
                          paper={shownPaper}
                          pxPerMm={pxPerMm}
                          svg={svg}
                          ink={writing ? writing.inkColor : ink}
                          handKey={writing ? writing.handKey : ''}
                          intro={!canTransition()}
                          index={i}
                          count={all.length}
                        />
                      ))}
                    </div>
                  )}
                </PaperEditor>
                <div
                  className={cn('mx-auto mt-4 flex items-center justify-center text-[12.5px] text-muted-foreground transition-opacity duration-200', !desk && 'pointer-events-none opacity-0')}
                  style={{ width: shownPaper.w * pxPerMm }}
                >
                  <button
                    type="button"
                    onClick={() => setPlainText((v) => { writePref('seedhand:plain-text', v ? '0' : '1'); return !v; })}
                    className="rounded-md px-1.5 py-1 underline decoration-[#cfc8b9] underline-offset-[3px] transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3"
                    aria-expanded={plainText}
                  >
                    {plainText ? 'Hide plain text' : 'Edit as plain text'}
                  </button>
                </div>
                {plainText && (
                  <div className="mt-3 flex justify-center">
                    <DraftSlip value={state.text} onEdit={onEdit} onComposingChange={setComposing} width={shownPaper.w * pxPerMm + 16} />
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {!reader && !isDesktop && editing && (
          <PenTray
            viewport={viewport}
            signed={state.signed}
            onUnderline={() => formatFromTray('underline')}
            onPress={() => formatFromTray('press')}
            onPS={() => editor.current && insertPS(editor.current, state.text, onEdit)}
            onSign={toggleSigned}
            onDone={() => editor.current?.blur()}
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
        ) : (
          <MobileDock name={name} seed={state.seed} onNewHand={newHand} onOpen={() => setDrawerOpen(true)} hidden={editing} />
        ))}
      </div>

      {!reader && !isDesktop && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent aria-describedby={undefined}>
            <DrawerTitle className="sr-only">Hand, paper and ink</DrawerTitle>
            <DrawerDescription className="sr-only">Adjust how the note is written, then share or download it.</DrawerDescription>
            <div className="overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              <Panel {...panelProps} compact />
            </div>
          </DrawerContent>
        </Drawer>
      )}
      <Toaster offset={isDesktop ? 24 : 96} mobileOffset={{ bottom: 96 }} />
    </TooltipProvider>
  );
}

/** What the writer pencils in on an empty page: a salutation on letter paper, the date in a notebook. */
function placeholderFor(paper: string) {
  if (paper === 'plain' || paper === 'laid' || paper === 'postcard') return 'Dear …,';
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return 'Dear …,';
  }
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

function MobileDock({ name, seed, onNewHand, onOpen, hidden }: { name: string; seed: string; onNewHand: () => void; onOpen: () => void; hidden: boolean }) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-300 ease-[var(--ease-drawer)] motion-reduce:transition-opacity',
        hidden && 'pointer-events-none translate-y-[120%] opacity-0 motion-reduce:translate-y-0',
      )}
    >
      <div className="mx-auto flex max-w-[560px] items-center gap-2 rounded-2xl bg-[color-mix(in_oklab,var(--panel)_94%,transparent)] p-2 pl-4 shadow-[0_1px_2px_rgba(60,45,20,0.08),0_12px_32px_-12px_rgba(60,45,20,0.38)] backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] leading-tight font-medium">{name}</div>
          <div className="tabular truncate text-[12px] text-muted-foreground">{seed}</div>
        </div>
        <Button onClick={onNewHand} className="h-11 px-3.5">
          <Shuffle aria-hidden /> New hand
        </Button>
        <Button variant="secondary" size="icon" onClick={onOpen} aria-label="Hand, paper and ink" className="size-11">
          <SlidersHorizontal />
        </Button>
      </div>
    </div>
  );
}
