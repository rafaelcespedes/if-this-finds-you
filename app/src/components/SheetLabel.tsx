// The sheet's name, like an artboard's: one quiet line just above the first sheet's top-left corner, in the
// app's type (never ink). What the letter is ("Barbary Stockdell, 1838"; "Your reply to Barbary Stockdell";
// "A letter from you") and how the hand writes ("A meticulous joined hand, upright"). When it changes (a new
// hand, the first key of your own letter) the words cross-fade in place, quickly.
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** which letter this is */
  title: string;
  /** how the hand writes; left out when the sheet is too narrow for both */
  hand?: string;
  /** the sheet's width (px): the line never runs past it */
  width: number;
  className?: string;
}

/** About how wide a line of this type is (px), to decide whether the hand fits beside the title. */
const textWidth = (s: string) => s.length * 6.3;

export function SheetLabel({ title, hand, width, className }: Props) {
  const both = !!hand && textWidth(title) + 14 + textWidth(hand) <= width;
  return (
    <div
      className={cn('pointer-events-none flex min-w-0 items-baseline gap-3.5 text-[12px] leading-4 whitespace-nowrap select-none', className)}
      style={{ width }}
    >
      <Morph text={title} className="shrink-0 font-medium text-foreground/75" />
      {both && <Morph text={hand!} className="min-w-0 truncate text-muted-foreground" />}
    </div>
  );
}

const FADE = 200;

/** Text that cross-fades to its new words: the old words fade out where they were while the new fade in. */
function Morph({ text, className }: { text: string; className?: string }) {
  const [prev, setPrev] = useState<string | null>(null);
  const shown = useRef(text);
  useLayoutEffect(() => {
    if (shown.current === text) return;
    const old = shown.current;
    shown.current = text;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPrev(old);
    const t = window.setTimeout(() => setPrev(null), FADE);
    return () => window.clearTimeout(t);
  }, [text]);
  return (
    <span className={cn('relative inline-grid', className)}>
      <span key={text} className={cn('col-start-1 row-start-1 truncate', prev != null && 'animate-in fade-in-0')} style={{ animationDuration: `${FADE}ms` }}>
        {text}
      </span>
      {prev != null && (
        <span aria-hidden className="col-start-1 row-start-1 truncate animate-out fade-out-0" style={{ animationDuration: `${FADE}ms`, animationFillMode: 'forwards' }}>
          {prev}
        </span>
      )}
    </span>
  );
}
