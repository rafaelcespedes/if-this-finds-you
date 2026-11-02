import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SlidersHorizontal, Shuffle } from 'lucide-react';
import { makeHand, withOverrides } from '@engine';
import { Panel, type PanelProps } from '@/components/Panel';
import { SheetView } from '@/components/SheetView';
import { DraftSlip } from '@/components/DraftSlip';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNoteState } from '@/hooks/useNoteState';
import { useWriting } from '@/hooks/useWriting';
import { copyText, downloadNote, exportFont } from '@/lib/actions';
import { clampOverride } from '@/lib/controls';
import { pickNewHand, writerName } from '@/lib/hands';
import { getInk } from '@/lib/inks';
import { getPaper } from '@/lib/papers';
import '@/lib/perf';
import { shareUrl } from '@/lib/state';

/** Screen scale ceiling: about the size of real paper on a laptop screen. */
const MAX_PX_PER_MM = 3.9;

export default function App() {
  const [state, update] = useNoteState();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState({ download: false, font: false });

  const natural = useMemo(() => makeHand(state.seed, state.style), [state.seed, state.style]);
  const p = useMemo(() => withOverrides(natural, state.overrides), [natural, state.overrides]);
  const paper = getPaper(state.paper);
  const ink = getInk(state.ink);
  const name = useMemo(() => writerName(state.seed), [state.seed]);

  // the page is written in a worker, so typing never waits for the hand
  const writing = useWriting({
    seed: state.seed, style: state.style, overrides: state.overrides, text: state.text, paper: state.paper, size: state.size,
  });
  // paper and writing switch together when the result arrives
  const shownPaper = writing ? getPaper(writing.paper) : paper;

  const deskRef = useRef<HTMLDivElement>(null);
  const deskW = useElementWidth(deskRef);
  const pxPerMm = deskW > 0 ? Math.min(MAX_PX_PER_MM, deskW / shownPaper.w) : 0;

  // ---------- actions ----------
  const newHand = useCallback(() => {
    update((s) => ({ ...pickNewHand({ seed: s.seed, style: s.style }), overrides: {} }));
  }, [update]);

  const share = useCallback(async () => {
    const ok = await copyText(shareUrl(state));
    if (ok) toast.success('Link copied', { description: 'It opens this exact note: hand, paper, ink and text.' });
    else toast.error('Couldn’t copy the link', { description: 'Copy it from the address bar instead.' });
  }, [state]);

  const download = useCallback(async () => {
    setBusy((b) => ({ ...b, download: true }));
    try {
      const req = { seed: state.seed, style: state.style, overrides: state.overrides, text: state.text, paper: state.paper, size: state.size };
      const res = await downloadNote(req, ink.color, pxPerMm || MAX_PX_PER_MM, `${name} note`);
      toast.success('Note downloaded', { description: `JPEG, ${res.width} × ${res.height} px` });
    } catch (e) {
      console.error(e);
      toast.error('Couldn’t make the image', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy((b) => ({ ...b, download: false }));
    }
  }, [state, ink.color, pxPerMm, name]);

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

  // R for a new hand, when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      newHand();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newHand]);

  const panelProps: PanelProps = {
    state,
    natural,
    p,
    name,
    busy,
    onNewHand: newHand,
    onSeed: (seed) => update({ seed, overrides: {} }),
    onStyle: (style) => update({ style }),
    onOverride: (key, v) => update((s) => ({ overrides: { ...s.overrides, [key]: clampOverride(key, v) } })),
    onResetOverrides: () => update({ overrides: {} }),
    onSize: (size) => update({ size }),
    onPaper: (paper) => update({ paper }),
    onInk: (ink) => update({ ink }),
    onShare: share,
    onDownload: download,
    onExportFont: font,
  };

  return (
    <TooltipProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_auto]">
        <main className="relative min-w-0 px-4 pt-12 pb-32 sm:px-8 lg:px-10 lg:pt-14 lg:pb-16">
          <div className="pointer-events-none absolute top-4 left-4 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground sm:left-8 lg:top-5 lg:left-10">
            Seedhand
          </div>
          <div ref={deskRef} className="mx-auto w-full max-w-[820px]">
            {pxPerMm > 0 && (
              <div className="flex flex-col items-center gap-6">
                {(writing ? writing.svgs : [null]).map((svg, i, all) => (
                  <SheetView
                    key={i}
                    paper={shownPaper}
                    pxPerMm={pxPerMm}
                    svg={svg}
                    ink={ink.color}
                    handKey={writing ? writing.handKey : ''}
                    index={i}
                    count={all.length}
                  />
                ))}
                <DraftSlip value={state.text} onChange={(t) => update({ text: t })} width={shownPaper.w * pxPerMm} />
              </div>
            )}
          </div>
        </main>

        {isDesktop ? (
          <aside className="sticky top-0 h-dvh py-3 pr-3">
            <div className="h-full w-[336px] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(60,45,20,0.05),0_12px_32px_-16px_rgba(60,45,20,0.18)] [scrollbar-width:thin]">
              <Panel {...panelProps} />
            </div>
          </aside>
        ) : (
          <MobileDock name={name} seed={state.seed} onNewHand={newHand} onOpen={() => setDrawerOpen(true)} />
        )}
      </div>

      {!isDesktop && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent aria-describedby={undefined}>
            <DrawerTitle className="sr-only">Hand, paper and ink</DrawerTitle>
            <DrawerDescription className="sr-only">Adjust how the note is written, then share or download it.</DrawerDescription>
            <div className="overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              <Panel {...panelProps} />
            </div>
          </DrawerContent>
        </Drawer>
      )}
      <Toaster offset={isDesktop ? 24 : 96} mobileOffset={{ bottom: 96 }} />
    </TooltipProvider>
  );
}

function MobileDock({ name, seed, onNewHand, onOpen }: { name: string; seed: string; onNewHand: () => void; onOpen: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-[560px] items-center gap-2 rounded-2xl border border-border bg-[color-mix(in_oklab,var(--panel)_92%,transparent)] p-2 pl-4 shadow-[0_10px_30px_-12px_rgba(60,45,20,0.35)] backdrop-blur-md">
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
