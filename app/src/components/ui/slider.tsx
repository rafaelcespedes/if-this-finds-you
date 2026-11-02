import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn('relative flex h-5 w-full touch-none select-none items-center pointer-coarse:h-11 data-[disabled]:opacity-50', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-[#dcd6ca]">
        <SliderPrimitive.Range className="absolute h-full bg-[color-mix(in_oklab,var(--ink)_78%,transparent)]" />
      </SliderPrimitive.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="relative block size-4 rounded-full border border-[color-mix(in_oklab,var(--ink)_30%,transparent)] bg-[#fffefb] shadow-[0_1px_2px_rgba(30,24,12,0.18),0_2px_6px_-2px_rgba(30,24,12,0.18)] transition-[transform,box-shadow] duration-150 ease-out after:absolute after:-inset-3 after:content-[''] hover-device:hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:size-5"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
