import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeState, encodeState, DEFAULT_STATE, type NoteState } from '@/lib/state';

/** The note configuration, kept in the URL hash so a reload or a shared link restores it exactly. */
export function useNoteState(paused = false) {
  const [state, setState] = useState<NoteState>(() =>
    window.location.hash.length > 1 ? decodeState(window.location.hash) : DEFAULT_STATE,
  );
  const lastWritten = useRef<string>('');
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

  return [state, update, markStep] as const;
}
