import { memo, type ReactNode } from 'react';
import type { PaperSpec } from '@/lib/papers';
import { PaperCanvas } from '@/components/PaperCanvas';
import { Writing, type Play } from '@/components/Writing';

interface Props {
  paper: PaperSpec;
  pxPerMm: number;
  svg: string | null;
  ink: string;
  /** changes when the hand changes, so the writing settles in again */
  handKey: string;
  /** play the settle-in when the hand changes (off where view transitions cross-fade the sheet) */
  intro?: boolean;
  index: number;
  count: number;
  /** write the sheet out in front of the reader */
  play?: Play | null;
  finishToken?: number;
  children?: ReactNode;
}

/** One sheet of paper with its writing. */
export const SheetView = memo(function SheetView({ paper, pxPerMm, svg, ink, handKey, intro = true, index, count, play, finishToken, children }: Props) {
  return (
    <div
      className="relative isolate shrink-0 rounded-[1.5px]"
      style={{ width: paper.w * pxPerMm, height: paper.h * pxPerMm, boxShadow: 'var(--sheet-shadow)' }}
      aria-label={count > 1 ? `Page ${index + 1} of ${count}` : undefined}
      role={count > 1 ? 'group' : undefined}
    >
      <PaperCanvas paper={paper} pxPerMm={pxPerMm} className="absolute inset-0 rounded-[1.5px]" />
      {/* the settle-in plays on mount: on first load always, and on each new hand where there's no cross-fade */}
      {svg && <Writing key={intro ? handKey : 'w'} svg={svg} ink={ink} className={play ? undefined : 'hand-in'} play={play} finishToken={finishToken} />}
      {children}
    </div>
  );
});
