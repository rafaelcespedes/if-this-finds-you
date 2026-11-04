// The Reading Room's main action: "Bring another letter", in words alone (no arrow or icon: Rafael, 3 Nov) rather than a
// filled button, in archival red: a ruled row in the ledger, with its key at the row's end as a quiet keycap. Only
// where there's a keyboard to press it on (a fine pointer); on touch screens it's left out. With the class
// rr-bring-button it is the desk's button anywhere (the Fonts page's New set); given an icon, the same button holds
// only the icon, square, its words its name (the Fonts page's Download font). Other props reach the button, so a
// tooltip can wrap it.
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<'button'>, 'onClick' | 'children'> & {
  onClick: () => void;
  label?: string;
  shortcut?: string;
  icon?: ReactNode;
};

export function BringAnother({ onClick, label = 'Bring another letter', shortcut = 'R', className, icon, ...rest }: Props) {
  return (
    <button type="button" {...rest} onClick={onClick} aria-label={icon ? label : rest['aria-label']} aria-keyshortcuts={shortcut || undefined}
      title={shortcut && !icon ? `${label} (${shortcut})` : undefined} className={cn('rr-bring group', icon && 'rr-bring-icon', className)}>
      {icon ?? <span className="rr-bring-label">{label}</span>}
      {shortcut && <kbd aria-hidden className="rr-key">{shortcut}</kbd>}
    </button>
  );
}
