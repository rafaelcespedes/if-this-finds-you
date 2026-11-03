// The library's browsing controls, kept small so the letters are the main attraction (CONTROLS.md). Three
// arrangements to compare, ?toolbar=1…3 (kept for the tab, never in share links):
//   1  in the heading: a search icon beside "All letters", and one sentence that is also the filter
//   2  a floating dock like the tool's right panel: search, era and language menus
//   3  a floating dock with search and a timeline of every letter, by century, as the era filter (the default:
//      Rafael, "the kind of control that adds delight")
// No count on screen and no Shuffle here (Rafael): screen readers hear the count after each change.
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { cn } from '@/lib/utils';
import { ERAS } from './data';
import type { ArchiveLetter } from './model';
import type { Filters } from './route';

export type ToolbarId = '1' | '2' | '3';
function readToolbar(): ToolbarId {
  try {
    const asked = new URLSearchParams(location.search).get('toolbar');
    if (asked === '1' || asked === '2' || asked === '3') { sessionStorage.setItem('seedhand:toolbar', asked); return asked; }
    const kept = sessionStorage.getItem('seedhand:toolbar');
    if (kept === '1' || kept === '2' || kept === '3') return kept;
  } catch { /* storage off: the default */ }
  return '3';
}
export const TOOLBAR: ToolbarId = typeof location !== 'undefined' ? readToolbar() : '3';

export interface Option { value: string; label: string; n?: number }

export interface ControlsProps {
  pool: ArchiveLetter[];
  shown: number;
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
  clear: () => void;
  filtered: boolean;
  facets: { eras: Option[]; langs: Option[] };
  search: { open: boolean; setOpen: (v: boolean) => void; inputRef: RefObject<HTMLInputElement | null> };
  ready: boolean;
}

const noun = (n: number) => `${n} ${n === 1 ? 'letter' : 'letters'}`;

// ---------- pieces ----------

export function IconButton({ label, onClick, disabled, children, className }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={disabled} className={cn('size-9 rounded-lg text-muted-foreground hover-device:hover:text-foreground pointer-coarse:size-10', className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The count, for screen readers only: announced after the search or a filter changes. */
export function LiveCount(p: Pick<ControlsProps, 'ready' | 'filtered' | 'shown' | 'pool'>) {
  return <span aria-live="polite" className="sr-only">{p.ready && p.filtered ? `${noun(p.shown)} of ${p.pool.length}` : ''}</span>;
}

/** Search, folded to an icon until it's wanted; "/" opens it, Esc clears and then closes it. */
export function SearchToggle({ value, onChange, search, width, placeholder }: {
  value: string; onChange: (v: string) => void; search: ControlsProps['search']; width: string; placeholder: string;
}) {
  const open = search.open || !!value;
  if (!open) {
    return (
      <IconButton label="Search letters ( / )" onClick={() => search.setOpen(true)}><Search aria-hidden /></IconButton>
    );
  }
  return (
    <label className={cn('search-open relative flex shrink-0 items-center', width)}>
      <span className="sr-only">Search letters</span>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 size-4 text-faint" />
      <input
        ref={search.inputRef}
        autoFocus
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (!value) search.setOpen(false); }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          if (value) onChange('');
          else { search.setOpen(false); (e.target as HTMLInputElement).blur(); }
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="archive-field h-9 w-full pr-8 pl-8 text-[13.5px] placeholder:text-faint pointer-coarse:h-10"
      />
      {value && (
        <button type="button" aria-label="Clear the search" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange('')} className="absolute right-1.5 grid size-6 place-items-center rounded-md text-faint transition-colors duration-150 hover-device:hover:text-foreground">
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </label>
  );
}

/** A light menu: plain words and a small chevron, with the platform's own picker underneath. */
export function QuietSelect({ label, value, onChange, any, options, shown, className }: {
  label: string; value: string; onChange: (v: string) => void; any: string; options: Option[]; shown?: (o: Option | undefined) => string; className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <label className={cn('quiet-select relative inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5', value ? 'text-foreground' : 'text-muted-foreground', className)}>
      <span className="truncate">{shown ? shown(current) : current?.label ?? any}</span>
      <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0">
        <option value="">{any}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.n != null ? `${o.label} (${o.n})` : o.label}</option>)}
      </select>
    </label>
  );
}

/** Where the dock sits: above the on-screen keyboard while it's open (iOS pans the visual viewport). */
function useKeyboardLift() {
  const vv = useVisualViewport();
  return Math.max(0, window.innerHeight - (vv.top + vv.height));
}

function Dock({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  const lift = useKeyboardLift();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom,0px))] z-30 flex flex-col items-center gap-2 px-3" style={lift ? { transform: `translateY(${-lift}px)` } : undefined}>
      {caption}
      <div role="toolbar" aria-label="Browse the letters" className="archive-dock pointer-events-auto flex max-w-full items-center gap-0.5 rounded-2xl bg-panel p-1 text-[13.5px]">
        {children}
      </div>
    </div>
  );
}
/** A hairline between two groups of plain buttons. Never beside a filled control (an open search field, a chosen
 * century, a primary button): those separate themselves, with a little space instead. */
const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

// ---------- 1: in the heading ----------

/** Search as an icon, at the right of the heading. */
export function HeadingTools(p: ControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <SearchToggle value={p.filters.q} onChange={(q) => p.set({ q })} search={p.search} width="w-[min(260px,62vw)]" placeholder="Words, writers, places" />
    </div>
  );
}

const ERA_WORDS: Record<string, string> = { 'before-1600': 'before 1600', '1600s': 'the 1600s', '1700s': 'the 1700s', '1800s': 'the 1800s', '1900s': 'the 1900s', now: 'since 2000' };

/** "Letters from any time in any language": the two filters, in one sentence. */
export function SentenceFilter(p: ControlsProps) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1 text-[14px] text-muted-foreground">
      <LiveCount {...p} />
      <span>Letters</span>
      {p.filters.q && <span className="ml-1">matching “{p.filters.q}”</span>}
      <span className="ml-1">from</span>
      <QuietSelect label="Era" value={p.filters.era} onChange={(era) => p.set({ era })} any="any time" options={p.facets.eras} shown={(o) => (o ? ERA_WORDS[o.value] ?? o.label : 'any time')} className="sentence-pick -mx-0.5 px-1.5 py-0.5" />
      <span>in</span>
      <QuietSelect label="Language" value={p.filters.lang} onChange={(lang) => p.set({ lang })} any="any language" options={p.facets.langs} className="sentence-pick -mx-0.5 px-1.5 py-0.5" />
      {p.filtered && (
        <button type="button" onClick={p.clear} className="ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] text-faint transition-colors duration-150 hover-device:hover:text-foreground">
          <X aria-hidden className="size-3.5" /> Clear
        </button>
      )}
    </p>
  );
}

// ---------- 2: floating dock ----------

export function SelectDock(p: ControlsProps) {
  const narrow = useMediaQuery('(max-width: 520px)');
  const searching = p.search.open || !!p.filters.q;
  return (
    <Dock>
      <SearchToggle value={p.filters.q} onChange={(q) => p.set({ q })} search={p.search} width={narrow ? 'w-[min(210px,56vw)]' : 'w-[220px]'} placeholder="Words, writers, places" />
      {!(narrow && searching) && (
        <>
          {searching ? <span aria-hidden className="w-1 shrink-0" /> : <Divider />}
          <QuietSelect label="Era" value={p.filters.era} onChange={(era) => p.set({ era })} any={narrow ? 'Era' : 'Any era'} options={p.facets.eras} />
          <QuietSelect label="Language" value={p.filters.lang} onChange={(lang) => p.set({ lang })} any={narrow ? 'Language' : 'Any language'} options={p.facets.langs} className="max-w-[9.5rem]" />
        </>
      )}
      <LiveCount {...p} />
      {/* the search has its own clear; this one is for the menus */}
      {(p.filters.era || p.filters.lang || p.filters.kind) && (
        <>
          <Divider />
          <IconButton label="Clear the filters" onClick={p.clear}><X aria-hidden /></IconButton>
        </>
      )}
    </Dock>
  );
}

// ---------- 3: timeline dock ----------

/** Where a letter's year falls inside its era's stretch of the timeline (0..1). */
const SPAN: Record<string, [number, number]> = { 'before-1600': [1380, 1600], '1600s': [1600, 1700], '1700s': [1700, 1800], '1800s': [1800, 1900], '1900s': [1900, 2000], now: [2000, 2030] };
const SHORT: Record<string, string> = { 'before-1600': 'Earlier', '1600s': '1600s', '1700s': '1700s', '1800s': '1800s', '1900s': '1900s', now: 'Now' };

/**
 * Every letter as a mark on a timeline, grouped by century: you see at a glance when the letters were written
 * (most in the 1800s), and a century is a button that shows its letters.
 */
function EraTimeline({ pool, value, onChange, narrow }: { pool: ArchiveLetter[]; value: string; onChange: (era: string) => void; narrow: boolean }) {
  const eras = ERAS.filter((e) => pool.some((l) => l.year != null && l.year >= e.from && l.year <= e.to));
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex items-stretch gap-0.5 px-0.5">
      <span id={id} className="sr-only">When the letters were written</span>
      {eras.map((e) => {
        const [a, b] = SPAN[e.id] ?? [e.from, e.to];
        const years = pool.filter((l) => l.year != null && l.year >= e.from && l.year <= e.to).map((l) => Math.min(1, Math.max(0, (l.year! - a) / (b - a))));
        const on = value === e.id;
        return (
          <button
            key={e.id}
            type="button"
            aria-pressed={on}
            aria-label={`${e.label}, ${noun(years.length)}`}
            title={`${e.label}: ${noun(years.length)}`}
            onClick={() => onChange(on ? '' : e.id)}
            className={cn('era-seg relative h-11 shrink-0 rounded-lg pointer-coarse:h-12', narrow ? 'w-[52px]' : 'w-[76px]', on ? 'is-on' : value ? 'is-dim' : '')}
          >
            <span aria-hidden className="era-marks absolute inset-x-2 top-[7px] h-[17px]">
              {years.map((x, i) => <i key={i} className="absolute bottom-0 w-[1.5px] rounded-full bg-current" style={{ left: `${(x * 100).toFixed(1)}%`, height: `${55 + ((i * 37) % 45)}%` }} />)}
            </span>
            <span aria-hidden className="absolute inset-x-0 bottom-[5px] text-center text-[11px] leading-none font-medium tabular">{SHORT[e.id] ?? e.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const ERA_CAPTION: Record<string, string> = { 'before-1600': 'before 1600', '1600s': 'from the 1600s', '1700s': 'from the 1700s', '1800s': 'from the 1800s', '1900s': 'from the 1900s', now: 'since 2000' };

export function TimelineDock(p: ControlsProps) {
  const narrow = useMediaQuery('(max-width: 520px)');
  const searching = p.search.open || !!p.filters.q;
  const caption = p.filtered && p.ready ? (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-panel py-1 pr-1 pl-3 text-[12.5px] text-muted-foreground shadow-[0_1px_2px_rgba(60,45,20,0.08),0_6px_16px_-8px_rgba(60,45,20,0.3)]">
      <span>{p.filters.era ? `Letters ${ERA_CAPTION[p.filters.era] ?? ''}` : 'Letters'}{p.filters.q ? ` matching “${p.filters.q}”` : ''}</span>
      <button type="button" onClick={p.clear} aria-label="Clear the search and filters" className="grid size-6 place-items-center rounded-full text-faint transition-colors duration-150 hover-device:hover:text-foreground">
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  ) : null;
  return (
    <Dock caption={caption}>
      <SearchToggle value={p.filters.q} onChange={(q) => p.set({ q })} search={p.search} width={narrow ? 'w-[min(230px,60vw)]' : 'w-[240px]'} placeholder="Words, writers, places, languages" />
      {!(narrow && searching) && (
        <>
          {/* no hairline: the timeline's own shape (and a chosen century's chip) sets it apart */}
          <span aria-hidden className="w-1 shrink-0" />
          <EraTimeline pool={p.pool} value={p.filters.era} onChange={(era) => p.set({ era })} narrow={narrow} />
        </>
      )}
      <LiveCount {...p} />
    </Dock>
  );
}

/** "/" opens search from anywhere on the index (not while typing in a field). */
export function useSlashToSearch(active: boolean, search: ControlsProps['search']) {
  const s = useRef(search);
  s.current = search;
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      if (s.current.open) s.current.inputRef.current?.focus();
      else s.current.setOpen(true);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [active]);
}
