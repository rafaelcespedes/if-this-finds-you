// One hand as a foundry line item: the writer's name and a few quiet tags (Joined · Palmer · fountain pen · Field
// journal; a tag is a button that filters by it), the row's actions (save, write with it, download the font), and a
// big specimen line. As a font, the line is set in the hand's real font (built for the characters it shows), so
// what you see is what you download; Live hand, it's the engine's live writing on the hand's paper.
// The row's height is set before anything arrives, so rows never move when their writing does.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Heart, LoaderCircle, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, saveBlob } from '@/lib/utils';
import { toolHref } from '@/archive/SiteHeader';
import { penWords, type FilterKey } from './filters';
import { boxHeight, type FontEntry, type LiveSpec, type Mode } from './protocol';
import { fonts, useRowFont, useRowLive } from './store';
import { toggleSaved } from './favourites';
import { useNear } from './near';

/** The line a font-mode row reserves, in em: a line box tall enough for every glyph's ink (the font's own metrics). */
export const FONT_LINE = 1.5;
export const fontBoxHeight = (emPx: number, lines: number) => Math.ceil(FONT_LINE * lines * emPx);

interface Props {
  entry: FontEntry | undefined;
  index: number;
  /** the words this row writes (the writer's own name, for that line) */
  text: string;
  mode: Mode;
  /** live hand: what the image is written for (size settles when you let go of the slider) */
  live: Omit<LiveSpec, 'text'>;
  /** the size the row is shown at right now (the slider, live) */
  em: number;
  lines: number;
  saved: boolean;
  compact: boolean;
  /** wide screens: the kind of writer as a fourth tag */
  wide: boolean;
  onTag: (key: FilterKey, value: string) => void;
}

const covers = (have: string, want: string) => { for (const c of want) if (!have.includes(c)) return false; return true; };

/** A row's action: the tool's ghost button (words and an icon on wide screens, the icon alone on phones). */
function Action({ label, onClick, href, pressed, busy, compact, children, text }: {
  label: string; onClick?: () => void; href?: string; pressed?: boolean; busy?: boolean; compact: boolean; children: React.ReactNode; text?: string;
}) {
  const iconOnly = !text || compact;
  const cls = cn('font-action text-muted-foreground hover-device:hover:text-foreground', iconOnly ? '' : 'px-2.5', pressed && 'is-on text-foreground');
  const inner = <>{children}{!iconOnly && <span>{text}</span>}</>;
  const el = href ? (
    <Button asChild variant="ghost" size={iconOnly ? 'icon' : 'sm'} className={cls}>
      <a href={href} aria-label={iconOnly ? label : undefined}>{inner}</a>
    </Button>
  ) : (
    <Button variant="ghost" size={iconOnly ? 'icon' : 'sm'} className={cls} onClick={onClick} aria-label={iconOnly ? label : undefined} aria-pressed={pressed} aria-busy={busy || undefined} disabled={busy}>
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

function Tag({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title: string }) {
  if (!onClick) return <span className="font-tag is-plain">{children}</span>;
  return <button type="button" className="font-tag" title={title} onClick={onClick}>{children}</button>;
}

export const FontRow = memo(function FontRow({ entry, index, text, mode, live, em, lines, saved, compact, wide, onTag }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const near = useNear(ref);
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => setEl(ref.current), []);
  const isLive = mode === 'live';
  // as a font: the font, grown when the words need letters it hasn't got; meanwhile the last words it could set stay
  const { font, failed } = useRowFont(isLive ? undefined : entry, text, el, near);
  const lastText = useRef(text);
  const shownText = font && covers(font.chars, text) ? text : lastText.current;
  if (font && covers(font.chars, text)) lastText.current = text;
  const spec = useMemo(() => ({ ...live, text }), [live, text]);
  const image = useRowLive(entry, spec, el, near, isLive);
  const [building, setBuilding] = useState(false);
  const shownRef = useRef(false);
  const ready = isLive ? !!image : !!font;
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

  const h = isLive ? boxHeight(em, lines) : fontBoxHeight(em, lines);
  const alt = entry ? `“${text}”, in ${entry.name}’s hand` : '';
  return (
    <li ref={ref} className="font-row">
      <div className="font-row-meta">
        {entry ? (
          <>
            <h2 className="font-row-name">{entry.name}</h2>
            <p className="font-row-tags">
              <Tag title={`Only ${entry.family === 'script' ? 'joined' : 'print'} hands`} onClick={() => onTag('family', entry.family)}>{entry.family === 'script' ? 'Joined' : 'Print'}</Tag>
              <Tag title={entry.schooled || `Only hands taught this way`} onClick={() => onTag('style', entry.style)}>{entry.tradition}</Tag>
              <Tag title="Only hands with this pen" onClick={() => onTag('pen', entry.pen)}>{penWords(entry.pen)}</Tag>
              {wide && entry.kind && <Tag title="">{entry.kind}</Tag>}
              {!entry.matches && <span className="font-tag is-near" title="One of the closest hands to these filters">close match</span>}
            </p>
          </>
        ) : (
          <>
            <span aria-hidden className="font-row-skeleton" />
            <span className="sr-only">Font {index + 1}, being chosen</span>
          </>
        )}
        <div className={cn('font-row-actions', !entry && 'invisible')}>
          <Action label={saved ? 'Saved (remove)' : 'Save this hand'} compact pressed={saved} onClick={() => entry && toggleSaved(entry)}>
            <Heart aria-hidden className={cn('size-4', saved && 'fill-current')} />
          </Action>
          <Action label="Write with this hand" text="Write with it" compact={compact} href={entry ? `${toolHref}#${entry.tool}` : undefined}>
            <PenLine aria-hidden className="size-4" />
          </Action>
          <Action label={building ? 'Making the font…' : 'Download the font'} text="Download" compact={compact} busy={building} onClick={download}>
            {building ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
          </Action>
        </div>
      </div>
      {isLive ? (
        <div className="font-row-specimen is-live" style={{ height: h, ...(entry ? { background: entry.tint } : {}) }}>
          {/* exactly the CSS size it was made for, pixel for pixel; while the size slider moves, the last one is scaled
              to the row until the new one arrives */}
          {image && (
            <img src={image.url} alt={alt} decoding="async" draggable={false} width={image.width} height={image.height}
              className={cn('font-specimen-img', image.fresh && 'specimen-in')}
              style={{ width: image.width, height: image.height, ...(em !== image.emPx ? { transform: `scale(${em / image.emPx})` } : {}) }} />
          )}
        </div>
      ) : (
        <div className={cn('font-row-specimen is-font', lines > 1 ? 'is-fade-2' : 'is-fade')} style={{ height: h, fontSize: em }}>
          {font && entry && (
            <p className={cn('font-line', lines > 1 && 'is-wrap', font.fresh && 'specimen-in')} style={{ fontFamily: `"${font.family}"` }}>{shownText}</p>
          )}
          {failed && !font && <span className="font-row-failed">This hand couldn’t be set as a font here.</span>}
        </div>
      )}
    </li>
  );
});
