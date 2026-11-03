// Lost Letters: the archive's two views, the index and a letter, switched by the URL hash (route.ts). The index
// stays mounted under an open letter, so coming back finds it as it was: the same cards, filters and scroll.
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { loadLetters } from './data';
import type { ArchiveLetter } from './model';
import { indexHash, NO_FILTERS, parseRoute, type Filters } from './route';
import { Index } from './Index';

const loadLetterPage = () => import('./LetterPage');
const LetterPage = lazy(loadLetterPage);

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const getHash = () => window.location.hash;

export function ArchiveApp() {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  const route = parseRoute(hash);
  const [letters, setLetters] = useState<ArchiveLetter[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    loadLetters().then(setLetters, () => setError(true));
  }, []);
  useEffect(load, [load]);

  // once the index has settled, fetch the letter page (and the engine) in the background, so opening a letter is quick
  useEffect(() => {
    if (!letters) return;
    const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : window.setTimeout(fn, 1500));
    const t = window.setTimeout(() => idle(() => { loadLetterPage().catch(() => {}); }), 1200);
    return () => window.clearTimeout(t);
  }, [letters]);

  // the index's scroll is kept while a letter is open, and put back on return
  const indexScroll = useRef(0);
  const wasLetter = useRef(route.page === 'letter');
  useLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);
  // and focus goes back to the card of the letter you were reading
  const lastLetter = useRef<string | null>(null);
  useLayoutEffect(() => {
    const isLetter = route.page === 'letter';
    if (isLetter && !wasLetter.current) window.scrollTo(0, 0);
    if (!isLetter && wasLetter.current) {
      window.scrollTo(0, indexScroll.current);
      const id = lastLetter.current;
      if (id) document.querySelector<HTMLElement>(`a[href="#/letter/${CSS.escape(encodeURIComponent(id))}"]`)?.focus({ preventScroll: true });
    }
    if (isLetter) lastLetter.current = route.id;
    wasLetter.current = isLetter;
  }, [route.page, route.page === 'letter' ? route.id : '']);
  const leaving = useCallback(() => { indexScroll.current = window.scrollY; }, []);

  const setFilters = useCallback((f: Filters) => {
    // filters replace the entry (typing a search shouldn't fill the history)
    history.replaceState(null, '', indexHash(f));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);

  // the index under an open letter keeps the filters it had
  const lastFilters = useRef<Filters>(NO_FILTERS);
  if (route.page === 'index') lastFilters.current = route.filters;
  const filters = lastFilters.current;

  return (
    <TooltipProvider>
      <div hidden={route.page !== 'index'}>
        <Index letters={letters} error={error} onRetry={load} filters={filters} onFilters={setFilters} onOpen={leaving} active={route.page === 'index'} />
      </div>
      {route.page === 'letter' && (
        <Suspense fallback={<div className="min-h-dvh" />}>
          <LetterPage letters={letters} error={error} onRetry={load} id={route.id} hand={route.hand} keep={route.keep} backFilters={lastFilters.current} />
        </Suspense>
      )}
      <Toaster />
    </TooltipProvider>
  );
}
