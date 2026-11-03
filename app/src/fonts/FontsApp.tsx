// Fonts: every hand as a free, open-source font, served like a foundry's list. A set of hands, each a big specimen
// line in its own hand with its name, a few words about it and its actions. Filters and "Another set" draw new
// sets until one is right. Everything that decides the set is in the URL (route.ts), so a set is a link.
//
// The page never loads the engine: its workers choose the hands and write the specimens (store.ts, fonts.worker.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { APP_NAME, withLogo } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { ARCHIVE_URL, headerLink, SiteHeader, toolHref } from '@/archive/SiteHeader';
import heading from './fonts.svg?raw';
import { FONTS_URL } from './links';
import { FontsDock } from './Dock';
import { FontRow } from './FontRow';
import { SpecimenBar } from './SpecimenBar';
import { useSaved } from './favourites';
import { filterKey, NO_FILTERS, type Filters } from './filters';
import type { Mode, RenderSpec } from './protocol';
import { DEFAULT_TEXT, defaultSize, newSetSeed, readRoute, routeSearch, SET_COUNT, type FontsRoute } from './route';
import { fonts, useCatalogue, useSet } from './store';

function useRoute() {
  const [route, setRoute] = useState<FontsRoute>(() => {
    const r = readRoute(location.search);
    if (!r.set) {
      r.set = newSetSeed();
      history.replaceState(history.state, '', routeSearch(r) + location.hash);
    }
    return r;
  });
  useEffect(() => {
    const on = () => setRoute(readRoute(location.search));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const update = useCallback((patch: Partial<FontsRoute>, push = false) => {
    setRoute((r) => {
      const next = { ...r, ...patch };
      history[push ? 'pushState' : 'replaceState'](history.state, '', routeSearch(next) + location.hash);
      return next;
    });
  }, []);
  return [route, update] as const;
}

/** A value that follows another after it has stopped changing for a moment (typing). */
function useSettled<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const INTRO = 'Every hand here is a free, open-source font. Try your own words, narrow it down, and draw another set until one feels like yours.';

export function FontsApp() {
  const [route, update] = useRoute();
  const narrow = useMediaQuery('(max-width: 639px)');
  const catalogue = useCatalogue();
  const saved = useSaved();
  const savedIds = useMemo(() => new Set(saved.map((e) => e.id)), [saved]);

  // the preview text: shown as you type, written once you pause
  const [text, setText] = useState(route.text);
  useEffect(() => { setText(route.text); }, [route.text]);
  const settledText = useSettled(text, 260);
  useEffect(() => { if (settledText !== route.text) update({ text: settledText }); }, [settledText]);

  // the size: the rows follow the slider live (the last specimens scaled), new ones are written when you let go
  const size = route.size || defaultSize(narrow);
  const [liveSize, setLiveSize] = useState(size);
  useEffect(() => { setLiveSize(size); }, [size]);

  // the list's width, in steps (a resize of a few pixels shouldn't rewrite twenty rows)
  const listRef = useRef<HTMLOListElement>(null);
  const rawWidth = useElementWidth(listRef);
  const width = useSettled(Math.max(200, Math.floor(rawWidth / 8) * 8), 160);
  const lines = narrow ? 2 : 1;
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const spec: RenderSpec = useMemo(
    () => ({ text: (settledText || DEFAULT_TEXT).trim() || DEFAULT_TEXT, mode: route.mode, emPx: size, width, lines, dpr }),
    [settledText, route.mode, size, width, lines, dpr],
  );

  // the set: drawn by the worker from the URL's seed and filters, or your saved hands
  const set = useSet();
  const fKey = filterKey(route.filters);
  useEffect(() => {
    if (route.view === 'saved') fonts.showEntries('saved', saved);
    else fonts.requestSet(route.set, route.filters, SET_COUNT, route.neatOnly);
  }, [route.view, route.set, fKey, route.neatOnly, route.view === 'saved' ? saved : null]);

  const listTop = () => {
    const el = listRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - (narrow ? 16 : 96);
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'auto' });
  };
  const newSet = () => { update({ set: newSetSeed(), view: 'set' }, true); listTop(); };
  const setFilters = (filters: Filters) => update({ filters, view: 'set' });

  useEffect(() => { document.title = `${route.view === 'saved' ? 'Saved hands' : 'Fonts'} – ${APP_NAME}`; }, [route.view]);

  // phones: the dock steps aside while the keyboard is up for the preview text
  const [typing, setTyping] = useState(false);
  const coarse = useMediaQuery('(pointer: coarse)');

  const entries = set.entries;
  const empty = set.done && !entries.length;
  const live = set.done ? (route.view === 'saved' ? `${entries.length} saved` : `${entries.length} fonts`) : '';

  return (
    <TooltipProvider>
      <div className="min-h-dvh">
        <SiteHeader>
          {!narrow && <a href={toolHref} className={`${headerLink} font-medium text-foreground/80`}>Write a letter</a>}
          <a href={withLogo(ARCHIVE_URL)} className={`${headerLink} font-medium text-foreground/80`}>All letters</a>
          <a href={withLogo(FONTS_URL)} aria-current="page" className={`${headerLink} font-medium text-foreground`}>Fonts</a>
        </SiteHeader>
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-40 sm:px-8 lg:px-10">
          <section className="pt-[calc(5.25rem+env(safe-area-inset-top,0px))] pb-8 sm:pt-28 sm:pb-10">
            <h1 className="text-foreground">
              <span className="sr-only">{route.view === 'saved' ? 'Saved hands' : 'Fonts'}</span>
              {/* "Fonts" in the logo's hand (#5: Québec school print, felt marker; heading.mjs) */}
              <span aria-hidden className="block h-[50px] [&_svg]:h-full [&_svg]:w-auto sm:h-[64px]" dangerouslySetInnerHTML={{ __html: heading }} />
            </h1>
            <p className="mt-4 max-w-[36rem] text-[15px] leading-[1.55] text-muted-foreground text-pretty sm:text-[16px]">
              {route.view === 'saved' ? 'The hands you saved, kept in this browser. Each one downloads as a free, open-source font.' : INTRO}
            </p>
          </section>
          <div className={cn('specimen-bar-wrap z-20', !narrow && 'sticky top-0')}>
            <SpecimenBar
              text={text}
              onText={setText}
              size={liveSize}
              onSize={setLiveSize}
              onSizeCommit={(v) => update({ size: v === defaultSize(narrow) ? 0 : v })}
              mode={route.mode}
              onMode={(m: Mode) => update({ mode: m })}
              onFocusChange={setTyping}
              narrow={narrow}
            />
          </div>
          <span aria-live="polite" className="sr-only">{live}</span>
          <ol ref={listRef} className="font-list" aria-label={route.view === 'saved' ? 'Saved hands' : 'Fonts'} aria-busy={!set.done}>
            {entries.map((e, i) => (
              <FontRow key={e?.id ?? `slot-${i}`} entry={e} index={i} spec={spec} liveEm={liveSize} saved={!!e && savedIds.has(e.id)} compact={narrow} />
            ))}
          </ol>
          <footer className="font-list-end">
            {set.failed ? (
              <p>The fonts didn’t load. <button type="button" className="ed-link" onClick={() => { fonts.requestSet(newSetSeed(), route.filters, SET_COUNT, route.neatOnly); }}>Try again</button></p>
            ) : route.view === 'saved' ? (
              empty ? <p>Nothing saved yet. Tap the heart on a hand to keep it here.</p> : null
            ) : empty ? (
              route.neatOnly ? (
                <p>
                  No easy-to-read hands match all of these (some traditions, like Kurrent, are hard to read today).{' '}
                  <button type="button" className="ed-link" onClick={() => update({ neatOnly: false })}>Show every hand</button> or{' '}
                  <button type="button" className="ed-link" onClick={() => setFilters({ ...NO_FILTERS, family: route.filters.family })}>clear the filters</button>.
                </p>
              ) : (
                <p>No hands match all of these. <button type="button" className="ed-link" onClick={() => setFilters({ ...NO_FILTERS, family: route.filters.family })}>Clear the filters</button></p>
              )
            ) : set.done ? (
              <>
                {set.exhausted && <p>That’s every hand we found for these filters.</p>}
                <button type="button" onClick={newSet} className="dock-primary inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-medium">Draw another set</button>
              </>
            ) : null}
            <p className="font-list-note">
              Each font is the hand as it writes on the page, saved with a few versions of every letter, so it’s a little steadier than the live writing. Free to use under the SIL Open Font License.
            </p>
          </footer>
        </main>
        <FontsDock
          filters={route.filters}
          onFilters={setFilters}
          neatOnly={route.neatOnly}
          onNeatOnly={(v) => update({ neatOnly: v, view: 'set' })}
          catalogue={catalogue}
          view={route.view}
          onView={(v) => { update({ view: v }, true); listTop(); }}
          savedCount={saved.length}
          onNewSet={newSet}
          narrow={narrow}
          hidden={typing && coarse}
        />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
