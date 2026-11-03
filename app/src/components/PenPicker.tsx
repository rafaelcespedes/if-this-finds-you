// Pen and tip. Each pen swatch is a word written by this writer with that pen, so the choice shows what the
// pen does (ballpoint skips, fountain shading, pencil grain) instead of naming it. Tips are small strokes.
import { memo, useMemo, useEffect, useRef } from 'react';
import { makeHand, withOverrides } from '@engine';
import { Specimen } from '@/components/Specimen';
import { PEN_SIZES, type PenSize } from '@/lib/controls';
import { ENGINE_TIPS } from '@/lib/engine-features';
import { PEN_CHOICES } from '@/lib/pens';
import { cn, keepChosenInView } from '@/lib/utils';

interface PenProps {
  seed: string;
  style: string;
  pen: string;
  penSize: PenSize;
  /** CSS colour and engine ink key, for the samples */
  ink: string;
  inkKey: string | null;
  onPen: (pen: string) => void;
}

export const PenSwatches = memo(function PenSwatches({ seed, style, pen, penSize, ink, inkKey, onPen }: PenProps) {
  const base = useMemo(() => makeHand(seed, style), [seed, style]);
  const tip = ENGINE_TIPS && penSize !== 'medium' ? penSize : null;
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ids = PEN_CHOICES.map((c) => c.id);
    const i = ids.indexOf(pen);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    onPen(ids[(i + d + ids.length) % ids.length]);
    const host = e.currentTarget;
    requestAnimationFrame(() => host.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  // the chosen pen stays in view when it changes from elsewhere (Find another, a link)
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => { requestAnimationFrame(() => keepChosenInView(row.current)); }, [pen]);
  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label="Pen"
      onKeyDown={onKeyDown}
      className="sheet-row -mx-5 flex snap-x scroll-px-5 gap-1.5 overflow-x-auto px-5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PEN_CHOICES.map((c) => {
        const on = c.id === pen;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onPen(c.id)}
            className={cn(
              'flex w-[78px] shrink-0 snap-start flex-col items-center gap-0.5 rounded-xl px-1.5 pt-1.5 pb-1.5 transition-[background-color,box-shadow] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.97] motion-reduce:active:scale-100',
              on ? 'bg-[var(--tile-on)] shadow-[0_0_0_1.5px_var(--ink),0_1px_2px_rgba(40,30,10,0.1)]' : 'bg-secondary hover-device:hover:bg-accent',
            )}
          >
            <Specimen
              sampleKey={`pen|${seed}|${style}|${c.id}|${tip ?? ''}`}
              hand={() => withOverrides(base, tip ? { pen: c.id, tip } : { pen: c.id })}
              text="ink"
              emPx={30}
              color={ink}
              inkKey={inkKey}
              className="h-[30px] justify-center"
            />
            <span className={cn('w-full truncate text-center text-[0.7188rem] leading-tight', on ? 'font-medium text-foreground' : 'text-muted-foreground')}>{c.name}</span>
          </button>
        );
      })}
      <span aria-hidden className="w-3 shrink-0" />
    </div>
  );
});

/** Fine / Medium / Bold as three short strokes of growing weight. */
export const TipChoice = memo(function TipChoice({ value, ink, onChange }: { value: PenSize; ink: string; onChange: (v: PenSize) => void }) {
  return (
    <div role="radiogroup" aria-label="Tip" className="flex gap-1">
      {PEN_SIZES.map((s, i) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={s.label}
            onClick={() => onChange(s.id)}
            className={cn(
              'relative flex h-9 w-14 flex-col items-center justify-center rounded-lg transition-[background-color,box-shadow] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring pointer-coarse:h-11 pointer-coarse:w-[52px]',
              on ? 'bg-[var(--tile-on)] shadow-[0_0_0_1.5px_var(--ink)]' : 'hover-device:hover:bg-accent',
            )}
          >
            <svg aria-hidden viewBox="0 0 36 12" className="h-3 w-9 overflow-visible" style={{ color: ink }}>
              <path d="M3 8 C 10 2, 15 2, 19 6 S 29 10, 33 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={[1.1, 1.9, 3][i]} />
            </svg>
            <span className={cn('mt-0.5 text-[0.6562rem] leading-none', on ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
});
