// The Reading Room's main action: "Bring another letter →", in words rather than a filled button, in archival red: a
// ruled row in the ledger, with its key at the row's end as a quiet keycap. Only where there's a keyboard to press it
// on (a fine pointer); on touch screens it's left out.
import { cn } from '@/lib/utils';

export function BringAnother({ onClick, label = 'Bring another letter', shortcut = 'R', className }: { onClick: () => void; label?: string; shortcut?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-keyshortcuts={shortcut || undefined} title={shortcut ? `${label} (${shortcut})` : undefined} className={cn('rr-bring group', className)}>
      <span className="rr-bring-label">{label}</span>
      <span aria-hidden className="rr-bring-arrow">→</span>
      {shortcut && <kbd aria-hidden className="rr-key">{shortcut}</kbd>}
    </button>
  );
}
