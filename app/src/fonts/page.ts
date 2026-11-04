// What both Fonts pages share (the page that's live, new/FontsNew.tsx, and the earlier one, FontsApp.tsx, behind
// ?fonts=old): the URL as the state, a value that settles, the reader's text size, the window's width and density,
// and the page's two sentences. Kept apart so the earlier page can load on its own, only when it's asked for.
import { useCallback, useEffect, useState } from 'react';
import { newSetSeed, readRoute, routeSearch, type FontsRoute } from './route';

export function useRoute() {
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
export function useSettled<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** px per rem: the root's font size, which the reader's text size scales (read again on resize). */
export function useRootRem() {
  const read = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const [rem, setRem] = useState(read);
  useEffect(() => {
    const on = () => setRem(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return rem;
}

export function useViewportWidth() {
  const [w, setW] = useState(() => document.documentElement.clientWidth || innerWidth);
  useEffect(() => {
    const on = () => setW(document.documentElement.clientWidth || innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/** The screen's pixel density (capped at 3), kept up to date when it changes (another screen, browser zoom). */
export function useDevicePixelRatio() {
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

// the pitch and the longer intro: docs/brand/naming-and-copy.md §2.11 (Rafael's approved copy)
export const INTRO = 'Every hand here is a font you can keep. Free and open source.';
export const ABOUT = 'Every writer who copies out a letter here has a hand of their own, and every hand is a font you can download, free and open source. Each one is named after its writer. A font keeps four or five versions of each letter, so it won’t vary the way the page does, but it’s the same hand.';
