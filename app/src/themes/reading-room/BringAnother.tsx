// The Reading Room's main action: "Bring another letter", in words rather than a filled button, in archival red, with
// its key shown the way a library shows a call number (a small spine label with the key on it). Keyboard users see the
// label; on touch screens it's left out (there's no key to press).
import { Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BringAnother({ onClick, label = 'Bring another letter', shortcut = 'R', className }: { onClick: () => void; label?: string; shortcut?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-keyshortcuts={shortcut || undefined} className={cn('rr-bring group', className)}>
      <Shuffle aria-hidden className="rr-bring-icon" />
      <span className="rr-bring-label">{label}</span>
      {shortcut && (
        <span aria-hidden className="rr-callno">
          <span className="rr-callno-v">{shortcut}</span>
        </span>
      )}
    </button>
  );
}
