import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { diffEdit, kindOf, type Edit } from '@/lib/edits';

/** Text an IME is still composing: not committed yet, drawn underlined, never written in ink. */
export interface Composition {
  /** UTF-16 offset where the composing text starts */
  from: number;
  text: string;
}

/**
 * Wire a textarea to the edit stream (see lib/edits.ts). Spread the result on the <textarea> and pass
 * its ref. The textarea shows `value` (the logical text); every change reaches `onEdit` as one Edit.
 * The native `beforeinput` event supplies the hint (inputType); the diff of old and new value is the truth.
 * While an IME composes, `onComposition` gets the composing range (worked out from the value, since
 * Android's composition `data` is unreliable), and nothing should touch the textarea.
 * Given `onHistory`, undo and redo are the page's own (lib/edits.ts UndoHistory): the browser's are cancelled, from
 * the keys (see `historyKey`), the Edit menu or a shake, so it never rewrites the field behind the letter's back.
 */
export function useEditInput(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onEdit: (e: Edit) => void,
  source: Edit['source'],
  onComposition?: (c: Composition | null) => void,
  onHistory?: (dir: 'undo' | 'redo') => void,
) {
  const latest = useRef({ value, onEdit, onComposition, onHistory });
  latest.current = { value, onEdit, onComposition, onHistory };
  const hint = useRef<string | undefined>(undefined);
  // where the composition started, and the text length outside it
  const comp = useRef<{ from: number; outside: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onBefore = (e: InputEvent) => {
      const h = latest.current.onHistory;
      if (h && (e.inputType === 'historyUndo' || e.inputType === 'historyRedo')) {
        e.preventDefault();
        h(e.inputType === 'historyUndo' ? 'undo' : 'redo');
        hint.current = 'history-handled';
        return;
      }
      hint.current = e.inputType;
    };
    el.addEventListener('beforeinput', onBefore);
    return () => el.removeEventListener('beforeinput', onBefore);
  }, [ref]);

  return useMemo(
    () => ({
      onCompositionStart: (e: React.CompositionEvent<HTMLTextAreaElement>) => {
        const el = e.currentTarget;
        comp.current = { from: el.selectionStart, outside: el.value.length - (el.selectionEnd - el.selectionStart) };
        latest.current.onComposition?.({ from: el.selectionStart, text: '' });
      },
      onCompositionEnd: () => {
        comp.current = null;
        latest.current.onComposition?.(null);
      },
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nativeComposing = (e.nativeEvent as InputEvent).isComposing ?? false;
        const composing = comp.current != null || nativeComposing;
        const inputType = hint.current ?? (e.nativeEvent as InputEvent).inputType;
        const next = e.target.value;
        // the browser undid anyway (a cancel it ignored): the field goes back to the letter, the page's undo stands
        if (latest.current.onHistory && inputType?.startsWith('history')) {
          hint.current = undefined;
          e.target.value = latest.current.value;
          return;
        }
        const edit = diffEdit(latest.current.value, next, kindOf(inputType, composing), source);
        if (edit && inputType) edit.input = inputType;
        hint.current = undefined;
        if (edit) latest.current.onEdit(edit);
        if (comp.current) {
          const { from, outside } = comp.current;
          latest.current.onComposition?.({ from, text: next.slice(from, from + Math.max(0, next.length - outside)) });
        }
      },
    }),
    [source],
  );
}

/** Undo and redo from the keys: ⌘Z / ⌘⇧Z on Apple keyboards, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y elsewhere. */
export function historyKey(e: React.KeyboardEvent): 'undo' | 'redo' | null {
  const mod = isMac() ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !isMac()) return 'redo';
  return null;
}

/** True when a key event belongs to an IME composition (Safari sends keyCode 229 around commits). */
export const isComposingKey = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

/** Mac-style shortcuts (Cmd+arrows for line ends), without the deprecated navigator.platform. */
export function isMac() {
  const uad = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /mac|iphone|ipad/i.test(uad?.platform || navigator.userAgent);
}
