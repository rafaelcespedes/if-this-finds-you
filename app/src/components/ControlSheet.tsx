// The phone's control sheet: always there, at three heights, like the sheets in Maps or Find My.
//   peek  the writer (tap: about this hand), New hand, share, and what's on the page
//   half  the look: paper, pen and ink first, with the letter shrunk to fit above the sheet, so every change shows
//   full  everything, scrolling (More folded at the end); while a finger slides a control, the sheet steps back
// Drag the top to move between heights (a flick goes on to the next one); below full height the content drags
// the sheet too, at full height it scrolls. The sheet is never modal: focus and the page stay free, so a tap
// on the letter always starts writing.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AboutHand, LetterStatus, LookControls, MoreControls, type PanelProps } from '@/components/Panel';
import { styleName } from '@/lib/styles';
import { cn } from '@/lib/utils';
// the look being compared (?look=reading-room): "Bring another" in words (src/themes/reading-room/)
import { LOOK } from '@/lib/look';
import { BringAnother } from '@/themes/reading-room/BringAnother';
import { PhoneStamp } from '@/themes/postmarked/tool';

export type Detent = 'peek' | 'half' | 'full';
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

export function ControlSheet({ open, detent, onDetent: setDetent, onMetrics, onDragging, onAdjusting, ...props }: Props) {
  const safe = useSafeInsets();
  const ih = useWindowHeight();
  const peekRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const [peekH, setPeekH] = useState(124);

  useLayoutEffect(() => {
    const el = peekRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPeekH(Math.round(el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const top = Math.round(safe.top + 8);
  const height = ih - top;
  // a short screen (a phone held sideways): half the screen would be most of it, so the sheet goes straight
  // to its full, scrolling height instead of a half one that can't scroll
  const short = ih < 520;
  const onDetent = useCallback((d: Detent) => setDetent(d === 'half' && short ? 'full' : d), [setDetent, short]);
  const pillRef = useRef<HTMLButtonElement>(null);
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

  // Escape folds the sheet back down
  useEffect(() => {
    if (detent === 'peek') return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      // focus goes back to what opened it, not to the page (the folded sheet is inert)
      const inside = contentRef.current?.contains(document.activeElement);
      onDetent('peek');
      if (inside) requestAnimationFrame(() => pillRef.current?.focus({ preventScroll: true }));
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
    // a finger's drag never produces the click a mouse's does, so the flag never outlives a new press
    suppressClick.current = false;
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
    suppressClick.current = e.type === 'pointerup' && e.pointerType === 'mouse';
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

  // a keyboard moving through the sheet: open it fully (it scrolls there) and keep what has focus in view
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const on = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t.matches(':focus-visible')) return;
      if (detent !== 'full') onDetent('full');
      requestAnimationFrame(() => t.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    };
    el.addEventListener('focusin', on);
    return () => el.removeEventListener('focusin', on);
  }, [detent, onDetent]);

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
        {/* large text: Find another goes under the name rather than squeezing it to nothing */}
        <div className="flex flex-wrap items-center gap-2 pt-1.5 pb-2.5">
          <AboutHand {...props}>
            <button
              type="button"
              aria-label={`${props.name}: about this hand`}
              className="group min-h-11 min-w-[7.5rem] flex-1 rounded-lg py-0.5 pl-1 text-left select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-1 truncate text-[0.9375rem] leading-tight font-medium tracking-[-0.01em]">
                <span className="truncate">{props.name}</span>
                <ChevronDown aria-hidden className="size-3.5 shrink-0 text-faint transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </span>
              <span className="block truncate text-[0.75rem] leading-snug text-muted-foreground">{styleName(props.state.style)}</span>
            </button>
          </AboutHand>
          {/* look C (?look=postmarked): Find another is a round stamp; look A: Bring another, in words */}
          {LOOK === 'postmarked' ? <PhoneStamp {...props} /> : LOOK === 'reading-room' ? <BringAnother onClick={props.onNewHand} label={props.letter?.found ? 'Bring another' : 'Another hand'} shortcut="" /> : (
          <Button onClick={props.onNewHand} className="h-11 px-3.5">
            <Shuffle aria-hidden /> Find another
          </Button>
          )}
        </div>
        {/* the ways to the other letters, when there are any (Find another brings the next found letter) */}
        {props.letter && (!props.letter.found || props.letter.drafts > 0) && (
          <LetterStatus {...props} compact className="min-w-0 justify-center pb-1" />
        )}
        {/* the look, as a pull-up: a centred pill under the grabber's line of sight; its chevron says which way it goes */}
        <div className="flex justify-center pb-2">
          <button
            ref={pillRef}
            type="button"
            aria-expanded={expanded}
            onClick={() => onDetent(expanded ? 'peek' : 'half')}
            className="group inline-flex h-11 items-center px-2 select-none focus-visible:outline-none"
          >
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[0.7812rem] font-medium text-foreground transition-colors duration-150 group-active:bg-accent group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring">
              Paper, pen & ink
              <ChevronUp aria-hidden className={cn('size-3.5 text-muted-foreground transition-transform duration-300 ease-[var(--ease-drawer)]', expanded && 'rotate-180')} />
            </span>
          </button>
        </div>
      </div>

      <div
        ref={bodyRef}
        className={cn('sheet-body min-h-0 flex-1 overscroll-contain border-t border-border/70 px-5', settling && 'pointer-events-none')}
        style={{ paddingBottom: safe.bottom + 24 }}
        inert={!expanded}
      >
        <LookControls {...props} rows flush />
        <MoreControls {...props} flush />
      </div>
    </section>
  );
}
