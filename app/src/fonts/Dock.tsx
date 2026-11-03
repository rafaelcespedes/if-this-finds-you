// The Fonts view's floating dock, in the family of All letters' dock (the same surface and rise-in): the filters,
// Joined or print, your saved hands, and a new set. The filters open in a panel just above it (a sheet on phones),
// laid out like the tool's panel: ¶ groups with the same chips, segmented controls and switch, the finer ones under
// "More". Every control is the tool's own component. Every change draws a new set at once.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Heart, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Group, MoreButton } from '@/components/ui/group';
import { Switch } from '@/components/ui/switch';
import { Segmented, SegmentedChip, SegmentedItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { describeFilters, ERA_GROUPS, filterCount, filterDefs, NO_FILTERS, tapRun, type Catalogue, type FilterDef, type Filters } from './filters';

interface Props {
  filters: Filters;
  onFilters: (f: Filters, neatOnly?: boolean) => void;
  neatOnly: boolean;
  onNeatOnly: (v: boolean) => void;
  catalogue: Catalogue;
  view: 'set' | 'saved';
  onView: (v: 'set' | 'saved') => void;
  savedCount: number;
  onNewSet: () => void;
  narrow: boolean;
  /** hidden while the phone's keyboard is up for your own words */
  hidden?: boolean;
}

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

/** A dock button with a tooltip on pointer screens (its label is read out either way). */
function Tip({ label, children, show = true }: { label: string; children: ReactNode; show?: boolean }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The words a filter has chosen, beside its ¶ label (as the panel shows "Paper Letter pad"). */
function chosenWords(def: FilterDef, value: string[]) {
  const labels = def.options.filter((o) => value.includes(o.value)).map((o) => o.label);
  if (!labels.length) return undefined;
  if (def.kind === 'run' && labels.length > 1) return `${labels[0]} to ${labels[labels.length - 1].toLowerCase()}`;
  return labels.length > 2 ? `${labels.length} chosen` : labels.join(', ');
}

/** One filter: its choices as the tool's chips (one or many), or a run of stops on its segmented control. */
function FilterControl({ def, value, onChange, family, familyOf }: { def: FilterDef; value: string[]; onChange: (v: string[]) => void; family: string; familyOf: (style: string) => string }) {
  const chips = (options: FilterDef['options']) => {
    const many = def.kind === 'many';
    const common = { 'aria-label': def.label, className: 'flex flex-wrap justify-start gap-1.5 bg-transparent p-0' };
    const items = options.map((o) => (
      <SegmentedChip key={o.value} value={o.value} aria-label={o.note ? `${o.label}: ${o.note}` : o.label}>
        {o.label}{o.note && <span className="ml-1.5 text-muted-foreground">{o.note}</span>}
      </SegmentedChip>
    ));
    return many ? (
      <Segmented type="multiple" value={value.filter((v) => options.some((o) => o.value === v))} onValueChange={(next) => onChange([...value.filter((v) => !options.some((o) => o.value === v)), ...next])} {...common}>{items}</Segmented>
    ) : (
      <Segmented type="single" value={value[0] ?? ''} onValueChange={(v) => onChange(v ? [v] : [])} {...common}>{items}</Segmented>
    );
  };
  if (def.key === 'style') {
    // the traditions by when they were taught; only the chosen family's
    const opts = def.options.filter((o) => !family || familyOf(o.value) === family);
    return (
      <div className="grid gap-3">
        {ERA_GROUPS.map((g) => {
          const list = opts.filter((o) => o.group === g.id);
          if (!list.length) return null;
          return (
            <div key={g.id} className="grid gap-1.5">
              <div className="text-[0.7812rem] text-muted-foreground">{g.label}</div>
              {chips(list)}
            </div>
          );
        })}
      </div>
    );
  }
  if (def.kind === 'run') {
    // one stop, or a run of neighbours (tap a second stop to stretch it, an end to shrink it)
    return (
      <Segmented type="multiple" aria-label={def.label} value={value}
        onValueChange={(next) => {
          const tapped = next.find((v) => !value.includes(v)) ?? value.find((v) => !next.includes(v));
          if (tapped) onChange(tapRun(def, value, tapped));
        }}>
        {def.options.map((o) => <SegmentedItem key={o.value} value={o.value} className="px-1.5">{o.label}</SegmentedItem>)}
      </Segmented>
    );
  }
  return chips(def.options);
}

function FilterPanel({ id, filters, onFilters, neatOnly, onNeatOnly, catalogue, onClose, narrow }: Pick<Props, 'filters' | 'onFilters' | 'neatOnly' | 'onNeatOnly' | 'catalogue' | 'narrow'> & { id: string; onClose: () => void }) {
  const defs = filterDefs(catalogue).filter((d) => d.key !== 'family');
  const ref = useRef<HTMLDivElement>(null);
  const moreId = useId();
  const moreCount = defs.filter((d) => d.more && filters[d.key].length).length;
  const [more, setMore] = useState(moreCount > 0);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }, []);
  const familyOf = (s: string) => catalogue.styles.find((x) => x.id === s)?.family ?? '';
  const n = filterCount({ ...filters, family: [] });
  const set = (key: keyof Filters, v: string[]) => {
    // Messy needs every hand: picking it switches Neat hands only off
    if (key === 'tidy' && v.includes('messy') && neatOnly) onFilters({ ...filters, tidy: v }, false);
    else onFilters({ ...filters, [key]: v });
  };
  const show = (d: FilterDef) => !(d.key === 'contrast' && filters.pen.length);
  const groups = (list: FilterDef[], first: boolean) => list.filter(show).map((d, i) => (
    <Group key={d.key} label={d.label} value={chosenWords(d, filters[d.key]) ?? d.hint} first={first && i === 0}>
      <FilterControl def={d} value={filters[d.key]} family={filters.family[0] ?? ''} familyOf={familyOf} onChange={(v) => set(d.key, v)} />
      {/* Neat hands only sits at the wild end of Tidy to wild, as the tool's switch */}
      {d.key === 'tidy' && (
        <div className="mt-1.5">
          <Switch label="Neat hands only" words={['Neat only', 'Any hand']} tip="Leaves out the hands that are hard to read; off, every hand comes up, the messy ones too" checked={neatOnly} onChange={onNeatOnly} />
        </div>
      )}
    </Group>
  ));
  return (
    <div ref={ref} id={id} role="dialog" aria-label="Filters"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      className={cn('filter-panel lib-menu pointer-events-auto flex max-h-[min(72dvh,640px)] flex-col overflow-hidden bg-panel', narrow ? 'w-[calc(100vw-24px)]' : 'w-[460px]')}>
      <div className="panel-scroll overflow-y-auto overscroll-contain px-[var(--pad,1.25rem)]">
        {groups(defs.filter((d) => !d.more), true)}
        <section data-row className="-mx-[var(--pad,1.25rem)] border-t border-border/70">
          <MoreButton open={more} controls={moreId} summary={moreCount ? `${moreCount} on` : 'Joins, weight, spacing, pace…'} onClick={() => setMore((v) => !v)}>More</MoreButton>
        </section>
        {more && <div id={moreId} className="pb-2">{groups(defs.filter((d) => d.more), true)}</div>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
        <Button variant="ghost" size="sm" disabled={!n && neatOnly} onClick={() => onFilters({ ...NO_FILTERS, family: filters.family }, true)} className="text-muted-foreground">
          Clear filters
        </Button>
        <Button size="sm" onClick={onClose} className="dock-primary">Done</Button>
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
    <div className="dock-caption pointer-events-auto flex max-w-[calc(100vw-24px)] items-center gap-1 rounded-full bg-panel py-1 pr-1 pl-3 text-[0.7812rem] text-muted-foreground">
      <span className="truncate">{[summary, !p.neatOnly && 'every hand'].filter(Boolean).join(' · ')}</span>
      <Button variant="ghost" size="icon" onClick={() => p.onFilters({ ...NO_FILTERS, family: p.filters.family }, true)} aria-label="Clear the filters" className="size-6 rounded-full text-[var(--muted-foreground)] pointer-coarse:size-8">
        <X aria-hidden className="size-3.5" />
      </Button>
    </div>
  ) : null;

  return (
    <div ref={wrap} className={cn('pointer-events-none fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom,0px))] z-30 flex flex-col items-center gap-2 px-3 transition-opacity duration-150', p.hidden && 'opacity-0 [&_*]:!pointer-events-none')}>
      {open && <FilterPanel id={panelId} {...p} onClose={close} />}
      {caption}
      <div role="toolbar" aria-label="Choose the fonts" className="archive-dock pointer-events-auto flex max-w-full items-center gap-1 rounded-2xl bg-panel p-1">
        {p.view === 'saved' ? (
          <>
            <Button variant="ghost" onClick={() => p.onView('set')}>
              <ArrowLeft aria-hidden /> {p.narrow ? 'Back' : 'Back to the set'}
            </Button>
            <Divider />
            <span className="px-2.5 text-[0.8125rem] text-muted-foreground tabular">{p.savedCount ? `${p.savedCount} saved` : 'Nothing saved yet'}</span>
          </>
        ) : (
          <>
            <Tip label={n ? `Filters, ${n} on` : 'Filters'} show={p.narrow}>
              <Button ref={btn} variant="ghost" size={p.narrow ? 'icon' : 'default'} onClick={() => setOpen((v) => !v)} aria-pressed={open} aria-expanded={open} aria-controls={open ? panelId : undefined}
                aria-label={p.narrow ? (n ? `Filters, ${n} on` : 'Filters') : undefined} className={cn('relative', open && 'bg-accent')}>
                <SlidersHorizontal aria-hidden />
                {!p.narrow && 'Filters'}
                {n > 0 && <span aria-hidden className={cn('dock-badge tabular', p.narrow && 'absolute -top-1 -right-1')}>{n}</span>}
              </Button>
            </Tip>
            <Segmented type="single" aria-label="Joined or print" value={p.filters.family[0] ?? 'any'}
              onValueChange={(v) => {
                if (!v) return;
                const fam = v === 'any' ? '' : v;
                p.onFilters({ ...p.filters, family: fam ? [fam] : [], style: fam ? p.filters.style.filter((s) => (p.catalogue.styles.find((x) => x.id === s)?.family ?? fam) === fam) : p.filters.style });
              }}>
              <SegmentedItem value="any" className={cn(p.narrow && 'px-2.5')}>Any</SegmentedItem>
              <SegmentedItem value="print" className={cn(p.narrow && 'px-2.5')}>Print</SegmentedItem>
              <SegmentedItem value="script" className={cn(p.narrow && 'px-2.5')}>Joined</SegmentedItem>
            </Segmented>
            <Tip label={`Saved hands${p.savedCount ? ` (${p.savedCount})` : ''}`}>
              <Button variant="ghost" size={p.savedCount ? 'default' : 'icon'} onClick={() => p.onView('saved')} aria-label={`Saved hands${p.savedCount ? ` (${p.savedCount})` : ''}`} className={cn(p.savedCount > 0 && 'gap-1.5 px-2.5')}>
                <Heart aria-hidden />
                {p.savedCount > 0 && <span aria-hidden className="tabular">{p.savedCount}</span>}
              </Button>
            </Tip>
            <Tip label="New set (Space)" show={!p.narrow}>
              <Button onClick={p.onNewSet} className={cn('dock-primary', p.narrow && 'px-3')}>
                <RefreshCw aria-hidden />
                New set
              </Button>
            </Tip>
          </>
        )}
      </div>
    </div>
  );
}
