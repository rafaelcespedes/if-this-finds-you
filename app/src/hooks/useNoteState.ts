import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeState, encodeState, DEFAULT_STATE, type NoteState } from '@/lib/state';

/** The note configuration, kept in the URL hash so a reload or a shared link restores it exactly. */
export function useNoteState() {
  const [state, setState] = useState<NoteState>(() =>
    window.location.hash.length > 1 ? decodeState(window.location.hash) : DEFAULT_STATE,
  );
  const lastWritten = useRef<string>('');

  // write the hash (debounced, without adding history entries)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const h = encodeState(state);
      lastWritten.current = h;
      if (window.location.hash.slice(1) !== h) history.replaceState(null, '', '#' + h);
    }, 250);
    return () => window.clearTimeout(id);
  }, [state]);

  // a link pasted into this tab
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1);
      if (h && h !== lastWritten.current) setState(decodeState(h));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const update = useCallback((patch: Partial<NoteState> | ((s: NoteState) => Partial<NoteState>)) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  return [state, update] as const;
}
