// The tool's dropdown menus: the surface they open on and their items. Shared by the tool (Share) and the Fonts page.
import { DropdownMenu } from 'radix-ui';
import { cn } from '@/lib/utils';

/** The menu's surface (add a width): the tool's frosted paper card, opening from its trigger. */
export const menuContent =
  'z-50 origin-(--radix-dropdown-menu-content-transform-origin) rounded-2xl border border-border bg-[color-mix(in_oklab,#fdfcf9_96%,transparent)] p-1.5 shadow-[0_1px_2px_rgba(60,45,20,0.08),0_16px_40px_-12px_rgba(40,30,10,0.35)] backdrop-blur-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-(--dur-out) data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-(--dur-pop) data-[state=open]:ease-(--ease-out) motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100';

/** A plain or radio item (the Writing menu's): a 44 px row, highlighted under the pointer. */
export const menuItem =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-[3px] px-3 py-2 text-[0.875rem] text-foreground outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-accent';

export function MenuItem({ children, icon, onSelect, disabled, quiet, hint }: { children: React.ReactNode; icon: React.ReactNode; onSelect: () => void; disabled?: boolean; quiet?: boolean; hint?: string }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[3px] px-3 text-foreground outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent [&_svg]:size-[17px] [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        quiet ? 'text-[0.8125rem]' : 'text-[0.875rem]',
        hint && 'py-2',
      )}
    >
      {hint ? (
        <span className="grid gap-0.5">
          <span>{children}</span>
          <span className="text-[0.7188rem] leading-snug text-muted-foreground">{hint}</span>
        </span>
      ) : children}
      {icon}
    </DropdownMenu.Item>
  );
}
