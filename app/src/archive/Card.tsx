// One letter in the library: the letter itself, a sheet of its paper with the letter written on it in its own hand
// (an image the card worker writes when the card comes near the screen), lying a touch askew like a letter put down
// on a table, and under it the letter's title. Who wrote it, where and when are a hover and a screen reader away
// (the link's title and its hidden text), and on the letter's page.
import { memo, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { cardKey, cards } from './cards';
import { circumstanceLabel, fromTo, lostInTransit, opening, whereWhen } from './data';
import type { ArchiveLetter } from './model';
import { letterHash } from './route';
import type { CardLetter } from './card-protocol';

// one observer for every card: a card within ~1.5 screens is wanted, further away it isn't
const watchers = new Map<Element, (near: boolean) => void>();
let io: IntersectionObserver | null = null;
function watch(el: Element, fn: (near: boolean) => void) {
  io ??= new IntersectionObserver((entries) => { for (const e of entries) watchers.get(e.target)?.(e.isIntersecting); }, { rootMargin: '120% 0px' });
  watchers.set(el, fn);
  io.observe(el);
  return () => { io?.unobserve(el); watchers.delete(el); };
}

export const cardLetter = (l: ArchiveLetter): CardLetter => ({
  id: l.id, text: l.text, lang: l.lang, year: l.year, tags: l.tags, traditions: l.traditions, olderHandsOnly: l.olderHandsOnly, look: l.look, origin: l.origin,
  recipient: l.recipient, found: l.found ? { circumstance: l.found.circumstance } : undefined,
});

/** A letter put down on a table: up to half a degree either way, the same every time. */
function tiltOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 1.0;
}

interface Props {
  letter: ArchiveLetter;
  /** this grid's card size (cards.ts cardSize) */
  size: { css: number; width: number } | null;
  /** the sheet's height for its width (card-protocol.ts cardAspect) */
  aspect: number;
  onOpen: () => void;
}

export const Card = memo(function Card({ letter, size, aspect, onOpen }: Props) {
  const paperRef = useRef<HTMLDivElement>(null);
  const key = size ? cardKey(letter.id, undefined, size) : '';
  const img = useSyncExternalStore((cb) => cards.subscribe(key, cb), () => cards.get(key));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = paperRef.current;
    if (!el || !size || img) return;
    return watch(el, (near) => {
      if (near) cards.want({ key, letter: cardLetter(letter), width: size.width, css: size.css, aspect, el });
      else cards.unwant(key);
    });
  }, [key, size, letter, img, aspect]);

  // the image is a little larger than the sheet when the sheet casts its own shadow (a deckled or torn edge)
  const b = img ? img.bleed / img.width : 0;
  const imgStyle: CSSProperties = { left: `${-b * 100}%`, marginTop: `${-b * 100}%`, width: `${(1 + 2 * b) * 100}%` };
  const shapedShown = !!img?.shaped && loaded;
  const special = lostInTransit(letter);
  return (
    <li className="masonry-item">
      <a
        href={letterHash(letter.id)}
        onClick={onOpen}
        title={`${fromTo(letter)}\n${whereWhen(letter)}`}
        className="archive-card group block rounded-[3px] outline-none"
      >
        <div
          ref={paperRef}
          className="archive-sheet relative isolate"
          style={{ aspectRatio: `1 / ${aspect}`, '--tilt': `${tiltOf(letter.id).toFixed(2)}deg` } as CSSProperties}
        >
          <div aria-hidden className={cn('archive-sheet-blank absolute inset-0 rounded-[1px] bg-[var(--paper)]', shapedShown && 'opacity-0')} />
          {img && (
            <img
              src={img.url}
              alt=""
              aria-hidden
              decoding="async"
              draggable={false}
              onLoad={() => { setLoaded(true); cards.shown(); }}
              style={imgStyle}
              className={cn('absolute top-0 h-auto max-w-none select-none', img.fresh && 'card-in')}
            />
          )}
        </div>
        <h3 className="font-letter mt-3.5 pr-2 text-[calc(14px*var(--letter-scale))] leading-[1.3] text-foreground/90 text-pretty sm:text-[calc(16px*var(--letter-scale))]">
          {letter.title ?? opening(letter.text, 48)}
        </h3>
        <span className="sr-only">
          {special ? `${circumstanceLabel(letter)}. ` : ''}{fromTo(letter)}. {whereWhen(letter)}. Begins: {opening(letter.text, 160)}
        </span>
      </a>
    </li>
  );
});
