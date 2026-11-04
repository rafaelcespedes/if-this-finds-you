// One hand in the list (or a card in the grid): the writing, always the biggest thing, with the writer's name, a few
// plain words about the hand, and its three actions as icons. The whole row opens the hand's record (its name is the button; the
// row is its target), and answers the pointer with the faint wash, never an underline. Its height is fixed before
// anything arrives, so rows never move when their writing does.
import { memo, useEffect, useRef, useState } from 'react';
import { Download, Heart, LoaderCircle, PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toolHref } from '@/archive/SiteHeader';
import { penWords } from '../filters';
import type { FontEntry, LiveSpec } from '../protocol';
import { toggleSaved } from '../favourites';
import { useNear } from '../near';
import { HandRecordView } from '../Record';
import { SpecimenLine, useSpecimen } from './Specimen';
import { useDownload } from './useDownload';

interface Props {
  entry: FontEntry | undefined;
  index: number;
  text: string;
  em: number;
  lines: number;
  saved: boolean;
  open: boolean;
  onOpen: (id: string | null) => void;
  live: Omit<LiveSpec, 'text'>;
  /** a card in the grid: the words under the writing */
  card: boolean;
  /** phones: two words about the hand */
  compact: boolean;
}

/** An icon action, with its name as a tooltip on pointers. */
function IconAction({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="fx-quiet fx-icon" aria-label={label} {...rest}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export const Row = memo(function Row({ entry, index, text, em, lines, saved, open, onOpen, live, card, compact }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const near = useNear(ref);
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => setEl(ref.current), []);
  const [allChars, setAllChars] = useState('');
  useEffect(() => { if (!open) setAllChars(''); }, [open]);
  const { font, failed, shown, allLoaded } = useSpecimen(entry, text, el, near || open, allChars);
  const { building, download } = useDownload(entry);
  const nameRef = useRef<HTMLButtonElement>(null);
  const close = () => { onOpen(null); requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true })); };
  const tool = entry ? `${toolHref}#${entry.tool}` : undefined;
  const words = entry ? [entry.family === 'script' ? 'Joined' : 'Print', entry.tradition, !compact && penWords(entry.pen)].filter(Boolean).join(' · ') : '';
  // under a resting pointer (a quarter second) the hand writes its line again over a faint trace of it, the way a
  // foundry's specimen moves on hover; never on touch, never with reduced motion
  const dwell = useRef(0);
  const rewrite = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const line = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.fx-line');
    window.clearTimeout(dwell.current);
    dwell.current = window.setTimeout(() => {
      if (!line || line.classList.contains('fx-write') || line.classList.contains('fx-rewrite')) return;
      line.classList.add('fx-rewrite');
      line.addEventListener('animationend', () => line.classList.remove('fx-rewrite'), { once: true });
    }, 250);
  };
  useEffect(() => () => window.clearTimeout(dwell.current), []);

  // icons only, on every row (Rafael: "maybe those don't have copy"): each names itself in a tooltip and to screen readers
  const actions = entry && (open ? (
    <IconAction label="Close" onClick={close} aria-controls={`record-${index}`}>
      <X aria-hidden />
    </IconAction>
  ) : (
    <>
      <IconAction label={saved ? 'Saved' : 'Save'} aria-label="Save" aria-pressed={saved} onClick={() => toggleSaved(entry)} className="fx-quiet fx-icon fx-save">
        <Heart aria-hidden className={cn(saved && 'fill-current')} />
      </IconAction>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="fx-quiet fx-icon"><a href={tool} aria-label="Write with it"><PenLine aria-hidden /></a></Button>
        </TooltipTrigger>
        <TooltipContent>Write with it</TooltipContent>
      </Tooltip>
      <IconAction label={building ? 'Making the font…' : 'Download font'} onClick={download} disabled={building} aria-busy={building || undefined}>
        {building ? <LoaderCircle aria-hidden className="animate-spin" /> : <Download aria-hidden />}
      </IconAction>
    </>
  ));

  return (
    <li ref={ref} className={cn('fx-row', card ? 'is-card' : 'is-line', open && 'is-open')}>
      {/* the order is for reading (who, their writing, what you can do); the layout places them: the writing first on
          phones and in the grid, a register's line on wide lists (name, writing, actions) */}
      <div className="fx-row-body" onPointerEnter={rewrite} onPointerLeave={() => window.clearTimeout(dwell.current)}>
        {entry ? (
          <div className="fx-row-who">
            <h3 className="fx-row-name">
              <button ref={nameRef} type="button" className="fx-open" aria-expanded={open} aria-controls={`record-${index}`} onClick={() => onOpen(open ? null : entry.id)}>
                {entry.name}
              </button>
            </h3>
            <p className="fx-meta">
              {words}
              {!entry.matches && <span className="fx-near"> · close match</span>}
            </p>
          </div>
        ) : (
          <div className="fx-row-who">
            <span aria-hidden className="fx-skeleton fx-skeleton-name" />
            <span className="sr-only">Hand {index + 1}, being chosen</span>
          </div>
        )}
        <SpecimenLine family={font?.family ?? null} fresh={!!font?.fresh} failed={failed} text={shown} em={em} lines={lines}
          label={entry ? `“${shown}”, in ${entry.name}’s hand` : undefined} />
        <div className={cn('fx-row-actions', !entry && 'invisible')}>{actions}</div>
      </div>
      {open && entry && (
        <HandRecordView entry={entry} id={`record-${index}`} family={font?.family ?? null} allLoaded={allLoaded} onShowAll={setAllChars} live={live} text={text}
          onClose={close} toolHref={tool!} saved={saved} onSave={() => toggleSaved(entry)} onDownload={download} building={building} />
      )}
    </li>
  );
});
