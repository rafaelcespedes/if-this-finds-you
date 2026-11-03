// All letters in the Postmarked look: a wall of envelopes, each addressed "To: …" as the letter really was and
// postmarked with its town and year, the letter itself (written in its hand by the card worker) standing out of
// the top. Rendered only when LOOK === 'postmarked' (a one-line hook in archive/Canvas.tsx). Same link, same
// hidden words and the same card images as the canvas's own cards.
import { memo, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { cardKey, cards } from '@/archive/cards';
import { cardLetter } from '@/archive/Card';
import { circumstanceLabel, fromTo, lostInTransit, opening, whereWhen } from '@/archive/data';
import type { ArchiveLetter } from '@/archive/model';
import { letterHash } from '@/archive/route';
import { Cancellation, Postmark } from './Postmark';
import { addressee, cancellationOf, postTown, tiltFor } from './model';

/** of the card's width: how much of the letter stands out of the envelope, and the envelope's height */
const PEEK = 0.44;
const ENVELOPE = 0.6;

export const EnvelopeCard = memo(function EnvelopeCard({ letter, aspect, size, style, itemRef, onOpen }: {
  letter: ArchiveLetter; aspect: number; size: { css: number; width: number }; style: CSSProperties; itemRef: (el: HTMLElement | null) => void; onOpen: () => void;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const key = cardKey(letter.id, undefined, size);
  const img = useSyncExternalStore((cb) => cards.subscribe(key, cb), () => cards.get(key));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = paperRef.current;
    if (!el || img) return;
    cards.want({ key, letter: cardLetter(letter), width: size.width, css: size.css, aspect, el });
    return () => cards.unwant(key);
  }, [key, img, letter, size, aspect]);
  const b = img ? img.bleed / img.width : 0;
  const special = lostInTransit(letter);
  const w = typeof style.width === 'number' ? style.width : 200;
  const small = w < 170;
  const to = addressee(letter.recipient);
  const cancel = cancellationOf(letter.found?.circumstance);
  return (
    <li ref={itemRef} data-place={letter.id} className="canvas-item absolute top-0 left-0" style={style}>
      <a
        href={letterHash(letter.id)}
        onClick={onOpen}
        draggable={false}
        title={`${fromTo(letter)}\n${whereWhen(letter)}`}
        className="archive-card pm-env-card group block outline-none"
      >
        <div className="pm-env-stack relative" style={{ height: w * (PEEK + ENVELOPE) }}>
          {/* the letter, standing out of the envelope's mouth */}
          <div className="pm-env-letter absolute inset-x-[7%] top-0 bottom-[12%] overflow-hidden">
            <div ref={paperRef} className="relative isolate" style={{ aspectRatio: `1 / ${aspect}` }}>
              <div aria-hidden className={cn('archive-sheet-blank absolute inset-0 bg-[var(--paper)]', loaded && 'is-gone')} />
              {img && (
                <img
                  src={img.url}
                  alt=""
                  aria-hidden
                  decoding="async"
                  draggable={false}
                  onLoad={() => { setLoaded(true); cards.shown(); }}
                  style={{ left: `${-b * 100}%`, marginTop: `${-b * 100}%`, width: `${(1 + 2 * b) * 100}%` }}
                  className={cn('absolute top-0 h-auto max-w-none select-none', img.fresh && 'card-in')}
                />
              )}
            </div>
          </div>
          {/* the envelope's front: to whom, and the postmark */}
          <div aria-hidden className="pm-env-front absolute inset-x-0 bottom-0" style={{ height: w * ENVELOPE }}>
            <Postmark town={postTown(letter.place)} year={letter.year} size={small ? 42 : 56} tilt={tiltFor(letter.id)} className="pm-env-mark" />
            {cancel && <Cancellation label={cancel} tilt={-10 + tiltFor(letter.id, 6)} className="pm-env-cancel" />}
            <div className="pm-env-to">
              <span className="pm-label">To</span>
              <span className={cn('pm-env-address', small ? 'line-clamp-2' : 'line-clamp-3')}>{to || 'whoever this finds'}</span>
            </div>
          </div>
        </div>
        <h3 className="canvas-title font-letter mt-2.5 pr-1 leading-[1.25] text-foreground/85 text-pretty">
          {letter.title ?? opening(letter.text, 48)}
        </h3>
        <span className="sr-only">
          {special ? `${circumstanceLabel(letter)}. ` : ''}{fromTo(letter)}. {whereWhen(letter)}.
        </span>
      </a>
    </li>
  );
});
