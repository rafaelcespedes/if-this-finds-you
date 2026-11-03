import { useId, useLayoutEffect, useRef } from 'react';
import type { Edit } from '@/lib/edits';
import { useEditInput } from '@/hooks/useEditInput';

/**
 * The note as plain text, for long edits, pasting, or keyboards that struggle with the paper.
 * (Typing directly on the paper is the main way to edit.)
 */
export function DraftSlip({ value, onEdit, width, onComposingChange }: { value: string; onEdit: (e: Edit) => void; width: number; onComposingChange?: (c: boolean) => void }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const input = useEditInput(ref, value, onEdit, 'plain', (c) => onComposingChange?.(c != null));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value, width]);
  return (
    <div className="relative rounded-xl border border-border bg-[#f8f6f1] px-4 pt-3 pb-3" style={{ width: Math.max(0, width - 16) }}>
      <label htmlFor={id} className="mb-1 block text-[0.75rem] text-muted-foreground">
        Plain text
      </label>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={3}
        spellCheck
        {...input}
        placeholder="Write your note…"
        className="block w-full resize-none overflow-hidden bg-transparent text-[0.9375rem] leading-[1.6] text-foreground placeholder:text-faint focus:outline-none pointer-coarse:text-[1rem]"
      />
    </div>
  );
}
