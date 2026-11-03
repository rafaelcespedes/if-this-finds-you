// The Fonts view's one control surface below wide screens: a floating dock in the family of All letters' dock, with
// Filters, Text (what every hand writes), your saved hands (once there are some) and New set. Filters and Text open
// the shared Sheet (a popover from the button on desktop, a bottom sheet on phones). The filters are laid out like
// the tool's panel: ¶ groups with the same chips, segmented controls and switch, the finer ones under "More". Every
// control is a shared component; every change draws a new set at once. (4 Nov 2026, Rafael: cut to the essentials,
// one home for the controls: Joined or print moved into the filters; the caption above the dock went.)
import { useEffect, useId, useState } from 'react';
import { ArrowLeft, CaseSensitive, Heart, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Group, MoreButton } from '@/components/ui/group';
import { Sheet, useSheets } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Segmented, SegmentedChip, SegmentedItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { ERA_GROUPS, filterCount, filterDefs, NO_FILTERS, tapRun, type Catalogue, type FilterDef, type Filters } from './filters';
import type { Line } from './route';
import { TextPanel } from './SpecimenBar';

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
  /** what every hand writes (the Text sheet); left out when the tester line above the list has it (wide screens) */
  text?: { line: Line; onLine: (l: Line) => void; text: string; onText: (t: string) => void; placeholder: string; onFocusChange?: (f: boolean) => void };
  /** hidden while the phone's keyboard is up for your own words */
  hidden?: boolean;
}

/** Joined or print: a filter of its own (the family), and picking one keeps only the styles of that family. */
export function withFamily(filters: Filters, v: string, catalogue: Catalogue): Filters {
  const fam = v === 'any' ? '' : v;
  return { ...filters, family: fam ? [fam] : [], style: fam ? filters.style.filter((s) => (catalogue.styles.find((x) => x.id === s)?.family ?? fam) === fam) : filters.style };
}

/** Joined or print, the first of the filters, on the sliding segmented control. */
function FamilyGroup({ filters, onFilters, catalogue }: Pick<Props, 'filters' | 'onFilters' | 'catalogue'>) {
  return (
    <Group label="Joined or print" first>
      <Segmented slide type="single" aria-label="Joined or print" value={filters.family[0] ?? 'any'} onValueChange={(v) => v && onFilters(withFamily(filters, v, catalogue))}>
        <SegmentedItem value="any">All</SegmentedItem>
        <SegmentedItem value="print">Print</SegmentedItem>
        <SegmentedItem value="script">Joined</SegmentedItem>
      </Segmented>
    </Group>
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
    // named "Filter by …": a plain "Pen" would pick up the tool's own pen-picker styles (density.css)
    const common = { 'aria-label': `Filter by ${def.label.toLowerCase()}`, className: 'flex flex-wrap justify-start gap-1.5 bg-transparent p-0' };
    const items = options.map((o) => (
      <SegmentedChip key={o.value} value={o.value} aria-label={o.note ? `${o.label}: ${o.note}` : o.label} title={o.note}>
        {o.label}
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
              {/* the hands hard to read today, said once under their era rather than on each chip */}
              {list.some((o) => o.note) && (
                <p className="text-[0.7188rem] leading-snug text-muted-foreground">
                  {list.filter((o) => o.note).map((o) => o.label).join(' and ')} {list.filter((o) => o.note).length > 1 ? 'are' : 'is'} hard to read today.
                </p>
              )}
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

/** Every filter as the tool's ¶ groups, the finer ones under its More row. The dock's panel and the rail both show it. */
export function FilterGroups({ filters, onFilters, neatOnly, onNeatOnly, catalogue, pad = 'var(--pad,1.25rem)', flush, lead }: Pick<Props, 'filters' | 'onFilters' | 'neatOnly' | 'onNeatOnly' | 'catalogue'> & { pad?: string; flush?: boolean; lead?: boolean }) {
  const defs = filterDefs(catalogue).filter((d) => d.key !== 'family');
  const moreId = useId();
  const moreCount = defs.filter((d) => d.more && filters[d.key].length).length;
  const [more, setMore] = useState(moreCount > 0);
  const familyOf = (s: string) => catalogue.styles.find((x) => x.id === s)?.family ?? '';
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
    <>
      {groups(defs.filter((d) => !d.more), !lead)}
      <section data-row className="border-t border-border/70" style={{ marginInline: `calc(${pad} * -1)` }}>
        <MoreButton open={more} controls={moreId} flush={flush} summary={moreCount ? `${moreCount} on` : 'Joins, weight, spacing, pace…'} onClick={() => setMore((v) => !v)}>More</MoreButton>
      </section>
      {more && <div id={moreId} className="pb-2">{groups(defs.filter((d) => d.more), true)}</div>}
    </>
  );
}

/** The filters inside the shared Sheet: every group, then Clear filters and Done. On desktop the list scrolls
 *  inside the popover with the foot below it; in the phone sheet the sheet scrolls and the foot sticks to its bottom. */
function FilterPanel({ filters, onFilters, neatOnly, onNeatOnly, catalogue, onDone, sheet }: Pick<Props, 'filters' | 'onFilters' | 'neatOnly' | 'onNeatOnly' | 'catalogue'> & { onDone: () => void; sheet: boolean }) {
  const n = filterCount(filters);
  return (
    <div className={cn('filter-panel flex flex-col', !sheet && 'max-h-[min(72dvh,640px,var(--radix-popover-content-available-height))]')}>
      <div className={cn(!sheet && 'panel-scroll min-h-0 overflow-y-auto overscroll-contain px-[var(--pad,1.25rem)]')}>
        {/* in the sheet the groups' rules reach its edges: 1.25rem is its padding */}
        <FamilyGroup filters={filters} onFilters={onFilters} catalogue={catalogue} />
        <FilterGroups filters={filters} onFilters={onFilters} neatOnly={neatOnly} onNeatOnly={onNeatOnly} catalogue={catalogue} pad={sheet ? '1.25rem' : undefined} lead />
      </div>
      <div className="filter-panel-foot flex shrink-0 items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
        <Button variant="ghost" size="sm" disabled={!n && neatOnly} onClick={() => onFilters(NO_FILTERS, true)} className="text-muted-foreground">
          Clear filters
        </Button>
        <Button size="sm" onClick={onDone} className="dock-primary">Done</Button>
      </div>
    </div>
  );
}

/** A dock button's words: hidden on the narrowest phones (under 360 px at the usual text size; fonts.css), where the
 *  icon carries it (the words stay for screen readers). */
const Words = ({ children, className }: { children: string; className?: string }) => <span className={cn('dock-words', className)}>{children}</span>;

export function FontsDock(p: Props) {
  const [open, setOpen] = useState<'' | 'filters' | 'text'>('');
  const sheets = useSheets();
  const n = filterCount(p.filters) + (p.neatOnly ? 0 : 1);
  useEffect(() => { if (p.view === 'saved') setOpen(''); }, [p.view]);
  const opener = (which: 'filters' | 'text') => (o: boolean) => setOpen(o ? which : '');

  return (
    <div className={cn('fonts-dock pointer-events-none fixed inset-x-0 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-3 transition-opacity duration-150', p.hidden && 'opacity-0 [&_*]:!pointer-events-none')}>
      <div role="toolbar" aria-label="Choose the fonts" className="archive-dock pointer-events-auto flex w-full max-w-[28rem] min-w-0 flex-wrap items-center gap-1 rounded-2xl bg-panel p-1 sm:w-auto">
        {p.view === 'saved' ? (
          <>
            <Button variant="ghost" onClick={() => p.onView('set')}>
              <ArrowLeft aria-hidden /> Back to the set
            </Button>
            <span className="ml-auto px-3 text-[0.8125rem] text-muted-foreground tabular">{p.savedCount ? `${p.savedCount} saved` : 'Nothing saved yet'}</span>
          </>
        ) : (
          <>
            <Sheet
              title="Filters"
              open={open === 'filters'}
              onOpenChange={opener('filters')}
              side="top"
              align="start"
              className="w-[460px] overflow-hidden p-0"
              trigger={
                <Button variant="ghost" className={cn('relative min-w-11 px-3', open === 'filters' && 'bg-accent')} aria-label={n ? `Filters, ${n} on` : undefined}>
                  <SlidersHorizontal aria-hidden />
                  <Words>Filters</Words>
                  {n > 0 && <span aria-hidden className="dock-badge tabular">{n}</span>}
                </Button>
              }
            >
              {(close) => <FilterPanel {...p} onDone={close} sheet={sheets} />}
            </Sheet>
            {p.text && (
              <Sheet
                title="What every hand writes"
                open={open === 'text'}
                onOpenChange={opener('text')}
                side="top"
                align="start"
                className="w-[300px] p-2"
                trigger={
                  <Button variant="ghost" className={cn('min-w-11 px-3', open === 'text' && 'bg-accent')}>
                    <CaseSensitive aria-hidden />
                    {/* on a phone under 400 px, once the saved hands' heart joins the dock, Text keeps only its Aa (fonts.css) */}
                    <Words className="dock-text-words">Text</Words>
                  </Button>
                }
              >
                {(close) => <TextPanel {...p.text!} onDone={close} />}
              </Sheet>
            )}
            {p.savedCount > 0 && (
              <Button variant="ghost" onClick={() => p.onView('saved')} aria-label={`Saved hands (${p.savedCount})`} className="dock-saved min-w-11 gap-1.5 px-3">
                <Heart aria-hidden className="fill-current" />
                <span aria-hidden className="tabular">{p.savedCount}</span>
              </Button>
            )}
            <Button onClick={p.onNewSet} className="dock-primary ml-auto min-w-11 px-3" title="New set (Space)">
              <RefreshCw aria-hidden />
              {/* its words give way only with very large text on a phone (fonts.css) */}
              <span className="dock-newset-words">New set</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
