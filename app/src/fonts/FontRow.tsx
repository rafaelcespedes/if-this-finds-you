// One hand as a foundry line item: the writer's name (it opens the hand's record) and a few quiet words about it
// (Joined · Palmer · fountain pen; plain words, the filters live in the dock or the rail), the row's actions (save,
// write with it, download the font), and a big specimen line set in the hand's real font (built for the characters it
// shows), so what you see is what you download. The live hand, the engine's own writing on the hand's paper, is in the
// record. The row's height is set before anything arrives, so rows never move when their writing does.
import { memo, useEffect, useRef, useState } from 'react';
import { Download, Heart, LoaderCircle, PenLine, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, saveBlob } from '@/lib/utils';
import { toolHref } from '@/archive/SiteHeader';
import { penWords } from './filters';
import type { FontEntry, LiveSpec } from './protocol';
import { fonts, useRowFont } from './store';
import { toggleSaved } from './favourites';
import { useNear } from './near';
import { HandRecordView } from './Record';

/** The line a font-mode row reserves, in em: a line box tall enough for every glyph's ink (the font's own metrics). */
export const FONT_LINE = 1.5;
export const fontBoxHeight = (emPx: number, lines: number) => Math.ceil(FONT_LINE * lines * emPx);

interface Props {
  entry: FontEntry | undefined;
  index: number;
  /** the words this row writes (the writer's own name, for that line) */
  text: string;
  /** the live hand in the record: what its image is written for */
  live: Omit<LiveSpec, 'text'>;
  /** the specimen's size, px per em */
  em: number;
  lines: number;
  saved: boolean;
  /** phones: two words about the hand (joined or print, the school), the actions as icons */
  compact: boolean;
  /** wide screens: the kind of writer as a fourth word */
  wide: boolean;
  /** this hand's record is open (one at a time, kept in the URL) */
  open: boolean;
  onOpen: (id: string | null) => void;
}

const covers = (have: string, want: string) => { for (const c of want) if (!have.includes(c)) return false; return true; };

/** A row's action: the tool's ghost button (words and an icon on wide rows, the icon alone on narrow ones). Its name
 *  is the same at every width and starts with the words it shows ("Download" → "Download the font"). */
function Action({ label, onClick, href, pressed, busy, compact, children, text }: {
  label: string; onClick?: () => void; href?: string; pressed?: boolean; busy?: boolean; compact: boolean; children: React.ReactNode; text?: string;
}) {
  const iconOnly = !text || compact;
  // words: the tool's quiet ghost button ("Similar"); an icon alone stays square
  const cls = cn('font-action hover-device:hover:text-foreground', iconOnly ? 'text-[var(--muted-foreground)]' : 'px-2.5 text-muted-foreground', pressed && 'is-on text-foreground');
  const inner = <>{children}{!iconOnly && <span>{text}</span>}</>;
  const el = href ? (
    <Button asChild variant="ghost" size={iconOnly ? 'icon' : 'sm'} className={cls}>
      <a href={href} aria-label={label}>{inner}</a>
    </Button>
  ) : (
    <Button variant="ghost" size={iconOnly ? 'icon' : 'sm'} className={cls} onClick={onClick} aria-label={label} aria-pressed={pressed} aria-busy={busy || undefined} disabled={busy}>
      {inner}
    </Button>
  );
  if (!iconOnly) return el;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{el}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const Tag = ({ children, title }: { children: React.ReactNode; title?: string }) => <span className="font-tag" title={title}>{children}</span>;

export const FontRow = memo(function FontRow({ entry, index, text, live, em, lines, saved, compact, wide, open, onOpen }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const near = useNear(ref);
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => setEl(ref.current), []);
  // the font, grown when the words need letters it hasn't got; meanwhile the last words it could set stay. The
  // record's "Every character" asks the font for its whole glyph set; its live-hand fold asks for the live writing
  const [allChars, setAllChars] = useState('');
  useEffect(() => { if (!open) setAllChars(''); }, [open]);
  // closing the record (Close, or Escape inside it) gives the focus back to the name that opened it
  const nameRef = useRef<HTMLButtonElement>(null);
  const close = () => { onOpen(null); requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true })); };
  const { font, failed } = useRowFont(entry, text + allChars, el, near || open);
  const lastText = useRef(text);
  const shownText = font && covers(font.chars, text) ? text : lastText.current;
  if (font && covers(font.chars, text)) lastText.current = text;
  const [building, setBuilding] = useState(false);
  const shownRef = useRef(false);
  const ready = !!font;
  useEffect(() => {
    if (ready && !shownRef.current) { shownRef.current = true; fonts.shown(); }
  }, [ready]);

  const download = async () => {
    if (!entry || building) return;
    setBuilding(true);
    const id = `font-${entry.id}`;
    toast('Making the font…', { id, description: `${entry.name}: the .otf and .ttf, about a second.` });
    try {
      const { zip, filename } = await fonts.download(entry);
      saveBlob(new Blob([zip], { type: 'application/zip' }), filename);
      toast('Font saved', { id, description: `${filename}. Free and open source (SIL Open Font License).` });
    } catch (err) {
      toast('The font couldn’t be made', { id, description: err instanceof Error ? err.message : undefined });
    } finally {
      setBuilding(false);
    }
  };

  const h = fontBoxHeight(em, lines);
  return (
    <li ref={ref} className="font-row">
      <div className="font-row-meta">
        {entry ? (
          <>
            <h2 className="font-row-name">
              <button ref={nameRef} type="button" className="font-row-open" aria-expanded={open} aria-controls={`record-${index}`} onClick={() => onOpen(open ? null : entry.id)}>
                {entry.name}
              </button>
            </h2>
            <p className="font-row-tags">
              <Tag>{entry.family === 'script' ? 'Joined' : 'Print'}</Tag>
              <Tag title={entry.schooled || undefined}>{entry.tradition}</Tag>
              {!compact && <Tag>{penWords(entry.pen)}</Tag>}
              {wide && entry.kind && <Tag>{entry.kind}</Tag>}
              {!entry.matches && <span className="font-tag is-near" title="One of the closest hands to these filters">close match</span>}
            </p>
          </>
        ) : (
          <>
            <span aria-hidden className="font-row-skeleton" />
            <span className="sr-only">Font {index + 1}, being chosen</span>
          </>
        )}
        {open && entry ? (
          <div className="font-row-actions">
            <Button variant="ghost" size="sm" className="font-action text-muted-foreground" onClick={close} aria-controls={`record-${index}`}>
              Close <X aria-hidden />
            </Button>
          </div>
        ) : (
        <div className={cn('font-row-actions', !entry && 'invisible')}>
          <Action label={saved ? 'Saved. Remove it' : 'Save this hand'} compact pressed={saved} onClick={() => entry && toggleSaved(entry)}>
            <Heart aria-hidden className={cn('size-4', saved && 'fill-current')} />
          </Action>
          <Action label="Write with it" text="Write with it" compact={compact} href={entry ? `${toolHref}#${entry.tool}` : undefined}>
            <PenLine aria-hidden className="size-4" />
          </Action>
          <Action label={building ? 'Making the font…' : 'Download the font'} text="Download" compact={compact} busy={building} onClick={download}>
            {building ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
          </Action>
        </div>
        )}
      </div>
      <div className={cn('font-row-specimen is-font', lines > 1 ? 'is-fade-2' : 'is-fade')} style={{ height: h, fontSize: em }}>
        {font && entry && (
          <p className={cn('font-line', lines > 1 && 'is-wrap', font.fresh && 'specimen-in')} style={{ fontFamily: `"${font.family}"` }}>{shownText}</p>
        )}
        {failed && !font && <span className="font-row-failed">This hand couldn’t be set as a font here.</span>}
      </div>
      {open && entry && (
        <HandRecordView
          entry={entry}
          id={`record-${index}`}
          family={font?.family ?? null}
          allLoaded={!!font && !!allChars && covers(font.chars, allChars)}
          onShowAll={setAllChars}
          live={live}
          text={text}
          onClose={close}
          toolHref={`${toolHref}#${entry.tool}`}
          saved={saved}
          onSave={() => toggleSaved(entry)}
          onDownload={download}
          building={building}
        />
      )}
    </li>
  );
});
