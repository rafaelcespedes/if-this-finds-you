// One quiet line of UI type in the margin: a note from the hint ladder (hints.ts). The page places it: beside the
// line being written when there's room right of the sheet (16 px out, centred on the caret's line, at most 200 px
// wide), otherwise one centred line near the bottom, or just above a phone's keyboard; never over ink.
// A note brought by a pause or by the pen fades in (180 ms, --dur-pop, sliding 4 px); one answering a key or a click
// is simply there. A key or pointerdown takes it away at once (hints.ts); untouched, it fades out (130 ms, --dur-out).
// No box, no shadow: a label in the margin. Its words reach screen readers through the page's live region (hints'
// `announce`), so the line itself is hidden from them.
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { HintPart, ShownNote } from './hints';

export function MarginNote({ note, className, style }: { note: ShownNote | null; className?: string; style?: CSSProperties }) {
  if (!note) return null;
  return (
    <p
      // (a new showing is a new element: its fade starts over)
      key={note.n}
      aria-hidden
      data-hint={note.id}
      className={cn('margin-note', note.fade && !note.leaving && 'margin-note-in', note.leaving && 'margin-note-out', className)}
      style={{ ...style, ...(note.leaving ? { animationDuration: `${note.outMs}ms` } : null) }}
    >
      {note.parts.map((p: HintPart, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <kbd key={i}>{p.kbd}</kbd>))}
    </p>
  );
}
