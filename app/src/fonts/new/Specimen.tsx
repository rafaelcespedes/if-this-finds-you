// A line set in a hand's own generated font (what you download): the hero's, a row's, a card's. The font is built in
// a worker for the characters the line needs and grows when your words need more; until it can set the new words the
// line keeps the last ones it could (never a fallback face). Before any font arrives the line's space is already
// there, ruled faintly where the writing will sit, so nothing moves when it lands; when it lands the first time it is
// written in, left to right (a mask, at a writing pace), or simply appears with reduced motion.
import { useEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { FontEntry } from '../protocol';
import { fonts, useRowFont } from '../store';

const covers = (have: string, want: string) => { for (const c of want) if (!have.includes(c)) return false; return true; };

/** The line box, in em: tall enough for every glyph's ink (the generated fonts' own metrics). */
export const LINE = 1.42;

/** A hand's font for some words, and the words it can set now. `extra` asks for more characters (the record's
 *  "Every character"). Counts the first specimen on screen for the page's timings (window.__fonts.stats). */
export function useSpecimen(entry: FontEntry | undefined, text: string, el: Element | null, near: boolean, extra = '') {
  const { font, failed } = useRowFont(entry, text + extra, el, near);
  const last = useRef(text);
  const can = !!font && covers(font.chars, text);
  if (can) last.current = text;
  const shown = can ? text : last.current;
  const counted = useRef(false);
  useEffect(() => {
    if (font && !counted.current) { counted.current = true; fonts.shown(); }
  }, [!!font]);
  return { font, failed, shown, allLoaded: !!font && !!extra && covers(font.chars, extra) };
}

interface Props {
  family: string | null;
  fresh: boolean;
  failed: boolean;
  text: string;
  /** px per em */
  em: number;
  /** how many lines it may take; the last one fades out where the words run on */
  lines: number;
  /** the hero's slower write-in, the cards' quicker one */
  pace?: 'hero' | 'row';
  className?: string;
  label?: string;
}

export function SpecimenLine({ family, fresh, failed, text, em, lines, pace = 'row', className, label }: Props) {
  const style = { fontSize: em, height: Math.ceil(LINE * lines * em), '--lines': lines } as CSSProperties;
  return (
    <div className={cn('fx-specimen', lines > 1 ? 'is-multi' : 'is-single', !family && 'is-waiting', className)} style={style}>
      {family ? (
        <p className={cn('fx-line', fresh && (pace === 'hero' ? 'fx-write-hero' : 'fx-write'))} style={{ fontFamily: `"${family}"` }} aria-label={label}>
          {text}
        </p>
      ) : failed ? (
        <span className="fx-failed">This hand couldn’t be set as a font here.</span>
      ) : (
        <span aria-hidden className="fx-rules" />
      )}
    </div>
  );
}
