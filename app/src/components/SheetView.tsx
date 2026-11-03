import { memo, type ReactNode } from 'react';
import { isShaped, sheetShadow, SHADOW_BLEED, type PaperSpec } from '@/lib/papers';
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
      <PaperCanvas paper={paper} pxPerMm={pxPerMm} fade={fade} className="absolute inset-0 rounded-[1.5px]" />
      {svg && <Writing svg={svg} ink={ink} fade={fade} play={play} finishToken={finishToken} />}
      {children}
    </div>
  );
});
