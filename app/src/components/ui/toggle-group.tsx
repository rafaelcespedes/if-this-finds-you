import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * A segmented control: one choice from a few. With `slide`, the chosen face is one piece that slides to the new choice
 * (0.22 s) instead of each item lighting up on its own (learned from DialKit; ui/controls.css). It measures the chosen
 * item, so it follows wrapping rows and any size; with reduced motion it simply moves.
 */
function Segmented({ className, slide, children, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & { slide?: boolean }) {
  const root = React.useRef<HTMLDivElement>(null);
  const face = React.useRef<HTMLSpanElement>(null);
  const placed = React.useRef(false);
  const place = React.useCallback(() => {
    const r = root.current, f = face.current;
    if (!r || !f) return;
    // aria-checked first: an item wrapped in a tooltip trigger has its data-state taken by the tooltip
    const on = r.querySelector<HTMLElement>(":scope > [aria-checked='true'], :scope > [data-state='on']");
    if (!on) { f.style.opacity = '0'; return; }
    f.style.transition = placed.current ? '' : 'none';
    f.style.opacity = '1';
    f.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    f.style.width = `${on.offsetWidth}px`;
    f.style.height = `${on.offsetHeight}px`;
    placed.current = true;
  }, []);
  const value = 'value' in props ? JSON.stringify(props.value) : '';
  React.useLayoutEffect(() => { if (slide) place(); }, [slide, place, value]);
  React.useEffect(() => {
    if (!slide || !root.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place());
    ro.observe(root.current);
    return () => ro.disconnect();
  }, [slide, place]);
  return (
    <ToggleGroupPrimitive.Root
      ref={root}
      data-slot="segmented"
      data-slide={slide ? '' : undefined}
      className={cn('grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-secondary p-0.5', className)}
      {...props}
    >
      {slide && <span ref={face} aria-hidden className="seg-face" />}
      {children}
    </ToggleGroupPrimitive.Root>
  );
}

function SegmentedItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="segmented-item"
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[0.8125rem] font-medium text-muted-foreground transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[var(--st-scale)] pointer-coarse:h-11 hover-device:hover:text-foreground data-[state=on]:bg-[var(--tile-on)] data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_2px_rgba(40,30,10,0.12),0_0_0_0.5px_rgba(40,30,10,0.06)] aria-checked:bg-[var(--tile-on)] aria-checked:text-foreground aria-checked:shadow-[0_1px_2px_rgba(40,30,10,0.12),0_0_0_0.5px_rgba(40,30,10,0.06)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}

/** A small chip in a wrapping row (the paper's kinds; the Fonts page's filter words). One choice or several:
 * the chosen ones take the ink's ring. Sized by density.css's chip tokens (--chip-h, --chip-text, --m-chip-h). */
function SegmentedChip({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <SegmentedItem
      data-chip=""
      className={cn(
        'h-[var(--chip-h,1.75rem)] rounded-[3px] bg-secondary px-[9px] text-[length:var(--chip-text,0.75rem)] aria-checked:bg-[var(--tile-on)] aria-checked:shadow-[0_0_0_1.5px_var(--ink)] data-[state=on]:bg-[var(--tile-on)] data-[state=on]:shadow-[0_0_0_1.5px_var(--ink)] pointer-coarse:h-[var(--m-chip-h,2.75rem)] pointer-coarse:px-[11px]',
        className,
      )}
      {...props}
    />
  );
}

export { Segmented, SegmentedChip, SegmentedItem };
