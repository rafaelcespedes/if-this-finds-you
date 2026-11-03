// The library: every letter as the letter itself, a sheet of its paper in its own hand with its title underneath,
// laid out like letters spread on a table (masonry: each goes into the shortest column, in reading order, so Tab
// and screen readers follow the same order as the eye). Quiet search, filters and Shuffle above.
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, Search, Shuffle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import allLetters from './all-letters.svg?raw';
import { Card } from './Card';
import { cardAspect } from './card-protocol';
import { cardSize } from './cards';
import { baseLang, eraOf, ERAS, filterLetters, languageName } from './data';
import type { ArchiveLetter } from './model';
import { letterHash, NO_FILTERS, randomHand, randomIndex, type Filters } from './route';
import { headerLink, SiteHeader, toolHref } from './SiteHeader';

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

/** Columns and gaps for a width: three on wide screens, two from a phone up. */
function grid(width: number) {
  const cols = width >= 900 ? 3 : 2;
  const gapX = cols === 3 ? 36 : 16;
  const gapY = cols === 3 ? 44 : 28;
  return { cols, gapX, gapY, colW: width ? (width - gapX * (cols - 1)) / cols : 0 };
}

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
  const aspects = useMemo(() => new Map(pool.map((l) => [l.id, cardAspect(l.text)])), [pool]);

  const filtered = !!(filters.q || filters.era || filters.lang || filters.kind);
  const clear = () => onFilters(NO_FILTERS);

  // the grid's columns, measured on the panel (always there; the list comes and goes with empty results). While the
  // index is hidden under a letter it measures 0: keep the last size, so cards come back as they were.
  const panelRef = useRef<HTMLDivElement>(null);
  const panelW = useElementWidth(panelRef);
  const lastW = useRef(0);
  if (panelW) lastW.current = panelW;
  const g = grid(lastW.current);
  const csize = g.colW ? cardSize(g.colW) : null;
  const size = useMemo(() => csize, [csize?.css, csize?.width]);

  // masonry: each card into the shortest column, in order. Sheet heights are known from the start (cardAspect), so
  // nothing moves when the writing arrives; titles are measured. Runs before paint, and again when fonts land.
  const listRef = useRef<HTMLUListElement>(null);
  const lay = useCallback(() => {
    const ul = listRef.current;
    if (!ul || !g.colW) return;
    const items = [...ul.children] as HTMLElement[];
    const heights = items.map((el) => el.offsetHeight);
    const cols = new Array(g.cols).fill(0);
    items.forEach((el, i) => {
      let c = 0;
      for (let j = 1; j < g.cols; j++) if (cols[j] < cols[c] - 1) c = j;
      el.style.transform = `translate3d(${(c * (g.colW + g.gapX)).toFixed(1)}px, ${cols[c].toFixed(1)}px, 0)`;
      cols[c] += heights[i] + g.gapY;
    });
    ul.style.height = `${Math.max(0, Math.max(...cols) - g.gapY)}px`;
  }, [g.cols, g.colW, g.gapX, g.gapY]);
  useLayoutEffect(lay, [lay, shown]);
  useEffect(() => {
    const f = document.fonts;
    if (!f) return;
    f.ready.then(lay);
    f.addEventListener('loadingdone', lay);
    return () => f.removeEventListener('loadingdone', lay);
  }, [lay]);

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
        <a href={toolHref} className={`${headerLink} font-medium text-foreground/80`}>Write a letter</a>
      </SiteHeader>
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 sm:px-8 lg:px-10">
        <section className="pt-[calc(5.25rem+env(safe-area-inset-top,0px))] pb-8 sm:pt-28 sm:pb-10">
          {/* "All letters" in the logo's hand (#5: Québec school print, felt marker; heading.mjs) */}
          <h1 className="text-foreground">
            <span className="sr-only">All letters</span>
            <span aria-hidden className="block h-[46px] [&_svg]:h-full [&_svg]:w-auto sm:h-[60px]" dangerouslySetInnerHTML={{ __html: allLetters }} />
          </h1>
          <p className="mt-4 max-w-[34rem] text-[15px] leading-[1.55] text-muted-foreground text-pretty sm:text-[16px]">
            Real letters by ordinary people, each written out by hand. Some never reached the person they were meant for.
          </p>
        </section>

        <div ref={panelRef}>
          {/* in reading order: search, filters, Shuffle (on phones Shuffle sits beside the search) */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 pb-2 sm:flex sm:items-center sm:gap-1">
            <label className="relative col-start-1 row-start-1 min-w-0 sm:max-w-[340px] sm:flex-1">
              <span className="sr-only">Search letters</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                type="search"
                value={filters.q}
                onChange={(e) => set({ q: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Escape' && filters.q) { e.preventDefault(); set({ q: '' }); } }}
                placeholder={narrow ? 'Words, writers, places' : 'Search words, writers, places'}
                autoComplete="off"
                spellCheck={false}
                className="archive-field archive-quiet h-9 w-full pr-3 pl-8 text-[13.5px] placeholder:text-faint pointer-coarse:h-11"
              />
            </label>
            <div className="col-span-2 grid grid-cols-[1fr_1.3fr_1fr] gap-1.5 sm:flex sm:gap-1">
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
            <Button variant="ghost" onClick={shuffle} disabled={!letters} className="col-start-2 row-start-1 h-9 text-muted-foreground pointer-coarse:h-11 sm:ml-auto">
              <Shuffle aria-hidden /> Shuffle
            </Button>
          </div>

          <p aria-live="polite" className="flex min-h-8 items-center gap-2 text-[12.5px] text-faint tabular">
            {letters && (filtered ? `${noun(shown.length)} of ${count}` : noun(count))}
            {filtered && (
              <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground underline decoration-[#cfc8b9] underline-offset-[3px] transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-2.5">
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
          ) : letters ? (
            <ul ref={listRef} role="list" aria-label="All letters" className="masonry relative mt-6" style={{ '--col-w': `${g.colW}px` } as CSSProperties}>
              {shown.map((l) => <Card key={l.id} letter={l} size={size} aspect={aspects.get(l.id) ?? 1} onOpen={onOpen} />)}
            </ul>
          ) : (
            <div aria-hidden className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-9">
              {[1.1, 0.8, 1.3, 0.9, 1.2, 0.7].map((a, i) => (
                <div key={i} className="archive-sheet-blank rounded-[1px] bg-[var(--paper)]" style={{ aspectRatio: `1 / ${a}` }} />
              ))}
            </div>
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
        className={cn('archive-field archive-quiet h-9 w-full min-w-0 appearance-none truncate pr-7 pl-2.5 text-[13.5px] pointer-coarse:h-11 sm:w-auto', value ? 'text-foreground' : 'text-muted-foreground')}
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.n != null ? `${o.label} (${o.n})` : o.label}</option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-faint" />
    </label>
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
