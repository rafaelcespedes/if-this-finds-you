// The tool in the Postmarked look (rendered only when LOOK === 'postmarked'; hooks in App.tsx, Panel.tsx and
// ControlSheet.tsx are one line each):
//   SheetPost   the postmark (and, where true, a red cancellation) on a found letter's sheet
//   FindRow     the panel's "Find another": a round stamp, with "4 of 127 in the bag" beside it
//   PhoneStamp  the same stamp in the phone's control sheet
//   ToolArrival a shared link's envelope, before the letter writes itself
import { SAMPLES, sampleById, type SampleText } from '@/lib/samples';
import type { PanelProps } from '@/components/Panel';
import { Arrival } from './Arrival';
import { Cancellation, Postmark } from './Postmark';
import { StampButton } from './Stamp';
import { addressee, cancellationOf, FOUND_YEAR, postTown, sender, tiltFor } from './model';

type Sample = SampleText & { place?: string | null; recipient?: string; origin?: string };

const asPost = (s: Sample) => ({ town: postTown(s.place), year: s.year, cancel: cancellationOf(s.origin) });

/** The postmark on the sheet's top-right corner, over the paper like a real one (pointer-transparent). */
export function SheetPost({ sampleId, width }: { sampleId?: string | null; width: number }) {
  const s = sampleById(sampleId) as Sample | undefined;
  if (!s) return null;
  const { town, year, cancel } = asPost(s);
  const size = Math.round(Math.min(108, Math.max(60, width * 0.15)));
  return (
    <div aria-hidden className="pm-sheet-post pointer-events-none absolute top-0 right-0 z-10" style={{ width: size * 3.4, height: size * 1.3 }}>
      <Postmark key={s.id} town={town} year={year} size={size} tilt={tiltFor(s.id)} className="pm-sheet-mark" style={{ top: size * 0.16, right: size * 0.14 }} />
      {cancel && <Cancellation key={s.id + 'c'} label={cancel} tilt={-8 + tiltFor(s.id, 6)} className="pm-sheet-cancel" style={{ top: size * 0.3, right: size * 1.08 }} />}
    </div>
  );
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
