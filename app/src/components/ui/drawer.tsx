import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '@/lib/utils';

const Drawer = (props: React.ComponentProps<typeof DrawerPrimitive.Root>) => <DrawerPrimitive.Root {...props} />;
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;
const DrawerTitle = DrawerPrimitive.Title;
const DrawerDescription = DrawerPrimitive.Description;

function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(40,32,18,0.18)]" />
      <DrawerPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[18px] border-t border-border bg-panel shadow-[0_-8px_40px_-12px_rgba(40,30,10,0.25)] outline-none',
          className,
        )}
        {...props}
      >
        <div aria-hidden className="mx-auto mt-2.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-[#d4cec2]" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

export { Drawer, DrawerTrigger, DrawerClose, DrawerContent, DrawerTitle, DrawerDescription };
