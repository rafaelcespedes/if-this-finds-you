// The library: every letter as a card, with search, filters and Shuffle.
import { useDeferredValue, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChevronDown, Search, Shuffle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { Card } from './Card';
import { cardSize } from './cards';
import { baseLang, eraOf, ERAS, filterLetters, languageName } from './data';
import type { ArchiveLetter } from './model';
import { letterHash, NO_FILTERS, randomHand, randomIndex, type Filters } from './route';
import { headerLink, SiteHeader, TOOL_URL } from './SiteHeader';

interface Props {
  letters: ArchiveLetter[] | null;
  error: boolean;
  onRetry: () => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  /** a letter is about to open (the index keeps its scroll) */
  onOpen: () => void;
  /** the index is on screen (not under an open letter) */
  active: boolean;
}

const MIN_CARD = 272;
const GAP = 28;

export function Index({ letters, error, onRetry, filters, onFilters, onOpen, active }: Props) {
  const q = useDeferredValue(filters.q);
  const narrow = useMediaQuery('(max-width: 639px)');
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });

  const pool = useMemo(() => letters ?? [], [letters]);

  // what the filters can offer, with counts
  const facets = useMemo(() => {
    const eras = new Map<string, number>();
    const langs = new Map<string, number>();
    for (const l of pool) {
      const e = eraOf(l);
      if (e) eras.set(e.id, (eras.get(e.id) ?? 0) + 1);
      const b = baseLang(l.lang);
      langs.set(b, (langs.get(b) ?? 0) + 1);
    }
    return {
      eras: ERAS.filter((e) => eras.has(e.id)).map((e) => ({ value: e.id, label: e.label, n: eras.get(e.id)! })),
      langs: [...langs].map(([value, n]) => ({ value, label: languageName(value), n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    };
  }, [pool]);

  const shown = useMemo(
    () => filterLetters(pool, { ...filters, q }),
    [pool, q, filters.era, filters.lang, filters.kind],
  );

  const filtered = !!(filters.q || filters.era || filters.lang || filters.kind);
  const clear = () => onFilters(NO_FILTERS);

  // card width: the grid's columns, measured once for all cards (on the panel, which is always there; the grid
  // itself comes and goes with empty results)
  const panelRef = useRef<HTMLDivElement>(null);
  const gridW = useElementWidth(panelRef);
  const cols = Math.max(1, Math.floor((gridW + GAP) / (MIN_CARD + GAP)));
  const colW = gridW ? (gridW - GAP * (cols - 1)) / cols : 0;
  // while the index is hidden under a letter it measures 0: keep the last size, so cards come back as they were
  const lastSize = useRef<ReturnType<typeof cardSize> | null>(null);
  if (colW) lastSize.current = cardSize(colW);
  const csize = lastSize.current;
  const size = useMemo(() => csize, [csize?.css, csize?.width]);

  // Shuffle: a random letter (from what's shown, when filtered) in a random hand
  const shuffle = () => {
    const from = shown.length ? shown : pool;
    if (!from.length) return;
    onOpen();
    window.location.hash = letterHash(from[randomIndex(from.length)].id, randomHand());
  };

  // "/" finds; Escape in the search clears it
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [active]);

  const count = letters ? pool.length : 0;
  const noun = (n: number) => `${n} ${n === 1 ? 'letter' : 'letters'}`;

  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <a href={TOOL_URL} className={headerLink}>Write a letter</a>
      </SiteHeader>
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 sm:px-8 lg:px-10">
        <section className="pt-[calc(4.75rem+env(safe-area-inset-top,0px))] pb-9 sm:pt-24 sm:pb-11">
          <h1 className="text-[34px] leading-[1.05] font-[560] tracking-[-0.03em] text-foreground sm:text-[44px]">All letters</h1>
          <p className="mt-4 max-w-[34rem] text-[15px] leading-[1.55] text-muted-foreground text-pretty sm:text-[16px]">
            Real letters by ordinary people, each written out by hand. Some never reached the person they were meant for.
          </p>
        </section>

        <div ref={panelRef}>
          {/* in reading order: search, filters, Shuffle (on phones Shuffle sits beside the search) */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 pb-3 sm:flex sm:items-center sm:gap-2.5">
            <label className="relative col-start-1 row-start-1 min-w-0 sm:max-w-[400px] sm:flex-1">
              <span className="sr-only">Search letters</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                type="search"
                value={filters.q}
                onChange={(e) => set({ q: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Escape' && filters.q) { e.preventDefault(); set({ q: '' }); } }}
                placeholder={narrow ? 'Words, writers, places' : 'Search words, writers, places'}
                autoComplete="off"
                spellCheck={false}
                className="archive-field h-10 w-full pr-3 pl-9 text-[13.5px] placeholder:text-faint pointer-coarse:h-11"
              />
            </label>
            <div className="col-span-2 grid grid-cols-[1fr_1.3fr_1fr] gap-2 sm:flex sm:gap-2.5">
              <Select label="Era" value={filters.era} onChange={(v) => set({ era: v })} any={narrow ? 'Era' : 'Any era'} options={facets.eras} />
              <Select label="Language" value={filters.lang} onChange={(v) => set({ lang: v })} any={narrow ? 'Language' : 'Any language'} options={facets.langs} />
              <Select
                label="Letters or notes"
                value={filters.kind}
                onChange={(v) => set({ kind: v as Filters['kind'] })}
                any={narrow ? 'Kind' : 'Letters and notes'}
                options={[{ value: 'letter', label: 'Letters' }, { value: 'note', label: 'Notes' }]}
              />
            </div>
            <Button variant="outline" onClick={shuffle} disabled={!letters} className="col-start-2 row-start-1 h-10 pointer-coarse:h-11 sm:ml-auto">
              <Shuffle aria-hidden /> Shuffle
            </Button>
          </div>

          <p aria-live="polite" className="flex min-h-8 items-center gap-2 text-[12.5px] text-muted-foreground tabular">
            {letters && (filtered ? `${noun(shown.length)} of ${count}` : noun(count))}
            {filtered && (
              <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-foreground/80 underline decoration-[#cfc8b9] underline-offset-[3px] transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-2.5">
                <X aria-hidden className="size-3.5" /> Clear
              </button>
            )}
          </p>

          {error ? (
            <Empty title="The letters didn’t load." action={<Button variant="outline" onClick={onRetry}>Try again</Button>}>
              Check your connection, then try again.
            </Empty>
          ) : letters && !shown.length ? (
            <Empty title={filters.q ? `No letters match “${filters.q}”.` : 'No letters match these filters.'} action={<Button variant="outline" onClick={clear}>Clear filters</Button>}>
              Try fewer words, or another era or language.
            </Empty>
          ) : (
            <ul
              role="list"
              aria-label="All letters"
              className="mt-3 grid gap-x-7 gap-y-11 [grid-template-columns:repeat(auto-fill,minmax(min(100%,272px),1fr))]"
            >
              {letters
                ? shown.map((l) => <Card key={l.id} letter={l} size={size} onOpen={onOpen} />)
                : Array.from({ length: 9 }, (_, i) => <Blank key={i} />)}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function Select({ label, value, onChange, any, options }: { label: string; value: string; onChange: (v: string) => void; any: string; options: { value: string; label: string; n?: number }[] }) {
  return (
    <label className="relative min-w-0 sm:flex-none">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('archive-field h-10 w-full min-w-0 appearance-none truncate pr-7 pl-2.5 text-[13.5px] pointer-coarse:h-11 sm:w-auto sm:pr-8 sm:pl-3', value ? 'text-foreground' : 'text-muted-foreground')}
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.n != null ? `${o.label} (${o.n})` : o.label}</option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-faint sm:right-2.5" />
    </label>
  );
}

function Blank() {
  return (
    <li aria-hidden>
      <div className="archive-paper aspect-[1/0.62] rounded-[1.5px] bg-[var(--paper)]" />
      <div className="mt-3.5 grid gap-2">
        <div className="h-3 w-3/5 rounded-full bg-[var(--chip)]" />
        <div className="h-2.5 w-4/5 rounded-full bg-[var(--chip)]/70" />
      </div>
    </li>
  );
}

function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex max-w-[30rem] flex-col items-start gap-3 py-14">
      <h2 className="text-[17px] font-medium tracking-[-0.01em] text-foreground">{title}</h2>
      <p className="text-[14px] leading-[1.55] text-muted-foreground text-pretty">{children}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
