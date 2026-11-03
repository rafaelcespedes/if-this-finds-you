// One letter in the index: the top of its first sheet with the opening lines in its own hand (an image written by
// the card worker when the card comes near the screen), and under it the letter's title, who wrote to whom, and
// where and when. The whole card is one link; screen readers hear the title, the origin and how the letter begins.
import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
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
});

interface Props {
  letter: ArchiveLetter;
  /** this grid's card size (cards.ts cardSize) */
  size: { css: number; width: number } | null;
  onOpen: () => void;
}

export const Card = memo(function Card({ letter, size, onOpen }: Props) {
  const paperRef = useRef<HTMLDivElement>(null);
  const key = size ? cardKey(letter.id, undefined, size) : '';
  const img = useSyncExternalStore((cb) => cards.subscribe(key, cb), () => cards.get(key));

  useEffect(() => {
    const el = paperRef.current;
    if (!el || !size || img) return;
    return watch(el, (near) => {
      if (near) cards.want({ key, letter: cardLetter(letter), width: size.width, css: size.css, el });
      else cards.unwant(key);
    });
  }, [key, size, letter, img]);

  const special = lostInTransit(letter);
  return (
    <li className="min-w-0">
      <a
        href={letterHash(letter.id)}
        onClick={onOpen}
        className="archive-card group block rounded-[3px] outline-none"
      >
        <div
          ref={paperRef}
          className="archive-paper relative isolate aspect-[1/0.62] overflow-hidden rounded-[1.5px] bg-[var(--paper)]"
        >
          {img && (
            <img
              src={img.url}
              alt=""
              aria-hidden
              decoding="async"
              draggable={false}
              onLoad={() => cards.shown()}
              className={cn('absolute inset-0 size-full select-none', img.fresh && 'card-in')}
            />
          )}
        </div>
        <div className="mt-3.5 grid gap-[3px] pr-2">
          <h3 className="text-[14px] leading-[1.35] font-medium tracking-[-0.006em] text-foreground text-pretty">
            {letter.title ?? opening(letter.text, 48)}
          </h3>
          <p className="truncate text-[13px] leading-[1.4] text-muted-foreground">{fromTo(letter)}</p>
          <p className="truncate text-[12.5px] leading-[1.4] text-faint tabular">
            {special && <span className="text-[var(--ink-soft)]">{circumstanceLabel(letter)}<span aria-hidden>  </span><span className="sr-only">. </span></span>}
            {whereWhen(letter)}
          </p>
          <span className="sr-only">Begins: {opening(letter.text, 160)}</span>
        </div>
      </a>
    </li>
  );
});
