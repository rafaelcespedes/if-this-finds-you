// The tool in the Postmarked look (rendered only when LOOK === 'postmarked'; hooks in App.tsx, Panel.tsx and
// ControlSheet.tsx are one line each):
//   PostSheetMarks  a found letter's marks printed into its first sheet's paper (stationery's PaperMarks: a datestamp
//                   with its town and year, and where the provenance says so a red cancellation); never animated
//   FindRow     the panel's "Find another": a round stamp, with "4 of 127 in the bag" beside it
//   PhoneStamp  the same stamp in the phone's control sheet
//   ToolArrival a shared link's envelope, before the letter writes itself
import { useContext, type ReactNode } from 'react';
import { PaperMarks } from '@/components/PaperCanvas';
import { LOOK } from '@/lib/look';
import { SAMPLES, sampleById, type SampleText } from '@/lib/samples';
import type { PanelProps } from '@/components/Panel';
import { Arrival } from './Arrival';
import { StampButton } from './Stamp';
import { addressee, cancellationOf, FOUND_YEAR, postTown, sender } from './model';

type Sample = SampleText & { place?: string | null; recipient?: string; origin?: string };

const asPost = (s: Sample) => ({ town: postTown(s.place), year: s.year, cancel: cancellationOf(s.origin) });

/**
 * Wraps the letter's sheets: in this look a found letter's first sheet has its marks printed into the paper, seeded by
 * the letter and the hand (stable on reload). Anything else (another look, your own letter, a reply) passes through.
 */
export function PostSheetMarks({ sampleId, hand, children }: { sampleId?: string | null; hand: string; children: ReactNode }) {
  const s = LOOK === 'postmarked' ? (sampleById(sampleId) as Sample | undefined) : undefined;
  const outer = useContext(PaperMarks);
  // always the same wrapper (a bare fragment instead rebuilt the letter's field when a found letter became a reply)
  if (!s) return <PaperMarks value={outer}>{children}</PaperMarks>;
  const { town, year, cancel } = asPost(s);
  return <PaperMarks value={{ id: s.id, hand, place: town, year, cancel, look: 'postmarked' }}>{children}</PaperMarks>;
}

/** Which found letter this is, out of all of them ("4 of 127 in the bag"); your own letter says so. */
function bagLine(sampleId?: string | null) {
  const at = sampleId ? SAMPLES.findIndex((s) => s.id === sampleId) : -1;
  return at >= 0 ? { lead: `${at + 1} of ${SAMPLES.length}`, rest: 'in the bag' } : { lead: 'Your letter', rest: `${SAMPLES.length} more in the bag` };
}

const markOf = (sampleId?: string | null) => {
  const s = sampleById(sampleId) as Sample | undefined;
  return s ? { town: postTown(s.place), year: s.year } : null;
};

/** Desktop panel: the count on the left, the stamp on the right. */
export function FindRow(props: PanelProps) {
  const line = bagLine(props.state.sample);
  return (
    <div className="pm-find-row mt-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="pm-bag tabular"><b>{line.lead}</b> {line.rest}</div>
        <div className="pm-hint pointer-coarse:hidden">or press R</div>
      </div>
      <StampButton onPress={props.onNewHand} size={68} shortcut="R" mark={markOf(props.state.sample)} />
    </div>
  );
}

/** Phone control sheet: the stamp where the button was (drawn 52, a 52 px target). */
export function PhoneStamp(props: PanelProps) {
  return <StampButton onPress={props.onNewHand} size={52} mark={markOf(props.state.sample)} className="shrink-0" />;
}

/** A shared link: the envelope, addressed to the letter's real recipient (your own letter: to you). */
export function ToolArrival({ sampleId, writer }: { sampleId?: string | null; writer: string }) {
  const s = sampleById(sampleId) as Sample | undefined;
  if (!s) return <Arrival id={writer} to="you, wherever this finds you" from={writer} town="BY HAND" year={FOUND_YEAR} />;
  const { town, year, cancel } = asPost(s);
  return <Arrival id={s.id} to={addressee(s.recipient) || 'whoever this finds'} from={sender(s.author)} town={town} year={year} cancel={cancel} />;
}
