// The first thing on the page: one hand, the set's first, writing the line at poster size, the way a foundry's
// typeface page opens on its face. Under it, a soft rule and the caption: who wrote it (it opens the hand's record),
// a few plain words about the hand, and its actions as icons: Download the font (the desk's main action, its Bring
// another letter button), Write with it, Save. Where the line comes from opens with the record.
import { memo, useEffect, useRef, useState } from 'react';
import { Download, Heart, LoaderCircle, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { withLogo } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { BringAnother } from '@/themes/reading-room/BringAnother';
import { ARCHIVE_URL, toolHref } from '@/archive/SiteHeader';
import { penWords } from '../filters';
import type { FontEntry, LiveSpec, Opening } from '../protocol';
import { toggleSaved } from '../favourites';
import { HandRecordView } from '../Record';
import { SpecimenLine, useSpecimen } from './Specimen';
import { useDownload } from './useDownload';

interface Props {
  entry: FontEntry | undefined;
  text: string;
  em: number;
  lines: number;
  /** the line is a real letter's opening: who wrote it, and the way to read it */
  opening: Opening | null;
  saved: boolean;
  open: boolean;
  onOpen: (id: string | null) => void;
  live: Omit<LiveSpec, 'text'>;
}

/** An icon's name, shown under the pointer and on keyboard focus. */
function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export const Hero = memo(function Hero({ entry, text, em, lines, opening, saved, open, onOpen, live }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => setEl(ref.current), []);
  const [allChars, setAllChars] = useState('');
  useEffect(() => { if (!open) setAllChars(''); }, [open]);
  const { font, failed, shown, allLoaded } = useSpecimen(entry, text, el, true, allChars);
  const { building, download } = useDownload(entry);
  const nameRef = useRef<HTMLButtonElement>(null);
  const close = () => { onOpen(null); requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true })); };
  const tool = entry ? `${toolHref}#${entry.tool}` : undefined;

  return (
    // a stable name for the lead hand (its writer's name is its heading): screen readers and the smoke test find it by it
    <section ref={ref} className="fx-hero" aria-label="The first hand in this set" aria-busy={!font}>
      <SpecimenLine family={font?.family ?? null} fresh={!!font?.fresh} failed={failed} text={shown} em={em} lines={lines} pace="hero"
        label={entry ? `“${shown}”, in ${entry.name}’s hand` : undefined} />
      <div className="fx-hero-caption">
        <div className="fx-hero-who">
          {entry ? (
            <>
              <h2 className="fx-hero-name">
                <button ref={nameRef} type="button" className="fx-open" aria-expanded={open} aria-controls="record-hero" onClick={() => onOpen(open ? null : entry.id)}>
                  {entry.name}
                </button>
              </h2>
              <p className="fx-meta">
                {[entry.family === 'script' ? 'Joined' : 'Print', entry.tradition, penWords(entry.pen)].filter(Boolean).join(' · ')}
                {!entry.matches && <span className="fx-near"> · close match</span>}
              </p>
            </>
          ) : (
            <>
              <span aria-hidden className="fx-skeleton fx-skeleton-name" />
              <span aria-hidden className="fx-skeleton fx-skeleton-meta" />
            </>
          )}
        </div>
        <div className={cn('fx-hero-actions', !entry && 'invisible')}>
          {/* icons only, so the hand is what you read (Rafael: "download font, again, could be just an icon"); each
              names itself in a tooltip and to screen readers. Download is the desk's main action, its button's red. */}
          <Tip label={building ? 'Making the font…' : 'Download font'}>
            <BringAnother onClick={download} disabled={building || !entry} label={building ? 'Making the font…' : 'Download font'} shortcut=""
              icon={building ? <LoaderCircle aria-hidden className="animate-spin" /> : <Download aria-hidden />} aria-busy={building || undefined}
              className="rr-bring-button fx-download" />
          </Tip>
          <Tip label="Write with it">
            <Button asChild variant="ghost" size="icon" className="fx-quiet fx-icon">
              <a href={tool} aria-label="Write with it"><PenLine aria-hidden /></a>
            </Button>
          </Tip>
          <Tip label={saved ? 'Saved' : 'Save'}>
            <Button variant="ghost" size="icon" className="fx-quiet fx-icon fx-save" aria-pressed={saved} aria-label="Save" onClick={() => entry && toggleSaved(entry)}>
              <Heart aria-hidden className={cn(saved && 'fill-current')} />
            </Button>
          </Tip>
        </div>
      </div>
      {/* where the line comes from: with the hand's record, not on the page */}
      {open && opening && (
        <p className="fx-credit">
          The line is from a letter by {opening.by}{opening.year ? `, ${opening.year}` : ''}.{' '}
          <a className="fx-quiet-link" href={withLogo(`${ARCHIVE_URL}#/letter/${encodeURIComponent(opening.id)}`)}>Read the letter</a>
        </p>
      )}
      {open && entry && (
        <HandRecordView entry={entry} id="record-hero" family={font?.family ?? null} allLoaded={allLoaded} onShowAll={setAllChars} live={live} text={text}
          onClose={close} toolHref={tool!} saved={saved} onSave={() => toggleSaved(entry)} onDownload={download} building={building} />
      )}
    </section>
  );
});
