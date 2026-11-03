import { memo, type ReactNode } from 'react';
import { isShaped, sheetPaper, sheetShadow, SHADOW_BLEED, type PaperSpec } from '@/lib/papers';
import { PaperCanvas } from '@/components/PaperCanvas';
import { Writing, type Play } from '@/components/Writing';
import { cn } from '@/lib/utils';

interface Props {
  paper: PaperSpec;
  pxPerMm: number;
  svg: string | null;
  ink: string;
  /** a new look: paper and writing cross-fade from what was shown */
  fade?: boolean;
  /** a sheet added while the page is open (the letter grew a page): it rises in */
  enter?: boolean;
  index: number;
  count: number;
  /** write the sheet out in front of the reader */
  play?: Play | null;
  finishToken?: number;
  children?: ReactNode;
}

/** One sheet of paper with its writing. */
export const SheetView = memo(function SheetView({ paper, pxPerMm, svg, ink, fade, enter, index, count, play, finishToken, children }: Props) {
  return (
    <div
      // clipped: a fading copy of the previous paper (another size) never pokes out of the new sheet; a shaped
      // sheet (deckle, tear, flaps) paints its own shadow just outside itself, so the clip leaves room for it
      className={cn('relative isolate shrink-0 rounded-[1.5px]', !isShaped(paper) && 'overflow-hidden', enter && 'sheet-enter')}
      style={{ width: paper.w * pxPerMm, height: paper.h * pxPerMm, boxShadow: sheetShadow(paper), clipPath: isShaped(paper) ? `inset(-${SHADOW_BLEED}px)` : undefined }}
      aria-label={count > 1 ? `Page ${index + 1} of ${count}` : undefined}
      role={count > 1 ? 'group' : undefined}
    >
      <PaperCanvas paper={sheetPaper(paper, index)} sheet={index} pxPerMm={pxPerMm} fade={fade} className="absolute inset-0 rounded-[1.5px]" />
      {svg && <Writing svg={svg} ink={ink} fade={fade} play={play} finishToken={finishToken} />}
      <SheetMarks paper={paper} index={index} count={count} pxPerMm={pxPerMm} />
      {children}
    </div>
  );
});

/**
 * How the stationery goes on when the letter is longer than one sheet: a postcard's or note strip's number at
 * the top of each card after the first, "over" at the foot of a notecard's front (its back is plain), the
 * second aerogramme. Quiet, in the app's type; the sheet's own label says which page it is to screen readers.
 */
export function SheetMarks({ paper, index, count, pxPerMm }: { paper: PaperSpec; index: number; count: number; pxPerMm: number }) {
  const right = Math.max(4, paper.w - paper.text.right) * pxPerMm;
  const mark = 'pointer-events-none absolute text-[10.5px] leading-none tracking-[0.02em] text-[color-mix(in_oklab,var(--foreground)_45%,transparent)] select-none';
  if (paper.overflow === 'card' && index > 0) {
    return <span aria-hidden className={mark} style={{ top: 4 * pxPerMm, right }}>{index + 1}</span>;
  }
  if (paper.overflow === 'back' && index % 2 === 0 && index < count - 1) {
    return <span aria-hidden className={cn(mark, 'italic')} style={{ bottom: 3.5 * pxPerMm, right }}>over</span>;
  }
  if (paper.overflow === 'cramp' && index > 0) {
    return <span aria-hidden className={mark} style={{ top: 4 * pxPerMm, right }}>A second aerogramme</span>;
  }
  return null;
}
