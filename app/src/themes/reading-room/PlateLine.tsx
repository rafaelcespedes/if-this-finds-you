// The Reading Room's plate line under the sheet (the tool, wide screens; Proposal 1 of the layout study): as a museum
// labels an object at its foot, who wrote to whom on the left, how you're writing on the right (App.tsx's footer row).
// It replaces the label row above the sheet; the writer's name and what's known of the hand live in the record's Hand row.
import { useRecord } from './useCatalogue';

/** "C. Fabregue to his brother", or the letter's own name when it isn't a found letter. */
export function PlateTitle({ id, fallback }: { id: string | null | undefined; fallback: string }) {
  const r = useRecord(id);
  // a plate is one line: the addressee up to their first comma ("his brother", not his rank and ship)
  const text = r ? (r.to ? `${r.from} to ${r.to.split(',')[0]}` : r.from) : fallback;
  return <span className="rr-plate-title mr-auto min-w-0 truncate pr-3" title={text}>{text}</span>;
}
