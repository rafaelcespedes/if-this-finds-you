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
 * How the stationery goes on past one sheet, where the hand doesn't say it: the hand numbers the cards and writes
 * "over" on a notecard (lib/live.ts, write-core.ts); a second aerogramme gets a quiet line above it, off the paper,
 * like the sheet's label.
 */
export function SheetMarks({ paper, index }: { paper: PaperSpec; index: number; count: number; pxPerMm: number }) {
  if (paper.overflow !== 'cramp' || index < 1) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-full left-0 mb-1 text-[0.75rem] leading-4 whitespace-nowrap text-muted-foreground select-none">
      A second aerogramme
    </span>
  );
}
