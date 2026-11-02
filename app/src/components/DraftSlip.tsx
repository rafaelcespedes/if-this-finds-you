import { useId, useLayoutEffect, useRef } from 'react';

/**
 * The plain-text draft of the note, tucked under the letter like a second sheet.
 * (Typing directly on the paper is the other way to edit.)
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
    <div className="relative -mt-2 rounded-b-[3px] bg-[#f6f3ec] px-5 pt-5 pb-4 shadow-[0_1px_2px_rgba(60,45,20,0.06)]" style={{ width: Math.max(0, width - 16) }}>
      <label htmlFor={id} className="mb-1 block text-[12px] text-muted-foreground">
        Draft
      </label>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={3}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your note…"
        className="block w-full resize-none bg-transparent text-[15px] leading-[1.6] text-foreground placeholder:text-faint focus:outline-none pointer-coarse:text-[16px]"
      />
    </div>
  );
}
