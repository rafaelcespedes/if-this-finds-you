import { useId, useLayoutEffect, useRef } from 'react';

/**
 * The note as plain text, for long edits, pasting, or keyboards that struggle with the paper.
 * (Typing directly on the paper is the main way to edit.)
 */
export function DraftSlip({ value, onChange, width }: { value: string; onChange: (t: string) => void; width: number }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value, width]);
  return (
    <div className="relative rounded-xl border border-border bg-[#f8f6f1] px-4 pt-3 pb-3" style={{ width: Math.max(0, width - 16) }}>
      <label htmlFor={id} className="mb-1 block text-[12px] text-muted-foreground">
        Plain text
      </label>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={3}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your note…"
        className="block w-full resize-none overflow-hidden bg-transparent text-[15px] leading-[1.6] text-foreground placeholder:text-faint focus:outline-none pointer-coarse:text-[16px]"
      />
    </div>
  );
}
