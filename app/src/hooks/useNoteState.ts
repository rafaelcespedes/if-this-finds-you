import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeState, encodeState, DEFAULT_STATE, type NoteState } from '@/lib/state';

/** The link saved on leaving the page, for this tab: a reload goes to the address as it was before. */
const LEFT_KEY = 'seedhand:left';

/** The hash to start from: the link, or what was saved on leaving it (a reload straight after typing). */
function startHash(): string {
  const h = window.location.hash.slice(1);
  try {
    const left = JSON.parse(sessionStorage.getItem(LEFT_KEY) ?? 'null') as { from: string; to: string; t: number } | null;
    sessionStorage.removeItem(LEFT_KEY);
    if (left && left.from === h && Date.now() - left.t < 6 * 3600_000) {
      history.replaceState(null, '', '#' + left.to);
      return left.to;
    }
  } catch { /* nothing saved */ }
  return h;
}

/** The note configuration, kept in the URL hash so a reload or a shared link restores it exactly. */
export function useNoteState(paused = false) {
  const [state, setState] = useState<NoteState>(() => {
    const h = startHash();
    return h ? decodeState('#' + h) : DEFAULT_STATE;
  });
  const lastWritten = useRef<string>('');
  const latest = useRef(state);
  latest.current = state;
  // the next write is a step of its own (a new hand, another writer, another letter), so Back brings the last one back
  const step = useRef(false);

  // write the hash (debounced, without adding history entries)
  useEffect(() => {
    // no link updates for every composition step
    if (paused) return;
    const id = window.setTimeout(() => {
      const h = encodeState(state);
      lastWritten.current = h;
      if (window.location.hash.slice(1) === h) return;
      if (step.current) history.pushState(null, '', '#' + h);
      else history.replaceState(null, '', '#' + h);
      step.current = false;
      // the link has moved on from what was saved on leaving
      try { sessionStorage.removeItem(LEFT_KEY); } catch { /* fine */ }
    }, 250);
    return () => window.clearTimeout(id);
  }, [state, paused]);

  // a link pasted into this tab
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1);
      if (h && h !== lastWritten.current) setState(decodeState(h));
    };
    window.addEventListener('hashchange', onHash);
    // Back and Forward between the steps
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const update = useCallback((patch: Partial<NoteState> | ((s: NoteState) => Partial<NoteState>)) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  /** The change about to be made is a step in the browser's history (Back undoes it). */
  const markStep = useCallback(() => { step.current = true; }, []);

  /** Write the link now, with a last change (leaving the page: nothing typed waits for the debounce). */
  const saveNow = useCallback((patch?: Partial<NoteState>) => {
    const s = patch ? { ...latest.current, ...patch } : latest.current;
    const h = encodeState(s);
    const from = window.location.hash.slice(1);
    lastWritten.current = h;
    if (from !== h) {
      history.replaceState(null, '', '#' + h);
      try { sessionStorage.setItem(LEFT_KEY, JSON.stringify({ from, to: h, t: Date.now() })); } catch { /* the hash is saved */ }
    }
    if (patch) { latest.current = s; setState(s); }
  }, []);

  return [state, update, markStep, saveNow] as const;
}
