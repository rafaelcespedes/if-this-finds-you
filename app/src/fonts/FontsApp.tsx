// Fonts: every hand as a free, open-source font, served like a foundry's list. A set of 24 hands, each a big line set
// in its own font with the writer's name, a few tags and its actions. Filters and "New set" draw new sets until one
// is right; "Show 24 more" carries on with the same set. Everything that decides a set is in the URL (route.ts), so a
// set is a link. As a font is the default (what you download); Live hand shows the engine's live writing instead.
//
// The page never loads the engine: its workers choose the hands and make the specimens (store.ts, fonts.worker.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { APP_NAME, withLogo } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { ARCHIVE_URL, SiteHeader } from '@/archive/SiteHeader';
import heading from './fonts.svg?raw';
import { FontsDock } from './Dock';
import { FontRow } from './FontRow';
import { SpecimenBar } from './SpecimenBar';
import { useSaved } from './favourites';
import { filterKey, NO_FILTERS, type FilterKey, type Filters } from './filters';
import type { FontEntry, LiveSpec, Mode } from './protocol';
import { defaultSize, FALLBACK_TEXT, LINES, newSetSeed, readRoute, routeSearch, SET_COUNT, type FontsRoute, type Line } from './route';
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

/** A value that follows another once it has stopped changing for a moment (typing, resizing). */
function useSettled<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The screen's pixel density (capped at 3), kept up to date when it changes (another screen, browser zoom). */
function useDevicePixelRatio() {
  const read = () => Math.min(3, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
  const [dpr, setDpr] = useState(read);
  useEffect(() => {
    // a media query that matches only the current density: it stops matching when the density changes
    const mq = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    const on = () => setDpr(read());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [dpr]);
  return dpr;
}

const INTRO = 'Every hand here is a free, open-source font. Narrow it down, try your own words, and draw another set until one feels like yours.';

export function FontsApp() {
  const [route, update] = useRoute();
  const narrow = useMediaQuery('(max-width: 639px)');
  const wide = useMediaQuery('(min-width: 1024px)');
  const catalogue = useCatalogue();
  const saved = useSaved();
  const savedIds = useMemo(() => new Set(saved.map((e) => e.id)), [saved]);

  // your own words: shown in the field as you type, written once you pause
  const [text, setText] = useState(route.line === 'own' ? route.text : '');
  useEffect(() => { setText(route.line === 'own' ? route.text : ''); }, [route.line, route.text]);
  const settledText = useSettled(text, 260);
  useEffect(() => {
    if (settledText && (route.line !== 'own' || settledText !== route.text)) update({ line: 'own', text: settledText });
    else if (!settledText && route.line === 'own') update({ line: 'letter', text: '' });
  }, [settledText]);

  // the size: the rows follow the slider live; live-hand images are made again when you let go
  const size = route.size || defaultSize(narrow);
  const [liveSize, setLiveSize] = useState(size);
  useEffect(() => { setLiveSize(size); }, [size]);

  // the list's exact width (live-hand images are made for it, pixel for pixel, once a resize has settled) and the
  // screen's own density, up to 3x (iPhones), followed when the window moves to another screen or the page zooms
  const listRef = useRef<HTMLOListElement>(null);
  const rawWidth = useElementWidth(listRef);
  const width = useSettled(Math.max(200, Math.floor(rawWidth)), 200);
  const lines = narrow ? 2 : 1;
  const dpr = useSettled(useDevicePixelRatio(), 200);
  const live: Omit<LiveSpec, 'text'> = useMemo(() => ({ emPx: size, width, lines, dpr }), [size, width, lines, dpr]);

  // the set: drawn by the worker from the URL's seed and filters, or your saved hands
  const set = useSet();
  const fKey = filterKey(route.filters);
  useEffect(() => {
    if (route.view === 'saved') fonts.showEntries('saved', saved);
    else fonts.requestSet(route.set, route.filters, SET_COUNT, route.neatOnly);
  }, [route.view, route.set, fKey, route.neatOnly, route.view === 'saved' ? saved : null]);

  // what every row writes
  const preset = LINES.find((l) => l.id === route.line);
  const lineText = route.line === 'own' ? (settledText || route.text) : route.line === 'letter' ? (set.opening?.text ?? FALLBACK_TEXT) : preset?.text ?? '';
  const rowText = (e: FontEntry | undefined) => (route.line === 'name' ? e?.name ?? '' : lineText);
  const placeholder = route.line === 'name' ? 'Each writer’s own name' : route.line === 'own' ? FALLBACK_TEXT : lineText;

  const listTop = () => {
    const el = listRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - (narrow ? 16 : 96);
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'auto' });
  };
  const newSet = () => { update({ set: newSetSeed(), view: 'set' }, true); listTop(); };
  const setFilters = (filters: Filters, neatOnly?: boolean) => update({ filters, view: 'set', ...(neatOnly != null ? { neatOnly } : {}) });
  const onTag = useCallback((key: FilterKey, value: string) => {
    const family = key === 'family' ? { style: route.filters.style.filter((s) => catalogue.styles.find((x) => x.id === s)?.family === value) } : {};
    update({ filters: { ...NO_FILTERS, ...route.filters, [key]: [value], ...family }, view: 'set' });
    listTop();
  }, [route.filters, catalogue]);

  // Space draws a new set (when nothing that takes Space has focus)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey || route.view !== 'set') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select|button|a|summary)$/i.test(t.tagName) || t.closest('[role=dialog],[role=slider],[role=radio],[role=switch]'))) return;
      e.preventDefault();
      newSet();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [route.view]);

  useEffect(() => { document.title = `${route.view === 'saved' ? 'Saved hands' : 'Fonts'} – ${APP_NAME}`; }, [route.view]);

  // phones: the dock steps aside while the keyboard is up for your words
  const [typing, setTyping] = useState(false);
  const coarse = useMediaQuery('(pointer: coarse)');

  const entries: (FontEntry | undefined)[] = [...set.entries, ...Array.from({ length: set.pending }, () => undefined)];
  const empty = set.done && !set.entries.length;
  const announce = set.done ? (route.view === 'saved' ? `${set.entries.length} saved` : `${set.entries.length} fonts`) : '';

  return (
    <TooltipProvider>
      <div className="min-h-dvh">
        <SiteHeader current="fonts" />
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
              line={route.line}
              onLine={(l: Line) => { setText(''); update({ line: l, text: '' }); }}
              text={text}
              onText={setText}
              placeholder={placeholder}
              size={liveSize}
              onSize={setLiveSize}
              onSizeCommit={(v) => update({ size: v === defaultSize(narrow) ? 0 : v })}
              mode={route.mode}
              onMode={(m: Mode) => update({ mode: m })}
              onFocusChange={setTyping}
              narrow={narrow}
            />
            {(route.mode === 'live' || (route.line === 'letter' && set.opening)) && (
              <p className="specimen-note">
                {route.mode === 'live'
                  ? 'Live hand: how each writer writes on the page, with their own pen, ink and paper. The font you download keeps a few versions of each letter, so it repeats a little more.'
                  : set.opening && (
                    <>The opening of a letter by {set.opening.by}{set.opening.year ? `, ${set.opening.year}` : ''}. <a className="ed-link" href={withLogo(`${ARCHIVE_URL}#/letter/${encodeURIComponent(set.opening.id)}`)}>Read it</a></>
                  )}
              </p>
            )}
          </div>
          {set.note && route.view === 'set' && !empty && <p className="set-note" role="status">{set.note}</p>}
          <span aria-live="polite" className="sr-only">{announce}</span>
          <ol ref={listRef} className="font-list" aria-label={route.view === 'saved' ? 'Saved hands' : 'Fonts'} aria-busy={!set.done}>
            {entries.map((e, i) => (
              <FontRow key={e?.id ?? `slot-${i}`} entry={e} index={i} text={rowText(e)} mode={route.mode} live={live} em={liveSize} lines={lines}
                saved={!!e && savedIds.has(e.id)} compact={narrow} wide={wide} onTag={onTag} />
            ))}
          </ol>
          <footer className="font-list-end">
            {set.failed ? (
              <p>The fonts didn’t load. <button type="button" className="ed-link" onClick={newSet}>Try again</button></p>
            ) : route.view === 'saved' ? (
              empty ? <p>Nothing saved yet. Tap the heart on a hand to keep it here.</p> : null
            ) : empty ? (
              // the sampler says why in its own words (impossible pairs come back at once with a note)
              <p>{set.note ?? 'No hands match all of these.'} <button type="button" className="ed-link" onClick={() => setFilters({ ...NO_FILTERS, family: route.filters.family }, true)}>Clear the filters</button></p>
            ) : set.done ? (
              <div className="flex flex-wrap items-center gap-2">
                {!set.exhausted && <button type="button" onClick={() => fonts.more()} className="dock-primary inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-medium">Show {SET_COUNT} more</button>}
                <button type="button" onClick={newSet} className="outline-btn inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-medium">New set</button>
              </div>
            ) : null}
            <p className="font-list-note">
              Each font keeps a few versions of every letter and swaps between them as you type, so it’s a little steadier than the live hand. Free to use under the SIL Open Font License.
            </p>
          </footer>
        </main>
        <FontsDock
          filters={route.filters}
          onFilters={setFilters}
          neatOnly={route.neatOnly}
          onNeatOnly={(v) => update({ neatOnly: v, view: 'set', ...(v && route.filters.tidy.includes('messy') ? { filters: { ...route.filters, tidy: route.filters.tidy.filter((x) => x !== 'messy') } } : {}) })}
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
