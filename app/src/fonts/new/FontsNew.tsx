// The Fonts page, redesigned (behind ?fonts=new until Rafael picks; docs/research/fonts-redesign.md has the research
// and the reasoning). One thing to look at first: a single hand writing a real letter's opening at poster size, with
// its name and its one filled action, Download font. Then one control surface (a ruled tester line that stays under
// the header on wide screens, the floating dock on phones and tablets), and the rest of the set as a calm list (or a
// grid), the writing always the biggest thing in each row. Junicode for the archive's words, Source Sans 3 for every
// control and label, in sentence case. By day the reading room, by night (?theme=dark) the same room with the lamps on.
//
// The data, the store and the workers are the current page's (route.ts, store.ts, fonts.worker.ts): the page never
// loads the engine, and everything that decides a set is in the URL.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { SiteHeader } from '@/archive/SiteHeader';
import { FontsDock } from '../Dock';
import { ABOUT, INTRO, useDevicePixelRatio, useRootRem, useRoute, useSettled, useViewportWidth } from '../FontsApp';
import { useSaved } from '../favourites';
import { describeFilters, filterCount, filterKey, NO_FILTERS, type Filters } from '../filters';
import type { FontEntry, LiveSpec } from '../protocol';
import { FALLBACK_TEXT, LINES, newSetSeed, SET_COUNT, type Line } from '../route';
import { fonts, useCatalogue, useSet } from '../store';
import { Hero } from './Hero';
import { Row } from './Row';
import { initialTheme, setTheme, type FontsTheme } from './switch';
import { Toolbar, type Layout } from './Toolbar';
import './fonts-new.css';

/** List or grid, kept in the address (?layout=grid) so a link shows the same. */
function useLayout(): [Layout, (l: Layout) => void] {
  const [layout, set] = useState<Layout>(() => (new URLSearchParams(location.search).get('layout') === 'grid' ? 'grid' : 'list'));
  const update = useCallback((l: Layout) => {
    set(l);
    const q = new URLSearchParams(location.search);
    if (l === 'grid') q.set('layout', 'grid'); else q.delete('layout');
    history.replaceState(history.state, '', `?${q.toString()}${location.hash}`);
  }, []);
  return [layout, update];
}

/** Light or dark: the page's own control (also ?theme=dark), one quiet icon at the intro's end. */
function ThemeToggle() {
  const [theme, set] = useState<FontsTheme>(initialTheme);
  const dark = theme === 'dark';
  const flip = () => { const t: FontsTheme = dark ? 'light' : 'dark'; set(t); setTheme(t); };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-pressed={dark} aria-label="Dark page" onClick={flip} className="fx-quiet fx-icon fx-theme">
          {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dark ? 'Light page' : 'Dark page'}</TooltipContent>
    </Tooltip>
  );
}

export function FontsNew() {
  const [route, update] = useRoute();
  const [layout, setLayout] = useLayout();
  // the layout's widths in the reader's own text size (rem), so 200% text gets the narrower layout
  const rem = useRootRem();
  const viewport = useViewportWidth();
  const narrow = viewport < 40 * rem;
  const wide = viewport >= 64 * rem;
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

  // sizes: the hero at poster size (a share of the window's width, within bounds), the rows at the tester's size
  const [size, setSize] = useState(() => (narrow ? 40 : wide ? 64 : 52));
  const rowSize = useSettled(size, 120);
  const heroEm = narrow ? Math.round(Math.min(56, Math.max(44, viewport * 0.13))) : wide ? Math.round(Math.min(150, Math.max(88, viewport * 0.085))) : 76;
  const heroLines = narrow ? 3 : 2;
  const grid = wide && layout === 'grid';
  const rowEm = narrow ? 40 : grid ? Math.min(72, rowSize) : wide ? rowSize : 52;
  const rowLines = grid ? 3 : narrow ? 2 : 1;

  // the live hand in a record: made for the list's width, pixel for pixel, at the screen's own density
  const listRef = useRef<HTMLOListElement>(null);
  const rawWidth = useElementWidth(listRef);
  const width = useSettled(Math.max(200, Math.floor(rawWidth)), 200);
  const dpr = useSettled(useDevicePixelRatio(), 200);
  const live: Omit<LiveSpec, 'text'> = useMemo(() => ({ emPx: narrow ? 40 : 60, width, lines: narrow ? 2 : 1, dpr }), [narrow, width, dpr]);

  // the set: drawn by the worker from the URL's seed and filters, or your saved hands
  const set = useSet();
  const fKey = filterKey(route.filters);
  useEffect(() => {
    if (route.view === 'saved') fonts.showEntries('saved', saved);
    else fonts.requestSet(route.set, route.filters, SET_COUNT, route.neatOnly);
  }, [route.view, route.set, fKey, route.neatOnly, route.view === 'saved' ? saved : null]);

  // what every hand writes
  const preset = LINES.find((l) => l.id === route.line);
  const lineText = route.line === 'own' ? (settledText || route.text) : route.line === 'letter' ? (set.opening?.text ?? FALLBACK_TEXT) : preset?.text ?? '';
  const rowText = (e: FontEntry | undefined) => (route.line === 'name' ? e?.name ?? '' : lineText);
  const placeholder = route.line === 'name' ? 'Each writer’s own name' : route.line === 'own' ? FALLBACK_TEXT : lineText;

  // phones: the dock steps aside while the keyboard is up for your words
  const [typing, setTyping] = useState(false);
  const coarse = useMediaQuery('(pointer: coarse)');
  const onLine = (l: Line) => { setText(''); update({ line: l, text: '' }); };

  const top = useRef<HTMLDivElement>(null);
  const toTop = () => {
    const el = top.current;
    if (!el) return;
    const head = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const y = el.getBoundingClientRect().top + window.scrollY - head - 8;
    if (window.scrollY > y) window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
  };
  const newSet = () => { update({ set: newSetSeed(), view: 'set', hand: '' }, true); toTop(); };
  const setFilters = (filters: Filters, neatOnly?: boolean) => update({ filters, view: 'set', ...(neatOnly != null ? { neatOnly } : {}) });
  const onNeatOnly = (v: boolean) => update({ neatOnly: v, view: 'set', ...(v && route.filters.tidy.includes('messy') ? { filters: { ...route.filters, tidy: route.filters.tidy.filter((x) => x !== 'messy') } } : {}) });
  const onView = (v: 'set' | 'saved') => { update({ view: v, hand: '' }, true); toTop(); };
  const onOpen = useCallback((id: string | null) => update({ hand: id ?? '' }, !!id), []);

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

  useEffect(() => { document.title = `${route.view === 'saved' ? 'Saved hands' : 'Fonts'} · ${APP_NAME}`; }, [route.view]);

  const all: (FontEntry | undefined)[] = [...set.entries, ...Array.from({ length: set.pending }, () => undefined)];
  const inSet = route.view === 'set';
  const hero = inSet ? all[0] : undefined;
  const rest = inSet ? all.slice(1) : all;
  const empty = set.done && !set.entries.length;
  const announce = set.done ? (inSet ? `${set.entries.length} fonts` : `${set.entries.length} saved`) : '';

  return (
    <TooltipProvider>
      <div className="fx-page">
        <SiteHeader current="fonts" />
        <main className="fx-main">
          <header className="fx-intro" ref={top}>
            <div className="fx-intro-words">
              <h1 className="fx-title">{inSet ? 'Fonts' : 'Saved hands'}</h1>
              <p className="fx-lede">{inSet ? INTRO : 'The hands you saved, kept in this browser. Each one downloads as a free, open-source font.'}</p>
            </div>
            <ThemeToggle />
          </header>

          {inSet && !empty && (
            <Hero entry={hero} text={rowText(hero)} em={heroEm} lines={heroLines} opening={route.line === 'letter' ? set.opening : null}
              saved={!!hero && savedIds.has(hero.id)} open={!!hero && hero.id === route.hand} onOpen={onOpen} live={live} />
          )}

          {wide && (
            <div className="fx-toolbar-wrap">
              <Toolbar filters={route.filters} onFilters={setFilters} neatOnly={route.neatOnly} onNeatOnly={onNeatOnly} catalogue={catalogue}
                view={route.view} onView={onView} savedCount={saved.length} onNewSet={newSet}
                line={route.line} onLine={onLine} text={text} onText={setText} placeholder={placeholder}
                size={size} onSize={setSize} layout={layout} onLayout={setLayout} />
            </div>
          )}

          {/* what's chosen, spelled out beside the count (as the big catalogues do), with the way back to every hand */}
          {inSet && (filterCount(route.filters) > 0 || !route.neatOnly) && (
            <p className="fx-chosen">
              <span className="fx-chosen-count tabular">{set.done ? `${set.entries.length} ${set.entries.length === 1 ? 'hand' : 'hands'}` : 'Choosing hands'}</span>
              <span className="fx-chosen-words">{[describeFilters(route.filters, catalogue), !route.neatOnly && 'any hand, the messy ones too'].filter(Boolean).join(' · ')}</span>
              <button type="button" className="fx-quiet-link" onClick={() => setFilters(NO_FILTERS, true)}>Clear filters</button>
            </p>
          )}
          {set.note && inSet && !empty && <p className="fx-note" role="status">{set.note}</p>}
          <span aria-live="polite" className="sr-only">{announce}</span>
          <ol ref={listRef} className={cn('fx-list', grid ? 'is-grid' : 'is-lines')} aria-label={inSet ? 'More hands in this set' : 'Saved hands'} aria-busy={!set.done}>
            {rest.map((e, i) => (
              <Row key={e?.id ?? `slot-${i}`} entry={e} index={i + (inSet ? 1 : 0)} text={rowText(e)} em={rowEm} lines={rowLines}
                saved={!!e && savedIds.has(e.id)} open={!!e && e.id === route.hand} onOpen={onOpen} live={live} card={grid} compact={narrow} />
            ))}
          </ol>

          <footer className="fx-end">
            {set.failed ? (
              <p>The fonts didn’t load. <button type="button" className="fx-quiet-link" onClick={newSet}>Try again</button></p>
            ) : !inSet ? (
              empty ? <p>Nothing saved yet. Save a hand with the heart and it stays here.</p> : null
            ) : empty ? (
              <p>{set.note ?? 'No hands match these filters.'} <button type="button" className="fx-quiet-link" onClick={() => setFilters({ ...NO_FILTERS, family: route.filters.family }, true)}>Clear the filters</button></p>
            ) : set.done && !set.exhausted ? (
              <div className="fx-end-actions">
                <Button variant="outline" onClick={() => fonts.more()} className="fx-more">Show {SET_COUNT} more</Button>
                <span className="fx-end-or">or</span>
                <Button variant="ghost" onClick={newSet} className="fx-quiet">Draw a new set</Button>
              </div>
            ) : null}
            <p className="fx-about">{ABOUT} Free to use under the <a className="fx-quiet-link" href="https://openfontlicense.org" target="_blank" rel="noreferrer">SIL Open Font License</a>.</p>
          </footer>
        </main>
        {!wide && (
          <FontsDock filters={route.filters} onFilters={setFilters} neatOnly={route.neatOnly} onNeatOnly={onNeatOnly} catalogue={catalogue}
            view={route.view} onView={onView} savedCount={saved.length} onNewSet={newSet}
            text={{ line: route.line, onLine, text, onText: setText, placeholder, onFocusChange: setTyping }}
            hidden={typing && coarse} />
        )}
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
