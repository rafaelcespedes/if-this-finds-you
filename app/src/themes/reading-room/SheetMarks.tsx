// The Reading Room's marks on a letter: its catalogue number and a location badge with its place and year, printed
// into the first sheet's paper by the stationery's marks engine (lib/paper/marks.ts, through PaperCanvas's PaperMarks),
// never laid over it or animated in. Where they land, their ink and whether they sit under or over the writing are
// seeded by the letter and the hand, so a letter looks the same on every visit. Decoration only: the catalogue card
// beside the letter says the same in words. The number and place come from catalogue.ts (marksOf), the one source.
import type { ReactNode } from 'react';
import { PaperMarks } from '@/components/PaperCanvas';
import { LOOK } from '@/lib/look';
import { callNo } from './catalogue';
import { useMarks } from './useCatalogue';

/** Wrap a letter's sheets: its first sheet is stamped (only in the Reading Room, and only for a letter in the collection). */
export function LetterMarks({ id, hand, children }: { id: string | null | undefined; hand: string; children: ReactNode }) {
  const marks = useMarks(LOOK === 'reading-room' ? id : null);
  if (!marks) return <>{children}</>;
  return (
    <PaperMarks value={{ id: marks.id, hand, place: marks.place || null, year: marks.year ?? null, number: marks.no, look: 'reading-room' }}>
      {children}
    </PaperMarks>
  );
}

/** The number on a library card: a small paper tag pinned to the sheet's top edge (the cards are pictures painted
 * elsewhere, too small for a legible stamp). */
export function CardStamp({ id }: { id: string }) {
  const no = useMarks(id)?.no;
  if (no == null) return null;
  return (
    <span aria-hidden className="rr-card-tag">
      No. <span className="rr-card-tag-n">{callNo(no)}</span>
    </span>
  );
}
