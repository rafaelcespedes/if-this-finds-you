// One group of the tool's controls: its ¶ label (and what's chosen), an optional small extra on the right, a hairline
// above. Shared by the tool's panel and the Fonts page.
import { useId } from 'react';
import { ChevronDown, Lock, LockOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One group of controls: a plain label (and what's chosen), an optional small extra on the right. */
export function Group({ label, value, aside, children, className, first, lock }: { label: string; value?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; first?: boolean; lock?: { on: boolean; toggle: () => void } }) {
  const id = useId();
  const Pad = lock?.on ? Lock : LockOpen;
  return (
    <section data-row aria-labelledby={id} className={cn('grid grid-cols-[minmax(0,1fr)] gap-2 py-3.5', !first && 'border-t border-border/70', className)}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 id={id} className="flex min-w-0 items-baseline gap-2 text-[0.8125rem] font-medium">
          {/* the rubric: a vermilion paragraph mark, the way scribes marked where each part begins */}
          <span aria-hidden className="-mr-1.5 text-[var(--mark)]">¶</span>
          {label}
          {value && <span className="truncate font-normal text-muted-foreground"><span className="sr-only">: </span>{value}</span>}
          {lock && (
            <button type="button" aria-pressed={lock.on} aria-label={`Keep this ${label.toLowerCase()} when finding another`} onClick={lock.toggle} data-lock="" className="group-lock relative -my-1 grid size-6 shrink-0 place-items-center self-center rounded-[4px] after:absolute after:-inset-2 after:content-['']">
              <Pad aria-hidden className="size-[13px]" strokeWidth={2} />
            </button>
          )}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The panel's "More": a full-width row that folds the finer controls away (a word, a quiet summary, a chevron). */
export function MoreButton({ open, onClick, controls, summary, flush, children }: { open: boolean; onClick: () => void; controls: string; summary?: React.ReactNode; flush?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between py-4 text-[0.8125rem] font-medium transition-colors duration-150 hover-device:hover:bg-[#f3f0e9] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:py-3.5',
        flush ? 'rounded-lg' : 'px-5',
      )}
    >
      <span className="flex items-baseline gap-2">
        {children}
        {summary && <span className="font-normal text-muted-foreground">{summary}</span>}
      </span>
      <ChevronDown aria-hidden className={cn('size-4 text-muted-foreground transition-transform duration-200 ease-out', open && 'rotate-180')} />
    </button>
  );
}
