// The Reading Room's desk (the tool, wide screens): the column beside the sheet. A found letter arrives with its
// catalogue card; your own letter gets a plain card of its own. Under it, the main action in words ("Bring another
// letter"), and the writing materials folded away in a request slip until you ask for them. The controls inside are the
// tool's own (Panel.tsx), so everything they do is unchanged.
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AboutHand, LetterStatus, LookControls, MoreControls, ShareMenu, type PanelProps } from '@/components/Panel';
import { Signature } from '@/components/Signature';
import { inkColor } from '@/lib/inks';
import { getPaper } from '@/lib/papers';
import { cn } from '@/lib/utils';
import { BringAnother } from './BringAnother';
import { CatalogueCard } from './CatalogueCard';
import { callNo, useRecord } from './catalogue';

const SLIP_KEY = 'seedhand:rr-slip';
function readSlip() {
  try { return localStorage.getItem(SLIP_KEY) === '1'; } catch { return false; }
}
function writeSlip(open: boolean) {
  try { localStorage.setItem(SLIP_KEY, open ? '1' : '0'); } catch { /* private mode: fine */ }
}

export function ReadingDesk(props: PanelProps) {
  const { state } = props;
  const sampleId = state.sample && state.text ? state.sample : null;
  const record = useRecord(sampleId);
  const replyTo = useRecord(!sampleId ? state.replyTo?.id : null);
  const found = !!sampleId;
  const signature = (
    <AboutHand {...props}>
      <button type="button" aria-label={`${props.name}: about this hand`} className="rr-sig group">
        <Signature key={state.seed + state.style} p={props.p} name={props.name} ink={inkColor(state.ink)} emPx={24} className="hand-in h-[38px] overflow-visible" />
        <ChevronDown aria-hidden className="rr-sig-chev" />
      </button>
    </AboutHand>
  );
  const share = <ShareMenu {...props} size="lg" />;
  return (
    <div className="rr-desk panel-scroll h-full w-[340px] overflow-y-auto overscroll-contain">
      <div className="rr-desk-inner">
        {/* the main action first, then the materials folded in their slip, then the letter's card */}
        <div className="rr-desk-actions">
          <BringAnother onClick={props.onNewHand} label={found ? 'Bring another letter' : 'Bring another hand'} />
          {props.letter && (!props.letter.found || props.letter.drafts > 0) && <LetterStatus {...props} className="rr-status" />}
        </div>
        <RequestSlip {...props} />
        {found && record ? (
          <CatalogueCard record={record} hand={signature} handName={props.name} actions={share} />
        ) : found ? (
          <div className="rr-card rr-card--waiting" aria-hidden />
        ) : (
          <section aria-label="Your letter" className="rr-card">
            <div className="rr-card-head">
              <p className="rr-card-no"><span className="rr-sc">{replyTo ? 'A reply' : 'Your letter'}</span></p>
              <div className="rr-card-actions">{share}</div>
            </div>
            <h2 className="rr-card-title">{replyTo ? <>To {replyTo.from}</> : 'A letter of your own'}</h2>
            <dl className="rr-facts">
              {replyTo && (
                <div className="rr-fact">
                  <dt className="rr-sc">In reply to</dt>
                  <dd><span className="rr-red rr-figures">No. {callNo(replyTo.no ?? 0)}</span>, {replyTo.title}</dd>
                </div>
              )}
              <div className="rr-fact">
                <dt className="rr-sc">Hand</dt>
                <dd>{signature}</dd>
              </div>
              <div className="rr-fact">
                <dt className="rr-sc">Paper</dt>
                <dd>{getPaper(state.paper).name}</dd>
              </div>
            </dl>
            <p className="rr-card-foot">Not in the collection: yours alone until you share it.</p>
          </section>
        )}

      </div>
    </div>
  );
}

/** The writing materials, folded into a request slip until you want them (remembered on this device). */
function RequestSlip(props: PanelProps) {
  const [open, setOpen] = useState(readSlip);
  const id = useId();
  const toggle = () => setOpen((o) => { writeSlip(!o); return !o; });
  return (
    <section className={cn('rr-slip', open && 'is-open')} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="m-0">
        <button type="button" aria-expanded={open} aria-controls={`${id}-b`} onClick={toggle} className="rr-slip-head">
          <span className="rr-slip-k rr-sc">Request slip</span><span className="sr-only">: </span>
          <span className="rr-slip-t">Writing materials</span><span className="sr-only">. </span>
          <span className="rr-slip-v">{getPaper(props.state.paper).name}, the pen, the ink, the hand</span>
          <ChevronDown aria-hidden className="rr-slip-chev" />
        </button>
      </h2>
      <div id={`${id}-b`} className="rr-slip-body" inert={!open}>
        <div className="rr-slip-inner">
          <LookControls {...props} />
          <MoreControls {...props} />
        </div>
      </div>
    </section>
  );
}

/** Phones: the same card as a slip under the sheet (found letters only). */
export function CatalogueSlip({ id, name }: { id: string | null | undefined; name: string }) {
  const record = useRecord(id);
  if (!record) return null;
  return <CatalogueCard slip record={record} hand={name} handName={name} className="rr-under-sheet" />;
}
