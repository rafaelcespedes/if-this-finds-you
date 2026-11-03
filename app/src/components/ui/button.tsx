import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_1px_2px_rgba(20,24,40,0.25)] hover-device:hover:bg-[var(--ink-soft)]',
        secondary: 'bg-secondary text-secondary-foreground hover-device:hover:bg-accent',
        outline: 'border border-border bg-[#fdfcf9] text-foreground shadow-[0_1px_1px_rgba(60,45,20,0.04)] hover-device:hover:bg-[#f4f1ea]',
        ghost: 'text-foreground hover-device:hover:bg-accent',
        link: 'h-auto px-0 text-muted-foreground underline-offset-4 hover-device:hover:text-foreground hover-device:hover:underline active:scale-100',
      },
      size: {
        default: 'h-9 px-3.5 pointer-coarse:h-11',
        sm: 'h-8 px-3 text-[12.5px] pointer-coarse:h-11',
        lg: 'h-11 px-4 text-[14px]',
        icon: 'size-9 pointer-coarse:size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
