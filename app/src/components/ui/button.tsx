import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-[0.8125rem] font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        // Rubric: flat warm black, no shadow, like ink on paper; it lifts to brown-black under the pointer and goes to true black when held
        default: 'bg-primary text-primary-foreground hover-device:hover:bg-[var(--ink-soft)] active:bg-[var(--ink-press)]',
        secondary: 'bg-secondary text-secondary-foreground hover-device:hover:bg-accent',
        outline: 'border border-border bg-[var(--field)] text-foreground hover-device:hover:bg-[var(--chip)]',
        ghost: 'text-foreground hover-device:hover:bg-accent',
        link: 'h-auto px-0 text-muted-foreground underline-offset-4 hover-device:hover:text-foreground hover-device:hover:underline active:scale-100',
      },
      size: {
        default: 'h-9 px-3.5 pointer-coarse:h-11',
        sm: 'h-8 px-3 text-[0.7812rem] pointer-coarse:h-11',
        lg: 'h-11 px-4 text-[0.875rem]',
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
