// The first thing on the page: one hand, the set's first, writing the line at poster size, the way a foundry's
// typeface page opens on its face. Under it, a soft rule and the caption: who wrote it (it opens the hand's record),
// a few plain words about the hand, where the line comes from, and its actions: Download the font (the one filled
// button on the page), Write with it, Save.
import { memo, useEffect, useRef, useState } from 'react';
import { Download, Heart, LoaderCircle, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { withLogo } from '@/lib/brand';
import { cn } from '@/lib/utils';
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
    <section ref={ref} className="fx-hero" aria-label={entry ? `${entry.name}’s hand` : 'The first hand'} aria-busy={!font}>
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
                {[entry.family === 'script' ? 'Joined' : 'Print', entry.tradition, penWords(entry.pen), entry.kind].filter(Boolean).join(' · ')}
                {!entry.matches && <span className="fx-near"> · close match</span>}
              </p>
            </>
          ) : (
            <>
              <span aria-hidden className="fx-skeleton fx-skeleton-name" />
              <span aria-hidden className="fx-skeleton fx-skeleton-meta" />
            </>
          )}
          {opening && (
            <p className="fx-credit">
              From a letter by {opening.by}{opening.year ? `, ${opening.year}` : ''}.{' '}
              <a className="fx-quiet-link" href={withLogo(`${ARCHIVE_URL}#/letter/${encodeURIComponent(opening.id)}`)}>Read the letter</a>
            </p>
          )}
        </div>
        <div className={cn('fx-hero-act', !entry && 'invisible')}>
        <div className="fx-hero-actions">
          <Button onClick={download} disabled={building || !entry} className="fx-download">
            {building ? <LoaderCircle aria-hidden className="animate-spin" /> : <Download aria-hidden />}
            {building ? 'Making the font…' : 'Download font'}
          </Button>
          <Button asChild variant="ghost" className="fx-quiet fx-write-with">
            <a href={tool} aria-label="Write with it"><PenLine aria-hidden /> <span className="fx-words">Write with it</span></a>
          </Button>
          <Button variant="ghost" size="icon" className="fx-quiet fx-save" aria-pressed={saved} aria-label={saved ? 'Saved. Remove it' : 'Save this hand'} onClick={() => entry && toggleSaved(entry)}>
            <Heart aria-hidden className={cn(saved && 'fill-current')} />
          </Button>
        </div>
        {/* the promise, said once beside the action (where a foundry puts its price) */}
        <p className="fx-promise">Free and open source · .otf and .ttf · SIL Open Font License</p>
        </div>
      </div>
      {open && entry && (
        <HandRecordView entry={entry} id="record-hero" family={font?.family ?? null} allLoaded={allLoaded} onShowAll={setAllChars} live={live} text={text}
          onClose={close} toolHref={tool!} saved={saved} onSave={() => toggleSaved(entry)} onDownload={download} building={building} />
      )}
    </section>
  );
});
