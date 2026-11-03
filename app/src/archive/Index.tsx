// The library: every letter as the letter itself, a sheet of its paper in its own hand with its title underneath,
// laid out like letters spread on a table (masonry: each goes into the shortest column, in reading order, so Tab
// and screen readers follow the same order as the eye). Search, filters and Shuffle above, as the tool's controls.
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useElementWidth } from '@/hooks/useElementWidth';
import { cn } from '@/lib/utils';
import allLetters from './all-letters.svg?raw';
import { Card } from './Card';
import { LetterCanvas, VIEW, type ViewId } from './Canvas';
import { HeadingTools, SelectDock, SentenceFilter, TimelineDock, TOOLBAR, useSlashToSearch, type ControlsProps } from './Controls';
import { cardAspect } from './card-protocol';
import { cardSize } from './cards';
import { baseLang, eraOf, ERAS, filterLetters, languageName } from './data';
import type { ArchiveLetter } from './model';
import { NO_FILTERS, type Filters } from './route';
import { withLogo } from '@/lib/brand';
import { FONTS_URL } from '@/fonts/links';
import { headerLink, SiteHeader, toolHref } from './SiteHeader';
// the look being compared (?look=reading-room): the heading as a finding aid (src/themes/reading-room/)
import { LOOK } from '@/lib/look';
import { FindingAid } from '@/themes/reading-room/FindingAid';

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

  // search starts folded to an icon; "/" opens it
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const search = useMemo(() => ({ open: searchOpen, setOpen: setSearchOpen, inputRef: searchRef }), [searchOpen]);
  useSlashToSearch(active, search);
  const controls: ControlsProps = { pool, shown: shown.length, filters, set, clear, filtered, facets, search, ready: !!letters };
  const dock = TOOLBAR !== '1';
  // the letters as a table you wander (canvas) or as a grid; "Show the letters as a list" switches to the grid
  const [view, setView] = useState<ViewId>(VIEW);
  const showList = () => {
    try { sessionStorage.setItem('seedhand:view', 'grid'); } catch { /* fine */ }
    setView('grid');
  };

  const intro = 'Real letters by ordinary people, each written out by hand. Some never reached the person they were meant for.';
  if (view === 'canvas') {
    return (
      <div className="min-h-dvh">
        <h1 className="sr-only">All letters</h1>
        <LetterCanvas
          letters={pool}
          shown={letters ? shown : []}
          onOpen={onOpen}
          active={active}
          onList={showList}
          heading={
            <div className="flex h-full flex-col items-center justify-center px-2 text-center">
              <span aria-hidden className="block h-[52px] text-foreground [&_svg]:h-full [&_svg]:w-auto sm:h-[68px]" dangerouslySetInnerHTML={{ __html: allLetters }} />
              <p className="mt-4 max-w-[28rem] text-[15px] leading-[1.55] text-muted-foreground text-pretty sm:text-[16px]">{intro}</p>
              {LOOK === 'reading-room' && <FindingAid letters={pool} />}
            </div>
          }
          empty={
            error ? (
              <div className="mt-2 text-center text-[14px] text-muted-foreground">
                The letters didn’t load. <button type="button" onClick={onRetry} className="ed-link">Try again</button>
              </div>
            ) : letters && !shown.length ? (
              <div className="mt-2 text-center text-[14px] text-muted-foreground">
                {filters.q ? `No letters match “${filters.q}”.` : 'No letters match.'} <button type="button" onClick={clear} className="ed-link">Clear</button>
              </div>
            ) : null
          }
        />
        {/* the header stays legible over the letters */}
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[5] h-28 bg-gradient-to-b from-[var(--desk)] via-[color-mix(in_oklab,var(--desk)_70%,transparent)] to-transparent" />
        <SiteHeader>
          <a href={toolHref} className={`${headerLink} font-medium text-foreground/80`}>Write a letter</a>
          <a href={withLogo(FONTS_URL)} className={`${headerLink} font-medium text-foreground/80`}>Fonts</a>
        </SiteHeader>
        {TOOLBAR === '2' ? <SelectDock {...controls} /> : <TimelineDock {...controls} />}
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <a href={toolHref} className={`${headerLink} font-medium text-foreground/80`}>Write a letter</a>
        <a href={withLogo(FONTS_URL)} className={`${headerLink} font-medium text-foreground/80`}>Fonts</a>
      </SiteHeader>
      <main className={cn('mx-auto w-full max-w-[1180px] px-4 sm:px-8 lg:px-10', dock ? 'pb-36' : 'pb-28')}>
        <section className={cn('pt-[calc(5.25rem+env(safe-area-inset-top,0px))] sm:pt-28', dock ? 'pb-10 sm:pb-12' : 'pb-6 sm:pb-8')}>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            {/* "All letters" in the logo's hand (#5: Québec school print, felt marker; heading.mjs) */}
            <h1 className="text-foreground">
              <span className="sr-only">All letters</span>
              <span aria-hidden className="block h-[46px] [&_svg]:h-full [&_svg]:w-auto sm:h-[60px]" dangerouslySetInnerHTML={{ __html: allLetters }} />
            </h1>
            {TOOLBAR === '1' && <HeadingTools {...controls} />}
          </div>
          <p className="mt-4 max-w-[34rem] text-[15px] leading-[1.55] text-muted-foreground text-pretty sm:text-[16px]">{intro}</p>
          {LOOK === 'reading-room' && <FindingAid letters={pool} />}
          {TOOLBAR === '1' && <div className="mt-5"><SentenceFilter {...controls} /></div>}
        </section>
        {/* the dock floats at the bottom, but comes first in reading order, before the letters */}
        {TOOLBAR === '2' && <SelectDock {...controls} />}
        {TOOLBAR === '3' && <TimelineDock {...controls} />}

        <div ref={panelRef}>
          {error ? (
            <Empty title="The letters didn’t load." action={<Button variant="outline" onClick={onRetry}>Try again</Button>}>
              Check your connection, then try again.
            </Empty>
          ) : letters && !shown.length ? (
            <Empty title={filters.q ? `No letters match “${filters.q}”.` : 'No letters match these filters.'} action={<Button variant="outline" onClick={clear}>Clear filters</Button>}>
              Try fewer words, or another era or language.
            </Empty>
          ) : letters ? (
            <ul ref={listRef} role="list" aria-label="All letters" className="masonry relative mt-2" style={{ '--col-w': `${g.colW}px` } as CSSProperties}>
              {shown.map((l) => <Card key={l.id} letter={l} size={size} aspect={aspects.get(l.id) ?? 1} onOpen={onOpen} />)}
            </ul>
          ) : (
            <div aria-hidden className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-9">
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

function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex max-w-[30rem] flex-col items-start gap-3 py-14">
      <h2 className="text-[17px] font-medium tracking-[-0.01em] text-foreground">{title}</h2>
      <p className="text-[14px] leading-[1.55] text-muted-foreground text-pretty">{children}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
