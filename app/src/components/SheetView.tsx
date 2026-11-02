import { memo, type ReactNode } from 'react';
import type { PaperSpec } from '@/lib/papers';
import { PaperCanvas } from '@/components/PaperCanvas';
import { Writing } from '@/components/Writing';

interface Props {
  paper: PaperSpec;
  pxPerMm: number;
  svg: string | null;
  ink: string;
  /** changes when the hand changes, so the writing settles in again */
  handKey: string;
  index: number;
  count: number;
  children?: ReactNode;
}

/** One sheet of paper with its writing. */
export const SheetView = memo(function SheetView({ paper, pxPerMm, svg, ink, handKey, index, count, children }: Props) {
  return (
    <div
      className="relative isolate shrink-0 rounded-[1.5px]"
      style={{ width: paper.w * pxPerMm, height: paper.h * pxPerMm, boxShadow: 'var(--sheet-shadow)' }}
      aria-label={count > 1 ? `Page ${index + 1} of ${count}` : undefined}
      role={count > 1 ? 'group' : undefined}
    >
      <PaperCanvas paper={paper} pxPerMm={pxPerMm} className="absolute inset-0 rounded-[1.5px]" />
      {svg && <Writing key={handKey} svg={svg} ink={ink} className="hand-in" />}
      {children}
    </div>
  );
});
