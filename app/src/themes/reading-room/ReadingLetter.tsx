// The Reading Room's letter page (archive/LetterPage.tsx renders this when ?look=reading-room): the sheet on the left
// like an object on a desk, with its number stamped on it and a postmark; a narrow catalogue card on the right that
// stays put while you read, carrying the title, the facts, the hand menu and Share, with numbered notes. On phones the
// card is a slip under the sheet. The dock becomes a request slip along the bottom edge (SlipDock).
import { useId, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, Ellipsis, FileText, Link2, PenLine, RotateCcw, Shuffle } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { cn } from '@/lib/utils';
import type { DockActions } from '@/archive/LetterParts';
import { circumstanceLabel, lostInTransit, shortAuthor, shortRecipient } from '@/archive/data';
import type { ArchiveLetter } from '@/archive/model';
import { CatalogueCard } from './CatalogueCard';
import { callNo, useRecord, type CardRecord } from './catalogue';
import { SheetMarks } from './SheetMarks';

const languages = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch { return null; }
})();

/** The card from the library's own letter (so the title is there from the first frame); the number joins it. */
function recordOf(l: ArchiveLetter, no?: number): CardRecord {
  const f = l.found;
  const rights = f?.rights;
  let language = l.lang;
  try { language = languages?.of(l.lang.split('-')[0]) ?? l.lang; } catch { /* the code */ }
  return {
    id: l.id,
    no,
    title: l.title ?? 'A letter',
    from: shortAuthor(l),
    heritage: f?.heritage,
    to: shortRecipient(l) || undefined,
    where: l.place,
    year: l.year,
    dateNote: f?.dateNote,
    language,
    status: circumstanceLabel(l),
    story: f?.story,
    lost: lostInTransit(l),
    source: f?.source ? { name: f.source.name, url: f.source.url } : undefined,
    rights: rights?.us && rights?.eu ? 'Public domain in the US and the EU' : rights?.us ? 'Public domain in the US' : rights?.eu ? 'Public domain in the EU' : f?.source?.licence,
    rightsBasis: rights?.basis,
    translator: f?.translator,
  };
}

interface Props {
  letter: ArchiveLetter;
  name: string;
  /** the sheet, as the letter page builds it (write-on, tap to finish, swipe to turn) */
  sheet: ReactNode;
  /** the column the sheet fills (the page measures it) */
  colRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  pxPerMm: number;
  paperW: number;
  keep: boolean;
  onKeep: (v: boolean) => void;
  onNewHand: () => void;
  onReplay: () => void;
  canReplay: boolean;
  onShare: () => void;
  textOpen: boolean;
  onText: (open: boolean) => void;
}

export function ReadingLetter(p: Props) {
  const { letter } = p;
  const no = useRecord(letter.id)?.no;
  const record = recordOf(letter, no);
  const wide = useMediaQuery('(min-width: 1024px)');
  const textId = useId();
  const paras = letter.text.split(/\n{2,}/);
  const card = (
    <CatalogueCard
      record={record}
      titleAs="h1"
      titleRef={p.titleRef}
      handName={p.name}
      hand={<HandMenu name={p.name} keep={p.keep} onKeep={p.onKeep} onNewHand={p.onNewHand} onReplay={p.onReplay} canReplay={p.canReplay} />}
      actions={
        <button type="button" onClick={p.onShare} className="rr-icon" aria-label="Share a link to this letter" title="Share a link to this letter">
          <Link2 aria-hidden />
        </button>
      }
      slip={!wide}
    />
  );
  return (
    <main className="rr-letter mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-x-14 px-4 pt-[calc(4.75rem+env(safe-area-inset-top,0px))] pb-40 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10 lg:pt-24">
      <div className="min-w-0">
        {/* phones: the title above the sheet, for bearings (the card under the sheet holds the heading itself) */}
        {!wide && <p aria-hidden className="rr-letter-kicker">{record.title}</p>}
        <div ref={p.colRef} className="min-w-0">
          <div className="relative mx-auto" style={{ width: p.paperW * p.pxPerMm || undefined }}>
            {p.sheet}
            <SheetMarks key={letter.id} no={no} place={letter.place} year={letter.year} pxPerMm={p.pxPerMm} />
          </div>
        </div>
        {!wide && <div className="mt-8">{card}</div>}
        <section className="rr-transcript-wrap" aria-labelledby={`${textId}-h`}>
          <h2 id={`${textId}-h`} className="sr-only">The letter as text</h2>
          <button type="button" aria-expanded={p.textOpen} aria-controls={textId} onClick={() => p.onText(!p.textOpen)} className="rr-link">
            {p.textOpen ? 'Put the transcript away' : 'Read the transcript'}
          </button>
          <div id={textId} lang={letter.lang} className={cn(p.textOpen ? 'ed-transcript rr-transcript' : 'sr-only')}>
            {paras.map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </section>
      </div>
      {wide && <aside className="rr-letter-card">{card}</aside>}
    </main>
  );
}

const itemCls = 'flex min-h-10 cursor-default items-center gap-3 rounded-[3px] px-3 py-2 text-[14px] text-foreground outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-accent pointer-coarse:min-h-11';

function Menu({ children, side = 'top', align = 'end' }: { children: ReactNode; side?: 'top' | 'bottom'; align?: 'start' | 'center' | 'end' }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content side={side} align={align} sideOffset={8} collisionPadding={12} className="lib-menu z-50 w-[248px] p-1.5 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}
function Item({ icon, children, onSelect, disabled }: { icon: ReactNode; children: ReactNode; onSelect: () => void; disabled?: boolean }) {
  return (
    <DropdownMenu.Item className={itemCls} onSelect={onSelect} disabled={disabled}>
      <span aria-hidden className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">{icon}</span>
      {children}
    </DropdownMenu.Item>
  );
}

/** The card's hand row: the writer's name, and what you can do with the hand. */
function HandMenu({ name, keep, onKeep, onNewHand, onReplay, canReplay }: {
  name: string; keep: boolean; onKeep: (v: boolean) => void; onNewHand: () => void; onReplay: () => void; canReplay: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="rr-hand group" aria-label={`In ${name}’s hand: change the hand`}>
          {name}
          <ChevronDown aria-hidden className="rr-hand-chev" />
        </button>
      </DropdownMenu.Trigger>
      <Menu side="bottom" align="start">
        <Item icon={<Shuffle />} onSelect={onNewHand}>Another hand</Item>
        <Item icon={<RotateCcw />} onSelect={onReplay} disabled={!canReplay}>Write it out again</Item>
        <DropdownMenu.Separator className="mx-2 my-1 h-px bg-border" />
        <DropdownMenu.CheckboxItem className={cn(itemCls, 'items-start')} checked={keep} onCheckedChange={(v) => onKeep(v === true)} onSelect={(e) => e.preventDefault()}>
          <span className="mt-0.5 grid size-4 shrink-0 place-items-center"><DropdownMenu.ItemIndicator><Check aria-hidden className="size-4 text-[var(--lib-accent)]" /></DropdownMenu.ItemIndicator></span>
          <span>
            Keep this hand
            <span className="block text-[12.5px] text-muted-foreground">for the next letters you open</span>
          </span>
        </DropdownMenu.CheckboxItem>
      </Menu>
    </DropdownMenu.Root>
  );
}

function useKeyboardLift() {
  const vv = useVisualViewport();
  return Math.max(0, window.innerHeight - (vv.top + vv.height));
}

/**
 * The letter page's dock as a request slip: one hairline-ruled line of words along the bottom edge.
 * "‹ No. 0004 · 4 of 127 › · Bring another · ⋯ · Write a reply", the reply in archival red.
 */
export function SlipDock(a: DockActions & { id?: string }) {
  const narrow = useMediaQuery('(max-width: 520px)');
  const lift = useKeyboardLift();
  const no = useRecord(a.id)?.no;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-3" style={lift ? { transform: `translateY(${-lift}px)` } : undefined}>
      <div role="toolbar" aria-label="The letter" className="rr-dock pointer-events-auto">
        {a.total > 1 && (
          <>
            <button type="button" className="rr-icon" onClick={a.onPrev} aria-label={a.prev ? `Previous letter: ${a.prev.title}` : 'Previous letter'}><ChevronLeft aria-hidden /></button>
            <span className="rr-dock-no">
              {no != null && <><span className="rr-sc">No.</span>&nbsp;<span className="rr-figures">{callNo(no)}</span></>}
              {!narrow && <span className="rr-dock-of"><span aria-hidden> · </span>{a.at + 1} of {a.total}</span>}
            </span>
            <button type="button" className="rr-icon" onClick={a.onNext} aria-label={a.next ? `Next letter: ${a.next.title}` : 'Next letter'}><ChevronRight aria-hidden /></button>
            <span aria-hidden className="rr-dock-rule" />
          </>
        )}
        <button type="button" className="rr-dock-word" onClick={a.onRandom}>{narrow ? 'Another' : 'Bring another'}</button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="rr-icon" aria-label="More"><Ellipsis aria-hidden /></button>
          </DropdownMenu.Trigger>
          <Menu>
            <Item icon={<FileText />} onSelect={a.onText}>Read the transcript</Item>
            <Item icon={<Download />} onSelect={a.onImage} disabled={!a.imageReady}>Save as an image</Item>
            <Item icon={<Shuffle />} onSelect={a.onNewHand}>Another hand</Item>
            <Item icon={<Link2 />} onSelect={a.onShare}>Share a link</Item>
          </Menu>
        </DropdownMenu.Root>
        <span aria-hidden className="rr-dock-rule" />
        <a href={a.reply} className="rr-dock-reply"><PenLine aria-hidden /> {narrow ? 'Reply' : 'Write a reply'}</a>
      </div>
    </div>
  );
}
