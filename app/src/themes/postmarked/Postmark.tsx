// The look's one mark besides the airmail edge: a round date stamp with the letter's town and year, and "found"
// with this year on its lower arc (when it reached you). Invented, never a real office's mark. Drawn flat, in
// postmark ink, a touch askew. A red boxed cancellation sits beside it only where the provenance says so.
import { useId, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { FOUND_YEAR } from './model';

export function Postmark({ town, year, size, tilt = 0, className, style, found = true }: {
  town: string;
  year?: number;
  /** px */
  size: number;
  tilt?: number;
  className?: string;
  style?: CSSProperties;
  found?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const t = town || 'PLACE UNKNOWN';
  // the town fills the upper arc at most (mono: about 0.68 em a letter with the spacing)
  const fs = Math.min(9.5, 84 / (t.length * 0.68));
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className={cn('pm-postmark', className)}
      style={{ width: size, height: size, rotate: `${tilt.toFixed(1)}deg`, ...style }}
    >
      <defs>
        <path id={`${id}-t`} d="M 16 50 A 34 34 0 0 1 84 50" />
        <path id={`${id}-b`} d="M 9 50 A 41 41 0 0 0 91 50" />
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="50" cy="50" r="29" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <text fontSize={fs.toFixed(2)} letterSpacing="0.08em" fill="currentColor" className="pm-postmark-arc">
        <textPath href={`#${id}-t`} startOffset="50%" textAnchor="middle">{t}</textPath>
      </text>
      {year != null && (
        <text x="50" y="50" dy="0.35em" fontSize={year >= 1000 ? 15.5 : 17} textAnchor="middle" fill="currentColor" className="pm-postmark-year">
          {year}
        </text>
      )}
      {found && (
        <text fontSize="6.6" letterSpacing="0.16em" fill="currentColor" className="pm-postmark-arc">
          <textPath href={`#${id}-b`} startOffset="50%" textAnchor="middle">FOUND {FOUND_YEAR}</textPath>
        </text>
      )}
    </svg>
  );
}

/** "INTERCEPTED" / "UNDELIVERED": a boxed red cancellation, true to the letter's provenance. */
export function Cancellation({ label, tilt = -9, className, style }: { label: string; tilt?: number; className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden className={cn('pm-cancel', className)} style={{ rotate: `${tilt}deg`, ...style }}>
      {label}
    </span>
  );
}
