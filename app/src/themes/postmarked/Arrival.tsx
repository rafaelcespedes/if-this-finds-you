// A shared letter arrives in its envelope: addressed as the letter really was, postmarked, with the airmail edge.
// The flap opens, the sheet slides out, and the envelope falls away while the letter is already writing itself
// underneath (it never waits for this). About 0.65 s; any tap or key skips it; absent under reduced motion.
// Plays once, when it mounts (opening a link, or a letter from the wall), never when turning to the next letter.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cancellation, Postmark } from './Postmark';
import { reducedMotion, tiltFor } from './model';

export interface ArrivalProps {
  id: string;
  /** "his brother, Citizen Fabregue, …" (or "you") */
  to: string;
  from?: string;
  town: string;
  year?: number;
  cancel?: string | null;
}

const LENGTH = 660;

export function Arrival(p: ArrivalProps) {
  const [shown, setShown] = useState(() => !reducedMotion());
  const done = useCallback(() => setShown(false), []);
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(done, LENGTH);
    // the key that skips it does only that (the page's own keys would finish the writing too)
    const onKey = (e: KeyboardEvent) => { e.stopPropagation(); done(); };
    window.addEventListener('keydown', onKey, true);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey, true); };
  }, [shown, done]);
  if (!shown) return null;
  return createPortal(
    <div
      aria-hidden
      className="pm-arrival"
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); done(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pm-arrival-env">
        <div className="pm-arrival-flap" />
        <div className="pm-arrival-sheet" />
        <div className="pm-arrival-front pm-airmail">
          <div className="pm-arrival-from">{p.from ? <>From {p.from}</> : null}</div>
          <Postmark town={p.town} year={p.year} size={84} tilt={tiltFor(p.id)} className="pm-arrival-mark" />
          {p.cancel && <Cancellation label={p.cancel} tilt={-11} className="pm-arrival-cancel" />}
          <div className="pm-arrival-to">
            <span className="pm-label">To</span>
            <span className="pm-arrival-address">{p.to}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
