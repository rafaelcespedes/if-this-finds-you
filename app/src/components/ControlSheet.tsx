// The phone's control sheet: always there, at three heights, like the sheets in Maps or Find My.
//   peek  the writer, New hand, share, and the three tabs (tap one to open it)
//   half  one tab's controls, with the letter shrunk to fit above the sheet, so every change shows
//   full  everything, scrolling; while a finger slides a control, the sheet steps back to show the page
// Drag the top to move between heights (a flick goes on to the next one); below full height the content drags
// the sheet too, at full height it scrolls. The sheet is never modal: focus and the page stay free, so a tap
// on the letter always starts writing.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Download, Link2, Loader2, Share, Shuffle, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Advanced, Credits, HandControls, PenPaperControls, WritingControls, type PanelProps } from '@/components/Panel';
import { cn } from '@/lib/utils';

export type Detent = 'peek' | 'half' | 'full';
type Tab = 'hand' | 'writing' | 'pen';
const TABS: { id: Tab; label: string }[] = [
  { id: 'hand', label: 'Hand' },
  { id: 'writing', label: 'Writing' },
  { id: 'pen', label: 'Pen & paper' },
];

/** How much of the screen the sheet covers at each height (px, safe area included). */
export interface SheetMetrics {
  peek: number;
  half: number;
  /** the gap kept above the sheet at full height */
  top: number;
}

interface Props extends PanelProps {
  /** false while writing on the letter: the sheet steps away for the pen tray */
  open: boolean;
  detent: Detent;
  onDetent: (d: Detent) => void;
  onMetrics: (m: SheetMetrics) => void;
  /** while the sheet is being dragged: how much of the screen it covers, each frame (null when it lets go) */
  onDragging: (visible: number | null) => void;
  /** at full height, while a finger slides a control: where that control sits on screen (null when it lets go) */
  onAdjusting: (box: { top: number; bottom: number } | null) => void;
}

/** env(safe-area-inset-*) in px (0 without a notch, or without viewport-fit=cover). */
export function useSafeInsets() {
  const [v, setV] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);
    const read = () => {
      const cs = getComputedStyle(probe);
      const next = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
      setV((o) => (o.top === next.top && o.bottom === next.bottom ? o : next));
    };
    read();
    window.addEventListener('resize', read);
    return () => {
      window.removeEventListener('resize', read);
      probe.remove();
    };
  }, []);
  return v;
}

function useWindowHeight() {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}

export function ControlSheet({ open, detent, onDetent, onMetrics, onDragging, onAdjusting, ...props }: Props) {
  const safe = useSafeInsets();
  const ih = useWindowHeight();
  const peekRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const [peekH, setPeekH] = useState(124);
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => t.id === readTab())?.id ?? 'hand');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([tab]));

  useLayoutEffect(() => {
    const el = peekRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPeekH(Math.round(el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const top = Math.round(safe.top + 8);
  const height = ih - top;
  const vPeek = peekH + safe.bottom;
  const vHalf = Math.min(height, Math.max(vPeek + 230, Math.round(ih * 0.5)));
  const visibleAt = useCallback((d: Detent) => (d === 'peek' ? vPeek : d === 'half' ? vHalf : height), [vPeek, vHalf, height]);

  useEffect(() => onMetrics({ peek: vPeek, half: vHalf, top }), [vPeek, vHalf, top, onMetrics]);

  // ---------- settling: for a moment after the sheet moves, its controls ignore touches ----------
  // (a tap that opens the sheet must never land on the control that slides in under the finger)
  const [settling, setSettling] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSettling(true);
    const t = window.setTimeout(() => setSettling(false), 450);
    return () => window.clearTimeout(t);
  }, [detent, open]);

  // only the full sheet scrolls; going down from it starts the tab at its top again
  useEffect(() => {
    if (detent !== 'full' && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [detent]);

  const pickTab = (t: Tab) => {
    setTab(t);
    writeTab(t);
    setVisited((v) => (v.has(t) ? v : new Set(v).add(t)));
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    if (detent === 'peek') onDetent('half');
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = TABS[(i + d + TABS.length) % TABS.length];
    pickTab(next.id);
    requestAnimationFrame(() => document.getElementById(`sheet-tab-${next.id}`)?.focus());
  };

  // Escape folds the sheet back down
  useEffect(() => {
    if (detent === 'peek') return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      onDetent('peek');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [detent, onDetent]);

  // ---------- position: the sheet is `height` tall and slides down to show only `visible` px ----------
  const placed = useRef(false);
  const place = useCallback((visible: number, animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    const motion = animate && placed.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = motion ? 'transform 500ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    el.style.transform = `translate3d(0, ${Math.round(height - visible)}px, 0)`;
    placed.current = true;
  }, [height]);
  const drag = useRef<{ id: number; x0: number; y0: number; from: number; inBody: boolean; active: boolean; at: number; samples: [number, number][] } | null>(null);
  useLayoutEffect(() => {
    if (drag.current?.active) return;
    // closed (writing on the letter): just out of sight below the screen
    place(open ? visibleAt(detent) : -24, true);
  }, [open, detent, visibleAt, place]);

  // ---------- the drag ----------
  const suppressClick = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select')) return;
    const from = visibleAt(detent);
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from, at: from, inBody: !!t.closest('.sheet-body'), active: false, samples: [[e.timeStamp, e.clientY]] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.active) {
      if (Math.hypot(dx, dy) < 8) return;
      // sideways belongs to the rows and sliders; at full height the content scrolls instead
      if (Math.abs(dx) > Math.abs(dy) || (d.inBody && detent === 'full')) { drag.current = null; return; }
      d.active = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* fine */ }
    }
    e.preventDefault();
    let v = d.from - dy;
    // past the top or below the peek the sheet gives a little, then holds
    if (v > height) v = height + (v - height) * 0.2;
    if (v < vPeek) v = vPeek - Math.min(60, (vPeek - v) * 0.3);
    d.at = v;
    d.samples.push([e.timeStamp, e.clientY]);
    if (d.samples.length > 6) d.samples.shift();
    place(v, false);
    onDragging(Math.round(v));
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;
    suppressClick.current = e.type === 'pointerup';
    // velocity over the last moments (px per ms, positive downwards)
    const [t0, y0] = d.samples[0];
    const [t1, y1] = d.samples[d.samples.length - 1];
    const vel = t1 > t0 && e.timeStamp - t1 < 80 ? (y1 - y0) / (t1 - t0) : 0;
    const order: Detent[] = ['peek', 'half', 'full'];
    const projected = d.at - vel * 220;
    let target = order.reduce((a, b) => (Math.abs(visibleAt(b) - projected) < Math.abs(visibleAt(a) - projected) ? b : a));
    // a flick always moves at least one height
    if (target === detent && Math.abs(vel) > 0.45) target = order[Math.min(2, Math.max(0, order.indexOf(detent) + (vel < 0 ? 1 : -1)))];
    if (target === detent) place(visibleAt(detent), true);
    else onDetent(target);
    onDragging(null);
  };

  // a control being slid at full height: the letter moves clear of it (see the sheet's CSS for the rest)
  useEffect(() => {
    const el = contentRef.current;
    if (!el || detent !== 'full') return;
    const on = (e: Event) => {
      const { active } = (e as CustomEvent<{ active: boolean }>).detail;
      const row = (e.target as Element).closest('[data-row]');
      const r = row?.getBoundingClientRect();
      onAdjusting(active && r ? { top: r.top - 10, bottom: r.bottom + 10 } : null);
    };
    el.addEventListener('seedhand:slide', on);
    return () => {
      el.removeEventListener('seedhand:slide', on);
      onAdjusting(null);
    };
  }, [detent, open, onAdjusting]);

  const expanded = detent !== 'peek';
  const cycle = () => onDetent(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek');

  return (
    <section
      ref={contentRef}
      aria-label="Hand, paper and ink"
      data-detent={detent}
      inert={!open}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onWheel={(e) => {
        // a mouse or trackpad over the half sheet: scrolling down opens it fully, where it scrolls
        if (detent === 'half' && e.deltaY > 4) onDetent('full');
      }}
      onClickCapture={(e) => {
        // the end of a drag isn't a tap
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
      className="control-sheet fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[640px] flex-col rounded-t-[20px] border-t border-border bg-panel shadow-[0_-1px_2px_rgba(60,45,20,0.05),0_-10px_36px_-14px_rgba(40,30,10,0.3)] outline-none will-change-transform after:absolute after:inset-x-0 after:top-full after:h-[40vh] after:bg-inherit after:content-['']"
      style={{ height }}
    >
      <div ref={peekRef} data-fade className="shrink-0 touch-none px-4">
        {/* the grabber: drag it, or tap to go up a height (and back down from the top) */}
        <div aria-hidden onClick={cycle} className="-mx-4 flex h-5 cursor-grab items-end justify-center">
          <span className="h-[5px] w-9 rounded-full bg-[#d4cec2]" />
        </div>
        <div className="flex items-center gap-2 pt-1.5 pb-2.5">
          <button
            type="button"
            onClick={() => onDetent(expanded ? 'peek' : 'half')}
            aria-expanded={expanded}
            aria-label={`${props.name}. ${expanded ? 'Fold the controls away' : 'Show the controls'}`}
            className="min-h-11 min-w-0 flex-1 rounded-lg py-0.5 pl-1 text-left select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="block truncate text-[15px] leading-tight font-medium tracking-[-0.01em]">{props.name}</span>
            <span className="tabular block truncate text-[12px] leading-snug text-muted-foreground">{props.state.seed}</span>
          </button>
          <Button onClick={props.onNewHand} className="h-11 px-3.5">
            <Shuffle aria-hidden /> New hand
          </Button>
          <ShareMenu {...props} />
        </div>
        <div role="tablist" aria-label="Controls" onKeyDown={onTabKey} className="mb-3 grid grid-cols-3 gap-0.5 rounded-xl bg-secondary p-0.5">
          {TABS.map((t) => {
            const on = expanded && t.id === tab;
            return (
              <button
                key={t.id}
                id={`sheet-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`sheet-pane-${t.id}`}
                tabIndex={t.id === tab ? 0 : -1}
                onClick={() => pickTab(t.id)}
                className={cn(
                  'h-10 rounded-[10px] text-[13px] font-medium pointer-coarse:h-11 transition-[background-color,color,box-shadow] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  on
                    ? 'bg-[#fffefb] text-foreground shadow-[0_1px_2px_rgba(40,30,10,0.12),0_0_0_0.5px_rgba(40,30,10,0.06)]'
                    : 'text-muted-foreground active:bg-accent',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={bodyRef}
        className={cn('sheet-body min-h-0 flex-1 overscroll-contain px-5 pt-1', settling && 'pointer-events-none')}
        style={{ paddingBottom: safe.bottom + 24 }}
        inert={!expanded}
      >
        {TABS.map((t) => (
          <div key={t.id} id={`sheet-pane-${t.id}`} role="tabpanel" aria-labelledby={`sheet-tab-${t.id}`} hidden={t.id !== tab}>
            {visited.has(t.id) && <Pane tab={t.id} {...props} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function Pane({ tab, ...props }: PanelProps & { tab: Tab }) {
  if (tab === 'hand') {
    return (
      <>
        <HandControls {...props} />
        <div className="mt-2">
          <Credits p={props.p} sample={props.state.sample} flush />
        </div>
      </>
    );
  }
  if (tab === 'writing') {
    return (
      <>
        <WritingControls {...props} />
        <Advanced {...props} flush />
      </>
    );
  }
  return <PenPaperControls {...props} rows />;
}

/** Share link, download, font: one button in the sheet's top row, the way a phone shares. */
function ShareMenu({ busy, onShare, onDownload, onExportFont }: PanelProps) {
  const working = busy.download || busy.font;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="icon" aria-label="Share or download" className="size-11">
          {working ? <Loader2 className="animate-spin" aria-hidden /> : <Share aria-hidden />}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[248px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-2xl border border-border bg-[color-mix(in_oklab,#fdfcf9_96%,transparent)] p-1.5 shadow-[0_1px_2px_rgba(60,45,20,0.08),0_16px_40px_-12px_rgba(40,30,10,0.35)] backdrop-blur-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100 [--tw-animation-duration:160ms]"
        >
          <MenuItem onSelect={onShare} icon={<Link2 aria-hidden />}>Share link</MenuItem>
          <MenuItem onSelect={onDownload} icon={busy.download ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} disabled={busy.download}>
            Download note
          </MenuItem>
          <DropdownMenu.Separator className="mx-2 my-1 h-px bg-border" />
          <MenuItem onSelect={onExportFont} icon={busy.font ? <Loader2 className="animate-spin" aria-hidden /> : <Type aria-hidden />} disabled={busy.font}>
            Export font file (.otf)
          </MenuItem>
          <p className="px-3 pt-0.5 pb-2 text-[11.5px] leading-snug text-muted-foreground">
            The font holds 3 versions of each letter. The page varies endlessly.
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({ children, icon, onSelect, disabled }: { children: React.ReactNode; icon: React.ReactNode; onSelect: () => void; disabled?: boolean }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className="flex h-11 cursor-default items-center justify-between gap-3 rounded-[10px] px-3 text-[14px] text-foreground outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent [&_svg]:size-[17px] [&_svg]:text-muted-foreground"
    >
      {children}
      {icon}
    </DropdownMenu.Item>
  );
}

function readTab() {
  try { return localStorage.getItem('seedhand:sheet-tab'); } catch { return null; }
}
function writeTab(t: string) {
  try { localStorage.setItem('seedhand:sheet-tab', t); } catch { /* fine */ }
}
