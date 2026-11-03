// The letter page's pieces: the floating dock (the same family as the library's and the tool's right panel), the
// hand menu under the sheet (like the tool's writer dropdown), the "more" menu, and the editorial text: title,
// dateline, story, the record, the letter as text, and footnotes for the source, the rights and the hand.
// Colours, sizes and surfaces come from the --lib-* tokens in archive.css, so they can be swapped in one place.
import { useId, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, Ellipsis, FileText, Link2, PenLine, RotateCcw, Shuffle } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { cn } from '@/lib/utils';
import { IconButton } from './Controls';
import { fromTo, lostInTransit, circumstanceLabel } from './data';
import type { ArchiveLetter } from './model';

// ---------- the detail switch: ?detail=1 (side by side) or 2 (letter first), kept for the tab ----------
export type DetailId = '1' | '2';
function readDetail(): DetailId {
  try {
    const asked = new URLSearchParams(location.search).get('detail');
    if (asked === '1' || asked === '2') { sessionStorage.setItem('seedhand:detail', asked); return asked; }
    const kept = sessionStorage.getItem('seedhand:detail');
    if (kept === '1' || kept === '2') return kept;
  } catch { /* storage off: the default */ }
  return '2';
}
export const DETAIL: DetailId = typeof location !== 'undefined' ? readDetail() : '2';

// ---------- menus (the tool's dropdown: WritingMenu.tsx) ----------
const itemCls = 'flex min-h-10 cursor-default items-center gap-3 rounded-[3px] px-3 py-2 text-[14px] text-foreground outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-accent pointer-coarse:min-h-11';

function MenuContent({ children, side = 'top', align = 'end' }: { children: ReactNode; side?: 'top' | 'bottom'; align?: 'start' | 'center' | 'end' }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content side={side} align={align} sideOffset={8} collisionPadding={12} className="lib-menu z-50 w-[248px] origin-(--radix-dropdown-menu-content-transform-origin) p-1.5 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100">
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

/** "In Ilse Pryor's hand ⌄": what you can do with the hand, beside the hand (the tool's writer dropdown). */
export function HandMenu({ name, keep, onKeep, onNewHand, onReplay, canReplay }: {
  name: string; keep: boolean; onKeep: (v: boolean) => void; onNewHand: () => void; onReplay: () => void; canReplay: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="group inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover-device:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring pointer-coarse:py-2.5">
          In {name}’s hand
          <ChevronDown aria-hidden className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>
      <MenuContent side="bottom" align="center">
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
      </MenuContent>
    </DropdownMenu.Root>
  );
}

// ---------- the dock ----------
export interface DockActions {
  reply: string;
  prev: { title: string } | null;
  next: { title: string } | null;
  at: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onNewHand: () => void;
  onShare: () => void;
  onImage: () => void;
  imageReady: boolean;
  onRandom: () => void;
  onText: () => void;
}

function useKeyboardLift() {
  const vv = useVisualViewport();
  return Math.max(0, window.innerHeight - (vv.top + vv.height));
}

/** Everything you can do with the letter, in one small floating bar: turn, a new hand, share, more, and reply. */
export function LetterDock(a: DockActions) {
  const narrow = useMediaQuery('(max-width: 520px)');
  const lift = useKeyboardLift();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-3" style={lift ? { transform: `translateY(${-lift}px)` } : undefined}>
      <div role="toolbar" aria-label="The letter" className="archive-dock pointer-events-auto flex max-w-full items-center gap-0.5 rounded-2xl bg-[var(--lib-surface)] p-1 text-[13.5px]">
        {a.total > 1 && (
          <>
            <IconButton label={a.prev ? `Previous letter: ${a.prev.title}` : 'Previous letter'} onClick={a.onPrev}><ChevronLeft aria-hidden /></IconButton>
            {!narrow && <span aria-hidden className="min-w-[3.25rem] px-0.5 text-center text-[12.5px] text-[var(--lib-text-faint)] tabular">{a.at + 1}/{a.total}</span>}
            <IconButton label={a.next ? `Next letter: ${a.next.title}` : 'Next letter'} onClick={a.onNext}><ChevronRight aria-hidden /></IconButton>
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          </>
        )}
        <IconButton label="Another hand" onClick={a.onNewHand}><Shuffle aria-hidden /></IconButton>
        <IconButton label="Share a link to this letter" onClick={a.onShare}><Link2 aria-hidden /></IconButton>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="More" className="size-9 rounded-lg text-muted-foreground hover-device:hover:text-foreground pointer-coarse:size-10">
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenu.Trigger>
          <MenuContent>
            <Item icon={<FileText />} onSelect={a.onText}>Read it as text</Item>
            <Item icon={<Download />} onSelect={a.onImage} disabled={!a.imageReady}>Save as an image</Item>
            <Item icon={<Shuffle />} onSelect={a.onRandom}>A letter at random</Item>
          </MenuContent>
        </DropdownMenu.Root>
        {/* no divider before the reply: a filled button separates itself */}
        <Button asChild className="ml-1 h-9 rounded-sm px-3.5 pointer-coarse:h-10">
          <a href={a.reply}><PenLine aria-hidden /> {narrow ? 'Reply' : 'Write a reply'}</a>
        </Button>
      </div>
    </div>
  );
}

// ---------- the editorial text ----------

/** The title and the dateline: who wrote to whom, where and when. */
export function TitleBlock({ letter, titleRef, centred }: { letter: ArchiveLetter; titleRef: RefObject<HTMLHeadingElement | null>; centred?: boolean }) {
  const lang = useLanguage(letter.lang);
  const where = [letter.place, letter.year != null ? String(letter.year) : ''].filter(Boolean).join(', ');
  return (
    <header className={cn(centred && 'mx-auto max-w-[var(--lib-measure)] text-center')}>
      <h1 ref={titleRef} tabIndex={-1} className="ed-title font-letter text-balance outline-none">{letter.title ?? 'A letter'}</h1>
      <p className="ed-dateline font-letter mt-3 text-pretty">{fromTo(letter)}</p>
      <p className="ed-meta mt-1.5 text-pretty">
        {where}{where && lang && !/^english/i.test(lang) ? `, in ${lang}` : ''}
        {lostInTransit(letter) ? <>{where ? '. ' : ''}<span className="text-[var(--lib-accent)]">{circumstanceLabel(letter)}</span></> : null}
      </p>
    </header>
  );
}

function useLanguage(tag: string) {
  return useMemo(() => {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag; } catch { return tag; }
  }, [tag]);
}

/** The story, the record, the letter as text, and the notes (source, rights, the fictional hand). */
export function Editorial({ letter, name, textOpen, onText, centred }: { letter: ArchiveLetter; name: string; textOpen: boolean; onText: (open: boolean) => void; centred?: boolean }) {
  const f = letter.found;
  const lang = useLanguage(letter.lang);
  const [rightsOpen, setRightsOpen] = useState(false);
  const textId = useId();
  const rights = f?.rights;
  const rightsLine = rights?.us && rights?.eu ? 'Public domain in the US and the EU' : rights?.us ? 'Public domain in the US' : rights?.eu ? 'Public domain in the EU' : f?.source?.licence ?? '';
  const facts: [string, ReactNode][] = [];
  if (letter.author) facts.push(['Written by', <>{letter.author}{f?.heritage && <span className="ed-sub">{f.heritage}</span>}</>]);
  if (letter.recipient) facts.push(['To', letter.recipient]);
  if (letter.place) facts.push(['From', letter.place]);
  if (letter.year != null) facts.push(['When', <><span className="tabular">{letter.year}</span>{f?.dateNote && <span className="ed-sub">{f.dateNote}</span>}</>]);
  facts.push(['Language', lang]);
  if (f?.translator) facts.push(['Translated by', f.translator.url ? <a href={f.translator.url} target="_blank" rel="noreferrer">{f.translator.name}</a> : f.translator.name]);
  const paras = letter.text.split(/\n{2,}/);
  return (
    <div className={cn('editorial', centred && 'mx-auto max-w-[var(--lib-measure)]')}>
      {f?.story && (
        <p className="ed-story font-letter text-pretty">
          {f.story}
          {f.source && <sup className="ed-ref"><a href="#note-source" aria-label="Note 1: the source">1</a></sup>}
        </p>
      )}

      <dl className="ed-facts">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt>{term}</dt>
            <dd className="font-letter">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-9" aria-labelledby={`${textId}-h`}>
        <h2 id={`${textId}-h`} className="sr-only">The letter as text</h2>
        <button type="button" aria-expanded={textOpen} aria-controls={textId} onClick={() => onText(!textOpen)} className="ed-link text-[14px]">
          {textOpen ? 'Hide the text' : 'Read the letter as text'}
        </button>
        <div id={textId} lang={letter.lang} className={cn(textOpen ? 'ed-transcript font-letter mt-4 grid gap-3 whitespace-pre-line' : 'sr-only')}>
          {paras.map((para, i) => <p key={i}>{para}</p>)}
        </div>
      </section>

      <footer className="ed-notes">
        <h2 className="sr-only">Notes</h2>
        <ol>
          {f?.source && (
            <li id="note-source">
              {f.source.url ? <a href={f.source.url} target="_blank" rel="noreferrer">{f.source.name}</a> : f.source.name}.
              {rightsLine && <> {rightsLine}.</>}
              {rights?.basis && (
                <>
                  {' '}
                  <button type="button" aria-expanded={rightsOpen} onClick={() => setRightsOpen((o) => !o)} className="ed-link">{rightsOpen ? 'Less' : 'How we know'}</button>
                  {rightsOpen && <span className="mt-1.5 block">{rights.basis}</span>}
                </>
              )}
            </li>
          )}
          <li>The words are the original writer’s. The handwriting is {name}’s, a fictional writer; every hand here is drawn fresh.</li>
        </ol>
      </footer>
    </div>
  );
}
