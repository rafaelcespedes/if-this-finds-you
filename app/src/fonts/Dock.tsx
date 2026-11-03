// The Fonts view's floating dock, in the family of All letters' dock (the same surface, size and rise-in): the
// filters, Print or Joined, your saved hands, and a new set. The filters open in a panel just above it (a sheet on
// phones). Every change draws a new set at once.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Heart, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { describeFilters, filterCount, filterDefs, NO_FILTERS, type Catalogue, type FilterDef, type Filters } from './filters';

interface Props {
  filters: Filters;
  onFilters: (f: Filters) => void;
  neatOnly: boolean;
  onNeatOnly: (v: boolean) => void;
  catalogue: Catalogue;
  view: 'set' | 'saved';
  onView: (v: 'set' | 'saved') => void;
  savedCount: number;
  onNewSet: () => void;
  narrow: boolean;
  /** hidden while the phone's keyboard is up for the preview text */
  hidden?: boolean;
}

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

function DockButton({ label, onClick, pressed, children, className, tip, labelled, expanded, buttonRef, controls }: {
  label: string; onClick: () => void; pressed?: boolean; children: ReactNode; className?: string;
  /** a tooltip with the label (pointer screens) */
  tip?: boolean;
  /** the label read out instead of the button's text (icon-only buttons) */
  labelled?: boolean;
  expanded?: boolean; buttonRef?: React.Ref<HTMLButtonElement>; controls?: string;
}) {
  const b = (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={tip || labelled ? label : undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      className={cn('dock-btn relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13.5px] pointer-coarse:h-10', pressed && 'is-on', className)}
    >
      {children}
    </button>
  );
  if (!tip) return b;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{b}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Any, Print or Joined: the first thing people choose. */
function FamilySwitch({ value, onChange, narrow }: { value: string; onChange: (v: string) => void; narrow: boolean }) {
  const opts = [['', 'Any'], ['print', 'Print'], ['script', 'Joined']] as const;
  return (
    <div role="radiogroup" aria-label="Print or joined letters" className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
      {opts.map(([v, label]) => (
        <button
          key={v || 'any'}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('seg-btn inline-flex h-8 items-center rounded-md text-[13px] font-medium pointer-coarse:h-9', narrow ? 'px-[7px]' : 'px-2.5')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Chips({ def, value, onChange, family }: { def: FilterDef; value: string[]; onChange: (v: string[]) => void; family: string }) {
  const id = useId();
  const groups = def.key === 'style'
    ? (['print', 'script'] as const).filter((f) => !family || f === family).map((f) => ({ title: f === 'print' ? 'Print' : 'Joined', options: def.options.filter((o) => o.family === f) }))
    : [{ title: '', options: def.options }];
  return (
    <fieldset className="filter-group">
      <legend id={id} className="filter-label">{def.label}</legend>
      {groups.map((g) => (
        <div key={g.title || 'all'} className={cn(g.title && 'mt-1.5 first-of-type:mt-0')}>
          {g.title && groups.length > 1 && <div className="mb-1 text-[11.5px] text-faint">{g.title}</div>}
          <div className="flex flex-wrap gap-1.5">
            {g.options.map((o) => {
              const on = value.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
                  className={cn('filter-chip inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] pointer-coarse:h-10', on && 'is-on')}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function NeatSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 pt-1">
      <span>
        <span className="block text-[13.5px] text-foreground">Neat hands only</span>
        <span className="block text-[12.5px] leading-snug text-muted-foreground">Leaves out hands that are hard to read. Off: everyone, the messy ones too.</span>
      </span>
      <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="neat-switch relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full">
        <span aria-hidden className="absolute top-[3px] left-[3px] size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(40,30,10,0.3)]" />
      </button>
    </label>
  );
}

function FilterPanel({ id, filters, onFilters, neatOnly, onNeatOnly, catalogue, onClose, narrow }: Pick<Props, 'filters' | 'onFilters' | 'neatOnly' | 'onNeatOnly' | 'catalogue' | 'narrow'> & { id: string; onClose: () => void }) {
  const defs = filterDefs(catalogue).filter((d) => d.key !== 'family');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }, []);
  const n = filterCount({ ...filters, family: [] });
  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label="Filters"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      className={cn('filter-panel lib-menu pointer-events-auto flex max-h-[min(70dvh,560px)] flex-col overflow-hidden', narrow ? 'w-[calc(100vw-24px)]' : 'w-[460px]')}
    >
      <div className="panel-scroll grid gap-5 overflow-y-auto overscroll-contain px-4 pt-4 pb-3">
        {defs.map((d) => (
          <Chips key={d.key} def={d} value={filters[d.key]} family={filters.family[0] ?? ''} onChange={(v) => onFilters({ ...filters, [d.key]: v })} />
        ))}
        <NeatSwitch value={neatOnly} onChange={onNeatOnly} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <button type="button" disabled={!n} onClick={() => onFilters({ ...NO_FILTERS, family: filters.family })} className="rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover-device:hover:text-foreground disabled:opacity-40">
          Clear filters
        </button>
        <button type="button" onClick={onClose} className="dock-primary inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium pointer-coarse:h-10">Done</button>
      </div>
    </div>
  );
}

export function FontsDock(p: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const n = filterCount({ ...p.filters, family: [] }) + (p.neatOnly ? 0 : 1);
  const close = () => { setOpen(false); btn.current?.focus({ preventScroll: true }); };
  // a click outside the dock and its panel closes the panel
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', on);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', on); window.removeEventListener('keydown', key); };
  }, [open]);
  useEffect(() => { if (p.view === 'saved') setOpen(false); }, [p.view]);

  const summary = describeFilters({ ...p.filters, family: [] }, p.catalogue);
  const caption = !open && p.view === 'set' && (summary || !p.neatOnly) ? (
    <div className="dock-caption pointer-events-auto flex max-w-[calc(100vw-24px)] items-center gap-1 rounded-full py-1 pr-1 pl-3 text-[12.5px] text-muted-foreground">
      <span className="truncate">{[summary, !p.neatOnly && 'every hand'].filter(Boolean).join(' · ')}</span>
      <button type="button" onClick={() => { p.onFilters({ ...NO_FILTERS, family: p.filters.family }); p.onNeatOnly(true); }} aria-label="Clear the filters" className="grid size-6 shrink-0 place-items-center rounded-full text-faint transition-colors duration-150 hover-device:hover:text-foreground">
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  ) : null;

  return (
    <div
      ref={wrap}
      className={cn('pointer-events-none fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom,0px))] z-30 flex flex-col items-center gap-2 px-3 transition-opacity duration-150', p.hidden && 'opacity-0 [&_*]:!pointer-events-none')}
    >
      {open && <FilterPanel id={panelId} {...p} onClose={close} />}
      {caption}
      <div role="toolbar" aria-label="Choose the fonts" className="archive-dock pointer-events-auto flex max-w-full items-center gap-0.5 rounded-2xl bg-panel p-1 text-[13.5px]">
        {p.view === 'saved' ? (
          <>
            <DockButton label="Back to the set" onClick={() => p.onView('set')}>
              <ArrowLeft aria-hidden className="size-4" /> {p.narrow ? 'Back' : 'Back to the set'}
            </DockButton>
            <Divider />
            <span className="px-2.5 text-[13px] text-muted-foreground tabular">{p.savedCount ? `${p.savedCount} saved` : 'Nothing saved yet'}</span>
          </>
        ) : (
          <>
            <DockButton label={n ? `Filters, ${n} on` : 'Filters'} labelled={p.narrow} onClick={() => setOpen((v) => !v)} pressed={open} expanded={open} controls={open ? panelId : undefined} buttonRef={btn} className={cn(p.narrow && 'px-2')}>
              <SlidersHorizontal aria-hidden className="size-4" />
              {!p.narrow && 'Filters'}
              {n > 0 && <span aria-hidden className={cn('dock-badge tabular', p.narrow && 'absolute -top-1 -right-1')}>{n}</span>}
            </DockButton>
            {!p.narrow && <span aria-hidden className="w-1 shrink-0" />}
            <FamilySwitch value={p.filters.family[0] ?? ''} narrow={p.narrow} onChange={(v) => p.onFilters({ ...p.filters, family: v ? [v] : [], style: v ? p.filters.style.filter((s) => (p.catalogue.styles.find((x) => x.id === s)?.family ?? v) === v) : p.filters.style })} />
            {!p.narrow && <span aria-hidden className="w-1 shrink-0" />}
            <DockButton label={`Saved hands${p.savedCount ? ` (${p.savedCount})` : ''}`} tip={!p.narrow} labelled={p.narrow} onClick={() => p.onView('saved')} className={cn(p.narrow && 'px-2')}>
              <Heart aria-hidden className="size-4" />
              {p.savedCount > 0 && <span aria-hidden className="tabular text-[12.5px]">{p.savedCount}</span>}
            </DockButton>
            {!p.narrow && <span aria-hidden className="w-1 shrink-0" />}
            <button type="button" onClick={p.onNewSet} className={cn('dock-primary inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg text-[13.5px] font-medium pointer-coarse:h-10', p.narrow ? 'px-2.5' : 'px-3')}>
              <RefreshCw aria-hidden className="size-4" />
              {p.narrow ? 'New set' : 'Another set'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
