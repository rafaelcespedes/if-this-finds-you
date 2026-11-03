import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** A segmented control: one choice from a few. */
function Segmented({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="segmented"
      className={cn('grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-secondary p-0.5', className)}
      {...props}
    />
  );
}

function SegmentedItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="segmented-item"
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[0.8125rem] font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-150 ease-out pointer-coarse:h-11 hover-device:hover:text-foreground data-[state=on]:bg-[var(--tile-on)] data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_2px_rgba(40,30,10,0.12),0_0_0_0.5px_rgba(40,30,10,0.06)] aria-checked:bg-[var(--tile-on)] aria-checked:text-foreground aria-checked:shadow-[0_1px_2px_rgba(40,30,10,0.12),0_0_0_0.5px_rgba(40,30,10,0.06)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}

/** A small chip in a wrapping row (the paper's kinds; the Fonts page's filter words). One choice or several:
 * the chosen ones take the ink's ring. */
function SegmentedChip({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <SegmentedItem
      className={cn(
        'h-7 rounded-[3px] bg-secondary px-2.5 text-[0.75rem] aria-checked:bg-[var(--tile-on)] aria-checked:shadow-[0_0_0_1.5px_var(--ink)] data-[state=on]:bg-[var(--tile-on)] data-[state=on]:shadow-[0_0_0_1.5px_var(--ink)] pointer-coarse:h-11 pointer-coarse:px-3.5',
        className,
      )}
      {...props}
    />
  );
}

export { Segmented, SegmentedChip, SegmentedItem };
