// The letter page in the Postmarked look (rendered only when LOOK === 'postmarked'; one-line hooks at the top of
// TitleBlock, Editorial and LetterDock in archive/LetterParts.tsx):
//   PostTitle      the title, then the envelope it came in, addressed as the letter really was, postmarked
//   PostEditorial  the provenance as the letter's route, read top to bottom: written → how it survived → printed
//                  → today, it found you. Every stop is the curator's fields (content/sample-texts.json).
//   PostDock       the dock: "4 of 127 in the bag", Write back (the airmail edge), and the Find another stamp
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, Download, Ellipsis, FileText, Link2, PenLine, Shuffle } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { IconButton } from '@/archive/Controls';
import { baseLang, circumstanceLabel, fromTo, languageName, lostInTransit, shortAuthor } from '@/archive/data';
import type { DockActions } from '@/archive/LetterParts';
import type { ArchiveLetter } from '@/archive/model';
import { Arrival } from './Arrival';
import { Cancellation, Postmark } from './Postmark';
import { StampButton } from './Stamp';
import { addressee, cancellationOf, postTown, tiltFor } from './model';

// the letter on the page, for the dock's stamp (its cancellation carries the town and year of the letter it brings)
let pageMark: { town: string; year?: number } | null = null;
const markWatchers = new Set<() => void>();
function setPageMark(m: typeof pageMark) {
  pageMark = m;
  markWatchers.forEach((f) => f());
}
const usePageMark = () => useSyncExternalStore((cb) => { markWatchers.add(cb); return () => markWatchers.delete(cb); }, () => pageMark);

// ---------- the title and the envelope ----------
export function PostTitle({ letter, titleRef }: { letter: ArchiveLetter; titleRef: RefObject<HTMLHeadingElement | null> }) {
  const town = postTown(letter.place);
  const cancel = cancellationOf(letter.found?.circumstance);
  const to = addressee(letter.recipient);
  const lang = baseLang(letter.lang) === 'en' ? '' : languageName(letter.lang);
  useEffect(() => { setPageMark({ town, year: letter.year }); }, [town, letter.year]);
  return (
    <header className="pm-title mx-auto max-w-[var(--lib-measure)]">
      <h1 ref={titleRef} tabIndex={-1} className="ed-title font-letter text-center text-balance outline-none">{letter.title ?? 'A letter'}</h1>
      {/* what the envelope says, in words (the postmark is a picture) */}
      <p className="sr-only">
        {fromTo(letter)}. {[letter.place, letter.year].filter(Boolean).join(', ')}{lang ? `, in ${lang}` : ''}.{lostInTransit(letter) ? ` ${circumstanceLabel(letter)}.` : ''}
      </p>
      <div aria-hidden className="pm-envelope">
        <div className="pm-envelope-from">
          <span className="pm-label">From</span>
          <span>{shortAuthor(letter)}{letter.place ? <><br />{letter.place}</> : null}</span>
        </div>
        <Postmark key={letter.id} town={town} year={letter.year} size={92} tilt={tiltFor(letter.id)} className="pm-envelope-mark" />
        {cancel && <Cancellation key={letter.id + 'c'} label={cancel} tilt={-9 + tiltFor(letter.id, 6)} className="pm-envelope-cancel" />}
        {to && (
          <div className="pm-envelope-to">
            <span className="pm-label">To</span>
            <span className="pm-envelope-address">{to}</span>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------- the route ----------
interface Stop { head: string; body: ReactNode; now?: boolean; id?: string }

export function PostEditorial({ letter, name, textOpen, onText }: { letter: ArchiveLetter; name: string; textOpen: boolean; onText: (open: boolean) => void }) {
  const f = letter.found;
  const textId = useId();
  const [rightsOpen, setRightsOpen] = useState(false);
  const lang = baseLang(letter.lang) === 'en' ? '' : languageName(letter.lang);
  const rights = f?.rights as (NonNullable<typeof f>['rights'] & { firstPublished?: number }) | undefined;
  const rightsLine = rights?.us && rights?.eu ? 'Public domain in the US and the EU' : rights?.us ? 'Public domain in the US' : rights?.eu ? 'Public domain in the EU' : f?.source?.licence ?? '';
  const stops = useMemo(() => {
    const s: Stop[] = [];
    const where = [letter.place || 'Place unknown', letter.year].filter((x) => x != null && x !== '').join(', ');
    s.push({
      head: where,
      body: (
        <>
          Written by {letter.author ?? 'an unknown writer'}{f?.heritage ? ` (${f.heritage})` : ''}
          {letter.recipient ? <> to {letter.recipient}</> : null}{lang ? `, in ${lang}` : ''}.
          {f?.dateNote && <span className="pm-route-sub">{f.dateNote}</span>}
        </>
      ),
    });
    if (f?.story) s.push({ head: cancellationOf(f.circumstance) ?? 'How it survived', body: f.story });
    if (f?.source) {
      s.push({
        id: 'note-source',
        head: rights?.firstPublished ? `First printed, ${rights.firstPublished}` : 'In print',
        body: (
          <>
            Text from {f.source.url ? <a href={f.source.url} target="_blank" rel="noreferrer">{f.source.name}</a> : f.source.name}.
            {rightsLine && <> {rightsLine}.</>}
            {f.translator && <> Translated by {f.translator.url ? <a href={f.translator.url} target="_blank" rel="noreferrer">{f.translator.name}</a> : f.translator.name}.</>}
          </>
        ),
      });
    }
    s.push({
      now: true,
      head: 'Today',
      body: <>It found you. The words are {shortAuthor(letter)}’s; the handwriting is {name}’s, a fictional writer, drawn fresh for you.</>,
    });
    return s;
  }, [letter, name, lang, rightsLine, f, rights?.firstPublished]);
  const paras = letter.text.split(/\n{2,}/);
  return (
    <div className="editorial pm-editorial mx-auto max-w-[var(--lib-measure)]">
      <h2 className="pm-label pm-route-title">The route</h2>
      <ol className="pm-route">
        {stops.map((st) => (
          <li key={st.head} id={st.id} className={st.now ? 'is-now' : undefined}>
            <span className="pm-route-head">{st.head}</span>
            <p className="pm-route-body font-letter text-pretty">
              {st.body}
              {st.id === 'note-source' && rights?.basis && (
                <>
                  {' '}
                  <button type="button" aria-expanded={rightsOpen} onClick={() => setRightsOpen((o) => !o)} className="ed-link pm-route-more">{rightsOpen ? 'Less' : 'How we know'}</button>
                  {rightsOpen && <span className="pm-route-sub">{rights.basis}</span>}
                </>
              )}
            </p>
          </li>
        ))}
      </ol>

      <section className="mt-10" aria-labelledby={`${textId}-h`}>
        <h2 id={`${textId}-h`} className="sr-only">The letter as text</h2>
        <button type="button" aria-expanded={textOpen} aria-controls={textId} onClick={() => onText(!textOpen)} className="ed-link text-[14px]">
          {textOpen ? 'Hide the text' : 'Read the letter as text'}
        </button>
        <div id={textId} lang={letter.lang} className={textOpen ? 'ed-transcript font-letter mt-4 grid gap-3 whitespace-pre-line' : 'sr-only'}>
          {paras.map((para, i) => <p key={i}>{para}</p>)}
        </div>
      </section>
    </div>
  );
}

// ---------- the dock ----------
const itemCls = 'flex min-h-10 cursor-default items-center gap-3 rounded-[6px] px-3 py-2 text-[14px] text-foreground outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-accent pointer-coarse:min-h-11';
function Item({ icon, children, onSelect, disabled }: { icon: ReactNode; children: ReactNode; onSelect: () => void; disabled?: boolean }) {
  return (
    <DropdownMenu.Item className={itemCls} onSelect={onSelect} disabled={disabled}>
      <span aria-hidden className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">{icon}</span>
      {children}
    </DropdownMenu.Item>
  );
}

function useKeyboardLift() {
  const vv = useVisualViewport();
  return Math.max(0, window.innerHeight - (vv.top + vv.height));
}

export function PostDock(a: DockActions) {
  const narrow = useMediaQuery('(max-width: 520px)');
  const lift = useKeyboardLift();
  const mark = usePageMark();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-3" style={lift ? { transform: `translateY(${-lift}px)` } : undefined}>
      <div role="toolbar" aria-label="The letter" className="archive-dock pm-dock pointer-events-auto flex max-w-full items-center gap-0.5 bg-[var(--lib-surface)] p-1 text-[13.5px]">
        {a.total > 1 && (
          <>
            <IconButton label={a.prev ? `Previous letter: ${a.prev.title}` : 'Previous letter'} onClick={a.onPrev}><ChevronLeft aria-hidden /></IconButton>
            {!narrow && <span aria-hidden className="pm-bag px-1 text-center tabular"><b>{a.at + 1} of {a.total}</b> in the bag</span>}
            <IconButton label={a.next ? `Next letter: ${a.next.title}` : 'Next letter'} onClick={a.onNext}><ChevronRight aria-hidden /></IconButton>
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          </>
        )}
        {!narrow && <IconButton label="Change writer" onClick={a.onNewHand}><Shuffle aria-hidden /></IconButton>}
        <IconButton label="Share a link to this letter" onClick={a.onShare}><Link2 aria-hidden /></IconButton>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="More" className="size-9 rounded-lg text-muted-foreground hover-device:hover:text-foreground pointer-coarse:size-10">
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content side="top" align="end" sideOffset={8} collisionPadding={12} className="lib-menu z-50 w-[248px] origin-(--radix-dropdown-menu-content-transform-origin) p-1.5 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
              <Item icon={<FileText />} onSelect={a.onText}>Read it as text</Item>
              <Item icon={<Download />} onSelect={a.onImage} disabled={!a.imageReady}>Save as an image</Item>
              {narrow && <Item icon={<Shuffle />} onSelect={a.onNewHand}>Change writer</Item>}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {/* writing back: the one place the airmail edge is */}
        <a href={a.reply} className="pm-write pm-airmail ml-1">
          {!narrow && <PenLine aria-hidden />} Write back
        </a>
        <StampButton onPress={a.onRandom} size={narrow ? 46 : 50} label="Find another letter" mark={mark} className="ml-1.5 shrink-0" />
      </div>
    </div>
  );
}

// ---------- the envelope arrival (a link, or a letter opened from the wall) ----------
export function LetterArrival({ letter }: { letter: ArchiveLetter }) {
  return (
    <Arrival
      id={letter.id}
      to={addressee(letter.recipient) || 'whoever this finds'}
      from={shortAuthor(letter)}
      town={postTown(letter.place)}
      year={letter.year}
      cancel={cancellationOf(letter.found?.circumstance)}
    />
  );
}
