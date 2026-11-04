// The Reading Room's desk (the tool, wide screens), kept as a ledger (Proposal 1 of the layout study, Rafael's pick,
// 3 Nov): the column beside the sheet holds ruled rows on the room and nothing with an edge. "Bring another letter"
// with its key first, then the letter's record (LedgerRecord), and the writing materials as a drawer pinned to the
// column's foot. Opened, the drawer rises over the record, so the column never needs a scroll bar of its own. The
// controls inside are the tool's own (Panel.tsx), so everything they do is unchanged.
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, ChevronUp } from 'lucide-react';
import { AboutHand, LetterStatus, LookControls, MoreControls, ShareMenu, type PanelProps } from '@/components/Panel';
import { Signature } from '@/components/Signature';
import { inkColor, inkName } from '@/lib/inks';
import { getPaper } from '@/lib/papers';
import { penName } from '@/lib/pens';
import { cn } from '@/lib/utils';
import { BringAnother } from './BringAnother';
import { LedgerRecord } from './LedgerRecord';
import { callNo } from './catalogue';
import { onWriteStart } from '@/lib/write-start';
import { materials, useMaterialsCrack } from './materials';
import { useRecord } from './useCatalogue';

const DRAWER_KEY = 'seedhand:rr-slip';
function readDrawer() {
  try { return localStorage.getItem(DRAWER_KEY) === '1'; } catch { return false; }
}
function writeDrawer(open: boolean) {
  try { localStorage.setItem(DRAWER_KEY, open ? '1' : '0'); } catch { /* private mode: fine */ }
}

/** "laid paper · dip pen · blue-black ink", as an archive describes a letter's materials. */
export function physicalOf(state: PanelProps['state']) {
  const paper = getPaper(state.paper).name.toLowerCase();
  // the writer's own pen and ink (the hand's defaults) say so; a chosen pen or ink is named
  if (state.pen === 'auto' && state.ink === 'auto') return `${paper} · their own pen and ink`;
  const pen = state.pen === 'auto' ? 'their own pen' : penName(state.pen).toLowerCase();
  const ink = state.ink === 'auto' ? 'its own ink' : `${inkName(state.ink).toLowerCase()} ink`;
  return [paper, pen, ink].join(' · ');
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
        <Signature key={state.seed + state.style} p={props.p} name={props.name} ink={inkColor(state.ink)} emPx={24} className="hand-in h-[2.375rem] overflow-visible" />
      </button>
    </AboutHand>
  );
  const share = <ShareMenu {...props} size="lg" />;
  // the desk's main action, a button at the foot of the record's head (under its number and two-line title)
  const bring = <BringAnother onClick={props.onNewHand} label={found ? 'Bring another letter' : 'Change writer'} />;
  const status = props.letter && (!props.letter.found || props.letter.drafts > 0);
  // the click that starts writing on the letter cracks the writing materials open, once a visit (materials.ts): a mouse
  // or a pen only, never the keyboard, so Tab never opens a drawer over what it moves to next
  const crack = useMaterialsCrack();
  useEffect(() => onWriteStart((w) => { if (w.pointer === 'mouse' || w.pointer === 'pen') materials.crack(); }), []);
  const physical = physicalOf(state);
  return (
    // as wide as the tool's panel (density.css --panel-w), so the desk grows with the browser's text size as it does
    <div className="rr-desk panel-scroll h-full">
      <div className="rr-ledger">
        {status && <div className="rr-desk-actions"><LetterStatus {...props} className="rr-status" /></div>}
        {found && record ? (
          <LedgerRecord record={record} hand={signature} handName={props.name} actions={share} headAction={bring} titleAs="h1" physical={physical} />
        ) : found ? (
          // the record on its way: its head's room kept, so Bring another is already where it will stay
          <section className="rr-ledger-record rr-ledger-waiting">
            <div aria-hidden className="rr-ledger-head" />
            <div aria-hidden className="rr-card-title" />
            {bring}
          </section>
        ) : (
          <section aria-label="Your letter" className="rr-ledger-record">
            <div className="rr-ledger-head">
              <p className="rr-card-no"><span className="rr-sc">{replyTo ? 'A reply' : 'Your letter'}</span></p>
              <div className="rr-card-actions">{share}</div>
            </div>
            <h1 className="rr-card-title">{replyTo ? <>To {midSentence(replyTo.from)}</> : 'A letter of your own'}</h1>
            {bring}
            <dl className="rr-facts">
              {replyTo?.no != null && (
                <div className="rr-fact">
                  <dt className="rr-sc">In reply to</dt>
                  <dd><span className="rr-red">No. {callNo(replyTo.no)}</span>, {replyTo.title}</dd>
                </div>
              )}
              <div className="rr-fact">
                <dt className="rr-sc">Hand</dt>
                <dd>{signature}</dd>
              </div>
            </dl>
            <p className="rr-physical">{physical}</p>
            <p className="rr-card-foot">Not in the collection: yours alone until you share it.</p>
          </section>
        )}
      </div>
      <WritingDrawer {...props} crack={crack} />
    </div>
  );
}

/** A writer's name as it reads after "To": "A Frenchman aged 53" becomes "a Frenchman aged 53" (the article only),
 * and a writer with no name is "the unsigned writer". */
function midSentence(name: string) {
  if (name === 'Unsigned') return 'the unsigned writer';
  if (name === 'Unknown writer') return 'the unknown writer';
  return name.replace(/^(A|An|The)(?=\s)/, (w) => w.toLowerCase());
}

/** The writing materials: a drawer pinned to the foot of the column (closed or open remembered on this device). What
 * they are is said once, in the record's physical-description line, so the drawer's handle is just its name. As you
 * start a letter of your own it cracks open partway (`crack`): paper, pen and ink, the rest a row away, and the column
 * stays beside the sheet while you write (materials.ts). Focus stays on the paper. */
function WritingDrawer(props: PanelProps & { crack: number }) {
  const [mode, setMode] = useState<'closed' | 'peek' | 'open'>(() => (readDrawer() ? 'open' : 'closed'));
  const id = useId();
  const self = useRef<HTMLElement>(null);
  const shown = mode !== 'closed';
  const put = (m: 'closed' | 'open') => {
    setMode(m);
    writeDrawer(m === 'open');
    if (m === 'closed') materials.close();
  };
  useEffect(() => {
    if (!props.crack) return;
    setMode((m) => (m === 'closed' ? 'peek' : m));
    materials.open();
  }, [props.crack]);
  // partway open, the drawer lies over the record's foot: if focus moves to something under it (Tab through the
  // record), the drawer goes away, so what has focus is always in sight
  useEffect(() => {
    const drawer = self.current;
    const desk = drawer?.parentElement;
    if (mode !== 'peek' || !drawer || !desk) return;
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || drawer.contains(t)) return;
      if (t.getBoundingClientRect().bottom > drawer.getBoundingClientRect().top) put('closed');
    };
    desk.addEventListener('focusin', onFocus);
    return () => desk.removeEventListener('focusin', onFocus);
  }, [mode]);
  // Escape puts the drawer away (focus comes back to its handle)
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      // inside the drawer, or on its handle
      if (!t?.closest(`#${CSS.escape(id)}-b, #${CSS.escape(id)}-h`)) return;
      put('closed');
      document.getElementById(`${id}-h`)?.querySelector('button')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, id]);
  return (
    <section ref={self} className={cn('rr-drawer', mode === 'open' && 'is-open', mode === 'peek' && 'is-peek')} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="m-0">
        <button type="button" aria-expanded={shown} aria-controls={`${id}-b`} onClick={() => put(shown ? 'closed' : 'open')} className="rr-drawer-head ruled-row">
          <span className="rr-sc">Writing materials</span>
          <ChevronUp aria-hidden className="rr-drawer-chev" />
        </button>
      </h2>
      <div id={`${id}-b`} className="rr-drawer-body panel-scroll" inert={!shown} onPointerDown={keepWriting} onMouseDown={keepWriting}>
        <div className="rr-slip-inner">
          <LookControls {...props} />
          <MoreControls {...props} />
        </div>
        {mode === 'peek' && (
          <button type="button" className="rr-drawer-all ruled-row" aria-controls={`${id}-b`} onClick={() => put('open')}>
            <span>Handwriting and more</span><ChevronUp aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}

// While you write, a material picked with the pointer keeps the caret in the letter, as an editor's toolbar does: the
// press doesn't take focus, and the click still applies the choice, so typing carries on. Only for plain choices
// (tiles, swatches, segments, switches, locks); sliders, fields, and the rows that open more of the drawer take
// focus as usual. Keyboard users Tab in and out as always.
const TAKES_FOCUS = "input, textarea, select, [contenteditable], [role='slider'], [data-slot='slider'], [aria-controls], .rr-drawer-all";
function keepWriting(e: React.PointerEvent | React.MouseEvent) {
  const active = document.activeElement;
  // writing: the letter's own field has focus (the only textarea outside the drawer)
  if (!(active instanceof HTMLTextAreaElement) || e.currentTarget.contains(active)) return;
  const t = e.target as Element;
  const control = t.closest("button, [role='radio'], [role='switch'], [role='checkbox'], [data-slot='segmented-item']");
  if (!control || !e.currentTarget.contains(control) || t.closest(TAKES_FOCUS)) return;
  e.preventDefault();
}

function showAboveSheet(e: React.FocusEvent) {
  const t = e.target as HTMLElement;
  const sheet = document.querySelector('.control-sheet');
  if (!sheet || !t.matches(':focus-visible')) return;
  if (t.getBoundingClientRect().bottom > sheet.getBoundingClientRect().top) t.scrollIntoView({ block: 'center' });
}

/** Phones: the same record as ruled rows under the sheet (found letters only). Its Hand row is the clear way into
 * what's known about the writer: "About this hand ›" under their name. */
export function CatalogueSlip({ id, name, panel }: { id: string | null | undefined; name: string; panel?: PanelProps }) {
  const record = useRecord(id);
  if (!record) return null;
  const about = panel && (
    <AboutHand {...panel}>
      <button type="button" className="rr-hand-link">About this hand<ChevronRight aria-hidden /></button>
    </AboutHand>
  );
  return (
    // a piece of the record reached with the keyboard that the resting sheet covers scrolls up into sight
    <div style={{ display: 'contents' }} onFocusCapture={showAboveSheet}>
      <LedgerRecord record={record} hand={name} handAction={about} handName={name} titleAs="h1" className="rr-under-sheet" />
    </div>
  );
}
