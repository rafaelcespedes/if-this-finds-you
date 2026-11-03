// The library (All letters): its two views, the index and a letter, switched by the URL hash (route.ts). The index
// stays mounted under an open letter, so coming back finds it as it was: the same cards, filters and scroll.
import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { APP_NAME } from '@/lib/brand';
import { TooltipProvider } from '@/components/ui/tooltip';
import { loadLetters } from './data';
import type { ArchiveLetter } from './model';
import { indexHash, NO_FILTERS, parseRoute, type Filters } from './route';
import { Index } from './Index';
import { headerLink, Missing, SiteHeader } from './SiteHeader';

// loaded when a letter opens (not ahead: evaluating the engine on the main thread would stutter the index's scroll)
const LetterPage = lazy(() => import('./LetterPage'));

/** When the letter page itself can't load (offline before any letter was opened, or a new version of the site has
 * replaced the files this page knows): a page that says so, instead of nothing. Back and All letters still work. */
class LetterFailed extends Component<{ id: string; back: string; children: ReactNode }, { id: string; failed: boolean }> {
  state = { id: this.props.id, failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(p: { id: string }, s: { id: string }) {
    return p.id !== s.id ? { id: p.id, failed: false } : null;
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const offline = !navigator.onLine;
    return (
      <div className="min-h-dvh">
        <SiteHeader>
          <a href={this.props.back} className={`${headerLink} font-medium text-foreground/80`}>All letters</a>
        </SiteHeader>
        <main className="mx-auto max-w-[1180px] px-4 pt-28 sm:px-8 lg:px-10">
          <Missing
            title="This letter couldn’t open."
            action={
              offline ? (
                <Button variant="outline" asChild><a href={this.props.back}>See all letters</a></Button>
              ) : (
                <Button variant="outline" onClick={() => location.reload()}>Try again</Button>
              )
            }
          >
            {offline
              ? 'You’re offline. Letters open without a connection once you’ve opened one online.'
              : 'Reload the page, then try again.'}
          </Missing>
        </main>
      </div>
    );
  }
}

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
    // a letter opens at the top (also when turning to the next one)
    if (isLetter) window.scrollTo(0, 0);
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

  useEffect(() => {
    if (route.page === 'index') document.title = `All letters · ${APP_NAME}`;
  }, [route.page]);

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
        <LetterFailed id={route.id} back={indexHash(lastFilters.current)}>
          <Suspense fallback={<div className="min-h-dvh" />}>
            <LetterPage letters={letters} error={error} onRetry={load} id={route.id} hand={route.hand} keep={route.keep} backFilters={lastFilters.current} />
          </Suspense>
        </LetterFailed>
      )}
      <Toaster />
    </TooltipProvider>
  );
}
