// The Reading Room's main action: "Bring another letter →", in words rather than a filled button, in archival red: a
// ruled row in the ledger, with its key at the row's end ("key R"). Keyboard users see the key; on touch screens it's
// left out (there's no key to press).
import { cn } from '@/lib/utils';

export function BringAnother({ onClick, label = 'Bring another letter', shortcut = 'R', className }: { onClick: () => void; label?: string; shortcut?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-keyshortcuts={shortcut || undefined} className={cn('rr-bring group', className)}>
      <span className="rr-bring-label">{label}</span>
      <span aria-hidden className="rr-bring-arrow">→</span>
      {shortcut && (
        <span aria-hidden className="rr-callno">
          <span className="rr-sc">key</span> <span className="rr-callno-v">{shortcut}</span>
        </span>
      )}
    </button>
  );
}
