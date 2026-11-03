// "Find another" as a round red stamp. Pressing it cancels the stamp (a postmark lands on it, carrying the next
// letter's town and year) and brings the next letter at once: the mark is drawn over the press, never before it.
// Reduced motion: the mark appears and goes without moving.
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Postmark } from './Postmark';
import { tiltFor } from './model';

export function StampButton({ onPress, size = 64, mark, label = 'Find another', shortcut, className }: {
  onPress: () => void;
  /** px, drawn; the tap target is never under 44 */
  size?: number;
  /** the letter now on the page: the cancellation carries its town and year */
  mark?: { town: string; year?: number } | null;
  label?: string;
  /** e.g. "R" */
  shortcut?: string;
  className?: string;
}) {
  const [n, setN] = useState(0);
  const [on, setOn] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const press = () => {
    setN((k) => k + 1);
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), 1100);
    onPress();
  };
  return (
    <button
      type="button"
      onClick={press}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
      data-cancelled={on || undefined}
      className={cn('pm-stamp', className)}
      style={{ width: size, height: size }}
    >
      <span aria-hidden className="pm-stamp-face">
        <span className="pm-stamp-words">
          <span>Find</span>
          <span>another</span>
        </span>
      </span>
      {on && (
        <Postmark
          key={n}
          town={mark?.town ?? ''}
          year={mark?.year}
          size={Math.round(size * 1.08)}
          tilt={tiltFor(String(n), 40)}
          found={false}
          className="pm-stamp-cancel"
        />
      )}
    </button>
  );
}
