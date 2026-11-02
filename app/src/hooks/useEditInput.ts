import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { diffEdit, kindOf, type Edit } from '@/lib/edits';

/**
 * Wire a textarea to the edit stream (see lib/edits.ts). Spread the result on the <textarea> and pass
 * its ref. The textarea shows `value` (the logical text); every change reaches `onEdit` as one Edit.
 * The native `beforeinput` event supplies the hint (inputType); the diff of old and new value is the truth.
 */
export function useEditInput(ref: RefObject<HTMLTextAreaElement | null>, value: string, onEdit: (e: Edit) => void, source: Edit['source']) {
  const latest = useRef({ value, onEdit });
  latest.current = { value, onEdit };
  const hint = useRef<string | undefined>(undefined);
  const composing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onBefore = (e: InputEvent) => { hint.current = e.inputType; };
    el.addEventListener('beforeinput', onBefore);
    return () => el.removeEventListener('beforeinput', onBefore);
  }, [ref]);

  return useMemo(
    () => ({
      onCompositionStart: () => { composing.current = true; },
      onCompositionEnd: () => { composing.current = false; },
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nativeComposing = (e.nativeEvent as InputEvent).isComposing ?? false;
        const inputType = hint.current ?? (e.nativeEvent as InputEvent).inputType;
        const edit = diffEdit(latest.current.value, e.target.value, kindOf(inputType, composing.current || nativeComposing), source);
        hint.current = undefined;
        if (edit) latest.current.onEdit(edit);
      },
    }),
    [source],
  );
}
