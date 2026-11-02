import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SlidersHorizontal, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { makeHand } from '@engine';
import { Panel, type PanelProps } from '@/components/Panel';
import { SheetView } from '@/components/SheetView';
import { DraftSlip } from '@/components/DraftSlip';
import { PaperEditor } from '@/components/PaperEditor';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNoteState } from '@/hooks/useNoteState';
import { useWriting } from '@/hooks/useWriting';
import { canShareLinks, copyText, exportFont, renderNote, saveNote, shareLink } from '@/lib/actions';
import { emForPaper } from '@/lib/compose';
import { applyEdit, EditLog, type Edit } from '@/lib/edits';
import { pickSimilarHand, writerName } from '@/lib/hands';
import { rollLook, type LockKey } from '@/lib/roll';
import { canTransition } from '@/hooks/useWriting';
import { inkColor } from '@/lib/inks';
import { getOccasion } from '@/lib/occasions';
import { getPaper } from '@/lib/papers';
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
  const [state, update] = useNoteState();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState({ download: false, font: false });
  const [editing, setEditing] = useState(false);
  const [plainText, setPlainText] = useState(() => readPref('seedhand:plain-text') === '1');
  const [variety, setVariety] = useState(() => Number(readPref('seedhand:variety') ?? 60) || 60);
  const [locks, setLocks] = useState<Set<LockKey>>(() => new Set((readPref('seedhand:locks') ?? '').split(',').filter(Boolean) as LockKey[]));
  const coarse = useMediaQuery('(pointer: coarse)');

  // natural hand (seed) + your offsets + occasion -> the hand on the page
  const natural = useMemo(() => makeHand(state.seed, state.style), [state.seed, state.style]);
  const eff = useMemo(() => effective(natural, state), [natural, state]);
  const p = useMemo(() => effectiveHand(natural, eff), [natural, eff]);
  const paper = getPaper(state.paper);
  const ink = inkColor(state.ink);
  const name = useMemo(() => writerName(state.seed), [state.seed]);

  const request: Omit<WriteRequest, 'id'> = {
    seed: state.seed, style: state.style, overrides: eff.overrides, text: state.text, paper: state.paper,
    size: eff.size, lineSpacing: eff.lineSpacing, inkKey: eff.inkKey, inkColor: ink,
  };
  // the page is written in a worker, so typing never waits for the hand
  const writing = useWriting(request);
  // paper and writing switch together when the result arrives
  const shownPaper = writing ? getPaper(writing.paper) : paper;

  const deskRef = useRef<HTMLDivElement>(null);
  const deskW = useElementWidth(deskRef);
  const pxPerMm = deskW > 0 ? Math.min(MAX_PX_PER_MM, deskW / shownPaper.w) : 0;

  useEffect(() => {
    document.title = `${name} – Seedhand`;
  }, [name]);

  // ---------- edits: every change arrives as one Edit (paper or plain text) ----------
  const onEdit = useCallback((e: Edit) => {
    editLog.push(e);
    update((s) => ({ text: applyEdit(s.text, e) }));
  }, [update]);

  // ---------- hands ----------
  // a new hand rolls the whole look (writer, style, pen, ink, paper, size, every slider), except what's locked
  const newHand = useCallback(() => {
    update((s) => rollLook(s, { variety, locked: locks }));
  }, [update, variety, locks]);
  const similarHand = useCallback(() => {
    update((s) => ({ ...pickSimilarHand({ seed: s.seed, style: s.style }), offsets: offsetsForNewHand(s.offsets) }));
  }, [update]);

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

  const requestKey = JSON.stringify(request);
  const download = useCallback(async () => {
    setBusy((b) => ({ ...b, download: true }));
    try {
      const res = await renderNote(JSON.parse(requestKey), ink, pxPerMm || MAX_PX_PER_MM);
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
  }, [requestKey, ink, pxPerMm, name, coarse]);

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

  // R for a new hand, Shift R for a similar one, when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [newHand, similarHand]);

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
    onStyle: (style) => update({ style }),
    onControl: (key, v) => update((s) => ({ offsets: { ...s.offsets, [key]: offsetFor(key, v, natural, s) } })),
    onResetControl: (key) => update((s) => {
      const offsets = { ...s.offsets };
      delete offsets[key];
      return { offsets };
    }),
    onResetOffsets: () => update({ offsets: {}, penSize: 'medium' }),
    onPen: (pen) => update({ pen }),
    onPenSize: (penSize) => update({ penSize }),
    onInk: (ink) => update({ ink }),
    onPaper: (paper) => update({ paper }),
    onSize: (size) => update({ size }),
    onOccasion: (id) => update((s) => {
      const occ = getOccasion(id);
      if (!occ) return { occasion: null };
      // an occasion sets the scene once: its paper, and its pen when the engine has pens
      return { occasion: occ.id, amount: s.occasion === occ.id ? s.amount : 1, paper: occ.paper ?? s.paper, pen: PENS_LIVE && occ.pen ? occ.pen : s.pen };
    }),
    onAmount: (amount) => update({ amount }),
    onVariety: (v) => { setVariety(v); writePref('seedhand:variety', String(Math.round(v))); },
    onShare: share,
    onDownload: download,
    onExportFont: font,
  };

  return (
    <TooltipProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_auto]">
        <main className="relative min-w-0 px-4 pt-12 pb-32 sm:px-8 lg:px-10 lg:pt-14 lg:pb-16">
          <header className="pointer-events-none absolute inset-x-4 top-4 flex items-baseline justify-between gap-4 text-[12.5px] text-muted-foreground sm:inset-x-8 lg:inset-x-10 lg:top-5">
            <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground/80">Seedhand</span>
            <span aria-live="polite" className={cn('truncate transition-opacity duration-200', editing && !isDesktop && 'opacity-0')}>
              {editing ? (isDesktop ? 'Writing. Press Esc when you’re done.' : '') : coarse ? 'Tap the letter to write on it' : 'Click the letter to write on it'}
            </span>
          </header>
          <div ref={deskRef} className="mx-auto w-full max-w-[820px]">
            {pxPerMm > 0 && (
              <>
                <PaperEditor
                  text={state.text}
                  onEdit={onEdit}
                  writerName={name}
                  result={writing}
                  pxPerMm={pxPerMm}
                  sheetW={shownPaper.w}
                  sheetH={shownPaper.h}
                  gapPx={SHEET_GAP}
                  ink={ink}
                  onEditingChange={setEditing}
                >
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
                </PaperEditor>
                <div className="mx-auto mt-4 flex items-center justify-center text-[12.5px] text-muted-foreground" style={{ width: shownPaper.w * pxPerMm }}>
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
                    <DraftSlip value={state.text} onEdit={onEdit} width={shownPaper.w * pxPerMm + 16} />
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {!isDesktop && editing && (
          <div className="fixed top-0 right-0 z-40 p-3 pt-[max(12px,env(safe-area-inset-top))]">
            <Button
              variant="outline"
              className="h-11 rounded-full px-4 shadow-[0_6px_20px_-8px_rgba(60,45,20,0.35)] animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:slide-in-from-top-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
            >
              Done
            </Button>
          </div>
        )}
        {isDesktop ? (
          <aside className="sticky top-0 h-dvh py-3 pr-3">
            <div className="panel-scroll h-full w-[336px] overflow-y-auto overscroll-contain rounded-2xl bg-panel shadow-[0_1px_2px_rgba(60,45,20,0.07),0_10px_30px_-14px_rgba(60,45,20,0.22)]">
              <Panel {...panelProps} />
            </div>
          </aside>
        ) : (
          <MobileDock name={name} seed={state.seed} onNewHand={newHand} onOpen={() => setDrawerOpen(true)} hidden={editing} />
        )}
      </div>

      {!isDesktop && (
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
