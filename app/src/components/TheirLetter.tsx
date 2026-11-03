// The found letter beside your reply: two people's stationery on one desk.
//
// Your letter never moves. Theirs comes to you and goes back: put down beside your sheet (or tucked under its
// edge when the desk is narrow), smaller, a little turned, and when you pick it up it comes forward at the
// size you write at, over your sheet, which waits behind. So the caret and anything being composed stay
// exactly where they are, whichever letter is in front.
//
// Bringing theirs forward: click it, start a scroll on it, ⌘[ (or Tab to it and Enter). Back to yours: type,
// click your sheet, ⌘], Esc, or "Back to your letter". On wide desks both are readable side by side, so you can
// answer line by line; picking theirs up there just brings it to full size.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PaperGuide } from '@/components/PaperCanvas';
import { SheetView } from '@/components/SheetView';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { FoundLetter } from '@/lib/found';
import { sampleCredit, shortAuthor, type SampleText } from '@/lib/samples';
import { cn } from '@/lib/utils';

export const SHEET_GAP_THEIRS = 16;
const MOVE = 'transform 300ms var(--ease-drawer)';
/** Reduced motion: the letter changes places without travelling (a short fade does the work). */
const useMove = () => (useMediaQuery('(prefers-reduced-motion: reduce)') ? 'none' : MOVE);

/** "Kamma Rahbek’s letter, 1813"; "The letter signed ‘Your mother’, 1889"; an unsigned one is just the letter. */
export function whoseLetter(l: SampleText) {
  const year = l.year ? `, ${l.year}` : '';
  const who = shortAuthor(l.author);
  if (who.startsWith('‘')) return `The letter signed ${who}${year}`;
  if (/^(unsigned|unknown writer)$/i.test(who) || /^unknown/i.test(l.author)) return `The found letter${year}`;
  return `${who}’s letter${year}`;
}

export interface DeskLayout {
  /** both readable at once, or theirs put down small */
  mode: 'side' | 'tucked';
  /** your sheet's column (px) */
  mineW: number;
  /** their column, left of yours (px) */
  colW: number;
}

/**
 * Where the two letters go on a desk `S` px wide. Sizes are at the most the app shows a sheet (`maxPx` px/mm).
 * Side by side when theirs can be read (two thirds of full size) without yours dropping below 85%; otherwise
 * yours stays at full size and theirs is put down in what's left (at least a 64 px edge of it).
 */
export function deskLayout(S: number, mineMm: number, theirMm: number, maxPx: number): DeskLayout {
  const M = mineMm * maxPx;
  const T = theirMm * maxPx;
  const gap = 40;
  if (S - gap >= 0.85 * M + 0.66 * T) {
    const k = Math.min(1, (S - gap) / (M + 0.8 * T));
    const mineW = k * M;
    return { mode: 'side', mineW, colW: Math.min(0.85 * T, S - gap - mineW) + gap };
  }
  const mineW = Math.min(M, S - 64);
  return { mode: 'tucked', mineW, colW: S - mineW };
}

interface DeskProps {
  found: FoundLetter;
  layout: DeskLayout;
  /** your letter's scale: theirs comes forward at the same size */
  pxPerMm: number;
  forward: boolean;
  onForward: (v: boolean) => void;
  onDismiss: () => void;
  /** the reply just started: theirs lies on your fresh sheet, and slides off it to the side */
  arriving?: boolean;
}

export function TheirLetterDesk({ found, layout, pxPerMm, forward, onForward, onDismiss, arriving }: DeskProps) {
  const { letter, paper, svgs, ink } = found;
  const sheetW = paper.w * pxPerMm;
  const sheetH = paper.h * pxPerMm;
  const stackH = svgs.length * sheetH + (svgs.length - 1) * SHEET_GAP_THEIRS;
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const TOP = 56;
  const CAPTION = 40;
  const cardH = Math.min(stackH, vh - TOP - 16 - CAPTION);
  const side = layout.mode === 'side';
  const gap = side ? 40 : 28;
  const aside = side ? (layout.colW - gap) / sheetW : Math.min(0.6, Math.max(0.42, (layout.colW - gap) / sheetW));
  // tucked under your sheet's edge when there isn't room beside it
  const under = !side && aside * sheetW > layout.colW - 8;
  const scale = forward ? 1 : aside;
  const turn = forward ? 0 : side ? -0.5 : -1.4;

  // in front of your letter while forward, and until it has gone back down
  const [above, setAbove] = useState(forward || !under || !!arriving);
  const arrived = useRef(!arriving);
  useLayoutEffect(() => {
    if (forward || !under) { setAbove(true); return; }
    const t = window.setTimeout(() => setAbove(false), arrived.current ? 300 : 460);
    return () => window.clearTimeout(t);
  }, [forward, under]);

  // the reply's first moment: their letter was the page; it slides off yours, to where it's put down
  const cardRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const opts = { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
    cardRef.current?.animate([{ transform: `translateX(${layout.colW}px) rotate(0deg) scale(1)` }, { transform: `rotate(${turn}deg) scale(${scale})` }], opts);
    captionRef.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // picked up mid-slide: the slide gives way (the transition takes it from there)
  useLayoutEffect(() => {
    if (!forward) return;
    for (const a of cardRef.current?.getAnimations() ?? []) if (!(a instanceof CSSTransition)) a.cancel();
  }, [forward]);

  // ⌘[ picks theirs up, ⌘] and Esc put it down; never while composing
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const mod = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (mod && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        e.stopPropagation();
        onForward(e.key === '[');
      } else if (e.key === 'Escape' && forward) {
        e.preventDefault();
        e.stopPropagation();
        onForward(false);
      }
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [forward, onForward]);

  // a scroll that starts on the letter you put down picks it up (one passing over it mid-scroll doesn't)
  const forwardRef = useRef(forward);
  forwardRef.current = forward;
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    // the window hears every wheel event first: how long since the one before tells a new scroll from a passing one
    let last = 0;
    let pause = Infinity;
    const anywhere = () => {
      const now = performance.now();
      pause = now - last;
      last = now;
    };
    const here = (e: WheelEvent) => {
      if (forwardRef.current || pause < 250 || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 2) return;
      e.preventDefault();
      onForward(true);
    };
    window.addEventListener('wheel', anywhere, { passive: true, capture: true });
    el.addEventListener('wheel', here, { passive: false });
    return () => {
      window.removeEventListener('wheel', anywhere, { capture: true });
      el.removeEventListener('wheel', here);
    };
  }, [onForward]);

  const who = whoseLetter(letter);
  const move = useMove();
  return (
    <div className="sticky shrink-0 self-start" style={{ top: TOP, width: layout.colW, height: cardH + CAPTION, zIndex: above ? 20 : 0 }}>
      <div
        ref={cardRef}
        role="group"
        aria-label={who}
        // the letter you're writing keeps the keyboard and its caret while you read theirs
        onPointerDown={(e) => { if (e.button === 0) e.preventDefault(); }}
        className={cn('group absolute top-0 left-0 origin-top-left motion-reduce:transition-none', !forward && 'cursor-pointer')}
        style={{ width: sheetW + 8, height: cardH, transform: `rotate(${turn}deg) scale(${scale})`, transition: move }}
        onClick={() => { if (!forward) onForward(true); }}
      >
        {/* lifted: a deeper shadow under the whole letter */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 rounded-[2px] shadow-[0_2px_6px_rgba(40,30,10,0.12),0_30px_60px_-24px_rgba(40,30,10,0.45)] transition-opacity duration-300 ease-out"
          style={{ width: sheetW, opacity: forward ? 1 : 0 }}
        />
        <div
          className={cn(
            'h-full transition-[opacity,transform] duration-300 ease-out',
            forward ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden opacity-[0.94] hover-device:group-hover:opacity-100',
          )}
          tabIndex={forward ? 0 : -1}
          aria-label={forward ? who : undefined}
        >
          {/* a letter that was sent: the guide sheet stayed in the writer's pad */}
          <PaperGuide value={false}>
            <div className="flex flex-col pr-2" style={{ gap: SHEET_GAP_THEIRS }}>
              {svgs.map((svg, i) => (
                <SheetView key={i} paper={paper} pxPerMm={pxPerMm} svg={svg} ink={ink} index={i} count={svgs.length} />
              ))}
            </div>
          </PaperGuide>
          {/* the words, for screen readers (the handwriting is a picture) */}
          <div className="sr-only">{letter.text}</div>
        </div>
        {!forward && (
          <button type="button" className="absolute inset-0 rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label={`Read ${who}`} title="Read their letter (⌘[)" />
        )}
      </div>

      {/* under the letter, wherever it is: who wrote it, and the way back */}
      <div
        ref={captionRef}
        className="absolute top-0 left-0 flex items-center gap-1 text-[12px] text-muted-foreground motion-reduce:transition-none"
        style={{ width: forward ? sheetW : Math.max(140, aside * sheetW), transform: `translateY(${(forward ? cardH : aside * cardH) + 10}px)`, transition: move }}
      >
        <span className="min-w-0 flex-1 truncate" title={letter.title || undefined}>{sampleCredit(letter)}</span>
        {forward ? (
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onForward(false)}
            className="shrink-0 rounded-md px-1.5 py-1 text-foreground/80 transition-colors duration-150 hover-device:hover:text-foreground"
          >
            Back to your letter <kbd className="ml-1 font-sans text-[11px] text-faint">⌘]</kbd>
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-md px-1.5 py-1 text-faint transition-colors duration-150 hover-device:hover:text-foreground"
            title="This isn’t a reply"
          >
            Not a reply
          </button>
        )}
      </div>
    </div>
  );
}

interface PullProps {
  found: FoundLetter;
  open: boolean;
  onOpen: (v: boolean) => void;
  onDismiss: () => void;
  /** the visible area (above an on-screen keyboard) */
  viewport: { top: number; height: number };
  /** how far down it comes, from the top of the visible area (px) */
  reach: number;
  /** your letter's scale: theirs is never shown bigger */
  pxPerMm: number;
}

/**
 * Phones and tablets: one letter at a time. Theirs pulls down from the top over yours, as far as `reach`
 * (above the keyboard while you write), and goes back up when you type, tap your letter, swipe it up, or tap
 * "Your letter". The keyboard stays up throughout.
 */
export function TheirLetterPull({ found, open, onOpen, onDismiss, viewport, reach, pxPerMm }: PullProps) {
  const { letter, paper, svgs, ink } = found;
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const px = Math.min(pxPerMm || Infinity, (Math.min(vw, 640) - 32) / paper.w);
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault(); // the paper keeps the keyboard

  // swipe it back up by its bottom edge: it follows the finger, and a flick (or most of the way) puts it away
  const [dragY, setDragY] = useState<number | null>(null);
  const drag = useRef<{ id: number; y: number; t: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    keep(e);
    drag.current = { id: e.pointerId, y: e.clientY, t: performance.now(), moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    }
    // up follows the finger; down only gives a little (there's nothing more above)
    setDragY(dy < 0 ? dy : dy * 0.15);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    const dy = e.clientY - d.y;
    const v = dy / Math.max(1, performance.now() - d.t);
    setDragY(null);
    if (dy < -reach * 0.3 || v < -0.45) onOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onOpen(false);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [open, onOpen]);

  const who = whoseLetter(letter);
  const move = useMove();
  const shift = open ? dragY ?? 0 : null;
  return (
    <>
      {/* your letter, waiting underneath: a tap brings it back */}
      <div
        aria-hidden
        onPointerDown={(e) => { keep(e); onOpen(false); }}
        className={cn('fixed inset-0 z-[35] bg-[rgba(40,30,10,0.14)] transition-opacity duration-300 ease-out', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <section
        aria-label={who}
        inert={!open}
        onPointerDown={keep}
        className="fixed inset-x-0 z-[36] mx-auto max-w-[640px] overflow-hidden rounded-b-[22px] bg-desk shadow-[0_2px_6px_rgba(40,30,10,0.1),0_24px_48px_-20px_rgba(40,30,10,0.45)] motion-reduce:transition-none"
        style={{
          top: viewport.top,
          height: reach,
          transform: shift != null ? `translateY(${shift}px)` : 'translateY(calc(-100% - 32px))',
          transition: dragY != null ? 'none' : move,
        }}
      >
        <div className="h-[calc(100%-56px)] overflow-y-auto overscroll-contain px-4 pt-[max(12px,env(safe-area-inset-top,0px))]">
          <PaperGuide value={false}>
            <div className="mx-auto flex flex-col pb-3" style={{ width: paper.w * px, gap: SHEET_GAP_THEIRS }}>
              {svgs.map((svg, i) => (
                <SheetView key={i} paper={paper} pxPerMm={px} svg={svg} ink={ink} index={i} count={svgs.length} />
              ))}
            </div>
          </PaperGuide>
          <div className="sr-only">{letter.text}</div>
        </div>
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute inset-x-0 bottom-0 flex h-14 touch-none flex-col justify-center gap-1 px-4 select-none"
        >
          <div className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{sampleCredit(letter)}</span>
            <button type="button" onClick={onDismiss} className="shrink-0 rounded-md px-2 py-2.5 text-faint">
              Not a reply
            </button>
            <button type="button" onClick={() => onOpen(false)} className="shrink-0 rounded-md px-2 py-2.5 font-medium text-foreground">
              Your letter
            </button>
          </div>
          <span aria-hidden className="mx-auto h-[5px] w-9 rounded-full bg-[#d4cec2]" />
        </div>
      </section>
    </>
  );
}
